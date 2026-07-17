/* FILE GUIDE:
 * server/src/modules/quizzes/quizzes.controller.js
 * Purpose: Quiz CRUD, publish logic, bank/reuse helpers, and quiz-builder persistence.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import { pool } from "../../db.js";
import { normalizeTemplateType } from "./templates.js";
import { BASIC_LIMITS, getTeacherPlan, validateBasicQuestionPayload } from "../plans/plan.js";

function toMysqlDateTime(value) {
  // Revision 6: datetime-local inputs arrive as YYYY-MM-DDTHH:mm.
  return value ? String(value).replace("T", " ") : null;
}

export async function listQuizzes(req, res) {
  const [rows] = await pool.query(
    `SELECT * FROM quizzes WHERE teacher_id=:tid AND deleted_at IS NULL ORDER BY id DESC`,
    { tid: req.user.sub }
  );
  res.json(rows);
}

export async function createQuiz(req, res) {
  const b = req.body;
  const plan = await getTeacherPlan(req.user.sub);
  const template = normalizeTemplateType(b.templateType);
  const templateLimit = BASIC_LIMITS[template];
  if (plan.code === "BASIC" && templateLimit && Number(b.timeLimitSec) > templateLimit.maxTimeSec) {
    return res.status(403).json({ message: `Basic plan time limit is ${Math.round(templateLimit.maxTimeSec / 60)} minute${templateLimit.maxTimeSec > 60 ? "s" : ""} maximum for this template.` });
  }
  const [r] = await pool.query(
    `INSERT INTO quizzes(teacher_id,class_id,title,category,template_type,time_limit_sec,points_per_question,randomize_questions,shuffle_answers,delivery_mode,available_from,available_until)
     VALUES(:tid,:cid,:title,:cat,:tt,:tls,:ppq,:rq,:sa,:mode,:fromDt,:untilDt)`,
    {
      tid: req.user.sub,
      cid: b.classId ?? null,
      title: b.title,
      cat: b.category,
      tt: template,
      tls: b.timeLimitSec,
      ppq: b.pointsPerQuestion,
      rq: b.randomizeQuestions ? 1 : 0,
      sa: b.shuffleAnswers ? 1 : 0,
      // Revision 6: supports asynchronous quiz scheduling.
      mode: b.deliveryMode === "ASYNCHRONOUS" ? "ASYNCHRONOUS" : "SYNCHRONOUS",
      fromDt: b.deliveryMode === "ASYNCHRONOUS" ? toMysqlDateTime(b.availableFrom) : null,
      untilDt: b.deliveryMode === "ASYNCHRONOUS" ? toMysqlDateTime(b.availableUntil) : null
    }
  );
  res.status(201).json({ id: r.insertId });
}

export async function getQuiz(req, res) {
  const quizId = Number(req.params.id);
  const [q] = await pool.query(
    `SELECT * FROM quizzes WHERE id=:id AND teacher_id=:tid AND deleted_at IS NULL`,
    { id: quizId, tid: req.user.sub }
  );
  if (!q.length) return res.status(404).json({ message: "Quiz not found" });

  const quiz = { ...q[0], template_type: normalizeTemplateType(q[0].template_type) };

  const [questions] = await pool.query(
    `SELECT id, question_order, prompt, config_json, correct_json
     FROM quiz_questions WHERE quiz_id=:qid AND deleted_at IS NULL ORDER BY question_order ASC`,
    { qid: quizId }
  );

  res.json({ quiz, questions });
}

export async function upsertQuestions(req, res) {
  const quizId = Number(req.params.id);

  // ownership
  const [q] = await pool.query(
    `SELECT id, template_type FROM quizzes WHERE id=:id AND teacher_id=:tid AND deleted_at IS NULL`,
    { id: quizId, tid: req.user.sub }
  );
  if (!q.length) return res.status(404).json({ message: "Quiz not found" });

  const items = req.body.questions;
  const plan = await getTeacherPlan(req.user.sub);
  if (plan.code === "BASIC") {
    const issue = validateBasicQuestionPayload(q[0].template_type, items);
    if (issue) return res.status(403).json({ message: issue });
  }

  // simple strategy: soft-delete existing then insert fresh
  await pool.query(`UPDATE quiz_questions SET deleted_at=NOW() WHERE quiz_id=:qid AND deleted_at IS NULL`, { qid: quizId });

  for (const it of items) {
    await pool.query(
      `INSERT INTO quiz_questions(quiz_id, question_order, prompt, config_json, correct_json)
       VALUES(:qid,:ord,:prompt,:cfg,:corr)`,
      {
        qid: quizId,
        ord: it.order,
        prompt: it.prompt,
        cfg: it.config ? JSON.stringify(it.config) : null,
        corr: it.correct ? JSON.stringify(it.correct) : null
      }
    );
  }

  res.json({ ok: true });
}

export async function publishQuiz(req, res) {
  await pool.query(
    `UPDATE quizzes SET status='PUBLISHED' WHERE id=:id AND teacher_id=:tid`,
    { id: req.params.id, tid: req.user.sub }
  );
  res.json({ ok: true });
}

export async function copyQuizToBank(req, res) {
  const quizId = Number(req.params.id);
  const teacherId = req.user.sub;

  const [[quiz]] = await pool.query(
    `SELECT * FROM quizzes WHERE id=:id AND teacher_id=:tid AND deleted_at IS NULL`,
    { id: quizId, tid: teacherId }
  );
  if (!quiz) return res.status(404).json({ message: "Quiz not found" });

  const [[existingCopy]] = await pool.query(
    `SELECT id FROM quizzes WHERE source_quiz_id=:sourceId AND teacher_id=:tid AND status='BANKED' AND deleted_at IS NULL LIMIT 1`,
    { sourceId: quizId, tid: teacherId }
  );
  if (existingCopy) return res.status(400).json({ message: "A quiz-bank copy already exists for this quiz." });

  const [created] = await pool.query(
    `INSERT INTO quizzes(teacher_id,class_id,source_quiz_id,title,category,template_type,time_limit_sec,points_per_question,randomize_questions,shuffle_answers,status)
     VALUES(:tid,:cid,:sourceId,:title,:cat,:tt,:tls,:ppq,:rq,:sa,'BANKED')`,
    {
      tid: teacherId,
      cid: quiz.class_id ?? null,
      sourceId: quizId,
      title: quiz.title,
      cat: quiz.category,
      tt: quiz.template_type,
      tls: quiz.time_limit_sec,
      ppq: quiz.points_per_question,
      rq: quiz.randomize_questions ? 1 : 0,
      sa: quiz.shuffle_answers ? 1 : 0,
    }
  );

  const [questions] = await pool.query(
    `SELECT question_order, prompt, config_json, correct_json
     FROM quiz_questions WHERE quiz_id=:qid AND deleted_at IS NULL ORDER BY question_order ASC`,
    { qid: quizId }
  );

  for (const q of questions) {
    await pool.query(
      `INSERT INTO quiz_questions(quiz_id, question_order, prompt, config_json, correct_json)
       VALUES(:qid,:ord,:prompt,:cfg,:corr)`,
      {
        qid: created.insertId,
        ord: q.question_order,
        prompt: q.prompt,
        cfg: q.config_json,
        corr: q.correct_json,
      }
    );
  }

  res.status(201).json({ ok: true, status: 'BANKED', id: created.insertId });
}


export async function duplicateQuiz(req, res) {
  const quizId = Number(req.params.id);
  const teacherId = req.user.sub;

  const [[quiz]] = await pool.query(
    `SELECT * FROM quizzes WHERE id=:id AND teacher_id=:tid AND deleted_at IS NULL`,
    { id: quizId, tid: teacherId }
  );
  if (!quiz) return res.status(404).json({ message: "Quiz not found" });

  const [[existing]] = await pool.query(
    `SELECT id FROM quizzes WHERE source_quiz_id=:sourceId AND teacher_id=:tid AND status='DRAFT' AND deleted_at IS NULL LIMIT 1`,
    { sourceId: quizId, tid: teacherId }
  );
  if (existing) return res.status(400).json({ message: "Only one duplicate copy is allowed for each quiz." });

  const [created] = await pool.query(
    `INSERT INTO quizzes(teacher_id,class_id,source_quiz_id,title,category,template_type,time_limit_sec,points_per_question,randomize_questions,shuffle_answers,status)
     VALUES(:tid,:cid,:sourceId,:title,:cat,:tt,:tls,:ppq,:rq,:sa,'DRAFT')`,
    {
      tid: teacherId,
      cid: quiz.class_id ?? null,
      sourceId: quizId,
      title: `${quiz.title} (Copy)`,
      cat: quiz.category,
      tt: quiz.template_type,
      tls: quiz.time_limit_sec,
      ppq: quiz.points_per_question,
      rq: quiz.randomize_questions ? 1 : 0,
      sa: quiz.shuffle_answers ? 1 : 0,
    }
  );

  const [questions] = await pool.query(
    `SELECT question_order, prompt, config_json, correct_json
     FROM quiz_questions WHERE quiz_id=:qid AND deleted_at IS NULL ORDER BY question_order ASC`,
    { qid: quizId }
  );

  for (const q of questions) {
    await pool.query(
      `INSERT INTO quiz_questions(quiz_id, question_order, prompt, config_json, correct_json)
       VALUES(:qid,:ord,:prompt,:cfg,:corr)`,
      {
        qid: created.insertId,
        ord: q.question_order,
        prompt: q.prompt,
        cfg: q.config_json,
        corr: q.correct_json,
      }
    );
  }

  res.status(201).json({ ok: true, id: created.insertId });
}

// Revision 7: create an asynchronous assignment copy from an existing quiz.
export async function assignQuiz(req, res) {
  const quizId = Number(req.params.id);
  const teacherId = req.user.sub;
  const { availableFrom, availableUntil } = req.body;

  const [[quiz]] = await pool.query(
    `SELECT * FROM quizzes WHERE id=:id AND teacher_id=:tid AND deleted_at IS NULL`,
    { id: quizId, tid: teacherId }
  );
  if (!quiz) return res.status(404).json({ message: "Quiz not found." });
  if (!quiz.class_id) return res.status(400).json({ message: "Assign this quiz to a class folder first." });
  if (!availableFrom || !availableUntil) return res.status(400).json({ message: "Start and end time are required." });

  const [created] = await pool.query(
    `INSERT INTO quizzes(teacher_id,class_id,source_quiz_id,title,category,template_type,time_limit_sec,points_per_question,randomize_questions,shuffle_answers,status,delivery_mode,available_from,available_until)
     VALUES(:tid,:cid,:sourceId,:title,:cat,:tt,:tls,:ppq,:rq,:sa,'PUBLISHED','ASYNCHRONOUS',:fromDt,:untilDt)`,
    {
      tid: teacherId,
      cid: quiz.class_id,
      sourceId: quizId,
      title: quiz.title,
      cat: quiz.category,
      tt: quiz.template_type,
      tls: quiz.time_limit_sec,
      ppq: quiz.points_per_question,
      rq: quiz.randomize_questions ? 1 : 0,
      sa: quiz.shuffle_answers ? 1 : 0,
      fromDt: toMysqlDateTime(availableFrom),
      untilDt: toMysqlDateTime(availableUntil),
    }
  );

  const [questions] = await pool.query(
    `SELECT question_order, prompt, config_json, correct_json
     FROM quiz_questions WHERE quiz_id=:qid AND deleted_at IS NULL ORDER BY question_order ASC`,
    { qid: quizId }
  );
  for (const q of questions) {
    await pool.query(
      `INSERT INTO quiz_questions(quiz_id, question_order, prompt, config_json, correct_json)
       VALUES(:qid,:ord,:prompt,:cfg,:corr)`,
      { qid: created.insertId, ord: q.question_order, prompt: q.prompt, cfg: q.config_json, corr: q.correct_json }
    );
  }

  res.status(201).json({ ok: true, id: created.insertId });
}

export async function reuseQuiz(req, res) {
  const classId = req.body.classId ?? null;
  await pool.query(
    `UPDATE quizzes
     SET status='PUBLISHED', class_id=:cid
     WHERE id=:id AND teacher_id=:tid AND deleted_at IS NULL`,
    { id: req.params.id, tid: req.user.sub, cid: classId }
  );
  res.json({ ok: true, status: 'PUBLISHED' });
}

export async function softDeleteQuiz(req, res) {
  await pool.query(
    `UPDATE quizzes SET deleted_at=NOW() WHERE id=:id AND teacher_id=:tid`,
    { id: req.params.id, tid: req.user.sub }
  );
  res.json({ ok: true });
}

export async function restoreQuiz(req, res) {
  const where = req.user.role === "ADMIN" ? "id=:id" : "id=:id AND teacher_id=:tid";
  await pool.query(`UPDATE quizzes SET deleted_at=NULL WHERE ${where}`, { id: req.params.id, tid: req.user.sub });
  res.json({ ok: true });
}


export async function updateQuizMeta(req, res) {
  const { title } = req.body;
  await pool.query(
    `UPDATE quizzes
     SET title = :title
     WHERE id = :id AND teacher_id = :tid AND deleted_at IS NULL`,
    {
      title,
      id: req.params.id,
      tid: req.user.sub,
    }
  );
  res.json({ ok: true });
}

export async function updateQuizSettings(req, res) {
  const { timeLimitSec, pointsPerQuestion, randomizeQuestions, shuffleAnswers } = req.body;
  const [[quiz]] = await pool.query(`SELECT template_type FROM quizzes WHERE id=:id AND teacher_id=:tid AND deleted_at IS NULL`, { id: req.params.id, tid: req.user.sub });
  if (!quiz) return res.status(404).json({ message: "Quiz not found" });
  const plan = await getTeacherPlan(req.user.sub);
  const templateLimit = BASIC_LIMITS[normalizeTemplateType(quiz.template_type)];
  if (plan.code === "BASIC" && templateLimit && Number(timeLimitSec) > templateLimit.maxTimeSec) {
    return res.status(403).json({ message: `Basic plan time limit is ${Math.round(templateLimit.maxTimeSec / 60)} minute${templateLimit.maxTimeSec > 60 ? "s" : ""} maximum for this template.` });
  }
  await pool.query(
    `UPDATE quizzes
     SET time_limit_sec       = :tls,
         points_per_question  = :ppq,
         randomize_questions  = :rq,
         shuffle_answers      = :sa
     WHERE id = :id AND teacher_id = :tid AND deleted_at IS NULL`,
    {
      tls: timeLimitSec,
      ppq: pointsPerQuestion,
      rq:  randomizeQuestions ? 1 : 0,
      sa:  shuffleAnswers ? 1 : 0,
      id:  req.params.id,
      tid: req.user.sub,
    }
  );
  res.json({ ok: true });
}
