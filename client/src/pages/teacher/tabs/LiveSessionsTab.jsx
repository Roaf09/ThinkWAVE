/* FILE GUIDE:
 * client/src/pages/teacher/tabs/LiveSessionsTab.jsx
 * Purpose: Teacher/Guest session management, pre-host setup, and assignment scheduling.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../../lib/api";
import { useColors, useTheme } from "../../../context/ThemeContext";
import { TEMPLATE_PALETTES } from "../../../lib/templatePalette";
import QuizPreviewModal from "../../../components/QuizPreviewModal";
import { isInstitutionPlan } from "../../../lib/planLimits";
import { ProfileSavedOverlay } from "../../../components/ProfileSettings";
import { TeacherActionModal, TeacherPressButton, ThinkBotEmptyState } from "../TeacherUI";
import { DEFAULT_SESSION_BACKGROUND } from "../../../lib/sessionBackgrounds";
import ThinkBotTutorial from "../../../components/ThinkBotTutorial";
import { finishMainTutorial, readTutorialState, writeTutorialState } from "../../../lib/tutorialState";
import { tabCard as card, tabInputStyle as inputStyle, normalizeBankTemplate as normalizeLiveTemplate, buildFolderPathMap } from "./teacherTabShared";
import { LiveQuizCard } from "./live-parts/LiveQuizCard";
import { HostLaunchModal } from "./live-parts/HostLaunchModal";
import { AssignModal } from "./live-parts/AssignSetupModal";

const labelStyleSmall = (c) => ({ display: "block", fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".06em", color: c.textMuted, marginBottom: 6 });

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
  const [sortBy, setSortBy] = useState("recent");
  const [templateFilter, setTemplateFilter] = useState("ALL");
  const [statusFilters, setStatusFilters] = useState({ DRAFT: false, PUBLISHED: false });
  const [filterOpen, setFilterOpen] = useState(false);
  const [institutionPlan, setInstitutionPlan] = useState(false);
  const [openQuizId, setOpenQuizId] = useState(null);
  const [promotedQuizIds, setPromotedQuizIds] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem("thinkwave:promoted-live-quizzes") || "[]").map(Number).filter(Number.isFinite); } catch { return []; }
  });
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
  useEffect(() => { try { sessionStorage.setItem("thinkwave:promoted-live-quizzes", JSON.stringify(promotedQuizIds.slice(0, 30))); } catch {} }, [promotedQuizIds]);

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
        window.scrollTo({ top: 0, behavior: "smooth" });
        return numericId;
      }
      return null;
    });
  }

  // A quiz goes PUBLISHED -> IN_SESSION -> BANKED once its live session ends,
  // so it can be reused from the Quiz Bank tab. Excluding BANKED here made a
  // teacher's already-published quiz vanish from Sessions the moment their
  // session ended, which reads as "my saved, published quiz got unpublished
  // and removed" even though nothing was lost.
  const liveQuizzes = useMemo(() => quizzes.filter((quiz) => quiz.status !== "BANKED" && quiz.delivery_mode !== "ASYNCHRONOUS"), [quizzes]);
  const anyStatusFilterChecked = statusFilters.DRAFT || statusFilters.PUBLISHED;
  const filteredQuizzes = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = liveQuizzes.filter((quiz) => {
      // BANKED reads/behaves as published everywhere else in this tab (see
      // isPublished in LiveQuizCard) - fold it into the same filter bucket
      // so the "Published" chip doesn't hide a quiz that's just parked
      // between live sessions.
      if (anyStatusFilterChecked && !statusFilters[quiz.status === "BANKED" ? "PUBLISHED" : quiz.status]) return false;
      if (templateFilter !== "ALL" && normalizeLiveTemplate(quiz.template_type) !== templateFilter) return false;
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
  }, [liveQuizzes, query, statusFilters, anyStatusFilterChecked, templateFilter, sortBy, promotedQuizIds]);

  useEffect(() => {
    if (!String(tutorial?.stage || "").startsWith("sessions_")) return;
    if (!filteredQuizzes.length) return;
    // Prefer a published (hostable) quiz as the tutorial target. If the quiz
    // pinned to the top is stuck as a draft - e.g. from an earlier attempt
    // that hit a bug before publishing - keep looking rather than leaving the
    // teacher stuck on "let's choose Host Live" pointed at a button they
    // can't actually click.
    const currentQuiz = filteredQuizzes.find((quiz) => Number(quiz.id) === Number(openQuizId));
    if (currentQuiz && currentQuiz.status === "PUBLISHED") return;
    const bestCandidate = filteredQuizzes.find((quiz) => quiz.status === "PUBLISHED") || filteredQuizzes[0];
    const bestId = Number(bestCandidate.id);
    if (Number(openQuizId) === bestId) return;
    setOpenQuizId(bestId);
    setPromotedQuizIds((rows) => [bestId, ...rows.filter((id) => Number(id) !== bestId)]);
  }, [tutorial?.stage, filteredQuizzes, openQuizId]);

  async function createLiveSession(quiz, joinMode = "SOLO", classId = null, backgroundKey = DEFAULT_SESSION_BACKGROUND) {
    try {
      const tutorialDemo = !guestMode && !!tutorial?.userId && !readTutorialState(tutorial.userId).hostPanelSeen;
      const { data } = await api.post("/sessions", { quizId: quiz.id, joinMode: guestMode ? "SOLO" : joinMode, classId: guestMode ? null : classId, backgroundKey, tutorialDemo });
      setHostSetupQuiz(null);
      await load();
      setOpenQuizId(quiz.id);
      setPromotedQuizIds((rows) => [Number(quiz.id), ...rows.filter((value) => Number(value) !== Number(quiz.id))]);
      showFlash(data?.existing
        ? `A live session for this quiz is already open in ${data.joinMode === "GROUP" ? "Group" : "Solo"} mode — reopening it instead of starting a new one. End it first if you want to switch modes.`
        : "Session created. Opening the host panel…");
      if (data?.id) navigate(guestMode ? `/guest/sessions/${data.id}/live` : `/teacher/sessions/${data.id}/live`);
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
      // The "assignment is live" explainer is a one-time first-run notice, not a
      // confirmation to repeat on every assignment - show it once per teacher.
      if (tutorial?.userId && !readTutorialState(tutorial.userId).assignmentLiveNoticeSeen) {
        writeTutorialState(tutorial.userId, { assignmentLiveNoticeSeen: true });
        setAssignmentNotice({ className: selectedClass?.name || selectedClass?.pathLabel || "your class" });
      }
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
    <div className="container tw-live-sessions-page grid gap-[18px]" style={{ overflow: "visible", background: c.pageBg, alignContent: "start", gridAutoRows: "max-content" }}>
      <section><h2 className="mb-[4px]" style={{ color: c.text }}>{guestMode ? "Sessions" : "Live Sessions"}</h2></section>
      {liveQuizzes.length > 0 && <section style={card(c, { position: "relative", overflow: "visible" })}>
        <div className="tw-search-filter-row">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search quizzes" className="tw-search-filter-input" style={inputStyle(c)} />
          <TeacherPressButton type="button" tone="neutral" icon="filter" className={`tw-filter-toggle-btn${filterOpen ? " is-selected" : ""}${anyStatusFilterChecked || templateFilter !== "ALL" ? " has-active-filters" : ""}`} onClick={() => setFilterOpen((value) => !value)}>Filter</TeacherPressButton>
        </div>
        {filterOpen && <div className="tw-filter-panel" style={card(c, { position: "absolute", top: "calc(100% + 8px)", right: 12, left: 12, zIndex: 40 })}>
          <div className="tw-filter-panel-group">
            <label style={labelStyleSmall(c)}>Template</label>
            <select value={templateFilter} onChange={(event) => setTemplateFilter(event.target.value)} style={inputStyle(c)}><option value="ALL">All templates</option>{Object.entries(TEMPLATE_PALETTES).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}</select>
          </div>
          <div className="tw-filter-panel-group">
            <label style={labelStyleSmall(c)}>Status</label>
            <div className="tw-filter-chip-row">
              <button type="button" className={`tw-filter-chip${statusFilters.DRAFT ? " is-active" : ""}`} onClick={() => setStatusFilters((prev) => ({ ...prev, DRAFT: !prev.DRAFT }))}>Drafts</button>
              <button type="button" className={`tw-filter-chip${statusFilters.PUBLISHED ? " is-active" : ""}`} onClick={() => setStatusFilters((prev) => ({ ...prev, PUBLISHED: !prev.PUBLISHED }))}>Published</button>
            </div>
          </div>
          <div className="tw-filter-panel-group">
            <label style={labelStyleSmall(c)}>Sort by</label>
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} style={inputStyle(c)}><option value="recent">Newest first</option><option value="title">Title A–Z</option></select>
          </div>
        </div>}
      </section>}
      {flash && <div className="px-[16px] py-[12px] font-[800] text-[13px]" style={{ ...card(c, { boxShadow: "none", background: flash.kind === "error" ? c.redBg : c.greenBg, borderColor: flash.kind === "error" ? c.redBorder : c.greenBorder }), color: flash.kind === "error" ? c.redFg : c.greenFg }}>{flash.text}</div>}
      {!liveQuizzes.length ? <ThinkBotEmptyState c={c} title="You do not have any quizzes ready yet." actionLabel={guestMode ? "Create & Open Builder" : undefined} onAction={guestMode ? () => setActiveTab?.("create") : undefined} /> : !filteredQuizzes.length ? <div style={card(c)}>No quizzes match your current filters.</div> : <div className="grid gap-[12px]">{filteredQuizzes.map((quiz) => <LiveQuizCard
        key={quiz.id}
        quiz={quiz}
        guestMode={guestMode}
        folderLabel={folderPathMap.get(Number(quiz.class_id)) || ""}
        activeSession={activeByQuizId.get(Number(quiz.id)) || null}
        onHost={(selectedQuiz) => openHostSetup(selectedQuiz)}
        onAssign={openAssignSetup}
        onDelete={(selectedQuiz) => setConfirmState({ type: "delete", quiz: selectedQuiz })}
        onCopyToBank={(selectedQuiz) => setConfirmState({ type: "bank", quiz: selectedQuiz })}
        onDuplicate={(selectedQuiz) => setConfirmState({ type: "duplicate", quiz: selectedQuiz })}
        onPreview={setPreviewQuiz}
        c={c}
        expanded={Number(openQuizId) === Number(quiz.id)}
        onToggle={() => toggleQuizCard(quiz.id)}
      />)}</div>}
      {previewQuiz && <QuizPreviewModal quiz={previewQuiz} onClose={() => setPreviewQuiz(null)} />}
      {!guestMode && assignmentSaved && <ProfileSavedOverlay />}
      {!guestMode && assignmentNotice && <ThinkBotTutorial placement="screen-right" dialogWidth={430} blockInteraction={false} highlight={false} className="tw-assignment-live-notice" clickAnywhere onClickAnywhere={() => setAssignmentNotice(null)}><p><strong>Your assignment is live!</strong></p><p>Students in <strong>{assignmentNotice.className}</strong> can access it according to the schedule you selected.</p></ThinkBotTutorial>}
    </div>

    {hostSetupQuiz && <HostLaunchModal quiz={hostSetupQuiz} folders={folderOptions} institutionPlan={guestMode ? true : institutionPlan} guestMode={guestMode} c={c} dark={dark} onClose={() => { setHostSetupQuiz(null); setSetupTutorialStage(null); }} onStart={createLiveSession} tutorialStage={setupTutorialStage} onTutorialStage={setSetupTutorialStage} onTutorialFinish={() => finishSetupTutorial("hostSetupSeen")} />}
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
