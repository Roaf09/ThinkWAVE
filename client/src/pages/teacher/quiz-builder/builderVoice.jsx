import { useEffect, useRef } from "react";
import { fitCappedLines } from "./quizBuilderUtils";

export function CorrectAnswerExplanation({ value, onChange, ui }) {
  const accent = ui.templateAccent || "#2b6cff";
  const boxRef = useRef(null);
  // Whenever the box appears off-screen, bring it into view so the teacher
  // sees it without hunting for it. If it's already visible (e.g. you're
  // typing in it), never touch the scroll — otherwise the page tugs upward.
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof window === "undefined") return;
    const rect = el.getBoundingClientRect();
    if (rect.top >= 0 && rect.bottom <= window.innerHeight) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" });
  }, []);
  return <div ref={boxRef} className="tw-correct-answer-explanation" style={{ marginTop: 14, padding: 18, borderRadius: 8, border: `3px solid ${accent}`, background: `color-mix(in srgb, ${accent} 12%, #ffffff)`, boxShadow: `0 6px 0 color-mix(in srgb, ${accent} 58%, #0f172a), 0 18px 34px ${accent}59, inset 0 2px 0 rgba(255,255,255,.8)` }}>
    <style>{`.tw-explanation-input::placeholder{color:rgba(15,23,42,.5)}`}</style>
    <label style={{ ...ui.smallLabel, display: "block", marginBottom: 7, color: "#0f172a" }}>Why is this the correct answer?</label>
    <textarea data-tutorial="builder-answer-explanation" maxLength={1000} rows={3} value={value || ""} onChange={(event) => onChange(event.target.value.slice(0, 1000))} onInput={(e) => fitExplanationFont(e.currentTarget)} ref={(el) => { if (el) fitExplanationFont(el); }} placeholder="Explain: optional" className="tw-explanation-input" style={{ width: "100%", boxSizing: "border-box", background: "transparent", border: "none", outline: "none", resize: "vertical", overflow: "hidden", color: "#0f172a", fontWeight: 800, fontSize: 20, textAlign: "center", fontFamily: "inherit", lineHeight: 1.5, padding: 0 }} />
  </div>;
}

// Explanation field: full size through 3 lines, then shrink toward the
// floor instead of growing taller. Height hugs content.
const EXPLAIN_MAX_FONT = 24;
const EXPLAIN_MIN_FONT = 13;
const EXPLAIN_MAX_HEIGHT = 96;

export function fitExplanationFont(el) {
  if (!el) return;
  fitCappedLines(el, { maxSize: EXPLAIN_MAX_FONT, minSize: EXPLAIN_MIN_FONT, maxLines: 3, maxHeight: EXPLAIN_MAX_HEIGHT });
}
