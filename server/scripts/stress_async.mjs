/* FILE GUIDE:
 * server/scripts/stress_async.mjs
 * Purpose: Find how many simultaneous assignment submits the server holds by
 * replaying the real student path: open quiz (GET) -> submit (POST) at once.
 * Answers are dummies (score wrong, full pipeline runs: scoring, INSERT,
 * leaderboard rebuild + broadcast). No new deps — native fetch only.
 *
 * Setup (localhost, one-time per run — a submit is single-use):
 *   1. Teacher creates an ASYNCHRONOUS quiz in a class with an open window
 *      (available_from past, available_until future/null), a few questions.
 *   2. Enroll N STUDENT users in that class. Each needs its own login token:
 *      log each in via POST /api/auth/login (or register them), collect JWTs.
 *   3. Re-run needs FRESH students (or a fresh quiz): submitted students get
 *      "already submitted" (counted as DUP below = setup spent, not failure).
 *
 * Usage (PowerShell, from ThinkWAVE-main/server):
 *   $env:BASE="http://localhost:4000"; $env:QUIZ_ID="7"
 *   $env:TOKENS="jwt1,jwt2,jwt3"   # or $env:TOKENS="@tokens.txt" (one per line)
 *   node scripts/stress_async.mjs
 *   $env:BUDGET_MS="3000"; node scripts/stress_async.mjs
 *
 * How to read it:
 * - ok = submitted. DUP = already submitted (burned setup, re-enroll or new
 *   quiz). fail = 500/timeout = system limit reached for submits.
 * - LIMIT = largest all-ok batch with submit p95 <= BUDGET_MS (default 3000ms).
 * - Submits serialize a bit on the leaderboard rebuild by design; compare
 *   p95 across batch sizes (N=10 vs 30 vs 45) by trimming TOKENS.
 */
import fs from "fs";

const BASE = (process.env.BASE || "http://localhost:4000").replace(/\/$/, "");
const QUIZ_ID = Number(process.env.QUIZ_ID || 0);
const BUDGET_MS = Math.max(500, Number(process.env.BUDGET_MS || 3000));
let tokenSrc = String(process.env.TOKENS || "").trim();
if (tokenSrc.startsWith("@")) {
  tokenSrc = fs.readFileSync(tokenSrc.slice(1), "utf8");
}
const TOKENS = tokenSrc.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);

if (!QUIZ_ID || !TOKENS.length) {
  console.error("Usage: BASE=... QUIZ_ID=<async-quiz-id> TOKENS=\"jwt1,jwt2,...\" (or @file) [BUDGET_MS=3000] node scripts/stress_async.mjs");
  process.exit(1);
}

function pct(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

async function submitOne(token) {
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const start = Date.now();
  try {
    const g = await fetch(`${BASE}/api/student/quizzes/${QUIZ_ID}`, { headers });
    const gms = Date.now() - start;
    if (!g.ok) {
      const b = await g.json().catch(() => ({}));
      return { ok: false, dup: false, ms: gms, stage: "open", status: g.status, error: b?.message };
    }
    const quiz = await g.json();
    const questions = Array.isArray(quiz?.questions) ? quiz.questions : [];
    if (!questions.length) return { ok: false, dup: false, ms: gms, stage: "open", status: g.status, error: "no questions returned" };
    const s0 = Date.now();
    const r = await fetch(`${BASE}/api/student/quizzes/${QUIZ_ID}/submit`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        answers: questions.map((q) => ({ questionId: Number(q.id), answer: { text: "stress-probe" }, responseMs: 1000 })),
      }),
    });
    const ms = Date.now() - s0;
    const body = await r.json().catch(() => ({}));
    if (r.ok) return { ok: true, ms, stage: "submit", status: r.status };
    if (r.status === 400 && /already submitted/i.test(body?.message || "")) {
      return { ok: false, dup: true, ms, stage: "submit", status: r.status };
    }
    return { ok: false, dup: false, ms, stage: "submit", status: r.status, error: body?.message || `HTTP ${r.status}` };
  } catch (err) {
    return { ok: false, dup: false, ms: Date.now() - start, stage: "error", status: 0, error: err?.message };
  }
}

console.log(`target=${BASE} quiz=${QUIZ_ID} students=${TOKENS.length} budget submit p95<=${BUDGET_MS}ms`);
const results = await Promise.all(TOKENS.map((t) => submitOne(t)));
const ok = results.filter((r) => r.ok);
const dup = results.filter((r) => r.dup);
const fail = results.filter((r) => !r.ok && !r.dup);
const ms = ok.map((r) => r.ms).sort((a, b) => a - b);
const byStatus = {};
for (const r of fail) byStatus[`${r.stage}:${r.status}`] = (byStatus[`${r.stage}:${r.status}`] || 0) + 1;
const errs = [...new Set(fail.map((r) => r.error).filter(Boolean))];

console.log(`ok=${ok.length} dup=${dup.length} failed=${fail.length}` + (ms.length ? ` submit min=${ms[0]}ms p50=${pct(ms, 50)}ms p95=${pct(ms, 95)}ms max=${ms[ms.length - 1]}ms` : ""));
if (Object.keys(byStatus).length) console.log("failures:", JSON.stringify(byStatus), errs.length ? `| ${errs.join(" | ")}` : "");
if (dup.length && !ok.length && !fail.length) {
  console.log("All DUP: every token already submitted. Use fresh students (or a fresh quiz) — DUP is spent setup, not a system limit.");
} else if (!fail.length && dup.length === 0 && ok.length) {
  console.log(pct(ms, 95) <= BUDGET_MS ? "CLEAN at this batch size." : "OVER budget: submits queueing — try a smaller batch to find the ceiling.");
} else if (!fail.length) {
  console.log("No system failures; DUP rows are spent setup.");
}
process.exitCode = fail.length || (ok.length && pct(ms, 95) > BUDGET_MS) ? 1 : 0;
