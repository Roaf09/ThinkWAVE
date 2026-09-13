import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { templateCardChrome, templateLabel, templateTone } from "../../../../lib/templatePalette";
import { TeacherPressButton } from "../../TeacherUI";
import { tabCard as card, tabMenuBtn as menuBtn, Badge, TemplateBadge } from "../teacherTabShared";

// Extracted verbatim from QuestionBankTab.jsx (no behavior change).
export function QuizBankCard({ quiz, onPreview, onDelete, onReuse, c, isMobile = false }) {
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
    <div className={`tw-bank-content-card tw-bank-quiz-card${isMobile ? " is-mobile-card" : ""}`} data-tutorial="bank-quiz-card" style={{ ...card(c), ...templateCardChrome(quiz.template_type, c, false) }}>
      <div className="tw-bank-card-main" style={isMobile ? { textAlign: "left", justifyItems: "start" } : undefined}>
        <div className="tw-bank-card-title w-full" style={{ color: c.text, textAlign: isMobile ? "left" : undefined }}>{quiz.title}</div>
        <div className="tw-bank-card-badges" style={isMobile ? { justifyContent: "flex-start" } : undefined}>
          <TemplateBadge label={templateLabel(quiz.template_type)} tone={tone} />
          <Badge label={quiz.category === "K12" ? "K-12" : "College"} c={c} tone="yellow" />
          <Badge label={`${questionCount} question${questionCount === 1 ? "" : "s"}`} c={c} tone="blue" />
          <Badge label={`${totalScore} total point${totalScore === 1 ? "" : "s"}`} c={c} tone="green" />
        </div>
      </div>
      <div className="tw-bank-card-actions" style={isMobile ? { justifyContent: "flex-end", width: "100%" } : undefined}>
        {!isMobile && <button onClick={() => { setMoreOpen(false); onPreview(); }} className="tw-analytics-text-link tw-bank-preview-link" style={{ color: c.accent }}>Preview</button>}
        <TeacherPressButton tone="blue" onClick={onReuse}>Reuse</TeacherPressButton>
        <div data-bank-more={quiz.id} className="relative">
          <button aria-label="More actions" title="More actions" onClick={() => setMoreOpen((value) => !value)} className="tw-bank-more-button">⋮</button>
          {moreOpen && <div className="absolute right-0 top-[calc(100%_+_8px)] w-[200px]" style={{ zIndex: 1200, ...card(c, { padding: 8, boxShadow: "0 22px 50px rgba(15,23,42,.24)" }) }}>
            {isMobile && <button onClick={() => { setMoreOpen(false); onPreview(); }} style={menuBtn(c)}>Preview</button>}
            <button onClick={() => { setMoreOpen(false); navigate(`/teacher/quizzes/${quiz.id}/builder`); }} style={menuBtn(c)}>Edit</button>
            <button onClick={() => { setMoreOpen(false); onDelete(); }} style={{ ...menuBtn(c), color: c.redFg }}>Delete</button>
          </div>}
        </div>
      </div>
    </div>
  );
}
