import { useEffect } from "react";
import { makeSocket } from "../../../lib/socket";
import { normalizeTemplateType } from "../../../lib/templateTypes";
import { getRole } from "../../../lib/auth";
import soundManager from "../../../utils/soundmanager";
import { explanationHeading, feedbackStatus, thinkSpellRejectLabel } from "./studentPlayUtils";

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
  useEffect(() => {
    const s = makeSocket();
    socketRef.current = s;
    s.on("connect", () => s.emit("student:connect", { sessionId: Number(sessionId), reconnectKey }));
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
      setState((prev) => {
        const prevIdx = prev?.current_question_index;
        const newIdx = payload.state?.current_question_index;
        if (prevIdx !== undefined && prevIdx !== newIdx) {
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
        return payload.state;
      });
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
        const rejectedThinkSpell = normalizeTemplateType(stateRef.current?.template_type) === "THINK_SPELL";
        setProposalStatus(payload?.message || (rejectedThinkSpell
          ? "Your group rejected that word. Try another one."
          : "Your group rejected that answer."));
        setSubmittedQId(null);
        setSubmitLabel(rejectedThinkSpell ? "Submit Word" : "Submit");
      }
      setTimeout(() => {
        setGroupProposal(null);
        setProposalStatus("");
      }, 1400);
    });
    s.on("answer:ack", (a) => {
      const tt = normalizeTemplateType(stateRef.current?.template_type);
      const isThinkSpell = tt === "THINK_SPELL" || normalizeTemplateType(a.templateType) === "THINK_SPELL";

      if (a?.locked && currentQRef.current?.id) {
        const answeredId = Number(currentQRef.current.id);
        setSubmittedQId(currentQRef.current.id);
        setAnsweredQuestionIds((current) => {
          const next = new Set(current);
          next.add(answeredId);
          return next;
        });
      }

      if (a.message && !isThinkSpell) {
        setSubmitLabel(a.message);
        return;
      }

      clearTimeout(feedbackHideTimer.current);
      clearTimeout(feedbackPulseTimer.current);
      clearTimeout(antiRemovalTimer.current);

      if (isThinkSpell) {
        if (a.thinkSpell) {
          setSpell((s) => ({
            ...s,
            foundWords: Array.isArray(a.thinkSpell.words) ? a.thinkSpell.words : s.foundWords || [],
            totalPoints: Number(a.thinkSpell.totalPoints ?? s.totalPoints ?? 0),
            streak: Number(a.thinkSpell.streak ?? 0),
            grid: Array.isArray(a.thinkSpell.grid) ? a.thinkSpell.grid : s.grid,
            gridSize: Number(a.thinkSpell.gridSize ?? s.gridSize) || s.gridSize,
            refillCounter: Number(a.thinkSpell.refillCounter ?? s.refillCounter ?? 0),
            refillTick: a.isCorrect ? (s.refillTick || 0) + 1 : s.refillTick,
            selected: [],
            built: "",
            lastReason: a.thinkSpell.reason || null,
          }));
        } else {
          setSpell((s) => ({ ...s, selected: [], built: "", streak: 0 }));
        }

        if (a.isCorrect !== null && a.isCorrect !== undefined) {
          setFeedbackQ({ ...a, status: feedbackStatus(a) });
          setShowFeedback(true);
          setFeedbackFxKey((v) => v + 1);
          setFeedbackPulse(feedbackStatus(a));
          feedbackHideTimer.current = setTimeout(() => {
            setShowFeedback(false);
            setFeedbackQ(null);
            const explanation = a?.locked ? String(a?.explanation || currentQRef.current?.config_json?.explanation || "").trim() : "";
            if (explanation) {
              clearTimeout(explanationDockTimer.current);
              clearTimeout(explanationFadeTimer.current);
              clearTimeout(explanationClearTimer.current);
              setExplanationFeedback({ status: feedbackStatus(a), heading: explanationHeading(a), explanation, phase: "center" });
              explanationDockTimer.current = setTimeout(() => setExplanationFeedback((current) => current ? { ...current, phase: "corner" } : current), 2000);
              explanationFadeTimer.current = setTimeout(() => setExplanationFeedback((current) => current ? { ...current, phase: "leaving" } : current), 9200);
              explanationClearTimer.current = setTimeout(() => setExplanationFeedback(null), 10350);
            }
            if (a?.locked) setPostAnswerPhase("wait");
          }, 1750);
          feedbackPulseTimer.current = setTimeout(() => setFeedbackPulse(""), 820);
          const effectPromise = feedbackStatus(a) === "correct" ? soundManager.play("correct") : soundManager.play("wrong");
          void effectPromise;
        }

        if (a.locked && !a.thinkSpell) {
          setSubmitLabel(feedbackStatus(a) === "correct" ? "Submitted ✓" : feedbackStatus(a) === "almost" ? "Partially correct" : "Submitted");
          return;
        }

        if (a.thinkSpell?.remainingWords === 0 && Number(a.thinkSpell?.requiredWords || 0) > 0) {
          setSubmitLabel(a.message || "All words found!");
        } else if (a.isCorrect) {
          const combo = Number(a.thinkSpell?.streak || 0);
          setSubmitLabel(combo >= 2 ? `+${a.points || 0} pts · ${combo}x combo!` : `+${a.points || 0} pts — keep going!`);
        } else {
          setSubmitLabel(thinkSpellRejectLabel(a.thinkSpell?.reason));
        }
        return;
      }

      if (a?.locked && currentQRef.current?.id) setSubmittedQId(currentQRef.current.id);

      setFeedbackQ({ ...a, status: feedbackStatus(a) });
      setShowFeedback(true);
      setFeedbackFxKey((v) => v + 1);
      setFeedbackPulse(feedbackStatus(a));
      feedbackHideTimer.current = setTimeout(() => {
        setShowFeedback(false);
        setFeedbackQ(null);
        const explanation = String(a?.explanation || currentQRef.current?.config_json?.explanation || "").trim();
        if (explanation) {
          clearTimeout(explanationDockTimer.current);
          clearTimeout(explanationFadeTimer.current);
          clearTimeout(explanationClearTimer.current);
          setExplanationFeedback({ status: feedbackStatus(a), heading: explanationHeading(a), explanation, phase: "center" });
          explanationDockTimer.current = setTimeout(() => setExplanationFeedback((current) => current ? { ...current, phase: "corner" } : current), 2000);
          explanationFadeTimer.current = setTimeout(() => setExplanationFeedback((current) => current ? { ...current, phase: "leaving" } : current), 9200);
          explanationClearTimer.current = setTimeout(() => setExplanationFeedback(null), 10350);
        }
        setPostAnswerPhase("wait");
      }, 1750);
      feedbackPulseTimer.current = setTimeout(() => setFeedbackPulse(""), 820);

      setSubmitLabel(a.viaGroup ? "Group Submitted ✓" : a.isCorrect ? "Submitted ✓" : "Submitted");
      const isLast = currentQRef.current && stateRef.current && Number(stateRef.current.current_question_index || 0) >= Math.max(0, questionCountRef.current - 1);
      const effectPromise = feedbackStatus(a) === "correct" ? soundManager.play("correct") : soundManager.play("wrong");

      if (isLast) {
        setWaitingForFinalFx(true);
        const feedbackDelay = new Promise((resolve) => setTimeout(resolve, 1750));
        Promise.all([Promise.resolve(effectPromise), feedbackDelay]).finally(() => {
          setWaitingForFinalFx(false);
          setPostAnswerPhase("wait");
        });
      }
    });

    return () => {
      clearTimeout(completeTimer.current);
      clearTimeout(feedbackHideTimer.current);
      clearTimeout(feedbackPulseTimer.current);
      clearTimeout(explanationDockTimer.current);
      clearTimeout(explanationFadeTimer.current);
      clearTimeout(explanationClearTimer.current);
      soundManager.stopBGM();
      s.disconnect();
    };
  }, [sessionId, reconnectKey, participantId]);
}
