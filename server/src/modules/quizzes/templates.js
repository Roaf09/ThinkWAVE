/* FILE GUIDE:
 * server/src/modules/quizzes/templates.js
 * Purpose: Project source file. Read the file name and exports first, then follow the imported helpers to understand the flow.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import {
  computeThinkSpellPoints,
  hashSeed,
  loadThinkSpellGridState,
  matchThinkSpellWord,
  normalizeThinkWordKey,
  removeTilesAndRefill,
  resolveThinkSpellWordBank,
  validatePathSpellsWord,
} from "./thinkSpell.js";

export const TEMPLATE_TYPES = {
  // K-12
  MCQ: "MCQ",
  TRUE_FALSE: "TRUE_FALSE",
  MATCHING: "MATCHING",
  TYPE_ANSWER: "TYPE_ANSWER",
  // College
  GUESS_WORD_4PICS: "GUESS_WORD_4PICS",
  DRAW_IT: "DRAW_IT",
  GRIP_GUESS: "GRIP_GUESS",
  THINK_SPELL: "THINK_SPELL"
};

const TEMPLATE_ALIASES = {
  FOUR_PICS_ONE_WORD: TEMPLATE_TYPES.GUESS_WORD_4PICS,
  THINK_AND_SPELL: TEMPLATE_TYPES.THINK_SPELL,
};

export function normalizeTemplateType(templateType) {
  return TEMPLATE_ALIASES[templateType] || templateType;
}

export function scoreAnswer({ templateType, correct, answer, config = {}, basePoints = 0 }) {
  if (!correct) return { isCorrect: false, pointsAwarded: 0 };

  switch (normalizeTemplateType(templateType)) {
    case TEMPLATE_TYPES.MCQ: {
      // Revision 3: MCQ two-answer mode splits the question points equally between correct answers.
      const selected = Array.isArray(answer?.choices) ? answer.choices : [answer?.choice].filter(Boolean);
      const correctChoices = Array.isArray(correct?.choices) && correct.choices.length
        ? correct.choices
        : [correct?.choice].filter(Boolean);
      const totalCorrect = Math.max(1, correctChoices.length);
      let correctSelectedCount = 0;
      for (const choice of correctChoices) {
        if (selected.some((sel) => isChoiceCorrect(sel, choice, config))) correctSelectedCount += 1;
      }
      const hasWrongSelected = selected.some((sel) => !correctChoices.some((cor) => isChoiceCorrect(sel, cor, config)));
      const cappedBase = clamp(Number(basePoints) || 1, 1, 3);
      const pointsAwarded = (cappedBase / totalCorrect) * correctSelectedCount;
      const isCorrect = correctSelectedCount === correctChoices.length && !hasWrongSelected;
      return { isCorrect, pointsAwarded: Number(pointsAwarded.toFixed(2)) };
    }

    case TEMPLATE_TYPES.TRUE_FALSE:
      {
        const isCorrect = isChoiceCorrect(answer?.choice, correct?.choice, config);
        return { isCorrect, pointsAwarded: isCorrect ? basePoints : 0 };
      }

    case TEMPLATE_TYPES.TYPE_ANSWER: {
      // Revision 1: Identification is scored as exact, case-insensitive text unless alternatives are provided.
      const actual = norm(answer?.text);
      const expectedAny = [correct?.text, ...(Array.isArray(correct?.answers) ? correct.answers : [])]
        .map(norm)
        .filter(Boolean);
      const isCorrect = actual.length > 0 && expectedAny.some((expected) => actual === expected);
      return { isCorrect, pointsAwarded: isCorrect ? Math.min(3, basePoints) : 0 };
    }

    case TEMPLATE_TYPES.GUESS_WORD_4PICS: {
      // Revision 3: 4 Pics scores only the original word-guess gameplay.
      const isCorrect = normWord(answer?.text) === normWord(correct?.text);
      return { isCorrect, pointsAwarded: isCorrect ? Math.min(3, basePoints) : 0 };
    }

    case TEMPLATE_TYPES.DRAW_IT:
    case TEMPLATE_TYPES.GRIP_GUESS: {
      const actual = normWord(answer?.text);
      const normalizeList = (list) => (Array.isArray(list) ? list.map(normWord).filter(Boolean) : []);
      const cfgAnswers = normalizeList(config?.answers);
      const corAnswers = normalizeList(correct?.answers);
      const fallback = [normWord(correct?.horizontal), normWord(correct?.vertical), normWord(correct?.diagonal), normWord(correct?.text)].filter(Boolean);
      const expectedAny = Array.from(new Set([...cfgAnswers, ...corAnswers, ...fallback]));

      const reverse = (s) => s.split("").reverse().join("");
      const isMatchExpected = (exp) => actual.length > 0 && !!exp && (actual === exp || actual === reverse(exp));
      const isCorrect = expectedAny.some(isMatchExpected);
      return { isCorrect, pointsAwarded: isCorrect ? basePoints : 0 };
    }

    case TEMPLATE_TYPES.THINK_SPELL:
      // Revision 1: students submit all found words once at the end.
      return scoreThinkSpellBatch({ correct, answer, config, basePoints, questionId: config?.questionId });

    case TEMPLATE_TYPES.MATCHING: {
      const submitted = Array.isArray(answer?.pairs) ? answer.pairs : [];
      const expected = Array.isArray(correct?.pairs) ? correct.pairs : [];
      const expectedMap = new Map(expected.map((pair) => [Number(pair.aIndex), Number(pair.bIndex)]));
      let correctCount = 0;
      for (const pair of submitted) {
        if (expectedMap.get(Number(pair.aIndex)) === Number(pair.bIndex)) correctCount += 1;
      }
      const totalPairs = expectedMap.size;
      const base = clamp(Number(basePoints) || 1, 1, 3);
      const isCorrect = totalPairs > 0 && correctCount === totalPairs;
      // Revision 3: matching now uses the question's total points, distributed across pairs.
      return {
        isCorrect,
        correctCount,
        totalPairs,
        pointsAwarded: totalPairs > 0 ? Number(((correctCount / totalPairs) * base).toFixed(2)) : 0,
      };
    }

    default:
      return { isCorrect: false, pointsAwarded: 0 };
  }
}

export function scoreThinkSpellBatch({
  correct,
  answer,
  config = {},
  basePoints = 1,
  questionId = 0,
}) {
  const wordBank = resolveThinkSpellWordBank({ config, correct });
  const expectedKeys = new Set(wordBank.map(normalizeThinkWordKey).filter(Boolean));
  const gridState = loadThinkSpellGridState({ config, correct, questionId, priorPayload: null });
  const entries = Array.isArray(answer?.words) ? answer.words : [];
  const accepted = [];
  const acceptedKeys = new Set();
  let pointsAwarded = 0;

  for (const entry of entries) {
    const text = entry?.text || entry?.word || "";
    const key = normalizeThinkWordKey(text);
    const path = Array.isArray(entry?.path) ? entry.path.map(Number).filter(Number.isInteger) : [];
    const canonical = matchThinkSpellWord(text, wordBank);
    if (!canonical || acceptedKeys.has(canonical) || !expectedKeys.has(canonical)) continue;
    if (!validatePathSpellsWord({ grid: gridState.grid, gridSize: gridState.gridSize, path, word: text })) continue;
    acceptedKeys.add(canonical);
    accepted.push(canonical);
    // Revision 2: Think and Spell score is question points multiplied by words found.
    pointsAwarded += Math.max(1, Number(basePoints) || 1);
  }

  return {
    isCorrect: expectedKeys.size > 0 && acceptedKeys.size === expectedKeys.size,
    pointsAwarded,
    words: accepted,
    totalWords: accepted.length,
    requiredWords: expectedKeys.size,
  };
}

export function scoreThinkSpellWord({
  correct,
  answer,
  config = {},
  basePoints = 1,
  questionId = 0,
  priorWords = [],
  priorPayload = null,
}) {
  const minLen = clamp(Number(config?.minWordLength ?? 3) || 3, 2, 8);
  const spelled = normalizeThinkWordKey(answer?.text);
  const path = Array.isArray(answer?.path)
    ? answer.path.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 0)
    : [];
  const wordBank = resolveThinkSpellWordBank({ config, correct });
  const foundKeys = new Set((priorWords || []).map(normalizeThinkWordKey).filter(Boolean));

  const state = loadThinkSpellGridState({ config, correct, questionId, priorPayload });
  const { grid, gridSize, refillCounter, streak } = state;

  if (!spelled || spelled.length < minLen) {
    return { isCorrect: false, pointsAwarded: 0, reason: "too_short", streak: 0, grid, gridSize, refillCounter };
  }
  if (!path.length || !validatePathSpellsWord({ grid, gridSize, path, word: answer?.text })) {
    return { isCorrect: false, pointsAwarded: 0, reason: "not_in_grid", streak: 0, grid, gridSize, refillCounter };
  }

  const canonical = matchThinkSpellWord(answer?.text, wordBank);
  if (!canonical) {
    return { isCorrect: false, pointsAwarded: 0, reason: "not_in_bank", streak: 0, grid, gridSize, refillCounter };
  }
  if (foundKeys.has(canonical)) {
    return { isCorrect: false, pointsAwarded: 0, reason: "duplicate", streak: 0, grid, gridSize, refillCounter };
  }

  const nextStreak = streak + 1;
  const points = computeThinkSpellPoints(path.length, config, basePoints, nextStreak);
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

function levenshtein(a, b) {
  const s = String(a || "");
  const t = String(b || "");
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  const dp = Array.from({ length: s.length + 1 }, () => new Array(t.length + 1).fill(0));
  for (let i = 0; i <= s.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= t.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= s.length; i += 1) {
    for (let j = 1; j <= t.length; j += 1) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  return dp[s.length][t.length];
}
