/* FILE GUIDE:
 * client/src/pages/teacher/tabs/LiveSessionsTab.jsx
 * Purpose: Compact live-session page with assignment setup moved out of Create.
 */

import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";
import { api } from "../../../lib/api";
import { useColors, useTheme } from "../../../context/ThemeContext";
import ActionDialog, { primaryBtn, secondaryBtn } from "../../../components/ActionDialog";
import { normalizeTemplateType } from "../../../lib/templateTypes";
import { templateCardChrome, templateLabel, templateTone } from "../../../lib/templatePalette";

const card = (c, extra = {}) => ({ background: c.cardBg, border: `1px solid ${c.border}`, borderRadius: 18, padding: 16, boxShadow: c.pageBg === "#eef2ff" ? "0 16px 34px rgba(43,108,255,0.08)" : "0 16px 34px rgba(0,0,0,0.14)", ...extra });
const btn = (c, primary = false) => ({ padding: "9px 13px", borderRadius: 12, border: `1px solid ${primary ? c.accent : c.border}`, background: primary ? c.accent : c.cardBg2, color: primary ? "#fff" : c.text, fontWeight: 800, fontSize: 13, cursor: "pointer" });

function buildFolderPathMap(rows) {
  const byId = new Map((rows || []).map((row) => [Number(row.id), row]));
  const cache = new Map();
  function walk(id) {
    if (!id) return "";
    if (cache.has(id)) return cache.get(id);
    const row = byId.get(Number(id));
    if (!row) return "";
    const parentPath = row.parent_id ? walk(Number(row.parent_id)) : "";
    const value = parentPath ? `${parentPath} / ${row.name}` : row.name;
    cache.set(Number(id), value);
    return value;
  }
  for (const row of rows || []) walk(Number(row.id));
  return cache;
}

function Badge({ label, c, tone = "neutral" }) {
  const map = { neutral: { bg: c.cardBg2, fg: c.text, border: c.border }, blue: { bg: `${c.accent}16`, fg: c.accent, border: c.accent }, green: { bg: c.greenBg, fg: c.greenFg, border: c.greenBorder }, yellow: { bg: c.yellowBg, fg: c.yellowFg, border: c.yellowBorder } }[tone];
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700, background: map.bg, color: map.fg, border: `1px solid ${map.border}` }}>{label}</span>;
}

export default function LiveSessionsTab({ setActiveTab }) {
  const [quizzes, setQuizzes] = useState([]);
  const [folders, setFolders] = useState([]);
  const [activeSessions, setActiveSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [previewQuiz, setPreviewQuiz] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const [assignQuiz, setAssignQuiz] = useState(null);
  const [flash, setFlash] = useState(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState("recent");
  const c = useColors();
  const { dark } = useTheme();

  const folderPathMap = useMemo(() => buildFolderPathMap(folders || []), [folders]);
  const activeByQuizId = useMemo(() => {
    const map = new Map();
    for (const session of activeSessions || []) map.set(Number(session.quiz_id), session);
    return map;
  }, [activeSessions]);

  function showFlash(text, kind = "success") {
    setFlash({ text, kind });
    setTimeout(() => setFlash((curr) => (curr?.text === text ? null : curr)), 2200);
  }

  async function load() {
    try {
      const [quizRes, folderRes, activeRes] = await Promise.all([api.get("/quizzes"), api.get("/classes"), api.get("/sessions/active")]);
      setQuizzes(quizRes.data || []);
      setFolders(folderRes.data || []);
      setActiveSessions(activeRes.data || []);
    } catch (e) {
      showFlash("Failed to load live sessions.", "error");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  const liveQuizzes = useMemo(() => (quizzes || []).filter((quiz) => quiz.status !== "BANKED" && quiz.delivery_mode !== "ASYNCHRONOUS"), [quizzes]);
  const filteredQuizzes = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = liveQuizzes.filter((quiz) => {
      const active = !!activeByQuizId.get(Number(quiz.id));
      if (statusFilter === "ACTIVE" && !active) return false;
      if (statusFilter === "READY" && active) return false;
      if (statusFilter === "PUBLISHED" && quiz.status !== "PUBLISHED") return false;
      if (!q) return true;
      return [quiz.title, quiz.template_type, quiz.category].some((value) => String(value || "").toLowerCase().includes(q));
    });
    rows.sort((a, b) => sortBy === "title" ? String(a.title || "").localeCompare(String(b.title || "")) : sortBy === "template" ? String(a.template_type || "").localeCompare(String(b.template_type || "")) : Number(b.id) - Number(a.id));
    return rows;
  }, [liveQuizzes, query, statusFilter, sortBy, activeByQuizId]);

  async function hostLive(quiz, joinMode, maxParticipants) {
    try {
      const cap = Number(maxParticipants || 0) > 0 ? Number(maxParticipants) : null;
      const { data } = await api.post("/sessions", { quizId: quiz.id, joinMode, maxParticipants: cap });
      await load();
      showFlash(data?.existing ? "That live session is already open." : `Session created in ${joinMode === "GROUP" ? "group" : "solo"} mode.`);
    } catch (e) { showFlash(e?.response?.data?.message || "Failed to create session.", "error"); }
  }

  async function createAssignment(quiz, payload) {
    try {
      // Revision 7: assignment setup creates an asynchronous copy of the selected quiz.
      await api.post(`/quizzes/${quiz.id}/assign`, payload);
      setAssignQuiz(null);
      await load();
      showFlash("Assignment created. Students will see it on their home tab.");
    } catch (e) { showFlash(e?.response?.data?.message || "Failed to create assignment.", "error"); }
  }

  async function deleteQuiz(quiz) { try { await api.delete(`/quizzes/${quiz.id}`); setConfirmState(null); await load(); showFlash("Quiz deleted successfully."); } catch (e) { showFlash(e?.response?.data?.message || "Failed to delete quiz.", "error"); } }
  async function addToQuizBank(quiz) { try { await api.post(`/quizzes/${quiz.id}/copy-to-bank`); setConfirmState(null); await load(); showFlash("Quiz copied to quiz bank."); } catch (e) { showFlash(e?.response?.data?.message || "Failed to copy quiz to quiz bank.", "error"); } }
  async function duplicateQuiz(quiz) { try { const { data } = await api.post(`/quizzes/${quiz.id}/duplicate`); setConfirmState(null); await load(); showFlash("Duplicate quiz created."); if (data?.id) setTimeout(() => window.location.assign(`/teacher/quizzes/${data.id}/builder`), 200); } catch (e) { showFlash(e?.response?.data?.message || "Failed to duplicate quiz.", "error"); } }

  if (loading) return <div className="container"><div style={card(c)}>Loading live sessions…</div></div>;

  return <>
    <div className="container" style={{ display: "grid", gap: 18 }}>
      <section><h2 style={{ marginBottom: 4, color: c.text }}>Live Sessions</h2></section>
      <section style={card(c)}><div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1.4fr) repeat(2, minmax(150px, 0.7fr))", gap: 12 }}><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search quizzes" style={inputStyle(c)} /><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={inputStyle(c)}><option value="ALL">All quizzes</option><option value="READY">Not active yet</option><option value="ACTIVE">Active sessions</option><option value="PUBLISHED">Published only</option></select><select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={inputStyle(c)}><option value="recent">Newest first</option><option value="title">Title A–Z</option><option value="template">Template</option></select></div></section>
      {flash && <div style={{ ...card(c, { padding: "12px 16px", boxShadow: "none", background: flash.kind === "error" ? c.redBg : c.greenBg, borderColor: flash.kind === "error" ? c.redBorder : c.greenBorder }), color: flash.kind === "error" ? c.redFg : c.greenFg, fontWeight: 800, fontSize: 13 }}>{flash.text}</div>}
      {filteredQuizzes.length === 0 ? <div style={card(c)}>No quizzes match your filters. <button onClick={() => setActiveTab?.("create")} style={{ border: "none", background: "none", color: c.accent, fontWeight: 800 }}>Create one</button>.</div> : <div style={{ display: "grid", gap: 12 }}>{filteredQuizzes.map((quiz) => <QuizCard key={quiz.id} quiz={quiz} folderLabel={folderPathMap.get(Number(quiz.class_id)) || "No folder assigned"} activeSession={activeByQuizId.get(Number(quiz.id)) || null} onHost={hostLive} onAssign={setAssignQuiz} onDelete={(q) => setConfirmState({ type: "delete", quiz: q })} onCopyToBank={(q) => setConfirmState({ type: "bank", quiz: q })} onDuplicate={(q) => setConfirmState({ type: "duplicate", quiz: q })} onPreview={setPreviewQuiz} c={c} />)}</div>}
      {previewQuiz && <PreviewModal quiz={previewQuiz} onClose={() => setPreviewQuiz(null)} />}
    </div>

    {assignQuiz && <AssignModal quiz={assignQuiz} c={c} onClose={() => setAssignQuiz(null)} onSubmit={createAssignment} />}
    {confirmState && <ActionDialog tone={confirmState.type === "delete" ? "red" : confirmState.type === "bank" ? "yellow" : "blue"} icon={confirmState.type === "delete" ? "🗑" : confirmState.type === "bank" ? "📦" : "⧉"} title={confirmState.type === "delete" ? "Delete quiz?" : confirmState.type === "bank" ? "Copy to Quiz Bank?" : "Create one duplicate copy?"} message={<><b style={{ color: c.text }}>{confirmState.quiz.title}</b></>} onClose={() => setConfirmState(null)} actions={<><button onClick={() => setConfirmState(null)} style={secondaryBtn(c, dark)}>Cancel</button><button onClick={() => confirmState.type === "delete" ? deleteQuiz(confirmState.quiz) : confirmState.type === "bank" ? addToQuizBank(confirmState.quiz) : duplicateQuiz(confirmState.quiz)} style={primaryBtn(confirmState.type === "delete" ? { bg: c.redBg, fg: c.redFg, border: c.redBorder } : confirmState.type === "bank" ? { bg: c.yellowBg, fg: c.yellowFg, border: c.yellowBorder } : { bg: `${c.accent}16`, fg: c.accent, border: c.accent })}>Confirm</button></>} />}
  </>;
}

function QuizCard({ quiz, folderLabel, activeSession, onHost, onAssign, onDelete, onCopyToBank, onDuplicate, onPreview, c }) {
  const [expanded, setExpanded] = useState(false);
  const [joinMode, setJoinMode] = useState(activeSession?.join_mode || "SOLO");
  const [maxParticipants, setMaxParticipants] = useState(activeSession?.max_participants || "");
  const [moreOpen, setMoreOpen] = useState(false);
  const navigate = useNavigate();
  const tone = templateTone(quiz.template_type, c, false);
  const isPublished = quiz.status === "PUBLISHED";
  const inSession = !!activeSession;
  useEffect(() => { if (activeSession?.join_mode) setJoinMode(activeSession.join_mode); if (activeSession?.max_participants) setMaxParticipants(activeSession.max_participants); }, [activeSession?.join_mode, activeSession?.max_participants]);
  return <div style={{ ...card(c), ...templateCardChrome(quiz.template_type, c, false) }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}><div><div style={{ fontWeight: 900, fontSize: 16, color: c.text }}>{quiz.title}</div><div style={{ color: c.textMuted, fontSize: 13, marginTop: 6 }}>{templateLabel(quiz.template_type)} · {quiz.category}</div><div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}><Badge c={c} label={inSession ? "Active session" : isPublished ? "Ready" : "Draft"} tone={inSession || isPublished ? "green" : "yellow"} /><Badge c={c} label={folderLabel} tone="blue" /></div></div><button style={btn(c, true)} onClick={() => setExpanded((v) => !v)}>{expanded ? "Close" : "Open"}</button></div>
    <div className={`collapsible-content ${expanded ? "open" : ""}`} style={{ marginTop: expanded ? 16 : 0 }}><div className="collapsible-inner"><div style={{ display: "grid", gap: 14 }}>
      <div style={card(c, { padding: 14, boxShadow: "none", background: c.cardBg2 })}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}><div><div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800, color: c.textSub, marginBottom: 8 }}>Quiz overview</div><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><Badge c={c} label={templateLabel(quiz.template_type)} /><Badge c={c} label={quiz.category} /><Badge c={c} label={folderLabel} tone="blue" /></div></div><div style={{ display: "flex", gap: 8, position: "relative", flexWrap: "wrap", zIndex: moreOpen ? 9001 : 1 }}><button onClick={() => onHost(quiz, joinMode, maxParticipants)} disabled={!isPublished || inSession} style={{ ...btn(c, true), opacity: !isPublished || inSession ? .6 : 1 }}>{inSession ? "Already active" : "Host Live"}</button><button onClick={() => onAssign(quiz)} disabled={!isPublished || !quiz.class_id} style={{ ...btn(c), opacity: !isPublished || !quiz.class_id ? .6 : 1 }}>Assign</button><button onClick={() => setMoreOpen((v) => !v)} style={btn(c)}>...</button>{moreOpen && <div style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", width: 220, zIndex: 9500, ...card(c, { padding: 8, boxShadow: "0 24px 60px rgba(0,0,0,.26)" }) }}><button onClick={() => { setMoreOpen(false); onPreview(quiz); }} style={menuBtn(c)}>Preview</button><button onClick={() => { setMoreOpen(false); navigate(`/teacher/quizzes/${quiz.id}/builder`); }} style={menuBtn(c)}>Edit</button><button onClick={() => { setMoreOpen(false); onCopyToBank(quiz); }} style={{ ...menuBtn(c), color: c.yellowFg }}>Add to Quiz Bank</button><button onClick={() => { setMoreOpen(false); onDuplicate(quiz); }} style={menuBtn(c)}>Duplicate</button><button onClick={() => { setMoreOpen(false); onDelete(quiz); }} style={{ ...menuBtn(c), color: c.redFg }}>Delete</button></div>}</div></div>
      </div>
      {!inSession && <div style={card(c, { padding: 14, boxShadow: "none", background: c.pageBg })}><div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800, color: c.textSub, marginBottom: 10 }}>Host setup</div><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}><div><div style={{ color: c.textMuted, fontSize: 12, marginBottom: 6 }}>Mode</div><div style={{ display: "flex", gap: 10 }}><button type="button" onClick={() => setJoinMode("SOLO")} style={{ ...btn(c), flex: 1, borderColor: joinMode === "SOLO" ? c.accent : c.border, color: joinMode === "SOLO" ? c.accent : c.text }}>Solo</button><button type="button" onClick={() => setJoinMode("GROUP")} style={{ ...btn(c), flex: 1, borderColor: joinMode === "GROUP" ? c.accent : c.border, color: joinMode === "GROUP" ? c.accent : c.text }}>Group</button></div></div><div><div style={{ color: c.textMuted, fontSize: 12, marginBottom: 6 }}>Maximum students</div><input type="number" min={1} max={500} value={maxParticipants} onChange={(e) => setMaxParticipants(e.target.value.replace(/[^\d]/g, "").slice(0, 3))} placeholder="No cap" style={inputStyle(c)} /></div><div><div style={{ color: c.textMuted, fontSize: 12, marginBottom: 6 }}>Selected folder</div><div style={{ ...inputStyle(c), background: c.cardBg2 }}>{folderLabel}</div></div></div></div>}
      {activeSession && <div style={card(c, { padding: 0, overflow: "hidden", borderColor: tone.border })}><div style={{ padding: "16px 18px", background: tone.softBg, borderBottom: `1px solid ${tone.border}` }}><div style={{ color: tone.accent, fontWeight: 900, fontSize: 18 }}>Session Ready</div></div><div style={{ padding: 18, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 18, flexWrap: "wrap" }}><div><div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800, color: c.textSub }}>Join code</div><div style={{ fontWeight: 900, fontSize: 28, letterSpacing: "0.22em", color: c.accent }}>{activeSession.join_code}</div><Link to={`/teacher/sessions/${activeSession.id}/live`} style={{ color: c.accent, fontWeight: 800, textDecoration: "underline" }}>Open Host Panel →</Link></div><div style={{ background: "white", padding: 10, borderRadius: 14 }}><QRCodeCanvas value={`${window.location.origin}/play?code=${activeSession.join_code}`} size={96} /></div></div></div>}
    </div></div></div>
  </div>;
}

function AssignModal({ quiz, c, onClose, onSubmit }) {
  const [form, setForm] = useState({ availableFrom: "", availableUntil: "" });
  const [editing, setEditing] = useState(false);
  const complete = !!form.availableFrom && !!form.availableUntil;
  function submit(e) { e.preventDefault(); if (complete) onSubmit(quiz, form); }
  return <div style={modalBackdrop}><form onSubmit={submit} style={{ ...card(c, { width: "min(95vw, 660px)", padding: 0, overflow: "hidden", background: c.cardBg }) }}>
    <div style={{ padding: "22px 28px", borderBottom: `1px solid ${c.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}><div><h2 style={{ margin: 0, color: c.text }}>Set up assignment</h2><p style={{ color: c.textMuted, marginBottom: 0 }}>Create an assignment then share it with participants.</p></div><button type="button" onClick={onClose} style={{ ...btn(c), fontSize: 22, lineHeight: 1 }}>×</button></div>
    <div style={{ padding: 28, display: "grid", gap: 14 }}>
      <div style={{ ...card(c, { boxShadow: "none", padding: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, background: c.cardBg2 }) }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <span style={{ fontSize: 26 }}>📅</span>
          <div>
            <div style={{ color: c.textMuted, fontSize: 13, fontWeight: 800 }}>Schedule</div>
            <div style={{ color: c.text, fontWeight: 900 }}>{complete ? `${formatSchedule(form.availableFrom)} → ${formatSchedule(form.availableUntil)}` : "Set start and end date/time"}</div>
          </div>
        </div>
        <button type="button" onClick={() => setEditing(true)} style={btn(c)}>Edit</button>
      </div>
      <div style={{ color: c.textMuted, fontSize: 13 }}>Students will only be able to answer within the selected schedule.</div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}><button type="button" onClick={onClose} style={btn(c)}>Cancel</button><button disabled={!complete} style={{ ...btn(c, true), opacity: complete ? 1 : .55 }}>Create assignment</button></div>
    </div>
    {editing && <ScheduleEditor c={c} form={form} setForm={setForm} onClose={() => setEditing(false)} />}
  </form></div>;
}

function ScheduleEditor({ c, form, setForm, onClose }) {
  const startDefault = parseScheduleDate(form.availableFrom, new Date());
  const endDefault = parseScheduleDate(form.availableUntil, addDaysAtNoon(startDefault, 3));
  const [draft, setDraft] = useState({ availableFrom: toLocalDateTimeValue(startDefault), availableUntil: toLocalDateTimeValue(endDefault) });
  const [activeField, setActiveField] = useState("availableUntil");
  const [viewDate, setViewDate] = useState(() => {
    const d = parseScheduleDate(form.availableUntil, endDefault);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const activeDate = parseScheduleDate(draft[activeField], activeField === "availableFrom" ? startDefault : endDefault);
  const days = buildCalendarDays(viewDate);
  const timeOptions = buildTimeOptions();

  useEffect(() => {
    const d = parseScheduleDate(draft[activeField], activeDate);
    setViewDate(new Date(d.getFullYear(), d.getMonth(), 1));
    // Revision 10: keep the calendar month aligned with the active start/end schedule field.
  }, [activeField]);

  function setDatePart(day) {
    const next = new Date(activeDate);
    next.setFullYear(viewDate.getFullYear(), viewDate.getMonth(), day);
    setDraft((curr) => ({ ...curr, [activeField]: toLocalDateTimeValue(next) }));
  }

  function setTimePart(value) {
    const [hour, minute] = value.split(":").map(Number);
    const next = new Date(activeDate);
    next.setHours(hour, minute, 0, 0);
    setDraft((curr) => ({ ...curr, [activeField]: toLocalDateTimeValue(next) }));
  }

  function apply() {
    let from = parseScheduleDate(draft.availableFrom, startDefault);
    let until = parseScheduleDate(draft.availableUntil, endDefault);
    if (until <= from) until = new Date(from.getTime() + 60 * 60 * 1000);
    // Revision 10: assignment schedule uses a calendar-style picker instead of raw datetime inputs.
    setForm({ availableFrom: toLocalDateTimeValue(from), availableUntil: toLocalDateTimeValue(until) });
    onClose();
  }

  const selectedMinutes = activeDate.getHours() * 60 + activeDate.getMinutes();
  const selectedTime = minutesToTimeValue(selectedMinutes);

  return <div style={calendarOverlay(c)}>
    <div style={{ width: "min(94vw, 440px)", background: c.cardBg, color: c.text, borderRadius: 4, boxShadow: "0 24px 60px rgba(0,0,0,.28)", overflow: "hidden" }}>
      <div style={{ padding: "22px 20px 12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <div style={{ fontWeight: 900, fontSize: 22 }}>{viewDate.toLocaleString([], { month: "long", year: "numeric" })}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))} style={calendarNavBtn(c)}>‹</button>
            <button type="button" onClick={() => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))} style={calendarNavBtn(c)}>›</button>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
          <button type="button" onClick={() => setActiveField("availableFrom")} style={segmentBtn(c, activeField === "availableFrom")}>Start<br/><small>{formatSchedule(draft.availableFrom)}</small></button>
          <button type="button" onClick={() => setActiveField("availableUntil")} style={segmentBtn(c, activeField === "availableUntil")}>End<br/><small>{formatSchedule(draft.availableUntil)}</small></button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", textAlign: "center", color: c.textMuted, fontWeight: 800, rowGap: 10, marginBottom: 8 }}>
          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => <div key={d}>{d}</div>)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8, textAlign: "center" }}>
          {days.map((day, idx) => {
            const selected = day && sameCalendarDay(activeDate, viewDate, day);
            return <button key={`${day || "blank"}-${idx}`} type="button" disabled={!day} onClick={() => setDatePart(day)} style={calendarDayBtn(c, selected, !day)}>{day || ""}</button>;
          })}
        </div>
      </div>
      <div style={{ borderTop: `1px solid ${c.border}`, padding: "18px 20px 16px" }}>
        <div style={{ fontWeight: 900, fontSize: 17, marginBottom: 8 }}>Time</div>
        <select value={selectedTime} onChange={(e) => setTimePart(e.target.value)} style={{ ...inputStyle(c), height: 46, fontWeight: 700 }}>
          {timeOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
      </div>
      <div style={{ padding: "0 20px 22px", display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button type="button" onClick={onClose} style={{ ...btn(c), padding: "12px 18px" }}>Cancel</button>
        <button type="button" onClick={apply} style={{ ...btn(c, true), padding: "12px 18px" }}>Set</button>
      </div>
    </div>
  </div>;
}

function parseScheduleDate(value, fallback) {
  const d = value ? new Date(value) : new Date(fallback);
  return Number.isNaN(d.getTime()) ? new Date(fallback) : d;
}

function addDaysAtNoon(base, days) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  d.setHours(12, 0, 0, 0);
  return d;
}

function toLocalDateTimeValue(date) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function buildCalendarDays(viewDate) {
  const firstDay = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1).getDay();
  const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
  return [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
}

function sameCalendarDay(date, viewDate, day) {
  return date.getFullYear() === viewDate.getFullYear() && date.getMonth() === viewDate.getMonth() && date.getDate() === day;
}

function buildTimeOptions() {
  const rows = [];
  for (let h = 0; h < 24; h += 1) {
    for (const m of [0, 30]) rows.push({ value: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`, label: new Date(2026, 0, 1, h, m).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) });
  }
  return rows;
}

function minutesToTimeValue(minutes) {
  const rounded = Math.round(minutes / 30) * 30;
  const h = Math.floor((rounded % 1440) / 60);
  const m = rounded % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function calendarNavBtn(c) {
  return { width: 42, height: 42, borderRadius: 8, border: "none", background: c.cardBg2, color: c.text, fontSize: 28, fontWeight: 900, lineHeight: 1, cursor: "pointer" };
}

function calendarDayBtn(c, selected, blank) {
  return { height: 42, borderRadius: 6, border: "none", background: selected ? c.accent : "transparent", color: blank ? "transparent" : selected ? "#fff" : c.text, fontSize: 17, fontWeight: selected ? 900 : 600, cursor: blank ? "default" : "pointer", opacity: blank ? 0 : 1 };
}

function segmentBtn(c, active) {
  return { border: `1px solid ${active ? c.accent : c.border}`, background: active ? `${c.accent}18` : c.cardBg2, color: active ? c.accent : c.text, borderRadius: 12, padding: "10px 12px", textAlign: "left", fontWeight: 900, cursor: "pointer", lineHeight: 1.35 };
}

function calendarOverlay(c) {
  return { position: "fixed", inset: 0, zIndex: 9500, display: "grid", placeItems: "center", background: "rgba(15,23,42,.38)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)", padding: 20 };
}

function formatSchedule(value) {
  if (!value) return "Not set";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function menuBtn(c) { return { width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: 10, border: "none", background: "transparent", color: c.text, fontWeight: 700, cursor: "pointer" }; }
function inputStyle(c) { return { width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 12, border: `1px solid ${c.inputBorder || c.border}`, background: c.inputBg || c.cardBg2, color: c.text }; }
const modalBackdrop = { position: "fixed", inset: 0, background: "rgba(15,23,42,.46)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", display: "grid", placeItems: "center", padding: 20, zIndex: 9000, isolation: "isolate" };

function PreviewModal({ quiz, onClose }) {
  const [questions, setQuestions] = useState([]);
  const [qIndex, setQIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const c = useColors();
  const { dark } = useTheme();
  useEffect(() => { api.get(`/quizzes/${quiz.id}`).then(({ data }) => setQuestions(data.questions || [])).catch(console.error).finally(() => setLoading(false)); }, [quiz.id]);
  const currentQ = questions[qIndex] || null;
  const cfg = currentQ ? safeJson(currentQ.config_json) || {} : {};
  return <div onClick={onClose} style={previewOverlay(dark)}>
    <div onClick={(e) => e.stopPropagation()} style={{ width: "min(95vw, 760px)", maxHeight: "90vh", background: c.cardBg, border: `1px solid ${c.border}`, borderRadius: 20, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 30px 80px rgba(0,0,0,.30)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", background: c.cardBg2, borderBottom: `1px solid ${c.border}` }}><span style={{ fontWeight: 800, fontSize: 15, color: c.text }}>👁 Preview — {quiz.title}</span><button onClick={onClose} style={btn(c)}>✕ Close</button></div>
      <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>{loading && <div style={{ textAlign: "center", padding: 40, color: c.textMuted }}>Loading questions…</div>}{!loading && questions.length === 0 && <div style={{ textAlign: "center", padding: 40, color: c.textMuted }}>No questions yet.</div>}{!loading && currentQ && <div><div style={{ background: c.cardBg2, borderRadius: 12, padding: "10px 16px", marginBottom: 12, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}><span style={{ color: c.text, fontWeight: 700 }}>{quiz.title}</span><span style={{ color: c.textMuted, fontSize: 13 }}>Q {qIndex + 1} of {questions.length}</span></div><div style={{ background: c.cardBg2, border: `1px solid ${c.border}`, borderRadius: 14, padding: "18px 20px", fontSize: 16, fontWeight: 800, lineHeight: 1.6, color: c.text, marginBottom: 14, textAlign: "center" }}>{currentQ.prompt}</div><PreviewBody templateType={normalizeTemplateType(quiz.template_type)} cfg={cfg} c={c} /></div>}</div>{!loading && questions.length > 0 && <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 24px", borderTop: `1px solid ${c.border}` }}><button style={{ ...btn(c), visibility: qIndex === 0 ? "hidden" : "visible" }} onClick={() => setQIndex((i) => i - 1)}>‹ Previous</button><span style={{ fontSize: 14, color: c.textMuted }}>{qIndex + 1} / {questions.length}</span><button style={{ ...btn(c), visibility: qIndex === questions.length - 1 ? "hidden" : "visible" }} onClick={() => setQIndex((i) => i + 1)}>Next ›</button></div>}
    </div>
  </div>;
}

function PreviewBody({ templateType, cfg, c }) {
  const opts = Array.isArray(cfg.options) ? cfg.options : [];
  const labels = "ABCDEFGHIJ".split("");
  const tt = normalizeTemplateType(templateType);
  if (tt === "MCQ" || tt === "TRUE_FALSE") return <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{opts.map((o, i) => <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 14, background: c.cardBg2, border: `1px solid ${c.border}`, color: c.text }}><span style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, background: c.cardBg, color: c.accent, fontWeight: 900, fontSize: 14, flexShrink: 0, border: `1px solid ${c.border}` }}>{labels[i]}</span><span style={{ fontWeight: 600 }}>{typeof o === "object" ? o.text || "Image choice" : o}</span></div>)}</div>;
  if (tt === "GUESS_WORD_4PICS") { const images = Array.isArray(cfg.images) ? cfg.images : []; return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, maxWidth: 280 }}>{[0, 1, 2, 3].map((i) => <div key={i} style={{ aspectRatio: "1", borderRadius: 10, overflow: "hidden", background: c.cardBg2, border: `1px solid ${c.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>{images[i] ? <img src={images[i]} alt={`Clue ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ color: c.textMuted, fontWeight: 900 }}>?</span>}</div>)}</div>; }
  return <div style={{ padding: "12px 14px", background: c.cardBg2, border: `1px solid ${c.border}`, borderRadius: 12, fontSize: 13, color: c.textMuted }}>Preview available in builder.</div>;
}

function previewOverlay(dark) {
  return { position: "fixed", inset: 0, zIndex: 9200, display: "grid", placeItems: "center", padding: 20, background: dark ? "rgba(0,0,0,.68)" : "rgba(15,23,42,.46)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", isolation: "isolate" };
}

function safeJson(v) { if (!v) return null; if (typeof v === "object") return v; try { return JSON.parse(v); } catch { return null; } }
