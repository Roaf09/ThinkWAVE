import { normalizeTemplateType } from "./templateTypes";

export const TEMPLATE_PALETTES = {
  MCQ: { label: "Multiple Choice", icon: "mcq", accent: "#2b6cff" },
  TRUE_FALSE: { label: "True / False", icon: "truefalse", accent: "#14b8a6" },
  TYPE_ANSWER: { label: "Identification", icon: "identification", accent: "#a855f7" },
  MATCHING: { label: "Matching", icon: "matching", accent: "#f97316" },
  GUESS_WORD_4PICS: { label: "Guess Word", icon: "image", accent: "#22c55e" },
  CROSSWORD: { label: "Crossword", icon: "spell", accent: "#0ea5e9" },
};

export function templatePalette(templateType) {
  return TEMPLATE_PALETTES[normalizeTemplateType(templateType)] || TEMPLATE_PALETTES.MCQ;
}

export function templateLabel(templateType) {
  return templatePalette(templateType).label || String(templateType || "Template").replace(/_/g, " ");
}

export function templateIcon(templateType) {
  return templatePalette(templateType).icon || "spark";
}

export function templateAccent(templateType) {
  return templatePalette(templateType).accent || "#2b6cff";
}

// Gameplay choice colors (same 3D tiles used in the quiz builder for MCQ
// and True/False, now also used for read-only Question Bank cards).
// Single place so builder and bank can never drift apart.
export const GAME_CHOICE_PALETTE = [
  { face: "#f58b8b", base: "#b72f3b", border: "#d74750", ink: "#7f1d1d", badge: "#f7a4a4" },
  { face: "#7fd09a", base: "#25753f", border: "#35a159", ink: "#14532d", badge: "#9bdab0" },
  { face: "#80aaf7", base: "#2854ad", border: "#3e72dc", ink: "#173f94", badge: "#9cbdf9" },
  { face: "#f4d467", base: "#a87813", border: "#d4a522", ink: "#713f12", badge: "#f6dd88" },
  { face: "#c39af5", base: "#7443ae", border: "#9868d1", ink: "#4c1d95", badge: "#d0b0f7" },
];

export const TRUE_FALSE_TILES = [
  { value: "True", short: "T", face: "#7fd09a", base: "#25753f", border: "#35a159", ink: "#14532d", badge: "#9bdab0" },
  { value: "False", short: "F", face: "#f58b8b", base: "#b72f3b", border: "#d74750", ink: "#7f1d1d", badge: "#f7a4a4" },
];

export function templateTone(templateType, c, active = false) {
  const accent = templateAccent(templateType);
  return {
    accent,
    bg: active ? `${accent}30` : `${accent}20`,
    softBg: `${accent}1c`,
    border: active ? `${accent}cc` : `${accent}72`,
    shadow: `0 18px 34px ${accent}24`,
    text: accent,
    iconBg: `${accent}22`,
    iconBorder: `${accent}88`,
    cardBg: active ? `linear-gradient(135deg, ${accent}32 0%, ${c.cardBg} 48%, ${accent}12 100%)` : `linear-gradient(135deg, ${accent}22 0%, ${c.cardBg} 56%, ${accent}0d 100%)`,
  };
}

export function templateCardChrome(templateType, c, active = false, extra = {}) {
  const tone = templateTone(templateType, c, active);
  const faceMix = active ? 42 : 34;
  const baseMix = active ? 64 : 54;
  return {
    // Revision 10.21: cards use the same raised, solid template language as
    // the Create-tab template buttons while still mixing with the current
    // light/dark surface. The lower shadow acts as the 3D button base.
    background: `color-mix(in srgb, ${tone.accent} ${faceMix}%, ${c.cardBg})`,
    border: `4px solid color-mix(in srgb, ${tone.accent} 78%, ${c.border})`,
    "--tw-template-card-shadow": `0 7px 0 color-mix(in srgb, ${tone.accent} ${baseMix}%, ${c.border}), 0 16px 30px ${tone.accent}24`,
    boxShadow: `0 7px 0 color-mix(in srgb, ${tone.accent} ${baseMix}%, ${c.border}), 0 16px 30px ${tone.accent}24`,
    ...extra,
  };
}
