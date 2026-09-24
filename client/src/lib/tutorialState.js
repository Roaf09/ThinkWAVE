import { api } from "./api.js";

const PREFIX = "tw_teacher_tutorial_v1018";

function storageKey(userId) {
  return `${PREFIX}:${String(userId || "unknown")}`;
}

function stamp(next) {
  return { ...(next || {}), updatedAt: Date.now() };
}

function persistLocal(userId, next) {
  try { localStorage.setItem(storageKey(userId), JSON.stringify(next)); } catch {}
}

// Debounced cross-device push: rapid successive writes (host-panel score
// chatter, builder autosaves) collapse into one PUT of the latest snapshot.
const pushTimers = new Map();
function schedulePush(userId) {
  if (!userId || typeof window === "undefined") return;
  if (pushTimers.has(userId)) window.clearTimeout(pushTimers.get(userId));
  pushTimers.set(userId, window.setTimeout(async () => {
    pushTimers.delete(userId);
    try {
      const snapshot = readTutorialState(userId);
      await api.put("/tutorial-state", { state: snapshot, updatedAt: Number(snapshot.updatedAt || 0) || Date.now() });
    } catch {
      // Offline or expired session: the local cache stays authoritative and
      // the next write retries the push.
    }
  }, 600));
}

// Pull the server snapshot and keep whichever side (this device vs the
// server) was written most recently, so a tour continued on desktop resumes
// from the same step on mobile instead of starting over.
export async function pullTutorialState(userId) {
  const local = readTutorialState(userId);
  if (!userId || typeof window === "undefined") return local;
  try {
    const { data } = await api.get("/tutorial-state");
    const remote = data?.state && typeof data.state === "object" ? data.state : {};
    const remoteAt = Number(data?.updatedAt || remote.updatedAt || 0);
    const localAt = Number(local.updatedAt || 0);
    if (remoteAt > localAt) {
      const next = stamp(remote);
      persistLocal(userId, next);
      return next;
    }
    return local;
  } catch {
    return local;
  }
}

export function pushTutorialState(userId) {
  schedulePush(userId);
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
  const next = stamp({ ...readTutorialState(userId), ...(patch || {}) });
  persistLocal(userId, next);
  schedulePush(userId);
  return next;
}

// Overwrite (not merge): used when the stored tour belongs to a previous
// account that reused this numeric id after a database reset.
export function resetTutorialState(userId) {
  if (!userId || typeof window === "undefined") return {};
  const next = stamp({});
  try { window.localStorage.setItem(storageKey(userId), JSON.stringify(next)); } catch {}
  schedulePush(userId);
  return next;
}

export function updateTutorialState(userId, updater) {
  const current = readTutorialState(userId);
  const next = stamp(typeof updater === "function" ? updater(current) : { ...current, ...(updater || {}) });
  if (userId && typeof window !== "undefined") {
    persistLocal(userId, next);
    schedulePush(userId);
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

