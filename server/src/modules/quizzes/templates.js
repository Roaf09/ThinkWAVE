/* FILE GUIDE:
 * server/src/modules/quizzes/templates.js
 * Purpose: Project source file. Read the file name and exports first, then follow the imported helpers to understand the flow.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import {
  computeCrosswordPoints,
  hashSeed,
  loadCrosswordGridState,
  matchCrosswordWord,
  normalizeCrosswordWordKey,
  removeTilesAndRefill,
  resolveCrosswordWordBank,
  validatePathSpellsWord,
} from "./templates/crossword/crossword.js";

export const TEMPLATE_TYPES = {
  // K-12
  MCQ: "MCQ",
  TRUE_FALSE: "TRUE_FALSE",
  MATCHING: "MATCHING",
  TYPE_ANSWER: "TYPE_ANSWER",
  // College
  GUESS_WORD_4PICS: "GUESS_WORD_4PICS",
  CROSSWORD: "CROSSWORD"
};

// Legacy values still accepted so quizzes created before the Crossword
// standardization keep working (see server/scripts/migrate_templates_points.mjs).
const TEMPLATE_ALIASES = {
  FOUR_PICS_ONE_WORD: TEMPLATE_TYPES.GUESS_WORD_4PICS,
  THINK_AND_SPELL: TEMPLATE_TYPES.CROSSWORD,
  THINK_SPELL: TEMPLATE_TYPES.CROSSWORD,
  DRAW_IT: TEMPLATE_TYPES.TYPE_ANSWER,
  GRIP_GUESS: TEMPLATE_TYPES.TYPE_ANSWER,
};

export function normalizeTemplateType(templateType) {
  return TEMPLATE_ALIASES[templateType] || templateType;
}

export function scoreAnswer({ templateType, correct, answer, config = {}, basePoints = 0 }) {
  if (!correct) return { isCorrect: false, pointsAwarded: 0 };

  switch (normalizeTemplateType(templateType)) {
    case TEMPLATE_TYPES.MCQ: {
      const selected = Array.isArray(answer?.choices) ? answer.choices : [answer?.choice].filter(Boolean);
      const correctChoices = Array.isArray(correct?.choices) && correct.choices.length
        ? correct.choices
        : [correct?.choice].filter(Boolean);
      // Hardened: at most 2 correct answers are scorable (builder cap) and the
      // base is an integer 1..3, so awards are always X.0/X.5 even for
      // legacy or hand-crafted payloads with 3+ correct choices.
      const scorableChoices = correctChoices.slice(0, 2);
      const totalCorrect = Math.max(1, scorableChoices.length);
      let correctSelectedCount = 0;
      for (const choice of scorableChoices) {
        if (selected.some((sel) => isChoiceCorrect(sel, choice, config))) correctSelectedCount += 1;
      }
      const hasWrongSelected = selected.some((sel) => !scorableChoices.some((cor) => isChoiceCorrect(sel, cor, config)));
      const cappedBase = Math.min(3, Math.max(1, Math.round(Number(basePoints) || 1)));
      const pointsAwarded = (cappedBase / totalCorrect) * correctSelectedCount;
      const isCorrect = correctSelectedCount === scorableChoices.length && !hasWrongSelected;
      const partial = !isCorrect && correctSelectedCount > 0;
      return {
        isCorrect,
        partial,
        feedbackType: isCorrect ? "correct" : partial ? "almost" : "wrong",
        correctCount: correctSelectedCount,
        totalCorrect,
        hasWrongSelected,
        pointsAwarded: Number(pointsAwarded.toFixed(2)),
      };
    }

    case TEMPLATE_TYPES.TRUE_FALSE:
      {
        const isCorrect = isChoiceCorrect(answer?.choice, correct?.choice, config);
        return { isCorrect, pointsAwarded: isCorrect ? Math.min(3, Math.max(1, Math.round(Number(basePoints) || 1))) : 0 };
      }

    case TEMPLATE_TYPES.TYPE_ANSWER: {
      const actual = norm(answer?.text);
      const expectedAny = [correct?.text, ...(Array.isArray(correct?.answers) ? correct.answers : [])]
        .map(norm)
        .filter(Boolean);
      const isCorrect = actual.length > 0 && expectedAny.some((expected) => actual === expected);
      return { isCorrect, pointsAwarded: isCorrect ? Math.min(3, Math.max(1, Math.round(Number(basePoints) || 1))) : 0 };
    }

    case TEMPLATE_TYPES.GUESS_WORD_4PICS: {
      const isCorrect = normWord(answer?.text) === normWord(correct?.text);
      return { isCorrect, pointsAwarded: isCorrect ? Math.min(3, Math.max(1, Math.round(Number(basePoints) || 1))) : 0 };
    }

    case TEMPLATE_TYPES.CROSSWORD:
      return scoreCrosswordBatch({ correct, answer, config, basePoints, questionId: config?.questionId });

    case TEMPLATE_TYPES.MATCHING: {
      const submitted = Array.isArray(answer?.pairs) ? answer.pairs : [];
      const expected = Array.isArray(correct?.pairs) ? correct.pairs : [];
      const expectedMap = new Map(expected.map((pair) => [Number(pair.aIndex), Number(pair.bIndex)]));
      let correctCount = 0;
      for (const pair of submitted) {
        if (expectedMap.get(Number(pair.aIndex)) === Number(pair.bIndex)) correctCount += 1;
      }
      const totalPairs = expectedMap.size;
      const base = Math.min(3, Math.max(1, Math.round(Number(basePoints) || 1)));
      const isCorrect = totalPairs > 0 && correctCount === totalPairs;
      const partial = correctCount > 0 && correctCount < totalPairs;
      return {
        isCorrect,
        partial,
        feedbackType: isCorrect ? "correct" : partial ? "almost" : "wrong",
        correctCount,
        totalPairs,
        pointsAwarded: Number((correctCount * base).toFixed(2)),
      };
    }

    default:
      return { isCorrect: false, pointsAwarded: 0 };
  }
}

export function scoreCrosswordBatch({
  correct,
  answer,
  config = {},
  basePoints = 1,
  questionId = 0,
}) {
  const wordBank = resolveCrosswordWordBank({ config, correct });
  const expectedKeys = new Set(wordBank.map(normalizeCrosswordWordKey).filter(Boolean));
  const gridState = loadCrosswordGridState({ config, correct, questionId, priorPayload: null });
  const entries = Array.isArray(answer?.words) ? answer.words : [];
  const accepted = [];
  const acceptedKeys = new Set();
  let pointsAwarded = 0;

  for (const entry of entries) {
    const text = entry?.text || entry?.word || "";
    const path = Array.isArray(entry?.path) ? entry.path.map(Number).filter(Number.isInteger) : [];
    const canonical = matchCrosswordWord(text, wordBank);
    if (!canonical || acceptedKeys.has(canonical) || !expectedKeys.has(canonical)) continue;
    if (!validatePathSpellsWord({ grid: gridState.grid, gridSize: gridState.gridSize, path, word: text })) continue;
    acceptedKeys.add(canonical);
    accepted.push(canonical);
    pointsAwarded += Math.max(1, Number(basePoints) || 1);
  }

  const isCorrect = expectedKeys.size > 0 && acceptedKeys.size === expectedKeys.size;
  const partial = !isCorrect && acceptedKeys.size > 0;
  return {
    isCorrect,
    partial,
    feedbackType: isCorrect ? "correct" : partial ? "almost" : "wrong",
    pointsAwarded,
    words: accepted,
    correctCount: acceptedKeys.size,
    totalWords: accepted.length,
    totalItems: expectedKeys.size,
    requiredWords: expectedKeys.size,
  };
}

export function scoreCrosswordWord({
  correct,
  answer,
  config = {},
  basePoints = 1,
  questionId = 0,
  priorWords = [],
  priorPayload = null,
}) {
  const minLen = clamp(Number(config?.minWordLength ?? 3) || 3, 2, 8);
  const spelled = normalizeCrosswordWordKey(answer?.text);
  const path = Array.isArray(answer?.path)
    ? answer.path.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 0)
    : [];
  const wordBank = resolveCrosswordWordBank({ config, correct });
  const foundKeys = new Set((priorWords || []).map(normalizeCrosswordWordKey).filter(Boolean));

  const state = loadCrosswordGridState({ config, correct, questionId, priorPayload });
  const { grid, gridSize, refillCounter, streak } = state;

  if (!spelled || spelled.length < minLen) {
    return { isCorrect: false, pointsAwarded: 0, reason: "too_short", streak: 0, grid, gridSize, refillCounter };
  }
  if (!path.length || !validatePathSpellsWord({ grid, gridSize, path, word: answer?.text })) {
    return { isCorrect: false, pointsAwarded: 0, reason: "not_in_grid", streak: 0, grid, gridSize, refillCounter };
  }

  const canonical = matchCrosswordWord(answer?.text, wordBank);
  if (!canonical) {
    return { isCorrect: false, pointsAwarded: 0, reason: "not_in_bank", streak: 0, grid, gridSize, refillCounter };
  }
  if (foundKeys.has(canonical)) {
    return { isCorrect: false, pointsAwarded: 0, reason: "duplicate", streak: 0, grid, gridSize, refillCounter };
  }

  const nextStreak = streak + 1;
  const points = computeCrosswordPoints(path.length, config, basePoints, nextStreak);
  const refillSeed = hashSeed(`${questionId}-${refillCounter}`);
  const newGrid = removeTilesAndRefill(grid, gridSize, path, refillSeed);

  return {
    isCorrect: true,
    pointsAwarded: points,
    reason: "accepted",
    canonicalWord: canonical,
    grid: newGrid,
    gridSize,
    refillCounter: refillCounter + 1,
    streak: nextStreak,
  };
}

function norm(s) {
  return String(s ?? "").trim().toLowerCase();
}

function normalizeChoiceOption(option, index = 0) {
  if (option && typeof option === "object") {
    return {
      id: String(option.id || `option-${index + 1}`),
      text: option.text ?? option.label ?? "",
      image: option.image ?? "",
    };
  }
  return { id: `option-${index + 1}`, text: String(option ?? ""), image: "" };
}

function isChoiceCorrect(answerChoice, correctChoice, config = {}) {
  const actual = norm(answerChoice);
  const expected = norm(correctChoice);
  if (!actual || !expected) return false;
  if (actual === expected) return true;

  const options = Array.isArray(config?.options) ? config.options.map(normalizeChoiceOption) : [];
  const actualOption = options.find((option) => [option.id, option.text].some((value) => norm(value) === actual));
  const expectedOption = options.find((option) => [option.id, option.text].some((value) => norm(value) === expected));

  if (actualOption && expectedOption) return norm(actualOption.id) === norm(expectedOption.id);
  if (actualOption) return norm(actualOption.text) === expected;
  if (expectedOption) return actual === norm(expectedOption.text);
  return false;
}

function normWord(s) {
  return String(s ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value || 0)));
}
