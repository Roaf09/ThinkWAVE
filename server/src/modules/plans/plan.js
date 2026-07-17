import { pool } from "../../db.js";
import { normalizeTemplateType } from "../quizzes/templates.js";

export const BASIC_LIMITS = Object.freeze({
  MCQ: { maxItems: 20, maxTimeSec: 120, maxChoices: 4, minChoices: 2, allowModified: false, allowImages: false },
  TRUE_FALSE: { maxItems: 20, maxTimeSec: 120, allowImages: false },
  TYPE_ANSWER: { maxItems: 20, maxTimeSec: 120, allowImages: false },
  MATCHING: { maxItems: 10, maxTimeSec: 300, maxPairs: 5, maxDummyAnswers: 1, allowImages: false },
  GUESS_WORD_4PICS: { maxItems: 10, maxTimeSec: 300, allowImages: false },
  THINK_SPELL: { maxItems: 5, maxTimeSec: 300, maxWords: 4, allowImages: false },
  questionBankPerTemplate: 5,
  live: { allowGroupMode: false, maxStudents: 45 },
});

export async function getTeacherPlan(userId) {
  const [[user]] = await pool.query(
    `SELECT institution_name FROM users WHERE id=:id AND deleted_at IS NULL`,
    { id: userId }
  );
  const institutionName = String(user?.institution_name || "").trim();
  return {
    code: institutionName ? "INSTITUTION" : "BASIC",
    institutionName: institutionName || null,
    limits: institutionName ? null : BASIC_LIMITS,
  };
}

export function validateBasicQuestionPayload(templateType, questions = []) {
  const template = normalizeTemplateType(templateType);
  const limit = BASIC_LIMITS[template] || { maxItems: 20, maxTimeSec: 120, allowImages: false };
  if (questions.length > limit.maxItems) return `Basic plan allows only ${limit.maxItems} ${template === "MATCHING" || template === "THINK_SPELL" ? "batches" : "questions"} for this template.`;

  for (const question of questions) {
    const config = question?.config || {};
    const timeLimit = Number(config.timeLimitSec || question?.timeLimitSec || 30);
    if (timeLimit > limit.maxTimeSec) return `Basic plan time limit is ${Math.round(limit.maxTimeSec / 60)} minute${limit.maxTimeSec > 60 ? "s" : ""} maximum for this template.`;
    if (!limit.allowImages) {
      const hasImage = !!String(config.promptImage || "").trim()
        || (Array.isArray(config.options) && config.options.some((item) => String(item?.image || "").trim()))
        || (Array.isArray(config.colA) && config.colA.some((item) => String(item?.image || "").trim()))
        || (Array.isArray(config.colB) && config.colB.some((item) => String(item?.image || "").trim()));
      if (hasImage) return "Question and answer image uploads are available on the Institution plan.";
    }
    if (template === "MCQ") {
      if (config.mcqMode === "MODIFIED") return "Modified multiple choice is available on the Institution plan.";
      const count = Array.isArray(config.options) ? config.options.length : 0;
      if (count < 2 || count > 4) return "Basic plan multiple choice supports 2 to 4 choices.";
    }
    if (template === "MATCHING") {
      const pairs = Array.isArray(config.colA) ? config.colA.length : 0;
      const dummy = Array.isArray(config.dummyB) ? config.dummyB.length : 0;
      if (pairs > 5) return "Basic plan matching batches support up to 5 pairs.";
      if (dummy > 1) return "Basic plan matching batches support only 1 dummy answer.";
    }
    if (template === "THINK_SPELL") {
      const words = Array.isArray(config.answers) ? config.answers.filter(Boolean).length : 0;
      if (words > 4) return "Basic plan Think and Spell supports up to 4 valid words per batch.";
    }
  }
  return null;
}
