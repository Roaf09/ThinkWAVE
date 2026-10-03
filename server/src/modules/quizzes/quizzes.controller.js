/* FILE GUIDE:
 * server/src/modules/quizzes/quizzes.controller.js
 * Purpose: Quiz CRUD, publish logic, bank/reuse helpers, and quiz-builder persistence.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import { pool } from "../../db.js";
import { parsePagination, pagedOrArray } from "../../utils/pagination.js";
import { normalizeTemplateType } from "./templates.js";
import { hasDatabaseColumn } from "../../utils/schemaCompat.js";
import { normalizeQuizBackgroundKey, rememberQuizBackground } from "./quizBackground.runtime.js";

function toMysqlDateTime(value) {
  return value ? String(value).replace("T", " ") : null;
}

// MariaDB has no native JSON column type (JSON is just a LONGTEXT alias there),
// so mysql2 always returns config_json/correct_json as a raw JSON *string*,
// never as a pre-parsed object. Whenever we copy a question's config/correct
// from one quiz_questions row into another (assign, duplicate, copy-to-bank),
// we must parse that string back into a real value before re-stringifying it
// for the new row. Skipping the parse step double-encodes the column (the
// stored value becomes a JSON string containing escaped JSON text instead of
// a JSON object), which silently empties things like MCQ `options` for every
// reader downstream. This helper is safe to use on a value that is already a
// genuine object too, so it works regardless of what the driver hands back.
function reencodeJsonColumn(value) {
  if (value == null) return null;
  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value));
    } catch {
      // Not valid JSON text - treat it as a literal string value.
      return JSON.stringify(value);
    }
  }
  return JSON.stringify(value);
}

export async function listQuizzes(req, res) {
  const { page, limit, offset, paged } = parsePagination(req, { defaultLimit: 50, maxLimit: 100 });
  const [rows] = await pool.query(
    `SELECT q.*,
       (SELECT COUNT(*) FROM quiz_questions qq WHERE qq.quiz_id=q.id AND qq.deleted_at IS NULL) AS question_count,
       (SELECT COALESCE(SUM(
          CASE
            WHEN q.template_type='MATCHING' THEN
              COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(qq.config_json, '$.points')) AS UNSIGNED), q.points_per_question)
              * COALESCE(JSON_LENGTH(JSON_EXTRACT(qq.correct_json, '$.pairs')), 0)
            WHEN q.template_type IN ('CROSSWORD','THINK_SPELL','THINK_AND_SPELL') THEN
              COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(qq.config_json, '$.points')) AS UNSIGNED), q.points_per_question)
              * COALESCE(JSON_LENGTH(JSON_EXTRACT(qq.correct_json, '$.answers')), JSON_LENGTH(JSON_EXTRACT(qq.config_json, '$.answers')), 0)
            ELSE COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(qq.config_json, '$.points')) AS UNSIGNED), q.points_per_question)
          END
        ), 0)
          FROM quiz_questions qq WHERE qq.quiz_id=q.id AND qq.deleted_at IS NULL) AS total_score
     FROM quizzes q
     WHERE q.teacher_id=:tid AND q.deleted_at IS NULL
     ORDER BY q.id DESC LIMIT :limit OFFSET :offset`,
    { tid: req.user.sub, limit, offset }
  );
  return pagedOrArray(res, rows, { page, limit, paged });
}

export async function createQuiz(req, res) {
  const b = req.body;
  // No plan restrictions: all users get full template features.
  const template = normalizeTemplateType(b.templateType);
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

  // Question points only ever take 1, 2, or 3 (integers). Coerce here (in
  // addition to route validation) so crafted/legacy payloads can never
  // persist outside that range.
  const coerceQuestionPoints = (value) => {
    const n = Math.round(Number(value));
    if (n === 2 || n === 3) return n;
    if (n === 1) return 1;
    if (Number.isFinite(n) && n > 3) return 3;
    return 1;
  };
  // The array position is the authoritative builder order. Normalizing it here
  // also prevents a malformed/retried client request from creating duplicate
  // active question_order values.
  const items = (Array.isArray(req.body.questions) ? req.body.questions : []).map((item, index) => {
    const next = { ...item, order: index };
    if (next?.config && typeof next.config === "object") {
      next.config = { ...next.config, points: coerceQuestionPoints(next.config.points ?? next.points) };
    }
    if (next?.points !== undefined) next.points = coerceQuestionPoints(next.points);
    return next;
  });
  // This handler always soft-deletes every existing question for the quiz
  // before inserting the submitted set (below). An empty/missing `questions`
  // payload - a malformed request, a stale client state, anything - would
  // otherwise wipe a quiz's real questions with nothing to replace them, and
  // the builder's own "no questions loaded" fallback (QuizBuilder.jsx) then
  // quietly shows a single blank question next time it's opened, which reads
  // to a teacher as "my saved, published quiz turned blank." The builder
  // never legitimately has zero questions to save, so refuse this outright
  // rather than let it destroy content.
  if (!items.length) return res.status(400).json({ message: "A quiz needs at least one question." });
  const normalizedTemplate = normalizeTemplateType(q[0].template_type);
  if (normalizedTemplate === "MATCHING") {
    const invalidMatching = items.some((item) => {
      const colA = Array.isArray(item?.config?.colA) ? item.config.colA : [];
      const colB = Array.isArray(item?.config?.colB) ? item.config.colB : [];
      return colA.length < 2 || colA.length > 15 || colB.length < colA.length;
    });
    if (invalidMatching) return res.status(400).json({ message: "Matching questions require at least 2 and at most 15 completed pairs." });
  }
  // No plan restrictions: all users get full template features.

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

    // Editing a Quiz Bank item promotes it to the top of the bank's newest-first order.
    await connection.query(`UPDATE quizzes SET updated_at=NOW() WHERE id=:qid`, { qid: quizId });

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
  const [[quiz]] = await pool.query(
    `SELECT id, status FROM quizzes WHERE id=:id AND teacher_id=:tid AND deleted_at IS NULL`,
    { id: req.params.id, tid: req.user.sub }
  );
  if (!quiz) return res.status(404).json({ message: "Quiz not found" });
  if (["PUBLISHED", "BANKED"].includes(String(quiz.status || "").toUpperCase())) {
    return res.json({ ok: true, status: quiz.status });
  }
  const [[count]] = await pool.query(
    `SELECT COUNT(*) AS c FROM quiz_questions WHERE quiz_id=:qid AND deleted_at IS NULL`,
    { qid: req.params.id }
  );
  if (Number(count?.c || 0) === 0) {
    return res.status(400).json({ message: "Add at least one question before publishing." });
  }
  const [r] = await pool.query(
    `UPDATE quizzes SET status='PUBLISHED' WHERE id=:id AND teacher_id=:tid`,
    { id: req.params.id, tid: req.user.sub }
  );
  if (!r.affectedRows) return res.status(404).json({ message: "Quiz not found" });
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
  if (!questions.length) {
    await pool.query(`DELETE FROM quizzes WHERE id=:id`, { id: created.insertId });
    return res.status(400).json({ message: "Add at least one question before copying to bank." });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const q of questions) {
      await conn.query(
        `INSERT INTO quiz_questions(quiz_id, question_order, prompt, config_json, correct_json)
       VALUES(:qid,:ord,:prompt,:cfg,:corr)`,
        {
          qid: created.insertId,
          ord: q.question_order,
          prompt: q.prompt,
          cfg: reencodeJsonColumn(q.config_json),
          corr: reencodeJsonColumn(q.correct_json),
        }
      );
    }
    await conn.commit();
  } catch (e) {
    try { await conn.rollback(); } catch {}
    try { await pool.query(`DELETE FROM quizzes WHERE id=:id`, { id: created.insertId }); } catch {}
    throw e;
  } finally {
    conn.release();
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
  if (!questions.length) {
    await pool.query(`DELETE FROM quizzes WHERE id=:id`, { id: created.insertId });
    return res.status(400).json({ message: "Add at least one question before duplicating." });
  }

  const conn2 = await pool.getConnection();
  try {
    await conn2.beginTransaction();
    for (const q of questions) {
      await conn2.query(
        `INSERT INTO quiz_questions(quiz_id, question_order, prompt, config_json, correct_json)
       VALUES(:qid,:ord,:prompt,:cfg,:corr)`,
        {
          qid: created.insertId,
          ord: q.question_order,
          prompt: q.prompt,
          cfg: reencodeJsonColumn(q.config_json),
          corr: reencodeJsonColumn(q.correct_json),
        }
      );
    }
    await conn2.commit();
  } catch (e) {
    try { await conn2.rollback(); } catch {}
    try { await pool.query(`DELETE FROM quizzes WHERE id=:id`, { id: created.insertId }); } catch {}
    throw e;
  } finally {
    conn2.release();
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
  const fromTime = new Date(String(availableFrom).replace(" ", "T")).getTime();
  const untilTime = new Date(String(availableUntil).replace(" ", "T")).getTime();
  if (Number.isNaN(fromTime) || Number.isNaN(untilTime)) return res.status(400).json({ message: "Start and end time are not valid." });
  if (untilTime <= fromTime) return res.status(400).json({ message: "End time must be after start time." });
  if (untilTime - fromTime > 7 * 24 * 60 * 60 * 1000) return res.status(400).json({ message: "Assignments can be open for up to 1 week only." });
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
  if (!questions.length) {
    await pool.query(`DELETE FROM quizzes WHERE id=:id`, { id: created.insertId });
    return res.status(400).json({ message: "Add at least one question before assigning." });
  }
  const conn3 = await pool.getConnection();
  try {
    await conn3.beginTransaction();
    for (const q of questions) {
      await conn3.query(
        `INSERT INTO quiz_questions(quiz_id, question_order, prompt, config_json, correct_json)
       VALUES(:qid,:ord,:prompt,:cfg,:corr)`,
        { qid: created.insertId, ord: q.question_order, prompt: q.prompt, cfg: reencodeJsonColumn(q.config_json), corr: reencodeJsonColumn(q.correct_json) }
      );
    }
    await conn3.commit();
  } catch (e) {
    try { await conn3.rollback(); } catch {}
    try { await pool.query(`DELETE FROM quizzes WHERE id=:id`, { id: created.insertId }); } catch {}
    throw e;
  } finally {
    conn3.release();
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
  // A reused quiz must come back as a fresh "Ready" card. If its previous life
  // left a lobby that never started (e.g. banked via Assign while a lobby was
  // open), that stale row would keep the Sessions tab showing "Active session"
  // for a session that never began. Close those; a session already in play
  // (LIVE/PAUSED) is left alone.
  await pool.query(
    `UPDATE sessions SET status='ENDED', ended_at=NOW()
      WHERE quiz_id=:id AND teacher_id=:tid AND status='LOBBY' AND started_at IS NULL`,
    { id: req.params.id, tid: req.user.sub }
  );
  await pool.query(
    `UPDATE quizzes
     SET status='PUBLISHED', class_id=:cid, updated_at=NOW()
     WHERE id=:id AND teacher_id=:tid AND deleted_at IS NULL`,
    { id: req.params.id, tid: req.user.sub, cid: classId }
  );
  res.json({ ok: true, status: 'PUBLISHED' });
}

export async function softDeleteQuiz(req, res) {
  const [r] = await pool.query(
    `UPDATE quizzes SET deleted_at=NOW() WHERE id=:id AND teacher_id=:tid`,
    { id: req.params.id, tid: req.user.sub }
  );
  if (!r.affectedRows) return res.status(404).json({ message: "Quiz not found" });
  res.json({ ok: true });
}

export async function restoreQuiz(req, res) {
  if (req.user.role === "ADMIN") {
    // Institution fence: an admin may only restore quizzes owned by teachers
    // of their own institution — never another school's content.
    const [[admin]] = await pool.query(`SELECT institution_name FROM users WHERE id=:id AND role='ADMIN'`, { id: req.user.sub });
    const inst = String(admin?.institution_name || "");
    if (!inst) return res.status(403).json({ message: "No institution." });
    await pool.query(
      `UPDATE quizzes q JOIN users t ON t.id=q.teacher_id
       SET q.deleted_at=NULL
       WHERE q.id=:id AND t.institution_name=:inst AND t.deleted_at IS NULL`,
      { id: req.params.id, inst }
    );
  } else {
    await pool.query(`UPDATE quizzes SET deleted_at=NULL WHERE id=:id AND teacher_id=:tid`, { id: req.params.id, tid: req.user.sub });
  }
  res.json({ ok: true });
}


export async function updateQuizMeta(req, res) {
  const { title } = req.body;
  const [r] = await pool.query(
    `UPDATE quizzes
     SET title = :title, updated_at = NOW()
     WHERE id = :id AND teacher_id = :tid AND deleted_at IS NULL`,
    {
      title,
      id: req.params.id,
      tid: req.user.sub,
    }
  );
  if (!r.affectedRows) return res.status(404).json({ message: "Quiz not found" });
  res.json({ ok: true });
}

export async function updateQuizSettings(req, res) {
  const { timeLimitSec, pointsPerQuestion, randomizeQuestions, shuffleAnswers } = req.body;
  const [[quiz]] = await pool.query(`SELECT template_type FROM quizzes WHERE id=:id AND teacher_id=:tid AND deleted_at IS NULL`, { id: req.params.id, tid: req.user.sub });
  if (!quiz) return res.status(404).json({ message: "Quiz not found" });
  // No plan restrictions: all users get full template features.
  await pool.query(
    `UPDATE quizzes
     SET time_limit_sec       = :tls,
         points_per_question  = :ppq,
         randomize_questions  = :rq,
         shuffle_answers      = :sa,
         updated_at           = NOW()
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