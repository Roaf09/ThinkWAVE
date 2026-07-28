/* FILE GUIDE:
 * client/src/lib/socket.js
 * Purpose: Socket.IO client factory used by live session pages.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import { io } from "socket.io-client";
import { API_BASE } from "./api";
import { getToken } from "./auth";

export function makeSocket() {
  return io(API_BASE, { transports: ["websocket"], auth: { token: getToken() } });
}
