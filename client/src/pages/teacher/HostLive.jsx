/* FILE GUIDE:
 * client/src/pages/teacher/HostLive.jsx
 * Purpose: Teacher host panel used during active live sessions.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { makeSocket } from "../../lib/socket";
import { QRCodeCanvas } from "qrcode.react";
import { useTheme } from "../../context/ThemeContext";
import ActionDialog, { primaryBtn, secondaryBtn } from "../../components/ActionDialog";

// HostLive is the teacher's live-control screen. It manages session status, question flow, roster/groups, and analytics.
export default function HostLive() {
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
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analytics, setAnalytics] = useState(null);
  const [tabMonitoring, setTabMonitoring] = useState([]);
  const [deleteGroupTarget, setDeleteGroupTarget] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [allAnsweredPrompt, setAllAnsweredPrompt] = useState(false);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const socketRef = useRef(null);

  const C = dark ? {
    pageBg: "radial-gradient(circle at top left, rgba(43,108,255,0.18), transparent 32%), radial-gradient(circle at bottom right, rgba(34,197,94,0.10), transparent 26%), linear-gradient(180deg, #07111f 0%, #0b1530 46%, #0e1733 100%)", cardBg: "rgba(12, 23, 45, 0.92)", cardBg2: "rgba(9, 19, 37, 0.9)", border: "#203154",
    text: "#e7e9ee", muted: "#8a9bc4", sub: "#6b7db3", accent: "#2b6cff", headerBg: "#0d1428",
  } : {
    pageBg: "radial-gradient(circle at top left, rgba(43,108,255,0.15), transparent 34%), radial-gradient(circle at bottom right, rgba(56,189,248,0.12), transparent 28%), linear-gradient(180deg, #f8fbff 0%, #edf4ff 48%, #e6eeff 100%)", cardBg: "rgba(255,255,255,0.88)", cardBg2: "rgba(241,246,255,0.92)", border: "#c8d5f4",
    text: "#0f172a", muted: "#4b5f92", sub: "#5a6a9a", accent: "#2b6cff", headerBg: "#f5f8ff",
  };

  async function loadInitial() {
    const { data } = await api.get(`/sessions/${id}/state`);
    setState(data.session);
    setQuestions(data.questions || []);
    setRoster(data.participants || []);
    setGroups(data.groups || []);
    setScores(data.scores || []);
  }

  async function loadAnalytics() {
    setAnalyticsLoading(true);
    try {
      const [full, tabs] = await Promise.all([
        api.get(`/sessions/${id}/full-analytics`),
        api.get(`/sessions/${id}/tab-monitoring`),
      ]);
      setAnalytics(full.data);
      setTabMonitoring(tabs.data || []);
    } catch {
      setMsg("Could not load analytics.");
    } finally {
      setAnalyticsLoading(false);
    }
  }

  useEffect(() => { loadInitial().catch(() => setMsg("Could not load session.")); }, [id]);
  useEffect(() => { const t = setInterval(() => setNowMs(Date.now()), 200); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (analyticsOpen && state?.status === "ENDED" && !analytics && !analyticsLoading) loadAnalytics();
  }, [analyticsOpen, state?.status]);

  // Host socket subscription keeps the panel synchronized with the backend source of truth.
  useEffect(() => {
    const s = makeSocket();
    socketRef.current = s;
    s.on("connect", () => s.emit("teacher:join", { sessionId: Number(id), token: "" }));
    s.on("teacher:joined", () => setMsg("Connected."));
    s.on("teacher:error", (p) => setMsg(p?.message || "Action could not be completed."));
    s.on("session:state", (p) => {
      setState(p.state);
      setQuestions(p.questions || []);
      if (p.state?.server_now) setClockOffsetMs(Date.now() - new Date(p.state.server_now).getTime());
      setAnsweredCount(0);
      setAllAnsweredPrompt(false);
      if (p.state?.status === "ENDED") setAnalytics(null);
    });
    s.on("roster:update", (r) => setRoster(r || []));
    s.on("groups:update", (g) => setGroups(g || []));
    s.on("scores:update", (sc) => setScores(sc || []));
    s.on("answer:received", () => setAnsweredCount((v) => v + 1));
    const hb = setInterval(() => s.emit("teacher:heartbeat", { sessionId: Number(id) }), 5000);
    return () => { clearInterval(hb); s.disconnect(); };
  }, [id]);

  const currentQ = useMemo(() => state ? questions[state.current_question_index || 0] || null : null, [state, questions]);
  const stepLabel = state?.template_type === "MATCHING" ? "Batch" : "Question";
  const isEnded = state?.status === "ENDED";
  const isLive = state?.status === "LIVE";
  const groupsLocked = state?.status !== "LOBBY";
  const joinMode = state?.join_mode || "SOLO";
  const connectedStudents = roster.filter((p) => p.connected).length;
  const unassignedStudents = roster.filter((p) => !p.group_id);
  const canStartGroup = joinMode !== "GROUP" || (groups.length > 0 && unassignedStudents.length === 0);
  const isLastQuestion = !!state && Number(state.current_question_index || 0) >= Math.max(0, questions.length - 1);
  const expectedAnswerCount = joinMode === 'GROUP'
    ? groups.filter((g) => (g.members || []).some((m) => Number(m.connected) === 1)).length
    : connectedStudents;

  useEffect(() => {
    if (isLive && !isLastQuestion && expectedAnswerCount > 0 && answeredCount >= expectedAnswerCount) setAllAnsweredPrompt(true);
  }, [answeredCount, expectedAnswerCount, isLive, isLastQuestion]);

  const timer = useMemo(() => {
    const total = Number(currentQ?.config_json?.timeLimitSec || currentQ?.timeLimitSec || state?.time_limit_sec || 0);
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

  // Host-side countdown gives the class a short buffer before the live question timer begins.
  async function startWithCountdown() {
    if (starting) return;
    if (joinMode === "GROUP" && !canStartGroup) {
      setMsg("Create groups and assign all joined students before starting.");
      return;
    }
    setStarting(true);
    for (let i = 3; i >= 1; i--) {
      setCountdown(i);
      await new Promise((r) => setTimeout(r, 1000));
    }
    setCountdown(0);
    socketRef.current?.emit("teacher:setStatus", { sessionId: Number(id), status: "LIVE" });
    setStarting(false);
  }

  function next() {
    if (!isLive || isLastQuestion) return;
    socketRef.current?.emit("teacher:nextQuestion", { sessionId: Number(id) });
  }

  function requestDeleteGroup(group) {
    setDeleteGroupTarget(group);
  }

  function confirmDeleteGroup() {
    if (!deleteGroupTarget) return;
    socketRef.current?.emit("teacher:deleteGroup", { sessionId: Number(id), groupId: deleteGroupTarget.id });
    setDeleteGroupTarget(null);
  }

  function queueConfirm(kind) {
    setConfirmAction(kind);
  }

  async function runConfirmedAction() {
    const kind = confirmAction;
    setConfirmAction(null);
    if (kind === 'start') await startWithCountdown();
    if (kind === 'pause') socketRef.current?.emit("teacher:setStatus", { sessionId: Number(id), status: "PAUSED" });
    if (kind === 'next') next();
    if (kind === 'end') socketRef.current?.emit("teacher:setStatus", { sessionId: Number(id), status: "ENDED" });
  }

  async function download(format) {
    if (!isEnded) return;
    try {
      const resp = await api.get(`/analytics/sessions/${id}/export/${format}`, { responseType: "blob" });
      const mime = format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      const url = URL.createObjectURL(new Blob([resp.data], { type: mime }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `session-${id}-records.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setMsg("Export failed.");
    }
  }

  if (!state) return <div style={{ minHeight: "100vh", background: C.pageBg, display: "grid", placeItems: "center", color: C.muted }}>Loading session…</div>;

  return (
    <div style={{ minHeight: "100vh", background: C.pageBg, fontFamily: "'Segoe UI',system-ui,sans-serif", transition: "background 0.35s" }}>
      <div style={{ background: C.headerBg, borderBottom: `1px solid ${C.border}`, padding: "16px 26px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", position: "sticky", top: 0, zIndex: 10 }}>
        <div>
          <div style={{ color: C.text, fontWeight: 900, fontSize: 18 }}><span>Think</span><span style={{ color: C.accent }}>WAVE</span><span style={{ marginLeft: 10, fontSize: 13, color: C.muted, fontWeight: 700 }}>Host Panel</span></div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: C.muted }}>Session #{state.id}</span>
            <StatusPill label={state.status} kind={state.status === "LIVE" ? "green" : state.status === "ENDED" ? "neutral" : "yellow"} />
            <StatusPill label={joinMode === "GROUP" ? "👥 Group Mode" : "👤 Solo Mode"} kind="blue" />
            {state.max_participants ? <StatusPill label={`Cap ${state.max_participants}`} kind="blue" /> : null}
            {msg && <span style={{ fontSize: 11, color: C.sub }}>· {msg}</span>}
            {state.teacher_disconnected_deadline ? <span style={{ fontSize: 11, color: '#f59e0b' }}>· reconnect before {new Date(state.teacher_disconnected_deadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span> : null}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={toggleTheme} style={btnStyle(C, "ghost")}>{dark ? "☀️ Light" : "🌙 Dark"}</button>
          {isEnded ? (
            <button onClick={() => navigate("/teacher")} style={btnStyle(C, "secondary")}>← Dashboard</button>
          ) : (
            <>
              <button onClick={() => queueConfirm('start')} disabled={starting} style={{ ...btnStyle(C, "primary"), opacity: starting ? 0.8 : 1 }}>{starting ? `Starting in ${countdown}…` : state.status === "LIVE" ? "🔄 Restart" : "▶ Start / Resume"}</button>
              <button onClick={() => queueConfirm('pause')} style={btnStyle(C, "secondary")}>⏸ Pause</button>
              <button onClick={() => queueConfirm('end')} style={btnStyle(C, "danger")}>⏹ End</button>
              <button onClick={() => queueConfirm('next')} disabled={!isLive || isLastQuestion} style={{ ...btnStyle(C, "primary"), opacity: (!isLive || isLastQuestion) ? 0.45 : 1, cursor: (!isLive || isLastQuestion) ? "not-allowed" : "pointer" }}>{isLastQuestion ? "End Reached" : "Next →"}</button>
            </>
          )}
        </div>
      </div>

      <div style={{ maxWidth: isEnded ? 1380 : 1160, margin: "0 auto", padding: "24px 20px 48px", display: "grid", gridTemplateColumns: isEnded ? "1fr" : "1.25fr 0.95fr", gap: 20, alignItems: isEnded ? "start" : "stretch" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ maxHeight: isEnded ? 0 : 620, opacity: isEnded ? 0 : 1, overflow: "hidden", transform: isEnded ? "translateY(-18px)" : "translateY(0)", transition: "max-height 420ms cubic-bezier(0.22,1,0.36,1), opacity 320ms ease, transform 320ms ease" }}>
            <div style={{ ...card(C), padding: 0, overflow: "hidden" }}>
              <div style={{ background: dark ? "#0d1428" : "#1e2d55", padding: "12px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${C.border}` }}>
                <div className="qn-subject" style={{ color: "#fff", fontSize: 17 }}>{state.quiz_title || "ThinkWAVE"}</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <StatusPill label={`✍ ${answeredCount}/${joinMode === "GROUP" ? Math.max(groups.length, 0) : connectedStudents}`} kind="blue" />
                  <StatusPill label={`⏱ ${fmtTime(timer.remainingSec ?? 0)}`} kind={(timer.remainingSec ?? 999) <= 5 && isLive ? "red" : "neutral"} />
                </div>
              </div>
              <div style={{ height: 6, background: C.border }}><div style={{ height: "100%", width: `${Math.round((timer.progress || 0) * 100)}%`, background: (timer.remainingSec ?? 999) <= 5 ? "#ef4444" : C.accent, transition: "width 0.2s linear, background 0.3s" }} /></div>
              <div style={{ padding: "22px 22px 20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                  <span style={{ color: C.muted, fontSize: 13, fontWeight: 800 }}>{stepLabel} {(state.current_question_index || 0) + 1} / {questions.length}</span>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <StatusPill label={`⏱ ${currentQ?.config_json?.timeLimitSec || state.time_limit_sec || 30}s`} kind="blue" />
                    <StatusPill label={`⭐ ${currentQ?.config_json?.points || 1} pts`} kind="yellow" />
                  </div>
                </div>
                {currentQ ? (
                  <>
                    <div style={{ background: dark ? "linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))" : "linear-gradient(135deg, rgba(255,255,255,0.96), rgba(237,243,255,0.95))", borderRadius: 22, padding: "34px 22px", border: `1px solid ${dark ? "rgba(255,255,255,0.08)" : C.border}`, marginBottom: 18 }}>
                      <div style={{ fontSize: 20, fontWeight: 900, color: C.text, textAlign: "center", lineHeight: 1.6 }}>{currentQ.prompt}</div>
                    </div>
                    <QuestionPreview q={currentQ} templateType={state.template_type} C={C} />
                  </>
                ) : (
                  <div style={{ padding: 28, color: C.muted, textAlign: "center", fontWeight: 800 }}>You have reached the end.</div>
                )}
              </div>
            </div>
          </div>

          <div style={{ ...card(C), transition: "transform 320ms ease, max-width 320ms ease", transform: isEnded ? "translateY(-8px)" : "translateY(0)", maxWidth: isEnded ? 1240 : "100%", margin: isEnded ? "0 auto" : "0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 10, flexWrap: "wrap" }}>
              <h3 style={{ margin: 0, color: C.text, fontWeight: 900 }}>🏆 Live Scores</h3>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => isEnded && setAnalyticsOpen((v) => !v)} disabled={!isEnded} style={{ ...btnStyle(C, "ghost"), opacity: isEnded ? 1 : 0.5, cursor: isEnded ? "pointer" : "not-allowed" }}>{analyticsOpen ? "Hide Analytics" : "Open Analytics"}</button>
                <button onClick={() => download("pdf")} disabled={!isEnded} style={{ ...btnStyle(C, "ghost"), opacity: isEnded ? 1 : 0.5, cursor: isEnded ? "pointer" : "not-allowed" }}>⬇ PDF</button>
                <button onClick={() => download("xlsx")} disabled={!isEnded} style={{ ...btnStyle(C, "ghost"), opacity: isEnded ? 1 : 0.5, cursor: isEnded ? "pointer" : "not-allowed" }}>⬇ Excel</button>
              </div>
            </div>
            {analyticsOpen && isEnded ? (
              <div style={{ display: "grid", gridTemplateColumns: "minmax(300px,0.72fr) minmax(420px,1.28fr)", gap: 18, alignItems: "start", marginTop: 8 }}>
                <div>
                  {scores.length === 0 ? <p style={{ color: C.muted, textAlign: "center", fontSize: 14 }}>No answers yet.</p> : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {scores.map((s, i) => (
                        <div key={s.participant_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderRadius: 12, background: i === 0 ? "rgba(251,191,36,0.07)" : "transparent", border: `1px solid ${i === 0 ? "rgba(251,191,36,0.2)" : C.border}` }}>
                          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                            <span style={{ width: 24 }}>{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}</span>
                            <span style={{ color: C.text, fontWeight: 700 }}>{joinMode === "GROUP" ? (s.group_name || `${s.first_name} ${s.last_name}`) : `${s.first_name} ${s.last_name}`}</span>
                          </div>
                          <span style={{ color: C.accent, fontWeight: 900 }}>{s.total_points} pts</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ alignSelf: "center" }}>
                  {analyticsLoading ? <div style={{ color: C.muted, fontWeight: 700 }}>Loading analytics…</div> : analytics && (
                    <AnalyticsPanel C={C} analytics={analytics} tabMonitoring={tabMonitoring} joinMode={joinMode} />
                  )}
                </div>
              </div>
            ) : (
              <>
                {scores.length === 0 ? <p style={{ color: C.muted, textAlign: "center", fontSize: 14 }}>No answers yet.</p> : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {scores.map((s, i) => (
                      <div key={s.participant_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderRadius: 12, background: i === 0 ? "rgba(251,191,36,0.07)" : "transparent", border: `1px solid ${i === 0 ? "rgba(251,191,36,0.2)" : C.border}` }}>
                        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                          <span style={{ width: 24 }}>{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}</span>
                          <span style={{ color: C.text, fontWeight: 700 }}>{joinMode === "GROUP" ? (s.group_name || `${s.first_name} ${s.last_name}`) : `${s.first_name} ${s.last_name}`}</span>
                        </div>
                        <span style={{ color: C.accent, fontWeight: 900 }}>{s.total_points} pts</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ maxHeight: isEnded ? 0 : 1400, opacity: isEnded ? 0 : 1, overflow: "hidden", transform: isEnded ? "translateY(-18px)" : "translateY(0)", transition: "max-height 420ms cubic-bezier(0.22,1,0.36,1), opacity 320ms ease, transform 320ms ease" }}>
          <div style={card(C)}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
              <h3 style={{ margin: 0, color: C.text, fontWeight: 900 }}>👥 Students</h3>
              {joinMode === "GROUP" && !isEnded && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", opacity: groupsLocked ? 0.45 : 1, transition: "opacity 240ms ease" }}>
                  <button onClick={() => !groupsLocked && socketRef.current?.emit("teacher:addGroup", { sessionId: Number(id) })} disabled={groupsLocked} style={{ ...btnStyle(C, "ghost"), cursor: groupsLocked ? "not-allowed" : "pointer" }}>＋ Add Group</button>
                </div>
              )}
            </div>
            {joinMode === "GROUP" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ ...card(C), padding: 14, boxShadow: "none", background: C.cardBg2 }}>
                  <div style={{ fontSize: 12, color: C.sub, fontWeight: 800, textTransform: "uppercase", marginBottom: 8 }}>Waiting for assignment</div>
                  {unassignedStudents.length === 0 ? <p style={{ margin: 0, color: C.muted, fontSize: 13 }}>Everyone who joined is already in a group.</p> : (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {unassignedStudents.map((p) => <StudentChip key={p.id} name={`${p.first_name} ${p.last_name}`.trim()} connected={p.connected} C={C} />)}
                    </div>
                  )}
                </div>
                {groups.length === 0 && <p style={{ color: C.muted, fontSize: 13, textAlign: "center" }}>No groups yet. Add a group so students can join one in real time.</p>}
                {groups.map((group) => (
                  <div key={group.id} style={{ ...card(C), padding: 14, boxShadow: "none", background: C.cardBg2 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <div>
                        <div style={{ color: C.text, fontWeight: 900 }}>{group.display_name}</div>
                        <div style={{ color: C.muted, fontSize: 12 }}>{group.default_name}</div>
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <StatusPill label={`${group.members?.length || 0} members`} kind="blue" />
                        {!isEnded && <button onClick={() => requestDeleteGroup(group)} disabled={groupsLocked} style={{ ...btnStyle(C, "ghost"), padding: "8px 12px", opacity: groupsLocked ? 0.4 : 1, cursor: groupsLocked ? "not-allowed" : "pointer" }}>Delete</button>}
                      </div>
                    </div>
                    {group.members?.length ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {group.members.map((member) => <StudentChip key={member.id} name={`${member.first_name} ${member.last_name}`.trim()} connected={member.connected} C={C} />)}
                      </div>
                    ) : <p style={{ margin: 0, color: C.muted, fontSize: 13 }}>Waiting for students to join this group.</p>}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 320, overflowY: "auto" }}>
                {roster.map((p) => (
                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderRadius: 12, background: C.cardBg2, border: `1px solid ${C.border}` }}>
                    <span style={{ color: C.text, fontSize: 14, fontWeight: 700 }}>{p.first_name} {p.last_name}</span>
                    <span style={{ padding: "2px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: p.connected ? "rgba(34,197,94,0.12)" : "rgba(100,116,139,0.1)", color: p.connected ? "#22c55e" : "#64748b" }}>{p.connected ? "● Online" : "○ Offline"}</span>
                  </div>
                ))}
                {roster.length === 0 && <p style={{ color: C.muted, fontSize: 13, textAlign: "center" }}>No students yet.</p>}
              </div>
            )}
          </div>
          </div>

          <div style={{ maxHeight: isEnded ? 0 : 900, opacity: isEnded ? 0 : 1, overflow: "hidden", transform: isEnded ? "translateY(-18px)" : "translateY(0)", transition: "max-height 420ms cubic-bezier(0.22,1,0.36,1), opacity 320ms ease, transform 320ms ease" }}>
          <div style={card(C)}>
            <h3 style={{ margin: "0 0 12px", color: C.text, fontWeight: 900 }}>🔗 Student Join</h3>
            <p style={{ color: C.muted, fontSize: 13, margin: "0 0 16px" }}>
              Share the QR code or join code with students. {joinMode === "GROUP" ? "They will wait for teacher-created groups, then choose one in real time." : "They will join the solo waiting roster immediately."}
            </p>
            <div style={{ background: "white", padding: 12, borderRadius: 16, display: "inline-block", marginBottom: 14 }}>
              <QRCodeCanvas value={`${window.location.origin}/play?code=${state.join_code || ""}`} size={140} />
            </div>
            <div style={{ padding: "12px 20px", borderRadius: 14, background: C.cardBg2, border: `1px solid ${C.border}`, textAlign: "center" }}>
              <div style={{ color: C.sub, fontSize: 11, fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Join Code</div>
              <div style={{ color: C.text, fontSize: 28, fontWeight: 900, letterSpacing: "0.25em" }}>{state.join_code || "—"}</div>
            </div>
          </div>
          </div>
        </div>
      </div>

      <ActionDialog
        open={!!confirmAction}
        tone={confirmAction === 'end' ? 'red' : 'blue'}
        icon={confirmAction === 'start' ? '▶' : confirmAction === 'pause' ? '⏸' : confirmAction === 'next' ? '⏭' : '⏹'}
        title={confirmAction === 'start' ? (state.status === 'LIVE' ? 'Restart session?' : 'Start or resume session?') : confirmAction === 'pause' ? 'Pause session?' : confirmAction === 'next' ? (isLastQuestion ? 'End reached' : 'Go to next question?') : 'End session?'}
        message={confirmAction === 'start'
          ? (joinMode === 'GROUP' && !canStartGroup ? 'Create groups and assign all joined students before starting.' : 'This will begin the live countdown and move the session into the current question.')
          : confirmAction === 'pause'
            ? 'Students will stop progressing until you resume the session.'
            : confirmAction === 'next'
              ? 'This will close the current question and move everyone to the next one.'
              : 'This will finish the live session, save the analytics, and show the final results.'}
        onClose={() => setConfirmAction(null)}
        actions={(<>
          <button onClick={() => setConfirmAction(null)} style={secondaryBtn(C, dark)}>Cancel</button>
          <button
            onClick={runConfirmedAction}
            disabled={confirmAction === 'start' && joinMode === 'GROUP' && !canStartGroup}
            style={{
              ...(confirmAction === 'end'
                ? primaryBtn({ bg: '#fee2e2', fg: '#dc2626', border: '#fca5a5' })
                : primaryBtn({ bg: dark ? '#1d4ed8' : '#dbeafe', fg: dark ? '#eff6ff' : '#1d4ed8', border: dark ? '#3b82f6' : '#93c5fd' })),
              opacity: (confirmAction === 'start' && joinMode === 'GROUP' && !canStartGroup) ? 0.55 : 1,
              cursor: (confirmAction === 'start' && joinMode === 'GROUP' && !canStartGroup) ? 'not-allowed' : 'pointer'
            }}
          >
            {confirmAction === 'start' ? 'Start' : confirmAction === 'pause' ? 'Pause' : confirmAction === 'next' ? 'Next question' : 'End session'}
          </button>
        </>)}
      />

      <ActionDialog
        open={allAnsweredPrompt}
        tone="blue"
        icon="✅"
        title="Everyone has answered"
        message={isLastQuestion ? 'All connected participants have answered the last question. You can wait or end the session when ready.' : 'All connected participants have answered the current question. You can keep waiting or move to the next question now.'}
        onClose={() => setAllAnsweredPrompt(false)}
        actions={(<>
          <button onClick={() => setAllAnsweredPrompt(false)} style={secondaryBtn(C, dark)}>Wait</button>
          {!isLastQuestion && <button onClick={() => { setAllAnsweredPrompt(false); next(); }} style={primaryBtn({ bg: dark ? '#1d4ed8' : '#dbeafe', fg: dark ? '#eff6ff' : '#1d4ed8', border: dark ? '#3b82f6' : '#93c5fd' })}>Go to next</button>}
          {isLastQuestion && <button onClick={() => { setAllAnsweredPrompt(false); queueConfirm('end'); }} style={primaryBtn({ bg: '#fee2e2', fg: '#dc2626', border: '#fca5a5' })}>End session</button>}
        </>)}
      />

      <ActionDialog
        open={!!deleteGroupTarget}
        tone="red"
        icon="🗑"
        title={deleteGroupTarget ? `Delete ${deleteGroupTarget.display_name || deleteGroupTarget.default_name}?` : "Delete group?"}
        message={deleteGroupTarget?.members?.length ? "There are still students inside this group. They will be moved back to the waiting list." : "This group will be removed from the lobby."}
        onClose={() => setDeleteGroupTarget(null)}
        actions={(<>
          <button onClick={() => setDeleteGroupTarget(null)} style={secondaryBtn(C, dark)}>Cancel</button>
          <button onClick={confirmDeleteGroup} style={primaryBtn({ bg: '#fee2e2', fg: '#dc2626', border: '#fca5a5' })}>Delete group</button>
        </>)}
      />
    </div>
  );
}

// Shared analytics widget used inside the host panel after a session ends.
function AnalyticsPanel({ C, analytics, tabMonitoring, joinMode }) {
  const summary = analytics.summary || {};
  const students = analytics.students || [];
  const questions = analytics.questions || [];
  const groupedAttendance = joinMode === "GROUP" ? Object.values(students.reduce((acc, student) => {
    const key = student.group_name || `${student.first_name} ${student.last_name}`.trim();
    if (!acc[key]) acc[key] = { name: key, members: [] };
    acc[key].members.push(student);
    return acc;
  }, {})) : [];
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 12 }}>
        <MetricCard C={C} label="Average" value={summary.avg_score ?? 0} />
        <MetricCard C={C} label="Min" value={summary.min_score ?? 0} />
        <MetricCard C={C} label="Max" value={summary.max_score ?? 0} />
        <MetricCard C={C} label="Attendance" value={summary.participant_count ?? students.length} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div style={{ ...card(C), boxShadow: "none", padding: 16, background: C.cardBg2 }}>
          <div style={{ color: C.text, fontWeight: 900, marginBottom: 10 }}>Attendance</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {joinMode === "GROUP" ? groupedAttendance.map((group) => (
              <details key={group.name} style={{ width: "100%", background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 14, padding: "10px 12px" }}>
                <summary style={{ cursor: "pointer", color: C.text, fontWeight: 800 }}>{group.name} <span style={{ color: C.muted, fontWeight: 700 }}>({group.members.length})</span></summary>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                  {group.members.map((member) => <StudentChip key={member.participant_id} name={`${member.first_name} ${member.last_name}`.trim()} connected={true} C={C} />)}
                </div>
              </details>
            )) : students.map((student) => <StudentChip key={student.participant_id} name={`${student.first_name} ${student.last_name}`.trim()} connected={true} C={C} />)}
            {students.length === 0 && <span style={{ color: C.muted }}>No joined students.</span>}
          </div>
        </div>
        <div style={{ ...card(C), boxShadow: "none", padding: 16, background: C.cardBg2 }}>
          <div style={{ color: C.text, fontWeight: 900, marginBottom: 10 }}>Tab Monitoring</div>
          <div style={{ display: "grid", gap: 8 }}>
            {tabMonitoring.map((row) => (
              <div key={row.participant_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", borderRadius: 12, background: C.cardBg, border: `1px solid ${C.border}` }}>
                <span style={{ color: C.text, fontWeight: 700 }}>{row.assigned_group_name || row.group_name || `${row.first_name} ${row.last_name}`}</span>
                <StatusPill label={`${row.tab_out_count || 0} tab out`} kind={(row.tab_out_count || 0) > 0 ? "red" : "green"} />
              </div>
            ))}
            {tabMonitoring.length === 0 && <span style={{ color: C.muted }}>No tab events recorded.</span>}
          </div>
        </div>
      </div>
      <div style={{ ...card(C), boxShadow: "none", padding: 16, background: C.cardBg2 }}>
        <div style={{ color: C.text, fontWeight: 900, marginBottom: 12 }}>Per-question Difficulty</div>
        <div style={{ display: "grid", gap: 10 }}>
          {questions.map((q) => (
            <div key={q.question_id} style={{ display: "grid", gridTemplateColumns: "72px 1fr 110px 120px", gap: 12, alignItems: "center", padding: "10px 12px", borderRadius: 14, background: C.cardBg, border: `1px solid ${C.border}` }}>
              <div style={{ color: C.muted, fontWeight: 800 }}>Q{Number(q.question_order || 0) + 1}</div>
              <div style={{ color: C.text, fontWeight: 700 }}>{q.prompt}</div>
              <div style={{ color: C.text, fontWeight: 900 }}>{q.pct_correct ?? 0}%</div>
              <StatusPill label={q.difficulty} kind={q.difficulty === "Difficult" ? "red" : "green"} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ C, label, value }) {
  return (
    <div style={{ ...card(C), boxShadow: "none", padding: 16, background: C.cardBg2 }}>
      <div style={{ color: C.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>{label}</div>
      <div style={{ color: C.text, fontSize: 28, fontWeight: 900, marginTop: 8 }}>{value}</div>
    </div>
  );
}

function QuestionPreview({ q, templateType, C }) {
  const cfg = q?.config_json || {};
  const labels = "ABCDEFGHIJ".split("");
  if (templateType === "MCQ" || templateType === "TRUE_FALSE") {
    const opts = Array.isArray(cfg.options) ? cfg.options : [];
    return (
      <div style={{ display: "grid", gap: 10 }}>
        {opts.map((opt, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 16, background: C.cardBg2, border: `1px solid ${C.border}` }}>
            <span style={{ width: 34, height: 34, borderRadius: 10, display: "grid", placeItems: "center", background: C.cardBg, border: `1px solid ${C.border}`, color: C.accent, fontWeight: 900 }}>{labels[i] || ""}</span>
            <span style={{ color: C.text, fontWeight: 700 }}>{opt}</span>
          </div>
        ))}
      </div>
    );
  }
  if (templateType === "MATCHING") {
    const colA = Array.isArray(cfg.colA) ? cfg.colA : [];
    const colB = Array.isArray(cfg.colB) ? cfg.colB : [];
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ display: "grid", gap: 10 }}>
          {colA.map((item, i) => (
            <div key={`a-${i}`} style={{ padding: "14px 16px", borderRadius: 16, background: C.cardBg2, border: `1px solid ${C.border}` }}>
              <div style={{ color: C.accent, fontSize: 12, fontWeight: 900, marginBottom: 8 }}>Column A · {i + 1}</div>
              {item?.image ? <img src={item.image} alt={item.text || `A${i + 1}`} style={{ maxWidth: "100%", maxHeight: 84, borderRadius: 12, display: "block", marginBottom: item?.text ? 8 : 0 }} /> : null}
              <div style={{ color: C.text, fontWeight: 700 }}>{item?.text || (item?.image ? "Image prompt" : `Item ${i + 1}`)}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          {colB.map((item, i) => (
            <div key={`b-${i}`} style={{ padding: "14px 16px", borderRadius: 16, background: C.cardBg2, border: `1px solid ${C.border}` }}>
              <div style={{ color: C.accent, fontSize: 12, fontWeight: 900, marginBottom: 8 }}>Column B · {i + 1}</div>
              <div style={{ color: C.text, fontWeight: 700 }}>{item?.text || `Match ${i + 1}`}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return <div style={{ padding: "14px 16px", borderRadius: 16, background: C.cardBg2, border: `1px solid ${C.border}`, color: C.muted, fontWeight: 700 }}>Student interaction preview matches the live player for this template.</div>;
}

function fmtTime(sec) {
  const s = Math.max(0, Number(sec || 0));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function card(C) {
  return { background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 20, padding: 24, boxShadow: darkShadow(C), transition: "background 0.3s" };
}

function darkShadow(C) {
  return C.pageBg === "#080e1f" ? "0 4px 24px rgba(0,0,0,0.15)" : "0 18px 42px rgba(43,108,255,0.10)";
}

function btnStyle(C, variant) {
  const base = { padding: "9px 18px", borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: "pointer", border: "none", transition: "all 0.2s" };
  if (variant === "primary") return { ...base, background: C.accent, color: "#fff", boxShadow: "0 4px 16px rgba(43,108,255,0.3)" };
  if (variant === "secondary") return { ...base, background: "transparent", border: `1px solid ${C.border}`, color: C.muted };
  if (variant === "danger") return { ...base, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171" };
  if (variant === "ghost") return { ...base, background: C.cardBg2, border: `1px solid ${C.border}`, color: C.muted };
  return base;
}

function StatusPill({ label, kind = "neutral" }) {
  const palette = kind === "green"
    ? { bg: "rgba(34,197,94,0.15)", fg: "#22c55e", br: "rgba(34,197,94,0.3)" }
    : kind === "yellow"
      ? { bg: "rgba(251,191,36,0.15)", fg: "#fbbf24", br: "rgba(251,191,36,0.28)" }
      : kind === "red"
        ? { bg: "rgba(239,68,68,0.16)", fg: "#f87171", br: "rgba(239,68,68,0.3)" }
        : kind === "blue"
          ? { bg: "rgba(43,108,255,0.14)", fg: "#7da4ff", br: "rgba(43,108,255,0.25)" }
          : { bg: "rgba(148,163,184,0.12)", fg: "#94a3b8", br: "rgba(148,163,184,0.2)" };
  return <span style={{ padding: "4px 12px", borderRadius: 999, fontSize: 12, fontWeight: 800, background: palette.bg, color: palette.fg, border: `1px solid ${palette.br}` }}>{label}</span>;
}

function StudentChip({ name, connected, C }) {
  return <span style={{ padding: "6px 12px", borderRadius: 999, background: C.cardBg, color: C.text, border: `1px solid ${connected ? "rgba(34,197,94,0.25)" : C.border}`, fontSize: 12, fontWeight: 700 }}>{connected ? "●" : "○"} {name}</span>;
}
