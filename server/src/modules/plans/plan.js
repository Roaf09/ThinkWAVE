import { pool } from "../../db.js";

export const BASIC_LIMITS = Object.freeze({
  MCQ: { maxItems: 20, maxTimeSec: 120, maxChoices: 4, minChoices: 3, allowModified: false, allowImages: false },
  TRUE_FALSE: { maxItems: 20, maxTimeSec: 120, allowImages: false },
  TYPE_ANSWER: { maxItems: 20, maxTimeSec: 120, allowImages: false },
  MATCHING: { maxItems: 10, maxTimeSec: 300, maxPairs: 15, maxDummyAnswers: 1, allowImages: true },
  GUESS_WORD_4PICS: { maxItems: 10, maxTimeSec: 300, allowImages: false },
  CROSSWORD: { maxItems: 5, maxTimeSec: 300, maxWords: 4, allowImages: false },
  questionBankPerTemplate: 5,
  live: { allowGroupMode: false, maxStudents: 45 },
});

export async function getTeacherPlan(userId) {
  let user;
  try {
    [[user]] = await pool.query(
      `SELECT institution_name, plan_code, plan_expires_at FROM users WHERE id=:id AND deleted_at IS NULL`,
      { id: userId }
    );
  } catch (error) {
    if (error?.code !== "ER_BAD_FIELD_ERROR") throw error;
    [[user]] = await pool.query(`SELECT institution_name FROM users WHERE id=:id AND deleted_at IS NULL`, { id: userId });
    const legacyInstitution = String(user?.institution_name || "").trim();
    return { code: legacyInstitution ? "INSTITUTION" : "BASIC", institutionName: legacyInstitution || null, expiresAt: null, limits: legacyInstitution ? null : BASIC_LIMITS };
  }
  if (!user) return { code: "BASIC", institutionName: null, limits: BASIC_LIMITS };
  const directCode = String(user.plan_code || "BASIC");
  const directActive = directCode !== "BASIC" && user.plan_expires_at && new Date(user.plan_expires_at).getTime() > Date.now();
  if (directActive) return { code: directCode, institutionName: user.institution_name || null, expiresAt: user.plan_expires_at, limits: null };
  const institutionName = String(user.institution_name || "").trim();
  if (institutionName) {
    const [[admin]] = await pool.query(`SELECT plan_expires_at FROM users WHERE role='ADMIN' AND institution_name=:institution AND plan_code='INSTITUTION' AND plan_expires_at>NOW() AND deleted_at IS NULL AND is_active=1 ORDER BY plan_expires_at DESC LIMIT 1`, { institution: institutionName });
    if (admin) return { code: "INSTITUTION", institutionName, expiresAt: admin.plan_expires_at, limits: null };
  }
  return { code: "BASIC", institutionName: institutionName || null, expiresAt: null, limits: BASIC_LIMITS };
}
