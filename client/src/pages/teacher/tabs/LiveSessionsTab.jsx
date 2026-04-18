/* FILE GUIDE:
 * client/src/pages/teacher/tabs/LiveSessionsTab.jsx
 * Purpose: Live-session staging area for quizzes that are ready to host.
 * Tip: This screen now prioritizes compact cards, host setup, and clearer action hierarchy.
 */

import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";
import { api } from "../../../lib/api";
import { useColors, useTheme } from "../../../context/ThemeContext";
import ActionDialog, { primaryBtn, secondaryBtn } from "../../../components/ActionDialog";

const card = (c, extra = {}) => ({
  background: c.cardBg,
  border: `1px solid ${c.border}`,
  borderRadius: 18,
  padding: 16,
  boxShadow: c.pageBg === "#eef2ff" ? "0 16px 34px rgba(43,108,255,0.08)" : "0 16px 34px rgba(0,0,0,0.14)",
  transition: "background 0.3s, border-color 0.3s, transform 0.3s",
  ...extra,
});

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
  const map = {
    neutral: { bg: c.cardBg2, fg: c.text, border: c.border },
    blue: { bg: `${c.accent}16`, fg: c.accent, border: c.accent },
    green: { bg: c.greenBg, fg: c.greenFg, border: c.greenBorder },
    yellow: { bg: c.yellowBg, fg: c.yellowFg, border: c.yellowBorder },
  }[tone];
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700, background: map.bg, color: map.fg, border: `1px solid ${map.border}` }}>{label}</span>;
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

export default function LiveSessionsTab({ setActiveTab }) {
  const [quizzes, setQuizzes] = useState([]);
  const [folders, setFolders] = useState([]);
  const [activeSessions, setActiveSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [previewQuiz, setPreviewQuiz] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
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
      console.error(e);
      showFlash("Failed to load live sessions.", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const liveQuizzes = useMemo(() => (quizzes || []).filter((quiz) => quiz.status !== "BANKED"), [quizzes]);
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
    rows.sort((a, b) => {
      if (sortBy === "title") return String(a.title || "").localeCompare(String(b.title || ""));
      if (sortBy === "template") return String(a.template_type || "").localeCompare(String(b.template_type || ""));
      return Number(b.id) - Number(a.id);
    });
    return rows;
  }, [liveQuizzes, query, statusFilter, sortBy, activeByQuizId]);

  async function hostLive(quiz, joinMode, maxParticipants) {
    setFlash(null);
    try {
      const cap = Number(maxParticipants || 0) > 0 ? Number(maxParticipants) : null;
      const { data } = await api.post("/sessions", { quizId: quiz.id, joinMode, maxParticipants: cap });
      await load();
      showFlash(data?.existing ? "That live session is already open." : `Session created in ${joinMode === "GROUP" ? "group" : "solo"} mode.`, "success");
    } catch (e) {
      showFlash(e?.response?.data?.message || "Failed to create session.", "error");
    }
  }

  async function deleteQuiz(quiz) {
    try {
      await api.delete(`/quizzes/${quiz.id}`);
      if (previewQuiz?.id === quiz.id) setPreviewQuiz(null);
      setConfirmState(null);
      await load();
      showFlash("Quiz deleted successfully.", "success");
    } catch (e) {
      showFlash(e?.response?.data?.message || "Failed to delete quiz.", "error");
    }
  }

  async function addToQuizBank(quiz) {
    try {
      await api.post(`/quizzes/${quiz.id}/copy-to-bank`);
      setConfirmState(null);
      await load();
      showFlash("Quiz copied to quiz bank.", "success");
    } catch (e) {
      showFlash(e?.response?.data?.message || "Failed to copy quiz to quiz bank.", "error");
    }
  }

  async function duplicateQuiz(quiz) {
    try {
      const { data } = await api.post(`/quizzes/${quiz.id}/duplicate`);
      setConfirmState(null);
      await load();
      showFlash("Duplicate quiz created. It opened as a single copy only.", "success");
      if (data?.id) setTimeout(() => window.location.assign(`/teacher/quizzes/${data.id}/builder`), 200);
    } catch (e) {
      showFlash(e?.response?.data?.message || "Failed to duplicate quiz.", "error");
    }
  }

  if (loading) return <div className="container"><div style={card(c)}>Loading live sessions…</div></div>;

  return (
    <>
      <div className="container" style={{ display: "grid", gap: 18 }}>
        <section>
          <h2 style={{ marginBottom: 4, color: c.text }}>Live Sessions</h2>
          <p style={{ color: c.textMuted, marginTop: 0, fontSize: 14 }}>Prepare, host, and monitor live activities without turning this page into a wall of equally loud buttons.</p>
        </section>

        <section style={card(c)}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1.4fr) repeat(2, minmax(150px, 0.7fr))", gap: 12 }}>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search live-session quizzes" style={inputStyle(c)} />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={inputStyle(c)}>
              <option value="ALL">All quizzes</option>
              <option value="READY">Not active yet</option>
              <option value="ACTIVE">Active sessions</option>
              <option value="PUBLISHED">Published only</option>
            </select>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={inputStyle(c)}>
              <option value="recent">Newest first</option>
              <option value="title">Title A–Z</option>
              <option value="template">Template</option>
            </select>
          </div>
        </section>

        {flash && <div style={{ ...card(c, { padding: '12px 16px', boxShadow: 'none', background: flash.kind === 'error' ? c.redBg : c.greenBg, borderColor: flash.kind === 'error' ? c.redBorder : c.greenBorder }), color: flash.kind === 'error' ? c.redFg : c.greenFg, fontWeight: 800, fontSize: 13 }}>{flash.text}</div>}

        {filteredQuizzes.length === 0 ? (
          <div style={card(c)}>No live-session quizzes match your current filters. <button onClick={() => setActiveTab?.('create')} style={{ border: 'none', background: 'none', color: c.accent, fontWeight: 800, cursor: 'pointer' }}>Create one</button> or reuse a quiz from Quiz Bank.</div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {filteredQuizzes.map((quiz) => (
              <QuizCard
                key={quiz.id}
                quiz={quiz}
                folderLabel={folderPathMap.get(Number(quiz.class_id)) || 'No folder assigned'}
                activeSession={activeByQuizId.get(Number(quiz.id)) || null}
                onHost={hostLive}
                onDelete={(q) => setConfirmState({ type: 'delete', quiz: q })}
                onCopyToBank={(q) => setConfirmState({ type: 'bank', quiz: q })}
                onDuplicate={(q) => setConfirmState({ type: 'duplicate', quiz: q })}
                onPreview={setPreviewQuiz}
                c={c}
              />
            ))}
          </div>
        )}

        {previewQuiz && <PreviewModal quiz={previewQuiz} onClose={() => setPreviewQuiz(null)} />}
      </div>

      {confirmState && (
        <ActionDialog
          tone={confirmState.type === 'delete' ? 'red' : confirmState.type === 'bank' ? 'yellow' : 'blue'}
          icon={confirmState.type === 'delete' ? '🗑' : confirmState.type === 'bank' ? '📦' : '⧉'}
          title={confirmState.type === 'delete' ? 'Delete quiz?' : confirmState.type === 'bank' ? 'Copy to Quiz Bank?' : 'Create one duplicate copy?'}
          message={
            confirmState.type === 'delete'
              ? <><b style={{ color: c.text }}>{confirmState.quiz.title}</b> will be removed from your live-session list.</>
              : confirmState.type === 'bank'
                ? <><b style={{ color: c.text }}>{confirmState.quiz.title}</b> stays in Live Sessions while one reusable bank copy is created.</>
                : <><b style={{ color: c.text }}>{confirmState.quiz.title}</b> will create one editable copy only, so the list stays tidy.</>
          }
          onClose={() => setConfirmState(null)}
          actions={<>
            <button onClick={() => setConfirmState(null)} style={secondaryBtn(c, dark)}>Cancel</button>
            <button onClick={() => confirmState.type === 'delete' ? deleteQuiz(confirmState.quiz) : confirmState.type === 'bank' ? addToQuizBank(confirmState.quiz) : duplicateQuiz(confirmState.quiz)} style={primaryBtn(confirmState.type === 'delete' ? { bg: c.redBg, fg: c.redFg, border: c.redBorder } : confirmState.type === 'bank' ? { bg: c.yellowBg, fg: c.yellowFg, border: c.yellowBorder } : { bg: `${c.accent}16`, fg: c.accent, border: c.accent })}>
              {confirmState.type === 'delete' ? 'Delete' : confirmState.type === 'bank' ? 'Create bank copy' : 'Create duplicate'}
            </button>
          </>}
        />
      )}
    </>
  );
}

function QuizCard({ quiz, folderLabel, activeSession, onHost, onDelete, onCopyToBank, onDuplicate, onPreview, c }) {
  const [expanded, setExpanded] = useState(false);
  const [joinMode, setJoinMode] = useState(activeSession?.join_mode || 'SOLO');
  const [maxParticipants, setMaxParticipants] = useState(activeSession?.max_participants || '');
  const [moreOpen, setMoreOpen] = useState(false);
  const navigate = useNavigate();
  const isPublished = quiz.status === 'PUBLISHED';
  const inSession = !!activeSession;

  useEffect(() => {
    if (activeSession?.join_mode) setJoinMode(activeSession.join_mode);
    if (activeSession?.max_participants) setMaxParticipants(activeSession.max_participants);
  }, [activeSession?.join_mode, activeSession?.max_participants]);

  return (
    <div style={card(c)}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 16, color: c.text }}>{quiz.title}</div>
          <div style={{ color: c.textMuted, fontSize: 13, marginTop: 6 }}>{quiz.template_type} · {quiz.category}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            <Badge c={c} label={inSession ? 'Active session' : isPublished ? 'Ready to host' : 'Draft'} tone={inSession || isPublished ? 'green' : 'yellow'} />
            <Badge c={c} label={folderLabel} tone='blue' />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={btn(c)} onClick={() => setExpanded((v) => !v)}>{expanded ? 'Close' : 'View'}</button>
          <button style={btn(c, true)} onClick={() => setExpanded(true)}>{inSession ? 'Host Panel Ready' : 'Host Live'}</button>
        </div>
      </div>

      <div className={`collapsible-content ${expanded ? 'open' : ''}`} style={{ marginTop: expanded ? 16 : 0 }}>
        <div className='collapsible-inner'>
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={card(c, { padding: 14, boxShadow: 'none', background: c.cardBg2 })}>
              <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 800, color: c.textSub, marginBottom: 8 }}>Quiz overview</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                <Badge c={c} label={quiz.template_type} />
                <Badge c={c} label={quiz.category} />
                <Badge c={c} label={folderLabel} tone='blue' />
              </div>
              <div style={{ color: c.textMuted, fontSize: 13, lineHeight: 1.6 }}>
                {inSession ? 'This quiz is currently active. Keep the join code and host link handy until the teacher ends the session.' : 'Use the setup below to choose solo or group mode, set the participant cap, and then launch the live session.'}
              </div>
            </div>

            {!inSession && (
              <div style={card(c, { padding: 14, boxShadow: 'none', background: c.pageBg })}>
                <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 800, color: c.textSub, marginBottom: 10 }}>Host setup</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
                  <div>
                    <div style={{ color: c.textMuted, fontSize: 12, marginBottom: 6 }}>Mode</div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button type='button' onClick={() => setJoinMode('SOLO')} style={{ ...btn(c), flex: 1, background: joinMode === 'SOLO' ? `${c.accent}16` : c.cardBg2, borderColor: joinMode === 'SOLO' ? c.accent : c.border, color: joinMode === 'SOLO' ? c.accent : c.text }}>Solo</button>
                      <button type='button' onClick={() => setJoinMode('GROUP')} style={{ ...btn(c), flex: 1, background: joinMode === 'GROUP' ? `${c.accent}16` : c.cardBg2, borderColor: joinMode === 'GROUP' ? c.accent : c.border, color: joinMode === 'GROUP' ? c.accent : c.text }}>Group</button>
                    </div>
                  </div>
                  <div>
                    <div style={{ color: c.textMuted, fontSize: 12, marginBottom: 6 }}>Maximum students</div>
                    <input type='number' min={1} max={500} value={maxParticipants} onChange={(e) => setMaxParticipants(e.target.value.replace(/[^\d]/g, '').slice(0, 3))} placeholder='No cap' style={inputStyle(c)} />
                  </div>
                  <div>
                    <div style={{ color: c.textMuted, fontSize: 12, marginBottom: 6 }}>Selected folder</div>
                    <div style={{ ...inputStyle(c), display: 'flex', alignItems: 'center', background: c.cardBg2 }}>{folderLabel}</div>
                  </div>
                </div>
              </div>
            )}

            <div style={card(c, { padding: 14, boxShadow: 'none', background: c.cardBg2 })}>
              <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 800, color: c.textSub, marginBottom: 10 }}>Quick actions</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button onClick={() => onHost(quiz, joinMode, maxParticipants)} disabled={!isPublished || inSession} style={{ ...btn(c, true), opacity: !isPublished || inSession ? 0.6 : 1, cursor: !isPublished || inSession ? 'not-allowed' : 'pointer' }}>{inSession ? 'Already active' : 'Host Live'}</button>
                <button onClick={() => onPreview(quiz)} style={btn(c)}>Preview</button>
                <button onClick={() => navigate(`/teacher/quizzes/${quiz.id}/builder`)} style={btn(c)}>Edit</button>
              </div>
            </div>

            <div style={card(c, { padding: 14, boxShadow: 'none', background: c.pageBg })}>
              <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 800, color: c.textSub, marginBottom: 10 }}>More</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ color: c.textMuted, fontSize: 13 }}>Less frequent actions stay quieter here so the host flow feels easier to scan.</div>
                <div style={{ position: 'relative' }}>
                  <button onClick={() => setMoreOpen((v) => !v)} style={btn(c)}>More actions ▾</button>
                  {moreOpen && (
                    <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', width: 220, zIndex: 20, ...card(c, { padding: 8, boxShadow: c.pageBg === '#eef2ff' ? '0 16px 34px rgba(43,108,255,0.12)' : '0 16px 34px rgba(0,0,0,0.22)' }) }}>
                      <button onClick={() => { setMoreOpen(false); onCopyToBank(quiz); }} style={{ ...menuBtn(c), color: c.yellowFg }}>Add to Quiz Bank</button>
                      <button onClick={() => { setMoreOpen(false); onDuplicate(quiz); }} style={menuBtn(c)}>Duplicate (1 copy)</button>
                      <button onClick={() => { setMoreOpen(false); onDelete(quiz); }} style={{ ...menuBtn(c), color: c.redFg }}>Delete</button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {activeSession && (
              <div style={card(c, { padding: 0, overflow: 'hidden', borderColor: c.greenBorder })}>
                <div style={{ padding: '16px 18px', background: c.greenBg, borderBottom: `1px solid ${c.greenBorder}`, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ color: c.greenFg, fontWeight: 900, fontSize: 18 }}>Session Ready</div>
                    <div style={{ color: c.textMuted, fontSize: 13, marginTop: 4 }}>{quiz.title}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Badge c={c} label={activeSession.join_mode === 'GROUP' ? 'Group mode' : 'Solo mode'} tone='blue' />
                    {activeSession.max_participants ? <Badge c={c} label={`Cap ${activeSession.max_participants}`} tone='blue' /> : null}
                  </div>
                </div>
                <div style={{ padding: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
                  <div style={{ display: 'grid', gap: 8 }}>
                    <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 800, color: c.textSub }}>Join code</div>
                    <div style={{ fontWeight: 900, fontSize: 28, letterSpacing: '0.22em', color: c.accent }}>{activeSession.join_code}</div>
                    <Link to={`/teacher/sessions/${activeSession.id}/live`} style={{ color: c.accent, fontWeight: 800, textDecoration: 'underline' }}>Open Host Panel →</Link>
                  </div>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ background: 'white', padding: 10, borderRadius: 14 }}>
                      <QRCodeCanvas value={`${window.location.origin}/play?code=${activeSession.join_code}`} size={96} />
                    </div>
                    <div style={{ maxWidth: 250, color: c.textMuted, fontSize: 13, lineHeight: 1.6 }}>
                      Keep this code and QR visible for students. This active card will stay here until the teacher ends the live session.
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function menuBtn(c) {
  return { width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 10, border: 'none', background: 'transparent', color: c.text, fontWeight: 700, cursor: 'pointer' };
}

function inputStyle(c) {
  return { width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 12, border: `1px solid ${c.inputBorder || c.border}`, background: c.inputBg || c.cardBg2, color: c.text };
}

function PreviewModal({ quiz, onClose }) {
  const [questions, setQuestions] = useState([]);
  const [qIndex, setQIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const c = useColors();
  const { dark } = useTheme();

  useEffect(() => {
    api.get(`/quizzes/${quiz.id}`).then(({ data }) => setQuestions(data.questions || [])).catch(console.error).finally(() => setLoading(false));
  }, [quiz.id]);

  const currentQ = questions[qIndex] || null;
  const totalQ = questions.length;
  const cfg = currentQ ? safeJson(currentQ.config_json) || {} : {};

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: dark ? 'rgba(0,0,0,0.7)' : 'rgba(30,45,85,0.28)', backdropFilter: 'blur(6px)', zIndex: 3000 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 3001, width: 'min(95vw, 760px)', maxHeight: '90vh', background: c.cardBg, border: `1px solid ${c.border}`, borderRadius: 20, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', background: c.cardBg2, borderBottom: `1px solid ${c.border}` }}>
          <span style={{ fontWeight: 800, fontSize: 15, color: c.text }}>👁 Preview — {quiz.title}</span>
          <button onClick={onClose} style={btn(c)}>✕ Close</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {loading && <div style={{ textAlign: 'center', padding: 40, color: c.textMuted }}>Loading questions…</div>}
          {!loading && totalQ === 0 && <div style={{ textAlign: 'center', padding: 40, color: c.textMuted }}>No questions yet.</div>}
          {!loading && currentQ && (
            <div>
              <div style={{ background: c.cardBg2, borderRadius: 12, padding: '10px 16px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ color: c.text, fontWeight: 700 }}>{quiz.title}</span>
                <span style={{ color: c.textMuted, fontSize: 13 }}>Q {qIndex + 1} of {totalQ}</span>
              </div>
              <div style={{ background: c.pageBg, border: `1px solid ${c.border}`, borderRadius: 14, padding: '18px 20px', fontSize: 16, fontWeight: 800, lineHeight: 1.6, color: c.text, marginBottom: 14, textAlign: 'center' }}>{currentQ.prompt}</div>
              <PreviewBody templateType={quiz.template_type} cfg={cfg} c={c} />
            </div>
          )}
        </div>
        {!loading && totalQ > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 24px', borderTop: `1px solid ${c.border}` }}>
            <button style={{ ...btn(c), visibility: qIndex === 0 ? 'hidden' : 'visible' }} onClick={() => setQIndex((i) => i - 1)}>‹ Previous</button>
            <span style={{ fontSize: 14, color: c.textMuted }}>{qIndex + 1} / {totalQ}</span>
            <button style={{ ...btn(c), visibility: qIndex === totalQ - 1 ? 'hidden' : 'visible' }} onClick={() => setQIndex((i) => i + 1)}>Next ›</button>
          </div>
        )}
      </div>
    </>
  );
}

function PreviewBody({ templateType, cfg, c }) {
  const opts = Array.isArray(cfg.options) ? cfg.options : [];
  const labels = 'ABCDEFGHIJ'.split('');
  if (templateType === 'MCQ' || templateType === 'TRUE_FALSE') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {opts.map((o, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 14, background: c.cardBg2, border: `1px solid ${c.border}`, color: c.text }}>
            <span style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, background: c.cardBg, color: c.accent, fontWeight: 900, fontSize: 14, flexShrink: 0, border: `1px solid ${c.border}` }}>{labels[i]}</span>
            <span style={{ fontWeight: 600 }}>{o}</span>
          </div>
        ))}
      </div>
    );
  }
  if (templateType === 'MATCHING') {
    const colA = Array.isArray(cfg.colA) ? cfg.colA : [];
    const colB = Array.isArray(cfg.colB) ? cfg.colB : [];
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{ display: 'grid', gap: 10 }}>
          {colA.map((item, i) => (
            <div key={`a-${i}`} style={{ padding: '12px 14px', background: c.cardBg2, border: `1px solid ${c.border}`, borderRadius: 12, color: c.text }}>
              {item?.image ? <img src={item.image} alt={item.text || `A${i + 1}`} style={{ maxWidth: '100%', maxHeight: 80, borderRadius: 10, display: 'block', marginBottom: item?.text ? 8 : 0 }} /> : null}
              <div style={{ fontWeight: 700 }}>{item?.text || (item?.image ? 'Image prompt' : `Item ${i + 1}`)}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          {colB.map((item, i) => (
            <div key={`b-${i}`} style={{ padding: '12px 14px', background: c.cardBg2, border: `1px solid ${c.border}`, borderRadius: 12, color: c.text, fontWeight: 700 }}>{item?.text || `Match ${i + 1}`}</div>
          ))}
        </div>
      </div>
    );
  }
  return <div style={{ padding: '12px 14px', background: c.cardBg2, border: `1px solid ${c.border}`, borderRadius: 12, fontSize: 13, color: c.textMuted }}>Students type their answer here</div>;
}

function safeJson(v) {
  if (!v) return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return null; }
}
