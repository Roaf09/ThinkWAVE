/* FILE GUIDE:
 * server/src/modules/student/student.controller.js
 * Purpose: Revision 6 student account dashboard, class joining, and asynchronous quiz submission.
 */

import { pool } from "../../db.js";
import { scoreAnswer, normalizeTemplateType } from "../quizzes/templates.js";

function safeJson(v) {
  if (!v) return null;
  if (typeof v === "object") return v;
  try { return JSON.parse(v); } catch { return null; }
}

function nowWithin(start, end) {
  const now = Date.now();
  const a = start ? new Date(start).getTime() : 0;
  const b = end ? new Date(end).getTime() : Number.MAX_SAFE_INTEGER;
  return now >= a && now <= b;
}

async function getProfile(userId) {
  const [[profile]] = await pool.query(`SELECT * FROM student_profiles WHERE user_id=:uid`, { uid: userId });
  return profile || null;
}

// Revision 6: stores the student's basic profile only once after their first class join.
export async function upsertProfile(req, res) {
  const { lastName, firstName, middleInitial, studentId } = req.body;
  await pool.query(
    `INSERT INTO student_profiles(user_id,last_name,first_name,middle_initial,student_id)
     VALUES(:uid,:ln,:fn,:mi,:sid)
     ON DUPLICATE KEY UPDATE last_name=:ln2, first_name=:fn2, middle_initial=:mi2, student_id=:sid2`,
    {
      uid: req.user.sub,
      ln: String(lastName || "").trim(),
      fn: String(firstName || "").trim(),
      mi: String(middleInitial || "").trim() || null,
      sid: String(studentId || "").trim(),
      ln2: String(lastName || "").trim(),
      fn2: String(firstName || "").trim(),
      mi2: String(middleInitial || "").trim() || null,
      sid2: String(studentId || "").trim(),
    }
  );
  res.json({ ok: true });
}

export async function getStudentDashboard(req, res) {
  const profile = await getProfile(req.user.sub);
  const [classes] = await pool.query(
    `SELECT e.id AS enrollment_id, e.class_id, e.student_id, e.first_name, e.last_name, e.middle_initial,
            c.name AS class_name, c.parent_id, u.first_name AS teacher_first_name, u.last_name AS teacher_last_name,
            p.name AS parent_name
     FROM class_enrollments e
     JOIN classes c ON c.id=e.class_id
     JOIN users u ON u.id=e.teacher_id
     LEFT JOIN classes p ON p.id=c.parent_id
     WHERE e.student_user_id=:uid AND e.removed_at IS NULL
     ORDER BY COALESCE(p.name,c.name) ASC, c.name ASC`,
    { uid: req.user.sub }
  );
  const [recentCompleted] = await pool.query(
    `SELECT a.id, a.quiz_id, q.title AS quiz_title, c.name AS class_name, a.score, a.max_score, a.submitted_at
     FROM async_quiz_submissions a
     JOIN quizzes q ON q.id=a.quiz_id
     JOIN classes c ON c.id=a.class_id
     WHERE a.student_user_id=:uid
     ORDER BY a.submitted_at DESC
     LIMIT 5`,
    { uid: req.user.sub }
  );
  const [assignments] = await pool.query(
    `SELECT q.id AS quiz_id, q.title, q.template_type, q.available_from, q.available_until,
            c.name AS class_name, c.id AS class_id,
            a.id AS submission_id, a.score, a.max_score, a.submitted_at
     FROM class_enrollments e
     JOIN quizzes q ON q.class_id=e.class_id AND q.delivery_mode='ASYNCHRONOUS' AND q.status IN ('PUBLISHED','BANKED') AND q.deleted_at IS NULL
     JOIN classes c ON c.id=q.class_id
     LEFT JOIN async_quiz_submissions a ON a.quiz_id=q.id AND a.student_user_id=e.student_user_id
     WHERE e.student_user_id=:uid AND e.removed_at IS NULL
     ORDER BY q.available_from DESC, q.id DESC`,
    { uid: req.user.sub }
  );
  res.json({ profile, classes, recentCompleted, assignments });
}

// Revision 6: students join a teacher class/section through a class code.
export async function joinClass(req, res) {
  const { classCode, profile } = req.body;
  const code = String(classCode || "").trim().toUpperCase();
  const [[folder]] = await pool.query(
    `SELECT id, teacher_id, name FROM classes WHERE class_code=:code AND deleted_at IS NULL LIMIT 1`,
    { code }
  );
  if (!folder) return res.status(404).json({ message: "Invalid class code." });

  let savedProfile = await getProfile(req.user.sub);
  if (!savedProfile) {
    if (!profile?.lastName || !profile?.firstName || !profile?.studentId) {
      return res.status(400).json({ message: "PROFILE_REQUIRED" });
    }
    await pool.query(
      `INSERT INTO student_profiles(user_id,last_name,first_name,middle_initial,student_id)
       VALUES(:uid,:ln,:fn,:mi,:sid)`,
      {
        uid: req.user.sub,
        ln: String(profile.lastName || "").trim(),
        fn: String(profile.firstName || "").trim(),
        mi: String(profile.middleInitial || "").trim() || null,
        sid: String(profile.studentId || "").trim(),
      }
    );
    savedProfile = await getProfile(req.user.sub);
  }

  await pool.query(
    `INSERT INTO class_enrollments(class_id,teacher_id,student_user_id,student_id,first_name,last_name,middle_initial,removed_at)
     VALUES(:cid,:tid,:uid,:sid,:fn,:ln,:mi,NULL)
     ON DUPLICATE KEY UPDATE removed_at=NULL, student_id=:sid2, first_name=:fn2, last_name=:ln2, middle_initial=:mi2`,
    {
      cid: folder.id,
      tid: folder.teacher_id,
      uid: req.user.sub,
      sid: savedProfile.student_id,
      fn: savedProfile.first_name,
      ln: savedProfile.last_name,
      mi: savedProfile.middle_initial,
      sid2: savedProfile.student_id,
      fn2: savedProfile.first_name,
      ln2: savedProfile.last_name,
      mi2: savedProfile.middle_initial,
    }
  );
  res.json({ ok: true, classId: folder.id, className: folder.name });
}

export async function getStudentClasses(req, res) {
  const [rows] = await pool.query(
    `SELECT e.id AS enrollment_id, e.class_id, e.student_id, e.first_name, e.last_name, e.middle_initial,
            c.name AS class_name, c.parent_id, p.name AS parent_name,
            u.first_name AS teacher_first_name, u.last_name AS teacher_last_name
     FROM class_enrollments e
     JOIN classes c ON c.id=e.class_id
     LEFT JOIN classes p ON p.id=c.parent_id
     JOIN users u ON u.id=e.teacher_id
     WHERE e.student_user_id=:uid AND e.removed_at IS NULL
     ORDER BY COALESCE(p.name,c.name) ASC, c.name ASC`,
    { uid: req.user.sub }
  );
  res.json(rows);
}

export async function getStudentQuiz(req, res) {
  const quizId = Number(req.params.quizId);
  const [[quiz]] = await pool.query(
    `SELECT q.*, c.name AS class_name,
            a.id AS submission_id, a.score, a.max_score, a.submitted_at
     FROM quizzes q
     JOIN classes c ON c.id=q.class_id
     JOIN class_enrollments e ON e.class_id=q.class_id AND e.student_user_id=:uid AND e.removed_at IS NULL
     LEFT JOIN async_quiz_submissions a ON a.quiz_id=q.id AND a.student_user_id=:uid2
     WHERE q.id=:qid AND q.delivery_mode='ASYNCHRONOUS' AND q.deleted_at IS NULL`,
    { uid: req.user.sub, uid2: req.user.sub, qid: quizId }
  );
  if (!quiz) return res.status(404).json({ message: "Quiz not found." });
  if (!nowWithin(quiz.available_from, quiz.available_until)) return res.status(403).json({ message: "This quiz is not open right now." });
  if (quiz.submission_id) return res.status(400).json({ message: "You already submitted this quiz." });

  const [questions] = await pool.query(
    `SELECT id, question_order, prompt, config_json
     FROM quiz_questions WHERE quiz_id=:qid AND deleted_at IS NULL ORDER BY question_order ASC`,
    { qid: quizId }
  );
  res.json({ quiz, questions: questions.map((q) => ({ ...q, config_json: safeJson(q.config_json) || {} })) });
}


export async function checkStudentQuizQuestion(req, res) {
  const quizId = Number(req.params.quizId);
  const questionId = Number(req.body.questionId);
  const answer = req.body.answer ?? null;
  const [[quiz]] = await pool.query(
    `SELECT q.* FROM quizzes q
     JOIN class_enrollments e ON e.class_id=q.class_id AND e.student_user_id=:uid AND e.removed_at IS NULL
     WHERE q.id=:qid AND q.delivery_mode='ASYNCHRONOUS' AND q.deleted_at IS NULL`,
    { uid: req.user.sub, qid: quizId }
  );
  if (!quiz) return res.status(404).json({ message: "Quiz not found." });
  if (!nowWithin(quiz.available_from, quiz.available_until)) return res.status(403).json({ message: "This quiz is outside the allowed time." });
  const [[existing]] = await pool.query(`SELECT id FROM async_quiz_submissions WHERE quiz_id=:qid AND student_user_id=:uid`, { qid: quizId, uid: req.user.sub });
  if (existing) return res.status(400).json({ message: "You already submitted this quiz." });

  const [[q]] = await pool.query(
    `SELECT id, config_json, correct_json FROM quiz_questions WHERE quiz_id=:qid AND id=:questionId AND deleted_at IS NULL LIMIT 1`,
    { qid: quizId, questionId }
  );
  if (!q) return res.status(404).json({ message: "Question not found." });
  const config = safeJson(q.config_json) || {};
  const correct = safeJson(q.correct_json) || {};
  const basePoints = Math.min(3, Math.max(1, Number(config.points || quiz.points_per_question || 1)));
  const result = scoreAnswer({ templateType: normalizeTemplateType(quiz.template_type), correct, answer, config, basePoints });
  res.json({
    ok: true,
    questionId,
    isCorrect: !!result.isCorrect,
    points: Number(result.pointsAwarded || 0),
    explanation: String(config.explanation || ""),
    difficulty: String(config.difficulty || ""),
  });
}

export async function submitStudentQuiz(req, res) {
  const quizId = Number(req.params.quizId);
  const answers = Array.isArray(req.body.answers) ? req.body.answers : [];
  const [[quiz]] = await pool.query(
    `SELECT q.* FROM quizzes q
     JOIN class_enrollments e ON e.class_id=q.class_id AND e.student_user_id=:uid AND e.removed_at IS NULL
     WHERE q.id=:qid AND q.delivery_mode='ASYNCHRONOUS' AND q.deleted_at IS NULL`,
    { uid: req.user.sub, qid: quizId }
  );
  if (!quiz) return res.status(404).json({ message: "Quiz not found." });
  if (!nowWithin(quiz.available_from, quiz.available_until)) return res.status(403).json({ message: "This quiz is outside the allowed time." });
  const [[existing]] = await pool.query(`SELECT id FROM async_quiz_submissions WHERE quiz_id=:qid AND student_user_id=:uid`, { qid: quizId, uid: req.user.sub });
  if (existing) return res.status(400).json({ message: "You already submitted this quiz." });

  const [questions] = await pool.query(
    `SELECT id, prompt, config_json, correct_json FROM quiz_questions WHERE quiz_id=:qid AND deleted_at IS NULL ORDER BY question_order ASC`,
    { qid: quizId }
  );
  const byId = new Map(answers.map((a) => [Number(a.questionId), a.answer]));
  let score = 0;
  let maxScore = 0;
  const checked = [];
  for (const q of questions) {
    const config = safeJson(q.config_json) || {};
    const correct = safeJson(q.correct_json) || {};
    const basePoints = Math.min(3, Math.max(1, Number(config.points || quiz.points_per_question || 1)));
    maxScore += basePoints;
    const answer = byId.get(Number(q.id)) ?? null;
    const result = scoreAnswer({ templateType: normalizeTemplateType(quiz.template_type), correct, answer, config, basePoints });
    const points = Number(result.pointsAwarded || 0);
    score += points;
    checked.push({ questionId: q.id, answer, isCorrect: !!result.isCorrect, points });
  }

  await pool.query(
    `INSERT INTO async_quiz_submissions(quiz_id,class_id,teacher_id,student_user_id,answers_json,score,max_score)
     VALUES(:qid,:cid,:tid,:uid,:answers,:score,:maxScore)`,
    { qid: quiz.id, cid: quiz.class_id, tid: quiz.teacher_id, uid: req.user.sub, answers: JSON.stringify(checked), score, maxScore }
  );
  res.json({ ok: true, score, maxScore });
}
