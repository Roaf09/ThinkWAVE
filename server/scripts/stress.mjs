/* FILE GUIDE:
 * server/scripts/stress.mjs
 * Purpose: Find this machine's ceiling for one endpoint by ramping concurrent
 * load in steps. Default target is the host-panel state endpoint (the heaviest
 * polling reader). No new deps — native fetch only.
 *
 * Usage (server running, teacher JWT + owned session):
 *   BASE=http://localhost:4000 TOKEN=<teacher-jwt> SESSION_ID=3 node scripts/stress.mjs
 *   BASE=... TOKEN=... SESSION_ID=3 STEPS="10,20,30,45,60,80,100" BUDGET_MS=2000 node scripts/stress.mjs
 *   PowerShell:
 *     $env:BASE="http://localhost:4000"; $env:TOKEN="..."; $env:SESSION_ID="3"
 *     node scripts/stress.mjs
 *
 * How to read it:
 * - A step is CLEAN when failed=0 AND p95 <= BUDGET_MS.
 * - The LIMIT is the last clean step. Past it you will see 500s (pool/queue
 *   exhausted) or p95 climbing steeply (queries queueing).
 * - "Session is full"-style 400s are config caps (max_participants), not system limits.
 * - Numbers belong to THIS machine+DB only. Re-run on deploy hardware before trusting them.
 */
const BASE = (process.env.BASE || "http://localhost:4000").replace(/\/$/, "");
const TOKEN = process.env.TOKEN || "";
const SESSION_ID = Number(process.env.SESSION_ID || 0);
const STEPS = String(process.env.STEPS || "10,20,30,45,60,80,100")
  .split(",")
  .map((s) => Math.min(300, Math.max(1, Number(s) || 0)))
  .filter(Boolean);
const BUDGET_MS = Math.max(100, Number(process.env.BUDGET_MS || 2000));
const COOLDOWN_MS = 3000;

if (!TOKEN || !SESSION_ID) {
  console.error("Usage: BASE=... TOKEN=<teacher-jwt> SESSION_ID=<id> [STEPS=...] [BUDGET_MS=2000] node scripts/stress.mjs");
  process.exit(1);
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

async function one() {
  const start = Date.now();
  try {
    const res = await fetch(`${BASE}/api/sessions/${SESSION_ID}/state`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    const ms = Date.now() - start;
    if (!res.ok) return { ok: false, ms, status: res.status };
    const type = res.headers.get("content-type") || "";
    if (!type.includes("json")) return { ok: false, ms, status: res.status, error: "non-JSON (BASE must be the API port)" };
    await res.json();
    return { ok: true, ms, status: res.status };
  } catch (err) {
    return { ok: false, ms: Date.now() - start, status: 0, error: err?.message };
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log(`target=${BASE}/api/sessions/${SESSION_ID}/state budget p95<=${BUDGET_MS}ms`);
let lastClean = 0;
let anyFail = false;
for (const n of STEPS) {
  const results = await Promise.all(Array.from({ length: n }, () => one()));
  const ok = results.filter((r) => r.ok).length;
  const failed = n - ok;
  const ms = results.map((r) => r.ms).sort((a, b) => a - b);
  const p50 = percentile(ms, 50);
  const p95 = percentile(ms, 95);
  const clean = failed === 0 && p95 <= BUDGET_MS;
  if (clean) lastClean = n;
  else anyFail = true;
  const byStatus = {};
  for (const r of results.filter((r) => !r.ok)) byStatus[r.status] = (byStatus[r.status] || 0) + 1;
  console.log(
    `N=${String(n).padStart(3)} ok=${String(ok).padStart(3)} failed=${String(failed).padStart(3)} ` +
      `min=${ms[0]}ms p50=${p50}ms p95=${p95}ms max=${ms[ms.length - 1]}ms ${JSON.stringify(byStatus)} ${clean ? "CLEAN" : "OVER"}`,
  );
  await sleep(COOLDOWN_MS);
}

console.log(`\nLIMIT (this machine): ${lastClean} concurrent host-panel loads clean at p95<=${BUDGET_MS}ms.`);
if (anyFail) console.log("Past the limit you would see 500s (pool/queue full) or p95 climbing = queries waiting in line.");
// Finding the ceiling is the job, so going OVER at high steps is expected.
// Exit 1 only if even the smallest step fails (something is broken, not loaded).
process.exitCode = lastClean === 0 ? 1 : 0;
