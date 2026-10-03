import { templateCardChrome, templateLabel, templateTone, GAME_CHOICE_PALETTE, TRUE_FALSE_TILES } from "../../../../lib/templatePalette";
import { TwIcon } from "../../../../components/TwUI";
import { TeacherPressButton } from "../../TeacherUI";
import { buildCrosswordGrid, buildCrosswordSeed, buildCrosswordSignature } from "../../../../lib/crossword";
import { manilaDate } from "../../../../lib/dateFormat";
import { tabCard as card, TemplateBadge, normalizeBankTemplate } from "../teacherTabShared";
import { getBankAnswers, optionLabel, optionMatchesBankValue } from "./bankTemplateUtils";
import { Clamp3 } from "../../../../lib/fitText";

// Extracted verbatim from QuestionBankTab.jsx (no behavior change).
export function QuestionCard({ question: q, onRemove, c }) {
  const tt = normalizeBankTemplate(q.template_type);
  const tone = templateTone(tt, c, false);
  const cfg = q.config_json || {};
  const correct = q.correct_json || {};
  const isAlwaysOpen = ["GUESS_WORD_4PICS", "MATCHING", "CROSSWORD"].includes(tt);
  const answers = getBankAnswers(tt, cfg, correct);
  // Same question-area 3D box as the quiz builder (read-only here).
  const accent = tone.accent || "#2b6cff";
  const boxFill = `color-mix(in srgb, ${accent} 12%, #ffffff)`;
  const boxBase = `color-mix(in srgb, ${accent} 58%, #0f172a)`;

  return (
    <div className="tw-bank-content-card tw-bank-question-card w-full overflow-visible text-center relative" style={{ ...card(c, { padding: 0 }), ...templateCardChrome(tt, c, false) }}>
      <TeacherPressButton tone="red" className="tw-question-bank-delete" title="Remove question" aria-label="Remove question" onClick={onRemove}><TwIcon name="trash" size={19} /></TeacherPressButton>
      <div className="tw-bank-question-inner">
        <TemplateBadge label={templateLabel(tt)} tone={tone} />
        <div className="tw-bank-question-prompt tw-bank-question-prompt-3d" style={{ background: boxFill, border: `3px solid ${accent}`, borderRadius: 8, padding: "14px 16px", minHeight: 64, width: "100%", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", boxShadow: `0 6px 0 ${boxBase}, 0 18px 34px ${accent}59, inset 0 2px 0 rgba(255,255,255,.8)`, color: "#0f172a", fontWeight: 800, lineHeight: 1.5, textAlign: "center", overflowWrap: "anywhere" }}><Clamp3 style={{ width: "100%", height: "4.6em", fontSize: 19, lineHeight: 1.5, fontWeight: 800 }}>{q.prompt}</Clamp3></div>

        {tt === "MCQ" ? (cfg.mcqMode === "MODIFIED"
          ? <ModifiedMcqBankPreview cfg={cfg} correct={correct} />
          : <McqBankAnswers cfg={cfg} correct={correct} c={c} />)
          : tt === "TRUE_FALSE" ? <TrueFalseBankAnswers correct={correct} accent={accent} />
          : !isAlwaysOpen ? <div className={`tw-bank-answer-summary${answers.length === 1 ? " is-single" : ""}${tt === "CROSSWORD" ? " is-crossword" : ""}`}>
              {answers.length ? answers.map((answer, index) => <TemplateAnswer key={`${answer}-${index}`} value={answer} c={c} accent={accent} />) : <span className="text-[13px]" style={{ color: c.textMuted }}>No answer saved.</span>}
            </div> : null}

        {isAlwaysOpen && <div className="tw-bank-expanded-preview is-default-open" style={{ borderColor: tone.border, background: tone.softBg }}>
          {tt === "GUESS_WORD_4PICS" ? <GuessWordBankPreview cfg={cfg} correct={correct} c={c} tone={tone} /> : tt === "CROSSWORD" ? <CrosswordBankPreview cfg={cfg} correct={correct} c={c} tone={tone} /> : <MatchingBankPreview cfg={cfg} c={c} tone={tone} />}
        </div>}

        <div className="tw-bank-saved-date" style={{ color: c.textSub }}>Saved {manilaDate(q.saved_at)}</div>
      </div>
    </div>
  );
}

function McqBankAnswers({ cfg, correct }) {
  const options = Array.isArray(cfg.options) ? cfg.options : [];
  const values = Array.isArray(correct.choices) && correct.choices.length ? correct.choices : [correct.choice].filter(Boolean);
  return <div className="tw-bank-mcq-grid">{options.map((option, index) => {
    const label = optionLabel(option, index);
    const isCorrect = values.some((value) => optionMatchesBankValue(option, value, index));
    const oddLast = options.length % 2 === 1 && index === options.length - 1;
    const letter = String.fromCharCode(65 + index);
    const pal = GAME_CHOICE_PALETTE[index % GAME_CHOICE_PALETTE.length];
    return <div key={option?.id || `${label}-${index}`} className={`tw-bank-answer-option${isCorrect ? " is-correct" : ""}${oddLast ? " is-odd-last" : ""}`} style={{ border: `4px solid ${pal.border}`, borderRadius: 20, background: pal.face, color: pal.ink, boxShadow: isCorrect ? `0 1px 0 ${pal.base}, 0 8px 18px rgba(15,23,42,.18)` : `0 8px 0 ${pal.base}, 0 16px 28px rgba(15,23,42,.16)`, transform: isCorrect ? "translateY(5px)" : "translateY(-3px)", minHeight: 46, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, fontWeight: 900, fontSize: 16, boxSizing: "border-box" }}>
      <span style={{ width: 32, height: 32, flex: "none", borderRadius: "50%", border: `4px solid ${pal.border}`, background: pal.badge, color: pal.ink, boxShadow: `0 3px 0 ${pal.base}`, fontWeight: 1000, fontSize: 15, display: "grid", placeItems: "center" }}>{isCorrect ? <TwIcon name="check" size={15} /> : letter}</span>
      {option?.image && <img src={option.image} alt="" style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 9, flex: "none" }} />}
      <Clamp3 style={{ flex: "1 1 auto", minWidth: 0, height: "4.45em", fontSize: 17, lineHeight: 1.45 }}>{label}</Clamp3>
    </div>;
  })}</div>;
}

function ModifiedMcqBankPreview({ cfg, correct }) {
  const options = Array.isArray(cfg.options) ? cfg.options.slice(0, 4) : [];
  const values = Array.isArray(correct.choices) && correct.choices.length ? correct.choices : [correct.choice].filter(Boolean);
  return <div className="tw-bank-guess-images" style={{ width: "min(100%, 250px)", margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>{[0, 1, 2, 3].map((i) => {
    const option = options[i];
    const src = typeof option?.image === "string" ? option.image.trim() : "";
    const pal = GAME_CHOICE_PALETTE[i % GAME_CHOICE_PALETTE.length];
    const letter = String.fromCharCode(65 + i);
    const isCorrect = option && values.some((value) => optionMatchesBankValue(option, value, i));
    return <div key={option?.id || `modified-${i}`} className="aspect-square overflow-hidden grid place-items-center" title={isCorrect ? "Correct answer" : `Choice ${letter}`} style={{ position: "relative", border: `4px solid ${pal.border}`, borderRadius: 18, background: pal.face, boxShadow: isCorrect ? `0 1px 0 ${pal.base}, 0 8px 18px rgba(15,23,42,.16)` : `0 5px 0 ${pal.base}, 0 14px 26px rgba(15,23,42,.16)`, transform: isCorrect ? "translateY(3px)" : "translateY(-2px)", padding: 6, boxSizing: "border-box", overflow: "hidden" }}>
      {src ? <img src={src} alt={isCorrect ? "Correct choice" : `Choice ${letter}`} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 10, display: "block" }} /> : <span className="font-[900]" style={{ color: pal.ink, fontSize: 22 }}>?</span>}
      <span style={{ position: "absolute", top: 5, left: 5, width: 28, height: 28, borderRadius: "50%", border: `3px solid ${pal.border}`, background: pal.badge, color: pal.ink, boxShadow: `0 2px 0 ${pal.base}`, fontWeight: 1000, fontSize: 15, display: "grid", placeItems: "center", zIndex: 2 }}>{isCorrect ? <TwIcon name="check" size={15} strokeWidth={3.2} /> : letter}</span>
    </div>;
  })}</div>;
}

function TrueFalseBankAnswers({ correct, accent }) {
  const selected = String(correct.choice ?? correct.text ?? "").trim().toLowerCase();
  // Same 3D tiles as quiz builder TrueFalseEditor: green True, red False, 56px badge + check.
  return <div className="tw-bank-true-false" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, width: "100%" }}>{TRUE_FALSE_TILES.map((tile) => {
    const isCorrect = selected === String(tile.value).toLowerCase();
    return <div key={tile.value} className="tw-bank-tf-option" style={{ display: "flex", alignItems: "center", gap: 14, padding: 22, borderRadius: 20, border: `4px solid ${tile.border}`, background: tile.face, color: tile.ink, boxShadow: isCorrect ? `0 1px 0 ${tile.base}, 0 8px 18px rgba(15,23,42,.18)` : `0 8px 0 ${tile.base}, 0 16px 28px rgba(15,23,42,.16)`, transform: isCorrect ? "translateY(5px)" : "translateY(-3px)", fontWeight: 900, fontSize: 18, lineHeight: 1.45, boxSizing: "border-box", minHeight: 48 }}>
      <span style={{ width: 56, height: 56, flex: "none", borderRadius: "50%", border: `4px solid ${tile.border}`, background: tile.badge, color: tile.ink, boxShadow: `0 3px 0 ${tile.base}`, fontWeight: 1000, fontSize: 24, display: "grid", placeItems: "center" }}>{isCorrect ? <TwIcon name="check" size={22} strokeWidth={3.2} /> : tile.short}</span>
      <span style={{ flex: "1 1 auto", textAlign: "center", fontSize: 36 }}>{tile.value}</span>
    </div>;
  })}</div>;
}

function TemplateAnswer({ value, accent }) {
  const ink = accent || "#a855f7";
  return <div className="tw-bank-ident-answer-3d" style={{ background: `color-mix(in srgb, ${ink} 12%, #ffffff)`, border: `3px solid ${ink}`, borderRadius: 14, boxShadow: `0 6px 0 ${ink}, 0 18px 34px ${ink}59, inset 0 2px 0 rgba(255,255,255,.8)`, padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "center", color: "#0f172a", fontWeight: 900, lineHeight: 1.45, textAlign: "center", overflowWrap: "anywhere", boxSizing: "border-box", minHeight: 48, width: "100%" }}><Clamp3 style={{ width: "100%", height: "4.45em", fontSize: 17, lineHeight: 1.45, fontWeight: 900 }}>{value}</Clamp3></div>;
}

function GuessWordBankPreview({ cfg, correct }) {
  const images = Array.isArray(cfg.images) ? cfg.images : [];
  const answer = String(correct?.text || cfg?.target || "").trim();
  const imgCard = { border: "4px solid #35a159", borderRadius: 18, background: "#7fd09a", boxShadow: "0 6px 0 #35a159, 0 16px 28px rgba(15,23,42,.16), inset 0 2px 0 rgba(255,255,255,.5)", padding: 6, boxSizing: "border-box", overflow: "hidden" };
  const answerCard = { background: "#e7f4ec", border: "3px solid #35a159", borderRadius: 18, boxShadow: "0 6px 0 #35a159, 0 14px 28px rgba(37,117,63,.25), inset 0 2px 0 rgba(255,255,255,.7)", padding: "12px", display: "flex", alignItems: "center", justifyContent: "center", color: "#14532d", fontWeight: 900, lineHeight: 1.4, textAlign: "center", overflowWrap: "anywhere", boxSizing: "border-box", minHeight: 56, width: "100%" };
  return <div className="tw-bank-guess-expanded" style={{ display: "grid", gap: 14, justifyItems: "center" }}>
    <div className="tw-bank-guess-images" style={{ width: "min(100%, 250px)", margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>{[0, 1, 2, 3].map((i) => <div key={i} className="aspect-square overflow-hidden grid place-items-center" style={imgCard}>{images[i] ? <img src={images[i]} alt={`Clue ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 10, display: "block" }} /> : <span className="font-[900]" style={{ color: "#14532d", fontSize: 22 }}>?</span>}</div>)}</div>
    {answer && <div className="tw-bank-guess-answer" style={{ ...answerCard, width: "min(100%, 250px)", margin: "0 auto" }}><Clamp3 style={{ width: "100%", height: "4.3em", fontSize: 23, lineHeight: 1.4, fontWeight: 900 }}>{answer}</Clamp3></div>}
  </div>;
}

function CrosswordBankPreview({ cfg, correct, c, tone }) {
  const words = (Array.isArray(correct?.answers) && correct.answers.length ? correct.answers : Array.isArray(cfg?.answers) ? cfg.answers : []).map((word) => String(word || "").toUpperCase().replace(/[^A-Z]/g, "")).filter(Boolean);
  const gridSize = Math.min(12, Math.max(5, Number(cfg?.gridSize || Math.max(5, ...words.map((word) => word.length), 5))));
  const signature = `${buildCrosswordSignature({ questionId: 0, gridSize, words })}-${Number(cfg?.gridSeed || 1)}`;
  const generated = buildCrosswordGrid({ gridSize, words, seed: buildCrosswordSeed(signature) });
  const preview = Array.isArray(cfg?.grid) && cfg.grid.length === gridSize * gridSize
    ? { gridSize, grid: cfg.grid.map((letter) => String(letter || "").toUpperCase()) }
    : generated;
  const accent = tone.accent || "#0ea5e9";
  const face = `color-mix(in srgb, ${accent} 30%, #ffffff)`;
  const base = `color-mix(in srgb, ${accent} 55%, #0f172a)`;
  const ink = `color-mix(in srgb, ${accent} 72%, #0f172a)`;
  return <div className="tw-bank-crossword-expanded" style={{ display: "grid", gap: 14, justifyItems: "center" }}>
    <div className="tw-bank-crossword-preview grid place-items-center" style={{ width: "min(100%, 220px)", margin: "0 auto", padding: 10, borderRadius: 16, border: `4px solid ${accent}`, background: c.cardBg, boxShadow: `0 8px 0 color-mix(in srgb, ${accent} 58%, #0f172a), 0 18px 36px ${accent}40`, boxSizing: "border-box" }}>
      <div className="grid w-full" style={{ gridTemplateColumns: `repeat(${preview.gridSize}, minmax(0,1fr))`, gap: preview.gridSize > 9 ? 3 : 4 }}>
        {preview.grid.map((letter, index) => letter ? <span key={index} className="aspect-square grid place-items-center font-black" style={{ borderRadius: preview.gridSize > 9 ? 6 : 8, border: `2px solid ${accent}`, background: "#ffffff", boxShadow: `inset 0 3px 0 rgba(15,23,42,.10), inset 0 6px 12px color-mix(in srgb, ${accent} 18%, transparent)`, color: ink, fontSize: preview.gridSize > 9 ? 10 : 13 }}>{letter}</span> : <span key={index} className="aspect-square" style={{ borderRadius: preview.gridSize > 9 ? 6 : 8, border: `1px solid ${c.border}`, background: "transparent" }} />)}
      </div>
    </div>
    <div className="tw-bank-crossword-word-list" style={{ width: "min(100%, 260px)", margin: "0 auto", display: "grid", gap: 8 }}>
      {words.map((word, index) => <div key={`${word}-${index}`} className="tw-bank-crossword-word" style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 8, border: `4px solid ${accent}`, borderRadius: 14, background: face, boxShadow: `0 5px 0 ${base}, 0 12px 24px rgba(15,23,42,.14)`, boxSizing: "border-box" }}><span style={{ color: ink, fontWeight: 900, fontSize: 14, overflowWrap: "anywhere", textAlign: "center" }}>{word}</span></div>)}
    </div>
  </div>;
}

function MatchingBankPreview({ cfg, c, tone }) {
  const colA = Array.isArray(cfg.colA) ? cfg.colA : [];
  const colB = Array.isArray(cfg.colB) ? cfg.colB : [];
  const pairs = colA.map((item, i) => [item, colB[i]]);
  const configuredDummies = Array.isArray(cfg.dummyB) ? cfg.dummyB : [];
  const distractors = configuredDummies.length ? configuredDummies : colB.slice(colA.length);
  const accent = tone.accent || "#f97316";
  const outer3d = { border: `3px solid ${accent}`, borderRadius: 18, background: `color-mix(in srgb, ${accent} 12%, #ffffff)`, boxShadow: `0 6px 0 ${accent}, 0 14px 28px ${accent}40, inset 0 2px 0 rgba(255,255,255,.6)`, padding: 10, display: "grid", gap: 8, boxSizing: "border-box" };
  const inset3d = { background: "#ffffff", border: `3px solid ${accent}`, borderRadius: 12, boxShadow: `inset 0 4px 0 rgba(15,23,42,.10), inset 0 10px 20px color-mix(in srgb, ${accent} 16%, transparent)`, color: "#0f172a", padding: "8px 10px", boxSizing: "border-box" };
  return <div className="tw-bank-matching-preview" style={{ display: "grid", gap: 12 }}>
    {pairs.length > 0 && <div style={outer3d}>
      <div className="tw-bank-matching-column-labels">
        <span>Column A</span><span aria-hidden="true" /><span>Column B</span>
      </div>
      {pairs.map(([a, b], i) => <div key={`pair-${i}`} className="tw-bank-matching-row">
        <div style={inset3d}><MiniBankItem item={a} fallback={`Item ${i + 1}`} c={c} ink="#0f172a" /></div>
        <div className="tw-bank-matching-arrow" style={{ color: accent }}>&lt;-&gt;</div>
        <div style={inset3d}><MiniBankItem item={b} fallback={`Match ${i + 1}`} c={c} ink="#0f172a" /></div>
      </div>)}
    </div>}
    {distractors.length > 0 && <div style={outer3d}>
      <div className="text-[11px] font-[950] uppercase" style={{ color: accent }}>Distractors</div>
      <div className="grid gap-[8px] mt-[5px]">
        {distractors.map((item, i) => <div key={`d-${i}`} style={{ ...inset3d, borderStyle: "solid" }}><MiniBankItem item={item} fallback={`Distractor ${i + 1}`} c={c} ink="#0f172a" /></div>)}
      </div>
    </div>}
  </div>;
}

function MiniBankItem({ item, fallback, c, ink }) {
  const obj = item && typeof item === "object" ? item : { text: String(item || "") };
  const text = String(obj.text || obj.label || "").trim();
  return <div className="flex items-center justify-center gap-[7px] min-w-0 text-center">{obj.image ? <img src={obj.image} alt="" className="w-[42px] h-[42px] rounded-[8px] object-cover shrink-0" /> : null}{(text || !obj.image) && <Clamp3 style={{ flex: "1 1 auto", minWidth: 0, height: "4.45em", fontSize: 17, lineHeight: 1.45, fontWeight: 800, color: ink || c.text }}>{text || fallback}</Clamp3>}</div>;
}
