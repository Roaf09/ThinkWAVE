import { useEffect, useMemo } from "react";
import { normalizeTemplateType } from "../../../lib/templateTypes";
import { templateAccent } from "../../../lib/templatePalette";
import {
  isThinkSpellRoundComplete,
  resolveThinkSpellWordBank,
} from "../../../lib/thinkSpell";

export function useStudentGameplay({
  state,
  questions,
  nowMs,
  clockOffsetMs,
  currentQ,
  roster,
  groups,
  participantId,
  joinedGroupId,
  groupNameDraft,
  selectedChoice,
  matchingMap,
  spell,
  submittedQId,
  submitLabel,
  answeredQuestionIds,
  countdown,
  postAnswerPhase,
  sessionId,
  socketRef,
  renameTimer,
  setCountdown,
  setGroupNameDraft,
}) {
  const myParticipant = useMemo(() => roster.find((p) => Number(p.id) === participantId) || null, [roster, participantId]);
  const myGroupId = Number(myParticipant?.group_id || joinedGroupId || 0) || null;
  const myGroup = useMemo(() => groups.find((g) => Number(g.id) === Number(myGroupId)) || null, [groups, myGroupId]);

  useEffect(() => {
    if (myGroup && !groupNameDraft) setGroupNameDraft(myGroup.display_name || myGroup.default_name || "");
  }, [myGroup?.display_name]);

  useEffect(() => {
    if (!myGroupId || !groupNameDraft || groupNameDraft === (myGroup?.display_name || "")) return;
    clearTimeout(renameTimer.current);
    renameTimer.current = setTimeout(() => {
      socketRef.current?.emit("student:renameGroup", {
        sessionId: Number(sessionId),
        participantId,
        groupId: myGroupId,
        name: groupNameDraft,
      });
    }, 450);
    return () => clearTimeout(renameTimer.current);
  }, [groupNameDraft, myGroupId, myGroup?.display_name, participantId, sessionId]);

  useEffect(() => {
    if (state?.status !== "LIVE") { setCountdown(null); return; }
    setCountdown(3);
    const iv = setInterval(() => setCountdown((v) => {
      if (v === null) return null;
      if (v <= 1) { clearInterval(iv); return 0; }
      return v - 1;
    }), 1000);
    return () => clearInterval(iv);
  }, [state?.status, state?.current_question_index]);

  const timer = useMemo(() => {
    const total = Number(currentQ?.config_json?.timeLimitSec || state?.time_limit_sec || 0);
    if (!currentQ || state?.status !== "LIVE") return { remainingSec: 0, progress: 0, total };
    const serverNowMs = nowMs - clockOffsetMs;
    const resumeHoldUntil = Number(state?.resume_hold_until_ms || 0);
    const resumeHoldRemaining = Number(state?.resume_hold_remaining_sec);
    if (resumeHoldUntil > serverNowMs && Number.isFinite(resumeHoldRemaining)) {
      return { remainingSec: Math.max(0, resumeHoldRemaining), progress: total > 0 ? Math.min(1, resumeHoldRemaining / total) : 0, total };
    }
    const started = state?.question_started_at_ms != null
      ? Number(state.question_started_at_ms)
      : state?.question_started_at ? new Date(state.question_started_at).getTime() : 0;
    if (started && started > serverNowMs) return { remainingSec: total, progress: total > 0 ? 1 : 0, total };
    if (state?.question_deadline_at_ms != null || state?.question_deadline_at) {
      const deadlineMs = state?.question_deadline_at_ms != null ? Number(state.question_deadline_at_ms) : new Date(state.question_deadline_at).getTime();
      const remainingMs = Math.max(0, deadlineMs - serverNowMs);
      const remaining = Math.ceil(remainingMs / 1000);
      return { remainingSec: remaining, progress: total > 0 ? Math.min(1, remaining / total) : 0, total };
    }
    if (!started) return { remainingSec: 0, progress: 0, total };
    const elapsed = Math.max(0, Math.floor((serverNowMs - started) / 1000));
    const remaining = Math.max(0, total - elapsed);
    return { remainingSec: remaining, progress: total > 0 ? remaining / total : 0, total };
  }, [state, nowMs, currentQ, clockOffsetMs]);

  const isGuestHosted = !!state?.is_guest_host;
  const isGroupMode = state?.join_mode === "GROUP";
  const isLastQuestion = !!state && Number(state.current_question_index || 0) >= Math.max(0, questions.length - 1);
  const matchingRequired = state?.template_type === "MATCHING" ? (Array.isArray(currentQ?.config_json?.colA) ? currentQ.config_json.colA.length : 0) : 0;
  const isMatchingIncomplete = state?.template_type === "MATCHING" && Object.keys(matchingMap).length < matchingRequired;
  const ttNormalized = normalizeTemplateType(state?.template_type);
  const gameplayAccent = templateAccent(ttNormalized);
  const thinkSpellWordBank = ttNormalized === "THINK_SPELL"
    ? (Array.isArray(spell.wordBank) && spell.wordBank.length
      ? spell.wordBank
      : resolveThinkSpellWordBank({ config: currentQ?.config_json || {}, correct: currentQ?.correct_json || {} }))
    : [];
  const thinkSpellAllWordsFound = ttNormalized === "THINK_SPELL" && isThinkSpellRoundComplete({
    foundWords: spell.foundWords || [],
    wordBank: thinkSpellWordBank,
  });
  const thinkSpellRoundOver = ttNormalized === "THINK_SPELL" && (
    thinkSpellAllWordsFound || timer.remainingSec === 0
  );
  const interactionLocked = !currentQ
    || (submittedQId === currentQ?.id)
    || thinkSpellRoundOver
    || (timer.remainingSec === 0 && ttNormalized !== "THINK_SPELL")
    || state?.status !== "LIVE"
    || countdown > 0
    || postAnswerPhase === "complete"
    || postAnswerPhase === "wait";
  const choiceMissing = ["MCQ", "TRUE_FALSE"].includes(ttNormalized) && (Array.isArray(selectedChoice) ? selectedChoice.length === 0 : !selectedChoice);
  const isLocked = interactionLocked || isMatchingIncomplete || choiceMissing || (ttNormalized === "THINK_SPELL" && !(Array.isArray(spell.foundEntries) && spell.foundEntries.length));

  // Identification should be ready for keyboard input as soon as the question appears.
  // Guess Word already listens at the window level, so no click/focus is needed there either.
  useEffect(() => {
    if (ttNormalized !== "TYPE_ANSWER" || interactionLocked || state?.status !== "LIVE") return undefined;
    const frame = window.requestAnimationFrame(() => {
      const input = document.querySelector(".quiz-shell-new .type-input");
      if (input instanceof HTMLInputElement) input.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [ttNormalized, currentQ?.id, interactionLocked, state?.status]);

  const thinkSpellTimeUp = ttNormalized === "THINK_SPELL" && timer.remainingSec === 0 && state?.status === "LIVE";
  const thinkSpellAllFound = ttNormalized === "THINK_SPELL" && thinkSpellAllWordsFound && !thinkSpellTimeUp;
  const thinkSpellSubmitLabel = ttNormalized === "THINK_SPELL" ? "Submit Answers" : submitLabel;
  const completedLiveCount = Math.min(questions.length, answeredQuestionIds.size);
  const liveQuestionProgress = questions.length ? Math.round((completedLiveCount / questions.length) * 100) : 0;

  return {
    timer,
    myGroupId,
    myGroup,
    isGuestHosted,
    isGroupMode,
    isLastQuestion,
    isMatchingIncomplete,
    ttNormalized,
    gameplayAccent,
    interactionLocked,
    isLocked,
    thinkSpellTimeUp,
    thinkSpellAllFound,
    thinkSpellSubmitLabel,
    completedLiveCount,
    liveQuestionProgress,
  };
}
