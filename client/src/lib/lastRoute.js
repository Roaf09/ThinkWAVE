/* FILE GUIDE:
 * client/src/lib/lastRoute.js
 * Purpose: Remember the last in-app page (localStorage, so it survives closed
 * tabs) and offer it back after the next login, so an interrupted user lands
 * where they left off instead of always starting at the dashboard home.
 */

const KEY = "tw_last_route";

// Public/auth pages are never resume targets.
const SKIP_PREFIXES = [
  "/login",
  "/register",
  "/student-login",
  "/superadmin-login",
  "/superadmin-register",
  "/verify",
  "/forgot-password",
  "/plan",
];

function isSkipped(path) {
  if (!path || path === "/") return true;
  return SKIP_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`)
  );
}

// The token payload carries the user id (sub). Scoping the saved route to it
// stops one user's page from being offered to a different user sharing the
// browser — e.g. a brand-new teacher landing in the previous teacher's quiz
// builder and seeing "Quiz not found".
function currentTokenSub() {
  try {
    const token = window.localStorage.getItem("qz_token") || "";
    const payload = token.split(".")[1];
    if (!payload) return null;
    const sub = JSON.parse(window.atob(payload))?.sub;
    return sub === undefined || sub === null ? null : String(sub);
  } catch {
    return null;
  }
}

export function saveLastRoute(path) {
  if (typeof window === "undefined" || !path || isSkipped(path)) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ sub: currentTokenSub(), path }));
  } catch {}
}

// Explicit logouts call this so the NEXT login starts fresh instead of
// resuming the previous user's page on a shared browser.
export function clearLastRoute() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {}
}

// One-shot read: returns the saved route only when it belongs to the given
// role's area, then clears it either way so a stale target can't loop.
export function consumeLastRoute(role) {
  let raw = null;
  try {
    raw = window.localStorage.getItem(KEY);
    window.localStorage.removeItem(KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  // Legacy plain-string entries predate per-user scoping and can't be
  // attributed — never trust them.
  let saved = null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || typeof parsed.path !== "string") return null;
    if (parsed.sub !== undefined && parsed.sub !== null && String(parsed.sub) !== String(currentTokenSub())) return null;
    saved = parsed.path;
  } catch {
    return null;
  }
  if (!saved || isSkipped(saved)) return null;
  const allowed =
    role === "TEACHER"
      ? ["/teacher"]
      : role === "STUDENT"
        ? ["/student", "/play"]
        : role === "ADMIN"
          ? ["/admin"]
          : role === "SUPERADMIN"
            ? ["/superadmin"]
            : [];
  const ok = allowed.some(
    (prefix) => saved === prefix || saved.startsWith(`${prefix}/`) || saved.startsWith(`${prefix}?`)
  );
  return ok ? saved : null;
}
