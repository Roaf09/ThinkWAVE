/* FILE GUIDE:
 * server/src/modules/quizzes/studentView.js
 * Purpose: Allow-list student views of quiz questions. Students only receive
 * the fields their game components actually read — never answers, stashes,
 * recordings of answers, explanations, or unshuffled matching orders.
 */

import { createHmac } from "node:crypto";
import { normalizeTemplateType, TEMPLATE_TYPES } from "./templates.js";

const DECOY_WORDS = ["CAT", "DOG", "SUN", "MAP", "TREE", "BOOK", "STAR", "MOON", "FISH", "BIRD", "RAIN", "WIND", "PLAY", "GAME", "WORD", "NOTE", "BALL", "HOME", "BLUE", "GREEN"];
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function secret() {
  return process.env.JWT_SECRET || "dev_secret_change_me";
}

// Keyed RNG: HMAC(scope) -> 32-bit seed -> LCG. Students know the scope
// (session/question ids) but not JWT_SECRET, so they cannot recompute the
// shuffle and recover the original matching order or letter bank.
function keyedRandom(scopeText) {
  const digest = createHmac("sha256", secret()).update(String(scopeText || "")).digest();
  let seed = digest.readUInt32BE(0) || 1;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function keyedShuffleIndices(length, scopeText) {
  const idx = Array.from({ length }, (_, i) => i);
  if (length < 2) return idx;
  const random = keyedRandom(scopeText);
  for (let i = idx.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  if (idx.every((v, i) => v === i)) idx.push(idx.shift());
  return idx;
}

function cleanTextImage(item) {
  if (item && typeof item === "object") {
    return { text: String(item.text ?? item.label ?? ""), image: String(item.image ?? "") };
  }
  return { text: String(item ?? ""), image: "" };
}

function matchingSignature(item) {
  return JSON.stringify({
    text: String(item?.text ?? item?.label ?? item?.value ?? item ?? "").trim().toLowerCase(),
    image: String(item?.image ?? "").trim(),
  });
}

// Same recipe as MatchingConnectorGame: paired portion of colB + unique
// distractors. Must stay in sync with the client or canonicalization breaks.
function combinedMatchingB(config = {}) {
  const colA = Array.isArray(config.colA) ? config.colA : [];
  const rawB = Array.isArray(config.colB) ? config.colB : [];
  const dummyB = Array.isArray(config.dummyB) ? config.dummyB : [];
  const pairedB = dummyB.length && rawB.length > colA.length ? rawB.slice(0, colA.length) : rawB;
  const seen = new Set(pairedB.map(matchingSignature));
  const uniqueDummy = dummyB.filter((item) => {
    const key = matchingSignature(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { colA, combined: [...pairedB, ...uniqueDummy] };
}

function matchingPermutation(config, scope) {
  const { combined } = combinedMatchingB(config);
  return keyedShuffleIndices(combined.length, `${scope}:matching`);
}

function studentMatchingConfig(config = {}, scope) {
  const { colA } = combinedMatchingB(config);
  const { combined } = combinedMatchingB(config);
  const perm = matchingPermutation(config, scope);
  const shuffled = perm.map((i) => cleanTextImage(combined[i]));
  const out = {
    colA: colA.map(cleanTextImage),
    colB: shuffled,
    dummyB: [],
    shuffleColA: !!config.shuffleColA,
  };
  if (typeof config.shuffleSeed === "string" && config.shuffleSeed) out.shuffleSeed = config.shuffleSeed;
  return out;
}

// Shuffled position -> original combined-B index. Stored responses, scoring
// and analytics keep the original numbering.
export function toCanonicalMatchingAnswer(answer, originalConfig = {}, scope) {
  if (!answer || typeof answer !== "object" || Array.isArray(answer)) return answer;
  if (answer.pairs == null) return answer;
  if (!Array.isArray(answer.pairs)) return answer;
  const perm = matchingPermutation(originalConfig, scope);
  const pairs = answer.pairs.map((p) => {
    const a = Number(p?.aIndex);
    const s = Number(p?.bIndex);
    if (!Number.isInteger(s) || s < 0 || s >= perm.length) return { aIndex: a, bIndex: s };
    return { aIndex: a, bIndex: perm[s] };
  });
  return { ...answer, pairs };
}

function targetLetters(target) {
  return String(target || "").toUpperCase().split("").filter((ch) => /[A-Z0-9]/.test(ch));
}

function seededLetterBank(target, dummyCount, scope) {
  const letters = targetLetters(target);
  const answerKey = letters.join("");
  const extras = Math.max(0, Number(dummyCount) || 0);
  const candidates = DECOY_WORDS.filter((w) => w !== answerKey && w.length <= Math.max(5, extras));
  const random = keyedRandom(`${scope}:guessword`);
  let decoyLetters = [];
  let guard = 0;
  while (decoyLetters.length < extras && candidates.length && guard < 50) {
    guard += 1;
    const pick = candidates[Math.floor(random() * candidates.length)];
    decoyLetters.push(...pick.split(""));
  }
  if (!decoyLetters.length && extras > 0) decoyLetters = "GAMEWORDPLAY".split("");
  const pool = [...letters, ...decoyLetters.slice(0, extras)];
  const vowels = "AEIOU";
  while (pool.length < letters.length + extras) {
    const source = pool.length % 3 === 0 ? vowels : ALPHABET;
    pool.push(source[Math.floor(random() * source.length)]);
  }
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.map((ch, id) => ({ id, ch }));
}

function commonStudentConfig(config = {}) {
  const out = {};
  if (config.timeLimitSec !== undefined) out.timeLimitSec = config.timeLimitSec;
  if (config.promptImage !== undefined) out.promptImage = config.promptImage;
  if (config.showPromptImage !== undefined) out.showPromptImage = config.showPromptImage;
  // Question prompt audio stays; per-answer recordings are stripped (for
  // Identification/Guess Word they *are* the answer spoken aloud, and for
  // Matching their slot order is the answer order).
  if (config.voicePrompt !== undefined) out.voicePrompt = config.voicePrompt;
  if (config.textToSpeech !== undefined) out.textToSpeech = config.textToSpeech;
  if (config.voiceRecord !== undefined) out.voiceRecord = config.voiceRecord;
  return out;
}

function cleanOptions(options) {
  return (Array.isArray(options) ? options : []).map((o, i) => {
    if (o && typeof o === "object") {
      return { id: String(o.id || `option-${i + 1}`), text: String(o.text ?? o.label ?? ""), image: String(o.image ?? "") };
    }
    return { id: `option-${i + 1}`, text: String(o ?? ""), image: "" };
  });
}

// Build a fresh student-safe question. Never mutates the input.
// With reveal:false returns a placeholder that preserves list shape only.
export function toStudentQuestion({ templateType, question, scope = "", reveal = true } = {}) {
  if (!question || typeof question !== "object") return question;
  if (!reveal) {
    const placeholder = { id: question.id, hidden: true };
    if (question.question_order !== undefined) placeholder.question_order = question.question_order;
    return placeholder;
  }
  const tt = normalizeTemplateType(templateType);
  const config = (question.config_json && typeof question.config_json === "object") ? question.config_json : {};
  const studentConfig = commonStudentConfig(config);
  const correct = (question.correct_json && typeof question.correct_json === "object") ? question.correct_json : {};

  switch (tt) {
    case TEMPLATE_TYPES.MCQ:
      studentConfig.options = cleanOptions(config.options);
      if (config.mcqMode !== undefined) studentConfig.mcqMode = config.mcqMode;
      if (config.answerMode !== undefined) studentConfig.answerMode = config.answerMode;
      break;
    case TEMPLATE_TYPES.TRUE_FALSE:
      // GameTrueFalse renders and submits plain strings ("True"/"False"),
      // so keep them as strings - objects crash the React render.
      if (Array.isArray(config.options)) {
        studentConfig.options = config.options.map((o) => (o && typeof o === "object" ? String(o.text ?? o.label ?? "") : String(o ?? "")));
      }
      break;
    case TEMPLATE_TYPES.TYPE_ANSWER:
      break;
    case TEMPLATE_TYPES.GUESS_WORD_4PICS: {
      const target = String(config.target ?? correct.text ?? "");
      const dummyLetters = Number(config.dummyLetters ?? 6);
      studentConfig.images = Array.isArray(config.images) ? config.images.slice(0, 4) : [];
      studentConfig.letterBank = seededLetterBank(target, dummyLetters, scope || `q:${question.id}`);
      studentConfig.answerLength = Math.max(1, targetLetters(target).length);
      break;
    }
    case TEMPLATE_TYPES.MATCHING:
      Object.assign(studentConfig, studentMatchingConfig(config, scope || `q:${question.id}`));
      break;
    case TEMPLATE_TYPES.CROSSWORD: {
      // Word-hunt by design shows the word goals in the UI (GameCrossword
      // renders wordBank as "Word goals"), so words must be sent. Keep full
      // question but strip explanation/points metadata that is never rendered.
      const out = { ...question };
      if (out.config_json && typeof out.config_json === "object") {
        const { ...cfg } = out.config_json;
        delete cfg.explanation;
        out.config_json = cfg;
      }
      return out;
    }
    default:
      break;
  }

  const out = { ...question, config_json: studentConfig };
  delete out.correct_json;
  return out;
}

export function liveScope(sessionId, questionId) {
  return `live:${sessionId}:${questionId}`;
}

export function assignmentScope(userId, quizId, questionId) {
  return `asg:${userId}:${quizId}:${questionId}`;
}
