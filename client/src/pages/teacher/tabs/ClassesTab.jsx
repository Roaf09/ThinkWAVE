/* FILE GUIDE:
 * client/src/pages/teacher/tabs/ClassesTab.jsx
 * Purpose: Folder-based browser for finished session reports.
 * Tip: This page now behaves more like a clean file explorer: navigate folders first, inspect reports second.
 */

import React, { useEffect, useMemo, useState } from "react";
import { api } from "../../../lib/api";
import { useColors, useTheme } from "../../../context/ThemeContext";
import ActionDialog, { primaryBtn, secondaryBtn } from "../../../components/ActionDialog";

const card = (c, extra = {}) => ({
  background: c.cardBg,
  border: `1px solid ${c.border}`,
  borderRadius: 18,
  padding: 16,
  boxShadow: c.pageBg === "#eef2ff" ? "0 16px 34px rgba(43,108,255,0.08)" : "0 16px 34px rgba(0,0,0,0.14)",
  transition: "background 0.3s, border-color 0.3s, box-shadow 0.3s",
  ...extra,
});

function buildTree(rows) {
  const byId = new Map();
  const roots = [];
  rows.forEach((row) => byId.set(Number(row.id), { ...row, children: [] }));
  rows.forEach((row) => {
    const current = byId.get(Number(row.id));
    if (row.parent_id && byId.has(Number(row.parent_id))) byId.get(Number(row.parent_id)).children.push(current);
    else roots.push(current);
  });
  const sortNode = (node) => {
    node.children.sort((a, b) => a.name.localeCompare(b.name));
    node.children.forEach(sortNode);
  };
  roots.sort((a, b) => a.name.localeCompare(b.name));
  roots.forEach(sortNode);
  return roots;
}

function buildPathMap(rows) {
  const byId = new Map(rows.map((row) => [Number(row.id), row]));
  const memo = new Map();
  function getPath(id) {
    if (!id) return "";
    if (memo.has(id)) return memo.get(id);
    const current = byId.get(Number(id));
    if (!current) return "";
    const parent = current.parent_id ? getPath(Number(current.parent_id)) : "";
    const value = parent ? `${parent} / ${current.name}` : current.name;
    memo.set(Number(id), value);
    return value;
  }
  rows.forEach((row) => getPath(Number(row.id)));
  return memo;
}

function findNode(tree, id) {
  for (const node of tree) {
    if (Number(node.id) === Number(id)) return node;
    const child = findNode(node.children || [], id);
    if (child) return child;
  }
  return null;
}

function buildBreadcrumbs(rows, currentId) {
  if (!currentId) return [];
  const byId = new Map(rows.map((row) => [Number(row.id), row]));
  const trail = [];
  let cursor = byId.get(Number(currentId));
  while (cursor) {
    trail.unshift(cursor);
    cursor = cursor.parent_id ? byId.get(Number(cursor.parent_id)) : null;
  }
  return trail;
}

function Badge({ c, children, tone = "neutral" }) {
  const toneMap = {
    neutral: { bg: c.cardBg2, fg: c.text, border: c.border },
    blue: { bg: `${c.accent}16`, fg: c.accent, border: c.accent },
    green: { bg: c.greenBg, fg: c.greenFg, border: c.greenBorder },
  }[tone];
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700, background: toneMap.bg, color: toneMap.fg, border: `1px solid ${toneMap.border}` }}>{children}</span>;
}

const btn = (c, primary = false) => ({
  padding: "9px 13px",
  borderRadius: 12,
  border: `1px solid ${primary ? c.accent : c.border}`,
  background: primary ? c.accent : c.cardBg2,
  color: primary ? "#fff" : c.text,
  fontWeight: 800,
  fontSize: 13,
  cursor: "pointer",
});

export default function ClassesTab({ setActiveTab }) {
  const c = useColors();
  const { dark } = useTheme();
  const [folders, setFolders] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [selectedAnalytics, setSelectedAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [newFolder, setNewFolder] = useState({ name: "", parentId: "" });
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const [folderRes, sessionRes] = await Promise.all([api.get("/classes"), api.get("/sessions/history")]);
      setFolders(folderRes.data || []);
      setSessions(sessionRes.data || []);
    } catch (err) {
      console.error(err);
      setMsg("Failed to load folders.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const folderTree = useMemo(() => buildTree(folders || []), [folders]);
  const pathMap = useMemo(() => buildPathMap(folders || []), [folders]);
  const currentFolder = useMemo(() => selectedFolderId ? findNode(folderTree, selectedFolderId) : null, [folderTree, selectedFolderId]);
  const childFolders = useMemo(() => selectedFolderId ? (currentFolder?.children || []) : folderTree, [selectedFolderId, currentFolder, folderTree]);
  const breadcrumbs = useMemo(() => buildBreadcrumbs(folders || [], selectedFolderId), [folders, selectedFolderId]);
  const reportRows = useMemo(() => {
    const targetId = selectedFolderId ? Number(selectedFolderId) : null;
    const rows = (sessions || []).filter((session) => targetId ? Number(session.class_id) === targetId : false);
    const q = search.trim().toLowerCase();
    const filtered = rows.filter((row) => !q || String(row.quiz_title || "").toLowerCase().includes(q));
    filtered.sort((a, b) => {
      if (sortBy === "date") return new Date(b.ended_at || 0).getTime() - new Date(a.ended_at || 0).getTime();
      return String(a.quiz_title || "").localeCompare(String(b.quiz_title || ""));
    });
    return filtered;
  }, [sessions, selectedFolderId, search, sortBy]);

  async function openAnalytics(sessionId) {
    setSelectedSessionId(sessionId);
    setAnalyticsLoading(true);
    try {
      const { data } = await api.get(`/sessions/${sessionId}/full-analytics`);
      setSelectedAnalytics(data);
    } catch (e) {
      console.error(e);
      setSelectedAnalytics(null);
      setMsg("Failed to load analytics.");
    } finally {
      setAnalyticsLoading(false);
    }
  }

  async function addFolder(e) {
    e.preventDefault();
    setMsg("");
    try {
      await api.post("/classes", { name: newFolder.name, parentId: newFolder.parentId ? Number(newFolder.parentId) : null });
      setNewFolder({ name: "", parentId: selectedFolderId ? String(selectedFolderId) : "" });
      await load();
    } catch (err) {
      setMsg(err?.response?.data?.message || "Failed to create folder.");
    }
  }

  async function deleteFolder(id, label) {
    try {
      await api.delete(`/classes/${id}`);
      if (Number(selectedFolderId) === Number(id)) setSelectedFolderId(null);
      setDialog(null);
      setMsg(`Deleted ${label}.`);
      await load();
    } catch (err) {
      setMsg(err?.response?.data?.message || "Failed to delete folder.");
    }
  }

  async function deleteSession(session) {
    try {
      await api.delete(`/sessions/${session.id}`);
      setDialog(null);
      setSessions((prev) => (prev || []).filter((row) => Number(row.id) !== Number(session.id)));
      if (Number(selectedSessionId) === Number(session.id)) {
        setSelectedSessionId(null);
        setSelectedAnalytics(null);
      }
    } catch {
      setMsg("The analytics card could not be removed right now.");
    }
  }

  const folderOptions = useMemo(() => (folders || []).map((folder) => ({ ...folder, pathLabel: pathMap.get(Number(folder.id)) || folder.name })).sort((a, b) => a.pathLabel.localeCompare(b.pathLabel)), [folders, pathMap]);

  return (
    <>
      <div className="container" style={{ display: "grid", gap: 18 }}>
        <section>
          <h2 style={{ marginBottom: 4, color: c.text }}>Classes</h2>
          <p style={{ color: c.textMuted, marginTop: 0, fontSize: 14 }}>Browse your folders like a calm file explorer: move through subject folders first, then inspect finished session reports inside them.</p>
        </section>

        <section style={{ ...card(c), display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1.3fr) minmax(180px, 0.7fr) auto", gap: 12, alignItems: "end" }}>
            <div>
              <label style={labelStyle(c)}>Search reports in the current folder</label>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={selectedFolderId ? 'Search report title' : 'Open a folder first to search reports'} disabled={!selectedFolderId} style={inputStyle(c, !selectedFolderId)} />
            </div>
            <div>
              <label style={labelStyle(c)}>Sort reports</label>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={inputStyle(c)}>
                <option value="name">Title A–Z</option>
                <option value="date">Newest first</option>
              </select>
            </div>
            <button type="button" onClick={() => setActiveTab?.('create')} style={btn(c)}>Go to Create</button>
          </div>
        </section>

        <section style={card(c, { maxWidth: 760 })}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: 17, color: c.text }}>Create folder</div>
              <div style={{ color: c.textMuted, fontSize: 13, marginTop: 6 }}>Make a top-level subject folder first, then add section folders under it.</div>
            </div>
          </div>
          <form onSubmit={addFolder} style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1.2fr) minmax(220px, 1fr) auto', gap: 12, alignItems: 'end' }}>
            <div>
              <label style={labelStyle(c)}>Folder name</label>
              <input value={newFolder.name} onChange={(e) => setNewFolder((prev) => ({ ...prev, name: e.target.value }))} placeholder='e.g. Biology or STEM 11 - Einstein' required style={inputStyle(c)} />
            </div>
            <div>
              <label style={labelStyle(c)}>Inside folder (optional)</label>
              <select value={newFolder.parentId || (selectedFolderId ? String(selectedFolderId) : '')} onChange={(e) => setNewFolder((prev) => ({ ...prev, parentId: e.target.value }))} style={inputStyle(c)}>
                <option value=''>Create as top-level folder</option>
                {folderOptions.map((folder) => <option key={folder.id} value={folder.id}>{folder.pathLabel}</option>)}
              </select>
            </div>
            <button type='submit' style={btn(c, true)}>+ Create folder</button>
          </form>
          {msg && <div style={{ marginTop: 12, color: c.textMuted, fontSize: 13 }}>{msg}</div>}
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: selectedSessionId || analyticsLoading ? 'minmax(0, 1.2fr) minmax(320px, 0.95fr)' : '1fr', gap: 16, alignItems: 'start' }}>
          <div style={{ display: 'grid', gap: 16 }}>
            <div style={card(c)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 17, color: c.text }}>Folder browser</div>
                  <div style={{ color: c.textMuted, fontSize: 13, marginTop: 6 }}>Navigate folders first, then open analytics from the report list beside it.</div>
                </div>
                {selectedFolderId ? <button onClick={() => { setSelectedFolderId(currentFolder?.parent_id || null); setSelectedSessionId(null); setSelectedAnalytics(null); }} style={btn(c)}>Back</button> : null}
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                <button onClick={() => { setSelectedFolderId(null); setSelectedSessionId(null); setSelectedAnalytics(null); }} style={btn(c, !selectedFolderId)}>Root</button>
                {breadcrumbs.map((crumb) => (
                  <button key={crumb.id} onClick={() => { setSelectedFolderId(crumb.id); setSelectedSessionId(null); setSelectedAnalytics(null); }} style={btn(c, Number(selectedFolderId) === Number(crumb.id))}>{crumb.name}</button>
                ))}
              </div>

              {loading ? (
                <div style={{ color: c.textMuted }}>Loading folders…</div>
              ) : childFolders.length === 0 ? (
                <div style={{ padding: '14px 12px', borderRadius: 14, border: `1px dashed ${c.border}`, color: c.textMuted }}>{selectedFolderId ? 'No subfolders here yet.' : 'No folders yet. Create your first one above.'}</div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {childFolders.map((folder) => {
                    const sessionCount = sessions.filter((session) => Number(session.class_id) === Number(folder.id)).length;
                    return (
                      <div key={folder.id} style={{ padding: 14, borderRadius: 14, background: c.cardBg2, border: `1px solid ${c.border}`, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontWeight: 800, color: c.text }}>{folder.name}</div>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                            <Badge c={c}>{folder.children?.length || 0} subfolders</Badge>
                            <Badge c={c}>{sessionCount} reports</Badge>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button onClick={() => { setSelectedFolderId(folder.id); setSelectedSessionId(null); setSelectedAnalytics(null); }} style={btn(c, true)}>Open</button>
                          <button onClick={() => setDialog({ type: 'deleteFolder', folder })} style={{ ...btn(c), color: c.redFg, borderColor: c.redBorder, background: c.redBg }}>Delete</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={card(c)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 17, color: c.text }}>Session reports</div>
                  <div style={{ color: c.textMuted, fontSize: 13, marginTop: 6 }}>{selectedFolderId ? `Reports inside ${currentFolder?.name || 'this folder'}` : 'Open a folder to view its finished live-session reports.'}</div>
                </div>
                {selectedFolderId && <Badge c={c} tone='blue'>{reportRows.length} reports</Badge>}
              </div>

              {!selectedFolderId ? (
                <div style={{ padding: '14px 12px', borderRadius: 14, border: `1px dashed ${c.border}`, color: c.textMuted }}>Pick a folder from the browser above to see its finished session reports.</div>
              ) : reportRows.length === 0 ? (
                <div style={{ padding: '14px 12px', borderRadius: 14, border: `1px dashed ${c.border}`, color: c.textMuted }}>No finished live sessions are stored in this folder yet.</div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {reportRows.map((session) => (
                    <SessionReportRow key={session.id} session={session} selected={Number(selectedSessionId) === Number(session.id)} onOpen={() => openAnalytics(session.id)} onDelete={() => setDialog({ type: 'deleteSession', session })} c={c} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {(selectedSessionId || analyticsLoading) && (
            <div style={card(c, { position: 'sticky', top: 20 })}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 17, color: c.text }}>Analytics Detail</div>
                  <div style={{ color: c.textMuted, fontSize: 13, marginTop: 6 }}>This matches the same analytics style teachers see from the host panel.</div>
                </div>
                <button onClick={() => { setSelectedSessionId(null); setSelectedAnalytics(null); }} style={btn(c)}>Back</button>
              </div>
              {analyticsLoading ? <div style={{ color: c.textMuted }}>Loading analytics…</div> : selectedAnalytics ? <AnalyticsDetail analytics={selectedAnalytics} c={c} /> : <div style={{ color: c.textMuted }}>Select a report to open its analytics here.</div>}
            </div>
          )}
        </section>
      </div>

      {dialog?.type === 'deleteFolder' && (
        <ActionDialog
          tone='red'
          icon='🗑'
          title='Delete folder?'
          message={<><b style={{ color: c.text }}>{dialog.folder.name}</b> and any nested subfolders will be removed from the folder browser.</>}
          onClose={() => setDialog(null)}
          actions={<>
            <button onClick={() => setDialog(null)} style={secondaryBtn(c, dark)}>Cancel</button>
            <button onClick={() => deleteFolder(dialog.folder.id, dialog.folder.name)} style={primaryBtn({ bg: c.redBg, fg: c.redFg, border: c.redBorder })}>Delete folder</button>
          </>}
        />
      )}
      {dialog?.type === 'deleteSession' && (
        <ActionDialog
          tone='red'
          icon='🗑'
          title='Delete analytics card?'
          message={<><b style={{ color: c.text }}>{dialog.session.quiz_title}</b> will be removed from this folder and its analytics record will no longer be shown here.</>}
          onClose={() => setDialog(null)}
          actions={<>
            <button onClick={() => setDialog(null)} style={secondaryBtn(c, dark)}>Cancel</button>
            <button onClick={() => deleteSession(dialog.session)} style={primaryBtn({ bg: c.redBg, fg: c.redFg, border: c.redBorder })}>Delete report</button>
          </>}
        />
      )}
    </>
  );
}

function SessionReportRow({ session, selected, onOpen, onDelete, c }) {
  return (
    <div style={{ padding: 14, borderRadius: 14, background: selected ? `${c.accent}12` : c.cardBg2, border: `1px solid ${selected ? c.accent : c.border}`, display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 800, color: c.text }}>{session.quiz_title}</div>
          <div style={{ color: c.textMuted, fontSize: 12, marginTop: 5 }}>{new Date(session.ended_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Badge c={c}>{session.join_mode === 'GROUP' ? `${session.participant_count} groups` : `${session.participant_count} students`}</Badge>
          <Badge c={c}>{session.question_count} questions</Badge>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={onOpen} style={{ ...btn(c, true), padding: '8px 12px' }}>Open Analytics</button>
        <button onClick={() => downloadExport(session.id, 'pdf')} style={{ ...btn(c), padding: '8px 12px' }}>PDF</button>
        <button onClick={() => downloadExport(session.id, 'xlsx')} style={{ ...btn(c), padding: '8px 12px' }}>XLSX</button>
        <button onClick={onDelete} style={{ ...btn(c), padding: '8px 12px', color: c.redFg, borderColor: c.redBorder, background: c.redBg }}>Delete</button>
      </div>
    </div>
  );
}

async function downloadExport(sessionId, format) {
  const resp = await api.get(`/analytics/sessions/${sessionId}/export/${format}`, { responseType: 'blob' });
  const mime = format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const url = URL.createObjectURL(new Blob([resp.data], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `session-${sessionId}.${format}`;
  a.click();
  URL.revokeObjectURL(url);
}

function AnalyticsDetail({ analytics, c }) {
  const [qIndex, setQIndex] = useState(0);
  const rows = analytics?.students || [];
  const rosterLabel = analytics?.session?.join_mode === 'GROUP' ? 'Groups' : 'Students';
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
        <MiniStat c={c} label='Average' value={analytics.summary?.avg_score ?? 0} />
        <MiniStat c={c} label='Min' value={analytics.summary?.min_score ?? 0} />
        <MiniStat c={c} label='Max' value={analytics.summary?.max_score ?? 0} />
        <MiniStat c={c} label={rosterLabel} value={analytics.summary?.participant_count ?? 0} />
      </div>

      <div style={{ padding: 14, borderRadius: 14, background: c.cardBg2, border: `1px solid ${c.border}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 800, color: c.text }}>Per-question difficulty</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setQIndex((i) => Math.max(0, i - 1))} disabled={qIndex === 0} style={btn(c)}>Prev</button>
            <button onClick={() => setQIndex((i) => Math.min((analytics.questions?.length || 1) - 1, i + 1))} disabled={qIndex === (analytics.questions?.length || 1) - 1} style={btn(c)}>Next</button>
          </div>
        </div>
        {analytics.questions?.[qIndex] ? (
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ fontWeight: 700, color: c.text }}>{analytics.questions[qIndex].prompt}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Badge c={c} tone='blue'>{Number(analytics.questions[qIndex].question_order || 0) + 1}</Badge>
              <Badge c={c}>{analytics.questions[qIndex].pct_correct ?? 0}% correct</Badge>
              <Badge c={c}>{analytics.questions[qIndex].correct_answers}/{analytics.questions[qIndex].total_answers} correct answers</Badge>
            </div>
          </div>
        ) : <div style={{ color: c.textMuted }}>No question analytics yet.</div>}
      </div>

      <div style={{ padding: 14, borderRadius: 14, background: c.cardBg2, border: `1px solid ${c.border}` }}>
        <div style={{ fontWeight: 800, color: c.text, marginBottom: 10 }}>{rosterLabel}</div>
        <div style={{ display: 'grid', gap: 8, maxHeight: 180, overflowY: 'auto' }}>
          {rows.map((row) => (
            <div key={row.participant_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 10px', borderRadius: 12, background: c.cardBg, border: `1px solid ${c.border}` }}>
              <span style={{ color: c.text }}>{analytics.session?.join_mode === 'GROUP' ? row.group_name || `${row.last_name}, ${row.first_name}` : `${row.last_name}, ${row.first_name}`}</span>
              <span style={{ color: c.textMuted, fontWeight: 700 }}>{row.total_points} pts</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: 14, borderRadius: 14, background: c.cardBg2, border: `1px solid ${c.border}` }}>
        <div style={{ fontWeight: 800, color: c.text, marginBottom: 10 }}>Tab Monitoring</div>
        <div style={{ color: c.textMuted, fontSize: 13, lineHeight: 1.6 }}>Use the host-panel analytics view for the full tab-switching detail. This side panel stays focused on the most reusable highlights for folder browsing.</div>
      </div>
    </div>
  );
}

function MiniStat({ c, label, value }) {
  return (
    <div style={{ padding: 12, borderRadius: 14, background: c.cardBg, border: `1px solid ${c.border}` }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 800, color: c.textSub }}>{label}</div>
      <div style={{ marginTop: 7, fontWeight: 900, fontSize: 20, color: c.text }}>{value}</div>
    </div>
  );
}

function labelStyle(c) {
  return { display: 'block', marginBottom: 7, fontSize: 13, color: c.textMuted, fontWeight: 800 };
}

function inputStyle(c, disabled = false) {
  return { width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 12, border: `1px solid ${c.inputBorder || c.border}`, background: c.inputBg || c.cardBg2, color: c.text, opacity: disabled ? 0.7 : 1 };
}
