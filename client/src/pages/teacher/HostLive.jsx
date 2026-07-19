import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { makeSocket } from "../../lib/socket";
import { QRCodeCanvas } from "qrcode.react";
import { useTheme } from "../../context/ThemeContext";
import ActionDialog, { primaryBtn, secondaryBtn } from "../../components/ActionDialog";
import { normalizeTemplateType } from "../../lib/templateTypes";
import { templateAccent } from "../../lib/templatePalette";
import ThemeIconButton from "../../components/ThemeIconButton";
import { TwIcon } from "../../components/TwUI";

export default function HostLive({ guestMode = false }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { dark, toggleTheme } = useTheme();
  const [state, setState] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [roster, setRoster] = useState([]);
  const [groups, setGroups] = useState([]);
  const [scores, setScores] = useState([]);
  const [msg, setMsg] = useState("");
  const [starting, setStarting] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [nowMs, setNowMs] = useState(Date.now());
  const [answeredCount, setAnsweredCount] = useState(0);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [confirmAction, setConfirmAction] = useState(null);
  const [deleteGroupTarget, setDeleteGroupTarget] = useState(null);
  const [allAnsweredPrompt, setAllAnsweredPrompt] = useState(false);
  const [finishedPrompt, setFinishedPrompt] = useState(false);
  const [autoNextCount, setAutoNextCount] = useState(5);
  const socketRef = useRef(null);
  const lastTeacherActionRef = useRef(Date.now());
  const lastQuestionEndedAtRef = useRef(null);

  const accent = templateAccent(state?.template_type);
  const C = dark
    ? { pageBg: `linear-gradient(180deg,#07111f,${accent}18 55%,#0e1733)`, cardBg: "#0c172d", cardBg2: "#091325", border: `${accent}56`, text: "#e7e9ee", muted: "#8a9bc4", accent, headerBg: "#0d1428" }
    : { pageBg: `linear-gradient(180deg,#f8fbff,${accent}14 55%,#e6eeff)`, cardBg: "#ffffff", cardBg2: `${accent}0d`, border: `${accent}4f`, text: "#0f172a", muted: "#4b5f92", accent, headerBg: "#f5f8ff" };

  useEffect(() => {
    Promise.all([api.get(`/sessions/${id}/state`), api.get("/auth/me")])
      .then(([sessionRes]) => {
        const data = sessionRes.data;
        setState(data.session);
        setQuestions(data.questions || []);
        setRoster(data.participants || []);
        setGroups(data.groups || []);
        setScores(data.scores || []);
      })
      .catch(() => { if (!guestMode) setMsg("Could not load session."); });
  }, [id]);

  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 200);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const markActivity = () => { lastTeacherActionRef.current = Date.now(); };
    window.addEventListener("pointerdown", markActivity, { passive: true });
    window.addEventListener("keydown", markActivity);
    return () => {
      window.removeEventListener("pointerdown", markActivity);
      window.removeEventListener("keydown", markActivity);
    };
  }, []);

  useEffect(() => {
    const socket = makeSocket();
    socketRef.current = socket;
    socket.on("connect", () => socket.emit("teacher:join", { sessionId: Number(id) }));
    socket.on("teacher:error", (payload) => setMsg(payload?.message || "Action could not be completed."));
    socket.on("session:state", (payload) => {
      setState(payload.state);
      setQuestions(payload.questions || []);
      if (payload.state?.server_now) setClockOffsetMs(Date.now() - new Date(payload.state.server_now).getTime());
      setAnsweredCount(0);
      setAllAnsweredPrompt(false);
      setFinishedPrompt(false);
      setAutoNextCount(5);
    });
    socket.on("roster:update", (rows) => setRoster(rows || []));
    socket.on("groups:update", (rows) => setGroups(rows || []));
    socket.on("scores:update", (rows) => setScores(rows || []));
    socket.on("answer:received", () => setAnsweredCount((value) => value + 1));
    socket.on("tab:updated", ({ participantId, count }) => setRoster((rows) => rows.map((row) => Number(row.id) === Number(participantId) ? { ...row, tab_out_count: count } : row)));
    const heartbeat = setInterval(() => socket.emit("teacher:heartbeat", { sessionId: Number(id) }), 5000);
    return () => { clearInterval(heartbeat); socket.disconnect(); };
  }, [id]);

  const currentQ = useMemo(() => state ? questions[Number(state.current_question_index || 0)] || null : null, [state, questions]);
  const isGuestHost = guestMode || !!state?.is_guest_host;
  const isEnded = state?.status === "ENDED";
  const isLive = state?.status === "LIVE";
  const isPaused = state?.status === "PAUSED";
  const joinMode = state?.join_mode || "SOLO";
  const isLast = !!state && Number(state.current_question_index || 0) >= Math.max(0, questions.length - 1);
  const activeRoster = roster.filter((row) => !row.kicked_at);
  const connected = activeRoster.filter((row) => Number(row.connected) === 1).length;
  const unassigned = activeRoster.filter((row) => !row.group_id);
  const canStart = joinMode !== "GROUP" || (groups.length > 0 && unassigned.length === 0);
  const expected = joinMode === "GROUP"
    ? groups.filter((group) => (group.members || []).some((member) => Number(member.connected) === 1)).length
    : connected;
  const sortedRoster = useMemo(() => [...roster].sort((a, b) => `${a.last_name || ""} ${a.first_name || ""}`.localeCompare(`${b.last_name || ""} ${b.first_name || ""}`)), [roster]);
  const leaders = useMemo(() => [...scores].sort((a, b) => Number(b.total_points || 0) - Number(a.total_points || 0)).slice(0, 3), [scores]);

  useEffect(() => {
    if (!isLive || expected <= 0 || answeredCount < expected) return;
    if (isLast) setFinishedPrompt(true);
    else { setAutoNextCount(5); setAllAnsweredPrompt(true); }
  }, [answeredCount, expected, isLive, isLast]);

  useEffect(() => {
    if (!allAnsweredPrompt) return undefined;
    if (autoNextCount <= 0) {
      setAllAnsweredPrompt(false);
      nextQuestion();
      return undefined;
    }
    const timeout = setTimeout(() => setAutoNextCount((value) => value - 1), 1000);
    return () => clearTimeout(timeout);
  }, [allAnsweredPrompt, autoNextCount]);

  const timer = useMemo(() => {
    const total = Number(currentQ?.config_json?.timeLimitSec || state?.time_limit_sec || 0);
    if (!currentQ) return { remainingSec: 0, progress: 0, total };
    if (isPaused) {
      const pausedRemaining = Number(state?.paused_remaining_sec);
      if (Number.isFinite(pausedRemaining) && pausedRemaining >= 0) return { remainingSec: pausedRemaining, progress: total ? pausedRemaining / total : 0, total };
    }
    if (!isLive) return { remainingSec: 0, progress: 0, total };
    const deadline = state?.question_deadline_at
      ? new Date(state.question_deadline_at).getTime()
      : state?.question_started_at
        ? new Date(state.question_started_at).getTime() + total * 1000
        : 0;
    const remaining = Math.max(0, Math.ceil((deadline - (nowMs - clockOffsetMs)) / 1000));
    return { remainingSec: remaining, progress: total ? remaining / total : 0, total };
  }, [currentQ, state, isLive, isPaused, nowMs, clockOffsetMs]);

  useEffect(() => {
    if (!(isLive && isLast && currentQ && timer.remainingSec === 0)) {
      lastQuestionEndedAtRef.current = null;
      return undefined;
    }
    if (!lastQuestionEndedAtRef.current) {
      lastQuestionEndedAtRef.current = Date.now();
      lastTeacherActionRef.current = Date.now();
    }
    const interval = setInterval(() => {
      const inactiveSince = Math.max(lastQuestionEndedAtRef.current || 0, lastTeacherActionRef.current || 0);
      if (Date.now() - inactiveSince >= 3 * 60 * 1000) {
        socketRef.current?.emit("teacher:setStatus", { sessionId: Number(id), status: "ENDED" });
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [id, isLive, isLast, currentQ?.id, timer.remainingSec]);

  async function startWithCountdown() {
    if (starting) return;
    if (!canStart) { setMsg("Create groups and assign all joined students before starting."); return; }
    setStarting(true);
    for (let value = 3; value >= 1; value -= 1) {
      setCountdown(value);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    setCountdown(0);
    socketRef.current?.emit("teacher:setStatus", { sessionId: Number(id), status: "LIVE" });
    setStarting(false);
  }

  function nextQuestion() {
    if (!isLive || isLast) return;
    socketRef.current?.emit("teacher:nextQuestion", { sessionId: Number(id) });
  }

  async function runConfirmed() {
    const action = confirmAction;
    setConfirmAction(null);
    if (action === "toggle") {
      if (isLive) socketRef.current?.emit("teacher:setStatus", { sessionId: Number(id), status: "PAUSED" });
      else if (isPaused) socketRef.current?.emit("teacher:setStatus", { sessionId: Number(id), status: "LIVE" });
      else await startWithCountdown();
    }
    if (action === "end") socketRef.current?.emit("teacher:setStatus", { sessionId: Number(id), status: "ENDED" });
  }

  if (!state) return <div style={{ minHeight: "100vh", background: C.pageBg, display: "grid", placeItems: "center", color: C.muted }}>Loading session…</div>;

  const startLabel = starting ? `Starting in ${countdown}…` : isLive ? "Pause" : isPaused ? "Resume" : "Start";
  const joinUrl = `${window.location.origin}/play?code=${encodeURIComponent(state.join_code || "")}`;
  const disableControl = starting || (isLast && isLive && timer.remainingSec === 0);

  return <div className="tw-host-live tw-host-live-v24 tw-host-live-v25" style={{ minHeight: "100vh", background: C.pageBg, color: C.text, "--host-accent": C.accent, "--host-soft": `${C.accent}18` }}>
    <header className="tw-host-header" style={{ background: C.headerBg, borderColor: C.border }}>
      <div>
        <div className="tw-host-brand"><span>Think</span><span>WAVE</span><small>Host Panel</small></div>
        <div className="tw-host-status"><StatusPill label={state.status} kind={isLive ? "green" : isEnded ? "neutral" : "yellow"}/>{!isGuestHost && <StatusPill label={joinMode === "GROUP" ? "Group Mode" : "Solo Mode"} kind="blue"/>}{msg && <span style={{ color: C.muted }}>{msg}</span>}</div>
      </div>
      <div className="tw-host-actions">
        <ThemeIconButton dark={dark} onClick={toggleTheme} style={{ ...btnStyle(C, "ghost"), width: 40, height: 40, padding: 0, border: `1px solid ${C.border}` }}/>
        {isEnded && <button onClick={() => navigate(isGuestHost ? "/guest" : "/teacher", { state: { tab: isGuestHost ? "history" : "home" } })} style={btnStyle(C, "primary")}><TwIcon name="home" size={17}/> Dashboard</button>}
        {!isEnded && <>
          <button onClick={() => setConfirmAction("toggle")} disabled={disableControl} style={btnStyle(C, "primary")}><TwIcon name={isLive ? "pause" : "play"} size={17}/>{startLabel}</button>
          <button onClick={() => setConfirmAction("end")} style={btnStyle(C, "danger")}><TwIcon name="stop" size={17}/> End</button>
        </>}
      </div>
    </header>

    <main className="tw-host-main tw-host-main-v24">
      <section className="tw-host-scoreboard" style={card(C)}>
        <div className="tw-host-section-title"><h3><TwIcon name="trophy" size={21}/>Top Scores</h3></div>
        <Podium leaders={leaders} C={C}/>
      </section>

      {!isEnded ? <div className="tw-host-content-grid">
        <section className="tw-host-question-card" style={card(C)}>
          <div className="tw-host-question-head">
            <div><h2>{state.quiz_title || "ThinkWAVE"}</h2><span>{state.template_type === "MATCHING" ? "Batch" : "Question"} {Number(state.current_question_index || 0) + 1} of {questions.length}</span></div>
            <div className="tw-host-question-meta">
              <StatusPill label={`${answeredCount}/${expected} answered`} kind="blue"/>
              <StatusPill label={fmtTime(timer.remainingSec)} kind={timer.remainingSec <= 5 && isLive ? "red" : "neutral"}/>
              {isLive && !isLast && <button onClick={nextQuestion} style={btnStyle(C, "secondary")}><TwIcon name="arrowRight" size={17}/> Next</button>}
            </div>
          </div>
          <div className="tw-host-progress" style={{ background: C.border }}><div style={{ width: `${Math.round(timer.progress * 100)}%`, background: timer.remainingSec <= 5 ? "#ef4444" : C.accent }}/></div>
          <div className="tw-host-prompt" style={{ background: C.cardBg2, borderColor: C.border }}><h3>{currentQ?.prompt || "Waiting for the first question"}</h3>{currentQ && <QuestionPreview q={currentQ} templateType={state.template_type} C={C}/>}</div>
        </section>
        <div className="tw-host-right-stack">
          <section className="tw-host-attendance" style={card(C)}>
            <div className="tw-host-section-title"><h3><TwIcon name="users" size={21}/> {isGuestHost ? "Participants" : "Student Attendance"}</h3><span style={{ color: C.muted, fontSize: 12 }}>{activeRoster.length} joined</span></div>
            <div className="tw-host-attendance-scroll">{sortedRoster.map((row) => <AttendanceRow key={row.id} row={row} score={scores.find((score) => Number(score.participant_id) === Number(row.id))?.total_points || 0} C={C}/>)}{!sortedRoster.length && <div style={{ color: C.muted, textAlign: "center", padding: 24 }}>No participants have joined yet.</div>}</div>
          </section>
          <section className="tw-host-join" style={card(C)}>
            <div className="tw-host-section-title"><h3><TwIcon name="qr" size={21}/> {isGuestHost ? "Join Code" : "Guest Join"}</h3><b style={{ color: C.accent, letterSpacing: ".18em" }}>{state.join_code}</b></div>
            <div className="tw-host-qr"><QRCodeCanvas value={joinUrl} size={116} bgColor="#ffffff" fgColor="#0f172a" includeMargin/></div>
            {joinMode === "GROUP" && state.status === "LOBBY" && <div className="tw-host-group-tools"><button onClick={() => socketRef.current?.emit("teacher:addGroup", { sessionId: Number(id) })} style={btnStyle(C, "secondary")}><TwIcon name="plus" size={15}/> Add Group</button><div>{groups.map((group) => <button key={group.id} onClick={() => setDeleteGroupTarget(group)} style={btnStyle(C, "ghost")}>{group.display_name} ({group.members?.length || 0})</button>)}</div></div>}
          </section>
        </div>
      </div> : <section style={card(C)}><div className="tw-host-ended-card"><TwIcon name="check" size={58}/><h2>Session ended</h2><button onClick={() => navigate(isGuestHost ? `/guest/analytics/${id}` : `/teacher/analytics/${id}`)} style={btnStyle(C, "primary")}><TwIcon name="chart" size={17}/> Open Analytics</button></div></section>}
    </main>

    <ActionDialog open={!!confirmAction} icon={<TwIcon name={confirmAction === "end" ? "stop" : isLive ? "pause" : "play"} size={28}/>} title={confirmAction === "end" ? "End this session?" : isLive ? "Pause this session?" : isPaused ? "Resume this session?" : "Start this session?"} message={isLive && confirmAction !== "end" ? "The question timer and gameplay will pause for everyone." : ""} onClose={() => setConfirmAction(null)}><button onClick={() => setConfirmAction(null)} style={secondaryBtn(C, dark)}>Cancel</button><button onClick={runConfirmed} style={primaryBtn({ bg: C.accent, fg: "#fff", border: C.accent })}>{confirmAction === "end" ? "End" : isLive ? "Pause" : isPaused ? "Resume" : "Start"}</button></ActionDialog>
    <ActionDialog open={allAnsweredPrompt} icon={<TwIcon name="check" size={28}/>} title="Everyone has answered" message="" onClose={() => setAllAnsweredPrompt(false)}><button onClick={() => setAllAnsweredPrompt(false)} style={secondaryBtn(C, dark)}>Wait</button><button onClick={() => { setAllAnsweredPrompt(false); nextQuestion(); }} style={primaryBtn({ bg: C.accent, fg: "#fff", border: C.accent })}>Go to next ({autoNextCount})</button></ActionDialog>
    <ActionDialog open={finishedPrompt} icon={<TwIcon name="trophy" size={28}/>} title="Everyone has finished answering" message="You can end the session when you are ready." onClose={() => setFinishedPrompt(false)}><button onClick={() => setFinishedPrompt(false)} style={secondaryBtn(C, dark)}>Review scores</button><button onClick={() => { setFinishedPrompt(false); setConfirmAction("end"); }} style={primaryBtn({ bg: C.accent, fg: "#fff", border: C.accent })}>End session</button></ActionDialog>
    <ActionDialog open={!!deleteGroupTarget} tone="red" icon={<TwIcon name="trash" size={28}/>} title="Delete group?" message={deleteGroupTarget ? `Delete ${deleteGroupTarget.display_name}? Its students will return to the waiting list.` : ""} onClose={() => setDeleteGroupTarget(null)}><button onClick={() => setDeleteGroupTarget(null)} style={secondaryBtn(C, dark)}>Cancel</button><button onClick={() => { socketRef.current?.emit("teacher:deleteGroup", { sessionId: Number(id), groupId: deleteGroupTarget.id }); setDeleteGroupTarget(null); }} style={primaryBtn({ bg: "#fee2e2", fg: "#dc2626", border: "#fca5a5" })}>Delete</button></ActionDialog>
  </div>;
}

function Podium({ leaders, C }) {
  const order = [leaders[1], leaders[0], leaders[2]];
  const places = [2, 1, 3];
  return <div className="tw-host-podium">{order.map((row, index) => { const place = places[index]; const name = row ? (row.group_name || `${row.first_name || ""} ${row.last_name || ""}`.trim()) : "Waiting…"; return <div key={place} className={`tw-host-podium-place place-${place}`}><div className="tw-host-podium-number">{place}</div><b>{name}</b><span style={{ color: C.muted }}>{Number(row?.total_points || 0)} pts</span></div>; })}</div>;
}
function AttendanceRow({ row, score, C }) { const count = Number(row.tab_out_count || 0); const kicked = !!row.kicked_at || count >= 3; const indicator = kicked ? "#ef4444" : Number(row.connected) === 1 ? "#22c55e" : "#94a3b8"; const tabColor = count >= 3 ? "#ef4444" : count === 2 ? "#f97316" : "#94a3b8"; return <div className="tw-host-attendance-row" style={{ borderColor: C.border, background: C.cardBg2 }}><span className="tw-host-online-dot" style={{ background: indicator }}/><span className="tw-host-student-name">{row.first_name} {row.last_name}</span><b>{Number(score)} pts</b>{kicked ? <span className="tw-host-kicked">Kicked</span> : <span/>}<span style={{ color: tabColor, fontSize: 12, fontWeight: 800 }}>{count} tab out{count === 1 ? "" : "s"}</span></div>; }
function QuestionPreview({ q, templateType, C }) { const cfg = q?.config_json || {}; const tt = normalizeTemplateType(templateType); if (tt === "MCQ" || tt === "TRUE_FALSE") return <div className="tw-host-options">{(Array.isArray(cfg.options) ? cfg.options : []).map((option, i) => { const text = typeof option === "object" ? option.text : option; const image = typeof option === "object" ? option.image : ""; return <div key={i} style={{ background: C.cardBg, borderColor: C.border }}><span>{String.fromCharCode(65 + i)}</span>{image && <img src={image} alt=""/>}<b>{text || "Image option"}</b></div>; })}</div>; if (tt === "MATCHING") return <div className="tw-host-matching-preview"><div>{(cfg.colA || []).map((row, i) => <span key={i}>{row?.text || `Item ${i + 1}`}</span>)}</div><div>{[...(cfg.colB || []), ...(cfg.dummyB || [])].map((row, i) => <span key={i}>{row?.text || `Choice ${i + 1}`}</span>)}</div></div>; if (tt === "GUESS_WORD_4PICS") return <div className="tw-host-pics">{[0, 1, 2, 3].map((i) => <div key={i}>{cfg.images?.[i] ? <img src={cfg.images[i]} alt=""/> : "?"}</div>)}</div>; return <div style={{ color: C.muted }}>Student interaction is shown on each learner’s screen.</div>; }
function StatusPill({ label, kind = "neutral" }) { const palette = kind === "green" ? { bg: "#22c55e20", fg: "#22c55e", br: "#22c55e55" } : kind === "yellow" ? { bg: "#fbbf2420", fg: "#f59e0b", br: "#fbbf2455" } : kind === "red" ? { bg: "#ef444420", fg: "#ef4444", br: "#ef444455" } : kind === "blue" ? { bg: "#2b6cff20", fg: "#6792ff", br: "#2b6cff55" } : { bg: "#94a3b820", fg: "#94a3b8", br: "#94a3b855" }; return <span style={{ padding: "5px 11px", borderRadius: 999, fontSize: 12, fontWeight: 850, background: palette.bg, color: palette.fg, border: `1px solid ${palette.br}` }}>{label}</span>; }
function fmtTime(sec) { const value = Math.max(0, Number(sec || 0)); return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`; }
function card(C) { return { background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 20, padding: 20, boxShadow: `0 18px 42px ${C.accent}16` }; }
function btnStyle(C, variant) { const base = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "10px 15px", borderRadius: 11, fontSize: 13, fontWeight: 800, cursor: "pointer", transition: "all .2s", fontFamily: "inherit" }; if (variant === "primary") return { ...base, background: C.accent, color: "#fff", border: `1px solid ${C.accent}` }; if (variant === "danger") return { ...base, background: "#ef444420", color: "#ef4444", border: "1px solid #ef444455" }; return { ...base, background: C.cardBg2, color: C.text, border: `1px solid ${C.border}` }; }
