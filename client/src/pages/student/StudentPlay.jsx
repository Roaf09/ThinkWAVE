/* FILE GUIDE:
 * client/src/pages/student/StudentPlay.jsx
 * Purpose: Main student live-session screen: waiting room, answering, group flow, leaderboard, and reconnect handling.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */


import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import "./StudentPlay.css";
import { useTheme } from "../../context/ThemeContext";
import { normalizeTemplateType } from "../../lib/templateTypes";
import { gameSurfaceColors } from "../../components/TwUI";
import { getSessionBackground } from "../../lib/sessionBackgrounds";
import { AntiCheatModal, ExperienceControls } from "./student-play/experienceChrome";
import { useTabOutTracking } from "./student-play/useTabOutTracking";
import { useGameplayProtection } from "./student-play/useGameplayProtection";
import { AnswerWaitOverlay } from "./student-play/AnswerWaitOverlay";
import { TwoAnswerNoticeOverlay } from "./student-play/TwoAnswerNoticeOverlay";
import { CaptureWatermark, FullscreenGate } from "./student-play/CaptureWatermark";
import { useStudentSocket } from "./student-play/useStudentSocket";
import { useStudentSound } from "./student-play/useStudentSound";
import { useStudentGameplay } from "./student-play/useStudentGameplay";
import { CountdownView, WaitingRoomView } from "./student-play/rosterViews";
import { FinalLeaderboardView } from "./student-play/finalViews";
import { GameplayView, FeedbackOverlay } from "./student-play/gameplayViews";

// StudentPlay covers the entire student journey after joining: waiting room, current question, group flow, and leaderboard.
export default function StudentPlay() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { dark, toggleTheme } = useTheme();

  const [state, setState] = useState(null);
  // Pre-start "2 answers" notice: shown once when the live session starts, then dismissed.
  const [twoNoticeSeen, setTwoNoticeSeen] = useState(false);
  const dismissTwoNotice = useCallback(() => setTwoNoticeSeen(true), []);
  // Shown once when the host starts the live session (first question), before the 3-2-1 countdown.
  const showTwoNotice = state?.status === "LIVE" && !!state?.has_two_answer_questions && Number(state?.current_question_index || 0) === 0 && !twoNoticeSeen;
  const [questions, setQuestions] = useState([]);
  const [scores, setScores] = useState([]);
  const [liveLeaderboard, setLiveLeaderboard] = useState({ top5: [], myRank: 0, myScore: null });
  const [roster, setRoster] = useState([]);
  const [groups, setGroups] = useState([]);
  const [msg, setMsg] = useState("");

  const [answerText, setAnswerText] = useState("");
  const [selectedChoice, setSelectedChoice] = useState("");
  const [matchingMap, setMatchingMap] = useState({});
  const [spell, setSpell] = useState({ built: "", bank: [] });
  const [submittedQId, setSubmittedQId] = useState(null);
  const [answeredQuestionIds, setAnsweredQuestionIds] = useState(() => new Set());
  const [submitLabel, setSubmitLabel] = useState("Submit");
  const [feedbackQ, setFeedbackQ] = useState(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [explanationFeedback, setExplanationFeedback] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const [groupProposal, setGroupProposal] = useState(null);
  const [proposalStatus, setProposalStatus] = useState("");
  const [joinedGroupId, setJoinedGroupId] = useState(null);
  const [groupNameDraft, setGroupNameDraft] = useState("");
  const [postAnswerPhase, setPostAnswerPhase] = useState(null);
  const [exiting, setExiting] = useState(false);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [waitingForFinalFx, setWaitingForFinalFx] = useState(false);
  const [feedbackPulse, setFeedbackPulse] = useState("");
  const [feedbackFxKey, setFeedbackFxKey] = useState(0);
  const [antiCheat, setAntiCheat] = useState(null);
  const [antiCountdown, setAntiCountdown] = useState(0);
  const [experienceBlur, setExperienceBlur] = useState(false);
  const socketRef = useRef(null);
  const currentQRef = useRef(null);
  const renameTimer = useRef(null);
  const completeTimer = useRef(null);
  const feedbackHideTimer = useRef(null);
  const feedbackPulseTimer = useRef(null);
  const explanationDockTimer = useRef(null);
  const explanationFadeTimer = useRef(null);
  const explanationClearTimer = useRef(null);
  const antiRemovalTimer = useRef(null);
  const submittedRef = useRef(null);
  const timeoutSubmitRef = useRef(null);
  const pendingLeaderboardRef = useRef(null);
  const leaderboardAppliedRef = useRef(false);
  const stateRef = useRef(null);
  const questionCountRef = useRef(0);
  const participantId = Number(localStorage.getItem("qz_participantId") || "0");
  const reconnectKey = localStorage.getItem("qz_reconnectKey") || "";
  // Visual away-blur + screenshot / screen-record deterrents for the whole
  // session. Screenshot attempts are tallied server-side for the host panel
  // (silently — the student sees no warning, only the screen blank flash).
  // Fullscreen is enforced only while LIVE so lobby/waiting stay frictionless.
  const isLivePlaying = state?.status === "LIVE";
  const guard = useGameplayProtection({
    active: true,
    requireFullscreen: isLivePlaying,
    // Screenshots are only detected/counted once the quiz is LIVE - not in the
    // waiting lobby or while paused.
    captureActive: isLivePlaying,
    onCaptureAttempt: () => socketRef.current?.emit("student:screenshot", { sessionId: Number(sessionId) }),
  });
  const blockedByFs = guard.needsFullscreen;
  // Personal trace burned into any screenshot/record. Shown to the student
  // only (never host) — teacher sees the tally instead.
  const myRow = roster.find((r) => Number(r.id) === Number(participantId));
  const myName = `${myRow?.first_name || ""} ${myRow?.last_name || ""}`.trim();
  const watermarkText = isLivePlaying
    ? `${myName || `P${Number(participantId) || "?"}`} • S${Number(sessionId) || "?"}`
    : "";

  const { pageBg, cardBg, cardBor, textC, mutedC } = gameSurfaceColors(dark);
  const selectedBackground = getSessionBackground(state?.background_key);
  const experienceBgStyle = selectedBackground
    ? {
        backgroundImage: `url("${selectedBackground.src}")`,
        backgroundColor: pageBg,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
      }
    : { background: pageBg };
  const waitExperienceBgStyle = selectedBackground
    ? {
        ...experienceBgStyle,
        backgroundImage: `linear-gradient(${dark ? "rgba(3,10,28,.46)" : "rgba(255,255,255,.16)"}, ${dark ? "rgba(3,10,28,.46)" : "rgba(255,255,255,.16)"}), url("${selectedBackground.src}")`,
        backgroundBlendMode: "normal",
      }
    : experienceBgStyle;
  const currentSoundMode = state?.status === "LIVE"
    ? "playing"
    : (!state?.status || state?.status === "LOBBY" || state?.status === "PAUSED")
      ? "lobby"
      : null;

  const { isMuted, handleToggleMute } = useStudentSound({ currentSoundMode });

  useTabOutTracking({ sessionId, participantId, socketRef, stateRef, questionCountRef, currentQRef, submittedRef, setExperienceBlur });

  useStudentSocket({
    sessionId, reconnectKey, participantId, navigate,
    socketRef, currentQRef, stateRef, questionCountRef,
    timeoutSubmitRef, pendingLeaderboardRef, leaderboardAppliedRef,
    completeTimer, feedbackHideTimer, feedbackPulseTimer,
    explanationDockTimer, explanationFadeTimer, explanationClearTimer, antiRemovalTimer,
    setSubmittedQId, setAnsweredQuestionIds, setMsg, setAntiCheat, setAntiCountdown,
    setState, setQuestions, setClockOffsetMs, setScores, setLiveLeaderboard,
    setRoster, setGroups, setJoinedGroupId, setGroupNameDraft, setGroupProposal,
    setProposalStatus, setSpell, setSubmitLabel, setPostAnswerPhase,
    setAnswerText, setSelectedChoice, setMatchingMap,
    setFeedbackQ, setShowFeedback, setFeedbackFxKey, setFeedbackPulse,
    setExplanationFeedback, setWaitingForFinalFx,
  });

  useEffect(() => {
    if (!antiCheat || antiCountdown <= 0) return;
    const t=setTimeout(()=>setAntiCountdown(v=>Math.max(0,v-1)),1000);
    return ()=>clearTimeout(t);
  },[antiCheat,antiCountdown]);

  useEffect(() => { const t = setInterval(() => setNowMs(Date.now()), 1000); return () => clearInterval(t); }, []);

  const currentQ = useMemo(() => state ? questions[state.current_question_index || 0] || null : null, [state, questions]);
  useEffect(() => { currentQRef.current = currentQ; }, [currentQ]);
  useEffect(() => { stateRef.current = state; questionCountRef.current = questions.length; }, [state, questions.length]);
  useEffect(() => { submittedRef.current = submittedQId; }, [submittedQId]);
  useEffect(() => { timeoutSubmitRef.current = null; }, [currentQ?.id]);
  // Local per-question reset, independent of the socket: the session:state
  // handler resets inside a setState updater (unreliable side-effect), so a
  // missed/coalesced state push left postAnswerPhase stuck at "wait" and
  // every later question rendered unanswerable. answeredQuestionIds stays
  // cumulative for progress.
  useEffect(() => {
    setPostAnswerPhase(null);
    setSubmittedQId((cur) => (cur != null && currentQ?.id != null && Number(cur) === Number(currentQ.id) ? cur : null));
    // Same stale-timer kill as the socket advance path: Q-previous
    // explanation timers must die with the question, or they leak the old
    // question's card over the new one. The verdict splash itself is left
    // alone so it can finish over the next question's countdown; its hide
    // timer's side effects are guarded to its own question.
    clearTimeout(feedbackPulseTimer.current);
    clearTimeout(explanationDockTimer.current);
    clearTimeout(explanationFadeTimer.current);
    clearTimeout(explanationClearTimer.current);
    setExplanationFeedback(null);
    setFeedbackPulse("");
    setAnswerText("");
    setSelectedChoice("");
    setMatchingMap({});
    setSpell({ built: "", bank: [] });
    setSubmitLabel("Submit");
    setProposalStatus("");
    setGroupProposal(null);
  }, [currentQ?.id]);

  const {
    timer, myGroupId, myGroup, isGuestHosted, isGroupMode, isLastQuestion,
    isMatchingIncomplete, ttNormalized, gameplayAccent, interactionLocked, isLocked,
    crosswordTimeUp, crosswordAllFound, crosswordSubmitLabel,
    completedLiveCount, liveQuestionProgress,
  } = useStudentGameplay({
    state, questions, nowMs, clockOffsetMs, currentQ, roster, groups,
    participantId, joinedGroupId, groupNameDraft, selectedChoice, matchingMap, spell,
    submittedQId, submitLabel, answeredQuestionIds, countdown, showFeedback, postAnswerPhase,
    sessionId, socketRef, renameTimer, setCountdown, setGroupNameDraft,
    holdCountdown: showTwoNotice,
  });

  function buildCurrentAnswer() {
    const tt = normalizeTemplateType(state?.template_type);
    if (tt === "MCQ") return currentQ?.config_json?.answerMode === "TWO"
      ? { choices: Array.isArray(selectedChoice) ? selectedChoice : [selectedChoice].filter(Boolean) }
      : { choice: Array.isArray(selectedChoice) ? selectedChoice[0] : selectedChoice };
    if (tt === "TRUE_FALSE") return { choice: selectedChoice };
    if (tt === "MATCHING") return { pairs: Object.keys(matchingMap).map(k => ({ aIndex: Number(k), bIndex: Number(matchingMap[k]) })).sort((a, b) => a.aIndex - b.aIndex) };
    if (tt === "CROSSWORD") return { words: Array.isArray(spell.foundEntries) ? spell.foundEntries : [] };
    if (tt === "GUESS_WORD_4PICS") return { text: spell.built || "" };
    return { text: answerText || "" };
  }

  // Steady submit handler: without this the game board below would redraw on
  // every one-second timer tick. The board only needs to redraw when answers
  // or locks actually change, so the tick only moves the timer text.
  // Fullscreen gate blocks manual answers (keyboard + clicks via disabled
  // inputs) while letting time-expired auto-submit through so timers heal.
  const submit = useCallback(function submit(options = {}) {
    const timeExpired = !!options.timeExpired;
    if (!timeExpired && blockedByFs) return;
    if (!currentQ || submittedQId === currentQ.id) return;
    if (!timeExpired && isLocked) return;
    const answer = buildCurrentAnswer();
    socketRef.current?.emit("answer:submit", { sessionId: Number(sessionId), participantId, questionId: currentQ.id, answer, timeExpired });
    if (timeExpired) setSubmitLabel("Time's up");
    else if (isGroupMode) setSubmitLabel("Waiting for group vote…");
  }, [currentQ, submittedQId, isLocked, blockedByFs, state, selectedChoice, answerText, matchingMap, spell, participantId, sessionId, isGroupMode]);

  useEffect(() => {
    if (!currentQ || state?.status !== "LIVE" || countdown > 0 || timer.remainingSec !== 0) return;
    if (submittedQId === currentQ.id || timeoutSubmitRef.current === currentQ.id) return;
    timeoutSubmitRef.current = currentQ.id;
    submit({ timeExpired: true });
  }, [currentQ?.id, state?.status, countdown, timer.remainingSec, submittedQId, selectedChoice, answerText, matchingMap, spell]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== "Enter" || event.repeat || event.isComposing) return;
      if (event.target?.tagName === "TEXTAREA") return;
      if (blockedByFs || isLocked || groupProposal || state?.status !== "LIVE") return;
      event.preventDefault();
      submit();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [blockedByFs, isLocked, groupProposal, state?.status, currentQ?.id, selectedChoice, answerText, matchingMap, spell]);

  function voteGroup(vote) {
    if (!groupProposal || blockedByFs) return;
    socketRef.current?.emit("student:voteGroupAnswer", { sessionId: Number(sessionId), participantId, proposalId: groupProposal.id, vote });
    setProposalStatus(`You voted ${vote.toLowerCase()}. Waiting for the rest of your group…`);
  }

  function joinGroup(groupId) {
    socketRef.current?.emit("student:joinGroup", { sessionId: Number(sessionId), participantId, groupId });
  }

  function exitTo(path) {
    // Guest live gameplay must always land back on the public landing page
    // with no stale session keys left behind.
    if (path === "/") {
      try {
        localStorage.removeItem("qz_reconnectKey");
        localStorage.removeItem("qz_participantId");
        localStorage.removeItem("qz_sessionId");
        localStorage.removeItem("qz_joinMode");
      } catch { /* ignore */ }
    }
    setExiting(true);
    setTimeout(() => navigate(path), 260);
  }

  const experienceControls=<ExperienceControls dark={dark} muted={isMuted} onMute={handleToggleMute} onTheme={toggleTheme}/>;
  const antiCheatOverlay=<AntiCheatModal antiCheat={antiCheat} countdown={antiCountdown} onConfirm={()=>{setAntiCheat(null);setAntiCountdown(0)}}/>;
  // Blur layer for tab-switch (mirrors assignments) and capture attempts.
  // Pointer events stay off so the anti-cheat confirm dialog above it (z 500)
  // remains clickable; this only hides the game, it never locks input.
  // Fullscreen gate is separate (z 460, clickable button) and also disables
  // inputs via interactionLocked so typing/clicking requires fullscreen.
  const awayBlocked = experienceBlur || guard.awayBlur || blockedByFs;
  const guardOverlay = (awayBlocked || guard.shotBlocked) && (
    <div style={{ position: "fixed", inset: 0, zIndex: 400, display: "grid", placeItems: "center", padding: 20, pointerEvents: "none", background: dark ? "rgba(3,10,28,.35)" : "rgba(255,255,255,.25)", backdropFilter: guard.shotBlocked ? "blur(22px)" : "blur(12px)", WebkitBackdropFilter: guard.shotBlocked ? "blur(22px)" : "blur(12px)" }}>
      <span style={{ padding: "10px 18px", borderRadius: 999, background: dark ? "rgba(8,22,50,.9)" : "rgba(255,255,255,.92)", color: dark ? "#e7e9ee" : "#0f172a", fontSize: 13, fontWeight: 800, boxShadow: "0 10px 26px rgba(0,0,0,.22)" }}>
        {guard.shotBlocked ? "Screenshots and screen recording are not allowed." : blockedByFs ? "Enter fullscreen to continue answering." : "You've left the quiz — return to continue."}
      </span>
    </div>
  );
  const watermarkOverlay = <CaptureWatermark active={isLivePlaying} text={watermarkText} />;
  // Once this participant's answer is locked, cover the question with the
  // lobby-style "Answer Submitted!" -> "Waiting for other participants..."
  // card over a blurred screen, until the next question. A participant who
  // simply ran out of time ("Time's up") did not submit, so they don't get it.
  const answerLocked = isLivePlaying && !!currentQ && submittedQId != null
    && Number(submittedQId) === Number(currentQ.id) && submitLabel !== "Time's up";
  const answerWaitOverlay = answerLocked
    ? <AnswerWaitOverlay key={currentQ.id} dark={dark} cardBg={cardBg} cardBor={cardBor} textC={textC} mutedC={mutedC} />
    : null;
  const fullscreenOverlay = <FullscreenGate needsFullscreen={blockedByFs} onEnter={guard.enterFullscreen} dark={dark} />;
  const lockedByFs = blockedByFs;
  const explanationOverlay = explanationFeedback ? <div
    className={`sp-explanation-feedback is-${explanationFeedback.status} is-${explanationFeedback.phase}${postAnswerPhase ? " is-post-answer" : ""}`}
    onTransitionEnd={(event) => {
      if (event.propertyName !== "opacity" || explanationFeedback?.phase !== "leaving") return;
      clearTimeout(explanationClearTimer.current);
      setExplanationFeedback(null);
    }}
  >
    <div className="sp-explanation-heading">{explanationFeedback.heading}</div>
    <div className="sp-explanation-copy">{explanationFeedback.explanation}</div>
  </div> : null;

  if (state?.status === "ENDED" && !waitingForFinalFx && !showFeedback) {
    return (
      <>
      <FinalLeaderboardView
        dark={dark} exiting={exiting} experienceBgStyle={experienceBgStyle} gameplayAccent={gameplayAccent}
        experienceControls={experienceControls} antiCheatOverlay={antiCheatOverlay}
        cardBg={cardBg} textC={textC} mutedC={mutedC}
        scores={scores} myGroupId={myGroupId} myGroup={myGroup} isGroupMode={isGroupMode}
        participantId={participantId} onExit={exitTo}
      />
      {guardOverlay}
      </>
    );
  }

  if (!state || state.status === "LOBBY" || state.status === "PAUSED") {
    return (
      <>
      <WaitingRoomView
        dark={dark} waitExperienceBgStyle={waitExperienceBgStyle}
        experienceControls={experienceControls} antiCheatOverlay={antiCheatOverlay} explanationOverlay={explanationOverlay}
        cardBg={cardBg} cardBor={cardBor} textC={textC} mutedC={mutedC}
        state={state} isGroupMode={isGroupMode} myGroup={myGroup} isGuestHosted={isGuestHosted}
        msg={msg} roster={roster} groups={groups} groupNameDraft={groupNameDraft}
        onGroupNameDraft={setGroupNameDraft} participantId={participantId} onJoinGroup={joinGroup}
      />
      {guardOverlay}
      </>
    );
  }

  if (state?.status === "LIVE" && countdown > 0) {
    return (
      <>
      <CountdownView
        experienceBgStyle={experienceBgStyle}
        experienceControls={experienceControls} antiCheatOverlay={antiCheatOverlay} explanationOverlay={explanationOverlay}
        feedbackOverlay={<FeedbackOverlay showFeedback={showFeedback} feedbackQ={feedbackQ} feedbackFxKey={feedbackFxKey} />}
        dark={dark} state={state} questions={questions} countdown={countdown}
      />
      {showTwoNotice && (
        <TwoAnswerNoticeOverlay dark={dark} cardBg={cardBg} cardBor={cardBor} textC={textC} mutedC={mutedC} onDone={dismissTwoNotice} />
      )}
      {guardOverlay}
      {watermarkOverlay}
      {fullscreenOverlay}
      </>
    );
  }

  if (!currentQ) {
    // LIVE with no question = empty snapshot or bad index. Never blank screen.
    if (state?.status === "LIVE") {
      return (
        <div className="grid min-h-[100vh] place-items-center" style={{ background: pageBg, color: textC }}>
          <div style={{ textAlign: "center", display: "grid", gap: 12, justifyItems: "center", padding: 24 }}>
            <div style={{ fontWeight: 900 }}>No question available for this session.</div>
            <div style={{ color: mutedC, fontSize: 13 }}>{msg || "The quiz has no questions or failed to load. Please wait or rejoin."}</div>
            <button type="button" onClick={() => window.location.reload()} style={{ padding: "10px 18px", borderRadius: 10, border: `1px solid ${cardBor}`, background: cardBg, color: textC, fontWeight: 800, cursor: "pointer" }}>Retry</button>
          </div>
          {guardOverlay}
        </div>
      );
    }
    return null;
  }
  return (
    <>
    <GameplayView
      dark={dark} experienceBgStyle={experienceBgStyle} gameplayAccent={gameplayAccent}
      experienceControls={experienceControls} antiCheatOverlay={antiCheatOverlay} explanationOverlay={explanationOverlay}
      liveLeaderboard={liveLeaderboard} participantId={participantId} isGroupMode={isGroupMode}
      showFeedback={showFeedback} feedbackQ={feedbackQ} feedbackFxKey={feedbackFxKey}
      groupProposal={groupProposal} proposalStatus={proposalStatus} onVoteGroup={voteGroup}
      cardBor={cardBor} textC={textC} mutedC={mutedC}
      state={state} questions={questions} timer={timer}
      completedLiveCount={completedLiveCount} liveQuestionProgress={liveQuestionProgress}
      myGroup={myGroup} currentQ={currentQ} crosswordTimeUp={crosswordTimeUp} ttNormalized={ttNormalized}
      selectedChoice={selectedChoice} onSelectedChoice={setSelectedChoice}
      answerText={answerText} onAnswerText={setAnswerText}
      matchingMap={matchingMap} onMatchingMap={setMatchingMap}
      spell={spell} onSpell={setSpell} onSubmit={submit}
      isLocked={isLocked} interactionLocked={interactionLocked || lockedByFs}
      crosswordSubmitLabel={crosswordSubmitLabel} crosswordAllFound={crosswordAllFound}
      msg={blockedByFs ? "Enter fullscreen to continue answering." : msg} isMatchingIncomplete={isMatchingIncomplete}
      isLastQuestion={isLastQuestion} submittedQId={submittedQId}
      selectedBackground={selectedBackground} feedbackPulse={feedbackPulse}
    />
    {answerWaitOverlay}
    {guardOverlay}
    {watermarkOverlay}
    {fullscreenOverlay}
    </>
  );
}
