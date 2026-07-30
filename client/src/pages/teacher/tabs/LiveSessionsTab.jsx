/* FILE GUIDE:
 * client/src/pages/teacher/tabs/LiveSessionsTab.jsx
 * Purpose: Teacher/Guest session management, pre-host setup, and assignment scheduling.
 */

import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";
import { api } from "../../../lib/api";
import { useColors, useTheme } from "../../../context/ThemeContext";
import { TwIcon } from "../../../components/TwUI";
import { TEMPLATE_PALETTES, templateCardChrome, templateLabel, templateTone } from "../../../lib/templatePalette";
import QuizPreviewModal from "../../../components/QuizPreviewModal";
import { isInstitutionPlan } from "../../../lib/planLimits";
import { ProfileSavedOverlay } from "../../../components/ProfileSettings";
import { TeacherActionModal, TeacherPressButton, ThinkBotEmptyState } from "../TeacherUI";

const TEMPLATE_IMAGES = {
  MCQ: { landscape: "/media/templates/multiple-choice.svg", mobile: "/media/templates/multiple-choice-mobile.svg" },
  TRUE_FALSE: { landscape: "/media/templates/true-false.svg", mobile: "/media/templates/true-false-mobile.svg" },
  TYPE_ANSWER: { landscape: "/media/templates/identification.svg", mobile: "/media/templates/identification-mobile.svg" },
  MATCHING: { landscape: "/media/templates/matching.svg", mobile: "/media/templates/matching-mobile.svg" },
  GUESS_WORD_4PICS: { landscape: "/media/templates/guess-word.svg", mobile: "/media/templates/guess-word-mobile.svg" },
  THINK_SPELL: { landscape: "/media/templates/think-and-spell.svg", mobile: "/media/templates/think-and-spell-mobile.svg" },
};

const TEMPLATE_DESCRIPTIONS = {
  MCQ: "Learners choose from clear answer choices while results update live for the host.",
  TRUE_FALSE: "Learners make a fast True or False decision and immediately see the next challenge.",
  TYPE_ANSWER: "Learners recall the answer and type it themselves instead of selecting from choices.",
  MATCHING: "Learners connect each prompt card with its correct match before the timer ends.",
  GUESS_WORD_4PICS: "Four visual clues guide learners toward one correct word.",
  THINK_SPELL: "Learners search a letter grid and build valid words before time runs out.",
};

const card = (c, extra = {}) => ({
  background: c.cardBg,
  border: `1px solid ${c.border}`,
  borderRadius: 18,
  padding: 16,
  boxShadow: "0 16px 34px rgba(15,23,42,.12)",
  ...extra,
});
const btn = (c) => ({ padding: "9px 13px", borderRadius: 12, border: `1px solid ${c.border}`, background: c.cardBg2, color: c.text, fontWeight: 800, fontSize: 13, cursor: "pointer" });

function normalizeLiveTemplate(value) {
  if (value === "FOUR_PICS_ONE_WORD") return "GUESS_WORD_4PICS";
  if (value === "THINK_AND_SPELL") return "THINK_SPELL";
  return value;
}

function buildFolderPathMap(rows) {
  const byId = new Map((rows || []).map((row) => [Number(row.id), row]));
  const cache = new Map();
  function walk(id) {
    if (!id) return "";
    if (cache.has(id)) return cache.get(id);
    const row = byId.get(Number(id));
    if (!row) return "";
    const parent = row.parent_id ? walk(Number(row.parent_id)) : "";
    const label = parent ? `${parent} / ${row.name}` : row.name;
    cache.set(Number(id), label);
    return label;
  }
  (rows || []).forEach((row) => walk(Number(row.id)));
  return cache;
}

function Badge({ label, c, tone = "neutral" }) {
  const map = {
    neutral: { bg: c.cardBg2, fg: c.text, border: c.border },
    blue: { bg: `${c.accent}16`, fg: c.accent, border: c.accent },
    green: { bg: c.greenBg, fg: c.greenFg, border: c.greenBorder },
    yellow: { bg: c.yellowBg, fg: c.yellowFg, border: c.yellowBorder },
  }[tone];
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700, background: map.bg, color: map.fg, border: `1px solid ${map.border}` }}>{label}</span>;
}

export default function LiveSessionsTab({ setActiveTab, guestMode = false }) {
  const [quizzes, setQuizzes] = useState([]);
  const [folders, setFolders] = useState([]);
  const [activeSessions, setActiveSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [previewQuiz, setPreviewQuiz] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const [assignQuiz, setAssignQuiz] = useState(null);
  const [hostSetupQuiz, setHostSetupQuiz] = useState(null);
  const [flash, setFlash] = useState(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState("recent");
  const [institutionPlan, setInstitutionPlan] = useState(false);
  const [openQuizId, setOpenQuizId] = useState(null);
  const [assignmentSaved, setAssignmentSaved] = useState(false);
  const c = useColors();
  const { dark } = useTheme();
  const navigate = useNavigate();

  const folderPathMap = useMemo(() => buildFolderPathMap(folders), [folders]);
  const folderOptions = useMemo(() => folders.map((folder) => ({ ...folder, pathLabel: folderPathMap.get(Number(folder.id)) || folder.name })), [folders, folderPathMap]);
  const activeByQuizId = useMemo(() => new Map(activeSessions.map((session) => [Number(session.quiz_id), session])), [activeSessions]);

  function showFlash(text, kind = "success") {
    setFlash({ text, kind });
    window.setTimeout(() => setFlash((current) => current?.text === text ? null : current), 2400);
  }

  async function load() {
    try {
      if (guestMode) {
        const [quizRes, activeRes] = await Promise.all([api.get("/quizzes"), api.get("/sessions/active")]);
        setQuizzes(quizRes.data || []);
        setFolders([]);
        setActiveSessions(activeRes.data || []);
        setInstitutionPlan(false);
      } else {
        const [quizRes, folderRes, activeRes, meRes] = await Promise.all([api.get("/quizzes"), api.get("/classes"), api.get("/sessions/active"), api.get("/auth/me")]);
        setQuizzes(quizRes.data || []);
        setFolders(folderRes.data || []);
        setActiveSessions(activeRes.data || []);
        setInstitutionPlan(isInstitutionPlan(meRes.data));
      }
    } catch (error) {
      showFlash(error?.response?.data?.message || `Failed to load ${guestMode ? "sessions" : "live sessions"}.`, "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [guestMode]);

  const liveQuizzes = useMemo(() => quizzes.filter((quiz) => quiz.status !== "BANKED" && quiz.delivery_mode !== "ASYNCHRONOUS"), [quizzes]);
  const filteredQuizzes = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = liveQuizzes.filter((quiz) => {
      const active = activeByQuizId.has(Number(quiz.id));
      if (statusFilter === "ACTIVE" && !active) return false;
      if (statusFilter === "READY" && active) return false;
      if (statusFilter === "PUBLISHED" && quiz.status !== "PUBLISHED") return false;
      const templateFilter = sortBy.startsWith("template:") ? sortBy.slice(9) : null;
      if (templateFilter && normalizeLiveTemplate(quiz.template_type) !== templateFilter) return false;
      return !q || [quiz.title, quiz.template_type, quiz.category].some((value) => String(value || "").toLowerCase().includes(q));
    });
    rows.sort((a, b) => sortBy === "title" ? String(a.title || "").localeCompare(String(b.title || "")) : Number(b.id) - Number(a.id));
    return rows;
  }, [liveQuizzes, query, statusFilter, sortBy, activeByQuizId]);

  async function createLiveSession(quiz, joinMode = "SOLO", classId = null) {
    try {
      const { data } = await api.post("/sessions", { quizId: quiz.id, joinMode: guestMode ? "SOLO" : joinMode, classId: guestMode ? null : classId });
      setHostSetupQuiz(null);
      await load();
      setOpenQuizId(quiz.id);
      showFlash(data?.existing ? "That live session is already open." : "Session created. Opening the host panel…");
      if (!guestMode && data?.id) navigate(`/teacher/sessions/${data.id}/live`);
    } catch (error) {
      showFlash(error?.response?.data?.message || "Failed to create session.", "error");
    }
  }

  async function createAssignment(quiz, payload) {
    try {
      await api.post(`/quizzes/${quiz.id}/assign`, payload);
      setAssignQuiz(null);
      await load();
      setAssignmentSaved(true);
      window.setTimeout(() => setAssignmentSaved(false), 2000);
    } catch (error) {
      showFlash(error?.response?.data?.message || "Failed to create assignment.", "error");
    }
  }

  async function deleteQuiz(quiz) { try { await api.delete(`/quizzes/${quiz.id}`); setConfirmState(null); await load(); showFlash("Quiz deleted successfully."); } catch (error) { showFlash(error?.response?.data?.message || "Failed to delete quiz.", "error"); } }
  async function addToQuizBank(quiz) { try { await api.post(`/quizzes/${quiz.id}/copy-to-bank`); setConfirmState(null); await load(); showFlash("Quiz copied to Quiz Bank."); } catch (error) { showFlash(error?.response?.data?.message || "Failed to copy quiz to Quiz Bank.", "error"); } }
  async function duplicateQuiz(quiz) { try { const { data } = await api.post(`/quizzes/${quiz.id}/duplicate`); setConfirmState(null); await load(); showFlash("Duplicate quiz created."); if (data?.id) window.setTimeout(() => window.location.assign(`/teacher/quizzes/${data.id}/builder`), 200); } catch (error) { showFlash(error?.response?.data?.message || "Failed to duplicate quiz.", "error"); } }

  if (loading) return <div className="container"><div style={card(c)}>Loading sessions…</div></div>;

  return <>
    <div className="container tw-live-sessions-page" style={{ display: "grid", gap: 18, overflow: "visible", background: c.pageBg, alignContent: "start", gridAutoRows: "max-content" }}>
      <section><h2 style={{ marginBottom: 4, color: c.text }}>{guestMode ? "Sessions" : "Live Sessions"}</h2></section>
      {liveQuizzes.length > 0 && <section style={card(c)}><div className="tw-session-filter-grid">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search quizzes" style={inputStyle(c)} />
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} style={inputStyle(c)}><option value="ALL">All quizzes</option><option value="READY">Not active yet</option><option value="ACTIVE">Active sessions</option><option value="PUBLISHED">Published only</option></select>
        <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} style={inputStyle(c)}><option value="recent">Newest first</option><option value="title">Title A–Z</option>{Object.entries(TEMPLATE_PALETTES).map(([value, meta]) => <option key={value} value={`template:${value}`}>{meta.label}</option>)}</select>
      </div></section>}
      {flash && <div style={{ ...card(c, { padding: "12px 16px", boxShadow: "none", background: flash.kind === "error" ? c.redBg : c.greenBg, borderColor: flash.kind === "error" ? c.redBorder : c.greenBorder }), color: flash.kind === "error" ? c.redFg : c.greenFg, fontWeight: 800, fontSize: 13 }}>{flash.text}</div>}
      {!liveQuizzes.length ? <ThinkBotEmptyState c={c} title="You have not made any quizzes yet." actionLabel={guestMode ? "Create & Open Builder" : undefined} onAction={guestMode ? () => setActiveTab?.("create") : undefined} /> : !filteredQuizzes.length ? <div style={card(c)}>No quizzes match your current filters.</div> : <div style={{ display: "grid", gap: 12 }}>{filteredQuizzes.map((quiz) => <QuizCard
        key={quiz.id}
        quiz={quiz}
        guestMode={guestMode}
        folderLabel={folderPathMap.get(Number(quiz.class_id)) || "Class will be selected when starting"}
        activeSession={activeByQuizId.get(Number(quiz.id)) || null}
        onHost={(selectedQuiz) => guestMode ? createLiveSession(selectedQuiz, "SOLO", null) : setHostSetupQuiz(selectedQuiz)}
        onAssign={setAssignQuiz}
        onDelete={(selectedQuiz) => setConfirmState({ type: "delete", quiz: selectedQuiz })}
        onCopyToBank={(selectedQuiz) => setConfirmState({ type: "bank", quiz: selectedQuiz })}
        onDuplicate={(selectedQuiz) => setConfirmState({ type: "duplicate", quiz: selectedQuiz })}
        onPreview={setPreviewQuiz}
        c={c}
        institutionPlan={institutionPlan}
        expanded={Number(openQuizId) === Number(quiz.id)}
        onToggle={() => setOpenQuizId((current) => Number(current) === Number(quiz.id) ? null : quiz.id)}
        dark={dark}
      />)}</div>}
      {previewQuiz && <QuizPreviewModal quiz={previewQuiz} onClose={() => setPreviewQuiz(null)} />}
      {!guestMode && assignmentSaved && <ProfileSavedOverlay />}
    </div>

    {!guestMode && hostSetupQuiz && <HostLaunchModal quiz={hostSetupQuiz} folders={folderOptions} institutionPlan={institutionPlan} c={c} onClose={() => setHostSetupQuiz(null)} onStart={createLiveSession} />}
    {!guestMode && assignQuiz && <AssignModal quiz={assignQuiz} folders={folderOptions} c={c} onClose={() => setAssignQuiz(null)} onSubmit={createAssignment} />}
    {confirmState && <TeacherActionModal c={c} textCancel tone={confirmState.type === "delete" ? "red" : "blue"} icon={confirmState.type === "delete" ? "trash" : confirmState.type === "bank" ? "bank" : "plus"} title={confirmState.type === "delete" ? "Delete quiz?" : confirmState.type === "bank" ? "Add to Quiz Bank?" : "Duplicate quiz?"} message={`${confirmState.quiz.title} will be ${confirmState.type === "delete" ? "permanently deleted" : confirmState.type === "bank" ? "copied to the Quiz Bank" : "copied as a new editable quiz"}.`} confirmLabel={confirmState.type === "delete" ? "Delete" : confirmState.type === "bank" ? "Add to Quiz Bank" : "Duplicate"} onClose={() => setConfirmState(null)} onConfirm={() => confirmState.type === "delete" ? deleteQuiz(confirmState.quiz) : confirmState.type === "bank" ? addToQuizBank(confirmState.quiz) : duplicateQuiz(confirmState.quiz)} />}
  </>;
}

function QuizCard({ quiz, guestMode, folderLabel, activeSession, onHost, onAssign, onDelete, onCopyToBank, onDuplicate, onPreview, c, institutionPlan, expanded, onToggle, dark }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const navigate = useNavigate();
  const tone = templateTone(quiz.template_type, c, false);
  const isPublished = quiz.status === "PUBLISHED";
  const inSession = !!activeSession;
  const builderPath = guestMode ? `/guest/quizzes/${quiz.id}/builder` : `/teacher/quizzes/${quiz.id}/builder`;
  const hostPath = guestMode ? `/guest/sessions/${activeSession?.id}/live` : `/teacher/sessions/${activeSession?.id}/live`;

  useEffect(() => {
    if (!moreOpen) return undefined;
    const closeMenu = (event) => { if (!event.target.closest(`[data-session-actions="${quiz.id}"]`)) setMoreOpen(false); };
    document.addEventListener("pointerdown", closeMenu);
    return () => document.removeEventListener("pointerdown", closeMenu);
  }, [moreOpen, quiz.id]);

  return <div className="tw-live-session-card" style={{ ...card(c), ...templateCardChrome(quiz.template_type, c, false), position: "relative", overflow: "visible", zIndex: moreOpen ? 120 : 1, background: dark ? `color-mix(in srgb, ${tone.accent} 18%, ${c.cardBg})` : `color-mix(in srgb, ${tone.accent} 13%, ${c.cardBg})`, border: `3px solid ${tone.border}`, boxShadow: `0 15px 32px color-mix(in srgb, ${tone.accent} 19%, rgba(15,23,42,.15))` }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
      <div>
        <div style={{ fontWeight: 900, fontSize: 16, color: c.text }}>{quiz.title}</div>
        <div className={`tw-session-closed-meta ${expanded ? "is-hidden" : ""}`} style={{ marginTop: 8 }}><span style={{ display: "inline-flex", padding: "5px 10px", borderRadius: 999, background: tone.softBg, color: tone.accent, border: `1px solid ${tone.border}`, fontSize: 12, fontWeight: 900 }}>{templateLabel(quiz.template_type)} · {quiz.category}</span></div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}><Badge c={c} label={inSession ? "Active session" : isPublished ? "Ready" : "Draft"} tone={inSession || isPublished ? "green" : "yellow"} />{!guestMode && <Badge c={c} label={activeSession?.class_name || folderLabel} tone="blue" />}</div>
      </div>
      <TeacherPressButton tone="blue" className={`tw-session-toggle${expanded ? " is-selected" : ""}`} onClick={onToggle}>{expanded ? "Close" : "Open"}</TeacherPressButton>
    </div>

    <div className={`collapsible-content ${expanded ? "open" : ""}`} style={{ marginTop: expanded ? 16 : 0 }}><div className="collapsible-inner"><div style={{ display: "grid", gap: 14 }}>
      <div style={card(c, { padding: 14, boxShadow: "none", background: c.cardBg2 })}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div><div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 800, color: c.textSub, marginBottom: 8 }}>Quiz overview</div><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><Badge c={c} label={templateLabel(quiz.template_type)} /><Badge c={c} label={quiz.category} />{!guestMode && <Badge c={c} label={activeSession?.class_name || folderLabel} tone="blue" />}</div></div>
          <div data-session-actions={quiz.id} style={{ display: "flex", gap: 8, position: "relative", flexWrap: "wrap", zIndex: moreOpen ? 12001 : 1 }}>
            <TeacherPressButton tone="blue" onClick={() => onHost(quiz)} disabled={!isPublished || inSession}>{inSession ? "Already active" : "Host Live"}</TeacherPressButton>
            {!guestMode && <TeacherPressButton tone="neutral" style={{ "--tw-press-face": c.cardBg2, "--tw-press-base": c.border, "--tw-press-border": c.border, color: c.text }} onClick={() => onAssign(quiz)} disabled={!isPublished}>Assign</TeacherPressButton>}
            <button aria-label="More actions" title="More actions" onClick={() => setMoreOpen((value) => !value)} className="tw-bank-more-button">⋮</button>
            {moreOpen && <div className="tw-session-quick-menu" style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", width: 220, zIndex: 12002, ...card(c, { padding: 8, boxShadow: "0 24px 60px rgba(0,0,0,.26)" }) }}>
              <button onClick={() => { setMoreOpen(false); onPreview(quiz); }} style={menuBtn(c)}>Preview</button>
              <button onClick={() => { setMoreOpen(false); navigate(builderPath); }} style={menuBtn(c)}>Edit</button>
              {!guestMode && <button onClick={() => { setMoreOpen(false); onCopyToBank(quiz); }} style={{ ...menuBtn(c), color: c.yellowFg }}>Add to Quiz Bank</button>}
              {!guestMode && <button onClick={() => { setMoreOpen(false); onDuplicate(quiz); }} style={menuBtn(c)}>Duplicate</button>}
              <button onClick={() => { setMoreOpen(false); onDelete(quiz); }} style={{ ...menuBtn(c), color: c.redFg }}>Delete</button>
            </div>}
          </div>
        </div>
      </div>

      {activeSession && <div style={card(c, { padding: 0, overflow: "hidden", borderColor: tone.border })}>
        <div style={{ padding: "16px 18px", background: tone.softBg, borderBottom: `1px solid ${tone.border}` }}><div style={{ color: tone.accent, fontWeight: 900, fontSize: 18 }}>Session Ready</div></div>
        <div style={{ padding: 18, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
          <div><div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 800, color: c.textSub }}>Join code</div><div style={{ fontWeight: 900, fontSize: 28, letterSpacing: ".22em", color: c.accent }}>{activeSession.join_code}</div><Link to={hostPath} style={{ color: c.accent, fontWeight: 800, textDecoration: "underline" }}>Open Host Panel →</Link></div>
          <div style={{ background: "white", padding: 10, borderRadius: 14 }}><QRCodeCanvas value={`${window.location.origin}/play?code=${activeSession.join_code}`} size={96} /></div>
        </div>
      </div>}
    </div></div></div>
  </div>;
}

function HostLaunchModal({ quiz, folders, institutionPlan, c, onClose, onStart }) {
  const [joinMode, setJoinMode] = useState("SOLO");
  const [classId, setClassId] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const template = normalizeLiveTemplate(quiz.template_type);
  const selected = folders.find((folder) => Number(folder.id) === Number(classId));
  return <div className="tw-host-launch-backdrop" onClick={onClose}>
    <section className="tw-host-launch-modal" onClick={(event) => event.stopPropagation()} style={{ background: c.cardBg, borderColor: c.border, color: c.text }}>
      <button type="button" className="tw-host-launch-close" onClick={onClose} style={{ color: c.text }}><TwIcon name="close" size={22} /></button>
      <div className="tw-host-preview-dual">
        <div className="tw-host-preview-desktop"><img src={TEMPLATE_IMAGES[template]?.landscape} alt={`${templateLabel(template)} desktop gameplay preview`} /></div>
        <div className="tw-host-preview-mobile"><img src={TEMPLATE_IMAGES[template]?.mobile} alt={`${templateLabel(template)} mobile gameplay preview`} /></div>
      </div>
      <div className="tw-host-launch-copy"><h2>{quiz.title}</h2><p style={{ color: c.textMuted }}>{TEMPLATE_DESCRIPTIONS[template]}</p></div>
      {institutionPlan && <div className="tw-host-mode-row"><button type="button" className={joinMode === "SOLO" ? "is-selected" : ""} onClick={() => setJoinMode("SOLO")}>Solo</button><button type="button" className={joinMode === "GROUP" ? "is-selected" : ""} onClick={() => setJoinMode("GROUP")}>Group</button></div>}
      <div className="tw-host-launch-controls">
        <button type="button" className="tw-host-class-field" onClick={() => setPickerOpen(true)} style={{ background: c.inputBg, borderColor: c.inputBorder, color: selected ? c.text : c.textMuted }}><TwIcon name="classes" size={20} /><span>{selected?.pathLabel || "Choose a class"}</span><TwIcon name="chevronDown" size={18} /></button>
        <TeacherPressButton tone="blue" disabled={!classId} onClick={() => onStart(quiz, joinMode, classId)}>Start</TeacherPressButton>
      </div>
      {!folders.length && <div style={{ color: c.redFg, fontSize: 13, fontWeight: 800 }}>Create a class before hosting a live session.</div>}
    </section>
    {pickerOpen && <ClassPicker c={c} folders={folders} selectedId={classId} onClose={() => setPickerOpen(false)} onSelect={(id) => { setClassId(id); setPickerOpen(false); }} />}
  </div>;
}

function ClassPicker({ c, folders, selectedId, onClose, onSelect }) {
  const [parentId, setParentId] = useState(null);
  const { byId, childrenByParent } = useMemo(() => {
    const rowsById = new Map();
    const grouped = new Map();
    (folders || []).forEach((folder) => rowsById.set(Number(folder.id), folder));
    (folders || []).forEach((folder) => {
      const key = folder.parent_id ? Number(folder.parent_id) : null;
      const rows = grouped.get(key) || [];
      rows.push(folder);
      grouped.set(key, rows);
    });
    grouped.forEach((rows) => rows.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""))));
    return { byId: rowsById, childrenByParent: grouped };
  }, [folders]);
  const visibleFolders = childrenByParent.get(parentId) || [];
  const currentFolder = parentId ? byId.get(Number(parentId)) : null;
  const parentFolderId = currentFolder?.parent_id ? Number(currentFolder.parent_id) : null;

  function openFolder(folder) {
    const children = childrenByParent.get(Number(folder.id)) || [];
    if (children.length) {
      setParentId(Number(folder.id));
      return;
    }
    onSelect(Number(folder.id));
  }

  return <div className="tw-class-picker-backdrop" onClick={(event) => { event.stopPropagation(); onClose(); }}>
    <section className="tw-class-picker-modal" onClick={(event) => event.stopPropagation()} style={{ background: c.cardBg, borderColor: c.border, color: c.text }}>
      <div className="tw-class-picker-header">
        <div>
          <h3>Choose a class</h3>
          <p style={{ color: c.textMuted }}>{currentFolder ? currentFolder.name : "Select a top-level folder to view its classes."}</p>
        </div>
        <button type="button" onClick={onClose} style={{ color: c.text }}><TwIcon name="close" size={20} /></button>
      </div>
      {parentId && <button type="button" className="tw-class-picker-back" onClick={() => setParentId(parentFolderId)} style={{ color: c.accent }}><TwIcon name="arrowRight" size={18} style={{ transform: "rotate(180deg)" }} /> Back</button>}
      <div className="tw-class-picker-grid">
        {visibleFolders.map((folder) => {
          const hasChildren = (childrenByParent.get(Number(folder.id)) || []).length > 0;
          const selected = Number(selectedId) === Number(folder.id);
          return <button type="button" key={folder.id} className={`tw-class-picker-card${selected ? " is-selected" : ""}`} onClick={() => openFolder(folder)} style={{ background: c.cardBg2, borderColor: selected ? c.accent : c.border, color: c.text }}>
            <TwIcon name="folder" size={34} />
            <span>{folder.name}</span>
            {hasChildren && <small style={{ color: c.textMuted }}>{(childrenByParent.get(Number(folder.id)) || []).length} folder{(childrenByParent.get(Number(folder.id)) || []).length === 1 ? "" : "s"}</small>}
          </button>;
        })}
        {!visibleFolders.length && <div className="tw-class-picker-empty" style={{ color: c.textMuted }}>No class folders are available here.</div>}
      </div>
    </section>
  </div>;
}

function AssignModal({ quiz, folders, c, onClose, onSubmit }) {
  const [form, setForm] = useState({ classId: null, availableFrom: "", availableUntil: "" });
  const [editing, setEditing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const complete = !!form.classId && !!form.availableFrom && !!form.availableUntil;
  const selected = folders.find((folder) => Number(folder.id) === Number(form.classId));
  function submit(event) { event.preventDefault(); if (complete) onSubmit(quiz, form); }
  return <div style={modalBackdrop} onClick={onClose}><form onSubmit={submit} onClick={(event) => event.stopPropagation()} style={{ ...card(c, { width: "min(95vw, 700px)", padding: 0, overflow: "hidden", background: c.cardBg }) }}>
    <div style={{ padding: "22px 28px", borderBottom: `1px solid ${c.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}><div><h2 style={{ margin: 0, color: c.text }}>Set up assignment</h2><p style={{ color: c.textMuted, marginBottom: 0 }}>Choose a class and answer schedule.</p></div><button type="button" onClick={onClose} style={{ ...btn(c), width: 42, height: 42, display: "grid", placeItems: "center", padding: 0 }}><TwIcon name="close" size={20} /></button></div>
    <div style={{ padding: 28, display: "grid", gap: 14 }}>
      <button type="button" className="tw-host-class-field" onClick={() => setPickerOpen(true)} style={{ background: c.inputBg, borderColor: c.inputBorder, color: selected ? c.text : c.textMuted }}><TwIcon name="classes" size={20} /><span>{selected?.pathLabel || "Choose a class"}</span><TwIcon name="chevronDown" size={18} /></button>
      <div style={{ ...card(c, { boxShadow: "none", padding: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, background: c.cardBg2 }) }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}><TwIcon name="calendar" size={28} /><div><div style={{ color: c.textMuted, fontSize: 13, fontWeight: 800 }}>Schedule</div><div style={{ color: c.text, fontWeight: 900 }}>{form.availableFrom && form.availableUntil ? `${formatSchedule(form.availableFrom)} → ${formatSchedule(form.availableUntil)}` : "Set start and end date/time"}</div></div></div>
        <button type="button" onClick={() => setEditing(true)} style={btn(c)}>Edit</button>
      </div>
      <div style={{ color: c.textMuted, fontSize: 13 }}>Students will only be able to answer within the selected schedule.</div>
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 14, marginTop: 8 }}><button type="button" onClick={onClose} className="tw-teacher-text-cancel">Cancel</button><TeacherPressButton type="submit" tone="blue" disabled={!complete}>Create Assignment</TeacherPressButton></div>
    </div>
    {editing && <ScheduleEditor c={c} form={form} setForm={setForm} onClose={() => setEditing(false)} />}
    {pickerOpen && <ClassPicker c={c} folders={folders} selectedId={form.classId} onClose={() => setPickerOpen(false)} onSelect={(id) => { setForm((current) => ({ ...current, classId: id })); setPickerOpen(false); }} />}
  </form></div>;
}

function ScheduleEditor({ c, form, setForm, onClose }) {
  const startDefault = parseScheduleDate(form.availableFrom, new Date());
  const endDefault = parseScheduleDate(form.availableUntil, addDaysAtNoon(startDefault, 3));
  const [draft, setDraft] = useState({ availableFrom: toLocalDateTimeValue(startDefault), availableUntil: toLocalDateTimeValue(endDefault) });
  const [activeField, setActiveField] = useState("availableUntil");
  const [viewDate, setViewDate] = useState(() => new Date(parseScheduleDate(form.availableUntil, endDefault).getFullYear(), parseScheduleDate(form.availableUntil, endDefault).getMonth(), 1));
  const activeDate = parseScheduleDate(draft[activeField], activeField === "availableFrom" ? startDefault : endDefault);
  const days = buildCalendarDays(viewDate);
  const timeOptions = buildTimeOptions();

  useEffect(() => { const date = parseScheduleDate(draft[activeField], activeDate); setViewDate(new Date(date.getFullYear(), date.getMonth(), 1)); }, [activeField]);

  function setDatePart(day) { const next = new Date(activeDate); next.setFullYear(viewDate.getFullYear(), viewDate.getMonth(), day); setDraft((current) => ({ ...current, [activeField]: toLocalDateTimeValue(next) })); }
  function setTimePart(value) { const [hour, minute] = value.split(":").map(Number); const next = new Date(activeDate); next.setHours(hour, minute, 0, 0); setDraft((current) => ({ ...current, [activeField]: toLocalDateTimeValue(next) })); }
  function apply() { const from = parseScheduleDate(draft.availableFrom, startDefault); let until = parseScheduleDate(draft.availableUntil, endDefault); if (until <= from) until = new Date(from.getTime() + 3600000); setForm((current) => ({ ...current, availableFrom: toLocalDateTimeValue(from), availableUntil: toLocalDateTimeValue(until) })); onClose(); }

  const selectedTime = minutesToTimeValue(activeDate.getHours() * 60 + activeDate.getMinutes());
  return <div style={calendarOverlay(c)}>
    <div style={{ width: "min(94vw, 440px)", background: c.cardBg, color: c.text, borderRadius: 12, boxShadow: "0 24px 60px rgba(0,0,0,.28)", overflow: "hidden" }}>
      <div style={{ padding: "22px 20px 12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 14 }}><div style={{ fontWeight: 900, fontSize: 22 }}>{viewDate.toLocaleString([], { month: "long", year: "numeric" })}</div><div style={{ display: "flex", gap: 8 }}><button type="button" onClick={() => setViewDate((date) => new Date(date.getFullYear(), date.getMonth() - 1, 1))} style={calendarNavBtn(c)}>‹</button><button type="button" onClick={() => setViewDate((date) => new Date(date.getFullYear(), date.getMonth() + 1, 1))} style={calendarNavBtn(c)}>›</button></div></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}><button type="button" onClick={() => setActiveField("availableFrom")} style={segmentBtn(c, activeField === "availableFrom")}>Start<br/><small>{formatSchedule(draft.availableFrom)}</small></button><button type="button" onClick={() => setActiveField("availableUntil")} style={segmentBtn(c, activeField === "availableUntil")}>End<br/><small>{formatSchedule(draft.availableUntil)}</small></button></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", textAlign: "center", color: c.textMuted, fontWeight: 800, rowGap: 10, marginBottom: 8 }}>{["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => <div key={day}>{day}</div>)}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8, textAlign: "center" }}>{days.map((day, index) => { const selected = day && sameCalendarDay(activeDate, viewDate, day); return <button key={`${day || "blank"}-${index}`} type="button" disabled={!day} onClick={() => setDatePart(day)} style={calendarDayBtn(c, selected, !day)}>{day || ""}</button>; })}</div>
      </div>
      <div style={{ borderTop: `1px solid ${c.border}`, padding: "18px 20px 16px" }}><div style={{ fontWeight: 900, fontSize: 17, marginBottom: 8 }}>Time</div><select value={selectedTime} onChange={(event) => setTimePart(event.target.value)} style={{ ...inputStyle(c), height: 46, fontWeight: 700 }}>{timeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
      <div style={{ padding: "0 20px 22px", display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 14 }}><button type="button" onClick={onClose} className="tw-teacher-text-cancel">Cancel</button><TeacherPressButton type="button" tone="blue" onClick={apply}>Set</TeacherPressButton></div>
    </div>
  </div>;
}

function parseScheduleDate(value, fallback) { const date = value ? new Date(value) : new Date(fallback); return Number.isNaN(date.getTime()) ? new Date(fallback) : date; }
function addDaysAtNoon(base, days) { const date = new Date(base); date.setDate(date.getDate() + days); date.setHours(12, 0, 0, 0); return date; }
function toLocalDateTimeValue(date) { const value = new Date(date); const pad = (number) => String(number).padStart(2, "0"); return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`; }
function buildCalendarDays(viewDate) { const firstDay = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1).getDay(); const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate(); return [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, index) => index + 1)]; }
function sameCalendarDay(date, viewDate, day) { return date.getFullYear() === viewDate.getFullYear() && date.getMonth() === viewDate.getMonth() && date.getDate() === day; }
function buildTimeOptions() { const rows = []; for (let hour = 0; hour < 24; hour += 1) for (const minute of [0, 30]) rows.push({ value: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`, label: new Date(2026, 0, 1, hour, minute).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) }); return rows; }
function minutesToTimeValue(minutes) { const rounded = Math.round(minutes / 30) * 30; const hour = Math.floor((rounded % 1440) / 60); const minute = rounded % 60; return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`; }
function calendarNavBtn(c) { return { width: 42, height: 42, borderRadius: 8, border: "none", background: c.cardBg2, color: c.text, fontSize: 28, fontWeight: 900, lineHeight: 1, cursor: "pointer" }; }
function calendarDayBtn(c, selected, blank) { return { height: 42, borderRadius: 6, border: "none", background: selected ? c.accent : "transparent", color: blank ? "transparent" : selected ? "#fff" : c.text, fontSize: 17, fontWeight: selected ? 900 : 600, cursor: blank ? "default" : "pointer", opacity: blank ? 0 : 1 }; }
function segmentBtn(c, active) { return { border: `1px solid ${active ? c.accent : c.border}`, background: active ? `${c.accent}18` : c.cardBg2, color: active ? c.accent : c.text, borderRadius: 12, padding: "10px 12px", textAlign: "left", fontWeight: 900, cursor: "pointer", lineHeight: 1.35 }; }
function calendarOverlay(c) { return { position: "fixed", inset: 0, zIndex: 9500, display: "grid", placeItems: "center", background: "rgba(15,23,42,.38)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)", padding: 20 }; }
function formatSchedule(value) { if (!value) return "Not set"; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }); }
function menuBtn(c) { return { width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: 10, border: "none", background: "transparent", color: c.text, fontWeight: 700, cursor: "pointer" }; }
function inputStyle(c) { return { width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 12, border: `1px solid ${c.inputBorder || c.border}`, background: c.inputBg || c.cardBg2, color: c.text }; }
const modalBackdrop = { position: "fixed", inset: 0, background: "rgba(15,23,42,.46)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", display: "grid", placeItems: "center", padding: 20, zIndex: 9000, isolation: "isolate" };
