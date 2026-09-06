/* FILE GUIDE:
 * client/src/lib/auth.js
 * Purpose: Project source file. Read the file name and exports first, then follow the imported helpers to understand the flow.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

const KEY = "qz_token";
const ROLE = "qz_role";
// localStorage is shared by every tab of the same browser. This tab-scoped
// sessionStorage copy lets App.jsx tell "someone else logged in on top of me
// in another tab" apart from "this is still my own session".
const TAB_KEY = "qz_tab_token";

export function getToken() { return localStorage.getItem(KEY) || ""; }
export function setToken(t) { localStorage.setItem(KEY, t); sessionStorage.setItem(TAB_KEY, t); }
export function clearToken() { localStorage.removeItem(KEY); sessionStorage.removeItem(TAB_KEY); }
export function getTabToken() { return sessionStorage.getItem(TAB_KEY) || ""; }

export function getRole() { return localStorage.getItem(ROLE) || ""; }
export function setRole(r) { localStorage.setItem(ROLE, r); }
export function clearRole() { localStorage.removeItem(ROLE); }
