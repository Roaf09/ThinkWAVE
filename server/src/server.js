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

// Create the Express app first so REST routes and middleware exist before sockets attach.
const app = makeApp();
// HTTP server is shared by REST and Socket.IO so both run on the same port.
const httpServer = http.createServer(app);

// Socket.IO powers the live classroom features (host panel, student play, scores, roster, etc.).
const io = new IOServer(httpServer, {
  cors: { origin: env.CLIENT_ORIGIN, methods: ["GET","POST"] }
});

registerSessionSockets(io);

httpServer.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}`);
});
