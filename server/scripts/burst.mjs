/* FILE GUIDE:
 * server/scripts/burst.mjs
 * Purpose: 45-concurrent teacher-state burst against a running server (localhost
 * or deployed). Measures p50/p95 to prove broadcasts + auth cache hold a full
 * classroom. No new deps — native fetch only.
 *
 * Usage (server must be running, use an existing teacher JWT + live session):
 *   BASE=http://localhost:4000 TOKEN=<teacher-jwt> SESSION_ID=123 N=45 node scripts/burst.mjs
 *
 * k6 equivalent (free, external runner, same idea with sockets):
 *   k6 run --vus 45 --duration 30s scripts/k6-classroom.js  (see header below)
 */
const BASE = (process.env.BASE || "http://localhost:4000").replace(/\/$/, "");
const TOKEN = process.env.TOKEN || "";
const SESSION_ID = Number(process.env.SESSION_ID || 0);
const N = Math.min(200, Math.max(1, Number(process.env.N || 45)));

if (!TOKEN || !SESSION_ID) {
  console.error("Usage: BASE=http://localhost:4000 TOKEN=<teacher-jwt> SESSION_ID=<id> [N=45] node scripts/burst.mjs");
  process.exit(1);
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[i];
}

async function one(i) {
  const start = Date.now();
  try {
    const res = await fetch(`${BASE}/api/sessions/${SESSION_ID}/state`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    const ms = Date.now() - start;
    if (!res.ok) return { ok: false, ms, status: res.status };
    // A 200 with HTML means BASE points at the frontend (5173), not the API.
    const type = res.headers.get("content-type") || "";
    if (!type.includes("json")) return { ok: false, ms, status: res.status, error: "non-JSON (BASE looks like the frontend, use the API port)" };
    await res.json();
    return { ok: true, ms, status: res.status };
  } catch (err) {
    return { ok: false, ms: Date.now() - start, status: 0, error: err?.message };
  }
}

// Warm up (auth cache cold -> warm) then burst all at once like a class joining.
await one(0);
const results = await Promise.all(Array.from({ length: N }, (_, i) => one(i + 1)));
const ok = results.filter((r) => r.ok);
const ms = results.map((r) => r.ms).sort((a, b) => a - b);
const failures = results.filter((r) => !r.ok);

console.log(`burst N=${N} ok=${ok.length} failed=${failures.length}`);
console.log(`min=${ms[0]}ms p50=${percentile(ms, 50)}ms p95=${percentile(ms, 95)}ms max=${ms[ms.length - 1]}ms`);
if (failures.length) {
  const byStatus = {};
  for (const f of failures) byStatus[f.status] = (byStatus[f.status] || 0) + 1;
  console.log("failures by status:", byStatus);
  const hints = [...new Set(failures.map((f) => f.error).filter(Boolean))];
  if (hints.length) console.log("hints:", hints.join(" | "));
  if (failures.length === N) console.log("ALL failed: check BASE (API port, not frontend), server running, TOKEN fresh, SESSION_ID owned by that teacher.");
}
if (ok.length < N) process.exitCode = 1;
