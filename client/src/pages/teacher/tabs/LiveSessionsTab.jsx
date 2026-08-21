/* FILE GUIDE:
 * client/src/pages/teacher/tabs/LiveSessionsTab.jsx
 * Purpose: Teacher/Guest session management, pre-host setup, and assignment scheduling.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
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
import { DEFAULT_SESSION_BACKGROUND, SESSION_BACKGROUNDS } from "../../../lib/sessionBackgrounds";
import ThinkBotTutorial from "../../../components/ThinkBotTutorial";
import { finishMainTutorial, readTutorialState, writeTutorialState } from "../../../lib/tutorialState";

const TEMPLATE_IMAGES = {
  MCQ: { landscape: "/media/templates/previews/mcq-landscape.webp", mobile: "/media/templates/previews/mcq-mobile.webp" },
  TRUE_FALSE: { landscape: "/media/templates/previews/tof-landscape.webp", mobile: "/media/templates/previews/tof-mobile.webp" },
  TYPE_ANSWER: { landscape: "/media/templates/previews/identification-landscape.webp", mobile: "/media/templates/previews/identification-mobile.webp" },
  MATCHING: { landscape: "/media/templates/previews/matching-landscape.webp", mobile: "/media/templates/previews/matching-mobile.webp" },
  GUESS_WORD_4PICS: { landscape: "/media/templates/previews/guess-word-landscape.webp", mobile: "/media/templates/previews/guess-word-mobile.webp" },
  THINK_SPELL: { landscape: "/media/templates/previews/think-spell-landscape.webp", mobile: "/media/templates/previews/think-spell-mobile.webp" },
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

export default function LiveSessionsTab({ setActiveTab, guestMode = false, tutorial }) {
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
  const [promotedQuizIds, setPromotedQuizIds] = useState([]);
  const [assignmentSaved, setAssignmentSaved] = useState(false);
  const [assignmentNotice, setAssignmentNotice] = useState(null);
  const [setupTutorialStage, setSetupTutorialStage] = useState(null);
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

  function closeMainTutorialBranch() {
    if (!tutorial?.userId || tutorial?.stage === "complete") return;
    const next = finishMainTutorial(tutorial.userId);
    tutorial.patch?.(next);
  }

  function openHostSetup(selectedQuiz) {
    setHostSetupQuiz(selectedQuiz);
    closeMainTutorialBranch();
    if (tutorial?.userId && !readTutorialState(tutorial.userId).hostSetupSeen) setSetupTutorialStage("host_class");
  }

  function openAssignSetup(selectedQuiz) {
    setAssignQuiz(selectedQuiz);
    closeMainTutorialBranch();
    if (tutorial?.userId && !readTutorialState(tutorial.userId).assignmentSetupSeen) setSetupTutorialStage("assign_schedule");
  }

  function finishSetupTutorial(key) {
    if (tutorial?.userId) writeTutorialState(tutorial.userId, { [key]: true });
    setSetupTutorialStage(null);
  }

  function toggleQuizCard(quizId) {
    const numericId = Number(quizId);
    setOpenQuizId((current) => {
      const opening = Number(current) !== numericId;
      if (opening) {
        setPromotedQuizIds((rows) => [numericId, ...rows.filter((id) => Number(id) !== numericId)]);
        return numericId;
      }
      return null;
    });
  }

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
    rows.sort((a, b) => {
      const aRank = promotedQuizIds.indexOf(Number(a.id));
      const bRank = promotedQuizIds.indexOf(Number(b.id));
      if (aRank >= 0 || bRank >= 0) {
        if (aRank < 0) return 1;
        if (bRank < 0) return -1;
        if (aRank !== bRank) return aRank - bRank;
      }
      if (sortBy === "title") return String(a.title || "").localeCompare(String(b.title || ""));
      const aUpdated = new Date(a.updated_at || a.created_at || 0).getTime();
      const bUpdated = new Date(b.updated_at || b.created_at || 0).getTime();
      return bUpdated - aUpdated || Number(b.id) - Number(a.id);
    });
    return rows;
  }, [liveQuizzes, query, statusFilter, sortBy, activeByQuizId, promotedQuizIds]);

  useEffect(() => {
    if (!String(tutorial?.stage || "").startsWith("sessions_")) return;
    if (!filteredQuizzes.length) return;
    setOpenQuizId((current) => {
      if (current) return current;
      const firstId = Number(filteredQuizzes[0].id);
      setPromotedQuizIds((rows) => [firstId, ...rows.filter((id) => Number(id) !== firstId)]);
      return firstId;
    });
  }, [tutorial?.stage, filteredQuizzes.length]);

  async function createLiveSession(quiz, joinMode = "SOLO", classId = null, backgroundKey = DEFAULT_SESSION_BACKGROUND) {
    try {
      const tutorialDemo = !guestMode && !!tutorial?.userId && !readTutorialState(tutorial.userId).hostPanelSeen;
      const { data } = await api.post("/sessions", { quizId: quiz.id, joinMode: guestMode ? "SOLO" : joinMode, classId: guestMode ? null : classId, backgroundKey, tutorialDemo });
      setHostSetupQuiz(null);
      await load();
      setOpenQuizId(quiz.id);
      setPromotedQuizIds((rows) => [Number(quiz.id), ...rows.filter((value) => Number(value) !== Number(quiz.id))]);
      showFlash(data?.existing ? "That live session is already open." : "Session created. Opening the host panel…");
      if (!guestMode && data?.id) navigate(`/teacher/sessions/${data.id}/live`);
    } catch (error) {
      showFlash(error?.response?.data?.message || "Failed to create session.", "error");
    }
  }

  async function createAssignment(quiz, payload) {
    try {
      await api.post(`/quizzes/${quiz.id}/assign`, payload);
      const selectedClass = folderOptions.find((folder) => Number(folder.id) === Number(payload?.classId));
      setAssignQuiz(null);
      await load();
      setAssignmentSaved(true);
      setAssignmentNotice({ className: selectedClass?.name || selectedClass?.pathLabel || "your class" });
      window.setTimeout(() => setAssignmentSaved(false), 2000);
    } catch (error) {
      showFlash(error?.response?.data?.message || "Failed to create assignment.", "error");
    }
  }

  async function deleteQuiz(quiz) { try { await api.delete(`/quizzes/${quiz.id}`); setConfirmState(null); await load(); } catch (error) { showFlash(error?.response?.data?.message || "Failed to delete quiz.", "error"); } }
  async function addToQuizBank(quiz) { try { await api.post(`/quizzes/${quiz.id}/copy-to-bank`); setConfirmState(null); await load(); } catch (error) { showFlash(error?.response?.data?.message || "Failed to copy quiz to Quiz Bank.", "error"); } }
  async function duplicateQuiz(quiz) { try { const { data } = await api.post(`/quizzes/${quiz.id}/duplicate`); setConfirmState(null); await load(); if (data?.id) window.setTimeout(() => window.location.assign(`/teacher/quizzes/${data.id}/builder`), 200); } catch (error) { showFlash(error?.response?.data?.message || "Failed to duplicate quiz.", "error"); } }

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
      {!liveQuizzes.length ? <ThinkBotEmptyState c={c} title="You do not have any quizzes ready yet." actionLabel={guestMode ? "Create & Open Builder" : undefined} onAction={guestMode ? () => setActiveTab?.("create") : undefined} /> : !filteredQuizzes.length ? <div style={card(c)}>No quizzes match your current filters.</div> : <div style={{ display: "grid", gap: 12 }}>{filteredQuizzes.map((quiz) => <QuizCard
        key={quiz.id}
        quiz={quiz}
        guestMode={guestMode}
        folderLabel={folderPathMap.get(Number(quiz.class_id)) || ""}
        activeSession={activeByQuizId.get(Number(quiz.id)) || null}
        onHost={(selectedQuiz) => guestMode ? createLiveSession(selectedQuiz, "SOLO", null) : openHostSetup(selectedQuiz)}
        onAssign={openAssignSetup}
        onDelete={(selectedQuiz) => setConfirmState({ type: "delete", quiz: selectedQuiz })}
        onCopyToBank={(selectedQuiz) => setConfirmState({ type: "bank", quiz: selectedQuiz })}
        onDuplicate={(selectedQuiz) => setConfirmState({ type: "duplicate", quiz: selectedQuiz })}
        onPreview={setPreviewQuiz}
        c={c}
        institutionPlan={institutionPlan}
        expanded={Number(openQuizId) === Number(quiz.id)}
        onToggle={() => toggleQuizCard(quiz.id)}
        dark={dark}
      />)}</div>}
      {previewQuiz && <QuizPreviewModal quiz={previewQuiz} onClose={() => setPreviewQuiz(null)} />}
      {!guestMode && assignmentSaved && <ProfileSavedOverlay />}
      {!guestMode && assignmentNotice && <ThinkBotTutorial placement="screen-right" dialogWidth={430} blockInteraction={false} highlight={false} className="tw-assignment-live-notice" reserveActionSpace actionLabel="Done" onAction={() => setAssignmentNotice(null)}><p><strong>Your assignment is live!</strong></p><p>Students in <strong>{assignmentNotice.className}</strong> can access it according to the schedule you selected.</p></ThinkBotTutorial>}
    </div>

    {!guestMode && hostSetupQuiz && <HostLaunchModal quiz={hostSetupQuiz} folders={folderOptions} institutionPlan={institutionPlan} c={c} dark={dark} onClose={() => { setHostSetupQuiz(null); setSetupTutorialStage(null); }} onStart={createLiveSession} tutorialStage={setupTutorialStage} onTutorialStage={setSetupTutorialStage} onTutorialFinish={() => finishSetupTutorial("hostSetupSeen")} />}
    {!guestMode && assignQuiz && <AssignModal quiz={assignQuiz} folders={folderOptions} c={c} dark={dark} onClose={() => { setAssignQuiz(null); setSetupTutorialStage(null); }} onSubmit={createAssignment} tutorialStage={setupTutorialStage} onTutorialStage={setSetupTutorialStage} onTutorialFinish={() => finishSetupTutorial("assignmentSetupSeen")} />}
    {!guestMode && tutorial?.stage === "sessions_intro" && (
      <ThinkBotTutorial target='[data-tutorial="session-card"]' placement="below" dialogWidth={430} dragKey="sessions-share-dialog" clickAnywhere allowTargetInteraction={false} onClickAnywhere={() => tutorial.setStage?.("sessions_host_info")}>
        <p>Your activity is ready. Now you have two ways to share it with your students.</p>
      </ThinkBotTutorial>
    )}
    {!guestMode && tutorial?.stage === "sessions_host_info" && (
      <ThinkBotTutorial target='[data-tutorial="session-host-live"]' placement="below" dialogWidth={390} dragKey="sessions-share-dialog" highlightMode="target" clickAnywhere allowTargetInteraction={false} onClickAnywhere={() => tutorial.setStage?.("sessions_assign_info")}>
        <p><strong>Host Live</strong> is for activities you want everyone to play together. You control the session while results arrive in real time.</p>
      </ThinkBotTutorial>
    )}
    {!guestMode && tutorial?.stage === "sessions_assign_info" && (
      <ThinkBotTutorial target='[data-tutorial="session-assign"]' placement="below" dialogWidth={390} dragKey="sessions-share-dialog" highlightMode="target" clickAnywhere allowTargetInteraction={false} onClickAnywhere={() => tutorial.setStage?.("sessions_choose")}>
        <p><strong>Assign</strong> lets students complete the activity on their own within the schedule you choose.</p>
      </ThinkBotTutorial>
    )}
    {!guestMode && tutorial?.stage === "sessions_choose" && (
      <ThinkBotTutorial target='[data-tutorial="session-host-live"]' placement="below" dialogWidth={360} dragKey="sessions-share-dialog" highlightMode="target">
        <p>For now, let’s choose <strong>Host Live</strong>.</p>
      </ThinkBotTutorial>
    )}

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

  return <div className="tw-live-session-card" data-tutorial="session-card" style={{ ...card(c), ...templateCardChrome(quiz.template_type, c, false), position: "relative", overflow: "visible", zIndex: moreOpen ? 120 : 1, background: dark ? `color-mix(in srgb, ${tone.accent} 18%, ${c.cardBg})` : `color-mix(in srgb, ${tone.accent} 13%, ${c.cardBg})`, border: `3px solid ${tone.border}`, boxShadow: `0 15px 32px color-mix(in srgb, ${tone.accent} 19%, rgba(15,23,42,.15))` }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
      <div>
        <div style={{ fontWeight: 900, fontSize: 16, color: c.text }}>{quiz.title}</div>
        <div className={`tw-session-closed-meta ${expanded ? "is-hidden" : ""}`} style={{ marginTop: 8 }}><span style={{ display: "inline-flex", padding: "5px 10px", borderRadius: 999, background: tone.softBg, color: tone.accent, border: `1px solid ${tone.border}`, fontSize: 12, fontWeight: 900 }}>{templateLabel(quiz.template_type)} · {quiz.category}</span></div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}><Badge c={c} label={inSession ? "Active session" : isPublished ? "Ready" : "Draft"} tone={inSession || isPublished ? "green" : "yellow"} />{!guestMode && (activeSession?.class_name || folderLabel) && <Badge c={c} label={activeSession?.class_name || folderLabel} tone="blue" />}</div>
      </div>
      <TeacherPressButton tone="blue" className={`tw-session-toggle${expanded ? " is-selected" : ""}`} onClick={onToggle}>{expanded ? "Close" : "Open"}</TeacherPressButton>
    </div>

    <div className={`collapsible-content ${expanded ? "open" : ""}`} style={{ marginTop: expanded ? 16 : 0 }}><div className="collapsible-inner"><div style={{ display: "grid", gap: 14 }}>
      <div style={card(c, { padding: 14, boxShadow: "none", background: c.cardBg2 })}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div><div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 800, color: c.textSub, marginBottom: 8 }}>Quiz overview</div><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><Badge c={c} label={templateLabel(quiz.template_type)} /><Badge c={c} label={quiz.category} />{!guestMode && (activeSession?.class_name || folderLabel) && <Badge c={c} label={activeSession?.class_name || folderLabel} tone="blue" />}</div></div>
          <div data-session-actions={quiz.id} style={{ display: "flex", gap: 8, position: "relative", flexWrap: "wrap", zIndex: moreOpen ? 12001 : 1 }}>
            <TeacherPressButton data-tutorial="session-host-live" tone="blue" onClick={() => onHost(quiz)} disabled={!isPublished || inSession}>{inSession ? "Already active" : "Host Live"}</TeacherPressButton>
            {!guestMode && <TeacherPressButton data-tutorial="session-assign" tone="neutral" style={{ "--tw-press-face": c.cardBg2, "--tw-press-base": c.border, "--tw-press-border": c.border, color: c.text }} onClick={() => onAssign(quiz)} disabled={!isPublished}>Assign</TeacherPressButton>}
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

function HostLaunchModal({ quiz, folders, institutionPlan, c, dark, onClose, onStart, tutorialStage, onTutorialStage, onTutorialFinish }) {
  const [joinMode, setJoinMode] = useState("SOLO");
  const [classId, setClassId] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [backgroundKey, setBackgroundKey] = useState(null);
  const [zoomedPreview, setZoomedPreview] = useState(null);
  const template = normalizeLiveTemplate(quiz.template_type);
  const tone = templateTone(template, c, dark);
  const selected = folders.find((folder) => Number(folder.id) === Number(classId));
  return <div className="tw-host-launch-backdrop" onClick={() => { if (!tutorialStage) onClose?.(); }}>
    <section className="tw-host-launch-modal" onClick={(event) => event.stopPropagation()} style={{ background: dark ? "#102443" : solidModalBg(c), borderColor: c.border, color: c.text }}>
      <div className="tw-host-preview-dual">
        <button type="button" className="tw-host-preview-desktop tw-host-preview-clickable" onClick={() => setZoomedPreview("desktop")}><img src={TEMPLATE_IMAGES[template]?.landscape} alt={`${templateLabel(template)} desktop gameplay preview`} /></button>
        <button type="button" className="tw-host-preview-mobile tw-host-preview-clickable" onClick={() => setZoomedPreview("mobile")}><img src={TEMPLATE_IMAGES[template]?.mobile} alt={`${templateLabel(template)} mobile gameplay preview`} /></button>
      </div>
      <div className="tw-host-launch-copy"><h2>{quiz.title}</h2><p style={{ color: c.textMuted }}>Bring friendly competition to ThinkWAVE. Learners climb the leaderboard by answering accurately and quickly, so every response can change the podium.</p></div>
      <div className="tw-host-mode-row">
        <button type="button" className={`tw-host-mode-press${joinMode === "SOLO" ? " is-selected" : ""}`} onClick={() => setJoinMode("SOLO")}><span>Solo</span></button>
        <button type="button" className={`tw-host-mode-press${joinMode === "GROUP" ? " is-selected" : ""}`} disabled={!institutionPlan} title={institutionPlan ? "Host a group session" : "Group mode is available on the Institution plan."} onClick={() => institutionPlan && setJoinMode("GROUP")}><span>Group</span></button>
      </div>
      <div className="tw-host-launch-controls">
        <button data-tutorial="host-class" type="button" className="tw-host-class-field" onClick={() => setPickerOpen(true)} style={{ background: c.inputBg, borderColor: c.inputBorder, color: selected ? c.text : c.textMuted, "--tw-template-accent": tone.accent, "--tw-template-soft": tone.softBg }}><TwIcon name="classes" size={20} /><span>{selected?.pathLabel || "Choose a class"}</span><TwIcon name="chevronDown" size={18} /></button>
        <TeacherPressButton data-tutorial="host-start" tone="blue" disabled={!classId} onClick={() => { if (tutorialStage === "host_start") onTutorialFinish?.(); onStart(quiz, joinMode, classId, backgroundKey); }}>Start</TeacherPressButton>
      </div>
      <BackgroundPicker selectedKey={backgroundKey} onSelect={(key) => { setBackgroundKey(key); if (tutorialStage === "host_background") onTutorialStage?.("host_start"); }} c={c} />
    </section>
    {zoomedPreview && <div className="tw-host-preview-zoom-backdrop" onClick={(event) => { event.stopPropagation(); setZoomedPreview(null); }}>
      <div className={`tw-host-preview-zoom-card is-${zoomedPreview}`} onClick={(event) => event.stopPropagation()}>
        <img src={zoomedPreview === "mobile" ? TEMPLATE_IMAGES[template]?.mobile : TEMPLATE_IMAGES[template]?.landscape} alt={`${templateLabel(template)} ${zoomedPreview} gameplay preview enlarged`} />
      </div>
    </div>}
    {tutorialStage === "host_class" && !pickerOpen && <ThinkBotTutorial target='[data-tutorial="host-class"]' placement="left" square highlightMode="target"><p>First, choose the class that will join this session.</p></ThinkBotTutorial>}
    {tutorialStage === "host_background" && <ThinkBotTutorial target='[data-tutorial="session-backgrounds"]' placement="left" square><p>Browse through the available gameplay backgrounds and pick the one you want your students to see.</p></ThinkBotTutorial>}
    {tutorialStage === "host_start" && <ThinkBotTutorial target='[data-tutorial="host-start"]' placement="above" square className="tw-tutorial-host-ready-spaced tw-tutorial-bob-down" highlightMode="target"><p>When everything looks good, you’re ready to host.</p></ThinkBotTutorial>}
    {pickerOpen && <ClassPicker c={c} dark={dark} folders={folders} selectedId={classId} onClose={() => setPickerOpen(false)} onSelect={(id) => { setClassId(id); setPickerOpen(false); if (tutorialStage === "host_class") onTutorialStage?.("host_background"); }} />}
  </div>;
}

function BackgroundPicker({ selectedKey, onSelect, c }) {
  const visibleCount = 4;
  const total = SESSION_BACKGROUNDS.length;
  const [startIndex, setStartIndex] = useState(0);
  const [slideDirection, setSlideDirection] = useState("next");
  const lastWheelAt = useRef(0);
  const carouselRef = useRef(null);
  const selectedIndex = SESSION_BACKGROUNDS.findIndex((item) => item.key === selectedKey);
  const visible = Array.from({ length: Math.min(visibleCount, total) }, (_, offset) => SESSION_BACKGROUNDS[(startIndex + offset) % total]);

  function move(step) {
    if (!total) return;
    setSlideDirection(step > 0 ? "next" : "prev");
    setStartIndex((value) => (value + step + total) % total);
  }

  useEffect(() => {
    const node = carouselRef.current;
    if (!node || !total) return undefined;
    const handleWheel = (event) => {
      if (Math.abs(event.deltaY) < 4) return;
      event.preventDefault();
      const now = Date.now();
      if (now - lastWheelAt.current < 220) return;
      lastWheelAt.current = now;
      const step = event.deltaY > 0 ? 1 : -1;
      setSlideDirection(step > 0 ? "next" : "prev");
      setStartIndex((value) => (value + step + total) % total);
    };
    node.addEventListener("wheel", handleWheel, { passive: false });
    return () => node.removeEventListener("wheel", handleWheel);
  }, [total]);

  return <div className="tw-session-background-picker" data-tutorial="session-backgrounds">
    <div className="tw-session-background-head"><span>Choose a gameplay background</span><small style={{ color: c.textMuted }}>{selectedIndex >= 0 ? `${selectedIndex + 1} of ${total}` : "No background selected"}</small></div>
    <div ref={carouselRef} className="tw-session-background-carousel">
      <button type="button" aria-label="Previous backgrounds" className="tw-session-background-arrow is-left" onClick={() => move(-1)} style={{ color: c.text, borderColor: c.border, background: c.cardBg2 }}><TwIcon name="arrow" size={20} /></button>
      <div className="tw-session-background-track">
        <div key={startIndex} className={`tw-session-background-track-inner is-${slideDirection}`}>
          {visible.map((item) => <button type="button" key={item.key} className={`tw-session-background-card${selectedKey === item.key ? " is-selected" : ""}`} onClick={() => onSelect(item.key)} style={{ borderColor: selectedKey === item.key ? c.accent : c.border, background: c.cardBg2 }} title={item.label}><img src={item.src} alt={item.label} />{selectedKey === item.key && <span><TwIcon name="check" size={17} /></span>}</button>)}
        </div>
      </div>
      <button type="button" aria-label="Next backgrounds" className="tw-session-background-arrow" onClick={() => move(1)} style={{ color: c.text, borderColor: c.border, background: c.cardBg2 }}><TwIcon name="arrow" size={20} /></button>
    </div>
  </div>;
}

function ClassPicker({ c, dark, folders, selectedId, onClose, onSelect }) {
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
    <section className="tw-class-picker-modal" onClick={(event) => event.stopPropagation()} style={{ background: dark ? "#102443" : solidModalBg(c), borderColor: c.border, color: c.text }}>
      <div className="tw-class-picker-header">
        <div>
          <h3>Choose a class</h3>
          <p style={{ color: c.textMuted }}>{currentFolder ? currentFolder.name : folders.length ? "Choose a folder or class to continue." : ""}</p>
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
            <span className="tw-class-picker-name" title={folder.name}>{folder.name}</span>
            {hasChildren && <small style={{ color: c.textMuted }}>{(childrenByParent.get(Number(folder.id)) || []).length} folder{(childrenByParent.get(Number(folder.id)) || []).length === 1 ? "" : "s"}</small>}
          </button>;
        })}
        {!visibleFolders.length && <div className="tw-class-picker-empty tw-class-picker-thinkbot" style={{ color: c.textMuted }}><img src="/media/thinkbotbot.webp" alt="ThinkBOT" /><p>You have not made any classes yet.</p></div>}
      </div>
    </section>
  </div>;
}

function AssignModal({ quiz, folders, c, dark, onClose, onSubmit, tutorialStage, onTutorialStage, onTutorialFinish }) {
  const [form, setForm] = useState({ classId: null, availableFrom: "", availableUntil: "", backgroundKey: null });
  const [editing, setEditing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const complete = !!form.classId && !!form.availableFrom && !!form.availableUntil;
  const selected = folders.find((folder) => Number(folder.id) === Number(form.classId));
  const tone = templateTone(normalizeLiveTemplate(quiz.template_type), c, dark);
  function submit(event) { event.preventDefault(); if (complete) { if (tutorialStage === "assign_create") onTutorialFinish?.(); onSubmit(quiz, form); } }
  return <div style={modalBackdrop} onClick={onClose}><form onSubmit={submit} onClick={(event) => event.stopPropagation()} className="tw-assignment-setup-modal" style={{ ...card(c, { width: "min(95vw, 700px)", padding: 0, overflow: "hidden", background: solidModalBg(c) }) }}>
    <div style={{ padding: "22px 28px", borderBottom: `1px solid ${c.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}><div><h2 style={{ margin: 0, color: c.text }}>Set up assignment</h2><p style={{ color: c.textMuted, marginBottom: 0 }}>Set the schedule, choose the class, then pick the gameplay background.</p></div><button type="button" onClick={onClose} style={{ ...btn(c), width: 42, height: 42, display: "grid", placeItems: "center", padding: 0 }}><TwIcon name="close" size={20} /></button></div>
    <div style={{ padding: 28, display: "grid", gap: 14 }}>
      <div data-tutorial="assign-schedule" role="button" tabIndex={0} onClick={() => setEditing(true)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setEditing(true); } }} style={{ ...card(c, { boxShadow: "none", padding: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, background: c.cardBg2 }), cursor: "pointer" }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}><TwIcon name="calendar" size={28} /><div><div style={{ color: c.textMuted, fontSize: 13, fontWeight: 800 }}>Schedule</div><div style={{ color: c.text, fontWeight: 900 }}>{form.availableFrom && form.availableUntil ? `${formatSchedule(form.availableFrom)} → ${formatSchedule(form.availableUntil)}` : "Set start and end date/time"}</div></div></div>
        <button type="button" onClick={(event) => { event.stopPropagation(); setEditing(true); }} style={btn(c)}>Edit</button>
      </div>
      <div style={{ color: c.textMuted, fontSize: 13 }}>Students will only be able to answer within the selected schedule.</div>
      <button data-tutorial="assign-class" type="button" className="tw-host-class-field" onClick={() => setPickerOpen(true)} style={{ background: c.inputBg, borderColor: c.inputBorder, color: selected ? c.text : c.textMuted, "--tw-template-accent": tone.accent, "--tw-template-soft": tone.softBg }}><TwIcon name="classes" size={20} /><span>{selected?.pathLabel || "Choose a class"}</span><TwIcon name="chevronDown" size={18} /></button>
      <div className="tw-assignment-primary-actions" style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 14, marginTop: 4 }}><button type="button" onClick={onClose} className="tw-teacher-text-cancel">Cancel</button><TeacherPressButton data-tutorial="assign-create" type="submit" tone="blue" disabled={!complete}>Create Assignment</TeacherPressButton></div>
      <BackgroundPicker selectedKey={form.backgroundKey} onSelect={(backgroundKey) => { setForm((current) => ({ ...current, backgroundKey })); if (tutorialStage === "assign_background") onTutorialStage?.("assign_create"); }} c={c} />
    </div>
    {tutorialStage === "assign_schedule" && !editing && <ThinkBotTutorial target='[data-tutorial="assign-schedule"]' placement="left" square><p>Assignments are completed by students on their own time. Start by deciding when students can access this activity.</p></ThinkBotTutorial>}
    {tutorialStage === "assign_class" && !pickerOpen && <ThinkBotTutorial target='[data-tutorial="assign-class"]' placement="left" square highlightMode="target"><p>Now choose which class should receive the assignment.</p></ThinkBotTutorial>}
    {tutorialStage === "assign_background" && <ThinkBotTutorial target='[data-tutorial="session-backgrounds"]' placement="left" square><p>Browse through the available gameplay backgrounds and pick the one you want your students to see.</p></ThinkBotTutorial>}
    {tutorialStage === "assign_create" && <ThinkBotTutorial target='[data-tutorial="assign-create"]' placement="above" square highlightMode="target"><p>Ready? Create the assignment and ThinkWAVE will take care of the rest.</p></ThinkBotTutorial>}
    {editing && <ScheduleEditor c={c} form={form} setForm={setForm} onClose={() => setEditing(false)} onApply={() => tutorialStage === "assign_schedule" && onTutorialStage?.("assign_class")} />}
    {pickerOpen && <ClassPicker c={c} dark={dark} folders={folders} selectedId={form.classId} onClose={() => setPickerOpen(false)} onSelect={(id) => { setForm((current) => ({ ...current, classId: id })); setPickerOpen(false); if (tutorialStage === "assign_class") onTutorialStage?.("assign_background"); }} />}
  </form></div>;
}

function ScheduleEditor({ c, form, setForm, onClose, onApply }) {
  const startDefault = parseScheduleDate(form.availableFrom, new Date());
  const endDefault = parseScheduleDate(form.availableUntil, addDaysAtNoon(startDefault, 3));
  const [draft, setDraft] = useState({ availableFrom: toLocalDateTimeValue(startDefault), availableUntil: toLocalDateTimeValue(endDefault) });
  const [activeField, setActiveField] = useState("availableFrom");
  const [viewDate, setViewDate] = useState(() => new Date(startDefault.getFullYear(), startDefault.getMonth(), 1));
  const activeDate = parseScheduleDate(draft[activeField], activeField === "availableFrom" ? startDefault : endDefault);
  const days = buildCalendarDays(viewDate);
  const timeOptions = buildTimeOptions();

  useEffect(() => { const date = parseScheduleDate(draft[activeField], activeDate); setViewDate(new Date(date.getFullYear(), date.getMonth(), 1)); }, [activeField]);

  function setDatePart(day) { const next = new Date(activeDate); next.setFullYear(viewDate.getFullYear(), viewDate.getMonth(), day); setDraft((current) => ({ ...current, [activeField]: toLocalDateTimeValue(next) })); }
  function setTimePart(value) { const [hour, minute] = value.split(":").map(Number); const next = new Date(activeDate); next.setHours(hour, minute, 0, 0); setDraft((current) => ({ ...current, [activeField]: toLocalDateTimeValue(next) })); }
  function apply() { const from = parseScheduleDate(draft.availableFrom, startDefault); let until = parseScheduleDate(draft.availableUntil, endDefault); if (until <= from) until = new Date(from.getTime() + 3600000); setForm((current) => ({ ...current, availableFrom: toLocalDateTimeValue(from), availableUntil: toLocalDateTimeValue(until) })); onClose(); onApply?.(); }

  const selectedTime = minutesToTimeValue(activeDate.getHours() * 60 + activeDate.getMinutes());
  return <div style={calendarOverlay(c)} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} onContextMenu={(event) => event.stopPropagation()}>
    <div role="dialog" aria-modal="true" style={{ width: "min(94vw, 440px)", background: solidModalBg(c), color: c.text, borderRadius: 12, boxShadow: "0 24px 60px rgba(0,0,0,.28)", overflow: "hidden" }}>
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
function solidModalBg(c) { return String(c.text || "").toLowerCase() === "#eef4ff" ? "#07142b" : "#fffaf0"; }
function menuBtn(c) { return { width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: 10, border: "none", background: "transparent", color: c.text, fontWeight: 700, cursor: "pointer" }; }
function inputStyle(c) { return { width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 12, border: `1px solid ${c.inputBorder || c.border}`, background: c.inputBg || c.cardBg2, color: c.text }; }
const modalBackdrop = { position: "fixed", inset: 0, background: "rgba(15,23,42,.46)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", display: "grid", placeItems: "center", padding: 20, zIndex: 9000, isolation: "isolate" };
