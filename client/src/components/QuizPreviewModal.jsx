import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { useColors, useTheme } from "../context/ThemeContext";
import { normalizeTemplateType } from "../lib/templateTypes";
import { templateTone, GAME_CHOICE_PALETTE, TRUE_FALSE_TILES } from "../lib/templatePalette";
import { buildCrosswordGrid, buildCrosswordSeed, buildCrosswordSignature, resolveCrosswordWordBank } from "../lib/crossword";
import { fitCappedLines } from "../pages/teacher/quiz-builder/quizBuilderUtils";
import { TwLogoLoader } from "./TwLogoLoader";

function safeJson(v) {
  if (!v) return {};
  if (typeof v === "object") return v;
  try { return JSON.parse(v) || {}; } catch { return {}; }
}

function optionText(option, index = 0) {
  if (option && typeof option === "object") return String(option.text ?? option.label ?? option.value ?? "").trim() || "";
  return String(option ?? "").trim() || "";
}

function normalizeOption(option, index = 0) {
  if (option && typeof option === "object") return { id: String(option.id ?? option.value ?? `option-${index + 1}`), text: optionText(option, index), image: option.image || "" };
  return { id: `option-${index + 1}`, text: optionText(option, index), image: "" };
}

function isCorrectOption(option, correct) {
  const values = Array.isArray(correct?.choices) && correct.choices.length ? correct.choices : [correct?.choice].filter(Boolean);
  return values.some((value) => String(value) === String(option.id) || String(value).trim().toLowerCase() === String(option.text).trim().toLowerCase());
}

function AnswerChip({ children, accent }) {
  return <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 13px", borderRadius: 13, border: "2px solid #22c55e", background: "rgba(34,197,94,.10)", color: "#15803d", fontWeight: 900 }}><span style={{ width: 20, height: 20, borderRadius: 999, display: "grid", placeItems: "center", background: "#22c55e", color: "#fff", fontSize: 12 }}>✓</span><span style={{ color: accent || "#15803d" }}>{children}</span></div>;
}

// Builder guessword answer container (green 3D), reused for guess/crossword preview answers.
function BuilderGuessAnswer({ children }) {
  return (
    <div style={{ background: "#e7f4ec", border: "3px solid #35a159", borderRadius: 20, boxShadow: "0 6px 0 #25753f, 0 14px 28px rgba(37,117,63,.25), inset 0 2px 0 rgba(255,255,255,.7)", padding: "12px 14px", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#14532d", fontWeight: 900, fontSize: 22, lineHeight: 1.4, textAlign: "center", fontFamily: "inherit", overflowWrap: "anywhere" }}>
      {children}
    </div>
  );
}

// Builder identification answer well (white inset, 3D inverted), one per answer in a row.
function BuilderIdentAnswer({ children, accent }) {
  return (
    <div style={{ flex: "1 1 0", minWidth: 0, background: "#ffffff", border: `3px solid ${accent}`, borderRadius: 14, boxShadow: `inset 0 4px 0 rgba(15,23,42,.10), inset 0 10px 20px color-mix(in srgb, ${accent} 16%, transparent)`, padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "center", color: "#0f172a", fontWeight: 900, fontSize: 22, lineHeight: 1.45, textAlign: "center", fontFamily: "inherit", overflowWrap: "anywhere" }}>
      {children}
    </div>
  );
}

// Builder-like fixed prompt: fixed container, auto next-lines + shrink to fit, template color coded.
function PreviewPrompt({ text, accent }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (el) fitCappedLines(el, { maxSize: 24, minSize: 13, maxLines: 3, maxHeight: 108 });
  }, [text]);
  return (
    <div className="tw-builder-prompt-box" style={{ background: `color-mix(in srgb, ${accent} 12%, #ffffff)`, borderRadius: 8, padding: "20px 24px", minHeight: 130, maxHeight: 170, marginBottom: 14, border: `3px solid ${accent}`, boxShadow: `0 6px 0 color-mix(in srgb, ${accent} 58%, #0f172a), 0 18px 34px ${accent}59, inset 0 2px 0 rgba(255,255,255,.8)`, boxSizing: "border-box", display: "flex", flexDirection: "column", alignItems: "stretch", justifyContent: "center", overflow: "hidden" }}>
      <div
        ref={ref}
        style={{
          width: "100%", boxSizing: "border-box", fontSize: 20, fontWeight: 800, color: "#0f172a",
          textAlign: "center", fontFamily: "inherit", whiteSpace: "pre-wrap", overflow: "hidden", lineHeight: 1.5, margin: 0,
        }}
      >
        {text}
      </div>
    </div>
  );
}

function PreviewChoiceText({ text }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (el) fitCappedLines(el, { maxSize: 22, minSize: 12, maxLines: 3, maxHeight: 80 });
  }, [text]);
  return (
    <div
      ref={ref}
      style={{
        width: "100%", boxSizing: "border-box", lineHeight: 1.45, color: "inherit",
        fontWeight: 900, fontSize: 18, fontFamily: "inherit", textAlign: "center",
        overflow: "hidden", overflowWrap: "anywhere",
      }}
    >
      {text}
    </div>
  );
}

export default function QuizPreviewModal({ quiz, onClose }) {
  const [questions, setQuestions] = useState([]);
  const [qIndex, setQIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const c = useColors();
  const { dark } = useTheme();

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.get(`/quizzes/${quiz.id}`)
      .then(({ data }) => { if (alive) setQuestions(data.questions || []); })
      .catch(console.error)
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [quiz.id]);

  const currentQ = questions[qIndex] || null;
  const cfg = safeJson(currentQ?.config_json);
  const correct = safeJson(currentQ?.correct_json);
  const tone = templateTone(quiz.template_type, c, false);

  // Mobile: fully hide the pill-shaped bottom tab bar while this preview is
  // open (see .tw-preview-modal-open in styles.css), instead of relying on
  // the backdrop's translucency to sit on top of it.
  useEffect(() => {
    document.body.classList.add("tw-mobile-modal-open");
    return () => document.body.classList.remove("tw-mobile-modal-open");
  }, []);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 9200, display: "grid", placeItems: "center", padding: 20, background: dark ? "rgba(0,0,0,.70)" : "rgba(15,23,42,.48)", backdropFilter: "blur(8px)" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(95vw, 780px)", maxHeight: "90vh", background: c.cardBg, border: `1.5px solid ${tone.border}`, borderRadius: 22, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: `0 30px 80px ${tone.accent}28` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", background: tone.softBg, borderBottom: `1px solid ${tone.border}` }}>
          <span style={{ fontWeight: 900, fontSize: 15, color: tone.accent }}>👁 Preview</span>
          <button onClick={onClose} style={{ padding: "10px 16px", borderRadius: 12, border: `4px solid ${tone.accent}`, background: tone.accent, color: "#fff", fontWeight: 1000, fontSize: 14, cursor: "pointer", boxShadow: `0 5px 0 color-mix(in srgb, ${tone.accent} 62%, #000)` }}><span>Close</span></button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          {loading && <TwLogoLoader minHeight="20vh" />}
          {!loading && questions.length === 0 && <div style={{ textAlign: "center", padding: 40, color: c.textMuted }}>No questions yet.</div>}
          {!loading && currentQ && <div>
            <PreviewPrompt text={currentQ.prompt} accent={tone.accent} />
            {cfg.showPromptImage !== false && cfg.promptImage ? <div style={{ display: "grid", placeItems: "center", margin: "0 auto 16px" }}><img src={cfg.promptImage} alt="Question" style={{ display: "block", width: "min(100%, 320px)", aspectRatio: "1", objectFit: "cover", borderRadius: 20, border: `4px solid ${tone.accent}`, background: tone.softBg, boxShadow: `0 8px 0 color-mix(in srgb, ${tone.accent} 58%, #0f172a)` }} /></div> : null}
            <PreviewBody templateType={quiz.template_type} cfg={cfg} correct={correct} c={c} tone={tone} questionId={currentQ.id} />
          </div>}
        </div>
        {!loading && questions.length > 0 && <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 24px", borderTop: `1px solid ${tone.border}`, background: tone.softBg }}>
          <button style={{ padding: "10px 16px", borderRadius: 12, border: `4px solid ${tone.accent}`, background: tone.accent, color: "#fff", fontWeight: 1000, fontSize: 14, cursor: "pointer", boxShadow: `0 5px 0 color-mix(in srgb, ${tone.accent} 62%, #000)`, visibility: qIndex === 0 ? "hidden" : "visible" }} onClick={() => setQIndex((i) => i - 1)}>‹ Previous</button>
          <span style={{ fontSize: 15, color: c.text, fontWeight: 900 }}>{qIndex + 1} / {questions.length}</span>
          <button style={{ padding: "10px 16px", borderRadius: 12, border: `4px solid ${tone.accent}`, background: tone.accent, color: "#fff", fontWeight: 1000, fontSize: 14, cursor: "pointer", boxShadow: `0 5px 0 color-mix(in srgb, ${tone.accent} 62%, #000)`, visibility: qIndex === questions.length - 1 ? "hidden" : "visible" }} onClick={() => setQIndex((i) => i + 1)}>Next ›</button>
        </div>}
      </div>
    </div>
  );
}

function PreviewBody({ templateType, cfg, correct, c, tone }) {
  const tt = normalizeTemplateType(templateType);
  const options = (Array.isArray(cfg.options) ? cfg.options : tt === "TRUE_FALSE" ? ["True", "False"] : []).map(normalizeOption);
  const labels = "ABCDEFGHIJ".split("");

  if (tt === "MCQ" || tt === "TRUE_FALSE") {
    const isModified = cfg.mcqMode === "MODIFIED";
    const twoAns = cfg.answerMode === "TWO";
    const isTF = tt === "TRUE_FALSE";
    return <div className="tw-preview-mcq-grid" style={{ display: "grid", gridTemplateColumns: isModified ? "repeat(2,minmax(0,1fr))" : "1fr 1fr", gap: isModified ? 8 : 14 }}>
      {options.map((option, i) => {
        const right = isCorrectOption(option, correct);
        const tfTile = isTF ? TRUE_FALSE_TILES[i % TRUE_FALSE_TILES.length] : null;
        const pal = tfTile ? { face: tfTile.face, base: tfTile.base, border: tfTile.border, ink: tfTile.ink, badge: tfTile.badge } : GAME_CHOICE_PALETTE[i % GAME_CHOICE_PALETTE.length];
        const letter = isTF ? tfTile.short : String.fromCharCode(65 + i);
        if (isModified) {
          return <div key={option.id || i} className="tw-preview-mcq-modified" style={{ position: "relative", border: `4px solid ${pal.border}`, borderRadius: 20, background: pal.face, color: pal.ink, boxShadow: right ? `0 1px 0 ${pal.base}, 0 8px 18px rgba(15,23,42,.18)` : `0 8px 0 ${pal.base}, 0 16px 28px rgba(15,23,42,.16)`, transform: right ? "translateY(5px)" : "translateY(-3px)", padding: 8, display: "grid", gap: 8, minWidth: 0 }}>
            <span className="tw-preview-mcq-dot" style={{ position: "absolute", left: 20, top: 20, width: 34, height: 34, display: "grid", placeItems: "center", borderRadius: twoAns ? 12 : "50%", border: `4px solid ${pal.border}`, background: pal.badge, color: pal.ink, boxShadow: `0 4px 12px rgba(15,23,42,.18)`, fontSize: 15, fontWeight: 1000, zIndex: 1 }}>{right ? <span style={{ fontSize: 15, lineHeight: 1 }}>✓</span> : letter}</span>
            {option.image ? <img src={option.image} alt="" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 12 }} /> : null}
            {option.text ? <PreviewChoiceText text={option.text} ink={pal.ink} /> : null}
          </div>;
        }
        const spanCentered = options.length % 2 === 1 && i === options.length - 1;
        return <div key={option.id || i} className={`tw-preview-mcq-normal${spanCentered ? " tw-preview-choice-span" : ""}`} style={{ border: `4px solid ${pal.border}`, borderRadius: 20, background: pal.face, color: pal.ink, boxShadow: right ? `0 1px 0 ${pal.base}, 0 8px 18px rgba(15,23,42,.18)` : `0 8px 0 ${pal.base}, 0 16px 28px rgba(15,23,42,.16)`, transform: right ? "translateY(5px)" : "translateY(-3px)", display: "flex", alignItems: "center", gap: 14, padding: 22, ...(spanCentered ? { gridColumn: "1 / -1", justifySelf: "center", width: "calc(50% - 6px)", boxSizing: "border-box" } : null) }}>
          <span style={{ width: 56, height: 56, flex: "none", borderRadius: twoAns ? 12 : "50%", border: `4px solid ${pal.border}`, background: pal.badge, color: pal.ink, boxShadow: `0 3px 0 ${pal.base}`, fontWeight: 1000, fontSize: 24, display: "grid", placeItems: "center" }}>{right ? <span style={{ fontSize: 22, lineHeight: 1 }}>✓</span> : letter}</span>
          <div style={{ flex: "1 1 auto", minWidth: 0 }}>
            {option.text ? <PreviewChoiceText text={option.text} ink={pal.ink} /> : null}
            {option.image ? <img src={option.image} alt="" style={{ width: 140, height: 140, aspectRatio: "1", objectFit: "cover", borderRadius: 12, display: "block", margin: "10px auto 0" }} /> : null}
          </div>
        </div>;
      })}
    </div>;
  }

  if (tt === "TYPE_ANSWER") {
    const answers = [correct.text, ...(Array.isArray(correct.answers) ? correct.answers : [])].filter(Boolean);
    if (!answers.length) return <div style={{ textAlign: "center", color: c.textMuted }}>No answer set.</div>;
    return <div style={{ display: "flex", gap: 8, flexWrap: "nowrap" }}>{answers.slice(0, 3).map((answer, i) => <BuilderIdentAnswer key={i} accent={tone.accent}>{answer}</BuilderIdentAnswer>)}</div>;
  }

  if (tt === "MATCHING") {
    const colA = Array.isArray(cfg.colA) ? cfg.colA : [];
    const colB = Array.isArray(cfg.colB) ? cfg.colB : [];
    const pairCount = colA.length;
    return <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gap: 12 }}>{colA.map((a, i) => <div key={i} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 32px minmax(0,1fr)", alignItems: "stretch", gap: 10, padding: 14, borderRadius: 20, border: `3px solid ${tone.accent}`, background: tone.softBg, boxShadow: `0 6px 0 color-mix(in srgb, ${tone.accent} 58%, #0f172a), 0 14px 28px ${tone.accent}40` }}><div style={{ background: "#ffffff", border: `3px solid ${tone.accent}`, borderRadius: 14, padding: 12, display: "grid", placeItems: "center" }}><PreviewItem item={a} fallback={`Item ${i + 1}`} c={c} /></div><span style={{ alignSelf: "center", textAlign: "center", color: tone.accent, fontWeight: 900 }}>⇄</span><div style={{ background: "#ffffff", border: `3px solid ${tone.accent}`, borderRadius: 14, padding: 12, display: "grid", placeItems: "center" }}><PreviewItem item={colB[i]} fallback={`Match ${i + 1}`} c={c} correct /></div></div>)}</div>
      {colB.length > pairCount && <div><div style={{ color: tone.accent, fontSize: 12, fontWeight: 900, marginBottom: 7, textAlign: "center" }}>Dummy answers</div><div style={{ display: "grid", gap: 12 }}>{colB.slice(pairCount).map((item, i) => <div key={i} style={{ padding: 14, borderRadius: 8, border: `3px solid ${tone.accent}`, background: `color-mix(in srgb, ${tone.accent} 12%, #ffffff)`, boxShadow: `0 6px 0 color-mix(in srgb, ${tone.accent} 58%, #0f172a)` }}><PreviewItem item={item} fallback={`Dummy ${i + 1}`} c={c} /></div>)}</div></div>}
    </div>;
  }

  if (tt === "GUESS_WORD_4PICS") {
    const images = Array.isArray(cfg.images) ? cfg.images : [];
    const answer = correct.text || cfg.target || "";
    return <div style={{ display: "grid", placeItems: "center", gap: 14 }}><div style={{ width: "min(100%, 360px)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>{[0,1,2,3].map((i) => <div key={i} style={{ border: "4px solid #35a159", borderRadius: 20, background: "#7fd09a", boxShadow: "0 8px 0 #25753f, 0 16px 28px rgba(15,23,42,.16)", padding: 8, aspectRatio: "1", overflow: "hidden", boxSizing: "border-box", display: "grid", placeItems: "center" }}>{images[i] ? <img src={images[i]} alt={`Clue ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 12 }} /> : <span style={{ color: "#14532d", fontWeight: 900 }}>?</span>}</div>)}</div>{answer ? <BuilderGuessAnswer>{answer}</BuilderGuessAnswer> : null}</div>;
  }

  if (tt === "CROSSWORD") {
    const words = resolveCrosswordWordBank({ config: cfg, correct });
    const size = Math.min(12, Math.max(5, Number(cfg.gridSize || 8)));
    const signature = `${buildCrosswordSignature({ questionId: 0, gridSize: size, words })}-${Number(cfg.gridSeed || 0)}`;
    const generated = buildCrosswordGrid({ gridSize: size, words, seed: buildCrosswordSeed(signature) });
    const built = Array.isArray(cfg.grid) && cfg.grid.length === size * size ? { gridSize: size, grid: cfg.grid.map((ch) => String(ch || "").toUpperCase()) } : generated;
    return <div style={{ display: "grid", placeItems: "center", gap: 14 }}><div style={{ width: "min(100%, 390px)", display: "grid", gridTemplateColumns: `repeat(${built.gridSize}, minmax(0,1fr))`, gap: 4, padding: 10, borderRadius: 20, background: tone.softBg, border: `4px solid ${tone.accent}`, boxShadow: `0 8px 0 color-mix(in srgb, ${tone.accent} 58%, #0f172a)` }}>{built.grid.map((ch, i) => <div key={i} style={{ aspectRatio: "1", display: "grid", placeItems: "center", borderRadius: 7, background: "#fff", border: `1px solid ${tone.accent}`, color: tone.accent, fontWeight: 900, fontSize: built.gridSize > 9 ? 11 : 14 }}>{ch}</div>)}</div><div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>{words.map((word) => <BuilderGuessAnswer key={word}>{word}</BuilderGuessAnswer>)}</div></div>;
  }

  return null;
}

function PreviewItem({ item, fallback, c, correct = false }) {
  const value = item && typeof item === "object" ? item : { text: String(item || "") };
  return <div style={{ display: "grid", placeItems: "center", gap: 8, minWidth: 0, textAlign: "center" }}>{value.image ? <img src={value.image} alt="" style={{ width: 140, height: 140, aspectRatio: "1", objectFit: "cover", borderRadius: 12 }} /> : null}<span style={{ color: correct ? "#15803d" : "#0f172a", fontWeight: 900, fontSize: 18, overflowWrap: "anywhere" }}>{String(value.text || value.label || fallback)}</span>{correct ? <span style={{ color: "#22c55e", fontWeight: 900 }}>✓</span> : null}</div>;
}
