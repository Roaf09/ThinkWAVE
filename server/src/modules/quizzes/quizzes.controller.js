/* FILE GUIDE:
 * server/src/modules/quizzes/quizzes.controller.js
 * Purpose: Quiz CRUD, publish logic, bank/reuse helpers, and quiz-builder persistence.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import { pool } from "../../db.js";
import { normalizeTemplateType } from "./templates.js";
import { BASIC_LIMITS, getTeacherPlan, validateBasicQuestionPayload } from "../plans/plan.js";
import { hasDatabaseColumn } from "../../utils/schemaCompat.js";
import { normalizeQuizBackgroundKey, rememberQuizBackground } from "./quizBackground.runtime.js";

function toMysqlDateTime(value) {
  return value ? String(value).replace("T", " ") : null;
}

export async function listQuizzes(req, res) {
  const [rows] = await pool.query(
    `SELECT q.*,
       (SELECT COUNT(*) FROM quiz_questions qq WHERE qq.quiz_id=q.id AND qq.deleted_at IS NULL) AS question_count,
       (SELECT COALESCE(SUM(
          CASE
            WHEN q.template_type='MATCHING' THEN
              COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(qq.config_json, '$.points')) AS UNSIGNED), q.points_per_question)
              * COALESCE(JSON_LENGTH(JSON_EXTRACT(qq.correct_json, '$.pairs')), 0)
            WHEN q.template_type IN ('THINK_SPELL','THINK_AND_SPELL') THEN
              COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(qq.config_json, '$.points')) AS UNSIGNED), q.points_per_question)
              * COALESCE(JSON_LENGTH(JSON_EXTRACT(qq.correct_json, '$.answers')), JSON_LENGTH(JSON_EXTRACT(qq.config_json, '$.answers')), 0)
            ELSE COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(qq.config_json, '$.points')) AS UNSIGNED), q.points_per_question)
          END
        ), 0)
          FROM quiz_questions qq WHERE qq.quiz_id=q.id AND qq.deleted_at IS NULL) AS total_score
     FROM quizzes q
     WHERE q.teacher_id=:tid AND q.deleted_at IS NULL
     ORDER BY q.id DESC`,
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

  // Validate ownership and plan limits before opening the replacement transaction.
  const [q] = await pool.query(
    `SELECT id, template_type FROM quizzes WHERE id=:id AND teacher_id=:tid AND deleted_at IS NULL`,
    { id: quizId, tid: req.user.sub }
  );
  if (!q.length) return res.status(404).json({ message: "Quiz not found" });

  // The array position is the authoritative builder order. Normalizing it here
  // also prevents a malformed/retried client request from creating duplicate
  // active question_order values.
  const items = (Array.isArray(req.body.questions) ? req.body.questions : []).map((item, index) => ({
    ...item,
    order: index,
  }));
  const normalizedTemplate = normalizeTemplateType(q[0].template_type);
  if (normalizedTemplate === "MATCHING") {
    const invalidMatching = items.some((item) => {
      const colA = Array.isArray(item?.config?.colA) ? item.config.colA : [];
      const colB = Array.isArray(item?.config?.colB) ? item.config.colB : [];
      return colA.length < 2 || colB.length < colA.length;
    });
    if (invalidMatching) return res.status(400).json({ message: "Matching questions require at least 2 completed pairs." });
  }
  const plan = await getTeacherPlan(req.user.sub);
  if (plan.code === "BASIC") {
    const issue = validateBasicQuestionPayload(q[0].template_type, items);
    if (issue) return res.status(403).json({ message: issue });
  }

  // Serialize complete-question-set replacements on the parent quiz row. The
  // old implementation could interleave two near-simultaneous saves:
  // both requests soft-deleted first, then both inserted, leaving duplicates.
  // FOR UPDATE makes every save atomic and guarantees one active copy of the
  // submitted question set even when requests are retried or arrive late.
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [lockedQuiz] = await connection.query(
      `SELECT id FROM quizzes
       WHERE id=:id AND teacher_id=:tid AND deleted_at IS NULL
       FOR UPDATE`,
      { id: quizId, tid: req.user.sub }
    );
    if (!lockedQuiz.length) {
      await connection.rollback();
      return res.status(404).json({ message: "Quiz not found" });
    }

    await connection.query(
      `UPDATE quiz_questions SET deleted_at=NOW() WHERE quiz_id=:qid AND deleted_at IS NULL`,
      { qid: quizId }
    );

    for (const it of items) {
      await connection.query(
        `INSERT INTO quiz_questions(quiz_id, question_order, prompt, config_json, correct_json)
         VALUES(:qid,:ord,:prompt,:cfg,:corr)`,
        {
          qid: quizId,
          ord: it.order,
          prompt: it.prompt,
          cfg: it.config ? JSON.stringify(it.config) : null,
          corr: it.correct ? JSON.stringify(it.correct) : null,
        }
      );
    }

    await connection.commit();
    res.json({ ok: true });
  } catch (error) {
    try { await connection.rollback(); } catch {}
    throw error;
  } finally {
    connection.release();
  }
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

  if (quiz.status === "BANKED") return res.status(400).json({ message: "This quiz is already in the Quiz Bank." });
  const canonicalSourceId = Number(quiz.source_quiz_id || quiz.id);
  const [[existingCopy]] = await pool.query(
    `SELECT id FROM quizzes
     WHERE teacher_id=:tid AND status='BANKED' AND deleted_at IS NULL
       AND (source_quiz_id=:sourceId OR id=:sourceId2)
     LIMIT 1`,
    { sourceId: canonicalSourceId, sourceId2: canonicalSourceId, tid: teacherId }
  );
  if (existingCopy) return res.status(400).json({ message: "A quiz-bank copy already exists for this quiz." });

  const quizzesHaveBackground = await hasDatabaseColumn("quizzes", "background_key");
  const [created] = await pool.query(
    quizzesHaveBackground
      ? `INSERT INTO quizzes(teacher_id,class_id,source_quiz_id,title,category,template_type,time_limit_sec,points_per_question,randomize_questions,shuffle_answers,status,background_key)
         VALUES(:tid,:cid,:sourceId,:title,:cat,:tt,:tls,:ppq,:rq,:sa,'BANKED',:backgroundKey)`
      : `INSERT INTO quizzes(teacher_id,class_id,source_quiz_id,title,category,template_type,time_limit_sec,points_per_question,randomize_questions,shuffle_answers,status)
         VALUES(:tid,:cid,:sourceId,:title,:cat,:tt,:tls,:ppq,:rq,:sa,'BANKED')`,
    {
      tid: teacherId,
      cid: quiz.class_id ?? null,
      sourceId: canonicalSourceId,
      title: quiz.title,
      cat: quiz.category,
      tt: quiz.template_type,
      tls: quiz.time_limit_sec,
      ppq: quiz.points_per_question,
      rq: quiz.randomize_questions ? 1 : 0,
      sa: quiz.shuffle_answers ? 1 : 0,
      backgroundKey: quiz.background_key || "background-01",
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
        cfg: q.config_json != null ? JSON.stringify(q.config_json) : null,
        corr: q.correct_json != null ? JSON.stringify(q.correct_json) : null,
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

  const quizzesHaveBackground = await hasDatabaseColumn("quizzes", "background_key");
  const [created] = await pool.query(
    quizzesHaveBackground
      ? `INSERT INTO quizzes(teacher_id,class_id,source_quiz_id,title,category,template_type,time_limit_sec,points_per_question,randomize_questions,shuffle_answers,status,background_key)
         VALUES(:tid,:cid,:sourceId,:title,:cat,:tt,:tls,:ppq,:rq,:sa,'DRAFT',:backgroundKey)`
      : `INSERT INTO quizzes(teacher_id,class_id,source_quiz_id,title,category,template_type,time_limit_sec,points_per_question,randomize_questions,shuffle_answers,status)
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
      backgroundKey: quiz.background_key || "background-01",
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
        cfg: q.config_json != null ? JSON.stringify(q.config_json) : null,
        corr: q.correct_json != null ? JSON.stringify(q.correct_json) : null,
      }
    );
  }

  res.status(201).json({ ok: true, id: created.insertId });
}

export async function assignQuiz(req, res) {
  const quizId = Number(req.params.id);
  const teacherId = req.user.sub;
  const { classId, availableFrom, availableUntil, backgroundKey = null } = req.body;

  const [[quiz]] = await pool.query(
    `SELECT * FROM quizzes WHERE id=:id AND teacher_id=:tid AND deleted_at IS NULL`,
    { id: quizId, tid: teacherId }
  );
  if (!quiz) return res.status(404).json({ message: "Quiz not found." });
  if (!availableFrom || !availableUntil) return res.status(400).json({ message: "Start and end time are required." });
  const [[ownedClass]] = await pool.query(
    `SELECT id FROM classes WHERE id=:cid AND teacher_id=:tid AND deleted_at IS NULL LIMIT 1`,
    { cid: classId, tid: teacherId }
  );
  if (!ownedClass) return res.status(400).json({ message: "Choose an available class for this assignment." });

  const quizzesHaveBackground = await hasDatabaseColumn("quizzes", "background_key");
  const [created] = await pool.query(
    quizzesHaveBackground
      ? `INSERT INTO quizzes(teacher_id,class_id,source_quiz_id,title,category,template_type,time_limit_sec,points_per_question,randomize_questions,shuffle_answers,status,delivery_mode,available_from,available_until,background_key)
         VALUES(:tid,:cid,:sourceId,:title,:cat,:tt,:tls,:ppq,:rq,:sa,'PUBLISHED','ASYNCHRONOUS',:fromDt,:untilDt,:backgroundKey)`
      : `INSERT INTO quizzes(teacher_id,class_id,source_quiz_id,title,category,template_type,time_limit_sec,points_per_question,randomize_questions,shuffle_answers,status,delivery_mode,available_from,available_until)
         VALUES(:tid,:cid,:sourceId,:title,:cat,:tt,:tls,:ppq,:rq,:sa,'PUBLISHED','ASYNCHRONOUS',:fromDt,:untilDt)`,
    {
      tid: teacherId,
      cid: Number(ownedClass.id),
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
      backgroundKey: normalizeQuizBackgroundKey(backgroundKey || quiz.background_key),
    }
  );
  rememberQuizBackground(created.insertId, normalizeQuizBackgroundKey(backgroundKey || quiz.background_key));

  const [questions] = await pool.query(
    `SELECT question_order, prompt, config_json, correct_json
     FROM quiz_questions WHERE quiz_id=:qid AND deleted_at IS NULL ORDER BY question_order ASC`,
    { qid: quizId }
  );
  for (const q of questions) {
    await pool.query(
      `INSERT INTO quiz_questions(quiz_id, question_order, prompt, config_json, correct_json)
       VALUES(:qid,:ord,:prompt,:cfg,:corr)`,
      { qid: created.insertId, ord: q.question_order, prompt: q.prompt, cfg: q.config_json != null ? JSON.stringify(q.config_json) : null, corr: q.correct_json != null ? JSON.stringify(q.correct_json) : null }
    );
  }

  // Once scheduled, return the reusable source quiz to Quiz Bank rather than
  // leaving a second copy in the Sessions workspace.
  await pool.query(
    `UPDATE quizzes
     SET status='BANKED', class_id=NULL, updated_at=NOW()
     WHERE id=:id AND teacher_id=:tid AND deleted_at IS NULL`,
    { id: quizId, tid: teacherId }
  );

  res.status(201).json({ ok: true, id: created.insertId });
}

export async function reuseQuiz(req, res) {
  const classId = req.body.classId ?? null;
  await pool.query(
    `UPDATE quizzes
     SET status='PUBLISHED', class_id=:cid, updated_at=NOW()
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