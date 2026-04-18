/* FILE GUIDE:
 * client/src/lib/auth.js
 * Purpose: Project source file. Read the file name and exports first, then follow the imported helpers to understand the flow.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

const KEY = "qz_token";
const ROLE = "qz_role";

export function getToken() { return localStorage.getItem(KEY) || ""; }
export function setToken(t) { localStorage.setItem(KEY, t); }
export function clearToken() { localStorage.removeItem(KEY); }

export function getRole() { return localStorage.getItem(ROLE) || ""; }
export function setRole(r) { localStorage.setItem(ROLE, r); }
export function clearRole() { localStorage.removeItem(ROLE); }
