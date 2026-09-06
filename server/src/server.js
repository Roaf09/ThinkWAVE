/* FILE GUIDE:
 * server/src/server.js
 * Purpose: Server entry point. Creates the HTTP server, attaches Socket.IO, and starts the API process.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import http from "http";
import { Server as IOServer } from "socket.io";
import { env } from "./env.js";
import { makeApp } from "./app.js";
import { registerSessionSockets } from "./modules/sessions/sessions.socket.js";
import jwt from "jsonwebtoken";
import { pool } from "./db.js";

// Create the Express app first so REST routes and middleware exist before sockets attach.
const app = makeApp();
// HTTP server is shared by REST and Socket.IO so both run on the same port.
const httpServer = http.createServer(app);

// Socket.IO powers the live classroom features (host panel, student play, scores, roster, etc.).
const io = new IOServer(httpServer, {
  cors: { origin: env.CLIENT_ORIGIN, methods: ["GET","POST"] }
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

httpServer.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}`);
});
