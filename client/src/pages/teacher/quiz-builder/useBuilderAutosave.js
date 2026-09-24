import { useCallback, useEffect, useRef, useState } from "react";

const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const WRITE_DEBOUNCE_MS = 900;
const SERVER_AUTOSAVE_MS = 25000;

export function builderDraftKey(id, guestMode) {
  return `tw_builder_draft:${guestMode ? "guest" : "t"}:${id}`;
}

function storageFor(guestMode) {
  try {
    return guestMode ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

export function readBuilderDraft(id, guestMode) {
  try {
    const store = storageFor(guestMode);
    if (!store) return null;
    const raw = store.getItem(builderDraftKey(id, guestMode));
    if (!raw) return null;
    const draft = JSON.parse(raw);
    if (!draft || !Array.isArray(draft.questions) || !draft.questions.length) return null;
    if (draft.updatedAt && Date.now() - Number(draft.updatedAt) > DRAFT_TTL_MS) {
      store.removeItem(builderDraftKey(id, guestMode));
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

export function clearBuilderDraft(id, guestMode) {
  try {
    const store = storageFor(guestMode);
    store?.removeItem(builderDraftKey(id, guestMode));
  } catch {}
}

function sameContent(a, b) {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

// Local debounced draft + periodic server autosave + crash recovery prompt.
// Recovery decision is exposed so QuizBuilder can render it via BuilderModals.
export function useBuilderAutosave({
  id,
  guestMode,
  ready,
  questions,
  qIndex,
  titleDraft,
  settings,
  isSaved,
  modal,
  editVersionRef,
  setQuestions,
  setQIndex,
  setTitleDraft,
  setSettings,
  setIsSaved,
  setModal,
  doServerSave,
}) {
  const [pendingDraft, setPendingDraft] = useState(null);
  const checkedRef = useRef(false);
  const writeTimer = useRef(null);

  // Offer recovery once, right after the server snapshot finishes loading.
  useEffect(() => {
    if (!ready || checkedRef.current) return;
    checkedRef.current = true;
    const draft = readBuilderDraft(id, guestMode);
    if (!draft) return;
    const current = { questions, titleDraft, settings, qIndex };
    const candidate = { questions: draft.questions, titleDraft: draft.titleDraft || "", settings: draft.settings || null, qIndex: draft.qIndex || 0 };
    if (sameContent(current, candidate)) {
      clearBuilderDraft(id, guestMode);
      return;
    }
    setPendingDraft(draft);
    setModal("recoverDraft");
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced local draft while editing.
  useEffect(() => {
    if (!ready || pendingDraft) return undefined;
    if (writeTimer.current) window.clearTimeout(writeTimer.current);
    writeTimer.current = window.setTimeout(() => {
      try {
        const store = storageFor(guestMode);
        if (!store || isSaved) return;
        store.setItem(builderDraftKey(id, guestMode), JSON.stringify({
          questions, qIndex, titleDraft, settings, updatedAt: Date.now(),
        }));
      } catch {}
    }, WRITE_DEBOUNCE_MS);
    return () => { if (writeTimer.current) window.clearTimeout(writeTimer.current); };
  }, [ready, pendingDraft, questions, qIndex, titleDraft, settings, isSaved, id, guestMode]);

  // A clean manual save discards the local draft.
  useEffect(() => {
    if (isSaved && !pendingDraft) clearBuilderDraft(id, guestMode);
  }, [isSaved, pendingDraft, id, guestMode]);

  // Warn on accidental tab close with unsaved work.
  useEffect(() => {
    function onBeforeUnload(event) {
      if (isSaved) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isSaved]);

  // Periodic server autosave while dirty and no dialog is open.
  useEffect(() => {
    if (!ready || !doServerSave) return undefined;
    const timer = window.setInterval(() => {
      if (document.hidden || modal || pendingDraft) return;
      if (isSaved) return;
      const hasWork = String(titleDraft || "").trim() || (questions || []).some((q) => String(q?.prompt || "").trim());
      if (!hasWork) return;
      try { doServerSave(); } catch {}
    }, SERVER_AUTOSAVE_MS);
    return () => window.clearInterval(timer);
  }, [ready, modal, pendingDraft, isSaved, titleDraft, questions, doServerSave]);

  const restoreDraft = useCallback(() => {
    if (!pendingDraft) return;
    try {
      if (Array.isArray(pendingDraft.questions) && pendingDraft.questions.length) {
        setQuestions(pendingDraft.questions);
        if (typeof pendingDraft.titleDraft === "string") setTitleDraft(pendingDraft.titleDraft);
        if (pendingDraft.settings) setSettings(pendingDraft.settings);
        if (Number.isFinite(Number(pendingDraft.qIndex))) setQIndex(Math.max(0, Number(pendingDraft.qIndex)));
        if (editVersionRef) editVersionRef.current += 1;
        setIsSaved(false);
      }
    } finally {
      setPendingDraft(null);
      setModal(null);
    }
  }, [pendingDraft, setQuestions, setTitleDraft, setSettings, setQIndex, setIsSaved, setModal, editVersionRef]);

  const discardDraft = useCallback(() => {
    clearBuilderDraft(id, guestMode);
    setPendingDraft(null);
    setModal(null);
  }, [id, guestMode, setModal]);

  return { pendingDraft, restoreDraft, discardDraft };
}
