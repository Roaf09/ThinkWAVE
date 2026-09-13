import { normalizeTemplateType } from "../../../lib/templateTypes";

export function darkenHex(hex, amount = 0.36) {
  const value = String(hex || "#2b6cff").replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return hex || "#173f9b";
  const factor = Math.max(0, Math.min(1, 1 - amount));
  const channels = [0, 2, 4].map((start) => Math.round(parseInt(value.slice(start, start + 2), 16) * factor));
  return `#${channels.map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

export function lightenTutorialColor(hex, amount = 0.32) {
  const value = String(hex || "#2b6cff").replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return hex || "#60a5fa";
  const mix = (channel) => Math.round(channel + (255 - channel) * Math.max(0, Math.min(1, amount)));
  const r = mix(parseInt(value.slice(0, 2), 16));
  const g = mix(parseInt(value.slice(2, 4), 16));
  const b = mix(parseInt(value.slice(4, 6), 16));
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

export function summarizeBuilderQuestion(question, templateType) {
  const tt = normalizeTemplateType(templateType); const cfg = question?.config || {}; const cor = question?.correct || {};
  if (tt === "MCQ") return (cfg.options || []).map((o) => typeof o === "object" ? (o.text || o.label || "Image") : o).filter(Boolean).slice(0,4).join(" · ");
  if (tt === "MATCHING") return (cfg.colA || []).slice(0,3).map((a,i) => `${typeof a === "object" ? a.text : a} ↔ ${typeof cfg.colB?.[i] === "object" ? cfg.colB[i].text : cfg.colB?.[i] || ""}`).join(" · ");
  if (tt === "THINK_SPELL") return (cor.answers || cfg.answers || []).slice(0,4).join(" · ");
  if (tt === "GUESS_WORD_4PICS") return cor.text || cfg.target || "4 images";
  return cor.text || cor.choice || (cor.answers || []).join(" · ") || "Answer";
}
