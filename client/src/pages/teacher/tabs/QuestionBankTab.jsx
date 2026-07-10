/* FILE GUIDE:
 * client/src/pages/teacher/tabs/QuestionBankTab.jsx
 * Purpose: Combined Quiz Bank and Question Bank library screen.
 * Tip: This page now uses both a segmented top toggle and the sidebar label switch for clearer navigation.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../../lib/api";
import { useColors, useTheme } from "../../../context/ThemeContext";
import ActionDialog, { primaryBtn, secondaryBtn } from "../../../components/ActionDialog";
import { templateCardChrome, templateLabel, templateTone } from "../../../lib/templatePalette";

const card = (c, extra = {}) => ({
  background: c.cardBg,
  border: `1px solid ${c.border}`,
  borderRadius: 18,
  padding: 16,
  boxShadow: c.pageBg === "#eef2ff" ? "0 16px 34px rgba(43,108,255,0.08)" : "0 16px 34px rgba(0,0,0,0.14)",
  transition: "background 0.3s, border-color 0.3s, transform 0.25s",
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

export default function QuestionBankTab({ setBankLabel, setActiveTab }) {
  const [view, setView] = useState("quiz");
  const [quizzes, setQuizzes] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [previewQuiz, setPreviewQuiz] = useState(null);
  const [modal, setModal] = useState(null);
  const [msg, setMsg] = useState("");
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("recent");
  const [folderFilter, setFolderFilter] = useState("ALL");
  const c = useColors();
  const { dark } = useTheme();

  const folderPathMap = useMemo(() => buildFolderPathMap(folders || []), [folders]);
  const folderOptions = useMemo(() => (folders || []).map((folder) => ({ ...folder, pathLabel: folderPathMap.get(Number(folder.id)) || folder.name })).sort((a, b) => a.pathLabel.localeCompare(b.pathLabel)), [folders, folderPathMap]);
  const quizBankItems = useMemo(() => (quizzes || []).filter((quiz) => quiz.status === "BANKED"), [quizzes]);

  async function load() {
    try {
      const [quizRes, bankRes, folderRes] = await Promise.all([api.get("/quizzes"), api.get("/question-bank"), api.get("/classes")]);
      setQuizzes(quizRes.data || []);
      setQuestions(bankRes.data || []);
      setFolders(folderRes.data || []);
    } catch (e) {
      console.error(e);
      setMsg("Failed to load bank content.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => { setBankLabel?.(view === "quiz" ? "Quiz Bank" : "Question Bank"); }, [view, setBankLabel]);

  async function deleteQuiz(quiz) {
    try {
      await api.delete(`/quizzes/${quiz.id}`);
      setModal(null);
      setMsg("Quiz removed from the quiz bank.");
      await load();
    } catch (e) {
      setMsg(e?.response?.data?.message || "Failed to delete quiz.");
    }
  }

  async function reuseQuiz(quiz, classId) {
    try {
      await api.post(`/quizzes/${quiz.id}/reuse`, { classId });
      setModal(null);
      setMsg("Quiz sent back to Live Sessions.");
      await load();
      setActiveTab?.("live");
    } catch (e) {
      setMsg(e?.response?.data?.message || "Failed to reuse quiz.");
    }
  }

  async function removeQuestion(id) {
    try {
      await api.delete(`/question-bank/${id}`);
      setModal(null);
      setMsg("Question removed from the question bank.");
      await load();
    } catch {
      setMsg("Failed to remove question.");
    }
  }

  const filteredQuizBankItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = quizBankItems.filter((quiz) => {
      if (folderFilter !== "ALL" && Number(quiz.class_id || 0) !== Number(folderFilter)) return false;
      if (!q) return true;
      return [quiz.title, quiz.template_type, quiz.category].some((value) => String(value || "").toLowerCase().includes(q));
    });
    rows.sort((a, b) => sortBy === "title" ? String(a.title || "").localeCompare(String(b.title || "")) : Number(b.id) - Number(a.id));
    return rows;
  }, [quizBankItems, query, folderFilter, sortBy]);

  const filteredQuestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = [...questions].filter((question) => !q || [question.prompt, question.template_type, question.category].some((value) => String(value || "").toLowerCase().includes(q)));
    rows.sort((a, b) => sortBy === "title" ? String(a.prompt || "").localeCompare(String(b.prompt || "")) : new Date(b.saved_at || 0).getTime() - new Date(a.saved_at || 0).getTime());
    return rows;
  }, [questions, query, sortBy]);

  if (loading) return <div className="container"><div style={card(c)}>Loading bank content…</div></div>;

  return (
    <>
      <div className="container" style={{ display: 'grid', gap: 18 }}>
        <section>
          <h2 style={{ marginBottom: 4, color: c.text }}>{view === 'quiz' ? 'Quiz Bank' : 'Question Bank'}</h2>
          {view === 'question' && <p style={{ color: c.textMuted, marginTop: 0, fontSize: 14 }}>Saved questions stay here for future use in the Quiz Builder.</p>}
        </section>

        <section style={card(c, { padding: 10 })}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button onClick={() => setView('quiz')} style={{ ...btn(c, view === 'quiz'), width: '100%' }}>Quiz Bank</button>
            <button onClick={() => setView('question')} style={{ ...btn(c, view === 'question'), width: '100%' }}>Question Bank</button>
          </div>
        </section>

        <section style={card(c)}>
          <div style={{ display: 'grid', gridTemplateColumns: view === 'quiz' ? 'minmax(220px, 1.4fr) minmax(180px, 0.8fr) minmax(150px, 0.7fr)' : 'minmax(220px, 1.4fr) minmax(150px, 0.7fr)', gap: 12 }}>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={view === 'quiz' ? 'Search by quiz title, template, or category' : 'Search saved questions'} style={inputStyle(c)} />
            {view === 'quiz' && (
              <select value={folderFilter} onChange={(e) => setFolderFilter(e.target.value)} style={inputStyle(c)}>
                <option value='ALL'>All folders</option>
                {folderOptions.map((folder) => <option key={folder.id} value={folder.id}>{folder.pathLabel}</option>)}
              </select>
            )}
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={inputStyle(c)}>
              <option value='recent'>Newest first</option>
              <option value='title'>Title A–Z</option>
            </select>
          </div>
        </section>

        {msg && <div style={{ ...card(c, { padding: '12px 14px', boxShadow: 'none' }), color: c.textMuted, fontSize: 13, fontWeight: 700 }}>{msg}</div>}

        {view === 'quiz' ? (
          <div style={{ display: 'grid', gap: 12 }}>
            {filteredQuizBankItems.length === 0 && <div style={card(c)}>No quizzes in the quiz bank yet.</div>}
            {filteredQuizBankItems.map((quiz) => (
              <QuizBankCard key={quiz.id} quiz={quiz} folderLabel={folderPathMap.get(Number(quiz.class_id)) || 'No folder assigned'} folderOptions={folderOptions} onPreview={() => setPreviewQuiz(quiz)} onDelete={() => setModal({ type: 'deleteQuiz', quiz })} onReuse={(classId) => setModal({ type: 'reuseQuiz', quiz, classId })} c={c} />
            ))}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12, justifyItems: 'center' }}>
            {filteredQuestions.length === 0 && <div style={card(c, { width: 'min(100%, 780px)' })}>No saved questions yet. Use <b>Save to Bank</b> inside the Quiz Builder.</div>}
            {filteredQuestions.map((q) => <QuestionCard key={q.id} question={q} onRemove={() => setModal({ type: 'deleteQuestion', question: q })} c={c} />)}
          </div>
        )}

        {previewQuiz && <PreviewModal quiz={previewQuiz} onClose={() => setPreviewQuiz(null)} />}
      </div>

      {modal?.type === 'deleteQuiz' && <ActionDialog tone='red' icon='🗑' title='Delete quiz from Quiz Bank?' message={<><b style={{ color: c.text }}>{modal.quiz.title}</b> will be permanently removed.</>} onClose={() => setModal(null)} actions={<><button onClick={() => setModal(null)} style={secondaryBtn(c, dark)}>Cancel</button><button onClick={() => deleteQuiz(modal.quiz)} style={primaryBtn({ bg: c.redBg, fg: c.redFg, border: c.redBorder })}>Delete</button></>} />}
      {modal?.type === 'reuseQuiz' && <ActionDialog tone='blue' icon='♻️' title='Send quiz back to Live Sessions?' message={<><b style={{ color: c.text }}>{modal.quiz.title}</b> will return to Live Sessions using the folder you selected.</>} onClose={() => setModal(null)} actions={<><button onClick={() => setModal(null)} style={secondaryBtn(c, dark)}>Cancel</button><button onClick={() => reuseQuiz(modal.quiz, modal.classId)} style={primaryBtn({ bg: `${c.accent}18`, fg: c.accent, border: c.accent })}>Reuse Quiz</button></>} />}
      {modal?.type === 'deleteQuestion' && <ActionDialog tone='red' icon='🗑' title='Remove question?' message='This saved question will be removed from the question bank.' onClose={() => setModal(null)} actions={<><button onClick={() => setModal(null)} style={secondaryBtn(c, dark)}>Cancel</button><button onClick={() => removeQuestion(modal.question.id)} style={primaryBtn({ bg: c.redBg, fg: c.redFg, border: c.redBorder })}>Remove question</button></>} />}
    </>
  );
}

function QuizBankCard({ quiz, folderLabel, folderOptions, onPreview, onDelete, onReuse, c }) {
  const tone = templateTone(quiz.template_type, c, false);
  const [reuseFolderId, setReuseFolderId] = useState(Number(quiz.class_id) || Number(folderOptions[0]?.id) || '');
  const [moreOpen, setMoreOpen] = useState(false);
  const navigate = useNavigate();
  const currentFolderLabel = folderOptions.find((folder) => Number(folder.id) === Number(reuseFolderId))?.pathLabel || folderLabel;
  return (
    <div style={{ ...card(c), ...templateCardChrome(quiz.template_type, c, false) }}>
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 16, color: c.text }}>{quiz.title}</div>
            <div style={{ color: c.textMuted, fontSize: 13, marginTop: 5 }}>{templateLabel(quiz.template_type)} · {quiz.category}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Badge label={templateLabel(quiz.template_type)} c={c} tone='blue' />
            <Badge label='In Quiz Bank' c={c} tone='blue' />
            <Badge label={currentFolderLabel} c={c} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) auto', gap: 12, alignItems: 'center' }}>
          <div>
            <div style={{ color: c.textMuted, fontSize: 12, marginBottom: 6 }}>Folder after the next finished live session</div>
            <select value={reuseFolderId} onChange={(e) => setReuseFolderId(Number(e.target.value))} style={inputStyle(c)}>
              {folderOptions.map((folder) => <option key={folder.id} value={folder.id}>{folder.pathLabel}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button onClick={onPreview} style={btn(c)}>Preview</button>
            <button onClick={() => onReuse(reuseFolderId)} style={btn(c, true)} disabled={!reuseFolderId}>Reuse</button>
            <div style={{ position: 'relative' }}>
              <button onClick={() => setMoreOpen((v) => !v)} style={btn(c)}>More ▾</button>
              {moreOpen && (
                <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', width: 200, zIndex: 20, ...card(c, { padding: 8 }) }}>
                  <button onClick={() => navigate(`/teacher/quizzes/${quiz.id}/builder`)} style={menuBtn(c)}>Edit</button>
                  <button onClick={onDelete} style={{ ...menuBtn(c), color: c.redFg }}>Delete</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function QuestionCard({ question: q, onRemove, c }) {
  const tone = templateTone(q.template_type, c, false);
  return (
    <div style={{ ...card(c, { width: 'min(100%, 780px)' }), ...templateCardChrome(q.template_type, c, false), display: 'grid', gap: 12, justifyItems: 'center', textAlign: 'center' }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Badge label={templateLabel(q.template_type)} c={c} tone='blue' />
        <Badge label={q.category} c={c} />
      </div>
      <div style={{ fontWeight: 700, lineHeight: 1.6, color: c.text, maxWidth: 620 }}>{q.prompt}</div>
      {Array.isArray(q.config_json?.options) && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
          {q.config_json.options.map((opt, i) => <Badge key={i} label={`${opt}${opt === q.correct_json?.choice ? ' ✓' : ''}`} c={c} tone={opt === q.correct_json?.choice ? 'green' : 'neutral'} />)}
        </div>
      )}
      {q.correct_json?.text && <div style={{ fontSize: 13, color: c.textMuted }}>Answer: <strong style={{ color: c.text }}>{q.correct_json.text}</strong></div>}
      <div style={{ fontSize: 12, color: c.textSub }}>Saved {new Date(q.saved_at).toLocaleDateString('en-PH')}</div>
      <button onClick={onRemove} style={{ ...btn(c), borderColor: c.redBorder, background: c.redBg, color: c.redFg }}>Remove</button>
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
    <div onClick={onClose} style={previewOverlay(dark)}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(95vw, 760px)', maxHeight: '90vh', background: c.cardBg, border: `1px solid ${c.border}`, borderRadius: 20, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 30px 80px rgba(0,0,0,.30)' }}>
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
              <div style={{ background: c.cardBg2, border: `1px solid ${c.border}`, borderRadius: 14, padding: '18px 20px', fontSize: 16, fontWeight: 800, lineHeight: 1.6, color: c.text, marginBottom: 14, textAlign: 'center' }}>{currentQ.prompt}</div>
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
    </div>
  );
}

function previewOverlay(dark) {
  // Revision 10: shared preview overlay removes the visible page container seam behind modals.
  return { position: 'fixed', inset: 0, zIndex: 9200, display: 'grid', placeItems: 'center', padding: 20, background: dark ? 'rgba(0,0,0,.68)' : 'rgba(15,23,42,.46)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', isolation: 'isolate' };
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
  return <div style={{ padding: '12px 14px', background: c.cardBg2, border: `1px solid ${c.border}`, borderRadius: 12, fontSize: 13, color: c.textMuted }}>Students type or interact with the answer here during gameplay.</div>;
}

function safeJson(v) {
  if (!v) return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return null; }
}
