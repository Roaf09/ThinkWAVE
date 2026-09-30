/* FILE GUIDE:
 * client/scripts/stress_live.mjs
 * Purpose: Find how many students one LIVE session holds by simulating a real
 * classroom: join (REST) -> connect (socket) -> answer at once (socket).
 * Run from the client/ directory (uses its socket.io-client, no new deps).
 *
 * Setup (localhost):
 *   1. Server + MySQL running. Teacher creates a quiz + session (SOLO mode;
 *      GROUP needs manual grouping, see note below). Start it to LIVE.
 *   2. For steps past 45 students the session needs room: use a PRO/
 *      Institution teacher (unlimited seats) or raise max_participants.
 *
 * Usage (PowerShell, from ThinkWAVE-main/client):
 *   $env:BASE="http://localhost:4000"; $env:CODE="ABC123"
 *   node scripts/stress_live.mjs
 *   $env:CODE="ABC123"; $env:STEPS="10,20,30,45,60,80,100"; $env:ACK_BUDGET_MS="2000"
 *   node scripts/stress_live.mjs
 *
 * How to read it (per step):
 * - join ok / FULL / fail — FULL ("Session is full") is a CONFIG cap
 *   (max_participants), not a system limit. Raise seats to go further.
 * - connect ok — socket handshake + roster/state fan-out survived.
 * - ack ok + p95 — every answer's full server path (score, leaderboard
 *   rebroadcast). p95 <= ACK_BUDGET_MS (default 2000ms) is CLEAN.
 * - A step is CLEAN when: no fails, no errors, ack p95 within budget.
 * - LIMIT = last clean step. Past it expect 500s, timeouts, or p95 climbing.
 * - Answers use a dummy choice (scores wrong, full pipeline runs). One
 *   question is answered once per simulated student; re-running the script
 *   needs a fresh session OR new names (names are unique per run already).
 * - GROUP mode is not simulated (votes/proposals need real teams); SOLO is
 *   the heavier broadcast path per answer, so it bounds GROUP too.
 * - Stress rows stay in the DB: use a dedicated stress session, then delete
 *   it (deleting the session cascades in app, or wipe participants/scores/
 *   responses for that session id manually).
 */
import { io } from "socket.io-client";

const BASE = (process.env.BASE || "http://localhost:4000").replace(/\/$/, "");
const CODE = String(process.env.CODE || "").trim().toUpperCase();
const STEPS = String(process.env.STEPS || "10,20,30,45,60")
  .split(",")
  .map((s) => Math.min(150, Math.max(1, Number(s) || 0)))
  .filter(Boolean);
const ACK_BUDGET_MS = Math.max(200, Number(process.env.ACK_BUDGET_MS || 2000));
const CONNECT_TIMEOUT = 15000;
const ACK_TIMEOUT = 20000;
const RUN = Date.now().toString(36).slice(-6);

if (!CODE) {
  console.error("Usage: BASE=... CODE=<join-code> [STEPS=...] [ACK_BUDGET_MS=2000] node scripts/stress_live.mjs  (from client/ dir)");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function pct(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

async function joinOne(step, i) {
  const start = Date.now();
  try {
    const res = await fetch(`${BASE}/api/sessions/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: CODE, firstName: `Load${RUN}`, lastName: `S${step}-${i}` }),
    });
    const ms = Date.now() - start;
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.participantId && data?.reconnectKey) {
      return { ok: true, ms, sessionId: data.sessionId, participantId: data.participantId, reconnectKey: data.reconnectKey };
    }
    if (res.status === 400 && /full/i.test(data?.message || "")) return { ok: false, full: true, ms, status: res.status };
    return { ok: false, ms, status: res.status, error: data?.message || `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, ms: Date.now() - start, status: 0, error: err?.message };
  }
}

function connectOne(sessionId, reconnectKey) {
  return new Promise((resolve) => {
    const start = Date.now();
    let settled = false;
    const finish = (r) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ...r, ms: Date.now() - start });
    };
    const timer = setTimeout(() => {
      try {
        socket.disconnect();
      } catch {}
      finish({ ok: false, error: "connect timeout" });
    }, CONNECT_TIMEOUT);
    const socket = io(BASE, { transports: ["websocket", "polling"] });
    socket.on("connect", () => socket.emit("student:connect", { sessionId, reconnectKey }));
    socket.on("student:connected", () => finish({ ok: true, socket }));
    socket.on("student:error", (e) => {
      try {
        socket.disconnect();
      } catch {}
      finish({ ok: false, error: e?.message || "student:error" });
    });
    socket.on("connect_error", (e) => {
      try {
        socket.disconnect();
      } catch {}
      finish({ ok: false, error: `connect_error: ${e?.message || e}` });
    });
    // Capture the live question for the answer phase (any socket's copy works).
    socket.on("session:state", (payload) => {
      const qs = payload?.questions || [];
      const q = qs[Number(payload?.state?.current_question_index || 0)] || null;
      if (payload?.state?.status === "LIVE" && q?.id && !globalThis.__stressQ) {
        globalThis.__stressQ = { id: q.id, status: "LIVE" };
      } else if (!globalThis.__stressQ && payload?.state?.status) {
        globalThis.__stressQ = { id: q?.id || null, status: payload.state.status };
      }
    });
  });
}

function answerOne(socket, sessionId, participantId, questionId) {
  return new Promise((resolve) => {
    const start = Date.now();
    const timer = setTimeout(() => resolve({ ok: false, ms: Date.now() - start, error: "ack timeout" }), ACK_TIMEOUT);
    const onAck = () => {
      clearTimeout(timer);
      socket.off("answer:ack", onAck);
      resolve({ ok: true, ms: Date.now() - start });
    };
    socket.on("answer:ack", onAck);
    socket.emit("answer:submit", { sessionId, participantId, questionId, answer: { choice: "stress-probe" } });
  });
}

let lastClean = 0;
for (const n of STEPS) {
  globalThis.__stressQ = null;
  // Phase A: join burst (unique names per step so rejoin-seat logic never merges us).
  const joined = await Promise.all(Array.from({ length: n }, (_, i) => joinOne(n, i)));
  const okJoin = joined.filter((j) => j.ok);
  const fullJoin = joined.filter((j) => j.full).length;
  const failJoin = joined.filter((j) => !j.ok && !j.full);
  const joinMs = joined.filter((j) => j.ok).map((j) => j.ms).sort((a, b) => a - b);
  const joinErrs = [...new Set(failJoin.map((j) => `${j.status}:${j.error || "?"}`))];

  // Phase B: connect storm (each connect fans out roster+state+scores).
  const connected = await Promise.all(okJoin.map((j) => connectOne(j.sessionId, j.reconnectKey)));
  const okConn = connected.filter((c, idx) => {
    if (c.ok) c.socket.__pid = okJoin[idx].participantId;
    else okJoin[idx].socket = null;
    return c.ok;
  });
  const connMs = connected.filter((c) => c.ok).map((c) => c.ms).sort((a, b) => a - b);
  const connErrs = [...new Set(connected.filter((c) => !c.ok).map((c) => c.error))];
  const liveSockets = okConn.map((c) => c.socket);
  await sleep(1500); // let state broadcasts land

  // Phase C: answer burst (only when the session is actually LIVE).
  const q = globalThis.__stressQ;
  let ackStat = "skipped (session not LIVE — start it first)";
  let ackClean = !!q && q.status === "LIVE" ? null : true;
  if (q && q.status === "LIVE" && q.id) {
    const sessionId = okJoin[0].sessionId;
    const acks = await Promise.all(
      liveSockets.map((s) => answerOne(s, sessionId, s.__pid, q.id)),
    );
    const okAck = acks.filter((a) => a.ok);
    const ackMs = acks.map((a) => a.ms).sort((a, b) => a - b);
    ackStat = `ok=${okAck.length}/${acks.length} p50=${pct(ackMs, 50)}ms p95=${pct(ackMs, 95)}ms max=${ackMs[ackMs.length - 1]}ms`;
    ackClean = okAck.length === acks.length && acks.length === liveSockets.length && pct(ackMs, 95) <= ACK_BUDGET_MS;
  }

  for (const s of liveSockets) {
    try {
      s.disconnect();
    } catch {}
  }
  await sleep(2000); // let disconnect grace timers settle before next step

  const clean = failJoin.length === 0 && connErrs.length === 0 && okConn.length === okJoin.length && ackClean === true;
  // FULL seats with zero failures still counts as config-capped, not broken.
  const capped = fullJoin > 0 && failJoin.length === 0 && connErrs.length === 0;
  if (clean) lastClean = n;
  console.log(
    `N=${String(n).padStart(3)} join ok=${okJoin.length} full=${fullJoin} fail=${failJoin.length}` +
      (joinErrs.length ? ` JOIN-ERR:${joinErrs.join("|")}` : "") +
      (joinMs.length ? ` p95=${pct(joinMs, 95)}ms` : "") +
      ` | connect ok=${okConn.length}/${okJoin.length}` +
      (connMs.length ? ` p95=${pct(connMs, 95)}ms` : "") +
      (connErrs.length ? ` ERR:${connErrs.join("|")}` : "") +
      ` | answer ${ackStat} ${capped && !clean ? "CONFIG-CAPPED" : clean ? "CLEAN" : "OVER"}`,
  );
  if (capped && okJoin.length === 0) {
    console.log("No seats free at all — raise max_participants (or use an unlimited-seat teacher) to measure the system instead of the config.");
    break;
  }
  if (n === STEPS[0] && okJoin.length === 0 && fullJoin === 0) {
    console.log("SETUP ISSUE (not a limit): every join failed. Check: server running + BASE is the API port (4000), CODE is correct + uppercase, session is LOBBY/LIVE/PAUSED (not ended/tutorial). Fix and re-run.");
    break;
  }
}

console.log(`\nLIVE LIMIT (this machine): ${lastClean} students clean (join+connect+answer, ack p95<=${ACK_BUDGET_MS}ms).`);
console.log("Cleanup: stress students stay in the DB — reuse a dedicated stress session and delete it when done.");
process.exit(0);
