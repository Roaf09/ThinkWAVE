import { useEffect, useState } from "react";

// Shared style helpers + small utilities for teacher tab screens.
// Extract-only consolidation of the triplicated helpers in
// LiveSessionsTab.jsx / ClassesTab.jsx / QuestionBankTab.jsx.
// Batch 1 wires QuestionBankTab.jsx; Live/Classes follow-ups reuse the same exports.

export const tabCard = (c, extra = {}) => ({
  background: c.cardBg,
  border: `1px solid ${c.border}`,
  borderRadius: 18,
  padding: 16,
  boxShadow: c.pageBg === "#eef2ff" ? "0 16px 34px rgba(43,108,255,0.08)" : "0 16px 34px rgba(0,0,0,0.14)",
  transition: "background 0.3s, border-color 0.3s, transform 0.25s",
  ...extra,
});

export const tabBtn = (c, primary = false) => ({
  padding: "9px 13px",
  borderRadius: 12,
  border: `1px solid ${primary ? c.accent : c.border}`,
  background: primary ? c.accent : c.cardBg2,
  color: primary ? "#fff" : c.text,
  fontWeight: 800,
  fontSize: 13,
  cursor: "pointer",
});

export function tabMenuBtn(c) {
  return { width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: 10, border: "none", background: "transparent", color: c.text, fontWeight: 700, cursor: "pointer" };
}

export function tabInputStyle(c) {
  return { width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 12, border: `1px solid ${c.inputBorder || c.border}`, background: c.inputBg || c.cardBg2, color: c.text };
}

export function solidModalBg(c) {
  return String(c.text || "").toLowerCase() === "#eef4ff" ? "#07142b" : "#fffaf0";
}

export function Badge({ label, c, tone = "neutral" }) {
  const map = {
    neutral: { bg: c.cardBg2, fg: c.text, border: c.border },
    blue: { bg: `${c.accent}16`, fg: c.accent, border: c.accent },
    green: { bg: c.greenBg, fg: c.greenFg, border: c.greenBorder },
    yellow: { bg: c.yellowBg, fg: c.yellowFg, border: c.yellowBorder },
  }[tone];
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700, background: map.bg, color: map.fg, border: `1px solid ${map.border}` }}>{label}</span>;
}

export function TemplateBadge({ label, tone }) {
  return <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "6px 11px", borderRadius: 999, fontSize: 12, fontWeight: 900, background: tone.softBg, color: tone.accent, border: `2px solid ${tone.border}` }}>{label}</span>;
}

export function normalizeBankTemplate(value) {
  if (value === "FOUR_PICS_ONE_WORD") return "GUESS_WORD_4PICS";
  if (value === "THINK_AND_SPELL") return "THINK_SPELL";
  return value;
}

export function buildFolderPathMap(rows) {
  const byId = new Map((rows || []).map((row) => [Number(row.id), row]));
  const cache = new Map();
  function walk(id) {
    if (!id) return "";
    if (cache.has(id)) return cache.get(id);
    const row = byId.get(Number(id));
    if (!row) return "";
    const parent = row.parent_id ? walk(Number(row.parent_id)) : "";
    const label = parent ? `${parent} / ${row.name}` : row.name;
    cache.set(Number(id), label);
    return label;
  }
  (rows || []).forEach((row) => walk(Number(row.id)));
  return cache;
}

export function useIsMobileViewport(breakpoint = 760) {
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth <= breakpoint);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const handler = () => setIsMobile(mq.matches);
    handler();
    if (mq.addEventListener) mq.addEventListener("change", handler);
    else mq.addListener(handler);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", handler);
      else mq.removeListener(handler);
    };
  }, [breakpoint]);
  return isMobile;
}
