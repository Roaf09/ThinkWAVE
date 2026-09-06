/* FILE GUIDE:
 * client/src/pages/teacher/tabs/ClassesTab.jsx
 * Purpose: Kahoot-style class/folder browser with class codes, rosters, and quiz shortcuts.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../../../lib/api";
import { useColors } from "../../../context/ThemeContext";
import { templateCardChrome, templateLabel, templateTone } from "../../../lib/templatePalette";
import { TwIcon } from "../../../components/TwUI";
import { isInstitutionPlan } from "../../../lib/planLimits";
import { TeacherPressButton, ThinkBotEmptyState, TeacherActionModal } from "../TeacherUI";
import ThinkBotTutorial from "../../../components/ThinkBotTutorial";

function card(c, extra = {}) {
  return {
    background: c.cardBg,
    border: `1px solid ${c.border}`,
    borderRadius: 18,
    padding: 16,
    boxShadow: c.pageBg === "#eef2ff" ? "0 14px 30px rgba(43,108,255,0.08)" : "0 14px 30px rgba(0,0,0,0.14)",
    ...extra,
  };
}

function buildTree(rows) {
  const byId = new Map();
  const roots = [];
  (rows || []).forEach((row) => byId.set(Number(row.id), { ...row, children: [] }));
  (rows || []).forEach((row) => {
    const node = byId.get(Number(row.id));
    if (row.parent_id && byId.has(Number(row.parent_id))) byId.get(Number(row.parent_id)).children.push(node);
    else roots.push(node);
  });
  const sort = (items) => items.sort((a, b) => String(a.name).localeCompare(String(b.name))).forEach((n) => sort(n.children || []));
  sort(roots);
  return roots;
}

function buildPath(rows, id) {
  const byId = new Map((rows || []).map((row) => [Number(row.id), row]));
  const trail = [];
  let cursor = byId.get(Number(id));
  while (cursor) {
    trail.unshift(cursor);
    cursor = cursor.parent_id ? byId.get(Number(cursor.parent_id)) : null;
  }
  return trail;
}

function findNode(tree, id) {
  for (const node of tree) {
    if (Number(node.id) === Number(id)) return node;
    const child = findNode(node.children || [], id);
    if (child) return child;
  }
  return null;
}

export default function ClassesTab({ setActiveTab, tutorial }) {
  const c = useColors();
  const location = useLocation();
  const navigate = useNavigate();
  const routeHandledRef = useRef(false);
  const [folders, setFolders] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
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
      const [folderRes, quizRes, sessionRes] = await Promise.all([api.get("/classes"), api.get("/quizzes"), api.get("/sessions/history")]);
      setFolders(folderRes.data || []);
      setQuizzes(quizRes.data || []);
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

  useEffect(() => {
    let alive = true;
    api.get("/auth/me").then(({ data }) => { if (alive) setAdvancedPlan(isInstitutionPlan(data)); }).catch(() => {}).finally(() => { if (alive) setPlanLoaded(true); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const selected = (folders || []).find((folder) => Number(folder.id) === Number(selectedFolderId));
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
  const currentQuizzes = useMemo(() => (quizzes || []).filter((q) => Number(q.class_id) === Number(selectedFolderId) && q.status !== "BANKED"), [quizzes, selectedFolderId]);
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

  async function downloadAsync(quizId, format) {
    const resp = await api.get(`/classes/${selectedFolderId}/async-results/${quizId}/export/${format}`, { responseType: "blob" });
    const url = URL.createObjectURL(new Blob([resp.data]));
    const a = document.createElement("a");
    a.href = url;
    a.download = `async-${quizId}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const classCreateTarget = folders.length === 0 ? '[data-tutorial="class-create-empty"]' : '[data-tutorial="class-add-folder"]';
  const tutorialNodes = <>
    {["classes_intro_delay", "classes_subject_done_delay", "classes_to_create_delay"].includes(tutorial?.stage) && <ThinkBotTutorial />}
    {tutorial?.stage === "classes_intro" && <ThinkBotTutorial target={classCreateTarget} placement="screen-right" dialogWidth={410} highlightMode="target"><p>Let’s start by organizing your classes.</p><p>Create a subject folder for one of the subjects you teach.</p></ThinkBotTutorial>}
    {tutorial?.stage === "classes_wait_subject" && !subjectTipReady && <ThinkBotTutorial target='[data-tutorial="class-folder-modal"]' highlight={false} />}
    {tutorial?.stage === "classes_wait_subject" && subjectTipReady && <ThinkBotTutorial target='[data-tutorial="class-folder-modal"]' placement="right" dialogWidth={285} matchTargetHeight highlight={false} className="tw-tutorial-tip-panel"><p><strong>Tip:</strong></p><p>You could use names like <strong>Mathematics</strong>, <strong>Science</strong>, <strong>English</strong>, or whatever works best for you.</p></ThinkBotTutorial>}
    {tutorial?.stage === "classes_subject_done" && <ThinkBotTutorial target={tutorialSubjectId ? `[data-folder-id="${tutorialSubjectId}"]` : undefined} placement="center" square dragKey="classes-sections-dialog" highlightMode="target" allowTargetInteraction={false} clickAnywhere onClickAnywhere={() => tutorial?.setStage?.("classes_sections_example")}><p>Nice! Subject folders give you one place to keep related classes and sections together.</p></ThinkBotTutorial>}
    {tutorial?.stage === "classes_sections_example" && <ThinkBotTutorial placement="center" square dragKey="classes-sections-dialog" clickAnywhere onClickAnywhere={() => tutorial?.setStage?.("classes_sections_reason")}><p>Some teachers also organize their subjects into sections.</p><p><strong>Mathematics</strong><br/>↳ Grade 8 – Section A<br/>↳ Grade 8 – Section B</p></ThinkBotTutorial>}
    {tutorial?.stage === "classes_sections_reason" && <ThinkBotTutorial placement="center" square dragKey="classes-sections-dialog" clickAnywhere onClickAnywhere={() => tutorial?.setStage?.("classes_sections_optional")}><p>If you teach multiple sections of the same subject, creating folders inside your subject can make things easier to manage.</p></ThinkBotTutorial>}
    {tutorial?.stage === "classes_sections_optional" && <ThinkBotTutorial placement="center" dialogWidth={430} dragKey="classes-sections-dialog" actionLabel="Create a Section Folder" onAction={() => { setSelectedFolderId(null); tutorial?.setStage?.("classes_focus_subject"); }}><p>But this is completely optional. You can organize ThinkWAVE however it fits your teaching style.</p></ThinkBotTutorial>}
    {tutorial?.stage === "classes_focus_subject" && <ThinkBotTutorial target={tutorialSubjectId ? `[data-folder-id="${tutorialSubjectId}"]` : undefined} highlightMode="target" />}
    {tutorial?.stage === "classes_create_section" && <ThinkBotTutorial target='[data-tutorial="class-add-folder"]' placement="below" square dialogWidth={360} className="tw-tutorial-bob-up tw-tutorial-button-below" highlightMode="target"><p>Create a section folder inside your new subject.</p></ThinkBotTutorial>}
    {tutorial?.stage === "classes_wait_section" && <ThinkBotTutorial target='[data-tutorial="class-folder-modal"]' placement="right" dialogWidth={330} highlight={false}><p>Name the section you teach, then create it.</p></ThinkBotTutorial>}
    {tutorial?.stage === "classes_ready" && <ThinkBotTutorial target='[data-tutorial="class-share-code"]' placement="below" dialogWidth={360} className="tw-tutorial-bob-up tw-tutorial-button-below" highlightMode="target"><p>Perfect. Your class is ready for students!</p></ThinkBotTutorial>}
    {tutorial?.stage === "classes_share_explain" && <ThinkBotTutorial target='[data-tutorial="class-code-display"]' placement="center" dialogWidth={440} actionLabel="Okay!" actionDelay={2000} onAction={() => tutorial?.setStage?.("classes_to_create_delay")}><p>Share this class code with your students. They can enter it from their student account to join your class.</p></ThinkBotTutorial>}
  </>;

  if (!loading && folders.length === 0) {
    return <div className="container" style={{ display: "grid", gap: 18 }}>
      <section><h2 style={{ marginBottom: 4, color: c.text }}>Class</h2></section>
      {msg && <div style={{ ...card(c, { background: c.redBg, borderColor: c.redBorder, color: c.redFg, boxShadow: "none" }) }}>{msg}</div>}
      <ThinkBotEmptyState c={c} title="You have not made any classes yet." actionLabel="Create a Class" onAction={openAddFolder} actionProps={{ "data-tutorial": "class-create-empty" }} />
      {folderModal && <FolderModal c={c} title="Create a Class" value={folderName} setValue={setFolderName} onSubmit={submitFolder} onClose={() => setFolderModal(null)} confirmLabel="Create" placeholder={folderModal?.parentId ? "ex. Grade 6 - Serenity, BSIT 41 A, etc." : "ex. Mathematics, Science, English, etc."} disableCancel={["classes_wait_subject", "classes_wait_section"].includes(tutorial?.stage)} />}
      {tutorialNodes}
    </div>;
  }

  return (
    <div className="container" style={{ display: "grid", gap: 18 }}>
      <section>
        <h2 style={{ marginBottom: 4, color: c.text }}>Class</h2>
      </section>

      {msg && <div style={{ ...card(c, { background: c.redBg, borderColor: c.redBorder, color: c.redFg, boxShadow: "none" }) }}>{msg}</div>}

      <section className="tw-class-folders-shell" style={card(c)}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <div style={{ color: c.text, fontWeight: 900, fontSize: 17 }}>My Folders</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {isSectionFolder && advancedPlan && <TeacherPressButton tone="blue" icon="chart" onClick={() => openClassAnalytics()}>Class Analytics</TeacherPressButton>}
            <TeacherPressButton tone="blue" icon="plus" data-tutorial="class-add-folder" onClick={openAddFolder}>Add Folder</TeacherPressButton>
            {isSectionFolder && <TeacherPressButton tone="blue" icon="link" data-tutorial="class-share-code" onClick={getShareCode}>Share Code</TeacherPressButton>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
          {/* Revision 10: folder actions stay on the My Folders header row while breadcrumbs remain below. */}
          <button onClick={() => setSelectedFolderId(null)} style={crumbBtn(c, !selectedFolderId)}>All</button>
          {breadcrumbs.map((b) => <button key={b.id} onClick={() => setSelectedFolderId(b.id)} style={crumbBtn(c, Number(selectedFolderId) === Number(b.id))}>{b.name}</button>)}
        </div>

        {classCode && selectedFolderId && (
          <div data-tutorial="class-code-display" style={{ marginBottom: 16, padding: 14, borderRadius: 14, border: `1px dashed ${c.accent}`, background: `${c.accent}12`, color: c.accent, fontWeight: 900, letterSpacing: 2 }}>
            Class Code: {classCode}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 }}>
          <div style={{ color: c.text, fontWeight: 900 }}>{selectedFolderId ? current?.name || "Folder" : "Folders"}</div>
        </div>

        {loading ? <div style={{ color: c.textMuted }}>Loading folders…</div> : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 12 }}>
            {children.map((folder) => <FolderCard key={folder.id} folder={folder} c={c} menuFor={menuFor} setMenuFor={setMenuFor} onOpen={() => setSelectedFolderId(folder.id)} onRename={() => { setFolderName(folder.name); setRenameModal(folder); setMenuFor(null); }} onDelete={() => { setFolderAction({ type: "delete", folder }); setMenuFor(null); }} onDuplicate={() => { setFolderAction({ type: "duplicate", folder }); setMenuFor(null); }} />)}
          </div>
        )}

        {isSectionFolder && <div style={{ marginTop: 22 }}>
          <div className="tw-class-student-head">
            <div style={{ fontWeight: 900, color: c.text }}>Students</div>
            {advancedPlan && <label className="tw-class-student-search" style={{ borderColor: c.inputBorder, background: c.inputBg, color: c.text }}>
              <TwIcon name="search" size={17} />
              <input value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} placeholder="Search students" style={{ color: c.text }} />
            </label>}
          </div>
          {students.length === 0 ? <div style={{ color: c.textMuted }}>No students have joined this class yet.</div> : filteredStudents.length === 0 ? <div style={{ color: c.textMuted }}>No students match your search.</div> : <div className="tw-class-student-list">{filteredStudents.map((st) => <div key={st.id} className={advancedPlan ? "tw-class-student-clickable" : ""} onClick={() => openStudentAnalytics(st)} style={row(c)}><span>{st.last_name}, {st.first_name} {st.middle_initial || ""}<br/><small style={{ color: c.textMuted }}>Student ID: {st.student_id}</small></span><button onClick={(event) => { event.stopPropagation(); setRemoveConfirm(st); }} style={{ ...btn(c), color: c.redFg, background: c.redBg, border: `3px solid ${c.redBorder}` }}>Remove</button></div>)}</div>}
        </div>}
      </section>

      {isSectionFolder && <section className="tw-class-report-columns">
        <div className="tw-class-report-panel tw-class-live-report-shell" style={card(c)}>
          <h3 style={{ marginTop: 0 }}>Live Session Reports</h3>
          <div className="tw-class-report-list">
            {liveReports.length === 0 ? <div style={{ color: c.textMuted }}>No live session reports for this class yet.</div> : liveReports.map((session) => <ClassReportCard key={`LIVE-${session.id}`} session={session} c={c} onOpenLive={() => window.location.assign(`/teacher/analytics/${session.id}`)} onOpenAssigned={() => {}} />)}
          </div>
        </div>
        <div className="tw-class-report-panel tw-class-assignment-report-shell" style={card(c)}>
          <h3 style={{ marginTop: 0 }}>Assignment Reports</h3>
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


function QuizFolderRow({ quiz, c }) {
  const tone = templateTone(quiz.template_type, c, false);
  return <div style={{ ...row(c), ...templateCardChrome(quiz.template_type, c, false), marginBottom: 8 }}><span><b>{quiz.title}</b><br/><small style={{ color: c.textMuted }}>{templateLabel(quiz.template_type)} · {quiz.status}</small></span><span style={{ color: tone.accent, fontWeight: 900 }}>{templateLabel(quiz.template_type)}</span></div>;
}

function ReportPill({ c, tone, children }) {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 999, fontSize: 12, fontWeight: 850, border: `1px solid ${tone?.border || c.border}`, background: tone?.softBg || c.cardBg2, color: tone?.accent || c.textMuted }}>{children}</span>;
}

function reportDate(value) {
  if (!value) return "Report ready";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Report ready" : date.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
}

function AssignmentResultRow({ r, c, onAnalytics }) {
  const tone = templateTone(r.template_type, c, false);
  return <div className="tw-session-card tw-class-home-session-card" style={{ ...templateCardChrome(r.template_type, c, false, { padding: 14, borderRadius: 14, display: "grid", gap: 10, borderWidth: 4, transition: "transform 220ms ease" }) }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
      <div><div style={{ fontWeight: 900, color: c.text }}>{r.quiz_title}</div><div style={{ fontSize: 12, color: c.textMuted, marginTop: 4 }}>{reportDate(r.available_until || r.available_from || r.created_at)}</div></div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><ReportPill c={c} tone={tone}>{templateLabel(r.template_type)}</ReportPill><ReportPill c={c}>Assignment</ReportPill><ReportPill c={c}>{r.submitted_count || 0} submitted</ReportPill></div>
    </div>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <div style={{ color: c.textMuted, fontSize: 13 }}>Assignment analytics and submissions are ready to review.</div>
      <button type="button" className="tw-analytics-text-link" onClick={onAnalytics}>Open Analytics</button>
    </div>
  </div>;
}

function ClassReportCard({ session, c, onOpenLive, onOpenAssigned }) {
  const assigned = session.session_type === "ASSIGNED" || session.join_mode === "ASSIGNED";
  const tone = templateTone(session.template_type, c, false);
  return <div className="tw-session-card tw-class-home-session-card" style={{ ...templateCardChrome(session.template_type, c, false, { padding: 14, borderRadius: 14, display: "grid", gap: 10, borderWidth: 4, transition: "transform 220ms ease" }) }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
      <div><div style={{ fontWeight: 900, color: c.text }}>{session.quiz_title}</div><div style={{ fontSize: 12, color: c.textMuted, marginTop: 4 }}>{reportDate(session.ended_at || session.available_until || session.started_at)}</div></div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><ReportPill c={c} tone={tone}>{templateLabel(session.template_type)}</ReportPill><ReportPill c={c}>{assigned ? "Assignment" : "Live session"}</ReportPill><ReportPill c={c}>{session.participant_count || 0} {assigned ? "submitted" : "participants"}</ReportPill></div>
    </div>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <div style={{ color: c.textMuted, fontSize: 13 }}>{session.question_count || 0} questions · Analytics ready to open</div>
      <button type="button" className="tw-analytics-text-link" onClick={assigned ? onOpenAssigned : onOpenLive}>Open Analytics</button>
    </div>
  </div>;
}

function ClassAnalyticsModal({ c, data, loading, mode, setMode, onClose }) {
  const stats = data?.stats || {};
  const trends = (data?.trends || []).filter((row) => row.mode === mode);
  return <div style={modalBackdrop} onMouseDown={onClose}>
    <div onMouseDown={(event) => event.stopPropagation()} className="tw-class-analytics-modal" style={{ ...card(c, { width: "min(96vw, 1040px)", background: solidModalBg(c), maxHeight: "92dvh", overflow: "hidden", padding: 0, borderWidth: 3 }) }}>
      <div className="tw-class-modal-title tw-class-modal-sticky-head" style={{ padding: "20px 22px 14px", marginBottom: 0, background: solidModalBg(c), borderBottom: `3px solid ${c.border}` }}><div><h3 style={{ margin: 0, color: c.text }}>Class Analytics</h3><p style={{ margin: "4px 0 0", color: c.textMuted }}>{data?.class?.name || "Selected class"}</p></div><button type="button" onClick={onClose} style={iconBtn(c)}><TwIcon name="close" size={20}/></button></div>
      <div className="tw-class-analytics-scroll" style={{ padding: 22 }}>
        {loading ? <div style={{ padding: 24, color: c.textMuted }}>Loading analytics…</div> : <>
          <div className="tw-class-analytics-stats"><ClassStat c={c} label="Average participation" value={`${stats.average_participation || 0}%`} tone="blue" /><ClassStat c={c} label="Average completion" value={`${stats.average_completion || 0}%`} tone="green" /><ClassStat c={c} label="Students" value={stats.student_count || 0} tone="yellow" /></div>
          <div className="tw-class-analytics-filter"><button className={mode === "LIVE" ? "is-active" : ""} onClick={() => setMode("LIVE")}>Live</button><button className={mode === "ASSIGNED" ? "is-active" : ""} onClick={() => setMode("ASSIGNED")}>Assigned</button></div>
          <div style={{ color: c.text, fontWeight: 900, marginBottom: 8 }}>Performance trend</div>
          <div className="tw-class-trend-scroll" onWheel={(event) => { if (Math.abs(event.deltaY) > Math.abs(event.deltaX) && event.currentTarget.scrollWidth > event.currentTarget.clientWidth) { event.currentTarget.scrollLeft += event.deltaY; event.preventDefault(); } }} style={{ borderColor: c.border, background: c.cardBg2 }}>
            {trends.length ? <div className="tw-class-trend-chart">{trends.map((row) => <div className="tw-class-trend-item" key={`${row.mode}-${row.id}`}><div className="tw-class-trend-bar-zone"><span className="tw-class-trend-value">{Math.round(Number(row.performance || 0))}%</span><div className="tw-class-trend-bar" style={{ height: `${Math.max(3, Math.min(100, Number(row.performance || 0)))}%`, background: c.accent }} /></div><b title={row.title}>{row.title}</b><small>{row.mode === "LIVE" ? `${Math.round(Number(row.participation_rate || 0))}% participation` : `${Math.round(Number(row.completion_rate || 0))}% completion`}</small></div>)}</div> : <div style={{ padding: 24, color: c.textMuted }}>No {mode === "LIVE" ? "live" : "assigned"} session data yet.</div>}
          </div>
        </>}
      </div>
    </div>
  </div>;
}

function ClassStat({ c, label, value, tone = "blue" }) {
  const tones = {
    blue: { fg: c.accent, bg: `${c.accent}18`, border: c.accent },
    green: { fg: c.greenFg, bg: c.greenBg, border: c.greenBorder },
    yellow: { fg: c.yellowFg, bg: c.yellowBg, border: c.yellowBorder },
    red: { fg: c.redFg, bg: c.redBg, border: c.redBorder },
  };
  const t = tones[tone] || tones.blue;
  return <div className={`tw-class-stat-card is-${tone}`} style={{ border: `3px solid ${t.border}`, background: t.bg, color: c.text }}><span style={{ color: t.fg }}>{label}</span><b>{value}</b></div>;
}

function StudentAnalyticsModal({ c, data, loading, onClose }) {
  const student = data?.student || {};
  const stats = data?.stats || {};
  const name = `${student.first_name || ""} ${student.last_name || ""}`.trim() || "Student";
  return <div style={modalBackdrop} onMouseDown={onClose}>
    <div onMouseDown={(event) => event.stopPropagation()} className="tw-class-student-analytics-modal" style={{ ...card(c, { width: "min(97vw, 1080px)", background: solidModalBg(c), maxHeight: "92dvh", overflow: "hidden", padding: 0, borderWidth: 3 }) }}>
      <div className="tw-class-modal-title tw-class-modal-sticky-head" style={{ padding: "20px 24px 14px", marginBottom: 0, background: solidModalBg(c), borderBottom: `3px solid ${c.border}` }}><div><h3 style={{ margin: 0, color: c.text }}>{name}</h3><p style={{ margin: "4px 0 0", color: c.textMuted }}>Student Analytics</p></div><button type="button" onClick={onClose} style={iconBtn(c)}><TwIcon name="close" size={20}/></button></div>
      <div className="tw-class-analytics-scroll tw-student-analytics-scroll" style={{ padding: 24 }}>
        {loading ? <div style={{ padding: 24, color: c.textMuted }}>Loading student analytics…</div> : <>
          <div className="tw-student-stat-grid"><ClassStat c={c} label="Overall participation" value={`${stats.overall_participation || 0}%`} tone="blue" /><ClassStat c={c} label="Average score" value={`${stats.average_score || 0}%`} tone="green" /><ClassStat c={c} label="Live participation" value={`${stats.live_participation || 0}%`} tone="yellow" /><ClassStat c={c} label="Assignment completion" value={`${stats.assignment_completion || 0}%`} tone="blue" /><ClassStat c={c} label="Average answer time" value={`${stats.average_answer_time || 0}s`} tone="green" /><ClassStat c={c} label="Questions timed out" value={stats.questions_timed_out || 0} tone="red" /></div>
          <div className="tw-student-progress-list"><StudentProgress c={c} label="Overall participation" value={stats.overall_participation} /><StudentProgress c={c} label="Live participation" value={stats.live_participation} /><StudentProgress c={c} label="Assignment completion" value={stats.assignment_completion} /></div>
        </>}
      </div>
    </div>
  </div>;
}

function StudentProgress({ c, label, value }) { const pct = Math.max(0, Math.min(100, Number(value || 0))); return <div><div className="tw-student-progress-label" style={{ color: c.text }}><b>{label}</b><span>{Math.round(pct)}%</span></div><div className="tw-student-progress-track" style={{ background: c.border }}><span style={{ width: `${pct}%`, background: c.accent }} /></div></div>; }

function RemoveStudentModal({ c, student, onClose, onConfirm }) {
  return <div style={modalBackdrop}>
    <div className="tw-class-remove-modal" style={{ ...card(c, { width: "min(94vw, 430px)", background: solidModalBg(c) }) }}>
      <h3 style={{ marginTop: 0, color: c.text }}>Remove student?</h3>
      <p style={{ color: c.textMuted, marginTop: 0 }}>This will remove <b style={{ color: c.text }}>{student.last_name}, {student.first_name}</b> from the selected class.</p>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
        <button type="button" onClick={onClose} style={btn(c)}>Cancel</button>
        <button type="button" onClick={onConfirm} style={{ ...btn(c), color: c.redFg, background: c.redBg, borderColor: c.redBorder }}>Remove</button>
      </div>
    </div>
  </div>;
}

function FolderCard({ folder, c, menuFor, setMenuFor, onOpen, onRename, onDelete, onDuplicate }) {
  const open = Number(menuFor) === Number(folder.id);
  return <div className="tw-folder-card" data-folder-id={folder.id} style={{ ...card(c, { padding: 0, overflow: "visible", boxShadow: "none", border: `4px solid ${c.border}`, borderRadius: 12 }), position: "relative" }}>
    <button onClick={onOpen} style={{ width: "100%", padding: "14px 16px", border: "none", background: "transparent", color: c.text, display: "flex", gap: 12, alignItems: "center", textAlign: "left" }}>
      <span style={{ color: c.accent, display: "inline-flex" }}><TwIcon name="folder" size={24} /></span>
      <span title={folder.name} style={{ fontWeight: 900, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 34 }}>{folder.name}</span>
    </button>
    <button onClick={(e) => { e.stopPropagation(); setMenuFor(open ? null : folder.id); }} style={{ position: "absolute", right: 8, top: 8, ...iconBtn(c), border: "none", background: "transparent" }}>⋮</button>
    {open && <div className="tw-folder-action-menu" style={{ position: "absolute", right: 8, top: 44, width: 180, zIndex: 10, ...card(c, { padding: 8, background: solidModalBg(c) }) }}>
      <button onClick={onRename} style={menuBtn(c)}>Rename</button>
      <button onClick={onDuplicate} style={menuBtn(c)}>Duplicate</button>
      <button onClick={onDelete} style={{ ...menuBtn(c), color: c.redFg }}>Delete</button>
    </div>}
  </div>;
}

function FolderModal({ c, title, value, setValue, onSubmit, onClose, confirmLabel = "Create", disableCancel = false, placeholder = "Maximum 95 characters" }) {
  return <div style={modalBackdrop} onMouseDown={disableCancel ? undefined : onClose}>
    <form className="tw-class-folder-modal" data-tutorial="class-folder-modal" onSubmit={onSubmit} onMouseDown={(event) => event.stopPropagation()} style={{ ...card(c, { width: "min(94vw, 620px)", minHeight: 290, background: solidModalBg(c), display: "flex", flexDirection: "column", padding: 30 }) }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}><TwIcon name="folder" size={24} /><h3 style={{ margin: 0, color: c.text }}>{title}</h3></div>
      <p style={{ color: c.textMuted, margin: "9px 0 22px" }}>Give the class a clear name so quizzes, students, and reports stay organised.</p>
      <label style={{ display: "block", color: c.textMuted, fontWeight: 800, fontSize: 13, marginBottom: 7 }}>Class name</label>
      <input value={value} maxLength={95} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} required style={input(c)} />
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 16, marginTop: "auto", paddingTop: 28 }}>
        <button type="button" className="tw-teacher-text-cancel" onClick={onClose} disabled={disableCancel} style={disableCancel ? { opacity: .38, cursor: "not-allowed" } : undefined}>Cancel</button>
        <TeacherPressButton type="submit" tone="blue">{confirmLabel}</TeacherPressButton>
      </div>
    </form>
  </div>;
}

function solidModalBg(c) { return String(c.text || "").toLowerCase() === "#eef4ff" ? "#07142b" : "#fffaf0"; }
function btn(c, primary = false) { return { padding: "9px 13px", borderRadius: 12, border: `1px solid ${primary ? c.accent : c.border}`, background: primary ? c.accent : c.cardBg2, color: primary ? "#fff" : c.text, fontWeight: 900, fontSize: 13, cursor: "pointer" }; }
function iconBtn(c) { return { width: 34, height: 34, borderRadius: 10, border: "none", background: "transparent", color: c.text, fontWeight: 900, cursor: "pointer" }; }
function menuBtn(c) { return { width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: 10, border: "none", background: "transparent", color: c.text, fontWeight: 800, cursor: "pointer" }; }
function input(c) { return { width: "100%", padding: "12px 14px", borderRadius: 12, border: `1px solid ${c.inputBorder}`, background: c.inputBg, color: c.text }; }
function row(c) { return { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: 12, borderRadius: 14, background: c.cardBg2, border: `3px solid ${c.border}`, marginBottom: 8, flexWrap: "wrap" }; }
function crumbBtn(c, active) { return { ...btn(c, active), borderRadius: 999, borderWidth: 3 }; }
const modalBackdrop = { position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", display: "grid", placeItems: "center", padding: 20, zIndex: 2000 };
