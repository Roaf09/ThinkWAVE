/* FILE GUIDE:
 * client/src/pages/teacher/tabs/ClassesTab.jsx
 * Purpose: Kahoot-style class/folder browser with class codes, rosters, and quiz shortcuts.
 */

import React, { useEffect, useMemo, useState } from "react";
import { api } from "../../../lib/api";
import { useColors } from "../../../context/ThemeContext";
import { templateCardChrome, templateLabel, templateTone } from "../../../lib/templatePalette";

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

export default function ClassesTab({ setActiveTab }) {
  const c = useColors();
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
  const [folderName, setFolderName] = useState("");

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
    if (!selectedFolderId) { setStudents([]); setAsyncResults([]); setClassCode(""); return; }
    // Revision 7: selected class folders refresh the roster and async results in real time.
    api.get(`/classes/${selectedFolderId}/students`).then(({ data }) => setStudents(data || [])).catch(() => setStudents([]));
    api.get(`/classes/${selectedFolderId}/async-results`).then(({ data }) => setAsyncResults(data || [])).catch(() => setAsyncResults([]));
    const t = setInterval(() => {
      api.get(`/classes/${selectedFolderId}/async-results`).then(({ data }) => setAsyncResults(data || [])).catch(() => {});
    }, 5000);
    return () => clearInterval(t);
  }, [selectedFolderId]);

  const tree = useMemo(() => buildTree(folders), [folders]);
  const current = useMemo(() => selectedFolderId ? findNode(tree, selectedFolderId) : null, [tree, selectedFolderId]);
  const children = selectedFolderId ? (current?.children || []) : tree;
  const breadcrumbs = useMemo(() => buildPath(folders, selectedFolderId), [folders, selectedFolderId]);
  const currentQuizzes = useMemo(() => (quizzes || []).filter((q) => Number(q.class_id) === Number(selectedFolderId) && q.status !== "BANKED"), [quizzes, selectedFolderId]);
  const currentReports = useMemo(() => (sessions || []).filter((s) => Number(s.class_id) === Number(selectedFolderId)), [sessions, selectedFolderId]);

  function openAddFolder() {
    setFolderName("");
    setFolderModal({ parentId: selectedFolderId || null });
  }

  async function submitFolder(e) {
    e.preventDefault();
    if (!folderName.trim()) return;
    try {
      // Revision 7: add folders through a compact modal instead of an always-visible form.
      await api.post("/classes", { name: folderName.trim().slice(0, 95), parentId: folderModal?.parentId || null });
      setFolderModal(null);
      await load();
    } catch (err) {
      setMsg(err?.response?.data?.message || "Could not create folder.");
    }
  }

  async function renameFolder(e) {
    e.preventDefault();
    if (!renameModal || !folderName.trim()) return;
    try {
      // Revision 7: quick action rename keeps existing parent folder.
      await api.put(`/classes/${renameModal.id}`, { name: folderName.trim().slice(0, 95), parentId: renameModal.parent_id || null });
      setRenameModal(null);
      await load();
    } catch (err) {
      setMsg(err?.response?.data?.message || "Could not rename folder.");
    }
  }

  async function deleteFolder(folder) {
    if (!window.confirm(`Delete ${folder.name}?`)) return;
    try {
      await api.delete(`/classes/${folder.id}`);
      if (Number(selectedFolderId) === Number(folder.id)) setSelectedFolderId(folder.parent_id || null);
      setMenuFor(null);
      await load();
    } catch (err) {
      setMsg(err?.response?.data?.message || "Could not delete folder.");
    }
  }

  async function duplicateFolder(folder) {
    try {
      // Revision 7: duplicate creates a folder copy beside the original.
      await api.post(`/classes/${folder.id}/duplicate`);
      setMenuFor(null);
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
    } catch (err) {
      setMsg(err?.response?.data?.message || "Could not generate class code.");
    }
  }

  async function removeStudent(enrollmentId) {
    if (!selectedFolderId) return;
    // Revision 9: student removal now requires confirmation first.
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

  return (
    <div className="container" style={{ display: "grid", gap: 18 }}>
      <section>
        <h2 style={{ marginBottom: 4, color: c.text }}>Classes</h2>
      </section>

      {msg && <div style={{ ...card(c, { background: c.redBg, borderColor: c.redBorder, color: c.redFg, boxShadow: "none" }) }}>{msg}</div>}

      <section style={card(c)}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <div style={{ color: c.text, fontWeight: 900, fontSize: 17 }}>My Folders</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={openAddFolder} style={btn(c, true)}>Add Folder</button>
            {selectedFolderId && <button onClick={getShareCode} style={btn(c, true)}>Share Code</button>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
          {/* Revision 10: folder actions stay on the My Folders header row while breadcrumbs remain below. */}
          <button onClick={() => setSelectedFolderId(null)} style={crumbBtn(c, !selectedFolderId)}>All</button>
          {breadcrumbs.map((b) => <button key={b.id} onClick={() => setSelectedFolderId(b.id)} style={crumbBtn(c, Number(selectedFolderId) === Number(b.id))}>{b.name}</button>)}
        </div>

        {classCode && selectedFolderId && (
          <div style={{ marginBottom: 16, padding: 14, borderRadius: 14, border: `1px dashed ${c.accent}`, background: `${c.accent}12`, color: c.accent, fontWeight: 900, letterSpacing: 2 }}>
            Class Code: {classCode}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 }}>
          <div style={{ color: c.text, fontWeight: 900 }}>{selectedFolderId ? current?.name || "Folder" : "Folders"}</div>
          {selectedFolderId && <button onClick={() => setSelectedFolderId(current?.parent_id || null)} style={btn(c)}>Back</button>}
        </div>

        {loading ? <div style={{ color: c.textMuted }}>Loading folders…</div> : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 12 }}>
            {children.map((folder) => <FolderCard key={folder.id} folder={folder} c={c} menuFor={menuFor} setMenuFor={setMenuFor} onOpen={() => setSelectedFolderId(folder.id)} onRename={() => { setFolderName(folder.name); setRenameModal(folder); setMenuFor(null); }} onDelete={() => deleteFolder(folder)} onDuplicate={() => duplicateFolder(folder)} />)}
          </div>
        )}

        {selectedFolderId && currentQuizzes.length === 0 && children.length === 0 && (
          <div style={{ textAlign: "center", padding: "52px 16px", color: c.textMuted }}>
            <div style={{ fontWeight: 900, fontSize: 18, color: c.text }}>No quizzes yet?</div>
            <p>Create the first one to get started.</p>
            <button onClick={() => setActiveTab?.("create")} style={btn(c, true)}>Create</button>
          </div>
        )}

        {selectedFolderId && currentQuizzes.length > 0 && (
          <div style={{ marginTop: 22 }}>
            <div style={{ fontWeight: 900, color: c.text, marginBottom: 10 }}>Quizzes</div>
            <div style={{ display: "grid", gap: 10 }}>
              {currentQuizzes.map((quiz) => <QuizFolderRow key={quiz.id} quiz={quiz} c={c} />)}
            </div>
          </div>
        )}
      </section>

      {selectedFolderId && <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        <div style={card(c)}>
          <h3 style={{ marginTop: 0 }}>Students</h3>
          {students.length === 0 ? <div style={{ color: c.textMuted }}>No students have joined this class yet.</div> : students.map((st) => <div key={st.id} style={row(c)}><span>{st.last_name}, {st.first_name} {st.middle_initial || ""}<br/><small style={{ color: c.textMuted }}>Student ID: {st.student_id}</small></span><button onClick={() => setRemoveConfirm(st)} style={{ ...btn(c), color: c.redFg, background: c.redBg, borderColor: c.redBorder }}>Remove</button></div>)}
        </div>
        <div style={card(c)}>
          <h3 style={{ marginTop: 0 }}>Assignments</h3>
          {asyncResults.length === 0 ? <div style={{ color: c.textMuted }}>No assigned quizzes for this class yet.</div> : asyncResults.map((r) => <AssignmentResultRow key={r.quiz_id} r={r} c={c} onPdf={() => downloadAsync(r.quiz_id, "pdf")} onXlsx={() => downloadAsync(r.quiz_id, "xlsx")} />)}
        </div>
      </section>}


      {selectedFolderId && currentReports.length > 0 && <section style={card(c)}>
        <h3 style={{ marginTop: 0 }}>Session reports</h3>
        <div style={{ display: "grid", gap: 10 }}>
          {currentReports.map((session) => <ClassReportCard key={`${session.session_type || "LIVE"}-${session.id}`} session={session} c={c} onOpenLive={() => window.location.assign(`/teacher/analytics/${session.id}`)} onOpenHistory={() => setActiveTab?.("history")} />)}
        </div>
      </section>}

      {folderModal && <FolderModal c={c} title="Create New Folder" value={folderName} setValue={setFolderName} onSubmit={submitFolder} onClose={() => setFolderModal(null)} />}
      {renameModal && <FolderModal c={c} title="Rename Folder" value={folderName} setValue={setFolderName} onSubmit={renameFolder} onClose={() => setRenameModal(null)} />}
      {removeConfirm && <RemoveStudentModal c={c} student={removeConfirm} onClose={() => setRemoveConfirm(null)} onConfirm={() => removeStudent(removeConfirm.id)} />}
    </div>
  );
}


function QuizFolderRow({ quiz, c }) {
  const tone = templateTone(quiz.template_type, c, false);
  return <div style={{ ...row(c), ...templateCardChrome(quiz.template_type, c, false), marginBottom: 8 }}><span><b>{quiz.title}</b><br/><small style={{ color: c.textMuted }}>{templateLabel(quiz.template_type)} · {quiz.status}</small></span><span style={{ color: tone.accent, fontWeight: 900 }}>{templateLabel(quiz.template_type)}</span></div>;
}

function AssignmentResultRow({ r, c, onPdf, onXlsx }) {
  const tone = templateTone(r.template_type, c, false);
  return <div style={{ ...row(c), ...templateCardChrome(r.template_type, c, false), marginBottom: 8 }}><span><b>{r.quiz_title}</b><br/><small style={{ color: c.textMuted }}>{templateLabel(r.template_type)} · {r.submitted_count} submitted · Avg {r.avg_score || 0}/{r.max_possible || 0}</small></span><span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><span style={{ color: tone.accent, fontWeight: 900, fontSize: 12 }}>{templateLabel(r.template_type)}</span><button onClick={onPdf} style={btn(c)}>PDF</button><button onClick={onXlsx} style={btn(c)}>XLSX</button></span></div>;
}

function ClassReportCard({ session, c, onOpenLive, onOpenHistory }) {
  const assigned = session.session_type === "ASSIGNED" || session.join_mode === "ASSIGNED";
  const tone = templateTone(session.template_type, c, false);
  return <div style={{ ...row(c), ...templateCardChrome(session.template_type, c, false), marginBottom: 0 }}><span><b>{session.quiz_title}</b><br/><small style={{ color: c.textMuted }}>{templateLabel(session.template_type)} · {assigned ? "Assigned session" : "Live session"} · {session.participant_count || 0} {assigned ? "submitted" : "participants"}</small></span><span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><span style={{ color: tone.accent, fontWeight: 900, fontSize: 12 }}>Avg {session.avg_score ?? 0}</span><button onClick={assigned ? onOpenHistory : onOpenLive} style={btn(c, true)}>{assigned ? "History" : "Analytics"}</button></span></div>;
}

function RemoveStudentModal({ c, student, onClose, onConfirm }) {
  return <div style={modalBackdrop}>
    <div style={{ ...card(c, { width: "min(94vw, 430px)", background: c.cardBg }) }}>
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
  return <div style={{ ...card(c, { padding: 0, overflow: "visible", boxShadow: "none" }), position: "relative" }}>
    <button onClick={onOpen} style={{ width: "100%", padding: "14px 16px", border: "none", background: "transparent", color: c.text, display: "flex", gap: 12, alignItems: "center", textAlign: "left" }}>
      <span style={{ color: c.accent, fontSize: 24 }}>📁</span>
      <span style={{ fontWeight: 900, flex: 1 }}>{folder.name}</span>
    </button>
    <button onClick={(e) => { e.stopPropagation(); setMenuFor(open ? null : folder.id); }} style={{ position: "absolute", right: 8, top: 8, ...iconBtn(c) }}>⋮</button>
    {open && <div style={{ position: "absolute", right: 8, top: 44, width: 180, zIndex: 10, ...card(c, { padding: 8 }) }}>
      <button onClick={onRename} style={menuBtn(c)}>Rename</button>
      <button onClick={onDuplicate} style={menuBtn(c)}>Duplicate</button>
      <button onClick={onDelete} style={{ ...menuBtn(c), color: c.redFg }}>Delete</button>
    </div>}
  </div>;
}

function FolderModal({ c, title, value, setValue, onSubmit, onClose }) {
  return <div style={modalBackdrop}>
    <form onSubmit={onSubmit} style={{ ...card(c, { width: "min(94vw, 430px)", background: c.cardBg }) }}>
      <h3 style={{ marginTop: 0, color: c.text }}>{title}</h3>
      <label style={{ display: "block", color: c.textMuted, fontWeight: 800, fontSize: 13, marginBottom: 7 }}>Folder name</label>
      <input value={value} maxLength={95} onChange={(e) => setValue(e.target.value)} placeholder="Maximum 95 characters" required style={input(c)} />
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
        <button type="button" onClick={onClose} style={btn(c)}>Cancel</button>
        <button style={btn(c, true)}>Confirm</button>
      </div>
    </form>
  </div>;
}

function btn(c, primary = false) { return { padding: "9px 13px", borderRadius: 12, border: `1px solid ${primary ? c.accent : c.border}`, background: primary ? c.accent : c.cardBg2, color: primary ? "#fff" : c.text, fontWeight: 900, fontSize: 13, cursor: "pointer" }; }
function iconBtn(c) { return { width: 34, height: 34, borderRadius: 10, border: `1px solid ${c.border}`, background: c.cardBg2, color: c.text, fontWeight: 900, cursor: "pointer" }; }
function menuBtn(c) { return { width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: 10, border: "none", background: "transparent", color: c.text, fontWeight: 800, cursor: "pointer" }; }
function input(c) { return { width: "100%", padding: "12px 14px", borderRadius: 12, border: `1px solid ${c.inputBorder}`, background: c.inputBg, color: c.text }; }
function row(c) { return { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: 12, borderRadius: 14, background: c.cardBg2, border: `1px solid ${c.border}`, marginBottom: 8, flexWrap: "wrap" }; }
function crumbBtn(c, active) { return { ...btn(c, active), borderRadius: 999 }; }
const modalBackdrop = { position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", display: "grid", placeItems: "center", padding: 20, zIndex: 2000 };
