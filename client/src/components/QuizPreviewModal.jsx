import React, { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useColors, useTheme } from "../context/ThemeContext";
import { normalizeTemplateType } from "../lib/templateTypes";
import { templateTone } from "../lib/templatePalette";
import { buildThinkSpellGrid, buildThinkSpellSeed, buildThinkSpellSignature, resolveThinkSpellWordBank } from "../lib/thinkSpell";

function safeJson(v) {
  if (!v) return {};
  if (typeof v === "object") return v;
  try { return JSON.parse(v) || {}; } catch { return {}; }
}

function optionText(option, index = 0) {
  if (option && typeof option === "object") return String(option.text ?? option.label ?? option.value ?? "").trim() || (option.image ? `Image choice ${index + 1}` : `Option ${index + 1}`);
  return String(option ?? "").trim() || `Option ${index + 1}`;
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

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 9200, display: "grid", placeItems: "center", padding: 20, background: dark ? "rgba(0,0,0,.70)" : "rgba(15,23,42,.48)", backdropFilter: "blur(8px)" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(95vw, 780px)", maxHeight: "90vh", background: c.cardBg, border: `1.5px solid ${tone.border}`, borderRadius: 22, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: `0 30px 80px ${tone.accent}28` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", background: tone.softBg, borderBottom: `1px solid ${tone.border}` }}>
          <span style={{ fontWeight: 900, fontSize: 15, color: tone.accent }}>👁 Preview</span>
          <button onClick={onClose} style={{ padding: "9px 13px", borderRadius: 12, border: `1px solid ${c.border}`, background: c.cardBg, color: c.text, fontWeight: 800, cursor: "pointer" }}>✕ Close</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          {loading && <div style={{ textAlign: "center", padding: 40, color: c.textMuted }}>Loading questions…</div>}
          {!loading && questions.length === 0 && <div style={{ textAlign: "center", padding: 40, color: c.textMuted }}>No questions yet.</div>}
          {!loading && currentQ && <div>
            <div style={{ background: tone.softBg, borderRadius: 12, padding: "10px 16px", marginBottom: 12, display: "flex", justifyContent: "flex-end" }}><span style={{ color: c.textMuted, fontSize: 13 }}>Q {qIndex + 1} of {questions.length}</span></div>
            <div style={{ background: `linear-gradient(135deg, ${tone.softBg}, ${c.cardBg2})`, border: `1px solid ${tone.border}`, borderRadius: 16, padding: "18px 20px", fontSize: 16, fontWeight: 900, lineHeight: 1.6, color: tone.accent, marginBottom: 14, textAlign: "center" }}>{currentQ.prompt}</div>
            {cfg.showPromptImage !== false && cfg.promptImage ? <img src={cfg.promptImage} alt="Question" style={{ display: "block", width: "min(100%, 460px)", maxHeight: 260, objectFit: "contain", margin: "0 auto 16px", borderRadius: 16, border: `1px solid ${tone.border}`, background: c.cardBg2 }} /> : null}
            <PreviewBody templateType={quiz.template_type} cfg={cfg} correct={correct} c={c} tone={tone} questionId={currentQ.id} />
          </div>}
        </div>
        {!loading && questions.length > 0 && <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 24px", borderTop: `1px solid ${tone.border}`, background: tone.softBg }}>
          <button style={{ padding: "9px 13px", borderRadius: 12, border: `1px solid ${c.border}`, background: c.cardBg, color: c.text, fontWeight: 800, cursor: "pointer", visibility: qIndex === 0 ? "hidden" : "visible" }} onClick={() => setQIndex((i) => i - 1)}>‹ Previous</button>
          <span style={{ fontSize: 14, color: c.textMuted }}>{qIndex + 1} / {questions.length}</span>
          <button style={{ padding: "9px 13px", borderRadius: 12, border: `1px solid ${c.border}`, background: c.cardBg, color: c.text, fontWeight: 800, cursor: "pointer", visibility: qIndex === questions.length - 1 ? "hidden" : "visible" }} onClick={() => setQIndex((i) => i + 1)}>Next ›</button>
        </div>}
      </div>
    </div>
  );
}

function PreviewBody({ templateType, cfg, correct, c, tone, questionId }) {
  const tt = normalizeTemplateType(templateType);
  const options = (Array.isArray(cfg.options) ? cfg.options : tt === "TRUE_FALSE" ? ["True", "False"] : []).map(normalizeOption);
  const labels = "ABCDEFGHIJ".split("");

  if (tt === "MCQ" || tt === "TRUE_FALSE") {
    return <div style={{ display: "grid", gridTemplateColumns: cfg.mcqMode === "MODIFIED" ? "repeat(2,minmax(0,1fr))" : "1fr", gap: 10 }}>
      {options.map((option, i) => {
        const right = isCorrectOption(option, correct);
        return <div key={option.id || i} style={{ display: "flex", flexDirection: cfg.mcqMode === "MODIFIED" ? "column" : "row", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 14, background: right ? "rgba(34,197,94,.10)" : tone.softBg, border: `2px solid ${right ? "#22c55e" : tone.border}`, color: c.text }}>
          {option.image ? <img src={option.image} alt="" style={{ width: cfg.mcqMode === "MODIFIED" ? "100%" : 70, height: cfg.mcqMode === "MODIFIED" ? 130 : 54, objectFit: "cover", borderRadius: 10 }} /> : null}
          <span style={{ width: 32, height: 32, display: "grid", placeItems: "center", borderRadius: 9, background: right ? "#22c55e" : tone.accent, color: "#fff", fontWeight: 900, flexShrink: 0 }}>{right ? "✓" : labels[i]}</span>
          <span style={{ fontWeight: 800 }}>{option.text}</span>
        </div>;
      })}
    </div>;
  }

  if (tt === "TYPE_ANSWER" || tt === "DRAW_IT" || tt === "GRIP_GUESS") {
    const answers = [correct.text, ...(Array.isArray(correct.answers) ? correct.answers : [])].filter(Boolean);
    return <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>{answers.length ? answers.map((answer, i) => <AnswerChip key={i}>{answer}</AnswerChip>) : <span style={{ color: c.textMuted }}>No answer set.</span>}</div>;
  }

  if (tt === "MATCHING") {
    const colA = Array.isArray(cfg.colA) ? cfg.colA : [];
    const colB = Array.isArray(cfg.colB) ? cfg.colB : [];
    const pairCount = colA.length;
    return <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gap: 8 }}>{colA.map((a, i) => <div key={i} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 32px minmax(0,1fr)", alignItems: "center", gap: 10, padding: 12, borderRadius: 14, border: `1.5px solid ${tone.border}`, background: tone.softBg }}><PreviewItem item={a} fallback={`Item ${i + 1}`} c={c} /><span style={{ textAlign: "center", color: tone.accent, fontWeight: 900 }}>↔</span><PreviewItem item={colB[i]} fallback={`Match ${i + 1}`} c={c} correct /></div>)}</div>
      {colB.length > pairCount && <div><div style={{ color: tone.accent, fontSize: 12, fontWeight: 900, marginBottom: 7, textAlign: "center" }}>Dummy answers</div><div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>{colB.slice(pairCount).map((item, i) => <div key={i} style={{ padding: "9px 12px", borderRadius: 12, border: `1px dashed ${tone.border}`, background: c.cardBg2 }}><PreviewItem item={item} fallback={`Dummy ${i + 1}`} c={c} /></div>)}</div></div>}
    </div>;
  }

  if (tt === "GUESS_WORD_4PICS") {
    const images = Array.isArray(cfg.images) ? cfg.images : [];
    const answer = correct.text || cfg.target || "";
    return <div style={{ display: "grid", placeItems: "center", gap: 14 }}><div style={{ width: "min(100%, 330px)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>{[0,1,2,3].map((i) => <div key={i} style={{ aspectRatio: "1", borderRadius: 12, overflow: "hidden", background: tone.softBg, border: `1.5px solid ${tone.border}`, display: "grid", placeItems: "center" }}>{images[i] ? <img src={images[i]} alt={`Clue ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ color: tone.accent, fontWeight: 900 }}>?</span>}</div>)}</div>{answer ? <AnswerChip>{answer}</AnswerChip> : null}</div>;
  }

  if (tt === "THINK_SPELL") {
    const words = resolveThinkSpellWordBank({ config: cfg, correct });
    const size = Math.min(12, Math.max(5, Number(cfg.gridSize || 8)));
    const signature = `${buildThinkSpellSignature({ questionId: 0, gridSize: size, words })}-${Number(cfg.gridSeed || 0)}`;
    const built = buildThinkSpellGrid({ gridSize: size, words, seed: buildThinkSpellSeed(signature) });
    return <div style={{ display: "grid", placeItems: "center", gap: 14 }}><div style={{ width: "min(100%, 390px)", display: "grid", gridTemplateColumns: `repeat(${built.gridSize}, minmax(0,1fr))`, gap: 4, padding: 10, borderRadius: 16, background: tone.softBg, border: `1.5px solid ${tone.border}` }}>{built.grid.map((ch, i) => <div key={i} style={{ aspectRatio: "1", display: "grid", placeItems: "center", borderRadius: 7, background: c.cardBg, border: `1px solid ${tone.border}`, color: tone.accent, fontWeight: 900, fontSize: built.gridSize > 9 ? 11 : 14 }}>{ch}</div>)}</div><div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>{words.map((word) => <AnswerChip key={word}>{word}</AnswerChip>)}</div></div>;
  }

  return null;
}

function PreviewItem({ item, fallback, c, correct = false }) {
  const value = item && typeof item === "object" ? item : { text: String(item || "") };
  return <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>{value.image ? <img src={value.image} alt="" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 9, flexShrink: 0 }} /> : null}<span style={{ color: correct ? "#15803d" : c.text, fontWeight: 800, overflowWrap: "anywhere" }}>{String(value.text || value.label || fallback)}</span>{correct ? <span style={{ color: "#22c55e", fontWeight: 900 }}>✓</span> : null}</div>;
}
