/* FILE GUIDE:
 * client/src/pages/teacher/tabs/QuestionBankTab.jsx
 * Purpose: Combined Quiz Bank and Question Bank library screen.
 * Tip: This page now uses both a segmented top toggle and the sidebar label switch for clearer navigation.
 */

import { useEffect, useMemo, useState } from "react";
import { api } from "../../../lib/api";
import { useColors } from "../../../context/ThemeContext";
import { TEMPLATE_PALETTES } from "../../../lib/templatePalette";
import QuizPreviewModal from "../../../components/QuizPreviewModal";
import { TeacherActionModal, TeacherPressButton, ThinkBotEmptyState } from "../TeacherUI";
import ThinkBotTutorial from "../../../components/ThinkBotTutorial";
import { readTutorialState, writeTutorialState } from "../../../lib/tutorialState";
import { tabCard as card, tabInputStyle as inputStyle, normalizeBankTemplate, useIsMobileViewport } from "./teacherTabShared";
import { QuizBankCard } from "./bank-parts/QuizBankCard";
import { QuestionCard } from "./bank-parts/QuestionCard";

export default function QuestionBankTab({ setBankLabel, tutorial }) {
  const [view, setView] = useState("quiz");
  const isMobile = useIsMobileViewport();
  const [quizzes, setQuizzes] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [previewQuiz, setPreviewQuiz] = useState(null);
  const [modal, setModal] = useState(null);
  const [msg, setMsg] = useState("");
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("recent");
  const [templateFilter, setTemplateFilter] = useState("ALL");
  const [filterOpen, setFilterOpen] = useState(false);
  const [bankTutorialStage, setBankTutorialStage] = useState(null);
  const c = useColors();

  const quizBankItems = useMemo(() => {
    const unique = new Map();
    for (const quiz of (quizzes || []).filter((item) => item.status === "BANKED")) {
      const canonical = quiz.source_quiz_id
        ? `source:${quiz.source_quiz_id}`
        : `quiz:${String(quiz.title || "").trim().toLowerCase()}|${normalizeBankTemplate(quiz.template_type)}|${quiz.category || ""}`;
      if (!unique.has(canonical)) unique.set(canonical, quiz);
    }
    return [...unique.values()].sort((a, b) => {
      const aTime = new Date(a.updated_at || a.created_at || 0).getTime();
      const bTime = new Date(b.updated_at || b.created_at || 0).getTime();
      if (aTime !== bTime) return bTime - aTime;
      return Number(b.id || 0) - Number(a.id || 0);
    });
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
      if (templateFilter !== "ALL" && normalizeBankTemplate(quiz.template_type) !== templateFilter) return false;
      if (!q) return true;
      return [quiz.title, quiz.template_type, quiz.category].some((value) => String(value || "").toLowerCase().includes(q));
    });
    rows.sort((a, b) => {
      if (sortBy === "title") return String(a.title || "").localeCompare(String(b.title || ""));
      const aTime = new Date(a.updated_at || a.created_at || 0).getTime();
      const bTime = new Date(b.updated_at || b.created_at || 0).getTime();
      return bTime - aTime || Number(b.id || 0) - Number(a.id || 0);
    });
    return rows;
  }, [quizBankItems, query, templateFilter, sortBy]);

  const filteredQuestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = [...questions].filter((question) => {
      if (templateFilter !== "ALL" && normalizeBankTemplate(question.template_type) !== templateFilter) return false;
      return !q || [question.prompt, question.template_type, question.category].some((value) => String(value || "").toLowerCase().includes(q));
    });
    rows.sort((a, b) => sortBy === "title" ? String(a.prompt || "").localeCompare(String(b.prompt || "")) : new Date(b.saved_at || 0).getTime() - new Date(a.saved_at || 0).getTime());
    return rows;
  }, [questions, query, templateFilter, sortBy]);

  const currentHasItems = view === "quiz" ? quizBankItems.length > 0 : questions.length > 0;

  if (loading) return <div className="container"><div style={card(c)}>Loading bank content…</div></div>;

  return (
    <>
      <div className="container grid gap-[18px]">
        <section>
          <h2 className="mb-[4px]" style={{ color: c.text }}>{view === 'quiz' ? 'Quiz Bank' : 'Question Bank'}</h2>
        </section>

        <section className="tw-bank-switch-shell" style={card(c, { padding: 12 })}>
          {isMobile ? <div className="tw-teacher-bank-toggle tw-teacher-bank-toggle-single">
            <TeacherPressButton data-tutorial="bank-question-toggle" tone="blue" icon="swap" onClick={() => (view === 'quiz' ? openQuestionBank() : setView('quiz'))}>{view === 'quiz' ? 'Quiz Bank' : 'Question Bank'}</TeacherPressButton>
          </div> : <div className="tw-teacher-bank-toggle">
            <TeacherPressButton tone="blue" className={view === 'quiz' ? 'is-selected is-muted-selected' : ''} disabled={view === 'quiz'} onClick={() => setView('quiz')}>Quiz Bank</TeacherPressButton>
            <TeacherPressButton data-tutorial="bank-question-toggle" tone="blue" className={view === 'question' ? 'is-selected is-muted-selected' : ''} disabled={view === 'question'} onClick={openQuestionBank}>Question Bank</TeacherPressButton>
          </div>}
        </section>

        {currentHasItems && <section className="tw-bank-search-shell relative overflow-visible" style={card(c)}>
          <div className="tw-search-filter-row">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={view === 'quiz' ? 'Search by quiz title, template, or category' : 'Search saved questions'} className="tw-search-filter-input" style={inputStyle(c)} />
            <TeacherPressButton type="button" tone="neutral" icon="filter" className={`tw-filter-toggle-btn${filterOpen ? " is-selected" : ""}${templateFilter !== "ALL" ? " has-active-filters" : ""}`} onClick={() => setFilterOpen((v) => !v)}>Filter</TeacherPressButton>
          </div>
          {filterOpen && <div className="tw-filter-panel absolute right-[12px] left-[12px] top-[calc(100%_+_8px)]" style={{ ...card(c), zIndex: 40 }}>
            <div className="tw-filter-panel-group">
              <label className="block text-[11px] font-[900] uppercase tracking-[.06em] mb-[6px]" style={{ color: c.textMuted }}>Template</label>
              <select value={templateFilter} onChange={(e) => setTemplateFilter(e.target.value)} style={inputStyle(c)}>
                <option value='ALL'>All templates</option>
                {Object.entries(TEMPLATE_PALETTES).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
              </select>
            </div>
            <div className="tw-filter-panel-group">
              <label className="block text-[11px] font-[900] uppercase tracking-[.06em] mb-[6px]" style={{ color: c.textMuted }}>Sort by</label>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={inputStyle(c)}>
                <option value='recent'>Newest first</option>
                <option value='title'>Title A–Z</option>
              </select>
            </div>
          </div>}
        </section>}

        {msg && <div className="text-[13px] font-[700]" style={{ ...card(c, { padding: '12px 14px', boxShadow: 'none' }), color: c.textMuted }}>{msg}</div>}

        {view === 'quiz' ? (
          <div className="grid gap-[12px]">
            {quizBankItems.length === 0 ? <ThinkBotEmptyState c={c} title="No saved quizzes yet." /> : filteredQuizBankItems.length === 0 ? <div style={card(c)}>No saved quizzes match your current filters.</div> : null}
            {filteredQuizBankItems.map((quiz) => (
              <QuizBankCard key={quiz.id} quiz={quiz} onPreview={() => setPreviewQuiz(quiz)} onDelete={() => setModal({ type: 'deleteQuiz', quiz })} onReuse={() => setModal({ type: 'reuseQuiz', quiz })} c={c} isMobile={isMobile} />
            ))}
          </div>
        ) : (
          <div className="grid gap-[12px] justify-items-center">
            {questions.length === 0 ? <div className="w-full"><ThinkBotEmptyState c={c} title="No saved questions yet." /></div> : filteredQuestions.length === 0 ? <div className="w-full" style={card(c)}>No saved questions match your current filters.</div> : null}
            {filteredQuestions.map((q) => <QuestionCard key={q.id} question={q} onRemove={() => setModal({ type: 'deleteQuestion', question: q })} c={c} />)}
          </div>
        )}

        {previewQuiz && <QuizPreviewModal quiz={previewQuiz} onClose={() => setPreviewQuiz(null)} />}
      </div>

      {modal?.type === 'deleteQuiz' && <TeacherActionModal c={c} tone='red' icon='trash' title='Delete quiz from Quiz Bank?' message={`${modal.quiz.title} will be permanently removed.`} confirmLabel='Delete' textCancel onClose={() => setModal(null)} onConfirm={() => deleteQuiz(modal.quiz)} />}
      {modal?.type === 'reuseQuiz' && <TeacherActionModal c={c} tone='blue' icon='history' title='Send quiz back to Live Sessions?' message={`${modal.quiz.title} will return to Live Sessions. You can choose its class when hosting or assigning it.`} confirmLabel='Reuse Quiz' textCancel onClose={() => setModal(null)} onConfirm={() => reuseQuiz(modal.quiz)} />}
      {modal?.type === 'deleteQuestion' && <TeacherActionModal c={c} tone='red' icon='trash' title='Remove question?' message='This saved question will be removed from the question bank.' confirmLabel='Remove question' textCancel onClose={() => setModal(null)} onConfirm={() => removeQuestion(modal.question.id)} />}
      {bankTutorialStage === "intro" && <ThinkBotTutorial clickAnywhere onClickAnywhere={() => setBankTutorialStage(quizBankItems.length ? "quiz" : "switch")}><p>Looks like you’ve started building your content! Let me show you where ThinkWAVE keeps everything you save.</p></ThinkBotTutorial>}
      {bankTutorialStage === "quiz" && <ThinkBotTutorial target='[data-tutorial="bank-quiz-card"]' clickAnywhere onClickAnywhere={() => setBankTutorialStage("switch")}><p>Your <strong>Quiz Bank</strong> keeps your saved quizzes ready to reuse.</p><p>Open a saved quiz to review it, reuse it, or make changes without starting from scratch.</p></ThinkBotTutorial>}
      {bankTutorialStage === "switch" && <ThinkBotTutorial target='[data-tutorial="bank-question-toggle"]' clickAnywhere allowTargetInteraction={false} onClickAnywhere={openQuestionBank}><p>Open your <strong>Question Bank</strong> to see saved individual questions.</p></ThinkBotTutorial>}
      {bankTutorialStage === "question" && <ThinkBotTutorial target='[data-tutorial="bank-question-toggle"]' clickAnywhere allowTargetInteraction={false} onClickAnywhere={() => setBankTutorialStage("question_more")}><p>Your <strong>Question Bank</strong> works the same way for individual questions.</p></ThinkBotTutorial>}
      {bankTutorialStage === "question_more" && <ThinkBotTutorial target='[data-tutorial="bank-question-toggle"]' clickAnywhere onClickAnywhere={() => finishBankTutorial()}><p>Your <strong>Question Bank</strong> works the same way for individual questions.</p><p>Reusing questions can make building future activities much faster.</p></ThinkBotTutorial>}
    </>
  );
}
