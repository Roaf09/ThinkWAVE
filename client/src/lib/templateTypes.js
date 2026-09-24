/** Canonical template type ids used across builder, live play, and scoring. */
export const TEMPLATE_TYPES = {
  MCQ: "MCQ",
  TRUE_FALSE: "TRUE_FALSE",
  MATCHING: "MATCHING",
  TYPE_ANSWER: "TYPE_ANSWER",
  GUESS_WORD_4PICS: "GUESS_WORD_4PICS",
  CROSSWORD: "CROSSWORD",
};

// Legacy values still accepted so quizzes created before the Crossword
// standardization keep working (see server/scripts/migrate_templates_points.mjs).
const ALIASES = {
  FOUR_PICS_ONE_WORD: TEMPLATE_TYPES.GUESS_WORD_4PICS,
  THINK_AND_SPELL: TEMPLATE_TYPES.CROSSWORD,
  THINK_SPELL: TEMPLATE_TYPES.CROSSWORD,
  DRAW_IT: TEMPLATE_TYPES.TYPE_ANSWER,
  GRIP_GUESS: TEMPLATE_TYPES.TYPE_ANSWER,
};

export function normalizeTemplateType(templateType) {
  return ALIASES[templateType] || templateType;
}
