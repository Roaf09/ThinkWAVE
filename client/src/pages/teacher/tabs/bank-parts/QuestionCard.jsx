import { templateCardChrome, templateLabel, templateTone } from "../../../../lib/templatePalette";
import { TwIcon } from "../../../../components/TwUI";
import { TeacherPressButton } from "../../TeacherUI";
import { buildThinkSpellGrid, buildThinkSpellSeed, buildThinkSpellSignature } from "../../../../lib/thinkSpell";
import { manilaDate } from "../../../../lib/dateFormat";
import { tabCard as card, TemplateBadge, normalizeBankTemplate } from "../teacherTabShared";
import { getBankAnswers, optionLabel, optionMatchesBankValue } from "./bankTemplateUtils";

// Extracted verbatim from QuestionBankTab.jsx (no behavior change).
export function QuestionCard({ question: q, onRemove, c }) {
  const tt = normalizeBankTemplate(q.template_type);
  const tone = templateTone(tt, c, false);
  const cfg = q.config_json || {};
  const correct = q.correct_json || {};
  const isAlwaysOpen = ["GUESS_WORD_4PICS", "MATCHING", "THINK_SPELL"].includes(tt);
  const answers = getBankAnswers(tt, cfg, correct);

  return (
    <div className="tw-bank-content-card tw-bank-question-card w-full overflow-visible text-center relative" style={{ ...card(c, { padding: 0 }), ...templateCardChrome(tt, c, false) }}>
      <TeacherPressButton tone="red" className="tw-question-bank-delete" title="Remove question" aria-label="Remove question" onClick={onRemove}><TwIcon name="trash" size={19} /></TeacherPressButton>
      <div className="tw-bank-question-inner">
        <TemplateBadge label={templateLabel(tt)} tone={tone} />
        <div className="tw-bank-question-prompt" style={{ color: c.text }}>{q.prompt}</div>

        {tt === "MCQ" ? <McqBankAnswers cfg={cfg} correct={correct} c={c} />
          : tt === "TRUE_FALSE" ? <TrueFalseBankAnswers correct={correct} c={c} />
          : !isAlwaysOpen ? <div className={`tw-bank-answer-summary${answers.length === 1 ? " is-single" : ""}${tt === "THINK_SPELL" ? " is-think-spell" : ""}`}>
              {answers.length ? answers.map((answer, index) => <TemplateAnswer key={`${answer}-${index}`} value={answer} c={c} />) : <span className="text-[13px]" style={{ color: c.textMuted }}>No answer saved.</span>}
            </div> : null}

        {isAlwaysOpen && <div className="tw-bank-expanded-preview is-default-open" style={{ borderColor: tone.border, background: tone.softBg }}>
          {tt === "GUESS_WORD_4PICS" ? <GuessWordBankPreview cfg={cfg} correct={correct} c={c} tone={tone} /> : tt === "THINK_SPELL" ? <ThinkSpellBankPreview cfg={cfg} correct={correct} c={c} tone={tone} /> : <MatchingBankPreview cfg={cfg} c={c} tone={tone} />}
        </div>}

        <div className="tw-bank-saved-date" style={{ color: c.textSub }}>Saved {manilaDate(q.saved_at)}</div>
      </div>
    </div>
  );
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

function TemplateAnswer({ value, c }) {
  return <div className="tw-bank-template-answer" style={{ borderColor: c.border, background: c.cardBg2, color: c.text }}><span>{value}</span></div>;
}

function GuessWordBankPreview({ cfg, correct, c, tone }) {
  const images = Array.isArray(cfg.images) ? cfg.images : [];
  const answer = String(correct?.text || cfg?.target || "").trim();
  return <div className="tw-bank-guess-expanded">
    <div className="tw-bank-guess-images">{[0,1,2,3].map((i) => <div key={i} className="aspect-square rounded-[10px] overflow-hidden grid place-items-center" style={{ border: `2px solid ${tone.border}`, background: c.cardBg }}>{images[i] ? <img src={images[i]} alt={`Clue ${i + 1}`} className="w-full h-full object-cover" /> : <span className="font-[900]" style={{ color: tone.accent }}>?</span>}</div>)}</div>
    {answer && <div className="tw-bank-guess-answer" style={{ borderColor: c.border, background: c.cardBg2, color: c.text }}>{answer}</div>}
  </div>;
}

function ThinkSpellBankPreview({ cfg, correct, c, tone }) {
  const words = (Array.isArray(correct?.answers) && correct.answers.length ? correct.answers : Array.isArray(cfg?.answers) ? cfg.answers : []).map((word) => String(word || "").toUpperCase().replace(/[^A-Z]/g, "")).filter(Boolean);
  const gridSize = Math.min(12, Math.max(5, Number(cfg?.gridSize || Math.max(5, ...words.map((word) => word.length), 5))));
  const signature = `${buildThinkSpellSignature({ questionId: 0, gridSize, words })}-${Number(cfg?.gridSeed || 1)}`;
  const generated = buildThinkSpellGrid({ gridSize, words, seed: buildThinkSpellSeed(signature) });
  const preview = Array.isArray(cfg?.grid) && cfg.grid.length === gridSize * gridSize
    ? { gridSize, grid: cfg.grid.map((letter) => String(letter || "").toUpperCase()) }
    : generated;
  return <div className="tw-bank-crossword-expanded">
    <div className="tw-bank-thinkspell-preview" style={{ borderColor: tone.border, gridTemplateColumns: `repeat(${preview.gridSize}, minmax(0,1fr))` }}>
      {preview.grid.map((letter, index) => <span key={index} style={{ background: c.cardBg, borderColor: tone.border, color: tone.accent }}>{letter}</span>)}
    </div>
    <div className="tw-bank-crossword-word-list">
      {words.map((word, index) => <div key={`${word}-${index}`} className="tw-bank-crossword-word" style={{ borderColor: c.border, background: c.cardBg2, color: c.text }}>{word}</div>)}
    </div>
  </div>;
}

function MatchingBankPreview({ cfg, c, tone }) {
  const colA = Array.isArray(cfg.colA) ? cfg.colA : [];
  const colB = Array.isArray(cfg.colB) ? cfg.colB : [];
  const pairs = colA.map((item, i) => [item, colB[i]]);
  const configuredDummies = Array.isArray(cfg.dummyB) ? cfg.dummyB : [];
  const distractors = configuredDummies.length ? configuredDummies : colB.slice(colA.length);
  return <div className="tw-bank-matching-preview">
    {pairs.length > 0 && <div className="tw-bank-matching-column-labels">
      <span>Column A</span><span aria-hidden="true"/><span>Column B</span>
    </div>}
    {pairs.map(([a,b], i) => <div key={`pair-${i}`} className="tw-bank-matching-row">
      <div className="p-[10px] rounded-[12px]" style={{ background: c.cardBg2, border: `2px solid ${c.border}` }}><MiniBankItem item={a} fallback={`Item ${i + 1}`} c={c} /></div>
      <div className="tw-bank-matching-arrow" style={{ color: tone.accent }}>&lt;-&gt;</div>
      <div className="p-[10px] rounded-[12px]" style={{ background: c.cardBg2, border: `2px solid ${c.border}` }}><MiniBankItem item={b} fallback={`Match ${i + 1}`} c={c} /></div>
    </div>)}
    {distractors.length > 0 && <div className="grid gap-[8px] mt-[5px]">
      <div className="text-[11px] font-[950] uppercase" style={{ color: c.textMuted }}>Distractors</div>
      {distractors.map((item, i) => <div key={`d-${i}`} className="p-[10px] rounded-[12px]" style={{ background: c.cardBg2, border: `2px dashed ${c.border}` }}><MiniBankItem item={item} fallback={`Distractor ${i + 1}`} c={c} /></div>)}
    </div>}
  </div>;
}

function MiniBankItem({ item, fallback, c }) {
  const obj = item && typeof item === "object" ? item : { text: String(item || "") };
  const text = String(obj.text || obj.label || "").trim();
  return <div className="flex items-center justify-center gap-[7px] min-w-0 text-center">{obj.image ? <img src={obj.image} alt="" className="w-[42px] h-[42px] rounded-[8px] object-cover shrink-0" /> : null}{(text || !obj.image) && <span className="font-[800] break-anywhere" style={{ color: c.text }}>{text || fallback}</span>}</div>;
}
