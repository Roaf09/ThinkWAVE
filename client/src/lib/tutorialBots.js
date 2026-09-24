import { scoreAnswer, normalizeTemplateType } from "./scoring.js";
import { calculateCompetitivePoints } from "./scoring.js";
import {
  resolveCrosswordWordBank,
  loadCrosswordGridState,
  validatePathSpellsWord,
  normalizeCrosswordWord,
} from "./crossword.js";

// ThinkBOT personas: strong / average / weak students. Fresh randomness every
// run — each bot samples a plausible answer per question, then earns whatever
// the REAL scorer awards (no hardcoded bot0-full / bot1-half / bot2-zero).
export const BOT_SKILLS = [
  { hitRate: 0.9 },
  { hitRate: 0.6 },
  { hitRate: 0.3 },
];

const norm = (value) => String(value ?? "").trim().toLowerCase();

function shuffle(list) {
  const next = [...list];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function resolveOptions(config) {
  const raw = Array.isArray(config?.options) ? config.options : [];
  return raw.map((option, index) => {
    if (option && typeof option === "object") {
      return { id: String(option.id || `option-${index + 1}`), text: option.text ?? option.label ?? "" };
    }
    return { id: `option-${index + 1}`, text: String(option ?? "") };
  });
}

function resolveCorrectIds(correct, options) {
  const values = Array.isArray(correct?.choices) && correct.choices.length
    ? correct.choices
    : [correct?.choice].filter((value) => value !== undefined && value !== null && value !== "");
  const ids = [];
  for (const value of values) {
    const hit = options.find((option) => norm(option.id) === norm(value) || norm(option.text) === norm(value));
    if (hit && !ids.includes(hit.id)) ids.push(hit.id);
  }
  return ids;
}

function isTwoAnswerMcq(config, correctIds) {
  return String(config?.answerMode || "").toUpperCase() === "TWO" || correctIds.length > 1;
}

// Brute-force straight-line path spelling `word` in the deterministic bot grid.
// Every candidate is confirmed with the real validator, so accepted entries
// always score through scoreCrosswordBatch.
function findWordPath(grid, gridSize, word) {
  const target = normalizeCrosswordWord(word);
  if (!target) return null;
  const size = Number(gridSize) || 0;
  if (!size || !Array.isArray(grid) || grid.length !== size * size) return null;
  const letterAt = (row, col) => normalizeCrosswordWord(grid[row * size + col]);
  const directions = [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (letterAt(row, col) !== target[0]) continue;
      for (const [dRow, dCol] of directions) {
        const path = [];
        let ok = true;
        for (let i = 0; i < target.length; i += 1) {
          const nextRow = row + dRow * i;
          const nextCol = col + dCol * i;
          if (nextRow < 0 || nextCol < 0 || nextRow >= size || nextCol >= size || letterAt(nextRow, nextCol) !== target[i]) {
            ok = false;
            break;
          }
          path.push(nextRow * size + nextCol);
        }
        if (ok && validatePathSpellsWord({ grid, gridSize: size, path, word })) return path;
      }
    }
  }
  return null;
}

function wrongTextSample(rightText) {
  const clean = String(rightText || "").trim();
  if (!clean) return "Sample response";
  const chars = [...clean];
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const next = shuffle(chars).join("");
    if (norm(next) && norm(next) !== norm(clean)) return next;
  }
  return `${clean}?`;
}

function randomLetters(length) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const size = Math.max(1, Number(length) || 3);
  return Array.from({ length: size }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

// Sample a student-like answer for one bot. Returns the answer payload plus
// the selected option indexes (MCQ/TRUE_FALSE) for live choice-count dots.
export function sampleBotAnswer({ templateType, config = {}, correct = {}, skill = 0.6 }) {
  const tt = normalizeTemplateType(templateType);
  const hit = (rate = skill) => Math.random() < rate;

  if (tt === "MCQ") {
    const options = resolveOptions(config);
    const goodIds = resolveCorrectIds(correct, options).slice(0, 2);
    const multi = isTwoAnswerMcq(config, goodIds);
    const slots = multi ? 2 : 1;
    const picks = goodIds.filter(() => hit());
    const wrongPool = shuffle(options.map((option) => option.id).filter((id) => !goodIds.includes(id)));
    while (picks.length < slots && wrongPool.length) picks.push(wrongPool.pop());
    const chosen = shuffle(picks).slice(0, Math.max(1, slots));
    const selectedIndexes = chosen
      .map((id) => options.findIndex((option) => option.id === id))
      .filter((index) => index >= 0);
    return { answer: multi ? { choices: chosen } : { choice: chosen[0] ?? "" }, selectedIndexes };
  }

  if (tt === "TRUE_FALSE") {
    const raw = correct?.choice ?? correct?.text ?? "True";
    const expectedFalse = ["false", "0", "f", "no"].includes(norm(raw));
    const right = expectedFalse ? "False" : "True";
    const selected = hit() ? right : (expectedFalse ? "True" : "False");
    return { answer: { choice: selected }, selectedIndexes: [norm(selected) === "false" || norm(selected) === "1" ? 1 : 0] };
  }

  if (tt === "TYPE_ANSWER" || tt === "GUESS_WORD_4PICS") {
    const rightText = correct?.text || (Array.isArray(correct?.answers) ? correct.answers[0] : "") || config?.target || config?.answer || "";
    if (hit()) return { answer: { text: rightText }, selectedIndexes: [] };
    const wrong = tt === "GUESS_WORD_4PICS" && rightText
      ? randomLetters(String(rightText).trim().length)
      : wrongTextSample(rightText);
    return { answer: { text: wrong }, selectedIndexes: [] };
  }

  if (tt === "MATCHING") {
    const pairs = Array.isArray(correct?.pairs) ? correct.pairs : [];
    const colBLength = Array.isArray(config?.colB) ? config.colB.length : pairs.length;
    const submitted = pairs.map((pair) => {
      const aIndex = Number(pair?.aIndex);
      const bIndex = Number(pair?.bIndex);
      if (hit() || colBLength <= 1) return { aIndex, bIndex };
      let wrong = Math.floor(Math.random() * colBLength);
      if (wrong === bIndex) wrong = (wrong + 1) % colBLength;
      return { aIndex, bIndex: wrong };
    });
    return { answer: { pairs: submitted }, selectedIndexes: [] };
  }

  if (tt === "CROSSWORD") {
    const gridState = loadCrosswordGridState({ config, correct, questionId: 0, priorPayload: null });
    const wordBank = resolveCrosswordWordBank({ config, correct });
    const words = [];
    for (const word of wordBank) {
      if (!hit()) continue;
      const path = findWordPath(gridState.grid, gridState.gridSize, word);
      if (path) words.push({ text: word, path });
    }
    return { answer: { words }, selectedIndexes: [] };
  }

  return { answer: { text: hit() ? "Correct" : "Incorrect" }, selectedIndexes: [] };
}

// Score a sampled bot answer with the real scorer + real speed formula.
export function scoreBotAnswer({ templateType, config = {}, correct = {}, answer, basePoints = 1, elapsedMs = 0, timeLimitMs = 30000 }) {
  const scored = scoreAnswer({ templateType, correct, answer, config, basePoints });
  const timeExpired = Number(elapsedMs || 0) > Number(timeLimitMs || 0) + 300;
  const competitivePoints = calculateCompetitivePoints({
    templateType,
    scored,
    basePoints,
    elapsedMs,
    timeLimitMs,
    timeExpired,
  });
  return { ...scored, competitivePoints, timeExpired };
}
