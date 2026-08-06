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
import { TeacherPressButton } from "./TeacherUI";
import { TwIcon } from "../../components/TwUI";
import { getSessionBackground } from "../../lib/sessionBackgrounds";
import { buildThinkSpellGrid, buildThinkSpellSeed, buildThinkSpellSignature } from "../../templates/thinkspell/thinkSpell";

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
  const [choiceCounts, setChoiceCounts] = useState({});
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [confirmAction, setConfirmAction] = useState(null);
  const [deleteGroupTarget, setDeleteGroupTarget] = useState(null);
  const [allAnsweredPrompt, setAllAnsweredPrompt] = useState(false);
  const [finishedPrompt, setFinishedPrompt] = useState(false);
  const [autoNextCount, setAutoNextCount] = useState(5);
  const [advanceReason, setAdvanceReason] = useState("answered");
  const socketRef = useRef(null);
  const lastTeacherActionRef = useRef(Date.now());
  const lastQuestionEndedAtRef = useRef(null);
  const timedOutQuestionRef = useRef(null);
  const currentQuestionIndexRef = useRef(null);

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
        setChoiceCounts(data.choiceCounts || {});
        currentQuestionIndexRef.current = Number(data.session?.current_question_index || 0);
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
      const nextQuestionIndex = Number(payload.state?.current_question_index || 0);
      const questionChanged = currentQuestionIndexRef.current !== nextQuestionIndex;
      currentQuestionIndexRef.current = nextQuestionIndex;
      setState(payload.state);
      setQuestions(payload.questions || []);
      if (payload.state?.server_now) setClockOffsetMs(Date.now() - new Date(payload.state.server_now).getTime());
      if (questionChanged) {
        setAnsweredCount(0);
        setChoiceCounts({});
        timedOutQuestionRef.current = null;
      }
      setAllAnsweredPrompt(false);
      setFinishedPrompt(false);
      setAutoNextCount(5);
      setAdvanceReason("answered");
    });
    socket.on("roster:update", (rows) => setRoster(rows || []));
    socket.on("groups:update", (rows) => setGroups(rows || []));
    socket.on("scores:update", (rows) => setScores(rows || []));
    socket.on("answer:received", (payload = {}) => {
      setAnsweredCount((value) => value + 1);
      const keys = Array.isArray(payload.choiceKeys) ? payload.choiceKeys : [];
      if (keys.length) setChoiceCounts((current) => {
        const next = { ...current };
        keys.forEach((key) => { next[key] = Number(next[key] || 0) + 1; });
        return next;
      });
    });
    socket.on("tab:updated", ({ participantId, count }) => setRoster((rows) => rows.map((row) => Number(row.id) === Number(participantId) ? { ...row, tab_out_count: count } : row)));
    const heartbeat = setInterval(() => socket.emit("teacher:heartbeat", { sessionId: Number(id) }), 5000);
    return () => { clearInterval(heartbeat); socket.disconnect(); };
  }, [id, guestMode]);

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
    else { setAdvanceReason("answered"); setAutoNextCount(5); setAllAnsweredPrompt(true); }
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
    const serverNowMs = nowMs - clockOffsetMs;
    const startsAt = state?.question_started_at ? new Date(state.question_started_at).getTime() : 0;
    if (startsAt && startsAt > serverNowMs) {
      return { remainingSec: total, progress: total ? 1 : 0, total };
    }
    const deadline = state?.question_deadline_at
      ? new Date(state.question_deadline_at).getTime()
      : startsAt
        ? startsAt + total * 1000
        : 0;
    const remaining = Math.max(0, Math.ceil((deadline - serverNowMs) / 1000));
    return { remainingSec: remaining, progress: total ? Math.min(1, remaining / total) : 0, total };
  }, [currentQ, state, isLive, isPaused, nowMs, clockOffsetMs]);

  useEffect(() => {
    if (!isLive || !currentQ || timer.remainingSec !== 0 || allAnsweredPrompt || finishedPrompt) return;
    const questionKey = String(currentQ.id ?? state?.current_question_index ?? "");
    if (timedOutQuestionRef.current === questionKey) return;
    timedOutQuestionRef.current = questionKey;
    if (isLast) {
      setFinishedPrompt(true);
      return;
    }
    setAdvanceReason("timeup");
    setAutoNextCount(5);
    setAllAnsweredPrompt(true);
  }, [isLive, isLast, currentQ?.id, state?.current_question_index, timer.remainingSec, allAnsweredPrompt, finishedPrompt]);

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
  const selectedBackground = getSessionBackground(state?.background_key);
  const experienceBackground = selectedBackground
    ? `linear-gradient(${dark ? "rgba(4,12,28,.64),rgba(4,12,28,.72)" : "rgba(255,255,255,.50),rgba(242,247,255,.65)"}), url("${selectedBackground.src}")`
    : C.pageBg;
  const sideBorder = dark ? "rgba(226,232,240,.42)" : "rgba(15,23,42,.28)";
  const joinUrl = `${window.location.origin}/play?code=${encodeURIComponent(state.join_code || "")}`;
  const disableControl = starting || (isLast && isLive && timer.remainingSec === 0);

  return <div className="tw-host-live tw-host-live-v24 tw-host-live-v25" style={{ minHeight: "100vh", backgroundImage: experienceBackground, backgroundSize: "cover", backgroundPosition: "center", backgroundAttachment: "fixed", color: C.text, "--host-accent": C.accent, "--host-soft": `${C.accent}18`, "--host-side-border": sideBorder, "--host-action-icon": dark ? "#fff" : "#0f172a" }}>
    <header className="tw-host-header" style={{ background: C.headerBg, borderColor: C.border }}>
      <div>
        <div className="tw-host-brand"><span>Think</span><span>WAVE</span><small>Host Panel</small></div>
        <div className="tw-host-status"><StatusPill label={state.status} kind={isLive ? "green" : isEnded ? "neutral" : "yellow"}/>{!isGuestHost && <StatusPill label={joinMode === "GROUP" ? "Group Mode" : "Solo Mode"} kind="blue"/>}{msg && <span style={{ color: C.muted }}>{msg}</span>}</div>
      </div>
      <div className="tw-host-actions">
        {isEnded && <TeacherPressButton tone="blue" className="tw-host-action-button tw-host-control-white-icon" icon="home" onClick={() => navigate(isGuestHost ? "/guest" : "/teacher", { state: { tab: isGuestHost ? "history" : "home" } })}>Dashboard</TeacherPressButton>}
        {!isEnded && <>
          <TeacherPressButton tone="blue" className="tw-host-action-button tw-host-control-white-icon" icon={isLive ? "pause" : "play"} onClick={() => setConfirmAction("toggle")} disabled={disableControl}>{startLabel}</TeacherPressButton>
          <TeacherPressButton tone="red" className="tw-host-action-button tw-host-control-white-icon" icon="stop" onClick={() => setConfirmAction("end")}>End</TeacherPressButton>
        </>}
      </div>
    </header>

    <main className="tw-host-main tw-host-main-v24">
      <section className="tw-host-scoreboard" style={{ ...card(C), background: dark ? "#16213c" : "#dbeafe" }}>
        <div className="tw-host-section-title"><h3><TwIcon name="trophy" size={21}/>Top Scores</h3></div>
        <Podium leaders={leaders} C={C}/>
      </section>

      {!isEnded ? <div className="tw-host-content-grid">
        <section className="tw-host-question-card" style={{ ...card(C), border: `4px solid ${C.accent}` }}>
          <div className="tw-host-question-head">
            <div><h2>{state.quiz_title || "Quiz"}</h2><span className="tw-host-question-count">{state.template_type === "MATCHING" ? "Batch" : "Question"} {Number(state.current_question_index || 0) + 1} of {questions.length}</span></div>
            <div className="tw-host-question-meta">
              <StatusPill label={`${answeredCount}/${expected} answered`} kind="blue"/>
              <StatusPill label={`${Number(currentQ?.config_json?.points ?? state?.points_per_question ?? 1)} pts`} kind="blue"/>
              <StatusPill label={fmtTime(timer.remainingSec)} kind={timer.remainingSec <= 5 && isLive ? "red" : "green"}/>
              {isLive && !isLast && <TeacherPressButton tone="blue" className="tw-host-action-button tw-host-control-white-icon" icon="arrowRight" onClick={nextQuestion}>Next</TeacherPressButton>}
            </div>
          </div>
          <div className="tw-host-progress" style={{ background: C.border }}><div style={{ width: `${Math.round(timer.progress * 100)}%`, background: timer.remainingSec <= 5 ? "#ef4444" : C.accent }}/></div>
          <div className="tw-host-prompt" style={{ background: C.cardBg2, borderColor: C.border }}><h3 style={{ fontSize: fitHostTextSize(currentQ?.prompt, 31, 17) }}>{currentQ?.prompt || "Waiting for the first question"}</h3>{currentQ && <QuestionPreview q={currentQ} templateType={state.template_type} C={C} choiceCounts={choiceCounts}/>}</div>
        </section>
        <div className="tw-host-right-stack">
          <section className="tw-host-attendance" style={{ ...card(C), border: `3px solid ${sideBorder}` }}>
            <div className="tw-host-section-title"><h3><TwIcon name="users" size={21}/> {isGuestHost ? "Participants" : "Student Attendance"}</h3><span style={{ color: C.muted, fontSize: 12 }}>{activeRoster.length} joined</span></div>
            <div className="tw-host-attendance-scroll">{sortedRoster.map((row) => <AttendanceRow key={row.id} row={row} score={scores.find((score) => Number(score.participant_id) === Number(row.id))?.total_points || 0} C={C}/>)}{!sortedRoster.length && <div style={{ color: C.muted, textAlign: "center", padding: 24 }}>No participants have joined yet.</div>}</div>
          </section>
          <section className="tw-host-join" style={{ ...card(C), border: `3px solid ${sideBorder}` }}>
            <div className="tw-host-section-title"><h3><TwIcon name="qr" size={21}/> {isGuestHost ? "Join Code" : "Guest Join"}</h3><b style={{ color: C.accent, letterSpacing: ".18em" }}>{state.join_code}</b></div>
            <div className="tw-host-qr"><QRCodeCanvas value={joinUrl} size={116} bgColor="#ffffff" fgColor="#0f172a" includeMargin/></div>
            {joinMode === "GROUP" && state.status === "LOBBY" && <div className="tw-host-group-tools"><button onClick={() => socketRef.current?.emit("teacher:addGroup", { sessionId: Number(id) })} style={btnStyle(C, "secondary")}><TwIcon name="plus" size={15}/> Add Group</button><div>{groups.map((group) => <button key={group.id} onClick={() => setDeleteGroupTarget(group)} style={btnStyle(C, "ghost")}>{group.display_name} ({group.members?.length || 0})</button>)}</div></div>}
          </section>
        </div>
      </div> : <section className="tw-host-ended-shell" style={card(C)}><div className="tw-host-ended-card"><TwIcon name="check" size={58}/><h2>Session ended</h2><TeacherPressButton tone="blue" icon="chart" onClick={() => navigate(isGuestHost ? `/guest/analytics/${id}` : `/teacher/analytics/${id}`)}>Open Analytics</TeacherPressButton></div></section>}
    </main>

    <ThemeIconButton dark={dark} onClick={toggleTheme} className="tw-host-floating-theme" size={22} />

    <ActionDialog open={!!confirmAction} plainIcon flatSurface tone={confirmAction === "end" ? "red" : "blue"} icon={<TwIcon name={confirmAction === "end" ? "stop" : isLive ? "pause" : "play"} size={46}/>} title={confirmAction === "end" ? "End this session?" : isLive ? "Pause this session?" : isPaused ? "Resume this session?" : "Start this session?"} message={isLive && confirmAction !== "end" ? "The question timer and gameplay will pause for everyone." : ""} onClose={() => setConfirmAction(null)}><button className="tw-dialog-text-cancel" onClick={() => setConfirmAction(null)}>Cancel</button><button className={`tw-dialog-press ${confirmAction === "end" ? "is-red" : "is-blue"}`} onClick={runConfirmed}><span>{confirmAction === "end" ? "End" : isLive ? "Pause" : isPaused ? "Resume" : "Start"}</span></button></ActionDialog>
    <ActionDialog open={allAnsweredPrompt} icon={<TwIcon name="check" size={28}/>} title={advanceReason === "timeup" ? "Time is up" : "Everyone has answered"} message={advanceReason === "timeup" ? "Moving to the next question even if some participants did not submit." : ""} onClose={() => setAllAnsweredPrompt(false)}><button onClick={() => setAllAnsweredPrompt(false)} style={secondaryBtn(C, dark)}>Wait</button><button onClick={() => { setAllAnsweredPrompt(false); nextQuestion(); }} style={primaryBtn({ bg: C.accent, fg: "#fff", border: C.accent })}>Go to next ({autoNextCount})</button></ActionDialog>
    <ActionDialog open={finishedPrompt} plainIcon flatSurface tone="blue" icon={<TwIcon name="trophy" size={46}/>} title="Everyone has finished answering" message="You can end the session when you are ready." onClose={() => setFinishedPrompt(false)}><button onClick={() => setFinishedPrompt(false)} className="tw-dialog-text-cancel">Review scores</button><button className="tw-dialog-press is-blue" onClick={() => { setFinishedPrompt(false); socketRef.current?.emit("teacher:setStatus", { sessionId: Number(id), status: "ENDED" }); }}><span>End session</span></button></ActionDialog>
    <ActionDialog open={!!deleteGroupTarget} tone="red" icon={<TwIcon name="trash" size={28}/>} title="Delete group?" message={deleteGroupTarget ? `Delete ${deleteGroupTarget.display_name}? Its students will return to the waiting list.` : ""} onClose={() => setDeleteGroupTarget(null)}><button onClick={() => setDeleteGroupTarget(null)} style={secondaryBtn(C, dark)}>Cancel</button><button onClick={() => { socketRef.current?.emit("teacher:deleteGroup", { sessionId: Number(id), groupId: deleteGroupTarget.id }); setDeleteGroupTarget(null); }} style={primaryBtn({ bg: "#fee2e2", fg: "#dc2626", border: "#fca5a5" })}>Delete</button></ActionDialog>
  </div>;
}

function Podium({ leaders, C }) {
  const order = [leaders[1], leaders[0], leaders[2]];
  const places = [2, 1, 3];
  return <div className="tw-host-podium">{order.map((row, index) => {
    const place = places[index];
    const name = row ? (row.group_name || `${row.first_name || ""} ${row.last_name || ""}`.trim()) : "Waiting…";
    return <div key={place} className={`tw-host-podium-place place-${place}`}>
      <div className="tw-host-trophy"><TwIcon name="trophy" size={54} strokeWidth={2.2}/><span>{place}</span></div>
      <div className="tw-host-podium-platform"><b>{name}</b><span className="tw-host-podium-points">{Number(row?.total_points || 0)} pts</span></div>
    </div>;
  })}</div>;
}
function AttendanceRow({ row, score, C }) { const count = Number(row.tab_out_count || 0); const kicked = !!row.kicked_at; const indicator = kicked ? "#ef4444" : Number(row.connected) === 1 ? "#22c55e" : "#94a3b8"; const tabColor = count >= 3 ? "#ef4444" : count === 2 ? "#f97316" : "#94a3b8"; return <div className="tw-host-attendance-row" style={{ borderColor: C.border, background: C.cardBg2 }}><span className="tw-host-online-dot" style={{ background: indicator }}/><span className="tw-host-student-name">{row.first_name} {row.last_name}</span><b>{Number(score)} pts</b>{kicked ? <span className="tw-host-kicked">Kicked</span> : <span/>}<span style={{ color: tabColor, fontSize: 12, fontWeight: 800 }}>{count} tab out{count === 1 ? "" : "s"}</span></div>; }
function QuestionPreview({ q, templateType, C, choiceCounts = {} }) {
  const cfg = q?.config_json || {};
  const correct = q?.correct_json || {};
  const tt = normalizeTemplateType(templateType);

  if (tt === "MCQ" || tt === "TRUE_FALSE") {
    const options = tt === "TRUE_FALSE"
      ? [{ text: "True", image: "" }, { text: "False", image: "" }]
      : (Array.isArray(cfg.options) ? cfg.options : []);
    return <div className="tw-host-options">{options.map((option, i) => {
      const text = typeof option === "object" ? option.text : option;
      const image = typeof option === "object" ? option.image : "";
      const oddLast = options.length % 2 === 1 && i === options.length - 1;
      return <div key={i} className={oddLast ? "is-odd-last" : ""} style={{ background: C.cardBg, borderColor: C.border }}>
        <span>{String.fromCharCode(65 + i)}</span>
        {image && <img src={image} alt=""/>}
        {!(tt === "MCQ" && cfg.mcqMode === "MODIFIED" && image) && <b style={{ fontSize: fitHostTextSize(text, 22, 13) }}>{text || "Image option"}</b>}
        <em className="tw-host-choice-count" aria-label={`${Number(choiceCounts[String(i)] || 0)} responses`}>{Number(choiceCounts[String(i)] || 0)}</em>
      </div>;
    })}</div>;
  }

  if (tt === "TYPE_ANSWER") {
    const answer = String(correct?.text || cfg?.answer || "").trim();
    return <div className="tw-host-identification-answer" style={{ background: C.cardBg, borderColor: C.border }}>
      <b style={{ fontSize: fitHostTextSize(answer || "No answer set", 24, 14) }}>{answer || "No answer set"}</b>
    </div>;
  }

  if (tt === "MATCHING") {
    const colA = Array.isArray(cfg.colA) ? cfg.colA : [];
    const sourceB = Array.isArray(cfg.colB) ? cfg.colB : [];
    const dummyB = Array.isArray(cfg.dummyB) ? cfg.dummyB : [];
    const pairedB = sourceB.slice(0, colA.length);
    const sourceTail = sourceB.slice(colA.length);
    const normalizedDummy = dummyB.length ? dummyB : sourceTail;
    const colB = [...pairedB, ...normalizedDummy];
    return <div className="tw-host-matching-preview">
      <div><h4>Column A</h4>{colA.map((row, i) => <HostMediaChoice key={i} item={row} fallback={`Item ${i + 1}`} C={C}/>)}</div>
      <div><h4>Column B</h4>{colB.map((row, i) => <HostMediaChoice key={i} item={row} fallback={`Choice ${i + 1}`} C={C}/>)}</div>
    </div>;
  }

  if (tt === "GUESS_WORD_4PICS") {
    return <div className="tw-host-pics">{[0, 1, 2, 3].map((i) => <div key={i}>{cfg.images?.[i] ? <img src={cfg.images[i]} alt=""/> : "?"}</div>)}</div>;
  }

  if (tt === "THINK_SPELL") {
    const words = Array.isArray(cfg.answers) && cfg.answers.length ? cfg.answers : (Array.isArray(correct.answers) ? correct.answers : []);
    const requestedGridSize = Math.max(5, Math.min(8, Number(cfg.gridSize || 6)));
    const signature = `${buildThinkSpellSignature({ questionId: 0, gridSize: requestedGridSize, words })}-${Number(cfg.gridSeed || 0)}`;
    const generated = buildThinkSpellGrid({ gridSize: requestedGridSize, words, seed: buildThinkSpellSeed(signature) });
    const gridSize = generated.gridSize;
    const grid = Array.isArray(cfg.grid) && cfg.grid.length === gridSize * gridSize ? cfg.grid : generated.grid;
    return <div className="tw-host-thinkspell-grid" style={{ gridTemplateColumns: `repeat(${gridSize}, minmax(0,1fr))` }}>
      {grid.map((letter, index) => <span key={`${signature}-${index}`}>{String(letter || "").toUpperCase()}</span>)}
    </div>;
  }

  return <div style={{ color: C.muted }}>Student interaction is shown on each learner’s screen.</div>;
}

function HostMediaChoice({ item, fallback, C }) {
  const value = item && typeof item === "object" ? item : { text: String(item || "") };
  const text = String(value.text || "").trim();
  const image = String(value.image || "").trim();
  return <span className="tw-host-media-choice" style={{ background: C.cardBg, borderColor: C.border }}>
    {(text || !image) && <b style={{ fontSize: fitHostTextSize(text || fallback, 18, 12) }}>{text || fallback}</b>}
    {image && <img src={image} alt="" />}
  </span>;
}
function fitHostTextSize(text, max = 24, min = 12) { const length = String(text || "").length; if (length <= 28) return max; if (length >= 150) return min; return Math.max(min, Math.round(max - (length - 28) * ((max - min) / 122))); }
function StatusPill({ label, kind = "neutral" }) { const palette = kind === "green" ? { bg: "#22c55e20", fg: "#22c55e", br: "#22c55e55" } : kind === "yellow" ? { bg: "#fbbf2420", fg: "#f59e0b", br: "#fbbf2455" } : kind === "red" ? { bg: "#ef444420", fg: "#ef4444", br: "#ef444455" } : kind === "blue" ? { bg: "#2b6cff20", fg: "#6792ff", br: "#2b6cff55" } : { bg: "#94a3b820", fg: "#94a3b8", br: "#94a3b855" }; return <span style={{ padding: "5px 11px", borderRadius: 999, fontSize: 12, fontWeight: 850, background: palette.bg, color: palette.fg, border: `1px solid ${palette.br}` }}>{label}</span>; }
function fmtTime(sec) { const value = Math.max(0, Number(sec || 0)); return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`; }
function card(C) { return { background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 20, padding: 20, boxShadow: `0 18px 42px ${C.accent}16` }; }
function btnStyle(C, variant) { const base = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "10px 15px", borderRadius: 11, fontSize: 13, fontWeight: 800, cursor: "pointer", transition: "all .2s", fontFamily: "inherit" }; if (variant === "primary") return { ...base, background: C.accent, color: "#fff", border: `1px solid ${C.accent}` }; if (variant === "danger") return { ...base, background: "#ef444420", color: "#ef4444", border: "1px solid #ef444455" }; return { ...base, background: C.cardBg2, color: C.text, border: `1px solid ${C.border}` }; }
