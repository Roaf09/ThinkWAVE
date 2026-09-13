/* FILE GUIDE:
 * client/src/pages/teacher/tabs/ClassesTab.jsx
 * Purpose: Kahoot-style class/folder browser with class codes, rosters, and quiz shortcuts.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../../../lib/api";
import { useColors } from "../../../context/ThemeContext";
import { TwIcon } from "../../../components/TwUI";
import { isInstitutionPlan } from "../../../lib/planLimits";
import { TeacherPressButton, ThinkBotEmptyState, TeacherActionModal } from "../TeacherUI";
import ThinkBotTutorial from "../../../components/ThinkBotTutorial";
import { tabCard as card, tabBtn as btn, useIsMobileViewport } from "./teacherTabShared";
import { buildTree, buildPath, findNode } from "./classes-parts/classTreeUtils";
import { AssignmentResultRow, ClassReportCard, ClassAnalyticsModal, StudentAnalyticsModal } from "./classes-parts/ClassReportsAndAnalytics";
import { RemoveStudentModal, FolderCard, FolderModal } from "./classes-parts/FolderDialogs";

function row(c) { return { background: c.cardBg2, border: `3px solid ${c.border}` }; }
function crumbBtn(c, active) { return { ...btn(c, active), borderRadius: 999, borderWidth: 3 }; }

export default function ClassesTab({ tutorial }) {
  const c = useColors();
  const isMobile = useIsMobileViewport();
  const location = useLocation();
  const navigate = useNavigate();
  const routeHandledRef = useRef(false);
  const [folders, setFolders] = useState([]);
  const [students, setStudents] = useState([]);
  const [asyncResults, setAsyncResults] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [classCode, setClassCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [menuFor, setMenuFor] = useState(null);
  const [folderModal, setFolderModal] = useState(null);
  const [renameModal, setRenameModal] = useState(null);
  const [removeConfirm, setRemoveConfirm] = useState(null);
  const [folderAction, setFolderAction] = useState(null);
  const [folderName, setFolderName] = useState("");
  const [advancedPlan, setAdvancedPlan] = useState(false);
  const [planLoaded, setPlanLoaded] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");
  const [classAnalytics, setClassAnalytics] = useState(null);
  const [classAnalyticsLoading, setClassAnalyticsLoading] = useState(false);
  const [classAnalyticsMode, setClassAnalyticsMode] = useState("LIVE");
  const [studentAnalytics, setStudentAnalytics] = useState(null);
  const [studentAnalyticsLoading, setStudentAnalyticsLoading] = useState(false);
  const [subjectTipReady, setSubjectTipReady] = useState(false);
  const tutorialSubjectId = Number(tutorial?.state?.tutorialSubjectId || 0);
  const tutorialSectionId = Number(tutorial?.state?.tutorialSectionId || 0);

  useEffect(() => {
    const modalOpen = Boolean(classAnalytics || studentAnalytics || folderModal || renameModal || removeConfirm || folderAction);
    if (!modalOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    const previousOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscroll;
    };
  }, [classAnalytics, studentAnalytics, folderModal, renameModal, removeConfirm, folderAction]);

  async function load() {
    setLoading(true);
    try {
      const [folderRes, sessionRes] = await Promise.all([api.get("/classes"), api.get("/sessions/history")]);
      setFolders(folderRes.data || []);
      setSessions(sessionRes.data || []);
    } catch (err) {
      setMsg(err?.response?.data?.message || "Failed to load classes.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const stage = tutorial?.stage;
    let delay = 0;
    let next = null;
    if (stage === "classes_intro_delay") { delay = 2000; next = "classes_intro"; }
    else if (stage === "classes_subject_done_delay") { delay = 2000; next = "classes_subject_done"; }
    else if (stage === "classes_to_create_delay") { delay = 2000; next = "nav_create"; }
    if (!next) return undefined;
    const timer = window.setTimeout(() => tutorial?.setStage?.(next), delay);
    return () => window.clearTimeout(timer);
  }, [tutorial?.stage]);

  useEffect(() => {
    setSubjectTipReady(false);
    if (tutorial?.stage !== "classes_wait_subject") return undefined;
    const timer = window.setTimeout(() => setSubjectTipReady(true), 5000);
    return () => window.clearTimeout(timer);
  }, [tutorial?.stage]);

  useEffect(() => {
    if (tutorial?.stage !== "classes_focus_subject" || !tutorialSubjectId) return;
    if (Number(selectedFolderId) === Number(tutorialSubjectId)) tutorial?.setStage?.("classes_create_section");
  }, [tutorial?.stage, tutorialSubjectId, selectedFolderId]);

  // Resume hardening: after an interruption the persisted tutorial folders may
  // no longer be selected (selection is transient), which would leave the
  // highlight/dialog pointing at nothing. Re-select them, or fall back to the
  // stable prompt when the folder itself is gone.
  useEffect(() => {
    if (loading || !folders.length) return;
    const stage = tutorial?.stage;
    const hasSubject = tutorialSubjectId && folders.some((folder) => Number(folder.id) === tutorialSubjectId);
    const hasSection = tutorialSectionId && folders.some((folder) => Number(folder.id) === tutorialSectionId);
    if ((stage === "classes_subject_done" || stage === "classes_focus_subject") && tutorialSubjectId && !hasSubject) {
      tutorial?.setStage?.("classes_intro");
      return;
    }
    if ((stage === "classes_ready" || stage === "classes_share_explain") && tutorialSectionId && !hasSection) {
      tutorial?.setStage?.("classes_intro");
      return;
    }
    if (stage === "classes_focus_subject" && hasSubject && Number(selectedFolderId) !== tutorialSubjectId) {
      setSelectedFolderId(tutorialSubjectId);
    }
    if ((stage === "classes_ready" || stage === "classes_share_explain") && hasSection && Number(selectedFolderId) !== tutorialSectionId) {
      setSelectedFolderId(tutorialSectionId);
    }
    // The share-code display needs its transient classCode refetched — without
    // it the explain dialog points at nothing after an interruption.
    if (stage === "classes_share_explain" && hasSection && Number(selectedFolderId) === tutorialSectionId && !classCode) {
      getShareCode();
    }
  }, [loading, folders, tutorial?.stage, tutorialSubjectId, tutorialSectionId, selectedFolderId, classCode]);

  useEffect(() => {
    let alive = true;
    api.get("/auth/me").then(({ data }) => { if (alive) setAdvancedPlan(isInstitutionPlan(data)); }).catch(() => {}).finally(() => { if (alive) setPlanLoaded(true); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!selectedFolderId) { setStudents([]); setAsyncResults([]); setClassCode(""); return; }
    const refreshStudents = () => api.get(`/classes/${selectedFolderId}/students`).then(({ data }) => setStudents(data || [])).catch(() => setStudents([]));
    const refreshResults = () => api.get(`/classes/${selectedFolderId}/async-results`).then(({ data }) => setAsyncResults(data || [])).catch(() => setAsyncResults([]));
    refreshStudents();
    refreshResults();
    const refreshVisible = () => { if (!document.hidden) refreshResults(); };
    const t = setInterval(refreshVisible, 15000);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", refreshVisible); };
  }, [selectedFolderId, folders]);

  useEffect(() => {
    if (routeHandledRef.current || !planLoaded || !folders.length || !location.state?.classId) return;
    const targetId = Number(location.state.classId);
    if (!(folders || []).some((folder) => Number(folder.id) === targetId)) return;
    routeHandledRef.current = true;
    setSelectedFolderId(targetId);
    if (location.state.openClassAnalytics && advancedPlan) {
      window.setTimeout(() => openClassAnalytics(targetId), 0);
    }
    navigate(location.pathname, { replace: true, state: { tab: "classes" } });
  }, [location.state, location.pathname, folders, planLoaded, advancedPlan, navigate]);

  const tree = useMemo(() => buildTree(folders), [folders]);
  const current = useMemo(() => selectedFolderId ? findNode(tree, selectedFolderId) : null, [tree, selectedFolderId]);
  const children = selectedFolderId ? (current?.children || []) : tree;
  const isSectionFolder = Boolean(selectedFolderId && current?.parent_id);
  const breadcrumbs = useMemo(() => buildPath(folders, selectedFolderId), [folders, selectedFolderId]);
  const currentReports = useMemo(() => (sessions || []).filter((s) => Number(s.class_id) === Number(selectedFolderId)), [sessions, selectedFolderId]);
  const liveReports = useMemo(() => currentReports.filter((s) => s.session_type !== "ASSIGNED" && s.join_mode !== "ASSIGNED"), [currentReports]);
  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return students;
    return students.filter((st) => `${st.first_name || ""} ${st.last_name || ""} ${st.middle_initial || ""} ${st.student_id || ""}`.toLowerCase().includes(q));
  }, [students, studentSearch]);

  async function openClassAnalytics(classId = selectedFolderId) {
    if (!advancedPlan || !classId) return;
    setClassAnalyticsLoading(true);
    setClassAnalytics({ loading: true });
    try {
      const { data } = await api.get(`/classes/${classId}/analytics`);
      setClassAnalytics(data || { stats: {}, trends: [] });
      setClassAnalyticsMode("LIVE");
    } catch (err) {
      setClassAnalytics(null);
      setMsg(err?.response?.data?.message || "Could not load class analytics.");
    } finally { setClassAnalyticsLoading(false); }
  }

  async function openStudentAnalytics(student) {
    if (!advancedPlan || !selectedFolderId || !student?.id) return;
    setStudentAnalyticsLoading(true);
    setStudentAnalytics({ student, loading: true });
    try {
      const { data } = await api.get(`/classes/${selectedFolderId}/students/${student.id}/analytics`);
      setStudentAnalytics(data || { student, stats: {} });
    } catch (err) {
      setStudentAnalytics(null);
      setMsg(err?.response?.data?.message || "Could not load student analytics.");
    } finally { setStudentAnalyticsLoading(false); }
  }

  function openAddFolder() {
    setFolderName("");
    setFolderModal({ parentId: selectedFolderId || null });
    if (tutorial?.stage === "classes_intro") tutorial.setStage?.("classes_wait_subject");
    if (tutorial?.stage === "classes_create_section") tutorial.setStage?.("classes_wait_section");
  }

  async function submitFolder(e) {
    e.preventDefault();
    if (!folderName.trim()) return;
    try {
      const parentId = folderModal?.parentId || null;
      const { data } = await api.post("/classes", { name: folderName.trim().slice(0, 95), parentId });
      setFolderModal(null);
      await load();
      if (tutorial?.stage === "classes_wait_subject" && !parentId) {
        tutorial.patch?.({ tutorialSubjectId: Number(data?.id || 0) });
        tutorial.setStage?.("classes_subject_done_delay", { tutorialSubjectId: Number(data?.id || 0) });
      }
      if (tutorial?.stage === "classes_wait_section" && parentId) {
        const newId = Number(data?.id || 0);
        setSelectedFolderId(newId || parentId);
        tutorial.patch?.({ tutorialSectionId: newId });
        tutorial.setStage?.("classes_ready", { tutorialSectionId: newId });
      }
    } catch (err) {
      setMsg(err?.response?.data?.message || "Could not create folder.");
    }
  }

  async function renameFolder(e) {
    e.preventDefault();
    if (!renameModal || !folderName.trim()) return;
    try {
      await api.put(`/classes/${renameModal.id}`, { name: folderName.trim().slice(0, 95), parentId: renameModal.parent_id || null });
      setRenameModal(null);
      await load();
    } catch (err) {
      setMsg(err?.response?.data?.message || "Could not rename folder.");
    }
  }

  async function deleteFolder(folder) {
    try {
      await api.delete(`/classes/${folder.id}`);
      if (Number(selectedFolderId) === Number(folder.id)) setSelectedFolderId(folder.parent_id || null);
      setMenuFor(null);
      setFolderAction(null);
      await load();
    } catch (err) {
      setMsg(err?.response?.data?.message || "Could not delete folder.");
    }
  }

  async function duplicateFolder(folder) {
    try {
      await api.post(`/classes/${folder.id}/duplicate`);
      setMenuFor(null);
      setFolderAction(null);
      await load();
    } catch (err) {
      setMsg(err?.response?.data?.message || "Could not duplicate folder.");
    }
  }

  async function getShareCode() {
    if (!selectedFolderId) return;
    try {
      const { data } = await api.get(`/classes/${selectedFolderId}/code`);
      setClassCode(data.classCode || "");
      if (tutorial?.stage === "classes_ready") tutorial.setStage?.("classes_share_explain");
    } catch (err) {
      setMsg(err?.response?.data?.message || "Could not generate class code.");
    }
  }

  async function removeStudent(enrollmentId) {
    if (!selectedFolderId) return;
    await api.delete(`/classes/${selectedFolderId}/students/${enrollmentId}`);
    const { data } = await api.get(`/classes/${selectedFolderId}/students`);
    setStudents(data || []);
    setRemoveConfirm(null);
  }

  const classCreateTarget = folders.length === 0 ? '[data-tutorial="class-create-empty"]' : '[data-tutorial="class-add-folder"]';
  const tutorialNodes = <>
    {["classes_intro_delay", "classes_subject_done_delay", "classes_to_create_delay"].includes(tutorial?.stage) && <ThinkBotTutorial />}
    {tutorial?.stage === "classes_intro" && <ThinkBotTutorial target={classCreateTarget} placement="below" dialogWidth={410} highlightMode="target"><p>Let’s start by organizing your classes.</p><p>Create a subject folder for one of the subjects you teach.</p></ThinkBotTutorial>}
    {tutorial?.stage === "classes_wait_subject" && !subjectTipReady && <ThinkBotTutorial target='[data-tutorial="class-folder-modal"]' highlight={false} />}
    {tutorial?.stage === "classes_wait_subject" && subjectTipReady && <ThinkBotTutorial target='[data-tutorial="class-folder-modal"]' placement={isMobile ? "above" : "right"} dialogWidth={isMobile ? 250 : 285} matchTargetHeight={!isMobile} highlight={false} className={isMobile ? "tw-tutorial-tip-small" : "tw-tutorial-tip-panel"}><p><strong>Tip:</strong></p><p>You could use names like <strong>Mathematics</strong>, <strong>Science</strong>, <strong>English</strong>, or whatever works best for you.</p></ThinkBotTutorial>}
    {tutorial?.stage === "classes_subject_done" && <ThinkBotTutorial target={tutorialSubjectId ? `[data-folder-id="${tutorialSubjectId}"]` : undefined} placement={isMobile ? "below" : "center"} square dragKey="classes-sections-dialog" highlightMode="target" allowTargetInteraction={false} clickAnywhere onClickAnywhere={() => tutorial?.setStage?.("classes_sections_example")}><p>Nice! Subject folders give you one place to keep related classes and sections together.</p></ThinkBotTutorial>}
    {tutorial?.stage === "classes_sections_example" && <ThinkBotTutorial target={isMobile && tutorialSubjectId ? `[data-folder-id="${tutorialSubjectId}"]` : undefined} placement={isMobile ? "below" : "center"} square dragKey="classes-sections-dialog" clickAnywhere onClickAnywhere={() => tutorial?.setStage?.("classes_sections_reason")}><p>Some teachers also organize their subjects into sections.</p><p><strong>Mathematics</strong><br/>? Grade 8 - Section A<br/>? Grade 8 - Section B</p></ThinkBotTutorial>}
    {tutorial?.stage === "classes_sections_reason" && <ThinkBotTutorial target={isMobile && tutorialSubjectId ? `[data-folder-id="${tutorialSubjectId}"]` : undefined} placement={isMobile ? "below" : "center"} square dragKey="classes-sections-dialog" clickAnywhere onClickAnywhere={() => tutorial?.setStage?.("classes_sections_optional")}><p>If you teach multiple sections of the same subject, creating folders inside your subject can make things easier to manage.</p></ThinkBotTutorial>}
    {tutorial?.stage === "classes_sections_optional" && (isMobile ? <ThinkBotTutorial target={tutorialSubjectId ? `[data-folder-id="${tutorialSubjectId}"]` : undefined} placement="below" square dragKey="classes-sections-dialog" clickAnywhere onClickAnywhere={() => { setSelectedFolderId(null); tutorial?.setStage?.("classes_focus_subject"); }}><p>But this is completely optional. You can organize ThinkWAVE however it fits your teaching style.</p></ThinkBotTutorial> : <ThinkBotTutorial placement="center" dialogWidth={430} dragKey="classes-sections-dialog" clickAnywhere onClickAnywhere={() => { setSelectedFolderId(null); tutorial?.setStage?.("classes_focus_subject"); }}><p>But this is completely optional. You can organize ThinkWAVE however it fits your teaching style.</p></ThinkBotTutorial>)}
    {tutorial?.stage === "classes_focus_subject" && <ThinkBotTutorial target={tutorialSubjectId ? `[data-folder-id="${tutorialSubjectId}"]` : undefined} highlightMode="target" />}
    {tutorial?.stage === "classes_create_section" && <ThinkBotTutorial target='[data-tutorial="class-add-folder"]' placement="below" square dialogWidth={isMobile ? 300 : 360} className="tw-tutorial-bob-up tw-tutorial-button-below" highlightMode="target"><p>Create a section folder inside your new subject.</p></ThinkBotTutorial>}
    {tutorial?.stage === "classes_wait_section" && <ThinkBotTutorial target='[data-tutorial="class-folder-modal"]' placement={isMobile ? "center" : "right"} dialogWidth={isMobile ? 300 : 330} highlight={false} className={isMobile ? "tw-tutorial-below-header" : undefined}><p>Name the section you teach, then create it.</p></ThinkBotTutorial>}
    {tutorial?.stage === "classes_ready" && <ThinkBotTutorial target='[data-tutorial="class-share-code"]' placement="below" dialogWidth={isMobile ? 300 : 360} className="tw-tutorial-bob-up tw-tutorial-button-below" highlightMode="target"><p>Perfect. Your class is ready for students!</p></ThinkBotTutorial>}
    {tutorial?.stage === "classes_share_explain" && <ThinkBotTutorial target='[data-tutorial="class-code-display"]' placement={isMobile ? "below" : "center"} dialogWidth={isMobile ? 320 : 440} className={isMobile ? "tw-tutorial-gap-below" : undefined} clickAnywhere onClickAnywhere={() => tutorial?.setStage?.("classes_to_create_delay")}><p>Share this class code with your students. They can enter it from their student account to join your class.</p></ThinkBotTutorial>}
  </>;

  if (!loading && folders.length === 0) {
    return <div className="container grid gap-[18px]">
      <section><h2 className="mb-[4px]" style={{ color: c.text }}>Class</h2></section>
      {msg && <div style={{ ...card(c, { background: c.redBg, borderColor: c.redBorder, color: c.redFg, boxShadow: "none" }) }}>{msg}</div>}
      <ThinkBotEmptyState c={c} title="You have not made any classes yet." actionLabel="Create a Class" onAction={openAddFolder} actionProps={{ "data-tutorial": "class-create-empty" }} />
      {folderModal && <FolderModal c={c} title="Create a Class" value={folderName} setValue={setFolderName} onSubmit={submitFolder} onClose={() => setFolderModal(null)} confirmLabel="Create" placeholder={folderModal?.parentId ? "ex. Grade 6 - Serenity, BSIT 41 A, etc." : "ex. Mathematics, Science, English, etc."} disableCancel={["classes_wait_subject", "classes_wait_section"].includes(tutorial?.stage)} />}
      {tutorialNodes}
    </div>;
  }

  return (
    <div className="container grid gap-[18px]">
      <section>
        <h2 className="mb-[4px]" style={{ color: c.text }}>Class</h2>
      </section>

      {msg && <div style={{ ...card(c, { background: c.redBg, borderColor: c.redBorder, color: c.redFg, boxShadow: "none" }) }}>{msg}</div>}

      <section className="tw-class-folders-shell" style={card(c)}>
        <div className="flex items-center justify-between gap-[12px] flex-wrap mb-[12px]">
          <div className="font-[900] text-[17px]" style={{ color: c.text }}>My Folders</div>
          <div className="flex gap-[10px] flex-wrap">
            {isSectionFolder && advancedPlan && <TeacherPressButton tone="blue" icon="chart" className="tw-class-analytics-btn" onClick={() => openClassAnalytics()}>Class Analytics</TeacherPressButton>}
            <TeacherPressButton tone="blue" icon="plus" data-tutorial="class-add-folder" onClick={openAddFolder}>Add Folder</TeacherPressButton>
            {isSectionFolder && <TeacherPressButton tone="blue" icon="link" data-tutorial="class-share-code" onClick={getShareCode}>Share Code</TeacherPressButton>}
          </div>
        </div>
        <div className="flex items-center gap-[8px] flex-wrap mb-[16px]">
          {/* Revision 10: folder actions stay on the My Folders header row while breadcrumbs remain below. */}
          <button onClick={() => setSelectedFolderId(null)} style={crumbBtn(c, !selectedFolderId)}>All</button>
          {breadcrumbs.map((b) => <button key={b.id} onClick={() => setSelectedFolderId(b.id)} style={crumbBtn(c, Number(selectedFolderId) === Number(b.id))}>{b.name}</button>)}
        </div>

        {classCode && selectedFolderId && (
          <div data-tutorial="class-code-display" className="mb-[16px] p-[14px] rounded-[14px] font-[900] tracking-[2px]" style={{ border: `1px dashed ${c.accent}`, background: `${c.accent}12`, color: c.accent }}>
            Class Code: {classCode}
          </div>
        )}

        <div className="flex items-center justify-between gap-[12px] mb-[12px]">
          <div className="font-[900]" style={{ color: c.text }}>{selectedFolderId ? current?.name || "Folder" : "Folders"}</div>
        </div>

        {loading ? <div style={{ color: c.textMuted }}>Loading folders…</div> : (
          <div className="grid gap-[12px] grid-cols-[repeat(auto-fill,minmax(230px,1fr))]">
            {children.map((folder) => <FolderCard key={folder.id} folder={folder} c={c} menuFor={menuFor} setMenuFor={setMenuFor} onOpen={() => setSelectedFolderId(folder.id)} onRename={() => { setFolderName(folder.name); setRenameModal(folder); setMenuFor(null); }} onDelete={() => { setFolderAction({ type: "delete", folder }); setMenuFor(null); }} onDuplicate={() => { setFolderAction({ type: "duplicate", folder }); setMenuFor(null); }} />)}
          </div>
        )}

        {isSectionFolder && <div className="mt-[22px]">
          <div className="tw-class-student-head">
            <div className="font-[900]" style={{ color: c.text }}>Students</div>
            {advancedPlan && <label className="tw-class-student-search" style={{ borderColor: c.inputBorder, background: c.inputBg, color: c.text }}>
              <TwIcon name="search" size={17} />
              <input value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} placeholder="Search students" style={{ color: c.text }} />
            </label>}
          </div>
          {students.length === 0 ? <div style={{ color: c.textMuted }}>No students have joined this class yet.</div> : filteredStudents.length === 0 ? <div style={{ color: c.textMuted }}>No students match your search.</div> : <div className="tw-class-student-list">{filteredStudents.map((st) => <div key={st.id} className={`flex items-center justify-between gap-[12px] p-[12px] rounded-[14px] mb-[8px] flex-wrap${advancedPlan ? " tw-class-student-clickable" : ""}`} onClick={() => openStudentAnalytics(st)} style={row(c)}><span>{st.last_name}, {st.first_name} {st.middle_initial || ""}<br/><small style={{ color: c.textMuted }}>Student ID: {st.student_id}</small></span><button onClick={(event) => { event.stopPropagation(); setRemoveConfirm(st); }} style={{ ...btn(c), color: c.redFg, background: c.redBg, border: `3px solid ${c.redBorder}` }}>Remove</button></div>)}</div>}
        </div>}
      </section>

      {isSectionFolder && <section className="tw-class-report-columns">
        <div className="tw-class-report-panel tw-class-live-report-shell" style={card(c)}>
          <h3 className="mt-0">Live Session Reports</h3>
          <div className="tw-class-report-list">
            {liveReports.length === 0 ? <div style={{ color: c.textMuted }}>No live session reports for this class yet.</div> : liveReports.map((session) => <ClassReportCard key={`LIVE-${session.id}`} session={session} c={c} onOpenLive={() => window.location.assign(`/teacher/analytics/${session.id}`)} onOpenAssigned={() => {}} />)}
          </div>
        </div>
        <div className="tw-class-report-panel tw-class-assignment-report-shell" style={card(c)}>
          <h3 className="mt-0">Assignment Reports</h3>
          <div className="tw-class-report-list">
            {asyncResults.length === 0 ? <div style={{ color: c.textMuted }}>No assignment reports for this class yet.</div> : asyncResults.map((r) => <AssignmentResultRow key={r.quiz_id} r={r} c={c} onAnalytics={() => window.location.assign(`/teacher/async-analytics/${selectedFolderId}/${r.quiz_id}`)} />)}
          </div>
        </div>
      </section>}

      {folderModal && <FolderModal c={c} title="Create a Class" value={folderName} setValue={setFolderName} onSubmit={submitFolder} onClose={() => setFolderModal(null)} confirmLabel="Create" placeholder={folderModal?.parentId ? "ex. Grade 6 - Serenity, BSIT 41 A, etc." : "ex. Mathematics, Science, English, etc."} disableCancel={["classes_wait_subject", "classes_wait_section"].includes(tutorial?.stage)} />}
      {renameModal && <FolderModal c={c} title="Rename Class" value={folderName} setValue={setFolderName} onSubmit={renameFolder} onClose={() => setRenameModal(null)} confirmLabel="Save" />}
      {folderAction && <TeacherActionModal c={c} textCancel icon={folderAction.type === "delete" ? "trash" : "plus"} tone={folderAction.type === "delete" ? "red" : "blue"} title={folderAction.type === "delete" ? "Delete class?" : "Duplicate class?"} message={`${folderAction.folder.name} will be ${folderAction.type === "delete" ? "permanently deleted" : "copied with its current folder structure"}.`} confirmLabel={folderAction.type === "delete" ? "Delete" : "Duplicate"} onClose={() => setFolderAction(null)} onConfirm={() => folderAction.type === "delete" ? deleteFolder(folderAction.folder) : duplicateFolder(folderAction.folder)} />}
      {removeConfirm && <RemoveStudentModal c={c} student={removeConfirm} onClose={() => setRemoveConfirm(null)} onConfirm={() => removeStudent(removeConfirm.id)} />}
      {classAnalytics && <ClassAnalyticsModal c={c} data={classAnalytics} loading={classAnalyticsLoading} mode={classAnalyticsMode} setMode={setClassAnalyticsMode} onClose={() => setClassAnalytics(null)} />}
      {studentAnalytics && <StudentAnalyticsModal c={c} data={studentAnalytics} loading={studentAnalyticsLoading} onClose={() => setStudentAnalytics(null)} />}
      {tutorialNodes}
    </div>
  );
}
