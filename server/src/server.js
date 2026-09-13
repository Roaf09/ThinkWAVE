/* FILE GUIDE:
 * server/src/server.js
 * Purpose: Server entry point. Creates the HTTP server, attaches Socket.IO, and starts the API process.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import http from "http";
import { Server as IOServer } from "socket.io";
import { env } from "./env.js";
import { makeApp } from "./app.js";
import { registerSessionSockets, closeOrphanedSessions } from "./modules/sessions/sessions.socket.js";
import { registerAssignmentSockets } from "./modules/student/assignment.socket.js";
import { setIO } from "./socketRegistry.js";
import jwt from "jsonwebtoken";
import { pool } from "./db.js";

// Safety net: this column has repeatedly caused ER_BAD_FIELD_ERROR crashes
// (assignment submission, student dashboard) on databases that predate it.
// The app already degrades gracefully if this fails for any reason (no
// permission, etc.) - this just removes the need to remember to run the
// migration script manually. Safe/idempotent: checks first, only alters if
// genuinely missing.
async function ensureCompetitivePointsColumn() {
  try {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS c FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'async_quiz_submissions' AND column_name = 'competitive_points'`
    );
    if (Number(rows?.[0]?.c || 0) > 0) return;
    await pool.query(`ALTER TABLE async_quiz_submissions ADD COLUMN competitive_points INT NOT NULL DEFAULT 0 AFTER max_score`);
    console.log("[startup] Added missing async_quiz_submissions.competitive_points column.");
  } catch (err) {
    console.warn("[startup] Could not verify/add competitive_points column automatically:", err?.message || err);
  }
}
await ensureCompetitivePointsColumn();

// Create the Express app first so REST routes and middleware exist before sockets attach.
const app = makeApp();
// HTTP server is shared by REST and Socket.IO so both run on the same port.
const httpServer = http.createServer(app);

// Socket.IO powers the live classroom features (host panel, student play, scores, roster, etc.).
const io = new IOServer(httpServer, {
  cors: { origin: env.CLIENT_ORIGINS || [env.CLIENT_ORIGIN], methods: ["GET", "POST"], credentials: true }
});

io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next();
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    const [[user]] = await pool.query(
      `SELECT id, role, is_active, deleted_at, token_version FROM users WHERE id=:id LIMIT 1`,
      { id: payload.sub }
    );
    const guestHost = payload.role === "GUEST_HOST" && user?.role === "TEACHER";
    if (!user || !user.is_active || (!guestHost && user.deleted_at)) return next();
    if (!guestHost && user.role !== payload.role) return next();
    if (Number(payload.ver || 0) !== Number(user.token_version || 0)) return next();
    socket.data.user = payload;
    next();
  } catch {
    next();
  }
});

registerSessionSockets(io);
registerAssignmentSockets(io);
setIO(io);

// Sessions still LOBBY/LIVE/PAUSED from before this process last started have
// no way to ever reach ENDED on their own (see closeOrphanedSessions) - clear
// them before accepting traffic so they don't linger in Session History gaps
// or the active-sessions list.
closeOrphanedSessions().catch((error) => console.error("closeOrphanedSessions failed:", error));
// A session can also go orphaned mid-uptime - a heartbeat that stops without
// a clean socket disconnect (process kill, crashed tab) never triggers the
// normal 5-minute teacher-disconnect timer at all, since that timer only
// starts from an actual disconnect event. Re-running this sweep periodically,
// not just at boot, catches that case without waiting for the next restart.
const orphanSweep = setInterval(() => { closeOrphanedSessions().catch((error) => console.error("closeOrphanedSessions failed:", error)); }, 15 * 60 * 1000);

httpServer.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}`);
});

// Render (and Docker/K8s) send SIGTERM before stopping the process. Without
// this, in-flight joins die mid-write and the event loop stays alive on the
// sweep timer until forcibly killed. Drain: stop accepting, close sockets,
// then release the DB pool. Force-exit after 10s so a stuck connection can't
// hang a deploy forever.
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[shutdown] ${signal} received — draining...`);
  clearInterval(orphanSweep);
  const forceExit = setTimeout(() => {
    console.error("[shutdown] drain timed out — forcing exit.");
    process.exit(1);
  }, 10_000);
  forceExit.unref?.();
  httpServer.close(() => {
    io.close();
    pool.end()
      .catch((error) => console.error("[shutdown] pool close failed:", error?.message || error))
      .finally(() => {
        clearTimeout(forceExit);
        process.exit(0);
      });
  });
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
