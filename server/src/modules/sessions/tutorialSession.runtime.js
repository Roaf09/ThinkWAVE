const tutorialSessions = new Set();

export function markTutorialSession(sessionId, enabled = true) {
  const id = Number(sessionId);
  if (!Number.isFinite(id) || id <= 0) return;
  if (enabled) tutorialSessions.add(id);
  else tutorialSessions.delete(id);
}

export function isTutorialSession(sessionId) {
  const id = Number(sessionId);
  return Number.isFinite(id) && tutorialSessions.has(id);
}

export function forgetTutorialSession(sessionId) {
  const id = Number(sessionId);
  if (Number.isFinite(id)) tutorialSessions.delete(id);
}
