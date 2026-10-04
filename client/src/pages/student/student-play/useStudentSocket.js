import { useEffect, useRef } from "react";
import { makeSocket } from "../../../lib/socket";
import { normalizeTemplateType } from "../../../lib/templateTypes";
import { getRole } from "../../../lib/auth";
import soundManager from "../../../utils/soundmanager";
import { explanationHeading, feedbackStatus, crosswordRejectLabel } from "./studentPlayUtils";

export function useStudentSocket({
  sessionId,
  reconnectKey,
  participantId,
  navigate,
  socketRef,
  currentQRef,
  stateRef,
  questionCountRef,
  timeoutSubmitRef,
  pendingLeaderboardRef,
  leaderboardAppliedRef,
  completeTimer,
  feedbackHideTimer,
  feedbackPulseTimer,
  explanationDockTimer,
  explanationFadeTimer,
  explanationClearTimer,
  antiRemovalTimer,
  setSubmittedQId,
  setAnsweredQuestionIds,
  setMsg,
  setAntiCheat,
  setAntiCountdown,
  setState,
  setQuestions,
  setClockOffsetMs,
  setScores,
  setLiveLeaderboard,
  setRoster,
  setGroups,
  setJoinedGroupId,
  setGroupNameDraft,
  setGroupProposal,
  setProposalStatus,
  setSpell,
  setSubmitLabel,
  setPostAnswerPhase,
  setAnswerText,
  setSelectedChoice,
  setMatchingMap,
  setFeedbackQ,
  setShowFeedback,
  setFeedbackFxKey,
  setFeedbackPulse,
  setExplanationFeedback,
  setWaitingForFinalFx,
}) {
  // Real-time connection. Student screens stay updated from socket events instead of repeated polling.
  // proposalClearTimer is local: the 1400ms group-resolve notice must not fire after unmount.
  const proposalClearTimer = useRef(null);
  // Tracks the last seen question index so per-question resets run in the
  // event body, where side-effects are safe.
  const prevQuestionIdxRef = useRef(undefined);
  // Guards the result splash against duplicate deliveries of the same
  // question's answer (replayed ack/reveal re-triggers the animation and
  // cuts the first run off). Keyed by question so legitimate next-question
  // splashes always play; crossword is exempt (many legit acks per question).
  const splashShownRef = useRef(null);
  // Remembers which question a visible verdict belongs to, so the hide
  // timer's side effects (explanation card, wait-lock) can be skipped when
  // the teacher already advanced past it. Set for every splash, including
  // crossword ones (which never touch splashShownRef).
  const feedbackQidRef = useRef(null);
  useEffect(() => {
    const s = makeSocket();
    socketRef.current = s;
    const extendedScreens = typeof window !== "undefined" && !!window.screen?.isExtended;
    s.on("connect", () => s.emit("student:connect", { sessionId: Number(sessionId), reconnectKey, isExtended: extendedScreens }));
    s.on("student:connected", (payload = {}) => {
      void soundManager.startBGM("lobby");
      // A reconnect (network blip, refresh) doesn't carry over this
      // component's own "have I answered this one" state, which otherwise
      // only lives in memory - without this the question briefly renders as
      // open again even though the server already has this participant's
      // answer on file and will reject a resubmit.
      if (payload.alreadyAnsweredQuestionId != null) setSubmittedQId(payload.alreadyAnsweredQuestionId);
    });
    s.on("student:error", (e) => setMsg(e?.message || "Could not join the session."));
    s.on("antiCheat:warning", (payload) => { setAntiCheat({ type:"warning", message:payload?.message || "We noticed that you tabbed out during the live session." }); setAntiCountdown(Number(payload?.confirmDelaySec || 5)); });
    s.on("antiCheat:kicked", (payload) => {
      clearTimeout(antiRemovalTimer.current);
      setAntiCheat({ type:"kicked", message:payload?.message || "You have been removed from this live session after three tab outs. If you think this is an accident, please speak with your teacher." });
      setAntiCountdown(3);
      antiRemovalTimer.current=setTimeout(()=>navigate(getRole()==="STUDENT"?"/student":"/"),3000);
    });
    s.on("session:state", (payload) => {
      // Per-question reset on advance. Done here in the event body (not
      // inside the setState updater below — updater side-effects are
      // unreliable and a missed reset locked every later question), with the
      // StudentPlay currentQ effect as a second net for missed pushes.
      const newIdx = payload.state?.current_question_index;
      if (prevQuestionIdxRef.current !== undefined && prevQuestionIdxRef.current !== newIdx) {
        // Kill Q-previous timers first. The verdict splash itself is NOT
        // killed here: it stays up over the next question's countdown until
        // its own hide timer runs out. That timer's post-hide side effects
        // (explanation card, wait-lock) are guarded to the question the
        // verdict belongs to, so they never leak into the new question.
        clearTimeout(feedbackPulseTimer.current);
        clearTimeout(explanationDockTimer.current);
        clearTimeout(explanationFadeTimer.current);
        clearTimeout(explanationClearTimer.current);
        setExplanationFeedback(null);
        setFeedbackPulse("");
        setPostAnswerPhase(null);
        setAnswerText("");
        setSelectedChoice("");
        setMatchingMap({});
        setSpell({ built: "", bank: [] });
        setSubmittedQId(null);
        timeoutSubmitRef.current = null;
        setSubmitLabel("Submit");
        setProposalStatus("");
        setGroupProposal(null);
        if (pendingLeaderboardRef.current) {
          setLiveLeaderboard(pendingLeaderboardRef.current);
          leaderboardAppliedRef.current = true;
        }
      }
      prevQuestionIdxRef.current = newIdx;
      setState(payload.state);
      setQuestions(payload.questions || []);
      if (payload.state?.server_now_ms != null) setClockOffsetMs(Date.now() - Number(payload.state.server_now_ms));
      else if (payload.state?.server_now) setClockOffsetMs(Date.now() - new Date(payload.state.server_now).getTime());
      if (payload.state?.status === "LIVE") void soundManager.startBGM("playing");
      if (payload.state?.status === "LOBBY" || payload.state?.status === "PAUSED") void soundManager.startBGM("lobby");
      if (payload.state?.status === "ENDED") {
        soundManager.stopBGM();
      }
    });
    s.on("scores:update", (sc) => setScores(sc || []));
    s.on("leaderboard:update", (payload = {}) => {
      pendingLeaderboardRef.current = payload;
      if (!leaderboardAppliedRef.current) {
        setLiveLeaderboard(payload);
        leaderboardAppliedRef.current = true;
      }
    });
    s.on("roster:update", (r) => setRoster(r || []));
    s.on("groups:update", (g) => setGroups(g || []));
    s.on("group:joined", ({ groupId, groupName }) => {
      setJoinedGroupId(groupId);
      setGroupNameDraft(groupName || "");
      setMsg("");
    });
    s.on("group:proposal", (proposal) => {
      setGroupProposal(proposal);
      const myVote = (proposal.votes || []).find((v) => Number(v.participant_id) === participantId)?.vote;
      setProposalStatus(myVote ? `You voted ${myVote.toLowerCase()}. Waiting for the rest of your group…` : "Discuss with your team, then vote to confirm or reject this answer.");
    });
    s.on("group:proposal:resolved", (payload) => {
      if (payload?.approved) {
        setProposalStatus("Your group answer has been submitted.");
      } else {
        const rejectedCrossword = normalizeTemplateType(stateRef.current?.template_type) === "CROSSWORD";
        setProposalStatus(payload?.message || (rejectedCrossword
          ? "Your group rejected that word. Try another one."
          : "Your group rejected that answer."));
        setSubmittedQId(null);
        setSubmitLabel(rejectedCrossword ? "Submit Word" : "Submit");
      }
      clearTimeout(proposalClearTimer.current);
      proposalClearTimer.current = setTimeout(() => {
        setGroupProposal(null);
        setProposalStatus("");
      }, 1400);
    });
    // Shared feedback screen: answer:ack (instant sessions) and
    // answer:reveal (deferred class sessions) both land here.
    const showAnswerFeedback = (a) => {
      const tt = normalizeTemplateType(stateRef.current?.template_type);
      const isCrossword = tt === "CROSSWORD" || normalizeTemplateType(a.templateType) === "CROSSWORD";

      if (a.message && !isCrossword) {
        setSubmitLabel(a.message);
        return;
      }

      clearTimeout(feedbackHideTimer.current);
      clearTimeout(feedbackPulseTimer.current);
      clearTimeout(antiRemovalTimer.current);
      // A fast teacher advance can leave the previous question's explanation
      // docked while the new Correct/Incorrect splash appears — dismiss it so
      // the feedback always shows first, explanation after.
      clearTimeout(explanationDockTimer.current);
      clearTimeout(explanationFadeTimer.current);
      clearTimeout(explanationClearTimer.current);
      setExplanationFeedback(null);

      if (isCrossword) {
        if (a.crossword) {
          setSpell((s) => ({
            ...s,
            foundWords: Array.isArray(a.crossword.words) ? a.crossword.words : s.foundWords || [],
            totalPoints: Number(a.crossword.totalPoints ?? s.totalPoints ?? 0),
            streak: Number(a.crossword.streak ?? 0),
            grid: Array.isArray(a.crossword.grid) ? a.crossword.grid : s.grid,
            gridSize: Number(a.crossword.gridSize ?? s.gridSize) || s.gridSize,
            refillCounter: Number(a.crossword.refillCounter ?? s.refillCounter ?? 0),
            refillTick: a.isCorrect ? (s.refillTick || 0) + 1 : s.refillTick,
            selected: [],
            built: "",
            lastReason: a.crossword.reason || null,
          }));
        } else {
          setSpell((s) => ({ ...s, selected: [], built: "", streak: 0 }));
        }

        if (a.isCorrect !== null && a.isCorrect !== undefined) {
          setFeedbackQ({ ...a, status: feedbackStatus(a) });
          setShowFeedback(true);
          feedbackQidRef.current = currentQRef.current?.id ?? a?.questionId ?? null;
          setFeedbackFxKey((v) => v + 1);
          setFeedbackPulse(feedbackStatus(a));
          feedbackHideTimer.current = setTimeout(() => {
            setShowFeedback(false);
            setFeedbackQ(null);
            // The teacher may have advanced while this verdict was showing -
            // in that case it just fades over the new question: no explanation
            // card and no wait-lock for a question it doesn't belong to.
            const stillCurrent = currentQRef.current?.id != null && feedbackQidRef.current != null
              && Number(feedbackQidRef.current) === Number(currentQRef.current.id);
            const explanation = a?.locked ? String(a?.explanation || currentQRef.current?.config_json?.explanation || "").trim() : "";
            if (explanation && stillCurrent) {
              clearTimeout(explanationDockTimer.current);
              clearTimeout(explanationFadeTimer.current);
              clearTimeout(explanationClearTimer.current);
              setExplanationFeedback({ status: feedbackStatus(a), heading: explanationHeading(a), explanation, phase: "center" });
              explanationDockTimer.current = setTimeout(() => setExplanationFeedback((current) => current ? { ...current, phase: "corner" } : current), 2000);
              explanationFadeTimer.current = setTimeout(() => setExplanationFeedback((current) => current ? { ...current, phase: "leaving" } : current), 9200);
              explanationClearTimer.current = setTimeout(() => setExplanationFeedback(null), 10350);
            }
            if (a?.locked && stillCurrent) setPostAnswerPhase("wait");
          }, 2000);
          feedbackPulseTimer.current = setTimeout(() => setFeedbackPulse(""), 820);
          const effectPromise = feedbackStatus(a) === "wrong" ? soundManager.play("wrong") : soundManager.play("correct");
          void effectPromise;
        }

        if (a.locked && !a.crossword) {
          setSubmitLabel(feedbackStatus(a) === "correct" ? "Submitted ✓" : feedbackStatus(a) === "almost" ? "Partially correct" : "Submitted");
          return;
        }

        if (a.crossword?.remainingWords === 0 && Number(a.crossword?.requiredWords || 0) > 0) {
          setSubmitLabel(a.message || "All words found!");
        } else if (a.isCorrect) {
          const combo = Number(a.crossword?.streak || 0);
          setSubmitLabel(combo >= 2 ? `+${a.points || 0} pts · ${combo}x combo!` : `+${a.points || 0} pts — keep going!`);
        } else {
          setSubmitLabel(crosswordRejectLabel(a.crossword?.reason));
        }
        return;
      }

      // Duplicate/stale-delivery guard: a replayed ack/reveal must neither
      // re-trigger the splash nor lock the current question, and a late
      // payload for a previous question is ignored entirely.
      {
        const splashTt = normalizeTemplateType(stateRef.current?.template_type);
        const splashX = splashTt === "CROSSWORD" || normalizeTemplateType(a.templateType) === "CROSSWORD";
        const currentId = currentQRef.current?.id != null ? Number(currentQRef.current.id) : null;
        const splashQid = a?.questionId != null ? Number(a.questionId) : currentId;
        if (!splashX) {
          if (a?.questionId != null && currentId != null && splashQid !== currentId) return;
          if (splashQid != null) {
            if (splashShownRef.current === splashQid) return;
            splashShownRef.current = splashQid;
          }
        }
      }

      if (a?.locked && currentQRef.current?.id) setSubmittedQId(currentQRef.current.id);

      setFeedbackQ({ ...a, status: feedbackStatus(a) });
      setShowFeedback(true);
      feedbackQidRef.current = currentQRef.current?.id ?? a?.questionId ?? null;
      setFeedbackFxKey((v) => v + 1);
      setFeedbackPulse(feedbackStatus(a));
      feedbackHideTimer.current = setTimeout(() => {
        setShowFeedback(false);
        setFeedbackQ(null);
        // The teacher may have advanced while this verdict was showing -
        // in that case it just fades over the new question: no explanation
        // card and no wait-lock for a question it doesn't belong to.
        const stillCurrent = currentQRef.current?.id != null && feedbackQidRef.current != null
          && Number(feedbackQidRef.current) === Number(currentQRef.current.id);
        const explanation = String(a?.explanation || currentQRef.current?.config_json?.explanation || "").trim();
        if (explanation && stillCurrent) {
          clearTimeout(explanationDockTimer.current);
          clearTimeout(explanationFadeTimer.current);
          clearTimeout(explanationClearTimer.current);
          setExplanationFeedback({ status: feedbackStatus(a), heading: explanationHeading(a), explanation, phase: "center" });
          explanationDockTimer.current = setTimeout(() => setExplanationFeedback((current) => current ? { ...current, phase: "corner" } : current), 2000);
          explanationFadeTimer.current = setTimeout(() => setExplanationFeedback((current) => current ? { ...current, phase: "leaving" } : current), 9200);
          explanationClearTimer.current = setTimeout(() => setExplanationFeedback(null), 10350);
        }
        if (stillCurrent) setPostAnswerPhase("wait");
      }, 2000);
      feedbackPulseTimer.current = setTimeout(() => setFeedbackPulse(""), 820);

      setSubmitLabel(a.viaGroup ? "Group Submitted ✓" : a.isCorrect ? "Submitted ✓" : "Submitted");
      const isLast = currentQRef.current && stateRef.current && Number(stateRef.current.current_question_index || 0) >= Math.max(0, questionCountRef.current - 1);
      const effectPromise = feedbackStatus(a) === "wrong" ? soundManager.play("wrong") : soundManager.play("correct");

      if (isLast) {
        setWaitingForFinalFx(true);
        const feedbackDelay = new Promise((resolve) => setTimeout(resolve, 2000));
        Promise.all([Promise.resolve(effectPromise), feedbackDelay]).finally(() => {
          setWaitingForFinalFx(false);
          setPostAnswerPhase("wait");
        });
      }
    };

    const markAnsweredLocked = (a) => {
      if (a?.locked && currentQRef.current?.id) {
        const answeredId = Number(currentQRef.current.id);
        setSubmittedQId(currentQRef.current.id);
        setAnsweredQuestionIds((current) => {
          const next = new Set(current);
          next.add(answeredId);
          return next;
        });
      }
    };

    s.on("answer:ack", (a) => {
      markAnsweredLocked(a);
      const tt = normalizeTemplateType(stateRef.current?.template_type);
      const isCrossword = tt === "CROSSWORD" || normalizeTemplateType(a.templateType) === "CROSSWORD";
      // Deferred class sessions: the real result arrives via answer:reveal
      // when the question closes. Just park the UI in "locked in".
      if (a?.pending && !isCrossword) {
        setSubmitLabel("Answer locked in ✓");
        setPostAnswerPhase("wait");
        return;
      }
      showAnswerFeedback(a);
    });

    s.on("answer:reveal", (a) => {
      // Stale-reveal guard: a late reveal for a previous question must not
      // mark the current question as answered.
      if (a?.questionId != null && currentQRef.current?.id != null
        && Number(a.questionId) !== Number(currentQRef.current.id)) return;
      // Let the reveal's leaderboard:update apply immediately instead of
      // waiting for the next question change.
      leaderboardAppliedRef.current = false;
      markAnsweredLocked(a);
      showAnswerFeedback(a);
    });

    // Presence heartbeat (deterrent, not proof): hidden tabs throttle
    // timers, so silence itself is the signal the server watches for.
    const presenceTimer = setInterval(() => {
      try {
        s.emit("student:presence", {
          sessionId: Number(sessionId),
          visible: typeof document !== "undefined" ? document.visibilityState === "visible" : true,
          focused: typeof document !== "undefined" ? document.hasFocus() : true,
        });
      } catch {}
    }, 5000);

    return () => {
      clearInterval(presenceTimer);
      clearTimeout(completeTimer.current);
      clearTimeout(feedbackHideTimer.current);
      clearTimeout(feedbackPulseTimer.current);
      clearTimeout(explanationDockTimer.current);
      clearTimeout(explanationFadeTimer.current);
      clearTimeout(explanationClearTimer.current);
      clearTimeout(antiRemovalTimer.current);
      clearTimeout(proposalClearTimer.current);
      soundManager.stopBGM();
      s.disconnect();
    };
  }, [sessionId, reconnectKey, participantId]);
}
