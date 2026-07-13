/* FILE GUIDE:
 * client/src/pages/student/StudentPlay.jsx
 * Purpose: Main student live-session screen: waiting room, answering, group flow, leaderboard, and reconnect handling.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */


import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { makeSocket } from "../../lib/socket";
import "./StudentPlay.css";
import soundManager from "../../utils/soundmanager";
import { useTheme } from "../../context/ThemeContext";
import { API_BASE } from "../../lib/api";
import { normalizeTemplateType } from "../../lib/templateTypes";
import { buildLetterBank, countAnswerLetters } from "../../lib/letterBank";
import {
  buildThinkSpellSignature,
  getPathLinePoints,
  isAdjacentSelection,
  isStraightLinePath,
  isThinkSpellRoundComplete,
  loadThinkSpellGridState,
  matchThinkSpellWord,
  normalizeThinkWordKey,
  resolveThinkSpellWordBank,
  validatePathSpellsWord,
} from "../../lib/thinkSpell";

const WAIT_CARD_COLORS = [
  { bg: "#dbeafe", border: "#93c5fd", text: "#1e3a8a" },
  { bg: "#dcfce7", border: "#86efac", text: "#166534" },
  { bg: "#fef3c7", border: "#fcd34d", text: "#92400e" },
  { bg: "#fee2e2", border: "#fca5a5", text: "#b91c1c" },
  { bg: "#ede9fe", border: "#c4b5fd", text: "#6d28d9" },
  { bg: "#cffafe", border: "#67e8f9", text: "#0f766e" },
  { bg: "#fce7f3", border: "#f9a8d4", text: "#be185d" },
  { bg: "#ffedd5", border: "#fdba74", text: "#c2410c" },
];

function hashToIndex(value, length) {
  const s = String(value ?? "");
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return length ? h % length : 0;
}

function rosterTone(seed, dark) {
  const tone = WAIT_CARD_COLORS[hashToIndex(seed, WAIT_CARD_COLORS.length)];
  if (!dark) return tone;
  return {
    bg: `${tone.text}22`,
    border: `${tone.border}88`,
    text: "#e7e9ee",
  };
}

function LoadingDots({ color = "currentColor" }) {
  return (
    <span className="tw-loading-dots" aria-hidden="true" style={{ color }}>
      <span>.</span><span>.</span><span>.</span>
    </span>
  );
}

function ThemeTogglePill({ dark, onClick, style, className = "" }) {
  return (
    <button
      className={`sp-inline-theme-toggle ${className}`.trim()}
      onClick={onClick}
      type="button"
      style={{
        padding: "7px 14px",
        borderRadius: 20,
        fontSize: 13,
        fontWeight: 700,
        color: dark ? "#bfd0ff" : "#5a6a9a",
        border: dark ? "1px solid rgba(191,208,255,0.18)" : "1px solid rgba(43,108,255,0.16)",
        background: dark ? "rgba(255,255,255,0.04)" : "transparent",
        cursor: "pointer",
        transition: "background 0.25s, color 0.25s, border-color 0.25s, transform 0.18s",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        whiteSpace: "nowrap",
        ...(style || {}),
      }}
    >
      <span style={{ fontSize: 14 }}>{dark ? "☀️" : "🌙"}</span>
      <span>{dark ? "Light" : "Dark"}</span>
    </button>
  );
}

function SoundTogglePill({ muted, onClick, style, className = "" }) {
  return (
    <button
      className={`sp-inline-sound-toggle ${className}`.trim()}
      onClick={onClick}
      type="button"
      style={{
        padding: "7px 14px",
        borderRadius: 20,
        fontSize: 13,
        fontWeight: 800,
        color: muted ? "#ffd4d4" : "#d8ffe8",
        border: muted ? "1px solid rgba(255,120,120,0.28)" : "1px solid rgba(120,255,180,0.24)",
        background: muted ? "rgba(127, 29, 29, 0.26)" : "rgba(18, 96, 63, 0.22)",
        cursor: "pointer",
        transition: "background 0.25s, color 0.25s, border-color 0.25s, transform 0.18s",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        whiteSpace: "nowrap",
        ...(style || {}),
      }}
      title={muted ? "Unmute sounds" : "Mute sounds"}
      aria-label={muted ? "Unmute sounds" : "Mute sounds"}
    >
      <span style={{ fontSize: 14 }}>{muted ? "🔇" : "🔊"}</span>
      <span>{muted ? "Muted" : "Sound"}</span>
    </button>
  );
}

function WaitRosterCard({ item, dark, subtitle }) {
  const tone = rosterTone(item.id || `${item.first_name}-${item.last_name}`, dark);
  return (
    <div className="sp-wait-roster-card" style={{ background: tone.bg, borderColor: tone.border }}>
      <div style={{ color: tone.text, fontWeight: 900 }}>{item.first_name} {item.last_name}</div>
      <div style={{ color: dark ? "#bfd0ff" : "#52648f", fontSize: 12 }}>{subtitle}</div>
    </div>
  );
}

function TitleWithTheme({ title, dark, onToggle, color, dotsColor, style, titleStyle }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap", ...style }}>
      <h3 className="sp-wait-title" style={{ color, margin: 0, ...(titleStyle || {}) }}>{title}<LoadingDots color={dotsColor} /></h3>
      <ThemeTogglePill dark={dark} onClick={onToggle} />
    </div>
  );
}

function questionExplanation(q) {
  return String(q?.config_json?.explanation || "").trim();
}

function questionDifficulty(q) {
  const value = String(q?.config_json?.difficulty || "").trim().toLowerCase();
  return ["easy", "medium", "hard"].includes(value) ? value : "";
}

// StudentPlay covers the entire student journey after joining: waiting room, current question, group flow, and leaderboard.
export default function StudentPlay() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { dark, toggleTheme } = useTheme();

  const [state, setState] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [scores, setScores] = useState([]);
  const [roster, setRoster] = useState([]);
  const [groups, setGroups] = useState([]);
  const [msg, setMsg] = useState("");

  const [answerText, setAnswerText] = useState("");
  const [selectedChoice, setSelectedChoice] = useState("");
  const [matchingMap, setMatchingMap] = useState({});
  const [spell, setSpell] = useState({ built: "", bank: [] });
  const [submittedQId, setSubmittedQId] = useState(null);
  const [submitLabel, setSubmitLabel] = useState("Submit");
  const [feedbackQ, setFeedbackQ] = useState(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const [groupProposal, setGroupProposal] = useState(null);
  const [proposalStatus, setProposalStatus] = useState("");
  const [joinedGroupId, setJoinedGroupId] = useState(null);
  const [groupNameDraft, setGroupNameDraft] = useState("");
  const [postAnswerPhase, setPostAnswerPhase] = useState(null);
  const [exiting, setExiting] = useState(false);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [isMuted, setIsMuted] = useState(() => soundManager.isMuted());
  const [waitingForFinalFx, setWaitingForFinalFx] = useState(false);
  const [feedbackPulse, setFeedbackPulse] = useState("");
  const [feedbackFxKey, setFeedbackFxKey] = useState(0);

  const socketRef = useRef(null);
  const currentQRef = useRef(null);
  const renameTimer = useRef(null);
  const completeTimer = useRef(null);
  const feedbackHideTimer = useRef(null);
  const feedbackPulseTimer = useRef(null);
  const participantId = Number(localStorage.getItem("qz_participantId") || "0");
  const reconnectKey = localStorage.getItem("qz_reconnectKey") || "";

  const pageBg = dark ? "#0a4eb4" : "#6db9f1";
  const cardBg = dark ? "#0e1733" : "#ffffff";
  const cardBor = dark ? "#1e2d55" : "#c7d2fe";
  const textC = dark ? "#e7e9ee" : "#0f172a";
  const mutedC = dark ? "#8a9bc4" : "#5a6a9a";
  const currentSoundMode = state?.status === "LIVE"
    ? "playing"
    : (!state?.status || state?.status === "LOBBY" || state?.status === "PAUSED")
      ? "lobby"
      : null;

  function handleToggleMute() {
    const nextMuted = soundManager.toggleMute();
    setIsMuted(nextMuted);
    if (!nextMuted && currentSoundMode) {
      void soundManager.startBGM(currentSoundMode);
    }
  }

  useEffect(() => {
    function unlockAudio() {
      void soundManager.unlock().then(() => {
        if (currentSoundMode) {
          void soundManager.startBGM(currentSoundMode);
        }
      });
    }

    window.addEventListener("pointerdown", unlockAudio, { passive: true });
    window.addEventListener("keydown", unlockAudio);
    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, [currentSoundMode]);

  useEffect(() => {
    if (!currentSoundMode) {
      soundManager.stopBGM();
      return;
    }
    void soundManager.startBGM(currentSoundMode);
  }, [currentSoundMode, isMuted]);

  useEffect(() => {
    function onVis() {
      if (document.hidden && participantId) {
        fetch(`${API_BASE}/sessions/${sessionId}/tab-event`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ participantId }),
        }).catch(() => {});
      }
    }
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [sessionId, participantId]);

  // Real-time connection. Student screens stay updated from socket events instead of repeated polling.
  useEffect(() => {
    const s = makeSocket();
    socketRef.current = s;
    s.on("connect", () => s.emit("student:connect", { sessionId: Number(sessionId), reconnectKey }));
    s.on("student:connected", () => { void soundManager.startBGM("lobby"); });
    s.on("student:error", (e) => setMsg(e?.message || "Could not join the session."));
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
          setSubmitLabel("Submit");
          setProposalStatus("");
          setGroupProposal(null);
        }
        return payload.state;
      });
      setQuestions(payload.questions || []);
      if (payload.state?.server_now) setClockOffsetMs(Date.now() - new Date(payload.state.server_now).getTime());
      if (payload.state?.status === "LIVE") void soundManager.startBGM("playing");
      if (payload.state?.status === "LOBBY" || payload.state?.status === "PAUSED") void soundManager.startBGM("lobby");
      if (payload.state?.status === "ENDED") {
        soundManager.stopBGM();
      }
    });
    s.on("scores:update", (sc) => setScores(sc || []));
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
        setSubmittedQId(currentQRef.current.id);
      }

      if (a.message && !isThinkSpell) {
        setSubmitLabel(a.message);
        return;
      }

      clearTimeout(feedbackHideTimer.current);
      clearTimeout(feedbackPulseTimer.current);

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
          setFeedbackQ({ isCorrect: a.isCorrect, points: a.points, explanation: questionExplanation(currentQRef.current) });
          setShowFeedback(true);
          setFeedbackFxKey((v) => v + 1);
          setFeedbackPulse(a.isCorrect ? "correct" : "wrong");
          feedbackHideTimer.current = setTimeout(() => {
            setShowFeedback(false);
            setFeedbackQ(null);
          }, 1200);
          feedbackPulseTimer.current = setTimeout(() => setFeedbackPulse(""), 820);
          const effectPromise = a.isCorrect ? soundManager.play("correct") : soundManager.play("wrong");
          void effectPromise;
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

      setFeedbackQ({ isCorrect: a.isCorrect, points: a.points, explanation: questionExplanation(currentQRef.current) });
      setShowFeedback(true);
      setFeedbackFxKey((v) => v + 1);
      setFeedbackPulse(a.isCorrect ? "correct" : "wrong");
      feedbackHideTimer.current = setTimeout(() => {
        setShowFeedback(false);
        setFeedbackQ(null);
      }, 1650);
      feedbackPulseTimer.current = setTimeout(() => setFeedbackPulse(""), 820);

      setSubmitLabel(a.viaGroup ? "Group Submitted ✓" : a.isCorrect ? "Submitted ✓" : "Submitted");
      const isLast = currentQRef.current && stateRef.current && Number(stateRef.current.current_question_index || 0) >= Math.max(0, questionCountRef.current - 1);
      const effectPromise = a.isCorrect ? soundManager.play("correct") : soundManager.play("wrong");

      if (isLast) {
        setWaitingForFinalFx(true);
        const feedbackDelay = new Promise((resolve) => setTimeout(resolve, 1650));
        Promise.all([Promise.resolve(effectPromise), feedbackDelay]).finally(() => {
          setWaitingForFinalFx(false);
          setPostAnswerPhase("complete");
          clearTimeout(completeTimer.current);
          completeTimer.current = setTimeout(() => setPostAnswerPhase("wait"), 4000);
        });
      }
    });

    return () => {
      clearTimeout(completeTimer.current);
      clearTimeout(feedbackHideTimer.current);
      clearTimeout(feedbackPulseTimer.current);
      soundManager.stopBGM();
      s.disconnect();
    };
  }, [sessionId, reconnectKey, participantId]);

  useEffect(() => { const t = setInterval(() => setNowMs(Date.now()), 200); return () => clearInterval(t); }, []);

  const currentQ = useMemo(() => state ? questions[state.current_question_index || 0] || null : null, [state, questions]);
  const stateRef = useRef(null);
  const questionCountRef = useRef(0);
  useEffect(() => { currentQRef.current = currentQ; }, [currentQ]);
  useEffect(() => { stateRef.current = state; questionCountRef.current = questions.length; }, [state, questions.length]);

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
    if (state?.question_deadline_at) {
      const serverNowMs = nowMs - clockOffsetMs;
      const remainingMs = Math.max(0, new Date(state.question_deadline_at).getTime() - serverNowMs);
      const remaining = Math.ceil(remainingMs / 1000);
      return { remainingSec: remaining, progress: total > 0 ? remaining / total : 0, total };
    }
    if (!state?.question_started_at) return { remainingSec: 0, progress: 0, total };
    const started = new Date(state.question_started_at).getTime();
    const elapsed = Math.max(0, Math.floor((nowMs - started) / 1000));
    const remaining = Math.max(0, total - elapsed);
    return { remainingSec: remaining, progress: total > 0 ? remaining / total : 0, total };
  }, [state, nowMs, currentQ, clockOffsetMs]);

  const isGroupMode = state?.join_mode === "GROUP";
  const isLastQuestion = !!state && Number(state.current_question_index || 0) >= Math.max(0, questions.length - 1);
  const matchingRequired = state?.template_type === "MATCHING" ? (Array.isArray(currentQ?.config_json?.colA) ? currentQ.config_json.colA.length : 0) : 0;
  const isMatchingIncomplete = state?.template_type === "MATCHING" && Object.keys(matchingMap).length < matchingRequired;
  const ttNormalized = normalizeTemplateType(state?.template_type);
  const thinkSpellMinLen = ttNormalized === "THINK_SPELL"
    ? Math.min(8, Math.max(2, Number(currentQ?.config_json?.minWordLength ?? 3) || 3))
    : 0;
  const thinkSpellWordReady = ttNormalized !== "THINK_SPELL" || String(spell.built || "").length >= thinkSpellMinLen;
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
  const thinkSpellTimeUp = ttNormalized === "THINK_SPELL" && timer.remainingSec === 0 && state?.status === "LIVE";
  const thinkSpellAllFound = ttNormalized === "THINK_SPELL" && thinkSpellAllWordsFound && !thinkSpellTimeUp;
  const thinkSpellSubmitLabel = ttNormalized === "THINK_SPELL" ? "Submit Answers" : submitLabel;

  function submit() {
    if (isLocked) return;
    const tt = normalizeTemplateType(state.template_type);
    let answer;
    if (tt === "MCQ") {
      // Revision 1: MCQ can submit either one choice or two selected choices.
      // Revision 5: Modified MCQ image mode always submits one selected image choice.
      answer = currentQ?.config_json?.answerMode === "TWO" && currentQ?.config_json?.mcqMode !== "MODIFIED"
        ? { choices: Array.isArray(selectedChoice) ? selectedChoice : [selectedChoice].filter(Boolean) }
        : { choice: Array.isArray(selectedChoice) ? selectedChoice[0] : selectedChoice };
    }
    else if (tt === "TRUE_FALSE") answer = { choice: selectedChoice };
    else if (tt === "MATCHING") answer = { pairs: Object.keys(matchingMap).map(k => ({ aIndex: Number(k), bIndex: Number(matchingMap[k]) })).sort((a, b) => a.aIndex - b.aIndex) };
    else if (tt === "THINK_SPELL") answer = { words: Array.isArray(spell.foundEntries) ? spell.foundEntries : [] };
    else if (tt === "GUESS_WORD_4PICS") answer = { text: spell.built };
    else answer = { text: answerText };
    socketRef.current?.emit("answer:submit", { sessionId: Number(sessionId), participantId, questionId: currentQ.id, answer });
    if (isGroupMode) setSubmitLabel("Waiting for group vote…");
  }

  function voteGroup(vote) {
    if (!groupProposal) return;
    socketRef.current?.emit("student:voteGroupAnswer", { sessionId: Number(sessionId), participantId, proposalId: groupProposal.id, vote });
    setProposalStatus(`You voted ${vote.toLowerCase()}. Waiting for the rest of your group…`);
  }

  function joinGroup(groupId) {
    socketRef.current?.emit("student:joinGroup", { sessionId: Number(sessionId), participantId, groupId });
  }

  function exitTo(path) {
    setExiting(true);
    setTimeout(() => navigate(path), 260);
  }

  const waitingTitle = state?.status === "PAUSED"
    ? "Game Paused, please wait"
    : isGroupMode
      ? (myGroup ? "Waiting for the teacher to start" : "Waiting for teacher to add groups")
      : "Waiting for others to join";
  const waitingSubtitle = state?.status === "PAUSED"
    ? "The teacher will resume shortly."
    : isGroupMode
      ? "Groups update in real time as the teacher prepares the session."
      : "The teacher will start the session soon.";

  if (state?.status === "ENDED" && !waitingForFinalFx && !showFeedback) {
    const myScore = scores.find((s) => s.participant_id === participantId);
    const myRank = scores.findIndex((s) => s.participant_id === participantId) + 1;
    return (
      <div style={{ minHeight: "100vh", background: pageBg, fontFamily: "'Segoe UI',system-ui,sans-serif", transition: "background 0.45s, opacity 0.26s", opacity: exiting ? 0 : 1 }}>
        <div className="sp-page-enter" style={{ maxWidth: 640, margin: "0 auto", padding: "32px 16px 48px" }}>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
              <div style={{ fontSize: 52 }}>🏆</div>
                          </div>
            {/* <div style={{ display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
              <SoundTogglePill muted={isMuted} onClick={handleToggleMute} />
              <ThemeTogglePill dark={dark} onClick={toggleTheme} />
            </div> */}
            <h2 style={{ fontSize: 30, fontWeight: 900, margin: "0 0 8px", color: textC }}>Complete!</h2>
            {myScore && <p style={{ fontSize: 15, color: mutedC }}>You scored <b style={{ color: "#2b6cff" }}>{myScore.total_points} pts</b>{myRank > 0 && <> · Rank #{myRank}</>}</p>}
          </div>
          <div style={{ background: cardBg, border: `1px solid ${cardBor}`, borderRadius: 22, padding: 20, marginBottom: 16, transition: "background 0.3s" }}>
            <h3 style={{ margin: "0 0 14px", fontWeight: 800, fontSize: 17, color: textC }}>🏅 Leaderboard</h3>
            {scores.slice(0, 10).map((s, i) => (
              <div key={s.participant_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderRadius: 12, marginBottom: 6, background: s.participant_id === participantId ? "rgba(43,108,255,0.12)" : "transparent", border: `1px solid ${s.participant_id === participantId ? "rgba(43,108,255,0.25)" : "transparent"}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 18, width: 24, textAlign: "center" }}>{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}</span>
                  <span style={{ fontWeight: s.participant_id === participantId ? 800 : 600, color: textC }}>{isGroupMode ? (s.group_name || `${s.first_name} ${s.last_name}`) : `${s.first_name} ${s.last_name}`}</span>
                </div>
                <span style={{ fontWeight: 900, color: "#2b6cff" }}>{s.total_points} pts</span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <button onClick={() => exitTo("/play")} style={{ flex: 1, padding: "14px", borderRadius: 999, border: `1px solid ${cardBor}`, background: cardBg, color: textC, fontWeight: 800, fontSize: 15, cursor: "pointer" }}>Join Another Session</button>
            <button onClick={() => exitTo("/")} style={{ flex: 1, padding: "14px", borderRadius: 999, border: "none", background: "#2b6cff", color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer", boxShadow: "0 4px 20px rgba(43,108,255,0.35)" }}>Exit</button>
          </div>
        </div>
      </div>
    );
  }

  if (!state || state.status === "LOBBY" || state.status === "PAUSED") {
    return (
      <div style={{ minHeight: "100vh", background: pageBg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI',system-ui,sans-serif", transition: "background 0.45s", padding: 20 }}>
        <div className="sp-wait-card sp-page-enter" style={{ width: "min(100%, 820px)", background: cardBg, borderColor: cardBor }}>
          <div className="sp-wait-icon-wrap" style={{ background: dark ? "rgba(255,255,255,0.05)" : "#eef3ff", borderColor: cardBor }}>
            <div className="sp-wait-icon">{state?.status === "PAUSED" ? "⏸" : "⏳"}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
            <h3 className="sp-wait-title" style={{ color: textC, margin: 0 }}>{waitingTitle}<LoadingDots color={mutedC} /></h3>
            {/* <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
              <SoundTogglePill muted={isMuted} onClick={handleToggleMute} />
              <ThemeTogglePill dark={dark} onClick={toggleTheme} />
            </div> */}
          </div>
          <p className="sp-wait-subtitle" style={{ color: mutedC }}>{waitingSubtitle}</p>
          {msg && <p style={{ color: "#ef4444", fontWeight: 800 }}>{msg}</p>}

          {!isGroupMode && (
            <div style={{ width: "100%", marginTop: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
              {roster.map((p) => (
                <WaitRosterCard key={p.id} item={p} dark={dark} subtitle={p.connected ? "Online" : "Offline"} />
              ))}
            </div>
          )}

          {isGroupMode && !myGroup && (
            <div style={{ width: "100%", marginTop: 18 }}>
              {groups.length === 0 ? (
                <div style={{ padding: 18, borderRadius: 18, background: dark ? "rgba(255,255,255,0.05)" : "#f4f7ff", border: `1px solid ${cardBor}`, color: textC, fontWeight: 700, textAlign: "center" }}>
                  <div className="sp-wait-icon-wrap" style={{ margin: "0 auto 12px", width: 78, height: 78, background: dark ? "rgba(255,255,255,0.05)" : "#eef3ff", borderColor: cardBor }}>
                    <div className="sp-wait-icon">⏳</div>
                  </div>
                  Waiting for teacher to add groups<LoadingDots color={mutedC} />
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
                  {groups.map((group) => (
                    <div key={group.id} style={{ padding: 16, borderRadius: 18, background: dark ? "rgba(255,255,255,0.05)" : "#f8faff", border: `1px solid ${cardBor}`, boxShadow: dark ? "none" : "0 12px 28px rgba(43,108,255,0.08)" }}>
                      <div style={{ color: textC, fontWeight: 900, marginBottom: 6 }}>{group.display_name}</div>
                      <div style={{ color: mutedC, fontSize: 12, marginBottom: 10 }}>{group.members?.length || 0} members</div>
                      <button onClick={() => joinGroup(group.id)} style={{ padding: "10px 16px", borderRadius: 999, border: "none", background: "#2b6cff", color: "#fff", fontWeight: 800, cursor: "pointer" }}>Join Group</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {isGroupMode && myGroup && (
            <div style={{ width: "100%", marginTop: 18, display: "grid", gap: 12 }}>
              <div style={{ padding: 16, borderRadius: 18, background: dark ? "rgba(255,255,255,0.05)" : "#f8faff", border: `1px solid ${cardBor}` }}>
                <div style={{ color: mutedC, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Your Group</div>
                <input value={groupNameDraft} onChange={(e) => setGroupNameDraft(e.target.value)} disabled={Number(myGroup?.name_editor_participant_id || 0) !== Number(participantId)} style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 14, border: `1px solid ${cardBor}`, background: dark ? "rgba(255,255,255,0.04)" : "#eef2ff", color: textC, fontWeight: 800, opacity: Number(myGroup?.name_editor_participant_id || 0) !== Number(participantId) ? 0.72 : 1 }} />
                <div style={{ color: mutedC, fontSize: 12, marginTop: 8 }}>{Number(myGroup?.name_editor_participant_id || 0) === Number(participantId) ? 'Only the first student in the group can edit the group name.' : 'Only the first student who joined this group can rename it.'}</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
                {myGroup.members?.map((member) => (
                  <WaitRosterCard key={member.id} item={member} dark={dark} subtitle={member.connected ? "Online" : "Offline"} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (state?.status === "LIVE" && countdown > 0) {
    return (
      <div style={{ minHeight: "100vh", background: pageBg, fontFamily: "'Segoe UI',system-ui,sans-serif", transition: "background 0.45s" }}>
        <div className="countdown-overlay" style={{ background: dark ? undefined : "radial-gradient(circle at center, rgba(255,255,255,0.86), rgba(219,230,255,0.95))" }}>
          <div className="countdown-card">
            <h3 className="countdown-title" style={{ color: dark ? "#fff" : "#17305f" }}>Get Ready</h3>
            <div key={countdown} className="countdown-number">{countdown}</div>
            <p className="countdown-sub" style={{ color: dark ? "rgba(255,255,255,0.75)" : "#5a6a9a" }}>Session is about to start</p>
          </div>
        </div>
      </div>
    );
  }

  if (postAnswerPhase && state?.status === "LIVE") {
    return (
      <div style={{ minHeight: "100vh", background: pageBg, fontFamily: "'Segoe UI',system-ui,sans-serif", display: "grid", placeItems: "center", padding: 20, transition: "background 0.45s" }}>
        <div className={`sp-wait-card ${postAnswerPhase === "complete" ? "sp-phase-complete" : "sp-phase-wait"}`} style={{ maxWidth: 520, background: cardBg, borderColor: cardBor, textAlign: "center" }}>
          {postAnswerPhase === "complete" ? (
            <>
              <div style={{ fontSize: 58, marginBottom: 12 }}>✅</div>
              <h3 className="sp-wait-title" style={{ color: textC, marginBottom: 0 }}>Complete!</h3>
            </>
          ) : (
            <>
              <div className="sp-wait-icon-wrap" style={{ margin: "0 auto 16px", background: dark ? "rgba(255,255,255,0.05)" : "#eef3ff", borderColor: cardBor }}>
                <div className="sp-wait-icon">⏳</div>
              </div>
              <h3 className="sp-wait-title" style={{ color: textC }}>Please wait<LoadingDots color={mutedC} /></h3>
              <p className="sp-wait-subtitle" style={{ color: mutedC }}>Your teacher will end the session once everyone is ready.</p>
            </>
          )}
        </div>
      </div>
    );
  }

  if (!currentQ) return null;
  const timerRed = (timer.remainingSec ?? 999) <= 5;
  const difficulty = questionDifficulty(currentQ);

  return (
    <div style={{ minHeight: "100vh", background: pageBg, display: "flex", flexDirection: "column", fontFamily: "'Segoe UI',system-ui,sans-serif", transition: "background 0.45s" }}>
      {showFeedback && feedbackQ && (
        <div className={`sp-feedback-overlay ${feedbackQ.isCorrect ? "is-correct" : "is-wrong"}`}>
          <div className="sp-feedback-burst" aria-hidden="true">
            {Array.from({ length: 10 }).map((_, i) => (
              <span key={i} style={{ "--i": i }} />
            ))}
          </div>
          <div key={feedbackFxKey} className={`sp-feedback-card ${feedbackQ.isCorrect ? "is-correct" : "is-wrong"}`}>
            <div className="sp-feedback-icon">{feedbackQ.isCorrect ? "✅" : "❌"}</div>
            <div className="sp-feedback-title">
              {feedbackQ.isCorrect ? `Correct! +${feedbackQ.points} pts` : "Incorrect"}
            </div>
            <div className="sp-feedback-subtitle">
              {feedbackQ.isCorrect ? "Nice one — keep the streak going!" : "No worries — the next question is yours."}
            </div>
            {feedbackQ.explanation && (
              <div className="sp-explanation-panel">
                <div className="sp-explanation-kicker">Explanation</div>
                <p>{feedbackQ.explanation}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {groupProposal && isGroupMode && (
        <div style={{ position: "fixed", inset: 0, zIndex: 120, display: "grid", placeItems: "center", background: dark ? "rgba(0,0,0,0.56)" : "rgba(30,45,85,0.24)", backdropFilter: "blur(6px)" }}>
          <div style={{ width: "min(92vw, 520px)", borderRadius: 24, background: dark ? "#0e1733" : "#ffffff", border: `1px solid ${cardBor}`, boxShadow: dark ? "0 30px 80px rgba(0,0,0,0.5)" : "0 24px 60px rgba(43,108,255,0.18)", overflow: "hidden" }}>
            <div style={{ padding: "24px 24px 14px", background: dark ? "linear-gradient(180deg, rgba(43,108,255,0.16), transparent)" : "linear-gradient(180deg, rgba(43,108,255,0.14), transparent)" }}>
              <div style={{ width: 56, height: 56, borderRadius: 16, display: "grid", placeItems: "center", background: "rgba(43,108,255,0.12)", color: "#2b6cff", border: "1px solid rgba(43,108,255,0.2)", marginBottom: 14, fontSize: 24 }}>🤝</div>
              <h3 style={{ margin: 0, color: textC, fontSize: 22, fontWeight: 900 }}>Confirm group answer?</h3>
              <p style={{ margin: "10px 0 0", color: mutedC, lineHeight: 1.65, fontSize: 14 }}><b style={{ color: textC }}>{groupProposal.proposerName || "A teammate"}</b> wants to submit this answer: <b style={{ color: textC }}>{renderAnswerPreview(groupProposal.answer)}</b></p>
            </div>
            <div style={{ padding: "0 24px 22px" }}>
              <div style={{ color: mutedC, fontSize: 13, marginBottom: 14 }}>{proposalStatus || `Votes: ${(groupProposal.votes || []).length}/${groupProposal.totalMembers}`}</div>
              <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", flexWrap: "wrap" }}>
                <button onClick={() => voteGroup("DISAGREE")} style={{ padding: "12px 18px", borderRadius: 14, border: "1px solid #fca5a5", background: dark ? "#2a0f0f" : "#fee2e2", color: "#dc2626", fontWeight: 800, cursor: "pointer" }}>Disagree</button>
                <button onClick={() => voteGroup("AGREE")} style={{ padding: "12px 18px", borderRadius: 14, border: "1px solid rgba(43,108,255,0.3)", background: dark ? "rgba(43,108,255,0.2)" : "#dbeafe", color: "#1d4ed8", fontWeight: 900, cursor: "pointer" }}>Agree</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className={`quiz-shell-new ${dark ? "theme-dark" : "theme-light"} ${feedbackPulse ? `feedback-hit-${feedbackPulse}` : ""}`} style={{ width: "100%", minHeight: "100vh", margin: 0, display: "flex", flexDirection: "column" }}>
        <div className="qn-header">
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div className="qn-subject">{state.quiz_title || "ThinkWAVE"}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <SoundTogglePill muted={isMuted} onClick={handleToggleMute} style={{ padding: "6px 11px", fontSize: 12 }} />
              <ThemeTogglePill dark={dark} onClick={toggleTheme} style={{ padding: "6px 11px", fontSize: 12, color: dark ? "#dbe7ff" : "#17305f", border: dark ? "1px solid rgba(219,231,255,0.25)" : "1px solid rgba(43,108,255,0.18)", background: dark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.92)", boxShadow: dark ? "0 12px 22px rgba(0,0,0,0.26)" : "0 12px 22px rgba(43,108,255,0.14)" }} />
            </div>
          </div>
          <div className="qn-meta">
            <div className="qn-qcount">{state?.template_type === "MATCHING" ? "Batch" : "Q"} {(state.current_question_index || 0) + 1}/{questions.length}</div>
            <div className="qn-timer" style={{ background: timerRed ? "#ef4444" : undefined }}>⏱ {fmtTime(timer.remainingSec ?? Number(timer.total || state.time_limit_sec || 0))}</div>
          </div>
        </div>
        <div className="qn-progress"><div className="qn-progress-bar" style={{ width: `${Math.round((timer.progress || 0) * 100)}%`, background: timerRed ? "#ef4444" : undefined }} /></div>
        {difficulty && <div key={`${currentQ.id}-${difficulty}`} className={`sp-difficulty-pop ${difficulty}`}>{difficulty}</div>}

        <div className="qn-body" style={{ flex: 1 }}>
        {isGroupMode && myGroup && (
          <div style={{ marginBottom: 14, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center", padding: "10px 14px", borderRadius: 16, background: dark ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.75)", border: `1px solid ${cardBor}` }}>
            <div>
              <div style={{ color: textC, fontWeight: 900 }}>{myGroup.display_name}</div>
              <div style={{ color: mutedC, fontSize: 12 }}>{myGroup.members?.map((m) => `${m.first_name} ${m.last_name}`.trim()).join(" · ")}</div>
            </div>
            <div style={{ color: mutedC, fontSize: 12 }}>One final answer per group · majority confirms it</div>
          </div>
        )}
        <div className="qn-prompt-box">
          {currentQ?.config_json?.promptImage ? <img src={currentQ.config_json.promptImage} alt="" className="qn-prompt-img" /> : null}
          <span className="qn-prompt-text">{currentQ.prompt}</span>
        </div>
        <TemplateBody disabled={interactionLocked} templateType={ttNormalized} q={currentQ} selectedChoice={selectedChoice} setSelectedChoice={setSelectedChoice} answerText={answerText} setAnswerText={setAnswerText} matchingMap={matchingMap} setMatchingMap={setMatchingMap} spell={spell} setSpell={setSpell} />
        {thinkSpellTimeUp && (
          <div className="bword-summary">
            <div className="bword-summary-title">Time&apos;s up!</div>
            <div className="bword-summary-meta">
              You found <b>{(spell.foundWords || []).length}</b> word{(spell.foundWords || []).length === 1 ? "" : "s"}
              {" · "}
              <b>{Number(spell.totalPoints || 0)}</b> pts
            </div>
            <div className="bword-summary-hint">Wait for the teacher to continue.</div>
          </div>
        )}
        {thinkSpellAllFound && (
          <div className="bword-summary">
            <div className="bword-summary-title">All words found!</div>
            <div className="bword-summary-meta">
              <b>{(spell.foundWords || []).length}</b> words · <b>{Number(spell.totalPoints || 0)}</b> pts
            </div>
            <div className="bword-summary-hint">Wait for the teacher to continue.</div>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "center", marginTop: 20 }}>
          <button
            onClick={submit}
            disabled={isLocked}
            className="submit-btn"
            style={{
              opacity: isLocked ? 0.72 : 1,
              cursor: isLocked ? "not-allowed" : "pointer",
              background: isLocked
                ? (dark ? "linear-gradient(180deg, #27457c 0%, #1b3260 100%)" : "linear-gradient(180deg, #8ec9ff 0%, #73b3f4 100%)")
                : undefined,
              boxShadow: isLocked ? "none" : undefined,
            }}
          >
            {thinkSpellSubmitLabel}
          </button>
        </div>
        {msg && <div style={{ textAlign: "center", color: "#ef4444", fontWeight: 700, marginTop: 12 }}>{msg}</div>}
        {state?.template_type === "MATCHING" && isMatchingIncomplete && <div style={{ textAlign: "center", color: mutedC, fontWeight: 700, marginTop: 12 }}>Match every question with an answer to unlock Submit.</div>}
        {ttNormalized === "THINK_SPELL" && !thinkSpellTimeUp && !interactionLocked && !thinkSpellWordReady && (
          <div style={{ textAlign: "center", color: mutedC, fontWeight: 700, marginTop: 12 }}>
            Find at least one valid word before submitting.
          </div>
        )}
        {isLastQuestion && submittedQId === currentQ?.id && ttNormalized !== "THINK_SPELL" && <div style={{ textAlign: "center", color: mutedC, fontWeight: 700, marginTop: 12 }}>You have reached the end.</div>}
        </div>
      </div>
    </div>
  );
}

function renderAnswerPreview(answer) {
  if (!answer) return "—";
  if (typeof answer.choice === "string") return answer.choice || "—";
  if (typeof answer.text === "string") return answer.text || "—";
  if (Array.isArray(answer.pairs)) return `${answer.pairs.length} pair${answer.pairs.length === 1 ? "" : "s"} matched`;
  return "—";
}

function trimText(v) {
  return String(v || "").trim();
}

function normalizeChoiceOption(option, index = 0) {
  if (option && typeof option === "object") {
    return {
      id: String(option.id || `option-${index + 1}`),
      text: option.text ?? option.label ?? "",
      image: option.image ?? "",
    };
  }
  return { id: `option-${index + 1}`, text: String(option ?? ""), image: "" };
}

function choiceValue(option) {
  return option?.id || option?.text || "";
}

function choiceLabel(option, fallback) {
  return trimText(option?.text) || (trimText(option?.image) ? "Image option" : fallback);
}

function fmtTime(sec) { const s = Math.max(0, Number(sec || 0)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; }

// Revision 2: light randomized matching colors for easier reading.
const CC_A = ["#dbeafe", "#dcfce7", "#fef3c7", "#fce7f3", "#ede9fe", "#cffafe", "#ffedd5"];
const CC_B = ["#e0f2fe", "#ecfccb", "#fef9c3", "#fae8ff", "#ede9fe", "#ccfbf1", "#fee2e2"];
const CB_A = ["#93c5fd", "#86efac", "#fcd34d", "#f9a8d4", "#c4b5fd", "#67e8f9", "#fdba74"];
const MATCH_TEXT = "#1f2937";
function seededOrder(length, shouldShuffle, seedInput) {
  const arr = Array.from({ length }, (_, i) => i);
  if (!shouldShuffle || length <= 1) return arr;
  let seed = Math.max(1, hashToIndex(seedInput, 2147483646) + 1);
  const rand = () => {
    seed = (seed * 48271) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  if (arr.every((value, index) => value === index)) arr.push(arr.shift());
  return arr;
}
function MatchingTemplate({ disabled, q, cfg, matchingMap, setMatchingMap }) {
  const colA = Array.isArray(cfg.colA) ? cfg.colA : [];
  const colB = Array.isArray(cfg.colB) ? cfg.colB : [];
  const shuffleA = !!cfg.shuffleColA;
  const questionSeed = `${q?.id || q?.prompt || "matching"}-${colA.length}-${colB.length}`;
  const orderA = useMemo(() => seededOrder(colA.length, shuffleA, `${questionSeed}-A`), [colA.length, shuffleA, questionSeed]);
  const orderB = useMemo(() => seededOrder(colB.length, true, `${questionSeed}-B-always`), [colB.length, questionSeed]);
  const [selectedA, setSelectedA] = useState(null);
  const [needPickQuestion, setNeedPickQuestion] = useState(false);

  useEffect(() => {
    setSelectedA(null);
    setNeedPickQuestion(false);
  }, [questionSeed]);

  const total = colA.length;
  const matchedCount = Object.keys(matchingMap).length;
  const allDone = total > 0 && matchedCount === total;
  const usedB = new Set(Object.values(matchingMap).map(Number));

  function assignPair(aIndex, bIndex) {
    if (disabled || aIndex == null || bIndex == null) return;
    const next = { ...matchingMap };
    Object.keys(next).forEach((key) => {
      if (Number(key) === Number(aIndex)) delete next[key];
      else if (Number(next[key]) === Number(bIndex)) delete next[key];
    });
    next[Number(aIndex)] = Number(bIndex);
    setMatchingMap(next);
    setSelectedA(null);
    setNeedPickQuestion(false);
  }

  function clearPair(aIndex) {
    if (disabled) return;
    const next = { ...matchingMap };
    delete next[Number(aIndex)];
    setMatchingMap(next);
    if (selectedA === aIndex) setSelectedA(null);
  }

  const hintMessage = (() => {
    if (allDone) return "All pairs matched — press Submit when you're ready.";
    if (selectedA !== null) return "Now tap the answer on the right that belongs with your highlighted question.";
    if (needPickQuestion) return "Start on the left — tap a question first, then tap its answer.";
    if (matchedCount === 0) return "Tap a question on the left, then tap the matching answer on the right.";
    const left = total - matchedCount;
    return `${left} more ${left === 1 ? "pair" : "pairs"} to go — tap a question, then its answer.`;
  })();

  return (
    <div className="match-v2">
      <div className="match-v2-intro">
        <div className="match-v2-steps" aria-hidden="true">
          <span className="match-v2-step"><span className="match-v2-step-num">1</span> Pick a question</span>
          <span className="match-v2-step-arrow">→</span>
          <span className="match-v2-step"><span className="match-v2-step-num">2</span> Pick its answer</span>
        </div>
        <div className="match-v2-progress">
          <div className="match-v2-progress-top">
            <span className="match-v2-progress-label">{matchedCount} of {total} matched</span>
            {allDone ? <span className="match-v2-badge-done">Done</span> : null}
          </div>
          <div className="match-v2-progress-track" role="progressbar" aria-valuenow={matchedCount} aria-valuemin={0} aria-valuemax={total}>
            <div className="match-v2-progress-fill" style={{ width: `${total ? Math.round((matchedCount / total) * 100) : 0}%` }} />
          </div>
        </div>
      </div>

      <p className="match-v2-hint" role="status">{hintMessage}</p>

      <div className="match-v2-columns">
        <section className="match-v2-col" aria-label="Questions">
          <h3 className="match-v2-col-title">Questions</h3>
          <ul className="match-v2-list">
            {orderA.map((ai, rowIndex) => {
              const a = colA[ai] || {};
              const bIndex = matchingMap[ai] !== undefined ? Number(matchingMap[ai]) : null;
              const matched = bIndex !== null && !Number.isNaN(bIndex);
              const bItem = matched ? colB[bIndex] : null;
              const isSelected = selectedA === ai;
              return (
                <li key={`q-${ai}`}>
                  <button
                    type="button"
                    className={["match-v2-card", "match-v2-card-q", isSelected ? "is-selected" : "", matched ? "is-matched" : ""].filter(Boolean).join(" ")}
                    style={{ background: CC_A[rowIndex % CC_A.length], borderColor: CB_A[rowIndex % CB_A.length], color: MATCH_TEXT, "--match-accent": CB_A[rowIndex % CB_A.length] }}
                    onClick={() => {
                      if (disabled) return;
                      if (matched) clearPair(ai);
                      else setSelectedA(isSelected ? null : ai);
                      setNeedPickQuestion(false);
                    }}
                    disabled={disabled}
                    aria-pressed={isSelected}
                  >

                    <span className="match-v2-card-main">
                      {a.image ? <img src={a.image} alt="" className="match-v2-img" /> : null}
                      {(trimText(a.text) || !a.image) ? (
                        <span className="match-v2-text">{trimText(a.text) || `Question ${ai + 1}`}</span>
                      ) : null}
                      {matched && bItem ? (
                        <span className="match-v2-paired">
                          <span className="match-v2-paired-label">Your answer:</span>
                          {bItem.image ? <img src={bItem.image} alt="" className="match-v2-img match-v2-img-small" /> : null}
                          {(trimText(bItem.text) || !bItem.image) ? (
                            <strong>{trimText(bItem.text) || `Answer ${bIndex + 1}`}</strong>
                          ) : null}
                          {!disabled ? <span className="match-v2-change">Tap to change</span> : null}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="match-v2-col" aria-label="Answers">
          <h3 className="match-v2-col-title">Answers</h3>
          <ul className="match-v2-list">
            {orderB.map((bi, rowIndex) => {
              const b = colB[bi] || {};
              const isUsed = usedB.has(bi);
              const canPick = selectedA !== null && !isUsed;
              return (
                <li key={`a-${bi}`}>
                  <button
                    type="button"
                    className={["match-v2-card", "match-v2-card-ans", isUsed ? "is-used" : "", canPick ? "is-targetable" : ""].filter(Boolean).join(" ")}
                    style={{ background: isUsed ? undefined : CC_B[rowIndex % CC_B.length], borderColor: CB_A[rowIndex % CB_A.length], color: MATCH_TEXT, "--match-accent": CB_A[rowIndex % CB_A.length] }}
                    onClick={() => {
                      if (disabled || isUsed) return;
                      if (selectedA === null) {
                        setNeedPickQuestion(true);
                        return;
                      }
                      assignPair(selectedA, bi);
                    }}
                    disabled={disabled || isUsed}
                  >

                    <span className="match-v2-card-main">
                      {b.image ? <img src={b.image} alt="" className="match-v2-img" /> : null}
                      {(trimText(b.text) || !b.image) ? (
                        <span className="match-v2-text">{trimText(b.text) || `Answer ${bi + 1}`}</span>
                      ) : null}
                    </span>
                    {isUsed ? <span className="match-v2-used-tag">Matched</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      {matchedCount > 0 ? (
        <div className="match-v2-summary">
          <div className="match-v2-summary-title">Your pairs</div>
          <div className="match-v2-summary-chips">
            {Object.keys(matchingMap)
              .map(Number)
              .sort((x, y) => x - y)
              .map((ai) => {
                const bi = Number(matchingMap[ai]);
                const b = colB[bi];
                const aItem = colA[ai];
                const chipQ = (() => { const t = trimText(aItem?.text); return t ? (t.length > 22 ? t.slice(0, 22) + "…" : t) : (aItem?.image ? "🖼" : `Q${ai + 1}`); })();
                const chipA = (() => { const t = trimText(b?.text); return t ? (t.length > 22 ? t.slice(0, 22) + "…" : t) : (b?.image ? "🖼" : `Answer ${bi + 1}`); })();
                return (
                  <div key={`pair-${ai}-${bi}`} className="match-v2-chip">
                    <span className="match-v2-chip-q">{chipQ}</span>
                    <span className="match-v2-chip-arrow" aria-hidden="true">↔</span>
                    <span className="match-v2-chip-a">{chipA}</span>
                    {!disabled ? (
                      <button type="button" className="match-v2-chip-remove" onClick={() => clearPair(ai)} aria-label={`Remove match for question ${ai + 1}`}>
                        ×
                      </button>
                    ) : null}
                  </div>
                );
              })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
function GuessWord4PicsTemplate({ disabled, cfg, spell, setSpell }) {
  const images = Array.isArray(cfg.images) ? cfg.images : [];
  const target = String(cfg.target ?? "");
  const answerLen = Math.max(1, countAnswerLetters(target));

  useEffect(() => {
    if (spell.mode === "pics4" && spell.target === target && spell.bank?.length) return;
    // Revision 3: 4 Pics keeps only the original word-guess gameplay.
    setSpell({ mode: "pics4", target, built: "", bank: buildLetterBank(target, Number(cfg.dummyLetters || 6)) });
  }, [cfg.dummyLetters, target]);

  const bank = Array.isArray(spell.bank) ? spell.bank.map((x, i) => typeof x === "string" ? { id: i, ch: x } : x) : [];
  const usedIds = (() => {
    const ids = [];
    const builtChars = spell.built ? spell.built.split("") : [];
    const avail = bank.map((b) => ({ ...b, taken: false }));
    for (const ch of builtChars) {
      const t = avail.find((tile) => !tile.taken && tile.ch === ch);
      if (t) { t.taken = true; ids.push(t.id); }
    }
    return new Set(ids);
  })();

  function tap(id, ch) {
    if (disabled || usedIds.has(id) || (spell.built || "").length >= answerLen) return;
    setSpell((s) => ({ ...s, built: `${s.built || ""}${ch}` }));
  }
  function backspace() { if (!disabled && spell.built) setSpell((s) => ({ ...s, built: s.built.slice(0, -1) })); }
  function clear() { if (!disabled) setSpell((s) => ({ ...s, built: "" })); }

  return (
    <div className="pics4-wrap simple-mode">
      <div className="pics4-grid compact-grid">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="pics4-frame compact-frame">
            {images[i] ? <img src={images[i]} alt={`Clue ${i + 1}`} /> : <span className="pics4-placeholder">?</span>}
          </div>
        ))}
      </div>
      <div className="pics4-answer-shell">
        <p className="pics4-answer-label">Tap letters to build the word.</p>
        <div className="spell-wrap">
          <div className="spell-display">
            {Array.from({ length: answerLen }).map((_, i) => <div key={i} className="spell-char">{(spell.built || "")[i] || "•"}</div>)}
          </div>
          <div className="spell-bank">
            {bank.map(({ id, ch }) => <button key={id} type="button" className={`spell-tile${usedIds.has(id) ? " used" : ""}`} onClick={() => tap(id, ch)} disabled={disabled || usedIds.has(id) || (spell.built || "").length >= answerLen}>{ch}</button>)}
          </div>
          <div className="spell-controls">
            <button type="button" className="spell-ctrl back" onClick={backspace} disabled={disabled || !spell.built}>⌫ Back</button>
            <button type="button" className="spell-ctrl clr" onClick={clear} disabled={disabled || !spell.built}>Clear</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function thinkSpellRejectLabel(reason) {
  switch (reason) {
    case "duplicate": return "Already found — try another";
    case "not_in_bank": return "Not on the word list";
    case "not_in_grid": return "Can't form that word in the grid";
    case "too_short": return "Word is too short";
    default: return "Not accepted — try again";
  }
}

function BookwormThinkSpellTemplate({ disabled, cfg, cor, spell, setSpell, questionId }) {
  const gridSize = Math.min(12, Math.max(5, Number(cfg.gridSize ?? 8) || 8));
  const minWordLength = Math.min(8, Math.max(2, Number(cfg.minWordLength ?? 3) || 3));
  const wordBank = resolveThinkSpellWordBank({ config: cfg, correct: cor });
  const sig = buildThinkSpellSignature({ questionId, gridSize, words: wordBank });
  const foundEntries = Array.isArray(spell.foundEntries) ? spell.foundEntries : [];
  const foundWords = foundEntries.map((entry) => entry.text || entry.word || "");
  const foundSet = new Set(foundWords.map(normalizeThinkWordKey));
  // Revision 2: keep found word paths visible until final submit.
  const foundPathSet = new Set(foundEntries.flatMap((entry) => Array.isArray(entry.path) ? entry.path.map(Number) : []));
  const cellGap = 8;
  const draggingRef = useRef(false);

  useEffect(() => {
    if (spell?.mode === "wordhunt-batch" && spell.sig === sig && Array.isArray(spell.grid) && spell.grid.length) return;
    const initial = loadThinkSpellGridState({ config: cfg, correct: cor, questionId, priorPayload: null });
    setSpell({
      mode: "wordhunt-batch",
      sig,
      grid: initial.grid,
      gridSize: initial.gridSize,
      wordBank,
      foundEntries: [],
      selected: [],
      built: "",
      totalPoints: 0,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  const grid = Array.isArray(spell.grid) ? spell.grid : [];
  const activeGridSize = Number(spell.gridSize || gridSize);
  const selected = Array.isArray(spell.selected) ? spell.selected : [];
  const selectedSet = new Set(selected);
  const built = selected.map((idx) => grid[idx] || "").join("");

  useEffect(() => {
    if (spell?.mode !== "wordhunt-batch") return;
    if (spell.built === built) return;
    setSpell((s) => ({ ...s, built }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [built]);

  function addIndex(idx) {
    if (disabled || !grid[idx] || selectedSet.has(idx)) return;
    if (!selected.length) {
      setSpell((s) => ({ ...s, selected: [idx], built: String(grid[idx] || "") }));
      return;
    }
    const lastIdx = selected[selected.length - 1];
    if (!isAdjacentSelection(lastIdx, idx, activeGridSize)) return;
    const nextSelected = [...selected, idx];
    // Revision 2: ignore off-line drag cells so the selection stays straight.
    if (!isStraightLinePath(nextSelected, activeGridSize)) return;
    setSpell((s) => ({ ...s, selected: nextSelected, built: nextSelected.map((n) => grid[n] || "").join("") }));
  }

  function handleGridPointerMove(e) {
    if (!draggingRef.current || disabled) return;
    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest?.("[data-bword-index]");
    if (!target) return;
    addIndex(Number(target.dataset.bwordIndex));
  }

  function finishSelection() {
    draggingRef.current = false;
    const text = selected.map((idx) => grid[idx] || "").join("");
    const key = normalizeThinkWordKey(text);
    const matchedKey = matchThinkSpellWord(text, wordBank);
    const pathValid = text.length >= minWordLength && validatePathSpellsWord({ grid, gridSize: activeGridSize, path: selected, word: text });
    if (matchedKey && pathValid && !foundSet.has(matchedKey)) {
      // Revision 1: valid words are collected locally; students submit once after finding all they can.
      setSpell((s) => ({
        ...s,
        foundEntries: [...(s.foundEntries || []), { text, path: selected }],
        selected: [],
        built: "",
      }));
      return;
    }
    setSpell((s) => ({ ...s, selected: [], built: "" }));
  }

  function clearCurrent() { if (!disabled) setSpell((s) => ({ ...s, selected: [], built: "" })); }
  function removeFound(index) {
    if (disabled) return;
    setSpell((s) => ({ ...s, foundEntries: (s.foundEntries || []).filter((_, i) => i !== index) }));
  }

  const previewStatus = (() => {
    if (!built.length) return "Hold and drag across adjacent letters.";
    if (built.length < minWordLength) return `Need at least ${minWordLength} letters`;
    const matchedKey = matchThinkSpellWord(built, wordBank);
    if (matchedKey && foundSet.has(matchedKey)) return "Already found";
    if (!matchedKey) return "Not on the word list";
    return "Release to add this word";
  })();
  const linePoints = selected.length > 1 ? getPathLinePoints(selected, activeGridSize, 48, cellGap) : [];

  return (
    <div className="bword-wrap">
      <div className="bword-hud">
        <div className="bword-hud-stat"><span className="bword-hud-label">Found</span><span className="bword-hud-value">{foundEntries.length}/{wordBank.length}</span></div>
        <div className="bword-hud-stat"><span className="bword-hud-label">Submit</span><span className="bword-hud-value">Once</span></div>
      </div>

      <div className="bword-instructions">
        Hold and drag across adjacent letters to find words. Find all answers first, then submit once.
      </div>

      {wordBank.length > 0 && (
        <div className="bword-quest-panel">
          <div className="bword-quest-title">Word goals</div>
          <div className="bword-quest-list">
            {wordBank.map((word) => {
              const key = normalizeThinkWordKey(word);
              const done = foundSet.has(key);
              return <span key={key} className={`bword-quest-chip${done ? " done" : ""}`}>{done ? "✓ " : ""}{word.toUpperCase()}</span>;
            })}
          </div>
        </div>
      )}

      <div className="bword-grid-shell" onPointerMove={handleGridPointerMove} onPointerLeave={() => draggingRef.current && finishSelection()}>
        <div className="bword-grid" style={{ gridTemplateColumns: `repeat(${activeGridSize}, minmax(0, 1fr))`, gap: cellGap }}>
          {grid.map((ch, idx) => (
            <button
              key={`${sig}-${idx}`}
              type="button"
              className={`bword-cell${selectedSet.has(idx) ? " selected" : ""}${foundPathSet.has(idx) ? " found" : ""}`}
              onPointerDown={(e) => {
                if (disabled) return;
                e.preventDefault();
                draggingRef.current = true;
                // Revision 2: start the drag line from the pressed letter.
                setSpell((sp) => ({ ...sp, selected: [idx], built: String(grid[idx] || "") }));
              }}
              onPointerEnter={() => draggingRef.current && addIndex(idx)}
              onPointerUp={finishSelection}
              disabled={disabled}
              data-bword-index={idx}
            >
              {ch}
            </button>
          ))}
        </div>
        {linePoints.length > 1 && (
          <svg className="bword-path-line" viewBox={`0 0 ${activeGridSize * 56} ${activeGridSize * 56}`} preserveAspectRatio="none">
            <polyline points={linePoints.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="rgba(134, 239, 172, 0.95)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>

      <div className="bword-built-row">
        <div className="spell-display bword-current-word">
          {(built || "•").split("").map((c, i) => <div key={i} className="spell-char" style={{ width: 32, height: 34, background: c === "•" ? "rgba(255,255,255,0.08)" : "var(--sp-spell-char-bg)" }}>{c}</div>)}
        </div>
        <div className={`bword-preview-status${previewStatus.includes("Release") ? " ok" : ""}`}>{previewStatus}</div>
      </div>

      <div className="bword-controls">
        <button type="button" className="spell-ctrl clr" onClick={clearCurrent} disabled={disabled || !selected.length}>Clear current line</button>
      </div>

      {foundEntries.length > 0 && (
        <div className="bword-found-panel">
          <div className="bword-found-title">Words found before submission</div>
          <div className="bword-found-list">
            {foundEntries.map((entry, index) => (
              <span key={`${entry.text}-${index}`} className="bword-found-chip">
                {(entry.text || "").toUpperCase()}
                {!disabled && <button type="button" onClick={() => removeFound(index)} style={{ marginLeft: 6, border: 0, background: "transparent", color: "inherit", cursor: "pointer", fontWeight: 900 }}>×</button>}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
function ThinkSpellTemplate({ disabled, cfg, spell, setSpell }) {
  useEffect(() => { if (spell.mode === "think" && spell.target === String(cfg.target ?? "") && spell.bank?.length) return; const d = Number(cfg.dummyLetters || 6), t = String(cfg.target ?? ""), lt = t.toUpperCase().split("").filter(Boolean), al = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"; for (let i = 0; i < d; i++)lt.push(al[Math.floor(Math.random() * al.length)]); for (let i = lt.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[lt[i], lt[j]] = [lt[j], lt[i]]; } setSpell({ mode: "think", target: t, built: "", bank: lt.map((c, i) => ({ id: i, ch: c })) }); }, [cfg.dummyLetters, cfg.target]); const bank = Array.isArray(spell.bank) ? spell.bank.map((x, i) => typeof x === "string" ? { id: i, ch: x } : x) : []; const ui = (() => { const ids = [], bc = spell.built ? spell.built.split("") : [], av = bank.map(b => ({ ...b, taken: false })); for (const ch of bc) { const t = av.find(t => !t.taken && t.ch === ch); if (t) { t.taken = true; ids.push(t.id); } } return ids; })(), us = new Set(ui); function tap(id, ch) { if (disabled || us.has(id)) return; setSpell(s => ({ ...s, built: s.built + ch })); } function bs() { if (disabled || !spell.built) return; setSpell(s => ({ ...s, built: s.built.slice(0, -1) })); } function clr() { if (disabled) return; setSpell(s => ({ ...s, built: "" })); }
  return (<div className="spell-wrap"><div className="spell-display">{(spell.built || "").split("").map((ch, i) => <div key={i} className="spell-char">{ch}</div>)}<div className="spell-cursor" /></div><p className="spell-hint">Tap the letters to spell your answer</p><div className="spell-bank">{bank.map(({ id, ch }) => <button key={id} type="button" className={`spell-tile${us.has(id) ? " used" : ""}`} onClick={() => tap(id, ch)} disabled={disabled || us.has(id)}>{ch}</button>)}</div><div className="spell-controls"><button type="button" className="spell-ctrl back" onClick={bs} disabled={disabled || !spell.built}>⌫ Back</button><button type="button" className="spell-ctrl clr" onClick={clr} disabled={disabled || !spell.built}>Clear</button></div></div>);
}
function TypeAnswerTemplate({ disabled, answerText, setAnswerText }) { const MAX = 255; return (<div className="type-wrap"><div className="type-center-shell"><p className="type-label">Type your identification answer below</p><div className={`type-input-row${disabled ? " locked" : ""}`}><input className="type-input" value={answerText} onChange={e => setAnswerText(e.target.value.slice(0, MAX))} placeholder="Start typing..." disabled={disabled} autoComplete="off" spellCheck={false} maxLength={MAX} />{!disabled && answerText && <button type="button" className="type-clear-btn" onClick={() => setAnswerText("")}>✕</button>}</div>{answerText.length > 0 && <div className="type-charboxes">{answerText.split("").map((ch, i) => <div key={i} className="type-charbox">{ch === " " ? "\u00A0" : ch}</div>)}</div>}<div className="type-count">{answerText.length} / {MAX}</div></div></div>); }
function TemplateBody({
  disabled,
  templateType,
  q,
  selectedChoice,
  setSelectedChoice,
  answerText,
  setAnswerText,
  matchingMap,
  setMatchingMap,
  spell,
  setSpell
}) {
  const cfg = q?.config_json || {};
  const cor = q?.correct_json || {};

  if (templateType === "MCQ") {
    const opts = Array.isArray(cfg.options) ? cfg.options.map(normalizeChoiceOption) : [];
    const labels = "ABCDEFGHIJ".split("");
    // Revision 5: Modified MCQ keeps the 4-image layout and one-answer gameplay.
    const isModifiedMcq = cfg.mcqMode === "MODIFIED";
    const twoMode = cfg.answerMode === "TWO" && !isModifiedMcq;
    const selectedList = Array.isArray(selectedChoice) ? selectedChoice : [selectedChoice].filter(Boolean);
    function toggleChoice(value) {
      // Revision 1: students may choose up to two options when the teacher enables two-answer MCQ.
      if (!twoMode) return setSelectedChoice(value);
      if (selectedList.includes(value)) return setSelectedChoice(selectedList.filter((v) => v !== value));
      if (selectedList.length >= 2) return setSelectedChoice([selectedList[1], value]);
      return setSelectedChoice([...selectedList, value]);
    }

    return (
      <div className={`quiz-choices ${isModifiedMcq ? "modified-mcq-choices" : ""}`}>
        {opts.map((o, i) => {
          const value = choiceValue(o);
          const selected = selectedList.includes(value) || selectedList.includes(o.text);
          const textLen = trimText(o.text).length;
          return (
            <button
              key={o.id || i}
              className={`choice-btn ${isModifiedMcq ? "modified-mcq-choice" : ""} ${selected ? "active" : ""} ${disabled && !selected ? "dimmed" : ""}`}
              onClick={() => !disabled && toggleChoice(value)}
              type="button"
              disabled={disabled && !selected}
            >
              <span className="choice-badge">{labels[i] || ""}</span>
              <span className="choice-content">
                {o.image ? <img src={o.image} alt="" className="choice-img" /> : null}
                {(trimText(o.text) || !o.image) ? <span className="choice-text" style={{ fontSize: textLen > 90 ? 13 : textLen > 55 ? 14 : undefined }}>{trimText(o.text) || `Option ${labels[i] || i + 1}`}</span> : null}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  if (templateType === "TRUE_FALSE") {
    const opts = Array.isArray(cfg.options) ? cfg.options : [];
    const labels = ["T", "F"];

    return (
      <div className="quiz-choices">
        {opts.map((o, i) => (
          <button
            key={i}
            className={`choice-btn ${selectedChoice === o ? "active" : ""} ${disabled && selectedChoice !== o ? "dimmed" : ""}`}
            onClick={() => !disabled && setSelectedChoice(o)}
            type="button"
            disabled={disabled && selectedChoice !== o}
          >
            <span className="choice-badge">{labels[i] || o?.charAt(0)?.toUpperCase() || ""}</span>
            <span className="choice-text">{o}</span>
          </button>
        ))}
      </div>
    );
  }

  if (templateType === "MATCHING") return <MatchingTemplate disabled={disabled} q={q} cfg={cfg} matchingMap={matchingMap} setMatchingMap={setMatchingMap} />;
  if (templateType === "GUESS_WORD_4PICS") return <GuessWord4PicsTemplate disabled={disabled} cfg={cfg} spell={spell} setSpell={setSpell} />;
  if (templateType === "THINK_SPELL") {
    return (
      <BookwormThinkSpellTemplate
        disabled={disabled}
        cfg={cfg}
        cor={cor}
        spell={spell}
        setSpell={setSpell}
        questionId={q?.id}
      />
    );
  }
  return <TypeAnswerTemplate disabled={disabled} answerText={answerText} setAnswerText={setAnswerText} />;
}
