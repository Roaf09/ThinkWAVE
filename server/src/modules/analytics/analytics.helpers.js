import { normalizeTemplateType } from "../quizzes/templates.js";

export function safeJsonValue(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return null; }
}

function norm(value) { return String(value ?? "").trim().toLowerCase(); }
function normWord(value) { return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, ""); }
function pct(value, total) { return total ? Number(((Number(value || 0) / total) * 100).toFixed(2)) : 0; }

function normalizeOption(option, index) {
  if (option && typeof option === "object") return { id: String(option.id || `option-${index + 1}`), text: option.text ?? option.label ?? "", image: option.image ?? "" };
  return { id: `option-${index + 1}`, text: String(option ?? ""), image: "" };
}

function choiceIndex(value, options) {
  const actual = norm(value);
  if (!actual) return -1;
  return options.findIndex((option) => [option.id, option.text].some((candidate) => norm(candidate) === actual));
}

function responseChoiceIndexes(templateType, answer, config = {}) {
  const tt = normalizeTemplateType(templateType);
  if (tt === "TRUE_FALSE") {
    const value = norm(answer?.choice);
    return value === "true" ? [0] : value === "false" ? [1] : [];
  }
  if (tt !== "MCQ") return [];
  const options = (Array.isArray(config.options) ? config.options : []).map(normalizeOption);
  const selected = Array.isArray(answer?.choices) ? answer.choices : [answer?.choice].filter((value) => value !== undefined && value !== null && value !== "");
  return Array.from(new Set(selected.map((value) => choiceIndex(value, options)).filter((index) => index >= 0)));
}

function correctChoiceIndexes(templateType, correct, config = {}) {
  const tt = normalizeTemplateType(templateType);
  if (tt === "TRUE_FALSE") return norm(correct?.choice) === "true" ? [0] : norm(correct?.choice) === "false" ? [1] : [];
  if (tt !== "MCQ") return [];
  const options = (Array.isArray(config.options) ? config.options : []).map(normalizeOption);
  const values = Array.isArray(correct?.choices) && correct.choices.length ? correct.choices : [correct?.choice].filter(Boolean);
  return Array.from(new Set(values.map((value) => choiceIndex(value, options)).filter((index) => index >= 0)));
}

function foundWordKeys(answer) {
  const entries = Array.isArray(answer?.words) ? answer.words : Array.isArray(answer?.foundEntries) ? answer.foundEntries : [];
  return new Set(entries.map((entry) => normWord(typeof entry === "string" ? entry : entry?.text || entry?.word)).filter(Boolean));
}

export function buildDetailedQuestionAnalytics(templateType, questions = [], responses = []) {
  const tt = normalizeTemplateType(templateType);
  const byQuestion = new Map();
  for (const response of responses) {
    const key = Number(response.question_id);
    if (!byQuestion.has(key)) byQuestion.set(key, []);
    byQuestion.get(key).push({
      ...response,
      answer: safeJsonValue(response.answer_json),
      is_correct: Number(response.is_correct) === 1,
      points_awarded: Number(response.points_awarded || 0),
    });
  }

  return questions.map((question, questionIndex) => {
    const questionId = Number(question.question_id ?? question.id);
    const config = safeJsonValue(question.config_json) || {};
    const correct = safeJsonValue(question.correct_json) || {};
    const rows = byQuestion.get(questionId) || [];
    let correctAnswers = rows.filter((row) => row.is_correct).length;
    let incorrectAnswers = rows.length - correctAnswers;
    const detail = {
      ...question,
      question_id: questionId,
      question_order: Number(question.question_order ?? questionIndex),
      config_json: config,
      correct_json: correct,
      total_answers: rows.length,
      correct_answers: correctAnswers,
      incorrect_answers: incorrectAnswers,
      pct_correct: pct(correctAnswers, rows.length),
      pct_incorrect: pct(incorrectAnswers, rows.length),
    };

    if (tt === "MCQ" || tt === "TRUE_FALSE") {
      const options = tt === "TRUE_FALSE"
        ? [{ id: "true", text: "True", image: "" }, { id: "false", text: "False", image: "" }]
        : (Array.isArray(config.options) ? config.options : []).map(normalizeOption);
      const correctSet = new Set(correctChoiceIndexes(tt, correct, config));
      const counts = new Array(options.length).fill(0);
      for (const row of rows) for (const index of responseChoiceIndexes(tt, row.answer, config)) if (index < counts.length) counts[index] += 1;
      detail.choice_stats = options.map((option, index) => ({
        index,
        ...option,
        is_correct: correctSet.has(index),
        selected_count: counts[index],
        selected_pct: pct(counts[index], rows.length),
      }));
    }

    if (tt === "MATCHING") {
      const expected = Array.isArray(correct.pairs) ? correct.pairs : [];
      detail.pair_stats = expected.map((pair, index) => {
        let pairCorrect = 0;
        for (const row of rows) {
          const submitted = Array.isArray(row.answer?.pairs) ? row.answer.pairs : [];
          if (submitted.some((candidate) => Number(candidate?.aIndex) === Number(pair.aIndex) && Number(candidate?.bIndex) === Number(pair.bIndex))) pairCorrect += 1;
        }
        const pairIncorrect = Math.max(0, rows.length - pairCorrect);
        return {
          index,
          aIndex: Number(pair.aIndex),
          bIndex: Number(pair.bIndex),
          a: (Array.isArray(config.colA) ? config.colA : [])[Number(pair.aIndex)] ?? null,
          b: (Array.isArray(config.colB) ? config.colB : [])[Number(pair.bIndex)] ?? null,
          correct_count: pairCorrect,
          incorrect_count: pairIncorrect,
          pct_correct: pct(pairCorrect, rows.length),
          pct_incorrect: pct(pairIncorrect, rows.length),
        };
      });
    }

    if (tt === "THINK_SPELL") {
      const words = (Array.isArray(correct.answers) && correct.answers.length ? correct.answers : Array.isArray(config.answers) ? config.answers : []).map(String).filter(Boolean);
      const expectedKeys = words.map(normWord);
      detail.word_stats = words.map((word, index) => {
        const key = expectedKeys[index];
        let found = 0;
        for (const row of rows) if (foundWordKeys(row.answer).has(key)) found += 1;
        return { index, word, correct_count: found, incorrect_count: Math.max(0, rows.length - found), pct_correct: pct(found, rows.length), pct_incorrect: pct(Math.max(0, rows.length - found), rows.length) };
      });
      // Live Crossword responses are updated word-by-word, so is_correct historically
      // means "found at least one". Recompute batch correctness from the final word set.
      correctAnswers = rows.filter((row) => {
        const found = foundWordKeys(row.answer);
        return expectedKeys.length > 0 && expectedKeys.every((key) => found.has(key));
      }).length;
      incorrectAnswers = rows.length - correctAnswers;
      detail.correct_answers = correctAnswers;
      detail.incorrect_answers = incorrectAnswers;
      detail.pct_correct = pct(correctAnswers, rows.length);
      detail.pct_incorrect = pct(incorrectAnswers, rows.length);
    }

    return detail;
  });
}

export function buildStudentResponseDetails(responses = []) {
  return responses.map((response) => ({
    question_id: Number(response.question_id),
    answer: safeJsonValue(response.answer_json),
    is_correct: Number(response.is_correct) === 1,
    points_awarded: Number(response.points_awarded || 0),
    answered_at: response.answered_at || null,
  }));
}
