const PREFIX = "tw_teacher_tutorial_v1018";

function storageKey(userId) {
  return `${PREFIX}:${String(userId || "unknown")}`;
}

export function readTutorialState(userId) {
  if (!userId || typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(storageKey(userId));
    return raw ? JSON.parse(raw) || {} : {};
  } catch {
    return {};
  }
}

export function writeTutorialState(userId, patch) {
  if (!userId || typeof window === "undefined") return {};
  const next = { ...readTutorialState(userId), ...(patch || {}) };
  try { localStorage.setItem(storageKey(userId), JSON.stringify(next)); } catch {}
  return next;
}

export function updateTutorialState(userId, updater) {
  const current = readTutorialState(userId);
  const next = typeof updater === "function" ? updater(current) : { ...current, ...(updater || {}) };
  if (userId && typeof window !== "undefined") {
    try { localStorage.setItem(storageKey(userId), JSON.stringify(next || {})); } catch {}
  }
  return next || {};
}

export function markTemplateTutorialSeen(userId, templateType) {
  return updateTutorialState(userId, (current) => ({
    ...current,
    templateSeen: { ...(current.templateSeen || {}), [String(templateType || "")]: true },
  }));
}

export function hasSeenTemplateTutorial(userId, templateType) {
  return !!readTutorialState(userId)?.templateSeen?.[String(templateType || "")];
}

export function markMainStage(userId, mainStage, extra = {}) {
  return writeTutorialState(userId, { mainStarted: true, mainStage, ...extra });
}

export function finishMainTutorial(userId) {
  return writeTutorialState(userId, { mainStarted: true, mainComplete: true, mainStage: "complete" });
}
