/* FILE GUIDE:
 * server/src/modules/sessions/sessions.controller.js
 * Purpose: REST endpoints for creating sessions, joining/rejoining, loading host/student state, and related session actions.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import { pool } from "../../db.js";
import { makeJoinCode, makeReconnectKey } from "../../utils/codes.js";
import { resolveThinkSpellWordBank } from "../quizzes/thinkSpell.js";
import { normalizeTemplateType } from "../quizzes/templates.js";
import { buildFullAnalyticsData } from "../analytics/analytics.controller.js";
import { BASIC_LIMITS, getTeacherPlan } from "../plans/plan.js";

// Helper used throughout session logic because many DB fields store JSON as text.
function safeJson(v) {
  if (!v) return null;
  if (typeof v === "object") return v;
  try { return JSON.parse(v); } catch { return null; }
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
  const { quizId, joinMode = "SOLO", maxParticipants = null } = req.body;
  const plan = await getTeacherPlan(req.user.sub);
  if (plan.code === "BASIC" && joinMode === "GROUP") {
    return res.status(403).json({ message: "Group mode is available on the Institution plan." });
  }

  const [[quiz]] = await pool.query(
    `SELECT id, class_id, status, randomize_questions, shuffle_answers, delivery_mode
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
    return res.status(200).json({ id: active.id, joinCode: active.join_code, joinMode: active.join_mode, existing: true });
  }

  let code = makeJoinCode();
  for (let i = 0; i < 3; i++) {
    const [c] = await pool.query(`SELECT id FROM sessions WHERE join_code=:code`, { code });
    if (!c.length) break;
    code = makeJoinCode();
  }

  const snapshot = await buildQuestionsSnapshot(quizId, quiz.randomize_questions, quiz.shuffle_answers);

  const requestedCap = Number(maxParticipants || 0) > 0 ? Number(maxParticipants) : null;
  const maxCap = plan.code === "BASIC"
    ? Math.min(requestedCap || BASIC_LIMITS.live.maxStudents, BASIC_LIMITS.live.maxStudents)
    : requestedCap;

  const [r] = await pool.query(
    `INSERT INTO sessions(quiz_id, teacher_id, class_id, join_code, join_mode, max_participants, status, questions_snapshot_json)
     VALUES(:qid,:tid,:cid,:code,:mode,:maxCap,'LOBBY',:snapshot)`,
    { qid: quizId, tid: req.user.sub, cid: quiz.class_id ?? null, code, mode: joinMode, maxCap, snapshot: JSON.stringify(snapshot) }
  );

  await pool.query(
    `UPDATE quizzes SET status='IN_SESSION' WHERE id=:qid AND teacher_id=:tid AND deleted_at IS NULL`,
    { qid: quizId, tid: req.user.sub }
  );

  res.status(201).json({ id: r.insertId, joinCode: code, joinMode, maxParticipants: maxCap });
}

export async function listActiveSessions(req, res) {
  const [rows] = await pool.query(
    `SELECT s.id, s.quiz_id, s.join_code, s.join_mode, s.max_participants, s.status, s.class_id, s.created_at, s.started_at,
            q.title AS quiz_title
     FROM sessions s
     JOIN quizzes q ON q.id = s.quiz_id
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

  const [[session]] = await pool.query(
    `SELECT s.*, q.template_type, q.time_limit_sec, q.points_per_question, q.shuffle_answers, q.randomize_questions,
            CASE WHEN u.email LIKE '%@thinkwave.guest' THEN 1 ELSE 0 END AS is_guest_host
     FROM sessions s
     JOIN quizzes q ON q.id=s.quiz_id
     JOIN users u ON u.id=s.teacher_id
     WHERE s.id=:sid AND s.teacher_id=:tid`,
    { sid: sessionId, tid: req.user.sub }
  );
  if (!session) return res.status(404).json({ message: "Session not found" });

  const questions = safeJson(session.questions_snapshot_json) || [];
  const currentQ = questions[Number(session.current_question_index || 0)] || null;
  const qLimit = Number(currentQ?.config_json?.timeLimitSec || session.time_limit_sec || 0);
  session.server_now = new Date().toISOString();
  session.question_deadline_at = session.question_started_at && qLimit > 0 ? new Date(new Date(session.question_started_at).getTime() + qLimit * 1000).toISOString() : null;

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
              MIN(sp.first_name) AS first_name, MIN(sp.last_name) AS last_name
       FROM session_groups sg
       LEFT JOIN session_group_members gm ON gm.group_id = sg.id
       LEFT JOIN session_participants sp ON sp.id = gm.participant_id
       LEFT JOIN scores sc ON sc.session_id = sg.session_id AND sc.participant_id = sp.id
       WHERE sg.session_id=:sid
       GROUP BY sg.id, sg.display_name, sg.default_name
       ORDER BY total_points DESC, group_name ASC`,
      { sid: sessionId }
    );
    scores = rows;
  } else {
    const [rows] = await pool.query(
      `SELECT s.participant_id, s.total_points, p.first_name, p.last_name, p.group_name FROM scores s JOIN session_participants p ON p.id=s.participant_id WHERE s.session_id=:sid ORDER BY s.total_points DESC, p.last_name ASC, p.first_name ASC`,
      { sid: sessionId }
    );
    scores = rows;
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

  res.json({
    session,
    questions,
    participants,
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
     SET status='LIVE', started_at=COALESCE(started_at,NOW()), question_started_at=NOW(), last_heartbeat_at=NOW()
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
       GROUP BY q.id, q.title, q.template_type, q.category, q.class_id, c.name, q.available_from, q.available_until
     ) history_rows
     ORDER BY ended_at DESC`,
    { tid: teacherId }
  );

  res.json(rows);
}

export async function getSessionFullAnalytics(req, res) {
  // Revision 20: Basic and Institution teachers can both review per-question difficulty.
  const sessionId = Number(req.params.id);
  const data = await buildFullAnalyticsData(sessionId, req.user.sub);
  if (!data) return res.status(404).json({ message: "Session not found" });
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

  const [r] = await pool.query(
    `INSERT INTO session_participants
       (session_id, first_name, last_name, reconnect_key, connected, join_type, group_name)
     VALUES(:sid, :fn, :ln, :rk, 1, :jt, NULL)`,
    {
      sid: session.id,
      fn,
      ln,
      rk: reconnectKey,
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
  if (plan.code !== "INSTITUTION") {
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
