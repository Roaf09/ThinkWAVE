import { useRef } from "react";
import { buildBlankQuestion } from "./quizBuilderUtils";

export function useBuilderQuestions({
  quiz,
  setQuiz,
  questions,
  qIndex,
  setQIndex,
  markUnsaved,
  builderTutorialStage,
  setBuilderTutorialStage,
  setModal,
  setNavDir,
  setNavTick,
  editVersionRef,
  setQuestions,
  setIsSaved,
  inheritedGlobalConfig,
}) {
  const currentQ = questions[qIndex] || null;
  const lockSaveRequestRef = useRef(false);

  function addQuestion() {
    const tutorialAddRequested = builderTutorialStage === "add";
    markUnsaved((qs) => {
      const blank = buildBlankQuestion(quiz, qs.length);
      blank.config = { ...blank.config, ...inheritedGlobalConfig(qs) };
      return [...qs, blank];
    });
    setNavDir("next");
    setQIndex(questions.length);
    setNavTick((v) => v + 1);
    if (tutorialAddRequested) {
      // Main onboarding: guide the second question one area at a time again.
      // Follow-up/template-specific tutorials keep their shorter repeat flow.
      // The repeat step always highlights the whole question form with a single
      // "try again" dialog now, rather than stepping through each field one at
      // a time - that granular walkthrough only made sense the first time.
      setBuilderTutorialStage("repeat");
    }
  }

  function deleteCurrentQuestion() {
    if (!questions.length) return;
    setModal("confirmDeleteQuestion");
  }

  function performDeleteCurrentQuestion() {
    if (questions.length === 1) {
      editVersionRef.current += 1;
      setQuestions([buildBlankQuestion(quiz, 0)]);
      setQIndex(0);
      setIsSaved(false);
      setNavTick((v) => v + 1);
      setModal(null);
      return;
    }
    markUnsaved((qs) => qs.filter((_, i) => i !== qIndex).map((q, i) => ({ ...q, order: i })));
    setQIndex((i) => Math.max(0, i - 1));
    setNavDir("prev");
    setNavTick((v) => v + 1);
    setModal(null);
  }

  function updateQ(patch) {
    if (patch._convertToMatching) {
      const { _convertToMatching, ...rest } = patch;
      setQuiz((prev) => ({ ...prev, template_type: "MATCHING" }));
      markUnsaved((qs) => {
        const next = [...qs];
        next[qIndex] = {
          ...next[qIndex],
          ...rest,
          points: 1, // Revision 3: all templates default to 1 point per question
        };
        return next;
      });
      return;
    }
    markUnsaved((qs) => {
      const next = [...qs];
      next[qIndex] = { ...next[qIndex], ...patch };
      return next;
    });
  }

  // --- Small builder features: duplicate, move, lock, undo/redo ---------

  function duplicateCurrentQuestion() {
    if (!currentQ) return;
    const copy = JSON.parse(JSON.stringify(currentQ));
    delete copy.id;
    const insertAt = qIndex + 1;
    markUnsaved((qs) => {
      const next = [...qs];
      next.splice(insertAt, 0, copy);
      return next.map((q, i) => ({ ...q, order: i }));
    });
    setNavDir("next");
    setQIndex(insertAt);
    setNavTick((v) => v + 1);
  }

  function moveQuestion(direction) {
    const target = qIndex + direction;
    if (target < 0 || target >= questions.length) return;
    markUnsaved((qs) => {
      const next = [...qs];
      const tmp = next[qIndex];
      next[qIndex] = next[target];
      next[target] = tmp;
      return next.map((q, i) => ({ ...q, order: i }));
    });
    setNavDir(direction > 0 ? "next" : "prev");
    setQIndex(target);
    setNavTick((v) => v + 1);
  }

  function toggleLock() {
    if (!currentQ) return;
    const wasLocked = !!currentQ.config?.locked;
    lockSaveRequestRef.current = true;
    markUnsaved((qs) => {
      const next = [...qs];
      next[qIndex] = { ...next[qIndex], config: { ...(next[qIndex].config || {}), locked: !wasLocked } };
      return next;
    });
  }

  function goPrev() {
    if (qIndex === 0) return;
    setNavDir("prev");
    setQIndex((i) => i - 1);
    setNavTick((v) => v + 1);
  }

  function goNext() {
    if (qIndex >= questions.length - 1) return;
    setNavDir("next");
    setQIndex((i) => i + 1);
    setNavTick((v) => v + 1);
  }

  return {
    currentQ,
    addQuestion,
    deleteCurrentQuestion,
    performDeleteCurrentQuestion,
    updateQ,
    duplicateCurrentQuestion,
    moveQuestion,
    toggleLock,
    goPrev,
    goNext,
    lockSaveRequestRef,
  };
}
