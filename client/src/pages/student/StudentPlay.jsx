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
        borderRadius: 14,
        fontSize: 12,
        fontWeight: 700,
        color: dark ? "#dbe7ff" : "#17305f",
        border: dark ? "1px solid rgba(191,208,255,0.18)" : "1px solid rgba(43,108,255,0.18)",
        background: dark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.88)",
        cursor: "pointer",
        transition: "background 0.25s, color 0.25s, border-color 0.25s, transform 0.18s, box-shadow 0.25s",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        whiteSpace: "nowrap",
        ...(style || {}),
      }}
    >
      <span style={{ fontSize: 13 }}>{dark ? "☀️" : "🌙"}</span>
      <span>{dark ? "Light" : "Dark"}</span>
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

  const socketRef = useRef(null);
  const currentQRef = useRef(null);
  const renameTimer = useRef(null);
  const completeTimer = useRef(null);
  const participantId = Number(localStorage.getItem("qz_participantId") || "0");
  const reconnectKey = localStorage.getItem("qz_reconnectKey") || "";

  const pageBg = dark ? "radial-gradient(circle at top left, rgba(43,108,255,0.18), transparent 32%), radial-gradient(circle at bottom right, rgba(34,197,94,0.10), transparent 26%), linear-gradient(180deg, #07111f 0%, #0b1530 46%, #0e1733 100%)" : "radial-gradient(circle at top left, rgba(43,108,255,0.15), transparent 34%), radial-gradient(circle at bottom right, rgba(56,189,248,0.12), transparent 28%), linear-gradient(180deg, #f8fbff 0%, #edf4ff 48%, #e6eeff 100%)";
  const cardBg = dark ? "#0e1733" : "#ffffff";
  const cardBor = dark ? "#1e2d55" : "#c7d2fe";
  const textC = dark ? "#e7e9ee" : "#0f172a";
  const mutedC = dark ? "#8a9bc4" : "#5a6a9a";

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
    s.on("student:connected", () => { void soundManager.startBGM(); });
    s.on("student:error", (e) => setMsg(e?.message || "Could not join the session."));
    s.on("session:state", (payload) => {
      setState((prev) => {
        const prevIdx = prev?.current_question_index;
        const newIdx = payload.state?.current_question_index;
        if (prevIdx !== undefined && prevIdx !== newIdx) {
          setShowFeedback(true);
          setPostAnswerPhase(null);
          setTimeout(() => {
            setShowFeedback(false);
            setFeedbackQ(null);
            setAnswerText("");
            setSelectedChoice("");
            setMatchingMap({});
            setSpell({ built: "", bank: [] });
            setSubmittedQId(null);
            setSubmitLabel("Submit");
            setProposalStatus("");
            setGroupProposal(null);
          }, 2000);
        }
        return payload.state;
      });
      setQuestions(payload.questions || []);
      if (payload.state?.server_now) setClockOffsetMs(Date.now() - new Date(payload.state.server_now).getTime());
      if (payload.state?.status === "LIVE") void soundManager.startBGM();
      if (payload.state?.status === "ENDED") {
        soundManager.stopBGM();
        setPostAnswerPhase(null);
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
        setProposalStatus(payload?.message || "Your group rejected that answer.");
        setSubmittedQId(null);
        setSubmitLabel("Submit");
      }
      setTimeout(() => {
        setGroupProposal(null);
        setProposalStatus("");
      }, 1400);
    });
    s.on("answer:ack", (a) => {
      if (a?.locked && currentQRef.current?.id) setSubmittedQId(currentQRef.current.id);
      if (a.message) {
        setSubmitLabel(a.message);
        return;
      }
      setFeedbackQ({ isCorrect: a.isCorrect, points: a.points });
      setSubmitLabel(a.viaGroup ? "Group Submitted ✓" : a.isCorrect ? "Submitted ✓" : "Submitted");
      const isLast = currentQRef.current && stateRef.current && Number(stateRef.current.current_question_index || 0) >= Math.max(0, questionCountRef.current - 1);
      if (isLast) {
        setPostAnswerPhase("complete");
        clearTimeout(completeTimer.current);
        completeTimer.current = setTimeout(() => setPostAnswerPhase("wait"), 4000);
      }
      if (a.isCorrect) void soundManager.play("correct");
      else void soundManager.play("wrong");
    });

    return () => {
      clearTimeout(completeTimer.current);
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
  const interactionLocked = !currentQ || submittedQId === currentQ?.id || state?.status !== "LIVE" || countdown > 0 || timer.remainingSec === 0 || postAnswerPhase === "complete" || postAnswerPhase === "wait";
  const isLocked = interactionLocked || isMatchingIncomplete;

  function submit() {
    if (isLocked) return;
    const tt = state.template_type;
    let answer;
    if (tt === "MCQ" || tt === "TRUE_FALSE") answer = { choice: selectedChoice };
    else if (tt === "MATCHING") answer = { pairs: Object.keys(matchingMap).map(k => ({ aIndex: Number(k), bIndex: Number(matchingMap[k]) })).sort((a, b) => a.aIndex - b.aIndex) };
    else answer = { text: tt === "THINK_SPELL" ? spell.built : answerText };
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

  if (state?.status === "ENDED") {
    const myScore = scores.find((s) => s.participant_id === participantId);
    const myRank = scores.findIndex((s) => s.participant_id === participantId) + 1;
    return (
      <div style={{ minHeight: "100vh", background: pageBg, fontFamily: "'Segoe UI',system-ui,sans-serif", transition: "background 0.45s, opacity 0.26s", opacity: exiting ? 0 : 1 }}>
        <div className="sp-page-enter" style={{ maxWidth: 640, margin: "0 auto", padding: "32px 16px 48px" }}>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
              <div style={{ fontSize: 52 }}>🏆</div>
                          </div>
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
            <p className="countdown-sub" style={{ color: dark ? "rgba(255,255,255,0.75)" : "#5a6a9a" }}>Quiz is about to start</p>
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

  return (
    <div style={{ minHeight: "100vh", background: pageBg, display: "flex", flexDirection: "column", fontFamily: "'Segoe UI',system-ui,sans-serif", transition: "background 0.45s" }}>
      {showFeedback && feedbackQ && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, background: feedbackQ.isCorrect ? "rgba(34,197,94,0.18)" : "rgba(239,68,68,0.18)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", animation: "twFadeOut 2s ease forwards" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 80, marginBottom: 10 }}>{feedbackQ.isCorrect ? "✅" : "❌"}</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: feedbackQ.isCorrect ? "#22c55e" : "#ef4444" }}>{feedbackQ.isCorrect ? `Correct! +${feedbackQ.points} pts` : "Incorrect"}</div>
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

      <div className="qn-header" style={{ background: dark ? "#0d1428" : "#1e2d55" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div className="qn-subject">{state.quiz_title || "ThinkWAVE"}</div>
          <ThemeTogglePill dark={dark} onClick={toggleTheme} style={{ padding: "6px 11px", fontSize: 12, color: dark ? "#dbe7ff" : "#17305f", border: dark ? "1px solid rgba(219,231,255,0.25)" : "1px solid rgba(43,108,255,0.18)", background: dark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.92)", boxShadow: dark ? "0 12px 22px rgba(0,0,0,0.26)" : "0 12px 22px rgba(43,108,255,0.14)" }} />
        </div>
        <div className="qn-meta">
          <div className="qn-qcount">{state?.template_type === "MATCHING" ? "Batch" : "Q"} {(state.current_question_index || 0) + 1}/{questions.length}</div>
          <div className="qn-timer" style={{ background: timerRed ? "#ef4444" : undefined }}>⏱ {fmtTime(timer.remainingSec ?? Number(timer.total || state.time_limit_sec || 0))}</div>
        </div>
      </div>
      <div className="qn-progress"><div className="qn-progress-bar" style={{ width: `${Math.round((timer.progress || 0) * 100)}%`, background: timerRed ? "#ef4444" : undefined }} /></div>

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
        <div className="qn-prompt-box"><span className="qn-prompt-text">{currentQ.prompt}</span></div>
        <TemplateBody disabled={interactionLocked} templateType={state.template_type} q={currentQ} selectedChoice={selectedChoice} setSelectedChoice={setSelectedChoice} answerText={answerText} setAnswerText={setAnswerText} matchingMap={matchingMap} setMatchingMap={setMatchingMap} spell={spell} setSpell={setSpell} />
        <div style={{ display: "flex", justifyContent: "center", marginTop: 20 }}>
          <button onClick={submit} disabled={isLocked} style={{ padding: "14px 56px", borderRadius: 50, border: "none", background: isLocked ? (dark ? "#1e2d55" : "#c7d7ff") : "#2b6cff", color: isLocked ? mutedC : "#fff", fontSize: 16, fontWeight: 800, cursor: isLocked ? "not-allowed" : "pointer", boxShadow: isLocked ? "none" : "0 10px 28px rgba(43,108,255,0.35)", transition: "all 0.25s" }}>{submitLabel}</button>
        </div>
        {msg && <div style={{ textAlign: "center", color: "#ef4444", fontWeight: 700, marginTop: 12 }}>{msg}</div>}
        {state?.template_type === "MATCHING" && isMatchingIncomplete && <div style={{ textAlign: "center", color: mutedC, fontWeight: 700, marginTop: 12 }}>Match every pair to enable Submit.</div>}
        {isLastQuestion && submittedQId === currentQ?.id && <div style={{ textAlign: "center", color: mutedC, fontWeight: 700, marginTop: 12 }}>You have reached the end.</div>}
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

function fmtTime(sec) { const s = Math.max(0, Number(sec || 0)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; }

const CC_A = ["#b71c1c", "#1a237e", "#1b5e20", "#4a148c", "#e65100", "#006064"], CC_B = ["#c62828", "#283593", "#2e7d32", "#6a1b9a", "#bf360c", "#00838f"], CB_A = ["#e57373", "#5c6bc0", "#66bb6a", "#ab47bc", "#ff7043", "#26c6da"];
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
  const [selectedB, setSelectedB] = useState(null);
  const [hintText, setHintText] = useState("");

  useEffect(() => {
    setSelectedB(null);
    setHintText("");
  }, [questionSeed]);

  function assignToA(aIndex, bIndex) {
    if (disabled || aIndex == null || bIndex == null) return;
    const next = { ...matchingMap };
    Object.keys(next).forEach((key) => {
      if (Number(key) === Number(aIndex)) delete next[key];
      else if (Number(next[key]) === Number(bIndex)) delete next[key];
    });
    next[Number(aIndex)] = Number(bIndex);
    setMatchingMap(next);
    setSelectedB(null);
    setHintText("");
  }

  function clearA(aIndex) {
    const next = { ...matchingMap };
    delete next[Number(aIndex)];
    setMatchingMap(next);
  }

  function handleDrop(aIndex, event) {
    event.preventDefault();
    const raw = event.dataTransfer.getData("text/plain");
    const dropped = Number(raw);
    if (raw !== "" && Number.isInteger(dropped)) assignToA(aIndex, dropped);
  }

  const usedB = new Set(Object.values(matchingMap).map(Number));
  const all = colA.length > 0 && Object.keys(matchingMap).length === colA.length;
  const rowCount = Math.max(orderA.length, orderB.length);

  return (
    <div className="matching-board">
      <div className="matching-bank-title">Match each Column B card to the correct Column A prompt.</div>
      <div className="matching-grid-shell">
        <div className="matching-grid-head">Column A</div>
        <div className="matching-grid-head">Drop zone</div>
        <div className="matching-grid-head">Column B</div>

        {Array.from({ length: rowCount }).map((_, rowIndex) => {
          const ai = orderA[rowIndex];
          const bI = orderB[rowIndex];
          const a = ai !== undefined ? (colA[ai] || {}) : null;
          const itemB = bI !== undefined ? (colB[bI] || {}) : null;
          const assignedBIndex = ai !== undefined && Number.isInteger(matchingMap[ai]) ? Number(matchingMap[ai]) : null;
          const assignedB = assignedBIndex !== null ? colB[assignedBIndex] : null;
          const isUsed = bI !== undefined ? usedB.has(bI) : false;

          return (
            <React.Fragment key={`matching-row-${rowIndex}`}>
              <div className="matching-cell">
                {ai !== undefined ? (
                  <div className="matching-card matching-card-a matching-bar-card" style={{ background: CC_A[rowIndex % CC_A.length] }}>
                    <span className="mc-badge" style={{ background: CB_A[rowIndex % CB_A.length] }}>{ai + 1}</span>
                    <span className="mc-text">
                      {a?.image ? <img src={a.image} alt={a.text || `A${ai + 1}`} style={{ maxWidth: 118, maxHeight: 72, borderRadius: 10, display: "block", marginBottom: a?.text ? 8 : 0 }} /> : null}
                      {a?.text || (a?.image ? "Image prompt" : `A${ai + 1}`)}
                    </span>
                  </div>
                ) : <div className="matching-spacer" />}
              </div>

              <div className="matching-cell">
                {ai !== undefined ? (
                  <div
                    className={["matching-dropzone", "matching-bar-card", assignedB ? "filled" : "", selectedB !== null && !assignedB ? "ready" : ""].join(" ")}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => handleDrop(ai, e)}
                    onClick={() => {
                      if (disabled) return;
                      if (selectedB !== null) assignToA(ai, selectedB);
                      else if (assignedBIndex !== null) clearA(ai);
                      else setHintText("Select or drag a Column B card into the correct drop zone.");
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        if (selectedB !== null) assignToA(ai, selectedB);
                      }
                    }}
                  >
                    {assignedB ? (
                      <>
                        <div className="matching-drop-label">Placed answer</div>
                        <div className="matching-drop-card" style={{ background: CC_B[assignedBIndex % CC_B.length] }}>{assignedB?.text ?? `B${assignedBIndex + 1}`}</div>
                        {!disabled && <button type="button" className="matching-clear-btn" onClick={(e) => { e.stopPropagation(); clearA(ai); }}>Clear</button>}
                      </>
                    ) : (
                      <>
                        <div className="matching-drop-label">Drop here</div>
                        <div className="matching-drop-hint">Place the correct Column B card here.</div>
                      </>
                    )}
                  </div>
                ) : <div className="matching-spacer" />}
              </div>

              <div className="matching-cell">
                {bI !== undefined ? (
                  <button
                    type="button"
                    draggable={!disabled && !isUsed}
                    onDragStart={(e) => {
                      if (disabled || isUsed) return;
                      e.dataTransfer.setData("text/plain", String(bI));
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onClick={() => {
                      if (disabled || isUsed) return;
                      const nextSelected = selectedB === bI ? null : bI;
                      setSelectedB(nextSelected);
                      setHintText(nextSelected !== null ? "Now place the selected Column B card into the correct drop zone." : "");
                    }}
                    className={["matching-card", "matching-card-b", "matching-bar-card", isUsed ? "mc-matched" : "", selectedB === bI ? "mc-selected-b" : ""].join(" ")}
                    style={{ background: CC_B[rowIndex % CC_B.length], cursor: disabled || isUsed ? "not-allowed" : "grab" }}
                    disabled={disabled || isUsed}
                  >
                    <span className="mc-badge">B{bI + 1}</span>
                    <span className="mc-text">{itemB?.text ?? `B${bI + 1}`}</span>
                  </button>
                ) : <div className="matching-spacer" />}
              </div>
            </React.Fragment>
          );
        })}
      </div>
      {all && <div className="matching-complete">All drop zones are filled. Hit Submit when ready.</div>}
      {!all && <div className="matching-hint">{hintText || (selectedB !== null ? "Now place the selected Column B card into the correct drop zone." : "Drag a Column B card into a drop zone, or tap a card then tap a drop zone.")}</div>}
    </div>
  );
}
function GuessWord4PicsTemplate({ disabled, cfg, answerText, setAnswerText }) {
  const images = Array.isArray(cfg.images) ? cfg.images : [];
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
        <p className="pics4-answer-label">Type the word suggested by the four images.</p>
        <TypeAnswerTemplate disabled={disabled} answerText={answerText} setAnswerText={setAnswerText} />
      </div>
    </div>
  );
}
function ThinkSpellTemplate({ disabled, cfg, spell, setSpell }) {
  useEffect(() => { if (spell.bank?.length) return; const d = Number(cfg.dummyLetters || 6), t = String(cfg.target ?? ""), lt = t.toUpperCase().split("").filter(Boolean), al = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"; for (let i = 0; i < d; i++)lt.push(al[Math.floor(Math.random() * al.length)]); for (let i = lt.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[lt[i], lt[j]] = [lt[j], lt[i]]; } setSpell({ built: "", bank: lt.map((c, i) => ({ id: i, ch: c })) }); }, [cfg.dummyLetters, cfg.target]); const bank = Array.isArray(spell.bank) ? spell.bank.map((x, i) => typeof x === "string" ? { id: i, ch: x } : x) : []; const ui = (() => { const ids = [], bc = spell.built ? spell.built.split("") : [], av = bank.map(b => ({ ...b, taken: false })); for (const ch of bc) { const t = av.find(t => !t.taken && t.ch === ch); if (t) { t.taken = true; ids.push(t.id); } } return ids; })(), us = new Set(ui); function tap(id, ch) { if (disabled || us.has(id)) return; setSpell(s => ({ ...s, built: s.built + ch })); } function bs() { if (disabled || !spell.built) return; setSpell(s => ({ ...s, built: s.built.slice(0, -1) })); } function clr() { if (disabled) return; setSpell(s => ({ ...s, built: "" })); }
  return (<div className="spell-wrap"><div className="spell-display">{(spell.built || "").split("").map((ch, i) => <div key={i} className="spell-char">{ch}</div>)}<div className="spell-cursor" /></div><p className="spell-hint">Tap the letters to spell your answer</p><div className="spell-bank">{bank.map(({ id, ch }) => <button key={id} type="button" className={`spell-tile${us.has(id) ? " used" : ""}`} onClick={() => tap(id, ch)} disabled={disabled || us.has(id)}>{ch}</button>)}</div><div className="spell-controls"><button type="button" className="spell-ctrl back" onClick={bs} disabled={disabled || !spell.built}>⌫ Back</button><button type="button" className="spell-ctrl clr" onClick={clr} disabled={disabled || !spell.built}>Clear</button></div></div>);
}
function TypeAnswerTemplate({ disabled, answerText, setAnswerText }) { const MAX = 255; return (<div className="type-wrap"><div className="type-center-shell"><p className="type-label">Type your answer below</p><div className={`type-input-row${disabled ? " locked" : ""}`}><input className="type-input" value={answerText} onChange={e => setAnswerText(e.target.value.slice(0, MAX))} placeholder="Start typing..." disabled={disabled} autoComplete="off" spellCheck={false} maxLength={MAX} />{!disabled && answerText && <button type="button" className="type-clear-btn" onClick={() => setAnswerText("")}>✕</button>}</div>{answerText.length > 0 && <div className="type-charboxes">{answerText.split("").map((ch, i) => <div key={i} className="type-charbox">{ch === " " ? "\u00A0" : ch}</div>)}</div>}<div className="type-count">{answerText.length} / {MAX}</div></div></div>); }
function TemplateBody({ disabled, templateType, q, selectedChoice, setSelectedChoice, answerText, setAnswerText, matchingMap, setMatchingMap, spell, setSpell }) { const cfg = q?.config_json || {}; if (templateType === "MCQ") { const opts = Array.isArray(cfg.options) ? cfg.options : [], labels = "ABCDEFGHIJ".split(""); return (<div className="quiz-choices">{opts.map((o, i) => <button key={i} className={`choice-btn ${selectedChoice === o ? "active" : ""} ${disabled && selectedChoice !== o ? "dimmed" : ""}`} onClick={() => !disabled && setSelectedChoice(o)} type="button" disabled={disabled && selectedChoice !== o}><span className="choice-badge">{labels[i] || ""}</span><span>{o}</span></button>)}</div>); } if (templateType === "TRUE_FALSE") { const opts = Array.isArray(cfg.options) ? cfg.options : []; return (<div className="quiz-choices">{opts.map((o, i) => <button key={i} className={`choice-btn ${selectedChoice === o ? "active" : ""} ${disabled && selectedChoice !== o ? "dimmed" : ""}`} onClick={() => !disabled && setSelectedChoice(o)} type="button" disabled={disabled && selectedChoice !== o}><span className="choice-badge"></span><span>{o}</span></button>)}</div>); } if (templateType === "MATCHING") return <MatchingTemplate disabled={disabled} q={q} cfg={cfg} matchingMap={matchingMap} setMatchingMap={setMatchingMap} />; if (templateType === "GUESS_WORD_4PICS") return <GuessWord4PicsTemplate disabled={disabled} cfg={cfg} answerText={answerText} setAnswerText={setAnswerText} />; if (templateType === "THINK_SPELL") return <ThinkSpellTemplate disabled={disabled} cfg={cfg} spell={spell} setSpell={setSpell} />; return <TypeAnswerTemplate disabled={disabled} answerText={answerText} setAnswerText={setAnswerText} />; }
