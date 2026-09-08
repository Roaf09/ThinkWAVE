/* FILE GUIDE:
 * client/src/lib/socket.js
 * Purpose: Socket.IO client factory used by live session pages.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import { io } from "socket.io-client";
import { API_BASE } from "./api";
import { getToken } from "./auth";

export function makeSocket() {
  // websocket-only means a network that blocks/interferes with the WS
  // upgrade (common on school wifi proxies) fails the connection outright
  // instead of falling back - the client then retries in a tight loop,
  // which is what was burning through the student:connect rate limit and
  // surfacing as "too many requests" on join.
  return io(API_BASE, { transports: ["websocket", "polling"], auth: { token: getToken() } });
}
