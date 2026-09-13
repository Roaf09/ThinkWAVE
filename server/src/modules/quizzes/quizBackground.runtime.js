import { SESSION_BACKGROUND_KEY_PATTERN } from "../sessions/sessionBackground.runtime.js";

const quizBackgrounds = new Map();
const VALID_BACKGROUND = SESSION_BACKGROUND_KEY_PATTERN;

export function normalizeQuizBackgroundKey(value, fallback = "background-01") {
  const key = String(value || "").trim();
  return VALID_BACKGROUND.test(key) ? key : fallback;
}

export function rememberQuizBackground(quizId, backgroundKey) {
  const id = Number(quizId);
  if (!id) return;
  quizBackgrounds.set(id, normalizeQuizBackgroundKey(backgroundKey));
}

export function getRememberedQuizBackground(quizId) {
  return quizBackgrounds.get(Number(quizId)) || null;
}
