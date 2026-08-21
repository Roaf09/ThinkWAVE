/* FILE GUIDE:
 * client/src/pages/teacher/tabs/QuestionBankTab.jsx
 * Purpose: Combined Quiz Bank and Question Bank library screen.
 * Tip: This page now uses both a segmented top toggle and the sidebar label switch for clearer navigation.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../../lib/api";
import { useColors, useTheme } from "../../../context/ThemeContext";
import { TEMPLATE_PALETTES, templateCardChrome, templateLabel, templateTone } from "../../../lib/templatePalette";
import { TwIcon } from "../../../components/TwUI";
import QuizPreviewModal from "../../../components/QuizPreviewModal";
import { TeacherActionModal, TeacherPressButton, ThinkBotEmptyState } from "../TeacherUI";
import { buildThinkSpellGrid, buildThinkSpellSeed, buildThinkSpellSignature } from "../../../templates/thinkspell/thinkSpell";
import ThinkBotTutorial from "../../../components/ThinkBotTutorial";
import { readTutorialState, writeTutorialState } from "../../../lib/tutorialState";

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

export default function QuestionBankTab({ setBankLabel, setActiveTab, tutorial }) {
  const [view, setView] = useState("quiz");
  const [quizzes, setQuizzes] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [previewQuiz, setPreviewQuiz] = useState(null);
  const [modal, setModal] = useState(null);
  const [msg, setMsg] = useState("");
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("recent");
  const [bankTutorialStage, setBankTutorialStage] = useState(null);
  const c = useColors();
  const { dark } = useTheme();

  const quizBankItems = useMemo(() => {
    const unique = new Map();
    for (const quiz of (quizzes || []).filter((item) => item.status === "BANKED")) {
      const canonical = quiz.source_quiz_id
        ? `source:${quiz.source_quiz_id}`
        : `quiz:${String(quiz.title || "").trim().toLowerCase()}|${normalizeBankTemplate(quiz.template_type)}|${quiz.category || ""}`;
      if (!unique.has(canonical)) unique.set(canonical, quiz);
    }
    return [...unique.values()];
  }, [quizzes]);

  async function load() {
    try {
      const [quizRes, bankRes] = await Promise.all([api.get("/quizzes"), api.get("/question-bank")]);
      setQuizzes(quizRes.data || []);
      setQuestions(bankRes.data || []);
    } catch (e) {
      console.error(e);
      setMsg("Failed to load bank content.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => { setBankLabel?.(view === "quiz" ? "Quiz Bank" : "Question Bank"); }, [view, setBankLabel]);

  useEffect(() => {
    if (loading || !tutorial?.userId || bankTutorialStage) return;
    if (!(quizBankItems.length || questions.length)) return;
    if (readTutorialState(tutorial.userId).bankTutorialSeen) return;
    setBankTutorialStage("intro");
  }, [loading, tutorial?.userId, quizBankItems.length, questions.length, bankTutorialStage]);


  function finishBankTutorial() {
    if (tutorial?.userId) writeTutorialState(tutorial.userId, { bankTutorialSeen: true });
    setBankTutorialStage(null);
  }

  function openQuestionBank() {
    setView("question");
    if (bankTutorialStage === "switch") setBankTutorialStage("question");
  }

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

  async function reuseQuiz(quiz) {
    try {
      await api.post(`/quizzes/${quiz.id}/reuse`, {});
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
      if (templateFilter && normalizeBankTemplate(quiz.template_type) !== templateFilter) return false;
      if (!q) return true;
      return [quiz.title, quiz.template_type, quiz.category].some((value) => String(value || "").toLowerCase().includes(q));
    });
    rows.sort((a, b) => sortBy === "title" ? String(a.title || "").localeCompare(String(b.title || "")) : Number(b.id) - Number(a.id));
    return rows;
  }, [quizBankItems, query, sortBy]);

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

  const currentHasItems = view === "quiz" ? quizBankItems.length > 0 : questions.length > 0;

  if (loading) return <div className="container"><div style={card(c)}>Loading bank content…</div></div>;

  return (
    <>
      <div className="container" style={{ display: 'grid', gap: 18 }}>
        <section>
          <h2 style={{ marginBottom: 4, color: c.text }}>{view === 'quiz' ? 'Quiz Bank' : 'Question Bank'}</h2>
        </section>

        <section style={card(c, { padding: 12 })}>
          <div className="tw-teacher-bank-toggle">
            <TeacherPressButton tone="blue" className={view === 'quiz' ? 'is-selected is-muted-selected' : ''} disabled={view === 'quiz'} onClick={() => setView('quiz')}>Quiz Bank</TeacherPressButton>
            <TeacherPressButton data-tutorial="bank-question-toggle" tone="blue" className={view === 'question' ? 'is-selected is-muted-selected' : ''} disabled={view === 'question'} onClick={openQuestionBank}>Question Bank</TeacherPressButton>
          </div>
        </section>

        {currentHasItems && <section style={card(c)}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1.4fr) minmax(150px, 0.7fr)', gap: 12 }}>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={view === 'quiz' ? 'Search by quiz title, template, or category' : 'Search saved questions'} style={inputStyle(c)} />
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={inputStyle(c)}>
              <option value='recent'>Newest first</option>
              <option value='title'>Title A–Z</option>
              {Object.entries(TEMPLATE_PALETTES).map(([value, meta]) => <option key={value} value={`template:${value}`}>{meta.label}</option>)}
            </select>
          </div>
        </section>}

        {msg && <div style={{ ...card(c, { padding: '12px 14px', boxShadow: 'none' }), color: c.textMuted, fontSize: 13, fontWeight: 700 }}>{msg}</div>}

        {view === 'quiz' ? (
          <div style={{ display: 'grid', gap: 12 }}>
            {quizBankItems.length === 0 ? <ThinkBotEmptyState c={c} title="No saved quizzes yet." /> : filteredQuizBankItems.length === 0 ? <div style={card(c)}>No saved quizzes match your current filters.</div> : null}
            {filteredQuizBankItems.map((quiz) => (
              <QuizBankCard key={quiz.id} quiz={quiz} onPreview={() => setPreviewQuiz(quiz)} onDelete={() => setModal({ type: 'deleteQuiz', quiz })} onReuse={() => setModal({ type: 'reuseQuiz', quiz })} c={c} />
            ))}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12, justifyItems: 'center' }}>
            {questions.length === 0 ? <div style={{ width: '100%' }}><ThinkBotEmptyState c={c} title="No saved questions yet." /></div> : filteredQuestions.length === 0 ? <div style={card(c, { width: '100%' })}>No saved questions match your current filters.</div> : null}
            {filteredQuestions.map((q) => <QuestionCard key={q.id} question={q} onRemove={() => setModal({ type: 'deleteQuestion', question: q })} c={c} />)}
          </div>
        )}

        {previewQuiz && <QuizPreviewModal quiz={previewQuiz} onClose={() => setPreviewQuiz(null)} />}
      </div>

      {modal?.type === 'deleteQuiz' && <TeacherActionModal c={c} tone='red' icon='trash' title='Delete quiz from Quiz Bank?' message={`${modal.quiz.title} will be permanently removed.`} confirmLabel='Delete' textCancel onClose={() => setModal(null)} onConfirm={() => deleteQuiz(modal.quiz)} />}
      {modal?.type === 'reuseQuiz' && <TeacherActionModal c={c} tone='blue' icon='history' title='Send quiz back to Live Sessions?' message={`${modal.quiz.title} will return to Live Sessions. You can choose its class when hosting or assigning it.`} confirmLabel='Reuse Quiz' textCancel onClose={() => setModal(null)} onConfirm={() => reuseQuiz(modal.quiz)} />}
      {modal?.type === 'deleteQuestion' && <TeacherActionModal c={c} tone='red' icon='trash' title='Remove question?' message='This saved question will be removed from the question bank.' confirmLabel='Remove question' textCancel onClose={() => setModal(null)} onConfirm={() => removeQuestion(modal.question.id)} />}
      {bankTutorialStage === "intro" && <ThinkBotTutorial clickAnywhere onClickAnywhere={() => setBankTutorialStage(quizBankItems.length ? "quiz" : "switch")}><p>Looks like you’ve started building your content! Let me show you where ThinkWAVE keeps everything you save.</p></ThinkBotTutorial>}
      {bankTutorialStage === "quiz" && <ThinkBotTutorial target='[data-tutorial="bank-quiz-card"]' actionLabel="Got it" onAction={() => setBankTutorialStage("switch")}><p>Your <strong>Quiz Bank</strong> keeps your saved quizzes ready to reuse.</p><p>Open a saved quiz to review it, reuse it, or make changes without starting from scratch.</p></ThinkBotTutorial>}
      {bankTutorialStage === "switch" && <ThinkBotTutorial target='[data-tutorial="bank-question-toggle"]' clickAnywhere allowTargetInteraction={false} onClickAnywhere={openQuestionBank}><p>Open your <strong>Question Bank</strong> to see saved individual questions.</p></ThinkBotTutorial>}
      {bankTutorialStage === "question" && <ThinkBotTutorial target='[data-tutorial="bank-question-toggle"]' clickAnywhere allowTargetInteraction={false} onClickAnywhere={() => setBankTutorialStage("question_more")}><p>Your <strong>Question Bank</strong> works the same way for individual questions.</p></ThinkBotTutorial>}
      {bankTutorialStage === "question_more" && <ThinkBotTutorial target='[data-tutorial="bank-question-toggle"]' actionLabel="Got it" onAction={finishBankTutorial}><p>Your <strong>Question Bank</strong> works the same way for individual questions.</p><p>Reusing questions can make building future activities much faster.</p></ThinkBotTutorial>}
    </>
  );
}

function QuizBankCard({ quiz, onPreview, onDelete, onReuse, c }) {
  const tone = templateTone(quiz.template_type, c, false);
  const [moreOpen, setMoreOpen] = useState(false);
  const navigate = useNavigate();
  const questionCount = Number(quiz.question_count || 0);
  const totalScore = Number(quiz.total_score || 0);
  useEffect(() => {
    if (!moreOpen) return undefined;
    const close = (event) => { if (!event.target.closest(`[data-bank-more="${quiz.id}"]`)) setMoreOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [moreOpen, quiz.id]);
  return (
    <div className="tw-bank-content-card tw-bank-quiz-card" data-tutorial="bank-quiz-card" style={{ ...card(c), ...templateCardChrome(quiz.template_type, c, false), border: `3px solid ${tone.border}`, background: `color-mix(in srgb, ${tone.accent} 13%, ${c.cardBg})` }}>
      <div className="tw-bank-card-main">
        <div className="tw-bank-card-title" style={{ color: c.text }}>{quiz.title}</div>
        <div className="tw-bank-card-badges">
          <TemplateBadge label={templateLabel(quiz.template_type)} tone={tone} />
          <Badge label={quiz.category === "K12" ? "K-12" : "College"} c={c} tone="yellow" />
          <Badge label={`${questionCount} question${questionCount === 1 ? "" : "s"}`} c={c} tone="blue" />
          <Badge label={`${totalScore} total point${totalScore === 1 ? "" : "s"}`} c={c} tone="green" />
        </div>
      </div>
      <div className="tw-bank-card-actions">
        <button onClick={() => { setMoreOpen(false); onPreview(); }} className="tw-analytics-text-link tw-bank-preview-link" style={{ color: c.accent }}>Preview</button>
        <TeacherPressButton tone="blue" onClick={onReuse}>Reuse</TeacherPressButton>
        <div data-bank-more={quiz.id} style={{ position: "relative" }}>
          <button aria-label="More actions" title="More actions" onClick={() => setMoreOpen((value) => !value)} className="tw-bank-more-button">⋮</button>
          {moreOpen && <div style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", width: 200, zIndex: 1200, ...card(c, { padding: 8, boxShadow: "0 22px 50px rgba(15,23,42,.24)" }) }}>
            <button onClick={() => { setMoreOpen(false); navigate(`/teacher/quizzes/${quiz.id}/builder`); }} style={menuBtn(c)}>Edit</button>
            <button onClick={() => { setMoreOpen(false); onDelete(); }} style={{ ...menuBtn(c), color: c.redFg }}>Delete</button>
          </div>}
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
  const collapsible = tt === "GUESS_WORD_4PICS" || tt === "MATCHING" || tt === "THINK_SPELL";
  const [expanded, setExpanded] = useState(false);
  const answers = getBankAnswers(tt, cfg, correct);
  const hideSummaryWhenExpanded = ["GUESS_WORD_4PICS", "MATCHING", "THINK_SPELL"].includes(tt) && expanded;

  return (
    <div className="tw-bank-content-card tw-bank-question-card" style={{ ...card(c, { width: "100%", padding: 0, overflow: "visible" }), ...templateCardChrome(tt, c, false), border: `3px solid ${tone.border}`, background: `color-mix(in srgb, ${tone.accent} 12%, ${c.cardBg})`, textAlign: "center", position: "relative" }}>
      <TeacherPressButton tone="red" className="tw-question-bank-delete" title="Remove question" aria-label="Remove question" onClick={onRemove}><TwIcon name="trash" size={19} /></TeacherPressButton>
      <div className="tw-bank-question-inner">
        <TemplateBadge label={templateLabel(tt)} tone={tone} />
        <div className="tw-bank-question-prompt" style={{ color: c.text }}>{q.prompt}</div>

        {tt === "MCQ" ? <McqBankAnswers cfg={cfg} correct={correct} c={c} />
          : tt === "TRUE_FALSE" ? <TrueFalseBankAnswers correct={correct} c={c} />
          : <div className={`tw-bank-answer-summary${answers.length === 1 ? " is-single" : ""}${tt === "THINK_SPELL" ? " is-think-spell" : ""}${hideSummaryWhenExpanded ? " is-hidden" : ""}`}>
              {answers.length ? answers.map((answer, index) => <TemplateAnswer key={`${answer}-${index}`} value={answer} tone={tone} />) : <span style={{ color: c.textMuted, fontSize: 13 }}>No answer saved.</span>}
            </div>}

        {collapsible && <button aria-label={expanded ? "Collapse content" : "Show content"} title={expanded ? "Collapse" : "Show content"} onClick={() => setExpanded((value) => !value)} className="tw-bank-expand-button" style={{ borderColor: tone.border, color: tone.accent, background: tone.softBg }}><TwIcon name={expanded ? "chevronUp" : "chevronDown"} size={24} strokeWidth={3.3} /></button>}

        {collapsible && expanded && <div className="tw-bank-expanded-preview" style={{ borderColor: tone.border, background: tone.softBg }}>
          {tt === "GUESS_WORD_4PICS" ? <GuessWordBankPreview cfg={cfg} correct={correct} c={c} tone={tone} /> : tt === "THINK_SPELL" ? <ThinkSpellBankPreview cfg={cfg} correct={correct} c={c} tone={tone} /> : <MatchingBankPreview cfg={cfg} c={c} tone={tone} />}
        </div>}

        <div className="tw-bank-saved-date" style={{ color: c.textSub }}>Saved {new Date(q.saved_at).toLocaleDateString("en-PH")}</div>
      </div>
    </div>
  );
}

function TemplateBadge({ label, tone }) {
  return <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "6px 11px", borderRadius: 999, fontSize: 12, fontWeight: 900, background: tone.softBg, color: tone.accent, border: `2px solid ${tone.border}` }}>{label}</span>;
}

function McqBankAnswers({ cfg, correct, c }) {
  const options = Array.isArray(cfg.options) ? cfg.options : [];
  const values = Array.isArray(correct.choices) && correct.choices.length ? correct.choices : [correct.choice].filter(Boolean);
  return <div className="tw-bank-mcq-grid">{options.map((option, index) => {
    const label = optionLabel(option, index);
    const isCorrect = values.some((value) => optionMatchesBankValue(option, value, index));
    const oddLast = options.length % 2 === 1 && index === options.length - 1;
    return <div key={option?.id || `${label}-${index}`} className={`tw-bank-answer-option${isCorrect ? " is-correct" : ""}${oddLast ? " is-odd-last" : ""}`} style={isCorrect ? undefined : { background: c.cardBg2, borderColor: c.border, color: c.text }}>
      {option?.image && <img src={option.image} alt="" />}
      <span>{label}</span>{isCorrect && <TwIcon name="check" size={17} />}
    </div>;
  })}</div>;
}

function TrueFalseBankAnswers({ correct, c }) {
  const selected = String(correct.choice ?? correct.text ?? "").trim().toLowerCase();
  return <div className="tw-bank-true-false">{["True", "False"].map((value) => {
    const isCorrect = selected === value.toLowerCase();
    const className = isCorrect ? (value === "True" ? " is-true" : " is-false") : "";
    return <div key={value} className={`tw-bank-tf-option${className}`} style={!isCorrect ? { background: c.cardBg2, borderColor: c.border, color: c.text } : undefined}>{value}{isCorrect && <TwIcon name={value === "True" ? "check" : "close"} size={18} />}</div>;
  })}</div>;
}

function optionMatchesBankValue(option, value, index) {
  const normalizedValue = String(value ?? "").trim().toLowerCase();
  if (option && typeof option === "object") {
    return [option.id, option.value, option.text, option.label, optionLabel(option, index)].some((candidate) => String(candidate ?? "").trim().toLowerCase() === normalizedValue);
  }
  return String(option ?? "").trim().toLowerCase() === normalizedValue;
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

function TemplateAnswer({ value, tone }) {
  return <div className="tw-bank-template-answer" style={{ borderColor: tone.border, background: tone.softBg, color: tone.accent }}><span>{value}</span></div>;
}

function GuessWordBankPreview({ cfg, correct, c, tone }) {
  const images = Array.isArray(cfg.images) ? cfg.images : [];
  const answer = String(correct?.text || cfg?.target || "").trim();
  return <div className="tw-bank-guess-expanded">
    <div className="tw-bank-guess-images">{[0,1,2,3].map((i) => <div key={i} style={{ aspectRatio: '1', borderRadius: 10, overflow: 'hidden', border: `2px solid ${tone.border}`, background: c.cardBg, display: 'grid', placeItems: 'center' }}>{images[i] ? <img src={images[i]} alt={`Clue ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ color: tone.accent, fontWeight: 900 }}>?</span>}</div>)}</div>
    {answer && <div className="tw-bank-guess-answer" style={{ borderColor: tone.border, background: tone.softBg, color: tone.accent }}>{answer}</div>}
  </div>;
}


function ThinkSpellBankPreview({ cfg, correct, c, tone }) {
  const words = (Array.isArray(correct?.answers) && correct.answers.length ? correct.answers : Array.isArray(cfg?.answers) ? cfg.answers : []).map((word) => String(word || "").toUpperCase().replace(/[^A-Z]/g, "")).filter(Boolean);
  const gridSize = Math.min(12, Math.max(5, Number(cfg?.gridSize || Math.max(5, ...words.map((word) => word.length), 5))));
  const signature = `${buildThinkSpellSignature({ questionId: 0, gridSize, words })}-${Number(cfg?.gridSeed || 1)}`;
  const preview = buildThinkSpellGrid({ gridSize, words, seed: buildThinkSpellSeed(signature) });
  return <div className="tw-bank-crossword-expanded">
    <div className="tw-bank-thinkspell-preview" style={{ borderColor: tone.border, gridTemplateColumns: `repeat(${preview.gridSize}, minmax(0,1fr))` }}>
      {preview.grid.map((letter, index) => <span key={index} style={{ background: c.cardBg, borderColor: tone.border, color: tone.accent }}>{letter}</span>)}
    </div>
    <div className="tw-bank-crossword-word-list">
      {words.map((word, index) => <div key={`${word}-${index}`} className="tw-bank-crossword-word" style={{ borderColor: tone.border, background: tone.softBg, color: tone.accent }}>{word}</div>)}
    </div>
  </div>;
}

function MatchingBankPreview({ cfg, c, tone }) {
  const colA = Array.isArray(cfg.colA) ? cfg.colA : [];
  const colB = Array.isArray(cfg.colB) ? cfg.colB : [];
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 14, alignItems: "start", textAlign: "center" }}>
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ color: tone.accent, fontWeight: 950, fontSize: 12, textTransform: "uppercase", letterSpacing: ".08em" }}>Column A</div>
      {colA.map((item, i) => <div key={`a-${i}`} style={{ padding: 10, borderRadius: 12, background: tone.softBg, border: `2px solid ${tone.border}` }}><MiniBankItem item={item} fallback={`Item ${i + 1}`} c={c} /></div>)}
    </div>
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ color: tone.accent, fontWeight: 950, fontSize: 12, textTransform: "uppercase", letterSpacing: ".08em" }}>Column B</div>
      {colB.map((item, i) => <div key={`b-${i}`} style={{ padding: 10, borderRadius: 12, background: i < colA.length ? tone.softBg : c.cardBg, border: `2px solid ${i < colA.length ? tone.border : c.border}` }}><MiniBankItem item={item} fallback={i < colA.length ? `Match ${i + 1}` : `Dummy ${i - colA.length + 1}`} c={c} />{i >= colA.length && <div style={{ marginTop: 5, color: c.textMuted, fontSize: 10, fontWeight: 850 }}>Dummy answer</div>}</div>)}
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
