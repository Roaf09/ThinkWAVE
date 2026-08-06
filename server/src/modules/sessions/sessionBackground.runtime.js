const sessionBackgrounds = new Map();
const VALID_BACKGROUND = /^background-(?:0[1-9]|1[0-9]|2[0-2])$/;

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
