/* FILE GUIDE:
 * server/src/modules/sessions/sessions.controller.js
 * Purpose: REST endpoints for creating sessions, joining/rejoining, loading host/student state, and related session actions.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import { pool } from "../../db.js";
import { makeJoinCode, makeReconnectKey } from "../../utils/codes.js";
import { resolveThinkSpellWordBank } from "../quizzes/templates/thinkspell/thinkSpell.js";
import { normalizeTemplateType } from "../quizzes/templates.js";
import { buildFullAnalyticsData } from "../analytics/analytics.controller.js";
import { BASIC_LIMITS, getTeacherPlan } from "../plans/plan.js";
import { hasDatabaseColumn } from "../../utils/schemaCompat.js";
import { getRememberedSessionBackground, normalizeSessionBackgroundKey, rememberSessionBackground } from "./sessionBackground.runtime.js";
import { markTutorialSession } from "./tutorialSession.runtime.js";

// Helper used throughout session logic because many DB fields store JSON as text.
function safeJson(v) {
  if (!v) return null;
  if (typeof v === "object") return v;
  try { return JSON.parse(v); } catch { return null; }
}


function normalizeChoiceValue(value) { return String(value ?? "").trim().toLowerCase(); }
function responseChoiceKeys(templateType, answer, config = {}) {
  const tt = normalizeTemplateType(templateType);
  if (tt === "TRUE_FALSE") {
    const value = normalizeChoiceValue(answer?.choice);
    return value === "true" ? ["0"] : value === "false" ? ["1"] : [];
  }
  if (tt !== "MCQ") return [];
  const options = Array.isArray(config?.options) ? config.options : [];
  const selected = Array.isArray(answer?.choices) ? answer.choices : [answer?.choice].filter((value) => value !== undefined && value !== null && value !== "");
  const keys = [];
  for (const choice of selected) {
    const actual = normalizeChoiceValue(choice);
    const index = options.findIndex((option, optionIndex) => {
      const row = option && typeof option === "object" ? option : { text: String(option ?? ""), id: `option-${optionIndex + 1}` };
      return [row.id, row.text, row.label].some((value) => normalizeChoiceValue(value) === actual);
    });
    if (index >= 0) keys.push(String(index));
  }
  return Array.from(new Set(keys));
}
function sortScoreRows(rows, templateType) {
  const timedTemplates = new Set(["TYPE_ANSWER", "MATCHING", "GUESS_WORD_4PICS", "THINK_SPELL"]);
  return [...rows].sort((a, b) => {
    const points = Number(b.total_points || 0) - Number(a.total_points || 0);
    if (points) return points;
    if (timedTemplates.has(normalizeTemplateType(templateType))) {
      const aTime = Number(a.completion_ms ?? Number.MAX_SAFE_INTEGER);
      const bTime = Number(b.completion_ms ?? Number.MAX_SAFE_INTEGER);
      if (aTime !== bTime) return aTime - bTime;
    }
    return `${a.last_name || ""} ${a.first_name || ""}`.localeCompare(`${b.last_name || ""} ${b.first_name || ""}`);
  });
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// When a live session is created, we snapshot the quiz questions so later edits do not change an already-running session.
async function buildQuestionsSnapshot(quizId, randomizeQuestions, shuffleAnswers) {
  const [[quizMeta]] = await pool.query(
    `SELECT template_type FROM quizzes WHERE id=:qid AND deleted_at IS NULL`,
    { qid: quizId }
  );
  const isThinkSpell = normalizeTemplateType(quizMeta?.template_type) === "THINK_SPELL";

  const [rows] = await pool.query(
    `SELECT id, question_order, prompt, config_json, correct_json
     FROM quiz_questions WHERE quiz_id=:qid AND deleted_at IS NULL ORDER BY question_order ASC`,
    { qid: quizId }
  );

  let questions = rows.map((q) => {
    const config_json = safeJson(q.config_json) || {};
    const correct_json = safeJson(q.correct_json) || {};
    if (isThinkSpell) {
      const answers = resolveThinkSpellWordBank({ config: config_json, correct: correct_json });
      if (answers.length) {
        config_json.answers = answers;
        correct_json.answers = answers;
      }
    }
    return { ...q, config_json, correct_json };
  });
  if (randomizeQuestions) questions = shuffle(questions);
  if (shuffleAnswers) {
    questions = questions.map((q) => {
      const cfg = { ...(q.config_json || {}) };
      const template = normalizeTemplateType(quizMeta?.template_type);
      if (template === "MCQ" && Array.isArray(cfg.options)) cfg.options = shuffle(cfg.options);
      if (template === "MATCHING") cfg.shuffleColA = true;
      return { ...q, config_json: cfg };
    });
  }
  return questions;
}

// Creates a live session from one published quiz. This is the main bridge between the builder and real-time gameplay.
export async function createSession(req, res) {
  const { quizId, joinMode = "SOLO", classId = null, backgroundKey = null, tutorialDemo = false } = req.body;
  const hasRequestedBackground = /^background-(?:0[1-9]|1[0-9]|2[0-2])$/.test(String(backgroundKey || ""));
  const safeBackgroundKey = normalizeSessionBackgroundKey(backgroundKey);
  const plan = await getTeacherPlan(req.user.sub);
  if (plan.code === "BASIC" && joinMode === "GROUP") {
    return res.status(403).json({ message: "Group mode is available on the Institution plan." });
  }

  const quizzesHaveBackground = await hasDatabaseColumn("quizzes", "background_key");
  const sessionsHaveBackground = await hasDatabaseColumn("sessions", "background_key");
  const [[quiz]] = await pool.query(
    `SELECT id, class_id, status, randomize_questions, shuffle_answers, delivery_mode,
            ${quizzesHaveBackground ? "background_key" : "NULL AS background_key"}
     FROM quizzes
     WHERE id=:qid AND teacher_id=:tid AND deleted_at IS NULL`,
    { qid: quizId, tid: req.user.sub }
  );
  if (!quiz) return res.status(404).json({ message: "Quiz not found" });
  if (quiz.status !== "PUBLISHED") return res.status(400).json({ message: "Only published live-session quizzes can be hosted." });
  if (quiz.delivery_mode === "ASYNCHRONOUS") return res.status(400).json({ message: "Asynchronous quizzes appear in the student dashboard instead of live sessions." });

  const [[active]] = await pool.query(
    `SELECT id, join_code, join_mode FROM sessions WHERE quiz_id=:qid AND teacher_id=:tid AND status IN ('LOBBY','LIVE','PAUSED') ORDER BY id DESC LIMIT 1`,
    { qid: quizId, tid: req.user.sub }
  );
  if (active) {
    if (tutorialDemo) markTutorialSession(active.id, true);
    if (hasRequestedBackground) {
      rememberSessionBackground(active.id, safeBackgroundKey);
      if (sessionsHaveBackground) {
        await pool.query(`UPDATE sessions SET background_key=:backgroundKey WHERE id=:sid`, { sid: active.id, backgroundKey: safeBackgroundKey });
      }
      if (quizzesHaveBackground) {
        await pool.query(`UPDATE quizzes SET background_key=:backgroundKey WHERE id=:qid AND teacher_id=:tid`, { qid: quizId, tid: req.user.sub, backgroundKey: safeBackgroundKey });
      }
    }
    return res.status(200).json({ id: active.id, joinCode: active.join_code, joinMode: active.join_mode, existing: true });
  }

  let code = makeJoinCode();
  for (let i = 0; i < 3; i++) {
    const [c] = await pool.query(`SELECT id FROM sessions WHERE join_code=:code`, { code });
    if (!c.length) break;
    code = makeJoinCode();
  }

  let selectedClassId = null;
  if (req.user.role !== "GUEST_HOST") {
    if (!classId) return res.status(400).json({ message: "Choose a class before starting the live session." });
    const [[ownedClass]] = await pool.query(
      `SELECT id FROM classes WHERE id=:cid AND teacher_id=:tid AND deleted_at IS NULL LIMIT 1`,
      { cid: classId, tid: req.user.sub }
    );
    if (!ownedClass) return res.status(400).json({ message: "The selected class is not available." });
    selectedClassId = Number(ownedClass.id);
  }

  // Live sessions always keep the teacher's authored question order. Question
  // randomization is assignment-only, and answer-choice shuffling is performed
  // per participant in the student client so every learner/guest gets their own
  // stable permutation instead of one shared shuffle for the whole room.
  const snapshot = await buildQuestionsSnapshot(quizId, false, false);
  // Capacity is now automatic instead of being exposed as a teacher-facing field.
  const maxCap = plan.code === "BASIC" ? BASIC_LIMITS.live.maxStudents : null;

  const insertSql = sessionsHaveBackground
    ? `INSERT INTO sessions(quiz_id, teacher_id, class_id, join_code, join_mode, max_participants, status, questions_snapshot_json, background_key)
       VALUES(:qid,:tid,:cid,:code,:mode,:maxCap,'LOBBY',:snapshot,:backgroundKey)`
    : `INSERT INTO sessions(quiz_id, teacher_id, class_id, join_code, join_mode, max_participants, status, questions_snapshot_json)
       VALUES(:qid,:tid,:cid,:code,:mode,:maxCap,'LOBBY',:snapshot)`;
  const [r] = await pool.query(insertSql,
    { qid: quizId, tid: req.user.sub, cid: selectedClassId, code, mode: joinMode, maxCap, snapshot: JSON.stringify(snapshot), backgroundKey: safeBackgroundKey }
  );
  rememberSessionBackground(r.insertId, safeBackgroundKey);
  if (tutorialDemo) markTutorialSession(r.insertId, true);

  await pool.query(
    quizzesHaveBackground
      ? `UPDATE quizzes SET status='IN_SESSION', background_key=:backgroundKey WHERE id=:qid AND teacher_id=:tid AND deleted_at IS NULL`
      : `UPDATE quizzes SET status='IN_SESSION' WHERE id=:qid AND teacher_id=:tid AND deleted_at IS NULL`,
    { qid: quizId, tid: req.user.sub, backgroundKey: safeBackgroundKey }
  );

  res.status(201).json({ id: r.insertId, joinCode: code, joinMode, maxParticipants: maxCap });
}

export async function listActiveSessions(req, res) {
  const [rows] = await pool.query(
    `SELECT s.id, s.quiz_id, s.join_code, s.join_mode, s.max_participants, s.status, s.class_id, s.created_at, s.started_at,
            q.title AS quiz_title, c.name AS class_name
     FROM sessions s
     JOIN quizzes q ON q.id = s.quiz_id
     LEFT JOIN classes c ON c.id = s.class_id
     WHERE s.teacher_id=:tid AND s.status IN ('LOBBY','LIVE','PAUSED')
     ORDER BY s.id DESC`,
    { tid: req.user.sub }
  );
  res.json(rows);
}

export async function getSession(req, res) {
  const [s] = await pool.query(
    `SELECT * FROM sessions WHERE id=:id AND teacher_id=:tid`,
    { id: req.params.id, tid: req.user.sub }
  );
  if (!s.length) return res.status(404).json({ message: "Session not found" });
  res.json(s[0]);
}

// Teacher state endpoint hydrates the host panel with session info, snapshot questions, roster, groups, and scores.
export async function getSessionStateTeacher(req, res) {
  const sessionId = Number(req.params.id);

  const sessionsHaveBackground = await hasDatabaseColumn("sessions", "background_key");
  const quizzesHaveBackground = await hasDatabaseColumn("quizzes", "background_key");
  const backgroundSelect = sessionsHaveBackground && quizzesHaveBackground
    ? "COALESCE(s.background_key, q.background_key) AS resolved_background_key,"
    : sessionsHaveBackground
      ? "s.background_key AS resolved_background_key,"
      : quizzesHaveBackground
        ? "q.background_key AS resolved_background_key,"
        : "NULL AS resolved_background_key,";
  const [[session]] = await pool.query(
  `SELECT s.*, UNIX_TIMESTAMP(s.question_started_at) AS question_started_unix,
          ${backgroundSelect} q.title AS quiz_title, q.template_type, q.time_limit_sec, q.points_per_question, q.shuffle_answers, q.randomize_questions,
          CASE WHEN u.email LIKE '%@thinkwave.guest' THEN 1 ELSE 0 END AS is_guest_host
   FROM sessions s
   JOIN quizzes q ON q.id=s.quiz_id
   JOIN users u ON u.id=s.teacher_id
   WHERE s.id=:sid AND s.teacher_id=:tid`,
  { sid: sessionId, tid: req.user.sub }
  );
  if (!session) return res.status(404).json({ message: "Session not found" });
  session.background_key = normalizeSessionBackgroundKey(
  session.resolved_background_key || session.background_key || getRememberedSessionBackground(sessionId)
  );
  delete session.resolved_background_key;

  const questions = safeJson(session.questions_snapshot_json) || [];
  const currentQ = questions[Number(session.current_question_index || 0)] || null;
  const qLimit = Number(currentQ?.config_json?.timeLimitSec || session.time_limit_sec || 0);
  session.server_now = new Date().toISOString();
  const startedUnixSec = session.question_started_unix != null ? Number(session.question_started_unix) : null;
  session.question_started_at = startedUnixSec != null ? new Date(startedUnixSec * 1000).toISOString() : null;
  session.question_deadline_at = startedUnixSec != null && qLimit > 0 ? new Date((startedUnixSec + qLimit) * 1000).toISOString() : null;
  delete session.question_started_unix; 
  const [participants] = await pool.query(
    `SELECT p.id, p.first_name, p.last_name, p.connected, p.join_type, p.group_name,
            p.kicked_at, p.kick_reason, COALESCE(stp.profile_image, u.profile_image) AS profile_image,
            gm.group_id, sg.display_name AS assigned_group_name, sg.default_name AS assigned_group_default_name,
            COUNT(te.id) AS tab_out_count
     FROM session_participants p
     LEFT JOIN users u ON u.id=p.student_user_id
     LEFT JOIN student_profiles stp ON stp.user_id=p.student_user_id
     LEFT JOIN session_group_members gm ON gm.participant_id = p.id
     LEFT JOIN session_groups sg ON sg.id = gm.group_id
     LEFT JOIN tab_events te ON te.session_id=p.session_id AND te.participant_id=p.id
     WHERE p.session_id=:sid
     GROUP BY p.id, gm.group_id, sg.display_name, sg.default_name, stp.profile_image, u.profile_image
     ORDER BY p.last_name ASC, p.first_name ASC, p.id ASC`,
    { sid: sessionId }
  );

  let scores;
  if (session.join_mode === "GROUP") {
    const [rows] = await pool.query(
      `SELECT MIN(sp.id) AS participant_id, COALESCE(sg.display_name, sg.default_name) AS group_name, MAX(COALESCE(sc.total_points,0)) AS total_points,
              MIN(sp.first_name) AS first_name, MIN(sp.last_name) AS last_name,
              CASE WHEN MAX(r.answered_at) IS NULL THEN NULL
                   ELSE TIMESTAMPDIFF(MICROSECOND, COALESCE(session_row.started_at, MIN(sp.joined_at)), MAX(r.answered_at)) / 1000 END AS completion_ms
       FROM session_groups sg
       JOIN sessions session_row ON session_row.id=sg.session_id
       LEFT JOIN session_group_members gm ON gm.group_id = sg.id
       LEFT JOIN session_participants sp ON sp.id = gm.participant_id
       LEFT JOIN scores sc ON sc.session_id = sg.session_id AND sc.participant_id = sp.id
       LEFT JOIN responses r ON r.session_id=sg.session_id AND r.participant_id=sp.id
       WHERE sg.session_id=:sid
       GROUP BY sg.id, sg.display_name, sg.default_name, session_row.started_at`,
      { sid: sessionId }
    );
    scores = sortScoreRows(rows, session.template_type);
  } else {
    const [rows] = await pool.query(
      `SELECT sc.participant_id, sc.total_points, p.first_name, p.last_name, p.group_name,
              CASE WHEN MAX(r.answered_at) IS NULL THEN NULL
                   ELSE TIMESTAMPDIFF(MICROSECOND, COALESCE(session_row.started_at, p.joined_at), MAX(r.answered_at)) / 1000 END AS completion_ms
       FROM scores sc
       JOIN session_participants p ON p.id=sc.participant_id
       JOIN sessions session_row ON session_row.id=sc.session_id
       LEFT JOIN responses r ON r.session_id=sc.session_id AND r.participant_id=sc.participant_id
       WHERE sc.session_id=:sid
       GROUP BY sc.participant_id, sc.total_points, p.first_name, p.last_name, p.group_name, session_row.started_at, p.joined_at`,
      { sid: sessionId }
    );
    scores = sortScoreRows(rows, session.template_type);
  }

  const [groups] = await pool.query(
    `SELECT g.id, g.session_id, g.group_order, g.default_name, g.display_name, g.name_editor_participant_id,
            COALESCE(
              CONCAT(
                '[',
                GROUP_CONCAT(
                  CASE WHEN m.participant_id IS NULL THEN NULL ELSE JSON_OBJECT(
                    'id', p.id,
                    'first_name', p.first_name,
                    'last_name', p.last_name,
                    'connected', p.connected
                  ) END
                  ORDER BY p.last_name ASC, p.first_name ASC, p.id ASC
                  SEPARATOR ','
                ),
                ']'
              ),
              '[]'
            ) AS members_json
     FROM session_groups g
     LEFT JOIN session_group_members m ON m.group_id = g.id
     LEFT JOIN session_participants p ON p.id = m.participant_id
     WHERE g.session_id=:sid
     GROUP BY g.id
     ORDER BY g.group_order ASC`,
    { sid: sessionId }
  );

  const choiceCounts = {};
  if (currentQ && ["MCQ", "TRUE_FALSE"].includes(normalizeTemplateType(session.template_type))) {
    const [responseRows] = await pool.query(
      `SELECT answer_json FROM responses WHERE session_id=:sid AND question_id=:qid`,
      { sid: sessionId, qid: currentQ.id }
    );
    for (const row of responseRows) {
      for (const key of responseChoiceKeys(session.template_type, safeJson(row.answer_json) || {}, currentQ.config_json || {})) {
        choiceCounts[key] = Number(choiceCounts[key] || 0) + 1;
      }
    }
  }

  res.json({
    session,
    questions,
    participants,
    choiceCounts,
    groups: groups.map((g) => ({
      ...g,
      members: (safeJson(g.members_json) || []).filter(Boolean),
    })),
    scores,
  });
}

export async function startSession(req, res) {
  const sessionId = Number(req.params.id);
  const [[session]] = await pool.query(`SELECT * FROM sessions WHERE id=:sid AND teacher_id=:tid`, { sid: sessionId, tid: req.user.sub });
  if (!session) return res.status(404).json({ message: "Session not found" });

  if (session.join_mode === "GROUP") {
    const [[counts]] = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM session_groups WHERE session_id=:sid) AS group_count,
         (SELECT COUNT(*) FROM session_participants WHERE session_id=:sid) AS participant_count,
         (SELECT COUNT(*)
            FROM session_participants p
            LEFT JOIN session_group_members gm ON gm.participant_id = p.id
           WHERE p.session_id=:sid AND gm.id IS NULL) AS unassigned_count`,
      { sid: sessionId }
    );
    if (!counts.group_count) return res.status(400).json({ message: "Create at least one group before starting." });
    if (counts.participant_count > 0 && counts.unassigned_count > 0) {
      return res.status(400).json({ message: "Assign all joined students to a group before starting." });
    }
  }

  await pool.query(
    `UPDATE sessions
     SET status='LIVE', started_at=COALESCE(started_at,NOW()), question_started_at=DATE_ADD(NOW(), INTERVAL 3 SECOND), last_heartbeat_at=NOW()
     WHERE id=:sid AND teacher_id=:tid`,
    { sid: sessionId, tid: req.user.sub }
  );
  res.json({ ok: true });
}

export async function pauseSession(req, res) {
  await pool.query(
    `UPDATE sessions SET status='PAUSED' WHERE id=:sid AND teacher_id=:tid`,
    { sid: req.params.id, tid: req.user.sub }
  );
  res.json({ ok: true });
}

export async function endSession(req, res) {
  const sid = Number(req.params.id);
  await pool.query(
    `UPDATE sessions SET status='ENDED', ended_at=NOW() WHERE id=:sid AND teacher_id=:tid`,
    { sid, tid: req.user.sub }
  );
  await pool.query(
    `UPDATE quizzes q
     JOIN sessions s ON s.quiz_id = q.id
     SET q.status='BANKED'
     WHERE s.id=:sid AND s.teacher_id=:tid AND q.deleted_at IS NULL`,
    { sid, tid: req.user.sub }
  );
  res.json({ ok: true });
}

export async function getTeacherSessionHistory(req, res) {
  const teacherId = req.user.sub;

  const [rows] = await pool.query(
    `SELECT * FROM (
       SELECT
         CAST(s.id AS CHAR) AS id,
         s.quiz_id,
         s.join_code,
         s.join_mode,
         s.status,
         s.started_at,
         s.ended_at,
         q.title        AS quiz_title,
         q.template_type,
         q.category,
         s.class_id,
         c.name AS class_name,
         COALESCE(sc.avg_score, 0) AS avg_score,
         COALESCE(sc.max_score, 0) AS top_score,
         (CASE
            WHEN s.join_mode = 'GROUP' THEN (SELECT COUNT(*) FROM session_groups sg WHERE sg.session_id = s.id)
            ELSE (SELECT COUNT(*) FROM session_participants sp WHERE sp.session_id = s.id)
          END) AS participant_count,
         JSON_LENGTH(s.questions_snapshot_json) AS question_count,
         'LIVE' AS session_type
       FROM sessions s
       JOIN quizzes q ON q.id = s.quiz_id
       LEFT JOIN classes c ON c.id = s.class_id
       LEFT JOIN (
         SELECT session_id,
                ROUND(AVG(total_points), 2) AS avg_score,
                MAX(total_points) AS max_score
         FROM scores
         GROUP BY session_id
       ) sc ON sc.session_id = s.id
       WHERE s.teacher_id = :tid
         AND s.status = 'ENDED'
         AND s.ended_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)

       UNION ALL

       SELECT
         CONCAT('assigned-', q.id) AS id,
         q.id AS quiz_id,
         NULL AS join_code,
         'ASSIGNED' AS join_mode,
         'ENDED' AS status,
         q.available_from AS started_at,
         q.available_until AS ended_at,
         q.title AS quiz_title,
         q.template_type,
         q.category,
         q.class_id,
         c.name AS class_name,
         COALESCE(ROUND(AVG(a.score), 2), 0) AS avg_score,
         COALESCE(MAX(a.score), 0) AS top_score,
         COUNT(a.id) AS participant_count,
         (SELECT COUNT(*) FROM quiz_questions qq WHERE qq.quiz_id=q.id AND qq.deleted_at IS NULL) AS question_count,
         'ASSIGNED' AS session_type
       FROM quizzes q
       JOIN classes c ON c.id=q.class_id
       LEFT JOIN async_quiz_submissions a ON a.quiz_id=q.id
       WHERE q.teacher_id=:tid
         AND q.delivery_mode='ASYNCHRONOUS'
         AND q.deleted_at IS NULL
         AND q.available_until IS NOT NULL
         AND q.available_until <= NOW()
         AND q.available_until >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       GROUP BY q.id, q.title, q.template_type, q.category, q.class_id, c.name, q.available_from, q.available_until
     ) history_rows
     ORDER BY ended_at DESC`,
    { tid: teacherId }
  );

  const plan = await getTeacherPlan(teacherId);
  if (plan.code !== "BASIC" && rows.length) {
    await attachAdvancedHistoryInsights(rows, teacherId);
  }

  res.json(rows);
}

async function attachAdvancedHistoryInsights(rows, teacherId) {
  const liveRows = rows.filter((row) => row.session_type === "LIVE" && Number(row.id));
  const assignedRows = rows.filter((row) => row.session_type === "ASSIGNED" && Number(row.quiz_id));

  const liveIds = liveRows.map((row) => Number(row.id));
  if (liveIds.length) {
    const [sessionRows] = await pool.query(
      `SELECT id, questions_snapshot_json FROM sessions WHERE teacher_id=:tid AND id IN (:ids)`,
      { tid: teacherId, ids: liveIds }
    );
    const [scoreRows] = await pool.query(
      `SELECT sc.session_id, sc.total_points FROM scores sc JOIN sessions s ON s.id=sc.session_id WHERE s.teacher_id=:tid AND sc.session_id IN (:ids)`,
      { tid: teacherId, ids: liveIds }
    );
    const [responseRows] = await pool.query(
      `SELECT r.session_id,r.question_id,r.is_correct FROM responses r JOIN sessions s ON s.id=r.session_id WHERE s.teacher_id=:tid AND r.session_id IN (:ids)`,
      { tid: teacherId, ids: liveIds }
    );
    const snapshotMap = new Map(sessionRows.map((row) => [Number(row.id), safeJson(row.questions_snapshot_json) || []]));
    const scoreMap = groupRows(scoreRows, "session_id");
    const responseMap = groupRows(responseRows, "session_id");
    for (const row of liveRows) {
      const sid = Number(row.id);
      const questions = snapshotMap.get(sid) || [];
      const maxScore = questions.reduce((sum, question) => sum + questionMaxPoints(question), 0);
      row.below_50_count = maxScore > 0 ? (scoreMap.get(sid) || []).filter((score) => Number(score.total_points || 0) < maxScore * 0.5).length : 0;
      const accuracy = lowestQuestionAccuracy(questions, responseMap.get(sid) || []);
      row.insight_question_no = accuracy?.number || null;
      row.insight_question_accuracy = accuracy?.pct ?? null;
    }
  }

  const assignedIds = assignedRows.map((row) => Number(row.quiz_id));
  if (assignedIds.length) {
    const [questionRows] = await pool.query(
      `SELECT id,quiz_id,question_order FROM quiz_questions WHERE quiz_id IN (:ids) ORDER BY quiz_id,question_order`,
      { ids: assignedIds }
    );
    const [submissionRows] = await pool.query(
      `SELECT quiz_id,score,max_score,answers_json FROM async_quiz_submissions WHERE teacher_id=:tid AND quiz_id IN (:ids)`,
      { tid: teacherId, ids: assignedIds }
    );
    const questionMap = groupRows(questionRows, "quiz_id");
    const submissionMap = groupRows(submissionRows, "quiz_id");
    for (const row of assignedRows) {
      const qid = Number(row.quiz_id);
      const submissions = submissionMap.get(qid) || [];
      row.below_50_count = submissions.filter((submission) => Number(submission.max_score || 0) > 0 && Number(submission.score || 0) < Number(submission.max_score) * 0.5).length;
      const questions = questionMap.get(qid) || [];
      const aggregates = new Map(questions.map((question, index) => [Number(question.id), { number: Number(question.question_order || index + 1), correct: 0, total: 0 }]));
      for (const submission of submissions) {
        const answers = safeJson(submission.answers_json);
        for (const answer of Array.isArray(answers) ? answers : []) {
          const bucket = aggregates.get(Number(answer?.questionId));
          if (!bucket) continue;
          bucket.total += 1;
          if (answer?.isCorrect) bucket.correct += 1;
        }
      }
      const accuracy = Array.from(aggregates.values()).filter((item) => item.total > 0).map((item) => ({ ...item, pct: Number(((item.correct / item.total) * 100).toFixed(1)) })).sort((a, b) => a.pct - b.pct || a.number - b.number)[0];
      row.insight_question_no = accuracy?.number || null;
      row.insight_question_accuracy = accuracy?.pct ?? null;
    }
  }
}

function groupRows(rows, key) {
  const grouped = new Map();
  for (const row of rows || []) {
    const id = Number(row[key]);
    const list = grouped.get(id) || [];
    list.push(row);
    grouped.set(id, list);
  }
  return grouped;
}

function questionMaxPoints(question) {
  const config = safeJson(question?.config_json) || question?.config_json || {};
  const correct = safeJson(question?.correct_json) || question?.correct_json || {};
  const points = Math.max(1, Math.min(3, Number(config.points || 1)));
  const pairs = Array.isArray(correct.pairs) ? correct.pairs.length : 0;
  const words = Array.isArray(correct.answers) && correct.answers.length ? correct.answers.length : Array.isArray(config.answers) ? config.answers.length : 0;
  if (pairs) return points * pairs;
  if (words) return points * words;
  return points;
}

function lowestQuestionAccuracy(questions, responses) {
  const map = new Map((questions || []).map((question, index) => [Number(question.id), { number: Number(question.question_order || index + 1), correct: 0, total: 0 }]));
  for (const response of responses || []) {
    const bucket = map.get(Number(response.question_id));
    if (!bucket) continue;
    bucket.total += 1;
    if (response.is_correct) bucket.correct += 1;
  }
  return Array.from(map.values()).filter((item) => item.total > 0).map((item) => ({ ...item, pct: Number(((item.correct / item.total) * 100).toFixed(1)) })).sort((a, b) => a.pct - b.pct || a.number - b.number)[0] || null;
}

export async function getSessionFullAnalytics(req, res) {
  const sessionId = Number(req.params.id);
  const data = await buildFullAnalyticsData(sessionId, req.user.sub);
  if (!data) return res.status(404).json({ message: "Session not found" });
  const plan = await getTeacherPlan(req.user.sub);
  if (plan.code === "BASIC") {
    return res.json({
      session: data.session,
      summary: {
        participant_count: Number(data.summary?.participant_count || 0),
        avg_score: Number(data.summary?.avg_score || 0),
        min_score: Number(data.summary?.min_score || 0),
        max_score: Number(data.summary?.max_score || 0),
      },
      questions: (data.questions || []).map((question) => ({
        question_id: question.question_id,
        question_order: question.question_order,
        prompt: question.prompt,
        total_answers: question.total_answers,
        correct_answers: question.correct_answers,
        incorrect_answers: question.incorrect_answers,
        pct_correct: question.pct_correct,
        pct_incorrect: question.pct_incorrect,
      })),
      students: (data.students || []).map((student) => ({
        participant_id: student.participant_id,
        first_name: student.first_name,
        last_name: student.last_name,
        joined_at: student.joined_at,
        group_name: student.group_name,
        assigned_group_name: student.assigned_group_name,
        total_points: student.total_points,
      })),
    });
  }
  res.json({
    session: data.session,
    summary: data.summary,
    questions: data.questions,
    students: data.students,
  });
}

export async function joinSession(req, res) {
  const { code, firstName, lastName } = req.body;

  const [[session]] = await pool.query(
    `SELECT s.*, CASE WHEN u.email LIKE '%@thinkwave.guest' THEN 1 ELSE 0 END AS is_guest_host
     FROM sessions s JOIN users u ON u.id=s.teacher_id WHERE s.join_code=:code`,
    { code: code.toUpperCase() }
  );
  if (!session) return res.status(404).json({ message: "Invalid code / session not active" });
  if (session.status !== 'LOBBY') {
    const message = session.status === 'ENDED' ? 'Session has already ended.' : 'Session has already started.';
    return res.status(400).json({ message });
  }

  if (Number(session.max_participants || 0) > 0) {
    const [[countRow]] = await pool.query(`SELECT COUNT(*) AS total FROM session_participants WHERE session_id=:sid`, { sid: session.id });
    if (Number(countRow?.total || 0) >= Number(session.max_participants)) {
      return res.status(400).json({ message: 'Session is full.' });
    }
  }

  const reconnectKey = makeReconnectKey();
  const fn = (firstName || "").trim();
  const ln = (lastName || "").trim();
  if (!fn) return res.status(400).json({ message: "Please enter your first name." });

  const studentUserId = req.user?.role === "STUDENT" ? Number(req.user.sub) : null;
  const [r] = await pool.query(
    `INSERT INTO session_participants
       (session_id, first_name, last_name, reconnect_key, student_user_id, connected, join_type, group_name)
     VALUES(:sid, :fn, :ln, :rk, :studentUserId, 1, :jt, NULL)`,
    {
      sid: session.id,
      fn,
      ln,
      rk: reconnectKey,
      studentUserId,
      jt: session.join_mode,
    }
  );

  await pool.query(
    `INSERT INTO scores(session_id, participant_id, total_points) VALUES(:sid,:pid,0)`,
    { sid: session.id, pid: r.insertId }
  );

  res.json({
    sessionId: session.id,
    participantId: r.insertId,
    reconnectKey,
    joinMode: session.join_mode,
    isGuestHost: !!session.is_guest_host,
  });
}

export async function logTabEvent(req, res) {
  const { participantId } = req.body;
  const sessionId = Number(req.params.id);
  if (!participantId) return res.status(400).json({ message: "participantId required" });
  try {
    await pool.query(
      `INSERT INTO tab_events(session_id, participant_id) VALUES(:sid,:pid)`,
      { sid: sessionId, pid: participantId }
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: "Server error" });
  }
}

export async function getTabMonitoring(req, res) {
  const plan = await getTeacherPlan(req.user.sub);
  if (plan.code === "BASIC") {
    return res.status(403).json({ message: "Tab monitoring is available on the Institution plan." });
  }
  const sessionId = Number(req.params.id);
  try {
    const [rows] = await pool.query(
      `SELECT p.id AS participant_id,
              p.first_name, p.last_name, p.join_type, p.group_name,
              gm.group_id,
              sg.display_name AS assigned_group_name,
              COUNT(te.id) AS tab_out_count
       FROM session_participants p
       LEFT JOIN session_group_members gm ON gm.participant_id = p.id
       LEFT JOIN session_groups sg ON sg.id = gm.group_id
       LEFT JOIN tab_events te ON te.participant_id = p.id AND te.session_id = :sid
       WHERE p.session_id = :sid2
       GROUP BY p.id
       ORDER BY tab_out_count DESC, p.last_name ASC`,
      { sid: sessionId, sid2: sessionId }
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: "Server error" });
  }
}


export async function deleteTeacherSession(req, res) {
  const sid = Number(req.params.id);
  const [[session]] = await pool.query(`SELECT * FROM sessions WHERE id=:sid AND teacher_id=:tid`, { sid, tid: req.user.sub });
  if (!session) return res.status(404).json({ message: "Session not found" });
  await pool.query(`DELETE FROM tab_events WHERE session_id=:sid`, { sid });
  await pool.query(`DELETE gav FROM group_answer_votes gav JOIN group_answer_proposals gap ON gap.id = gav.proposal_id WHERE gap.session_id=:sid`, { sid });
  await pool.query(`DELETE FROM group_answer_proposals WHERE session_id=:sid`, { sid });
  await pool.query(`DELETE FROM responses WHERE session_id=:sid`, { sid });
  await pool.query(`DELETE FROM scores WHERE session_id=:sid`, { sid });
  await pool.query(`DELETE FROM session_group_members WHERE session_id=:sid`, { sid });
  await pool.query(`DELETE FROM session_groups WHERE session_id=:sid`, { sid });
  await pool.query(`DELETE FROM session_participants WHERE session_id=:sid`, { sid });
  await pool.query(`DELETE FROM sessions WHERE id=:sid`, { sid });
  res.json({ ok: true });
}
