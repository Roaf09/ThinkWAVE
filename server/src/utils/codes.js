/* FILE GUIDE:
 * server/src/utils/codes.js
 * Purpose: Project source file. Read the file name and exports first, then follow the imported helpers to understand the flow.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import { nanoid } from "nanoid";

export function makeJoinCode() {
  // easy-to-type code (upper only)
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return nanoid(8).toUpperCase().split("").map(c => alphabet[alphabet.indexOf(c) % alphabet.length] || "A").join("");
}

export function makeReconnectKey() {
  return nanoid(32);
}
