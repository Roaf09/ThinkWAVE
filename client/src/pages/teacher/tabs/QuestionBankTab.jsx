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
import { TEMPLATE_PALETTES, templateCardChrome, templateLabel, templateTone } from "../../../lib/templatePalette";
import { TwIcon } from "../../../components/TwUI";
import QuizPreviewModal from "../../../components/QuizPreviewModal";

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
    const templateFilter = sortBy.startsWith("template:") ? sortBy.slice(9) : null;
    const rows = quizBankItems.filter((quiz) => {
      if (folderFilter !== "ALL" && Number(quiz.class_id || 0) !== Number(folderFilter)) return false;
      if (templateFilter && normalizeBankTemplate(quiz.template_type) !== templateFilter) return false;
      if (!q) return true;
      return [quiz.title, quiz.template_type, quiz.category].some((value) => String(value || "").toLowerCase().includes(q));
    });
    rows.sort((a, b) => sortBy === "title" ? String(a.title || "").localeCompare(String(b.title || "")) : Number(b.id) - Number(a.id));
    return rows;
  }, [quizBankItems, query, folderFilter, sortBy]);

  const filteredQuestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    const templateFilter = sortBy.startsWith("template:") ? sortBy.slice(9) : null;
    const rows = [...questions].filter((question) => {
      if (templateFilter && normalizeBankTemplate(question.template_type) !== templateFilter) return false;
      return !q || [question.prompt, question.template_type, question.category].some((value) => String(value || "").toLowerCase().includes(q));
    });
    rows.sort((a, b) => sortBy === "title" ? String(a.prompt || "").localeCompare(String(b.prompt || "")) : new Date(b.saved_at || 0).getTime() - new Date(a.saved_at || 0).getTime());
    return rows;
  }, [questions, query, sortBy]);

  if (loading) return <div className="container"><div style={card(c)}>Loading bank content…</div></div>;

  return (
    <>
      <div className="container" style={{ display: 'grid', gap: 18 }}>
        <section>
          <h2 style={{ marginBottom: 4, color: c.text }}>{view === 'quiz' ? 'Quiz Bank' : 'Question Bank'}</h2>
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
              {Object.entries(TEMPLATE_PALETTES).map(([value, meta]) => <option key={value} value={`template:${value}`}>{meta.label}</option>)}
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

        {previewQuiz && <QuizPreviewModal quiz={previewQuiz} onClose={() => setPreviewQuiz(null)} />}
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
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap', width: '100%' }}>
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
  const tt = normalizeBankTemplate(q.template_type);
  const tone = templateTone(tt, c, false);
  const cfg = q.config_json || {};
  const correct = q.correct_json || {};
  const collapsible = tt === "GUESS_WORD_4PICS" || tt === "MATCHING";
  const [expanded, setExpanded] = useState(false);
  const answers = getBankAnswers(tt, cfg, correct);
  const answerAreaStyle = tt === "MATCHING"
    ? { display: "grid", justifyItems: "center", gap: 8, width: "100%" }
    : { display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap", width: "100%" };

  return (
    <div style={{ ...card(c, { width: "min(100%, 780px)", padding: 0, overflow: "hidden" }), ...templateCardChrome(tt, c, false), textAlign: "center" }}>
      <div style={{ padding: 16, display: "grid", gap: 12, justifyItems: "center" }}>
        <div style={{ minWidth: 0, width: "100%" }}>
          <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap", marginBottom: 9 }}>
            <Badge label={templateLabel(tt)} c={c} tone="blue" />
            <Badge label={q.category} c={c} />
          </div>
          <div style={{ fontWeight: 800, lineHeight: 1.5, color: c.text, overflowWrap: "anywhere", textAlign: "center" }}>{q.prompt}</div>
        </div>

        <div style={answerAreaStyle}>
          {answers.length ? answers.map((answer, i) => <CorrectAnswer key={`${answer}-${i}`} value={answer} />) : <span style={{ color: c.textMuted, fontSize: 13 }}>No answer saved.</span>}
        </div>

        {collapsible && <button aria-label={expanded ? "Collapse content" : "Show content"} title={expanded ? "Collapse" : "Show content"} onClick={() => setExpanded((v) => !v)} style={{ width: 46, height: 40, display: "grid", placeItems: "center", borderRadius: 13, border: `1.5px solid ${tone.border}`, color: tone.accent, background: tone.softBg, cursor: "pointer" }}><TwIcon name={expanded ? "chevronUp" : "chevronDown"} size={24} strokeWidth={3.3} /></button>}

        {collapsible && expanded && (
          <div style={{ width: "100%", padding: 14, borderRadius: 16, border: `1px solid ${tone.border}`, background: tone.softBg }}>
            {tt === "GUESS_WORD_4PICS" ? <GuessWordBankPreview cfg={cfg} c={c} tone={tone} /> : <MatchingBankPreview cfg={cfg} c={c} tone={tone} />}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 10, alignItems: "center", width: "100%" }}>
          <span /><div style={{ fontSize: 12, color: c.textSub, textAlign: "center" }}>Saved {new Date(q.saved_at).toLocaleDateString("en-PH")}</div>
          <button onClick={onRemove} style={{ ...btn(c), borderColor: c.redBorder, background: c.redBg, color: c.redFg }}>Remove</button>
        </div>
      </div>
    </div>
  );
}

function normalizeBankTemplate(value) {
  if (value === 'FOUR_PICS_ONE_WORD') return 'GUESS_WORD_4PICS';
  if (value === 'THINK_AND_SPELL') return 'THINK_SPELL';
  return value;
}

function optionLabel(option, index = 0) {
  if (option && typeof option === 'object') return String(option.text ?? option.label ?? option.value ?? '').trim() || (option.image ? `Image choice ${index + 1}` : `Option ${index + 1}`);
  return String(option ?? '').trim() || `Option ${index + 1}`;
}

function getBankAnswers(tt, cfg, correct) {
  if (tt === 'MCQ') {
    const options = Array.isArray(cfg.options) ? cfg.options : [];
    const values = Array.isArray(correct.choices) && correct.choices.length ? correct.choices : [correct.choice].filter(Boolean);
    return values.map((value) => {
      const found = options.find((option, index) => {
        if (option && typeof option === 'object') return String(option.id ?? option.value ?? '') === String(value) || optionLabel(option, index).toLowerCase() === String(value).toLowerCase();
        return String(option).toLowerCase() === String(value).toLowerCase();
      });
      return found !== undefined ? optionLabel(found, options.indexOf(found)) : String(value);
    }).filter(Boolean);
  }
  if (tt === 'TRUE_FALSE') return [correct.choice].filter(Boolean);
  if (tt === 'TYPE_ANSWER' || tt === 'DRAW_IT' || tt === 'GRIP_GUESS' || tt === 'GUESS_WORD_4PICS') return [correct.text || cfg.target, ...(Array.isArray(correct.answers) ? correct.answers : [])].filter(Boolean);
  if (tt === 'THINK_SPELL') return [...(Array.isArray(correct.answers) ? correct.answers : Array.isArray(cfg.answers) ? cfg.answers : []), ...(!correct.answers?.length && correct.text ? [correct.text] : [])].filter(Boolean);
  if (tt === 'MATCHING') {
    const colA = Array.isArray(cfg.colA) ? cfg.colA : [];
    const colB = Array.isArray(cfg.colB) ? cfg.colB : [];
    return colA.map((a, i) => `${optionLabel(a, i)} ↔ ${optionLabel(colB[i], i)}`);
  }
  return [correct.text, correct.choice].filter(Boolean);
}

function CorrectAnswer({ value }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 11px', borderRadius: 12, border: '2px solid #22c55e', background: 'rgba(34,197,94,.10)', color: '#15803d', fontWeight: 900, fontSize: 13 }}><span style={{ width: 18, height: 18, borderRadius: 999, background: '#22c55e', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 11 }}>✓</span>{value}</span>;
}

function GuessWordBankPreview({ cfg, c, tone }) {
  const images = Array.isArray(cfg.images) ? cfg.images : [];
  return <div style={{ width: 'min(100%, 260px)', margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>{[0,1,2,3].map((i) => <div key={i} style={{ aspectRatio: '1', borderRadius: 10, overflow: 'hidden', border: `1px solid ${tone.border}`, background: c.cardBg, display: 'grid', placeItems: 'center' }}>{images[i] ? <img src={images[i]} alt={`Clue ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ color: tone.accent, fontWeight: 900 }}>?</span>}</div>)}</div>;
}

function MatchingBankPreview({ cfg, c, tone }) {
  const colA = Array.isArray(cfg.colA) ? cfg.colA : [];
  const colB = Array.isArray(cfg.colB) ? cfg.colB : [];
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 14, alignItems: "start", textAlign: "center" }}>
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ color: "#f97316", fontWeight: 950, fontSize: 12, textTransform: "uppercase", letterSpacing: ".08em" }}>Choices</div>
      {colA.map((item, i) => <div key={`a-${i}`} style={{ padding: 10, borderRadius: 12, background: "rgba(249,115,22,.11)", border: "1.5px solid rgba(249,115,22,.62)" }}><MiniBankItem item={item} fallback={`Item ${i + 1}`} c={c} /></div>)}
    </div>
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ color: "#16a34a", fontWeight: 950, fontSize: 12, textTransform: "uppercase", letterSpacing: ".08em" }}>Answers</div>
      {colB.map((item, i) => <div key={`b-${i}`} style={{ padding: 10, borderRadius: 12, background: "rgba(34,197,94,.11)", border: "1.5px solid rgba(34,197,94,.62)" }}><MiniBankItem item={item} fallback={i < colA.length ? `Match ${i + 1}` : `Dummy ${i - colA.length + 1}`} c={c} />{i >= colA.length && <div style={{ marginTop: 5, color: c.textMuted, fontSize: 10, fontWeight: 850 }}>Dummy answer</div>}</div>)}
    </div>
  </div>;
}

function MiniBankItem({ item, fallback, c }) {
  const obj = item && typeof item === 'object' ? item : { text: String(item || '') };
  return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, minWidth: 0, textAlign: 'center' }}>{obj.image ? <img src={obj.image} alt='' style={{ width: 42, height: 42, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} /> : null}<span style={{ color: c.text, fontWeight: 800, overflowWrap: 'anywhere' }}>{obj.text || obj.label || fallback}</span></div>;
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
