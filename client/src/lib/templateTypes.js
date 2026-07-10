/** Canonical template type ids used across builder, live play, and scoring. */
export const TEMPLATE_TYPES = {
  MCQ: "MCQ",
  TRUE_FALSE: "TRUE_FALSE",
  MATCHING: "MATCHING",
  TYPE_ANSWER: "TYPE_ANSWER",
  GUESS_WORD_4PICS: "GUESS_WORD_4PICS",
  DRAW_IT: "DRAW_IT",
  GRIP_GUESS: "GRIP_GUESS",
  THINK_SPELL: "THINK_SPELL",
};

const ALIASES = {
  FOUR_PICS_ONE_WORD: TEMPLATE_TYPES.GUESS_WORD_4PICS,
  THINK_AND_SPELL: TEMPLATE_TYPES.THINK_SPELL,
};

export function normalizeTemplateType(templateType) {
  return ALIASES[templateType] || templateType;
}
