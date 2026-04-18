/* FILE GUIDE:
 * server/src/modules/quizzes/templates.js
 * Purpose: Project source file. Read the file name and exports first, then follow the imported helpers to understand the flow.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

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

export function scoreAnswer({ templateType, correct, answer, config = {}, basePoints = 0 }) {
  if (!correct) return { isCorrect: false, pointsAwarded: 0 };

  switch (templateType) {
    case TEMPLATE_TYPES.MCQ:
    case TEMPLATE_TYPES.TRUE_FALSE:
      return { isCorrect: norm(answer?.choice) === norm(correct?.choice), pointsAwarded: norm(answer?.choice) === norm(correct?.choice) ? basePoints : 0 };

    case TEMPLATE_TYPES.TYPE_ANSWER: {
      const expected = norm(correct?.text);
      const actual = norm(answer?.text);
      const tolerance = clamp(Number(config?.typoTolerance ?? correct?.typoTolerance ?? 1) || 1, 1, 5);
      const isCorrect = expected.length > 0 && levenshtein(actual, expected) <= tolerance;
      return { isCorrect, pointsAwarded: isCorrect ? basePoints : 0 };
    }

    case TEMPLATE_TYPES.GUESS_WORD_4PICS: {
      const expected = norm(correct?.text);
      const actual = norm(answer?.text);
      const tolerance = clamp(Number(config?.typoTolerance ?? correct?.typoTolerance ?? 1) || 1, 1, 5);
      const isCorrect = expected.length > 0 && levenshtein(actual, expected) <= tolerance;
      return { isCorrect, pointsAwarded: isCorrect ? basePoints : 0 };
    }

    case TEMPLATE_TYPES.DRAW_IT:
    case TEMPLATE_TYPES.GRIP_GUESS:
    case TEMPLATE_TYPES.THINK_SPELL: {
      const isCorrect = norm(answer?.text) === norm(correct?.text);
      return { isCorrect, pointsAwarded: isCorrect ? basePoints : 0 };
    }

    case TEMPLATE_TYPES.MATCHING: {
      const submitted = Array.isArray(answer?.pairs) ? answer.pairs : [];
      const expected = Array.isArray(correct?.pairs) ? correct.pairs : [];
      const expectedMap = new Map(expected.map((pair) => [Number(pair.aIndex), Number(pair.bIndex)]));
      let correctCount = 0;
      for (const pair of submitted) {
        if (expectedMap.get(Number(pair.aIndex)) === Number(pair.bIndex)) correctCount += 1;
      }
      const totalPairs = expectedMap.size;
      const pointsPerPair = clamp(Number(config?.pointsPerPair ?? correct?.pointsPerPair ?? 2) || 2, 2, 5);
      const isCorrect = totalPairs > 0 && correctCount === totalPairs;
      return {
        isCorrect,
        correctCount,
        totalPairs,
        pointsAwarded: correctCount * pointsPerPair,
      };
    }

    default:
      return { isCorrect: false, pointsAwarded: 0 };
  }
}

function norm(s) {
  return String(s ?? "").trim().toLowerCase();
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
