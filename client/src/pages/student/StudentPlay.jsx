/* FILE GUIDE:
 * client/src/pages/student/StudentPlay.jsx
 * Purpose: Main student live-session screen: waiting room, answering, group flow, leaderboard, and reconnect handling.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */


import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import "./StudentPlay.css";
import { useTheme } from "../../context/ThemeContext";
import { normalizeTemplateType } from "../../lib/templateTypes";
import { gameSurfaceColors } from "../../components/TwUI";
import { getSessionBackground } from "../../lib/sessionBackgrounds";
import { AntiCheatModal, ExperienceControls } from "./student-play/experienceChrome";
import { useTabOutTracking } from "./student-play/useTabOutTracking";
import { useStudentSocket } from "./student-play/useStudentSocket";
import { useStudentSound } from "./student-play/useStudentSound";
import { useStudentGameplay } from "./student-play/useStudentGameplay";
import { CountdownView, WaitingRoomView } from "./student-play/rosterViews";
import { FinalLeaderboardView } from "./student-play/finalViews";
import { GameplayView } from "./student-play/gameplayViews";

// StudentPlay covers the entire student journey after joining: waiting room, current question, group flow, and leaderboard.
export default function StudentPlay() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { dark, toggleTheme } = useTheme();

  const [state, setState] = useState(null);
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
  const [, setExperienceBlur] = useState(false);

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

  useEffect(() => { const t = setInterval(() => setNowMs(Date.now()), 200); return () => clearInterval(t); }, []);

  const currentQ = useMemo(() => state ? questions[state.current_question_index || 0] || null : null, [state, questions]);
  useEffect(() => { currentQRef.current = currentQ; }, [currentQ]);
  useEffect(() => { stateRef.current = state; questionCountRef.current = questions.length; }, [state, questions.length]);
  useEffect(() => { submittedRef.current = submittedQId; }, [submittedQId]);
  useEffect(() => { timeoutSubmitRef.current = null; }, [currentQ?.id]);

  const {
    timer, myGroupId, myGroup, isGuestHosted, isGroupMode, isLastQuestion,
    isMatchingIncomplete, ttNormalized, gameplayAccent, interactionLocked, isLocked,
    thinkSpellTimeUp, thinkSpellAllFound, thinkSpellSubmitLabel,
    completedLiveCount, liveQuestionProgress,
  } = useStudentGameplay({
    state, questions, nowMs, clockOffsetMs, currentQ, roster, groups,
    participantId, joinedGroupId, groupNameDraft, selectedChoice, matchingMap, spell,
    submittedQId, submitLabel, answeredQuestionIds, countdown, postAnswerPhase,
    sessionId, socketRef, renameTimer, setCountdown, setGroupNameDraft,
  });

  function buildCurrentAnswer() {
    const tt = normalizeTemplateType(state?.template_type);
    if (tt === "MCQ") return currentQ?.config_json?.answerMode === "TWO"
      ? { choices: Array.isArray(selectedChoice) ? selectedChoice : [selectedChoice].filter(Boolean) }
      : { choice: Array.isArray(selectedChoice) ? selectedChoice[0] : selectedChoice };
    if (tt === "TRUE_FALSE") return { choice: selectedChoice };
    if (tt === "MATCHING") return { pairs: Object.keys(matchingMap).map(k => ({ aIndex: Number(k), bIndex: Number(matchingMap[k]) })).sort((a, b) => a.aIndex - b.aIndex) };
    if (tt === "THINK_SPELL") return { words: Array.isArray(spell.foundEntries) ? spell.foundEntries : [] };
    if (tt === "GUESS_WORD_4PICS") return { text: spell.built || "" };
    return { text: answerText || "" };
  }

  function submit(options = {}) {
    const timeExpired = !!options.timeExpired;
    if (!currentQ || submittedQId === currentQ.id) return;
    if (!timeExpired && isLocked) return;
    const answer = buildCurrentAnswer();
    socketRef.current?.emit("answer:submit", { sessionId: Number(sessionId), participantId, questionId: currentQ.id, answer, timeExpired });
    if (timeExpired) setSubmitLabel("Time's up");
    else if (isGroupMode) setSubmitLabel("Waiting for group vote…");
  }

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
      if (isLocked || groupProposal || state?.status !== "LIVE") return;
      event.preventDefault();
      submit();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isLocked, groupProposal, state?.status, currentQ?.id, selectedChoice, answerText, matchingMap, spell]);

  function voteGroup(vote) {
    if (!groupProposal) return;
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
      <FinalLeaderboardView
        dark={dark} exiting={exiting} experienceBgStyle={experienceBgStyle} gameplayAccent={gameplayAccent}
        experienceControls={experienceControls} antiCheatOverlay={antiCheatOverlay}
        cardBg={cardBg} textC={textC} mutedC={mutedC}
        scores={scores} myGroupId={myGroupId} myGroup={myGroup} isGroupMode={isGroupMode}
        participantId={participantId} onExit={exitTo}
      />
    );
  }

  if (!state || state.status === "LOBBY" || state.status === "PAUSED") {
    return (
      <WaitingRoomView
        dark={dark} waitExperienceBgStyle={waitExperienceBgStyle}
        experienceControls={experienceControls} antiCheatOverlay={antiCheatOverlay} explanationOverlay={explanationOverlay}
        cardBg={cardBg} cardBor={cardBor} textC={textC} mutedC={mutedC}
        state={state} isGroupMode={isGroupMode} myGroup={myGroup} isGuestHosted={isGuestHosted}
        msg={msg} roster={roster} groups={groups} groupNameDraft={groupNameDraft}
        onGroupNameDraft={setGroupNameDraft} participantId={participantId} onJoinGroup={joinGroup}
      />
    );
  }

  if (state?.status === "LIVE" && countdown > 0) {
    return (
      <CountdownView
        experienceBgStyle={experienceBgStyle}
        experienceControls={experienceControls} antiCheatOverlay={antiCheatOverlay} explanationOverlay={explanationOverlay}
        dark={dark} state={state} questions={questions} countdown={countdown}
      />
    );
  }

  if (!currentQ) return null;
  return (
    <GameplayView
      dark={dark} experienceBgStyle={experienceBgStyle} gameplayAccent={gameplayAccent}
      experienceControls={experienceControls} antiCheatOverlay={antiCheatOverlay} explanationOverlay={explanationOverlay}
      liveLeaderboard={liveLeaderboard} participantId={participantId} isGroupMode={isGroupMode}
      showFeedback={showFeedback} feedbackQ={feedbackQ} feedbackFxKey={feedbackFxKey}
      groupProposal={groupProposal} proposalStatus={proposalStatus} onVoteGroup={voteGroup}
      cardBor={cardBor} textC={textC} mutedC={mutedC}
      state={state} questions={questions} timer={timer}
      completedLiveCount={completedLiveCount} liveQuestionProgress={liveQuestionProgress}
      myGroup={myGroup} currentQ={currentQ} thinkSpellTimeUp={thinkSpellTimeUp} ttNormalized={ttNormalized}
      selectedChoice={selectedChoice} onSelectedChoice={setSelectedChoice}
      answerText={answerText} onAnswerText={setAnswerText}
      matchingMap={matchingMap} onMatchingMap={setMatchingMap}
      spell={spell} onSpell={setSpell} onSubmit={submit}
      isLocked={isLocked} interactionLocked={interactionLocked}
      thinkSpellSubmitLabel={thinkSpellSubmitLabel} thinkSpellAllFound={thinkSpellAllFound}
      msg={msg} isMatchingIncomplete={isMatchingIncomplete}
      isLastQuestion={isLastQuestion} submittedQId={submittedQId}
      selectedBackground={selectedBackground} feedbackPulse={feedbackPulse}
    />
  );
}
