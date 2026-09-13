const sessionBackgrounds = new Map();
// Must match the catalogue the client offers (client/src/lib/sessionBackgrounds.js:
// background-01 … background-32). Keep this the single source of truth — the
// route schemas import it — so adding artwork on the client cannot leave the
// server rejecting the new keys (DEF-01: keys 23–32 returned 400 on host/assign).
export const SESSION_BACKGROUND_KEY_PATTERN = /^background-(?:0[1-9]|[12][0-9]|3[0-2])$/;
const VALID_BACKGROUND = SESSION_BACKGROUND_KEY_PATTERN;

export function normalizeSessionBackgroundKey(value, fallback = "background-01") {
  const key = String(value || "").trim();
  return VALID_BACKGROUND.test(key) ? key : fallback;
}

export function rememberSessionBackground(sessionId, backgroundKey) {
  const id = Number(sessionId);
  if (!id) return;
  sessionBackgrounds.set(id, normalizeSessionBackgroundKey(backgroundKey));
}

export function getRememberedSessionBackground(sessionId) {
  return sessionBackgrounds.get(Number(sessionId)) || null;
}

export function forgetSessionBackground(sessionId) {
  sessionBackgrounds.delete(Number(sessionId));
}
