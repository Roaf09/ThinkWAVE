/* FILE GUIDE:
 * client/src/pages/student/StudentPlay.jsx
 * Purpose: Main student live-session screen: waiting room, answering, group flow, leaderboard, and reconnect handling.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */


import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { makeSocket } from "../../lib/socket";
import "./StudentPlay.css";
import soundManager from "../../utils/soundmanager";
import { useTheme } from "../../context/ThemeContext";
import { normalizeTemplateType } from "../../lib/templateTypes";
import { templateAccent } from "../../lib/templatePalette";
import { getRole } from "../../lib/auth";
import ThemeIconButton from "../../components/ThemeIconButton";
import { TwIcon } from "../../components/TwUI";
import { getSessionBackground } from "../../lib/sessionBackgrounds";
import { QuestionAudioButton } from "../../components/AudioControls";
import MatchingConnectorGame from "../../components/MatchingConnectorGame";
import thinkBotLogo from "../../assets/thinkbot-logo.png";
import { buildLetterBank, countAnswerLetters } from "../../lib/letterBank";
import {
  buildThinkSpellSignature,
  getPathLinePoints,
  isThinkSpellRoundComplete,
  loadThinkSpellGridState,
  matchThinkSpellWord,
  normalizeThinkWordKey,
  resolveThinkSpellWordBank,
  validatePathSpellsWord,
} from "../../templates/thinkspell/thinkSpell";

const TAB_OUT_TRACKING_ENABLED = false; // Revision 10.20: temporarily disable tab-out blocking during gameplay testing.

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
  return <ThemeIconButton dark={dark} onClick={onClick} className={`sp-inline-theme-toggle ${className}`.trim()} style={style} size={22} />;
}

function SoundTogglePill({ muted, onClick, style, className = "" }) {
  return (
    <button className={`sp-inline-sound-toggle ${className}`.trim()} onClick={onClick} type="button" style={style}
      title={muted ? "Unmute sounds" : "Mute sounds"} aria-label={muted ? "Unmute sounds" : "Mute sounds"}>
      <span key={muted ? "muted" : "sound"} className="tw-theme-icon-swap"><TwIcon name={muted ? "volumeOff" : "volume"} size={19} /></span>
    </button>
  );
}

function WaitRosterCard({ item, dark, subtitle }) {
  const tone = rosterTone(item.id || `${item.first_name}-${item.last_name}`, dark);
  return (
    <div className="sp-wait-roster-card" style={{ background: tone.bg, borderColor: tone.border }}>
      <div className="sp-roster-profile">{item.profile_image ? <img src={item.profile_image} alt="" /> : <TwIcon name="user" size={18} />}</div>
      <div><div style={{ color: tone.text, fontWeight: 900 }}>{item.first_name} {item.last_name}</div>
      <div style={{ color: dark ? "#bfd0ff" : "#52648f", fontSize: 12 }}>{subtitle}</div></div>
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

function ExperienceControls({ dark, muted, onMute, onTheme }) {
  return <div className="sp-experience-controls"><ThemeTogglePill dark={dark} onClick={onTheme}/><SoundTogglePill muted={muted} onClick={onMute}/></div>;
}

function AntiCheatModal({ antiCheat, countdown, onConfirm }) {
  if (!antiCheat) return null;
  const warning=antiCheat.type === "warning";
  return <div className="sp-anticheat-backdrop"><div className="sp-anticheat-card">
    <div className={`sp-anticheat-icon ${warning ? "warning" : "danger"}`}><TwIcon name={warning ? "warning" : "logout"} size={38}/></div>
    <h3>{warning ? "Activity warning" : "Session access removed"}</h3>
    <p>{antiCheat.message}</p>
    {warning ? <button type="button" className="tw-dialog-press is-blue" disabled={countdown>0} onClick={onConfirm}><span>{countdown>0 ? `Confirm in ${countdown}s` : "Confirm"}</span></button> : <div className="sp-anticheat-countdown">Redirecting in {Math.max(0,countdown)}s…</div>}
  </div></div>;
}


function feedbackStatus(payload) {
  if (payload?.feedbackType === "almost" || (!payload?.isCorrect && Number(payload?.points || 0) > 0)) return "almost";
  return payload?.isCorrect ? "correct" : "wrong";
}

function explanationHeading(payload) {
  const status = feedbackStatus(payload);
  return status === "correct" ? "Correct" : status === "almost" ? "Almost" : "Incorrect";
}

function feedbackCopy(payload) {
  const status = feedbackStatus(payload);
  const timedOut = !!payload?.timeExpired;
  if (status === "correct") return {
    title: timedOut ? "Correct!" : `Correct! +${payload.points || 0} pts`,
    subtitle: timedOut ? "Time ran out, but your answer was correct." : "Nice one — keep the streak going!",
    icon: "check",
  };
  if (status === "almost") {
    const count = Number(payload?.correctCount || 0);
    const total = Number(payload?.totalCorrect || 0);
    const title = timedOut || (payload?.templateType === "MCQ" && total === 2 && count === 1) ? "Almost!" : `Almost! +${payload.points || 0} pts`;
    const subtitle = total > 0 ? `${count} of ${total} correct${timedOut ? " before time ran out" : ""}` : "Some of your answers were correct.";
    return { title, subtitle, icon: "warning" };
  }
  return { title: "Incorrect", subtitle: timedOut ? "Time ran out before a correct answer was completed." : "No worries — the next question is yours.", icon: "close" };
}

function scoreName(row, groupMode = false) {
  return groupMode ? (row?.group_name || `${row?.first_name || ""} ${row?.last_name || ""}`.trim()) : `${row?.first_name || ""} ${row?.last_name || ""}`.trim();
}

function LiveLeaderboardPanel({ leaderboard, participantId, groupMode = false }) {
  const top5 = Array.isArray(leaderboard?.top5) ? leaderboard.top5.slice(0, 5) : [];
  const itemRefs = useRef(new Map());
  const previousTops = useRef(new Map());
  const signature = top5.map((row) => row?.group_id || row?.participant_id || scoreName(row, groupMode)).join("|");

  useLayoutEffect(() => {
    const next = new Map();
    itemRefs.current.forEach((node, key) => {
      if (!node) return;
      const top = node.getBoundingClientRect().top;
      next.set(key, top);
      const previous = previousTops.current.get(key);
      if (Number.isFinite(previous) && Math.abs(previous - top) > 1 && node.animate) {
        node.animate([
          { transform: `translateY(${previous - top}px)`, opacity: .78 },
          { transform: "translateY(0)", opacity: 1 },
        ], { duration: 430, easing: "cubic-bezier(.22,1,.36,1)" });
      }
    });
    previousTops.current = next;
  }, [signature]);

  const meInTop5 = top5.some((row) => groupMode ? Number(row?.group_id || 0) === Number(leaderboard?.myScore?.group_id || 0) : Number(row?.participant_id || 0) === Number(participantId));
  return <aside className="sp-live-top5" aria-label="Live top five leaderboard">
    <div className="sp-live-top5-title"><TwIcon name="trophy" size={16}/> Live Top 5</div>
    <div className="sp-live-top5-list">
      {Array.from({ length: 5 }).map((_, index) => {
        const row = top5[index];
        const key = row ? String(row.group_id || row.participant_id || scoreName(row, groupMode)) : `empty-${index}`;
        const trophyClass = index < 3 ? ` rank-${index + 1}` : "";
        return <div className="sp-live-top5-row" key={`rank-${index + 1}`}>
          <span className="sp-live-top5-rank">{index + 1}</span>
          <span className={`sp-live-top5-trophy${trophyClass}`} aria-hidden="true">{index < 3 ? <TwIcon name="trophy" size={14}/> : null}</span>
          {row ? <div className="sp-live-top5-person" key={key} ref={(node) => node ? itemRefs.current.set(key, node) : itemRefs.current.delete(key)}>
            <span className="sp-live-top5-identity">
              <span className="sp-live-top5-avatar">{row.profile_image ? <img src={row.profile_image} alt=""/> : <TwIcon name={groupMode ? "users" : "user"} size={15}/>}</span>
              <span className="sp-live-top5-name">{scoreName(row, groupMode) || "Player"}</span>
            </span>
            <b>{Math.round(Number(row.competitive_points || 0)).toLocaleString()}</b>
          </div> : <div className="sp-live-top5-empty">—</div>}
        </div>;
      })}
    </div>
    {!meInTop5 && leaderboard?.myScore && Number(leaderboard?.myRank || 0) > 0 ? <>
      <div className="sp-live-top5-separator"/>
      <div className="sp-live-top5-me"><span>{leaderboard.myRank}</span><b>You</b><strong>{Math.round(Number(leaderboard.myScore?.competitive_points || 0)).toLocaleString()} pts</strong></div>
    </> : null}
  </aside>;
}

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
  const [isMuted, setIsMuted] = useState(() => soundManager.isMuted());
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
  const lastTabSignal = useRef(0);
  const submittedRef = useRef(null);
  const timeoutSubmitRef = useRef(null);
  const pendingLeaderboardRef = useRef(null);
  const leaderboardAppliedRef = useRef(false);
  const participantId = Number(localStorage.getItem("qz_participantId") || "0");
  const reconnectKey = localStorage.getItem("qz_reconnectKey") || "";

  const pageBg = dark ? "#0a4eb4" : "#6db9f1";
  const cardBg = dark ? "#0e1733" : "#ffffff";
  const cardBor = dark ? "#1e2d55" : "#c7d2fe";
  const textC = dark ? "#e7e9ee" : "#0f172a";
  const mutedC = dark ? "#8a9bc4" : "#5a6a9a";
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
    if (!TAB_OUT_TRACKING_ENABLED) return undefined;
    function signalTabOut() {
      if (stateRef.current?.status !== "LIVE" || !participantId) return;
      const lastIndex=Math.max(0,(questionCountRef.current||0)-1);
      if(Number(stateRef.current?.current_question_index||0)>=lastIndex && submittedRef.current===currentQRef.current?.id) return;
      const now = Date.now();
      if (now - lastTabSignal.current < 1500) return;
      lastTabSignal.current = now;
      setExperienceBlur(true);
      socketRef.current?.emit("student:tabOut", { sessionId:Number(sessionId), participantId });
    }
    function onVisibility(){ if(document.hidden) signalTabOut(); else setExperienceBlur(false); }
    function onBlur(){ if(document.visibilityState !== "hidden") signalTabOut(); }
    function onFocus(){ setExperienceBlur(false); }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pagehide", signalTabOut);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pagehide", signalTabOut);
    };
  }, [sessionId, participantId]);

  // Real-time connection. Student screens stay updated from socket events instead of repeated polling.
  useEffect(() => {
    const s = makeSocket();
    socketRef.current = s;
    s.on("connect", () => s.emit("student:connect", { sessionId: Number(sessionId), reconnectKey }));
    s.on("student:connected", () => { void soundManager.startBGM("lobby"); });
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

  useEffect(() => {
    if (!antiCheat || antiCountdown <= 0) return;
    const t=setTimeout(()=>setAntiCountdown(v=>Math.max(0,v-1)),1000);
    return ()=>clearTimeout(t);
  },[antiCheat,antiCountdown]);

  useEffect(() => { const t = setInterval(() => setNowMs(Date.now()), 200); return () => clearInterval(t); }, []);

  const currentQ = useMemo(() => state ? questions[state.current_question_index || 0] || null : null, [state, questions]);
  const stateRef = useRef(null);
  const questionCountRef = useRef(0);
  useEffect(() => { currentQRef.current = currentQ; }, [currentQ]);
  useEffect(() => { stateRef.current = state; questionCountRef.current = questions.length; }, [state, questions.length]);
  useEffect(() => { submittedRef.current = submittedQId; }, [submittedQId]);
  useEffect(() => { timeoutSubmitRef.current = null; }, [currentQ?.id]);

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
      : isGuestHosted ? "The host will start the session soon." : "The teacher will start the session soon.";
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
  const isGuestParticipant = getRole() !== "STUDENT";

  if (state?.status === "ENDED" && !waitingForFinalFx && !showFeedback) {
    const myScoreIndex = isGroupMode
      ? scores.findIndex((row) => Number(row.group_id || 0) === Number(myGroupId || 0) || (myGroup?.display_name && row.group_name === myGroup.display_name))
      : scores.findIndex((row) => Number(row.participant_id) === Number(participantId));
    const myScore = myScoreIndex >= 0 ? scores[myScoreIndex] : null;
    const myRank = myScoreIndex + 1;
    const totalParticipants = scores.length;
    const leaderboardColumns = Math.max(1, Math.min(4, Math.ceil(totalParticipants / 10)));
    const rankGroups = [scores.slice(3, 10), scores.slice(10, 20), scores.slice(20, 30), scores.slice(30, 40)].slice(0, leaderboardColumns);
    const podiumOrder = [scores[1], scores[0], scores[2]].filter(Boolean);
    const rankOf = (row) => scores.findIndex((candidate) => candidate === row) + 1;
    const displayName = (row) => isGroupMode ? (row.group_name || `${row.first_name || ""} ${row.last_name || ""}`.trim()) : `${row.first_name || ""} ${row.last_name || ""}`.trim();
    const isMe = (row) => isGroupMode ? (Number(row.group_id || 0) === Number(myGroupId || 0) || (myGroup?.display_name && row.group_name === myGroup.display_name)) : Number(row.participant_id) === Number(participantId);
    return (
      <div className={`sp-final-page ${dark ? "theme-dark" : "theme-light"}`} style={{ minHeight: "100vh", ...experienceBgStyle, "--sp-template-accent": gameplayAccent, "--host-accent": gameplayAccent, fontFamily: "'Segoe UI',system-ui,sans-serif", transition: "background 0.45s, opacity 0.26s", opacity: exiting ? 0 : 1 }}>
        {experienceControls}{antiCheatOverlay}
        <div className={`sp-final-wrap sp-page-enter columns-${leaderboardColumns}`}>
          <section className="sp-final-leaderboard-card" style={{ background: cardBg, borderColor: gameplayAccent }}>
            <div className="sp-final-summary sp-final-summary-compact">
              {myScore && <p style={{ color: mutedC }}>You scored <b style={{ color: gameplayAccent }}>{Math.round(Number(myScore.competitive_points || 0)).toLocaleString()} pts</b>{myRank > 0 && <> · Rank #{myRank}</>}</p>}
            </div>
            <h3 className="sp-final-heading" style={{ color: textC }}><TwIcon name="trophy" size={21}/> Leaderboard</h3>
            <div className="tw-host-podium sp-final-host-podium">
              {podiumOrder.map((row) => {
                const rank = rankOf(row);
                return <div key={row.participant_id || row.group_id || rank} className={`tw-host-podium-place place-${rank}${isMe(row) ? " is-me" : ""}`}>
                  <div className="tw-host-trophy"><TwIcon name="trophy" size={54} strokeWidth={2.2}/><span>{rank}</span></div>
                  <div className="tw-host-podium-platform">
                    <div className="tw-host-podium-person">
                      <div className="tw-host-podium-avatar" aria-hidden="true">{row?.profile_image ? <img src={row.profile_image} alt=""/> : <TwIcon name={isGroupMode ? "users" : "user"} size={18}/>}</div>
                      <b>{displayName(row)}</b>
                    </div>
                    <div className="tw-host-podium-points">{Math.round(Number(row.competitive_points || 0)).toLocaleString()} pts</div>
                  </div>
                </div>;
              })}
            </div>
            <div className="sp-final-rank-grid" style={{ gridTemplateColumns: `repeat(${leaderboardColumns}, minmax(0, 1fr))` }}>
              {rankGroups.map((rows, columnIndex) => <div className="sp-final-rank-column" key={columnIndex}>{rows.map((row) => {
                const rank = rankOf(row);
                return <div key={row.participant_id || row.group_id || rank} className={`tw-student-leader-row${isMe(row) ? " is-me" : ""}`}>
                  <span className="tw-student-leader-rank">#{rank}</span>
                  <span className="tw-student-leader-name" style={{ color: textC }}>{displayName(row)}</span>
                  <span className="tw-student-leader-points">{Math.round(Number(row.competitive_points || 0)).toLocaleString()} pts</span>
                </div>;
              })}</div>)}
            </div>
            {leaderboardColumns <= 2 && <div className="sp-final-dashboard-row"><button className="tw-admin-press tw-admin-press-blue tw-teacher-press tw-student-final-nav" onClick={() => exitTo(isGuestParticipant ? "/" : "/student")}><span>{isGuestParticipant ? "Back to Landing" : "Dashboard"}</span></button>{isGuestParticipant && <button className="sp-join-another-session" onClick={() => exitTo("/?join=guest")}>Join another session?</button>}</div>}
          </section>
          {leaderboardColumns >= 3 && <div className="sp-final-dashboard-top-wrap"><button className="tw-admin-press tw-admin-press-blue tw-teacher-press tw-student-final-nav sp-final-dashboard-top" onClick={() => exitTo(isGuestParticipant ? "/" : "/student")}><span>{isGuestParticipant ? "Back to Landing" : "Dashboard"}</span></button>{isGuestParticipant && <button className="sp-join-another-session" onClick={() => exitTo("/?join=guest")}>Join another session?</button>}</div>}
        </div>
      </div>
    );
  }

  if (!state || state.status === "LOBBY" || state.status === "PAUSED") {
    return (
      <div className={`sp-waiting-page ${dark ? "theme-dark" : "theme-light"}`} style={{ minHeight: "100vh", ...waitExperienceBgStyle, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI',system-ui,sans-serif", transition: "background 0.45s", padding: 20 }}>
        {experienceControls}{antiCheatOverlay}{explanationOverlay}
        <div className="sp-wait-card sp-page-enter" style={{ width: "min(100%, 820px)", background: cardBg, borderColor: cardBor }}>
          <div className="sp-wait-icon-wrap sp-thinkbot-loading" style={{ background: dark ? "rgba(8,22,50,.88)" : "rgba(255,255,255,.92)", borderColor: cardBor }}>
            <span className="sp-thinkbot-loading-ring" aria-hidden="true" />
            <img src={thinkBotLogo} alt="ThinkBot" className="sp-thinkbot-loading-logo" />
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
                  <div className="sp-wait-icon-wrap sp-thinkbot-loading" style={{ margin: "0 auto 12px", width: 78, height: 78, background: dark ? "rgba(8,22,50,.88)" : "rgba(255,255,255,.92)", borderColor: cardBor }}>
                    <span className="sp-thinkbot-loading-ring" aria-hidden="true" />
                    <img src={thinkBotLogo} alt="ThinkBot" className="sp-thinkbot-loading-logo" />
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
      <div style={{ minHeight: "100vh", ...experienceBgStyle, fontFamily: "'Segoe UI',system-ui,sans-serif", transition: "background 0.45s" }}>
        {experienceControls}{antiCheatOverlay}{explanationOverlay}
        <div className="countdown-overlay" style={{ background: dark ? undefined : "radial-gradient(circle at center, rgba(255,255,255,0.86), rgba(219,230,255,0.95))" }}>
          <div className="countdown-card">
            <h3 className="countdown-title" style={{ color: dark ? "#fff" : "#17305f" }}>{Number(state?.current_question_index||0)===0 ? "Get Ready" : Number(state?.current_question_index||0)>=questions.length-1 ? "This will be the last question!" : "Next question coming in..."}</h3>
            <div key={countdown} className="countdown-number">{countdown}</div>
            <p className="countdown-sub" style={{ color: dark ? "rgba(255,255,255,0.75)" : "#5a6a9a" }}>{Number(state?.current_question_index||0)===0 ? "Session is about to start" : "Prepare for the next challenge"}</p>
          </div>
        </div>
      </div>
    );
  }

  if (postAnswerPhase && state?.status === "LIVE") {
    return (
      <div className={`sp-waiting-page ${dark ? "theme-dark" : "theme-light"}`} style={{ minHeight: "100vh", ...waitExperienceBgStyle, fontFamily: "'Segoe UI',system-ui,sans-serif", display: "grid", placeItems: "center", padding: 20, transition: "background 0.45s" }}>
        {experienceControls}{antiCheatOverlay}{explanationOverlay}
        <div className="sp-wait-card sp-phase-wait" style={{ maxWidth: 520, background: cardBg, borderColor: cardBor, textAlign: "center" }}>
          <div className="sp-wait-icon-wrap sp-thinkbot-loading" style={{ margin: "0 auto 16px", background: dark ? "rgba(8,22,50,.88)" : "rgba(255,255,255,.92)", borderColor: cardBor }}>
            <span className="sp-thinkbot-loading-ring" aria-hidden="true" />
            <img src={thinkBotLogo} alt="ThinkBot" className="sp-thinkbot-loading-logo" />
          </div>
          <h3 className="sp-wait-title" style={{ color: textC }}>Please wait<LoadingDots color={mutedC} /></h3>
          <p className="sp-wait-subtitle" style={{ color: mutedC }}>{isGuestHosted ? "Your host will continue or end the session once everyone is done." : "Your teacher will continue or end the session once everyone is done."}</p>
        </div>
      </div>
    );
  }

  if (!currentQ) return null;
  return (
    <div className={`sp-gameplay-page ${dark ? "theme-dark" : "theme-light"}`} style={{ minHeight: "100vh", ...experienceBgStyle, display: "flex", flexDirection: "column", fontFamily: "'Segoe UI',system-ui,sans-serif", transition: "background 0.45s", "--sp-template-accent": gameplayAccent }}>
        {experienceControls}{antiCheatOverlay}{explanationOverlay}
      <LiveLeaderboardPanel leaderboard={liveLeaderboard} participantId={participantId} groupMode={isGroupMode} />
      {showFeedback && feedbackQ && (() => {
        const status = feedbackQ.status || feedbackStatus(feedbackQ);
        const copy = feedbackCopy(feedbackQ);
        return <div className={`sp-feedback-overlay is-${status}`}>
          <div className="sp-feedback-burst" aria-hidden="true">
            {Array.from({ length: 10 }).map((_, i) => <span key={i} style={{ "--i": i }} />)}
          </div>
          <div key={feedbackFxKey} className={`sp-feedback-card is-${status}`}>
            <div className="sp-feedback-icon"><TwIcon name={copy.icon} size={44}/></div>
            <div className="sp-feedback-title">{copy.title}</div>
            <div className="sp-feedback-subtitle">{copy.subtitle}</div>
          </div>
        </div>;
      })()}

      {groupProposal && isGroupMode && (
        <div style={{ position: "fixed", inset: 0, zIndex: 120, display: "grid", placeItems: "center", background: dark ? "rgba(0,0,0,0.56)" : "rgba(30,45,85,0.24)", backdropFilter: "blur(6px)" }}>
          <div style={{ width: "min(92vw, 520px)", borderRadius: 24, background: dark ? "#0e1733" : "#ffffff", border: `1px solid ${cardBor}`, boxShadow: dark ? "0 30px 80px rgba(0,0,0,0.5)" : "0 24px 60px rgba(43,108,255,0.18)", overflow: "hidden" }}>
            <div style={{ padding: "24px 24px 14px", background: dark ? "linear-gradient(180deg, rgba(43,108,255,0.16), transparent)" : "linear-gradient(180deg, rgba(43,108,255,0.14), transparent)" }}>
              <div style={{ width: 56, height: 56, borderRadius: 16, display: "grid", placeItems: "center", background: "rgba(43,108,255,0.12)", color: "#2b6cff", border: "1px solid rgba(43,108,255,0.2)", marginBottom: 14, fontSize: 24 }}><TwIcon name="users" size={28}/></div>
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

      <div className={`quiz-shell-new ${dark ? "theme-dark" : "theme-light"} ${selectedBackground ? "has-session-background" : ""} ${feedbackPulse ? `feedback-hit-${feedbackPulse}` : ""}`} style={{ width: "100%", minHeight: "100vh", margin: 0, display: "flex", flexDirection: "column", "--sp-template-accent": gameplayAccent }}>
        <div className="qn-header">
          <div className="qn-title-cluster">
            <div className="qn-brand"><img src={thinkBotLogo} alt="ThinkBot" className="qn-brand-bot"/><span>Think</span><span>WAVE</span></div><div className="qn-subject">{state.quiz_title || "Quiz"}</div>
          </div>
          <div className="qn-meta">
            <div className="qn-qcount">{state?.template_type === "MATCHING" ? `Batch ${(state.current_question_index || 0) + 1}/${questions.length}` : `${(state.current_question_index || 0) + 1}/${questions.length}`}</div>
            <div className={`qn-timer qn-pixel-timer ${state.quiz_category === "K12" ? "is-k12" : ""}${timer.remainingSec <= 3 ? " is-danger" : timer.remainingSec <= 4 ? " is-warning" : ""}`}><TwIcon name="clock" size={20}/> {fmtTime(timer.remainingSec ?? Number(timer.total || state.time_limit_sec || 0))}</div>
          </div>
        </div>
        <div className="qn-question-progress" aria-label={`${completedLiveCount} of ${questions.length} questions answered`}><div className="qn-question-progress-bar" style={{ width: `${liveQuestionProgress}%` }} /></div>
        <div className={`qn-progress qn-timer-progress${timer.remainingSec <= 3 ? " is-danger" : timer.remainingSec <= 4 ? " is-warning" : ""}`}><div className="qn-progress-bar" style={{ width: `${Math.round((timer.progress || 0) * 100)}%` }} /></div>

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
          {currentQ?.config_json?.showPromptImage !== false && currentQ?.config_json?.promptImage ? <img src={currentQ.config_json.promptImage} alt="" className="qn-prompt-img" /> : null}
          <span className="qn-prompt-text">{currentQ.prompt}</span>
          <QuestionAudioButton config={currentQ?.config_json} prompt={currentQ?.prompt} templateType={ttNormalized}/>
        </div>
        <TemplateBody disabled={interactionLocked} templateType={ttNormalized} q={currentQ} selectedChoice={selectedChoice} setSelectedChoice={setSelectedChoice} answerText={answerText} setAnswerText={setAnswerText} matchingMap={matchingMap} setMatchingMap={setMatchingMap} spell={spell} setSpell={setSpell} thinkSpellTimeUp={thinkSpellTimeUp} />
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
              "--sp-submit-accent": gameplayAccent,
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
  return <MatchingConnectorGame config={cfg} valueMap={matchingMap} onChange={setMatchingMap} disabled={disabled} questionKey={q?.id || q?.prompt || "matching"} />;
}
function GuessWord4PicsTemplate({ disabled, cfg, spell, setSpell }) {
  const [zoomedImage, setZoomedImage] = useState(null);
  const images = Array.isArray(cfg.images) ? cfg.images : [];
  const target = String(cfg.target ?? "");
  const answerLen = Math.max(1, countAnswerLetters(target));

  useEffect(() => {
    if (spell.mode === "pics4" && spell.target === target && spell.bank?.length) return;
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

  const guessBankSignature = bank.map((tile) => `${tile.id}:${tile.ch}`).join("|");
  const guessBuilt = String(spell.built || "");
  useEffect(() => {
    const onKeyDown = (event) => {
      if (disabled || event.ctrlKey || event.metaKey || event.altKey) return;
      const targetEl = event.target;
      if (targetEl instanceof HTMLElement && (targetEl.tagName === "INPUT" || targetEl.tagName === "TEXTAREA" || targetEl.isContentEditable)) return;
      if (event.key === "Backspace") {
        if (guessBuilt) { event.preventDefault(); setSpell((current) => ({ ...current, built: String(current.built || "").slice(0, -1) })); }
        return;
      }
      if (!/^[a-zA-Z]$/.test(event.key) || guessBuilt.length >= answerLen) return;
      const pressed = event.key.toUpperCase();
      const tile = bank.find((candidate) => !usedIds.has(candidate.id) && String(candidate.ch || "").toUpperCase() === pressed);
      if (!tile) return;
      event.preventDefault();
      tap(tile.id, tile.ch);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [disabled, answerLen, guessBankSignature, guessBuilt]);

  return (
    <div className="pics4-wrap simple-mode">
      <div className="pics4-grid compact-grid">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="pics4-frame compact-frame">
            {images[i] ? <img src={images[i]} alt={`Clue ${i + 1}`} role="button" tabIndex={0} onClick={() => setZoomedImage(images[i])} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setZoomedImage(images[i]); }} /> : <span className="pics4-placeholder">?</span>}
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
            <button type="button" className="spell-ctrl back" onClick={backspace} disabled={disabled || !spell.built}>Back</button>
            <button type="button" className="spell-ctrl clr" onClick={clear} disabled={disabled || !spell.built}>Clear</button>
          </div>
        </div>
      </div>
      {zoomedImage && <div className="sp-image-zoom-backdrop" role="dialog" aria-modal="true" onClick={() => setZoomedImage(null)}><div className="sp-image-zoom-card" onClick={(event) => event.stopPropagation()}><button type="button" className="sp-image-zoom-close" aria-label="Close image" onClick={() => setZoomedImage(null)}><TwIcon name="close" size={22}/></button><img src={zoomedImage} alt="Zoomed clue" /></div></div>}
    </div>
  );
}

function straightThinkSpellPath(startIndex, endIndex, gridSize) {
  const size = Math.max(1, Number(gridSize || 1));
  const start = Number(startIndex);
  const end = Number(endIndex);
  if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
  const startRow = Math.floor(start / size);
  const startCol = start % size;
  const endRow = Math.floor(end / size);
  const endCol = end % size;
  const rowDelta = endRow - startRow;
  const colDelta = endCol - startCol;
  if (rowDelta !== 0 && colDelta !== 0 && Math.abs(rowDelta) !== Math.abs(colDelta)) return null;
  const steps = Math.max(Math.abs(rowDelta), Math.abs(colDelta));
  if (steps === 0) return [start];
  const rowStep = Math.sign(rowDelta);
  const colStep = Math.sign(colDelta);
  return Array.from({ length: steps + 1 }, (_, step) => (startRow + rowStep * step) * size + (startCol + colStep * step));
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

function BookwormThinkSpellTemplate({ disabled, cfg, cor, spell, setSpell, questionId, timeUp = false }) {
  const gridSize = Math.min(12, Math.max(5, Number(cfg.gridSize ?? 8) || 8));
  const minWordLength = Math.min(8, Math.max(2, Number(cfg.minWordLength ?? 3) || 3));
  const wordBank = resolveThinkSpellWordBank({ config: cfg, correct: cor });
  const sig = buildThinkSpellSignature({ questionId, gridSize, words: wordBank });
  const foundEntries = Array.isArray(spell.foundEntries) ? spell.foundEntries : [];
  const foundWords = foundEntries.map((entry) => entry.text || entry.word || "");
  const foundSet = new Set(foundWords.map(normalizeThinkWordKey));
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
    if (disabled || !grid[idx]) return;
    if (!selected.length) {
      setSpell((s) => ({ ...s, selected: [idx], built: String(grid[idx] || "") }));
      return;
    }
    const nextSelected = straightThinkSpellPath(selected[0], idx, activeGridSize);
    if (!nextSelected || nextSelected.some((cellIndex) => !grid[cellIndex])) return;
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

  const previewStatus = (() => {
    if (!built.length) return "";
    if (built.length < minWordLength) return `Need at least ${minWordLength} letters`;
    const matchedKey = matchThinkSpellWord(built, wordBank);
    if (matchedKey && foundSet.has(matchedKey)) return "Already found";
    if (!matchedKey) return "Not on the word list";
    return "Release to add this word";
  })();
  const linePoints = selected.length > 1 ? getPathLinePoints(selected, activeGridSize, 48, cellGap) : [];
  const foundLines = foundEntries
    .map((entry) => Array.isArray(entry?.path) && entry.path.length > 1 ? getPathLinePoints(entry.path.map(Number), activeGridSize, 48, cellGap) : [])
    .filter((points) => points.length > 1);

  return (
    <div className="bword-wrap">
      <div className="bword-game-panel">
      <div className="bword-hud">
        <div className="bword-hud-stat"><span className="bword-hud-label">Found</span><span className="bword-hud-value">{foundEntries.length}/{wordBank.length}</span></div>
      </div>

      {wordBank.length > 0 && (
        <div className="bword-quest-panel">
          <div className="bword-quest-title">Word goals</div>
          {cfg.showWordList !== false ? <div className="bword-quest-list">
            {wordBank.map((word) => {
              const key = normalizeThinkWordKey(word);
              const done = foundSet.has(key);
              return <span key={key} className={`bword-quest-chip${done ? " done" : ""}`}>{done ? "✓ " : ""}{word.toUpperCase()}</span>;
            })}
          </div> : <div className="bword-quest-hidden">Find the hidden words in the grid.</div>}
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
        {(foundLines.length > 0 || linePoints.length > 1) && (
          <svg className="bword-path-line" viewBox={`0 0 ${activeGridSize * 56} ${activeGridSize * 56}`} preserveAspectRatio="none">
            {foundLines.map((points, index) => <polyline key={`found-line-${index}`} className="is-found" points={points.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="rgba(34,197,94,.98)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />)}
            {linePoints.length > 1 && <polyline key={`active-${selected.join("-")}`} className="is-active" points={linePoints.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="rgba(134, 239, 172, 0.95)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />}
          </svg>
        )}
      </div>

      <div className="bword-built-row">
        <div className="spell-display bword-current-word">
          {(built || "•").split("").map((c, i) => <div key={i} className="spell-char" style={{ width: 32, height: 34, background: c === "•" ? "rgba(255,255,255,0.08)" : "var(--sp-spell-char-bg)" }}>{c}</div>)}
        </div>
        <div className={`bword-preview-status${previewStatus.includes("Release") ? " ok" : ""}`}>{previewStatus}</div>
      </div>

      {timeUp && <div className="bword-summary bword-summary-inside">
        <div className="bword-summary-title">Time&apos;s up!</div>
        <div className="bword-summary-meta">You found <b>{foundEntries.length}</b> word{foundEntries.length === 1 ? "" : "s"} · <b>{Number(spell.totalPoints || 0)}</b> pts</div>
        <div className="bword-summary-hint">Wait for the teacher to continue.</div>
      </div>}
      </div>
    </div>
  );
}
function ThinkSpellTemplate({ disabled, cfg, spell, setSpell }) {
  useEffect(() => { if (spell.mode === "think" && spell.target === String(cfg.target ?? "") && spell.bank?.length) return; const d = Number(cfg.dummyLetters || 6), t = String(cfg.target ?? ""), lt = t.toUpperCase().split("").filter(Boolean), al = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"; for (let i = 0; i < d; i++)lt.push(al[Math.floor(Math.random() * al.length)]); for (let i = lt.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[lt[i], lt[j]] = [lt[j], lt[i]]; } setSpell({ mode: "think", target: t, built: "", bank: lt.map((c, i) => ({ id: i, ch: c })) }); }, [cfg.dummyLetters, cfg.target]); const bank = Array.isArray(spell.bank) ? spell.bank.map((x, i) => typeof x === "string" ? { id: i, ch: x } : x) : []; const ui = (() => { const ids = [], bc = spell.built ? spell.built.split("") : [], av = bank.map(b => ({ ...b, taken: false })); for (const ch of bc) { const t = av.find(t => !t.taken && t.ch === ch); if (t) { t.taken = true; ids.push(t.id); } } return ids; })(), us = new Set(ui); function tap(id, ch) { if (disabled || us.has(id)) return; setSpell(s => ({ ...s, built: s.built + ch })); } function bs() { if (disabled || !spell.built) return; setSpell(s => ({ ...s, built: s.built.slice(0, -1) })); } function clr() { if (disabled) return; setSpell(s => ({ ...s, built: "" })); }
  return (<div className="spell-wrap"><div className="spell-display">{(spell.built || "").split("").map((ch, i) => <div key={i} className="spell-char">{ch}</div>)}<div className="spell-cursor" /></div><p className="spell-hint">Tap the letters to spell your answer</p><div className="spell-bank">{bank.map(({ id, ch }) => <button key={id} type="button" className={`spell-tile${us.has(id) ? " used" : ""}`} onClick={() => tap(id, ch)} disabled={disabled || us.has(id)}>{ch}</button>)}</div><div className="spell-controls"><button type="button" className="spell-ctrl back" onClick={bs} disabled={disabled || !spell.built}>Back</button><button type="button" className="spell-ctrl clr" onClick={clr} disabled={disabled || !spell.built}>Clear</button></div></div>);
}
function TypeAnswerTemplate({ disabled, answerText, setAnswerText }) { const MAX = 255; return (<div className="type-wrap"><div className="type-center-shell"><p className="type-label">Type your identification answer below</p><div className={`type-input-row${disabled ? " locked" : ""}`}><input className="type-input" value={answerText} onChange={e => setAnswerText(e.target.value.slice(0, MAX))} placeholder="Start typing..." disabled={disabled} autoFocus autoComplete="off" spellCheck={false} maxLength={MAX} />{!disabled && answerText && <button type="button" className="type-clear-btn" onClick={() => setAnswerText("")}>✕</button>}</div><div className="type-count">{answerText.length} / {MAX}</div></div></div>); }
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
  setSpell,
  thinkSpellTimeUp = false
}) {
  const cfg = q?.config_json || {};
  const cor = q?.correct_json || {};

  if (templateType === "MCQ") {
    const opts = Array.isArray(cfg.options) ? cfg.options.map(normalizeChoiceOption) : [];
    const labels = "ABCDEFGHIJ".split("");
    const isModifiedMcq = cfg.mcqMode === "MODIFIED";
    const twoMode = cfg.answerMode === "TWO";
    const selectedList = Array.isArray(selectedChoice) ? selectedChoice : [selectedChoice].filter(Boolean);
    function toggleChoice(value) {
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
      <div className="quiz-choices true-false-choices">
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
        timeUp={thinkSpellTimeUp}
      />
    );
  }
  return <TypeAnswerTemplate disabled={disabled} answerText={answerText} setAnswerText={setAnswerText} />;
}
