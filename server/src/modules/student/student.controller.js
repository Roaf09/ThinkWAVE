/* FILE GUIDE:
 * server/src/modules/student/student.controller.js
 */

import { pool, queryRetryingDeadlock } from "../../db.js";
import { scoreAnswer, normalizeTemplateType } from "../quizzes/templates.js";
import { makeReconnectKey } from "../../utils/codes.js";
import { getRememberedQuizBackground, normalizeQuizBackgroundKey } from "../quizzes/quizBackground.runtime.js";
import { calculateCompetitivePoints } from "../sessions/leaderboard.js";
import { toStudentQuestion, toCanonicalMatchingAnswer, assignmentScope, liveScope } from "../quizzes/studentView.js";
import { getIO } from "../../socketRegistry.js";
import { broadcastAssignmentLeaderboard } from "./assignment.socket.js";
import { compressDataUrlImage, isDataUrl } from "../../utils/imageStore.js";

// Server-tracked assignment progress: when each question was opened/locked.
// opened_at is set once (INSERT IGNORE) so reloads can't restart the clock;
// locked_at + answer are set once so reloads can't unlock. Anything never
// locked scores as timed out in finalizeAssignment.
let asyncAnswerTableReady = false;
async function ensureAsyncAnswerTable() {
  if (asyncAnswerTableReady) return;
  await pool.query(`CREATE TABLE IF NOT EXISTS async_quiz_answers (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    quiz_id BIGINT NOT NULL,
    student_user_id BIGINT NOT NULL,
    question_id BIGINT NOT NULL,
    answer_json JSON NULL,
    opened_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    locked_at DATETIME(3) NULL,
    timed_out TINYINT NOT NULL DEFAULT 0,
    UNIQUE KEY uq_async_answer (quiz_id, student_user_id, question_id),
    INDEX idx_async_quiz_student (quiz_id, student_user_id)
  )`);
  asyncAnswerTableReady = true;
}

async function buildAssignmentLeaderboard(quizId) {
  const [rows] = await pool.query(
    `SELECT a.student_user_id, a.score, a.max_score, a.competitive_points, a.submitted_at,
            u.first_name, u.last_name, COALESCE(stp.profile_image, u.profile_image) AS profile_image
     FROM async_quiz_submissions a
     JOIN users u ON u.id = a.student_user_id
     LEFT JOIN student_profiles stp ON stp.user_id = a.student_user_id
     WHERE a.quiz_id = :qid
     ORDER BY a.competitive_points DESC, a.score DESC, a.submitted_at ASC, a.student_user_id ASC`,
    { qid: quizId }
  );
  return rows.map((row, index) => ({
    student_user_id: Number(row.student_user_id),
    first_name: row.first_name || "",
    last_name: row.last_name || "",
    profile_image: row.profile_image || null,
    score: Number(row.score),
    max_score: Number(row.max_score),
    competitive_points: Number(row.competitive_points || 0),
    submitted_at: row.submitted_at,
    rank: index + 1,
  }));
}

export async function getAssignmentLeaderboard(req, res) {
  const quizId = Number(req.params.quizId);
  const [[quiz]] = await pool.query(
    `SELECT q.id FROM quizzes q
     JOIN class_enrollments e ON e.class_id=q.class_id AND e.student_user_id=:uid AND e.removed_at IS NULL
     WHERE q.id=:qid AND q.delivery_mode='ASYNCHRONOUS' AND q.deleted_at IS NULL`,
    { uid: req.user.sub, qid: quizId }
  );
  if (!quiz) return res.status(404).json({ message: "Quiz not found." });
  let leaderboard = [];
  try {
    leaderboard = await buildAssignmentLeaderboard(quizId);
  } catch (err) {
    if (err?.code !== "ER_BAD_FIELD_ERROR") throw err;
    // Missing competitive_points column - see submitStudentQuiz for the
    // migration note. Return an empty leaderboard rather than a 500.
    leaderboard = [];
  }
  res.json({ leaderboard });
}

async function ensureStudentGamificationTables() {
  await pool.query(`CREATE TABLE IF NOT EXISTS student_goal_claims (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    student_user_id BIGINT NOT NULL,
    goal_key VARCHAR(120) NOT NULL,
    period_key VARCHAR(40) NOT NULL,
    xp_reward INT NOT NULL DEFAULT 0,
    claimed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_student_goal_period (student_user_id, goal_key, period_key),
    INDEX idx_student_goal_user (student_user_id)
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS student_competitive_overtakes (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    student_user_id BIGINT NOT NULL,
    session_id BIGINT NOT NULL,
    overtakes INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_overtake_student (student_user_id), INDEX idx_overtake_session (session_id)
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS student_favorite_achievements (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    student_user_id BIGINT NOT NULL,
    achievement_id VARCHAR(120) NOT NULL,
    slot_no TINYINT NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_student_favorite_achievement (student_user_id, achievement_id),
    UNIQUE KEY uq_student_favorite_slot (student_user_id, slot_no),
    INDEX idx_student_favorite_user (student_user_id)
  )`);
}

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
// Reads `date` (an absolute instant) as Asia/Manila wall-clock calendar/time
// fields, independent of the Node process's own timezone (UTC on Render per
// db.js's pool comment) - shifting by the fixed +8h offset then reading UTC
// getters sidesteps the process's local zone entirely.
function manilaFields(date) {
  const shifted = new Date(date.getTime() + MANILA_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(), month: shifted.getUTCMonth(), day: shifted.getUTCDate(),
    hours: shifted.getUTCHours(), minutes: shifted.getUTCMinutes(), seconds: shifted.getUTCSeconds(),
    weekday: shifted.getUTCDay(),
  };
}
// Daily/weekly reset boundaries are meant to land at 6 AM Asia/Manila,
// regardless of where the server process runs. The previous version used
// local Date getters/setters (setHours, getDay, ...), which reset at 6 AM in
// whatever zone the *process* happens to be in - 6 AM UTC on Render, i.e.
// 2 PM Manila - shifting every daily/weekly streak and goal boundary by 8
// hours from what a Manila-based teacher/student actually sees.
function gamificationBoundaries(now = new Date()) {
  const nowManila = manilaFields(now);
  let daily = new Date(Date.UTC(nowManila.year, nowManila.month, nowManila.day, 6, 0, 0, 0) - MANILA_OFFSET_MS);
  if (now < daily) daily = new Date(daily.getTime() - 24 * 60 * 60 * 1000);
  const dayIndex = (manilaFields(daily).weekday + 6) % 7; // Monday = 0
  const weekly = new Date(daily.getTime() - dayIndex * 24 * 60 * 60 * 1000);
  const sql = (date) => {
    const f = manilaFields(date);
    const pad = (n) => String(n).padStart(2,'0');
    return `${f.year}-${pad(f.month+1)}-${pad(f.day)} ${pad(f.hours)}:${pad(f.minutes)}:${pad(f.seconds)}`;
  };
  const key = (date) => { const f = manilaFields(date); return `${f.year}-${String(f.month+1).padStart(2,'0')}-${String(f.day).padStart(2,'0')}`; };
  return { dailyAt:sql(daily), weeklyAt:sql(weekly), dailyKey:key(daily), weeklyKey:key(weekly), dailyDate:daily, weeklyDate:weekly };
}

function levelFromXp(totalXp) {
  let level = 1;
  let remaining = Math.max(0, Math.floor(Number(totalXp || 0)));
  let needed = 5000;
  while (remaining >= needed && level < 999) {
    remaining -= needed;
    level += 1;
    needed = Math.round((5000 + Math.pow(level - 1, 1.32) * 2750) / 250) * 250;
  }
  return { level, currentXp:remaining, xpNeeded:needed, totalXp:Math.max(0,Math.floor(Number(totalXp||0))) };
}

function safeJson(v) {
  if (!v) return null;
  if (typeof v === "object") return v;
  try { return JSON.parse(v); } catch { return null; }
}


function seededShuffleRows(values, seedText) {
  const rows = [...values];
  if (rows.length < 2) return rows;
  let seed = 2166136261;
  for (const char of String(seedText || "thinkwave")) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = rows.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [rows[i], rows[j]] = [rows[j], rows[i]];
  }
  // If shuffling was requested, avoid returning the unchanged order when there
  // is more than one item. This keeps the toggle visibly effective per learner.
  if (rows.every((row, index) => row === values[index])) rows.push(rows.shift());
  return rows;
}

function nowWithin(start, end) {
  const now = Date.now();
  const a = start ? new Date(start).getTime() : 0;
  const b = end ? new Date(end).getTime() : Number.MAX_SAFE_INTEGER;
  return now >= a && now <= b;
}

// Single source of truth for per-student assignment ordering. getStudentQuiz,
// openAssignmentQuestion and finalizeAssignment all use this so "next
// question" means the same everywhere.
function buildOrderedAssignmentQuestions(quiz, uid, questionRows) {
  const template = normalizeTemplateType(quiz.template_type);
  let questions = questionRows.map((q) => ({ ...q, config_json: safeJson(q.config_json) || {} }));
  const learnerSeed = `${uid}:${quiz.id}`;
  if (quiz.randomize_questions) questions = seededShuffleRows(questions, `${learnerSeed}:questions`);
  if (quiz.shuffle_answers) {
    questions = questions.map((q) => {
      const config_json = { ...(q.config_json || {}) };
      if (template === "MCQ" && Array.isArray(config_json.options)) {
        config_json.options = seededShuffleRows(config_json.options, `${learnerSeed}:question:${q.id}:choices`);
      }
      if (template === "MATCHING") {
        config_json.shuffleColA = true;
        config_json.shuffleSeed = `${learnerSeed}:question:${q.id}:matching`;
      }
      return { ...q, config_json };
    });
  }
  return { questions, template };
}

function assignmentQuestionLimitSec(config, quiz) {
  return Math.max(1, Number(config?.timeLimitSec || quiz?.time_limit_sec || 30));
}

async function dbNowMs() {
  const [[row]] = await pool.query(`SELECT NOW(3) AS now3`);
  const t = row?.now3 instanceof Date ? row.now3.getTime() : new Date(row?.now3).getTime();
  return Number.isFinite(t) ? t : Date.now();
}

async function getAsyncProgress(quizId, uid) {
  await ensureAsyncAnswerTable();
  const [rows] = await pool.query(
    `SELECT question_id, answer_json, opened_at, locked_at, timed_out FROM async_quiz_answers WHERE quiz_id=:qid AND student_user_id=:uid`,
    { qid: quizId, uid }
  );
  const byId = new Map();
  for (const r of rows) byId.set(Number(r.question_id), r);
  return byId;
}

// Locks every opened-but-unlocked question whose server deadline has passed.
// Returns the ids it timed out so callers can report progress accurately.
async function timeoutOverdueAssignmentQuestions(quiz, uid, ordered, progressById, nowMs) {
  const timedOutIds = [];
  for (const q of ordered) {
    const row = progressById.get(Number(q.id));
    if (!row || row.locked_at) continue;
    const openedMs = new Date(row.opened_at).getTime();
    if (!Number.isFinite(openedMs)) continue;
    const limitMs = assignmentQuestionLimitSec(safeJson(q.config_json) || q.config_json || {}, quiz) * 1000;
    if (nowMs > openedMs + limitMs + 2000) {
      await pool.query(
        `UPDATE async_quiz_answers SET locked_at=NOW(3), timed_out=1, answer_json=:ans WHERE quiz_id=:qid AND student_user_id=:uid AND question_id=:questionId AND locked_at IS NULL`,
        { qid: quiz.id, uid, questionId: q.id, ans: JSON.stringify({ timedOut: true }) }
      );
      timedOutIds.push(Number(q.id));
      progressById.set(Number(q.id), { ...row, locked_at: new Date(nowMs), timed_out: 1, answer_json: JSON.stringify({ timedOut: true }) });
    }
  }
  return timedOutIds;
}

async function getProfile(userId) {
  // DATE_FORMAT keeps birth_date a plain YYYY-MM-DD calendar string. Returning
  // the raw DATE column lets the MySQL driver hand back a midnight Date whose
  // UTC serialization the client then slices a day early in +08:00 zones.
  const [[profile]] = await pool.query(
    `SELECT user_id, last_name, first_name, middle_initial, student_id,
            DATE_FORMAT(birth_date, '%Y-%m-%d') AS birth_date,
            profile_image, created_at, updated_at
     FROM student_profiles WHERE user_id=:uid`,
    { uid: userId }
  );
  return profile || null;
}

export async function upsertProfile(req, res) {
  const { lastName, firstName, middleInitial, studentId, birthDate = null, profileImage = null } = req.body;
  // Long-run free: shrink camera PNGs (~2MB) to small JPEG (~60KB) before DB.
  // Same dataURL shape, so client needs no change, but roster/history payloads shrink.
  let smallImage = profileImage || null;
  if (isDataUrl(smallImage)) {
    try {
      smallImage = await compressDataUrlImage(smallImage);
    } catch { /* keep original on failure */ }
  }
  try {
  await pool.query(
    `INSERT INTO student_profiles(user_id,last_name,first_name,middle_initial,student_id,birth_date,profile_image)
     VALUES(:uid,:ln,:fn,:mi,:sid,:birthDate,:profileImage)
     ON DUPLICATE KEY UPDATE last_name=:ln2, first_name=:fn2, middle_initial=:mi2, student_id=:sid2, birth_date=:birthDate2, profile_image=COALESCE(:profileImage2, profile_image)`,
    {
      uid: req.user.sub,
      ln: String(lastName || "").trim(), fn: String(firstName || "").trim(),
      mi: String(middleInitial || "").trim() || null, sid: String(studentId || "").trim(),
      birthDate: birthDate || null, profileImage: smallImage || null,
      ln2: String(lastName || "").trim(), fn2: String(firstName || "").trim(),
      mi2: String(middleInitial || "").trim() || null, sid2: String(studentId || "").trim(),
      birthDate2: birthDate || null, profileImage2: smallImage || null,
    }
  );
  } catch (e) {
    if (e && (e.code === "ER_DUP_ENTRY" || String((e.sqlMessage || e.message) || "").toLowerCase().includes("duplicate"))) {
      return res.status(409).json({ message: "This Student ID is already used by another account." });
    }
    throw e;
  }
  await pool.query(
    `UPDATE class_enrollments SET first_name=:fn,last_name=:ln,middle_initial=:mi,student_id=:sid
     WHERE student_user_id=:uid AND removed_at IS NULL`,
    { uid:req.user.sub, fn:String(firstName||"").trim(), ln:String(lastName||"").trim(), mi:String(middleInitial||"").trim()||null, sid:String(studentId||"").trim() }
  );
  res.json({ ok: true, profile: await getProfile(req.user.sub) });
}

export async function deleteProfileImage(req, res) {
  await pool.query(`UPDATE student_profiles SET profile_image=NULL WHERE user_id=:uid`, { uid:req.user.sub });
  res.json({ ok:true });
}

export async function getStudentDashboard(req, res) {
  const uid = req.user.sub;
  await ensureStudentGamificationTables();
  const profile = await getProfile(uid);
  const [classes] = await pool.query(
    `SELECT e.id AS enrollment_id, e.class_id, e.student_id, e.first_name, e.last_name, e.middle_initial,
            c.name AS class_name, c.parent_id, u.first_name AS teacher_first_name, u.last_name AS teacher_last_name,
            p.name AS parent_name
     FROM class_enrollments e
     JOIN classes c ON c.id=e.class_id
     JOIN users u ON u.id=e.teacher_id
     LEFT JOIN classes p ON p.id=c.parent_id
     WHERE e.student_user_id=:uid AND e.removed_at IS NULL
     ORDER BY COALESCE(p.name,c.name) ASC, c.name ASC`, { uid }
  );
  const [removalNotices] = await pool.query(
    `SELECT e.id AS enrollment_id, e.removed_at, c.name AS class_name
     FROM class_enrollments e
     JOIN classes c ON c.id=e.class_id
     WHERE e.student_user_id=:uid AND e.removed_at IS NOT NULL AND e.removal_notice_pending=1
     ORDER BY e.removed_at ASC`, { uid }
  );
  const [recentAssigned] = await pool.query(
    `SELECT a.id, a.quiz_id, q.title AS quiz_title, q.template_type, c.name AS class_name, c.id AS class_id, a.score, a.max_score, a.submitted_at, 'ASSIGNED' AS session_type
     FROM async_quiz_submissions a
     JOIN quizzes q ON q.id=a.quiz_id
     JOIN classes c ON c.id=a.class_id
     WHERE a.student_user_id=:uid ORDER BY a.submitted_at DESC LIMIT 50`, { uid }
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
     ORDER BY q.available_from DESC, q.id DESC LIMIT 100`, { uid }
  );
  const [openLiveSessions] = await pool.query(
    `SELECT DISTINCT s.id AS session_id, s.status, s.join_code, s.created_at, s.started_at, s.class_id, q.title AS quiz_title, q.template_type, c.name AS class_name
     FROM class_enrollments e
     JOIN sessions s ON s.class_id=e.class_id AND s.status IN ('LOBBY','LIVE','PAUSED')
     JOIN quizzes q ON q.id=s.quiz_id
     JOIN classes c ON c.id=s.class_id
     WHERE e.student_user_id=:uid AND e.removed_at IS NULL
     ORDER BY s.id DESC LIMIT 50`, { uid }
  );
  const [recentLive] = await pool.query(
    `SELECT s.id AS session_id, s.class_id, q.title AS quiz_title, q.template_type, c.name AS class_name, s.ended_at, sc.total_points AS score,
            COALESCE(JSON_LENGTH(s.questions_snapshot_json),0) AS question_count, 'LIVE' AS session_type
     FROM session_participants p
     JOIN sessions s ON s.id=p.session_id AND s.status='ENDED'
     JOIN quizzes q ON q.id=s.quiz_id
     LEFT JOIN classes c ON c.id=s.class_id
     LEFT JOIN scores sc ON sc.session_id=s.id AND sc.participant_id=p.id
     WHERE p.student_user_id=:uid
     ORDER BY s.ended_at DESC LIMIT 50`, { uid }
  );
  const [achievementAssignedRows] = await pool.query(
    `SELECT answers_json, score, max_score, submitted_at
     FROM async_quiz_submissions
     WHERE student_user_id=:uid
     ORDER BY submitted_at ASC LIMIT 500`, { uid }
  );
  const [[liveAchievementStats]] = await pool.query(
    `SELECT
       COUNT(r.id) AS answered_total,
       SUM(CASE WHEN r.is_correct=1 THEN 1 ELSE 0 END) AS answered_correct,
       SUM(CASE WHEN r.is_correct=0 THEN 1 ELSE 0 END) AS answered_incorrect,
       SUM(CASE WHEN r.is_correct=1 AND COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(r.answer_json,'$.__tw_live.responseMs')) AS UNSIGNED),999999) <= 8000 THEN 1 ELSE 0 END) AS quick_correct,
       SUM(CASE WHEN r.is_correct=1 AND COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(r.answer_json,'$.__tw_live.responseMs')) AS UNSIGNED),999999) <= 5000 THEN 1 ELSE 0 END) AS fast_flawless,
       SUM(CASE WHEN r.is_correct=1 AND COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(r.answer_json,'$.__tw_live.responseMs')) AS UNSIGNED),0) > 0 AND COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(r.answer_json,'$.__tw_live.responseMs')) AS UNSIGNED),0) >= 15000 THEN 1 ELSE 0 END) AS clutch_correct,
       COUNT(DISTINCT CASE WHEN s.status='ENDED' THEN s.id END) AS live_completed,
       COALESCE(SUM(r.points_awarded),0) AS points_total,
       COALESCE(SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(r.answer_json,'$.__tw_live.competitivePoints')) AS UNSIGNED)),0) AS competitive_points_total
     FROM session_participants p
     JOIN sessions s ON s.id=p.session_id
     LEFT JOIN responses r ON r.session_id=p.session_id AND r.participant_id=p.id
     WHERE p.student_user_id=:uid`, { uid }
  );
  let assignedAnswered = 0;
  let assignedCorrect = 0;
  let assignedIncorrect = 0;
  let assignedPoints = 0;
  for (const row of achievementAssignedRows) {
    const answers = safeJson(row.answers_json);
    if (Array.isArray(answers)) {
      assignedAnswered += answers.length;
      assignedCorrect += answers.filter((answer) => answer?.isCorrect === true || answer?.isCorrect === 1).length;
      assignedIncorrect += answers.filter((answer) => answer?.isCorrect === false || answer?.isCorrect === 0).length;
    }
    assignedPoints += Number(row.score || 0);
  }

  const [rankRows] = await pool.query(
    `WITH totals AS (
       SELECT p.session_id,p.id AS participant_id,p.student_user_id,MAX(s.ended_at) AS ended_at,
              COALESCE(SUM(r.points_awarded),0) AS normal_points,
              COALESCE(SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(r.answer_json,'$.__tw_live.competitivePoints')) AS UNSIGNED)),0) AS competitive_points,
              COALESCE(SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(r.answer_json,'$.__tw_live.responseMs')) AS UNSIGNED)),0) AS response_ms
       FROM session_participants p JOIN sessions s ON s.id=p.session_id AND s.status='ENDED'
       LEFT JOIN responses r ON r.session_id=p.session_id AND r.participant_id=p.id
       WHERE p.kicked_at IS NULL GROUP BY p.session_id,p.id,p.student_user_id
     ), ranked AS (
       SELECT totals.*, ROW_NUMBER() OVER(PARTITION BY session_id ORDER BY competitive_points DESC,normal_points DESC,response_ms ASC,participant_id ASC) AS final_rank
       FROM totals
     ) SELECT * FROM ranked WHERE student_user_id=:uid`, { uid }
  );
  const [streakRows] = await pool.query(
    `SELECT r.is_correct, r.answered_at,
            COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(r.answer_json,'$.__tw_live.responseMs')) AS UNSIGNED),999999) AS response_ms
     FROM session_participants p JOIN responses r ON r.participant_id=p.id AND r.session_id=p.session_id
     WHERE p.student_user_id=:uid ORDER BY r.answered_at DESC,r.id DESC LIMIT 500`, { uid }
  );
  // DESC + LIMIT keeps it bounded; reverse for streak calc (oldest -> newest).
  streakRows.reverse();
  let currentStreak=0,maxCorrectStreak=0,currentFastStreak=0,maxFastStreak=0;
  for (const row of streakRows) {
    if (Number(row.is_correct) === 1) {
      currentStreak += 1; maxCorrectStreak=Math.max(maxCorrectStreak,currentStreak);
      if (Number(row.response_ms) <= 8000) { currentFastStreak += 1; maxFastStreak=Math.max(maxFastStreak,currentFastStreak); } else currentFastStreak=0;
    } else { currentStreak=0; currentFastStreak=0; }
  }
  const boundaries = gamificationBoundaries();
  const [[dailyGoalStats]] = await pool.query(
    `SELECT COUNT(DISTINCT p.session_id) AS sessions,
            SUM(CASE WHEN r.is_correct=1 THEN 1 ELSE 0 END) AS correct,
            COALESCE(SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(r.answer_json,'$.__tw_live.competitivePoints')) AS UNSIGNED)),0) AS competitive
     FROM session_participants p LEFT JOIN responses r ON r.participant_id=p.id AND r.session_id=p.session_id AND r.answered_at>=:since
     WHERE p.student_user_id=:uid AND p.joined_at>=:since2`, { uid, since:boundaries.dailyAt, since2:boundaries.dailyAt }
  );
  const [[weeklyGoalStats]] = await pool.query(
    `SELECT COUNT(DISTINCT p.session_id) AS sessions,
            SUM(CASE WHEN r.is_correct=1 THEN 1 ELSE 0 END) AS correct,
            COALESCE(SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(r.answer_json,'$.__tw_live.competitivePoints')) AS UNSIGNED)),0) AS competitive
     FROM session_participants p LEFT JOIN responses r ON r.participant_id=p.id AND r.session_id=p.session_id AND r.answered_at>=:since
     WHERE p.student_user_id=:uid AND p.joined_at>=:since2`, { uid, since:boundaries.weeklyAt, since2:boundaries.weeklyAt }
  );
  // Daily/weekly goals are earned through assignments too, not just live
  // sessions - tally submitted assignment activity in the same windows and
  // add it on top of the live-session numbers above.
  let dailyAssignmentSubs = [];
  let weeklyAssignmentSubs = [];
  try {
    [dailyAssignmentSubs] = await pool.query(
      `SELECT quiz_id, answers_json, competitive_points, submitted_at FROM async_quiz_submissions WHERE student_user_id=:uid AND submitted_at>=:since`,
      { uid, since: boundaries.dailyAt }
    );
    [weeklyAssignmentSubs] = await pool.query(
      `SELECT quiz_id, answers_json, competitive_points, submitted_at FROM async_quiz_submissions WHERE student_user_id=:uid AND submitted_at>=:since`,
      { uid, since: boundaries.weeklyAt }
    );
  } catch (err) {
    // Assignment-based goal credit needs the competitive_points column
    // (present in schema.sql and auto-added at server startup for older
    // databases). If that auto-migration hasn't applied yet, don't take the
    // whole dashboard down - just skip assignment credit for goals until the
    // server has restarted and applied it.
    if (err?.code === "ER_BAD_FIELD_ERROR") {
      console.warn("[student.dashboard] async_quiz_submissions.competitive_points is missing - restart the server so the startup check can add it, to enable assignment credit toward daily/weekly goals.");
      dailyAssignmentSubs = [];
      weeklyAssignmentSubs = [];
    } else {
      throw err;
    }
  }
  function tallyAssignmentGoalStats(rows) {
    let correct = 0, competitive = 0;
    for (const row of rows) {
      competitive += Number(row.competitive_points || 0);
      const checked = safeJson(row.answers_json);
      if (Array.isArray(checked)) correct += checked.filter((entry) => entry?.isCorrect).length;
    }
    return { submissions: rows.length, correct, competitive };
  }
  const dailyAssignmentTally = tallyAssignmentGoalStats(dailyAssignmentSubs);
  const weeklyAssignmentTally = tallyAssignmentGoalStats(weeklyAssignmentSubs);
  let weeklyAssignmentTop3 = 0;
  for (const submission of weeklyAssignmentSubs) {
    const [[{ higher }]] = await pool.query(
      `SELECT COUNT(*) AS higher FROM async_quiz_submissions o
       WHERE o.quiz_id=:qid AND (o.competitive_points>:cp OR (o.competitive_points=:cp AND o.submitted_at<:submittedAt))`,
      { qid: submission.quiz_id, cp: Number(submission.competitive_points || 0), submittedAt: submission.submitted_at }
    );
    if (Number(higher) < 3) weeklyAssignmentTop3 += 1;
  }
  const top5Count=rankRows.filter((row)=>Number(row.final_rank)<=5).length;
  const top3Count=rankRows.filter((row)=>Number(row.final_rank)<=3).length;
  const firstPlaceCount=rankRows.filter((row)=>Number(row.final_rank)===1).length;
  const weeklyTop3=rankRows.filter((row)=>Number(row.final_rank)<=3 && new Date(row.ended_at||0)>=boundaries.weeklyDate).length;
  const dailyGoals=[
    { key:'daily-session',title:'Join the Wave',metric:'sessions',target:1,reward:600 },
    { key:'daily-correct',title:'Three Sharp Answers',metric:'correct',target:3,reward:750 },
    { key:'daily-speed',title:'Fast & Focused',metric:'competitive',target:2000,reward:900 },
    { key:'daily-push',title:'Score Surge',metric:'competitive',target:4000,reward:1200 },
  ];
  const weeklyGoals=[
    { key:'weekly-sessions',title:'Weekly Regular',metric:'sessions',target:3,reward:2500 },
    { key:'weekly-correct',title:'Twenty Correct',metric:'correct',target:20,reward:3000 },
    { key:'weekly-top',title:'Podium Push',metric:'top3',target:1,reward:3500 },
    { key:'weekly-points',title:'Competitive Climb',metric:'competitive',target:12000,reward:4500 },
  ];
  const dailyValues={ sessions:Number(dailyGoalStats?.sessions||0)+dailyAssignmentTally.submissions,correct:Number(dailyGoalStats?.correct||0)+dailyAssignmentTally.correct,competitive:Number(dailyGoalStats?.competitive||0)+dailyAssignmentTally.competitive };
  const weeklyValues={ sessions:Number(weeklyGoalStats?.sessions||0)+weeklyAssignmentTally.submissions,correct:Number(weeklyGoalStats?.correct||0)+weeklyAssignmentTally.correct,competitive:Number(weeklyGoalStats?.competitive||0)+weeklyAssignmentTally.competitive,top3:weeklyTop3+weeklyAssignmentTop3 };
  for (const goal of dailyGoals) if (Number(dailyValues[goal.metric]||0)>=goal.target) await pool.query(`INSERT IGNORE INTO student_goal_claims(student_user_id,goal_key,period_key,xp_reward) VALUES(:uid,:goal,:period,:reward)`,{uid,goal:goal.key,period:boundaries.dailyKey,reward:goal.reward});
  for (const goal of weeklyGoals) if (Number(weeklyValues[goal.metric]||0)>=goal.target) await pool.query(`INSERT IGNORE INTO student_goal_claims(student_user_id,goal_key,period_key,xp_reward) VALUES(:uid,:goal,:period,:reward)`,{uid,goal:goal.key,period:boundaries.weeklyKey,reward:goal.reward});
  const [[bonusRow]] = await pool.query(`SELECT COALESCE(SUM(xp_reward),0) AS bonus_xp FROM student_goal_claims WHERE student_user_id=:uid`,{uid});
  const [favoriteRows] = await pool.query(`SELECT achievement_id,slot_no FROM student_favorite_achievements WHERE student_user_id=:uid ORDER BY slot_no ASC`,{uid});
  const [[overtakeRow]] = await pool.query(`SELECT COALESCE(SUM(overtakes),0) AS overtakes FROM student_competitive_overtakes WHERE student_user_id=:uid`,{uid});

  const [[weekStats]] = await pool.query(
    `SELECT
       (SELECT COUNT(DISTINCT q.id) FROM class_enrollments e JOIN quizzes q ON q.class_id=e.class_id AND q.delivery_mode='ASYNCHRONOUS' AND q.deleted_at IS NULL WHERE e.student_user_id=:uid AND e.removed_at IS NULL AND YEARWEEK(COALESCE(q.available_from,q.created_at),1)=YEARWEEK(NOW(),1)) AS assigned_this_week,
       (SELECT COUNT(DISTINCT s.id) FROM class_enrollments e JOIN sessions s ON s.class_id=e.class_id WHERE e.student_user_id=:uid2 AND e.removed_at IS NULL AND YEARWEEK(COALESCE(s.started_at,s.created_at),1)=YEARWEEK(NOW(),1)) AS live_this_week,
       (SELECT COUNT(DISTINCT p.session_id) FROM session_participants p JOIN sessions s ON s.id=p.session_id WHERE p.student_user_id=:uid3 AND YEARWEEK(COALESCE(s.started_at,s.created_at),1)=YEARWEEK(NOW(),1)) AS live_attended_this_week`,
    { uid, uid2:uid, uid3:uid }
  );
  const liveTotal = Number(weekStats?.live_this_week || 0);
  const liveAttended = Number(weekStats?.live_attended_this_week || 0);
  res.json({
    profile, classes, assignments, recentCompleted: recentAssigned, recentAssigned, recentLive, openLiveSessions, removalNotices,
    weekStats: { assignedThisWeek:Number(weekStats?.assigned_this_week||0), liveThisWeek:liveTotal, liveAttended, liveUnattended:Math.max(0,liveTotal-liveAttended) },
    achievementStats: {
      questionsAnswered: assignedAnswered + Number(liveAchievementStats?.answered_total || 0),
      questionsCorrect: assignedCorrect + Number(liveAchievementStats?.answered_correct || 0),
      questionsIncorrect: assignedIncorrect + Number(liveAchievementStats?.answered_incorrect || 0),
      quickCorrect: Number(liveAchievementStats?.quick_correct || 0),
      fastFlawless: Number(liveAchievementStats?.fast_flawless || 0),
      clutchCorrect: Number(liveAchievementStats?.clutch_correct || 0),
      perfectPace: Math.floor(maxFastStreak / 5),
      correctStreak: maxCorrectStreak,
      assignedCompleted: achievementAssignedRows.length,
      liveCompleted: Number(liveAchievementStats?.live_completed || 0),
      classesJoined: classes.length,
      totalPoints: assignedPoints + Number(liveAchievementStats?.points_total || 0),
      competitivePoints: Number(liveAchievementStats?.competitive_points_total || 0),
      top5Count, top3Count, firstPlaceCount, overtakes:Number(overtakeRow?.overtakes||0),
    },
    gamification: {
      ...levelFromXp(Number(liveAchievementStats?.competitive_points_total||0)+Number(bonusRow?.bonus_xp||0)),
      competitiveXp:Number(liveAchievementStats?.competitive_points_total||0),
      goalBonusXp:Number(bonusRow?.bonus_xp||0),
      dailyResetAt:boundaries.dailyAt, weeklyResetAt:boundaries.weeklyAt,
      dailyGoals:dailyGoals.map((goal)=>({ ...goal,value:Number(dailyValues[goal.metric]||0),completed:Number(dailyValues[goal.metric]||0)>=goal.target })),
      weeklyGoals:weeklyGoals.map((goal)=>({ ...goal,value:Number(weeklyValues[goal.metric]||0),completed:Number(weeklyValues[goal.metric]||0)>=goal.target })),
      favorites:favoriteRows.map((row)=>row.achievement_id),
    }
  });
}

export async function setFavoriteAchievements(req,res) {
  const uid=req.user.sub;
  await ensureStudentGamificationTables();
  const ids=[...new Set((req.body?.achievementIds||[]).map((value)=>String(value||'').trim()).filter(Boolean))].slice(0,3);
  await pool.query(`DELETE FROM student_favorite_achievements WHERE student_user_id=:uid`,{uid});
  for (let i=0;i<ids.length;i+=1) await pool.query(`INSERT INTO student_favorite_achievements(student_user_id,achievement_id,slot_no) VALUES(:uid,:achievement,:slot)`,{uid,achievement:ids[i],slot:i+1});
  res.json({ok:true,favorites:ids});
}

export async function acknowledgeClassRemoval(req, res) {
  const enrollmentId = Number(req.params.enrollmentId);
  await pool.query(
    `UPDATE class_enrollments SET removal_notice_pending=0
     WHERE id=:id AND student_user_id=:uid AND removed_at IS NOT NULL`,
    { id: enrollmentId, uid: req.user.sub }
  );
  res.json({ ok: true });
}

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
    `INSERT INTO class_enrollments(class_id,teacher_id,student_user_id,student_id,first_name,last_name,middle_initial,removed_at,removal_notice_pending)
     VALUES(:cid,:tid,:uid,:sid,:fn,:ln,:mi,NULL,0)
     ON DUPLICATE KEY UPDATE removed_at=NULL, removal_notice_pending=0, student_id=:sid2, first_name=:fn2, last_name=:ln2, middle_initial=:mi2`,
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

export async function joinStudentLiveSession(req, res) {
  const sessionId = Number(req.params.sessionId);
  const uid = req.user.sub;
  const [[session]] = await pool.query(
    `SELECT s.* FROM sessions s JOIN class_enrollments e ON e.class_id=s.class_id AND e.student_user_id=:uid AND e.removed_at IS NULL WHERE s.id=:sid LIMIT 1`,
    { uid, sid:sessionId }
  );
  if (!session) return res.status(404).json({ message:"Live session not found for your classes." });
  if (Number(session.is_tutorial || 0) === 1) return res.status(403).json({ message:"Cannot join a tutorial session." });
  if (!['LOBBY','LIVE','PAUSED'].includes(session.status)) return res.status(400).json({ message: 'Session has ended.' });
  const profile = await getProfile(uid);
  if (!profile) return res.status(400).json({ message:"Complete your Student Info first." });
  const [[existing]] = await pool.query(`SELECT id,reconnect_key,kicked_at FROM session_participants WHERE session_id=:sid AND student_user_id=:uid LIMIT 1`, { sid:sessionId, uid });
  if (existing?.kicked_at) return res.status(403).json({ message:'You were removed from this session and cannot rejoin.' });
  if (existing) return res.json({ sessionId, participantId:existing.id, reconnectKey:existing.reconnect_key, joinMode:session.join_mode, existing:true });
  // Atomic seat claim (see joinSession in sessions.controller.js): the INSERT
  // only lands when a seat is actually free — kicked seats don't count — so a
  // burst of concurrent joins can neither overshoot the cap nor falsely
  // reject on phantom rows.
  const reconnectKey = makeReconnectKey();
  const [claimed] = await queryRetryingDeadlock(
    `INSERT INTO session_participants(session_id,first_name,last_name,reconnect_key,student_user_id,connected,join_type,group_name)
     SELECT :sid,:fn,:ln,:rk,:uid,1,:jt,NULL
     FROM sessions s
     WHERE s.id = :sid2
       AND (s.max_participants IS NULL OR s.max_participants <= 0
         OR (SELECT COUNT(*) FROM session_participants p
             WHERE p.session_id = :sid3 AND p.kicked_at IS NULL) < s.max_participants)
     LIMIT 1`,
    { sid:sessionId, fn:profile.first_name, ln:profile.last_name, rk:reconnectKey, uid, jt:session.join_mode, sid2:sessionId, sid3:sessionId }
  );
  if (!claimed.affectedRows) {
    const [[cur]] = await pool.query(
      `SELECT status, max_participants,
              (SELECT COUNT(*) FROM session_participants WHERE session_id=:sid AND kicked_at IS NULL) AS seats
       FROM sessions WHERE id=:sid2`,
      { sid:sessionId, sid2:sessionId }
    );
    if (cur && ['LOBBY','LIVE','PAUSED'].includes(cur.status)
        && Number(cur.max_participants || 0) > 0
        && Number(cur.seats || 0) >= Number(cur.max_participants)) {
      console.warn(`[join] session ${sessionId} full (${cur.seats}/${cur.max_participants} seats, student path)`);
      return res.status(400).json({ message:'Session is full.' });
    }
    return res.status(400).json({ message: 'Session has ended.' });
  }
  await pool.query(`INSERT INTO scores(session_id,participant_id,total_points) VALUES(:sid,:pid,0)`, { sid:sessionId, pid:claimed.insertId });
  res.status(201).json({ sessionId, participantId:claimed.insertId, reconnectKey, joinMode:session.join_mode });
}

function questionCorrectDisplay(templateType, correct, config) {
  const tt = normalizeTemplateType(templateType);
  if (tt === 'MCQ' || tt === 'TRUE_FALSE') {
    const raw = correct?.choices?.length ? correct.choices : [correct?.choice].filter(Boolean);
    const options = Array.isArray(config?.options) ? config.options : [];
    const display = raw.map((value) => {
      const index = options.findIndex((option) => {
        if (typeof option === 'string') return String(option) === String(value);
        return [option?.id, option?.text].some((candidate) => String(candidate ?? '') === String(value));
      });
      if (index < 0) return value;
      const option = options[index];
      if (typeof option === 'string') return option;
      return String(option?.text || '').trim() || `Option ${String.fromCharCode(65 + index)}`;
    });
    return display.length > 1 ? display : display[0] || '';
  }
  if (tt === 'MATCHING') return correct?.pairs || [];
  if (tt === 'CROSSWORD') return correct?.answers || config?.answers || [];
  return correct?.text ?? correct?.answer ?? correct;
}

export async function getAssignedStudentAnalytics(req, res) {
  const quizId=Number(req.params.quizId), uid=req.user.sub;
  const [[submission]] = await pool.query(`SELECT a.*,q.title,q.template_type,q.available_from,q.available_until,c.name AS class_name FROM async_quiz_submissions a JOIN quizzes q ON q.id=a.quiz_id LEFT JOIN classes c ON c.id=a.class_id WHERE a.quiz_id=:qid AND a.student_user_id=:uid`, { qid:quizId, uid });
  if (!submission) return res.status(404).json({ message:'Completed assigned work not found.' });
  // Hold the key while classmates can still play: correct answers plus raw
  // config (explanations, stash, recordings) would let the first finisher
  // share everything. Sanitized questions only until available_until passes.
  const released = submission.available_until ? Date.now() > new Date(submission.available_until).getTime() : true;
  const checked=safeJson(submission.answers_json)||[]; const byId=new Map(checked.map(x=>[Number(x.questionId),x]));
  const [questions]=await pool.query(`SELECT id,question_order,prompt,config_json,correct_json FROM quiz_questions WHERE quiz_id=:qid AND deleted_at IS NULL ORDER BY question_order`, { qid:quizId });
  res.json({ session:{ id:quizId,type:'ASSIGNED',title:submission.title,template_type:submission.template_type,class_name:submission.class_name,score:submission.score,max_score:submission.max_score,answersReleased:released }, questions:questions.map((q,i)=>{ const ans=byId.get(Number(q.id))||{}; let safe=null; try { safe=toStudentQuestion({ templateType:submission.template_type, question:q, scope:assignmentScope(uid,quizId,q.id), reveal:true }); } catch { safe=null; }
    const base={ id:q.id,number:i+1,prompt:q.prompt,answer:ans.answer,isCorrect:!!ans.isCorrect,points:ans.points,config:(safe?.config_json||{}) };
    if (!released) return base;
    const cfg=safeJson(q.config_json)||{}, cor=safeJson(q.correct_json)||{};
    return { ...base, correctAnswer:questionCorrectDisplay(submission.template_type,cor,cfg) }; }) });
}

export async function getLiveStudentAnalytics(req, res) {
  const sessionId=Number(req.params.sessionId), uid=req.user.sub;
  const [[row]]=await pool.query(`SELECT s.*,q.title,q.template_type,c.name AS class_name,p.id AS participant_id,sc.total_points FROM sessions s JOIN quizzes q ON q.id=s.quiz_id LEFT JOIN classes c ON c.id=s.class_id JOIN session_participants p ON p.session_id=s.id AND p.student_user_id=:uid LEFT JOIN scores sc ON sc.session_id=s.id AND sc.participant_id=p.id WHERE s.id=:sid AND s.status='ENDED'`, { uid,sid:sessionId });
  if (!row) return res.status(404).json({ message:'Completed live session not found.' });
  const snapshot=safeJson(row.questions_snapshot_json)||[];
  const [responses]=await pool.query(`SELECT question_id,answer_json,is_correct,points_awarded FROM responses WHERE session_id=:sid AND participant_id=:pid`, { sid:sessionId,pid:row.participant_id });
  const byId=new Map(responses.map(r=>[Number(r.question_id),r]));
  // Review after ENDED: keep correctAnswer for the player's own review, but
  // never hand out raw config (stash, recordings, unshuffled orders) — reuse
  // of the quiz in another section would leak the key otherwise.
  res.json({ session:{ id:sessionId,type:'LIVE',title:row.title,template_type:row.template_type,class_name:row.class_name,score:row.total_points }, questions:snapshot.map((q,i)=>{ const response=byId.get(Number(q.id))||{}; let safe=null; try { safe=toStudentQuestion({ templateType:row.template_type, question:q, scope:liveScope(sessionId, q.id), reveal:true }); } catch { safe=null; } return { id:q.id,number:i+1,prompt:q.prompt,answer:safeJson(response.answer_json),isCorrect:response.is_correct===1,points:Number(response.points_awarded||0),correctAnswer:questionCorrectDisplay(row.template_type,q.correct_json||{},q.config_json||{}),config:(safe?.config_json||{}) }; }) });
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
  quiz.background_key = normalizeQuizBackgroundKey(quiz.background_key || getRememberedQuizBackground(quizId));
  if (!nowWithin(quiz.available_from, quiz.available_until)) return res.status(403).json({ message: "This quiz is not open right now." });
  if (quiz.submission_id) return res.status(400).json({ message: "You already submitted this quiz." });

  const [questionRows] = await pool.query(
    `SELECT id, question_order, prompt, config_json
     FROM quiz_questions WHERE quiz_id=:qid AND deleted_at IS NULL ORDER BY question_order ASC`,
    { qid: quizId }
  );
  const { questions: ordered, template } = buildOrderedAssignmentQuestions(quiz, req.user.sub, questionRows);
  const progressById = await getAsyncProgress(quizId, req.user.sub);
  const nowMs = await dbNowMs();
  await timeoutOverdueAssignmentQuestions(quiz, req.user.sub, ordered, progressById, nowMs);
  // Placeholders for unopened questions: no peeking ahead. Opened questions
  // go through the same allow-list live students get.
  const questions = ordered.map((q) => {
    if (!progressById.has(Number(q.id))) {
      const placeholder = { id: q.id, hidden: true };
      if (q.question_order !== undefined) placeholder.question_order = q.question_order;
      return placeholder;
    }
    try {
      return toStudentQuestion({ templateType: template, question: q, scope: assignmentScope(req.user.sub, quizId, q.id), reveal: true });
    } catch {
      return { id: q.id, hidden: true };
    }
  });
  const opened = ordered.filter((q) => progressById.has(Number(q.id))).map((q) => Number(q.id));
  const locked = ordered.filter((q) => progressById.get(Number(q.id))?.locked_at).map((q) => Number(q.id));
  const lockedAnswers = {};
  for (const q of ordered) {
    const row = progressById.get(Number(q.id));
    if (row?.locked_at) {
      try { lockedAnswers[q.id] = safeJson(row.answer_json) ?? null; } catch { lockedAnswers[q.id] = null; }
    }
  }
  // Questions stay hidden until opened, so tell the client up front whether any
  // question needs two answers (drives the pre-start notice).
  const hasTwoAnswerQuestions = questionRows.some((row) => {
    let cfg = row?.config_json;
    if (typeof cfg === "string") { try { cfg = JSON.parse(cfg); } catch { cfg = null; } }
    return String(cfg?.answerMode || "").toUpperCase() === "TWO";
  });
  res.json({ quiz, questions, progress: { opened, locked, lockedAnswers }, serverNowMs: nowMs, hasTwoAnswerQuestions });
}


export async function openAssignmentQuestion(req, res) {
  const quizId = Number(req.params.quizId);
  const questionId = Number(req.params.questionId);
  const [[quiz]] = await pool.query(
    `SELECT q.* FROM quizzes q
     JOIN class_enrollments e ON e.class_id=q.class_id AND e.student_user_id=:uid AND e.removed_at IS NULL
     WHERE q.id=:qid AND q.delivery_mode='ASYNCHRONOUS' AND q.deleted_at IS NULL`,
    { uid: req.user.sub, qid: quizId }
  );
  if (!quiz) return res.status(404).json({ message: "Quiz not found." });
  if (!nowWithin(quiz.available_from, quiz.available_until)) return res.status(403).json({ message: "This quiz is not open right now." });
  const [[submitted]] = await pool.query(`SELECT id FROM async_quiz_submissions WHERE quiz_id=:qid AND student_user_id=:uid LIMIT 1`, { qid: quizId, uid: req.user.sub });
  if (submitted) return res.status(400).json({ message: "You already submitted this quiz." });

  const [questionRows] = await pool.query(
    `SELECT id, question_order, prompt, config_json FROM quiz_questions WHERE quiz_id=:qid AND deleted_at IS NULL ORDER BY question_order ASC`,
    { qid: quizId }
  );
  const { questions: ordered, template } = buildOrderedAssignmentQuestions(quiz, req.user.sub, questionRows);
  const targetIdx = ordered.findIndex((q) => Number(q.id) === questionId);
  if (targetIdx < 0) return res.status(404).json({ message: "Question not found." });
  const progressById = await getAsyncProgress(quizId, req.user.sub);
  const nowMs = await dbNowMs();
  await timeoutOverdueAssignmentQuestions(quiz, req.user.sub, ordered, progressById, nowMs);
  // Sequential unlock: the next question is the first unopened one.
  const firstUnopenedIdx = ordered.findIndex((q) => !progressById.has(Number(q.id)));
  if (targetIdx !== firstUnopenedIdx && progressById.has(questionId)) {
    // Idempotent reopen: return the already-opened question with its deadline.
    const q = ordered[targetIdx];
    const row = progressById.get(questionId);
    const openedMs = new Date(row.opened_at).getTime();
    const limitMs = assignmentQuestionLimitSec(safeJson(q.config_json) || {}, quiz) * 1000;
    const question = toStudentQuestion({ templateType: template, question: q, scope: assignmentScope(req.user.sub, quizId, q.id), reveal: true });
    return res.json({ question, deadlineAtMs: openedMs + limitMs, serverNowMs: nowMs, locked: !!row.locked_at });
  }
  if (targetIdx !== firstUnopenedIdx) return res.status(403).json({ message: "Open the questions in order." });

  const q = ordered[targetIdx];
  await pool.query(
    `INSERT IGNORE INTO async_quiz_answers(quiz_id, student_user_id, question_id, opened_at) VALUES(:qid,:uid,:questionId,NOW(3))`,
    { qid: quizId, uid: req.user.sub, questionId }
  );
  const [[row]] = await pool.query(
    `SELECT opened_at, locked_at FROM async_quiz_answers WHERE quiz_id=:qid AND student_user_id=:uid AND question_id=:questionId LIMIT 1`,
    { qid: quizId, uid: req.user.sub, questionId }
  );
  const openedMs = new Date(row.opened_at).getTime();
  const freshNow = await dbNowMs();
  const limitMs = assignmentQuestionLimitSec(safeJson(q.config_json) || {}, quiz) * 1000;
  const question = toStudentQuestion({ templateType: template, question: q, scope: assignmentScope(req.user.sub, quizId, q.id), reveal: true });
  res.json({ question, deadlineAtMs: openedMs + limitMs, serverNowMs: freshNow, locked: !!row.locked_at });
}

export async function lockAssignmentQuestion(req, res) {
  const quizId = Number(req.params.quizId);
  const questionId = Number(req.params.questionId);
  const rawAnswer = req.body?.answer ?? null;
  const [[quiz]] = await pool.query(
    `SELECT q.* FROM quizzes q
     JOIN class_enrollments e ON e.class_id=q.class_id AND e.student_user_id=:uid AND e.removed_at IS NULL
     WHERE q.id=:qid AND q.delivery_mode='ASYNCHRONOUS' AND q.deleted_at IS NULL`,
    { uid: req.user.sub, qid: quizId }
  );
  if (!quiz) return res.status(404).json({ message: "Quiz not found." });
  if (!nowWithin(quiz.available_from, quiz.available_until)) return res.status(403).json({ message: "This quiz is not open right now." });
  const [[submitted]] = await pool.query(`SELECT id FROM async_quiz_submissions WHERE quiz_id=:qid AND student_user_id=:uid LIMIT 1`, { qid: quizId, uid: req.user.sub });
  if (submitted) return res.status(400).json({ message: "You already submitted this quiz." });
  await ensureAsyncAnswerTable();
  const [[row]] = await pool.query(
    `SELECT question_id, answer_json, opened_at, locked_at, timed_out FROM async_quiz_answers WHERE quiz_id=:qid AND student_user_id=:uid AND question_id=:questionId LIMIT 1`,
    { qid: quizId, uid: req.user.sub, questionId }
  );
  if (!row) return res.status(403).json({ message: "Open this question first." });
  if (row.locked_at) {
    let lockedAnswer = null;
    try { lockedAnswer = safeJson(row.answer_json) ?? null; } catch { lockedAnswer = null; }
    return res.json({ ok: true, locked: true, timedOut: !!row.timed_out, answer: lockedAnswer });
  }
  const [[qrow]] = await pool.query(
    `SELECT id, config_json FROM quiz_questions WHERE id=:questionId AND quiz_id=:qid AND deleted_at IS NULL`,
    { questionId, qid: quizId }
  );
  if (!qrow) return res.status(404).json({ message: "Question not found." });
  const config = safeJson(qrow.config_json) || {};
  const openedMs = new Date(row.opened_at).getTime();
  const nowMs = await dbNowMs();
  const limitMs = assignmentQuestionLimitSec(config, quiz) * 1000;
  if (nowMs > openedMs + limitMs + 2000) {
    await pool.query(
      `UPDATE async_quiz_answers SET locked_at=NOW(3), timed_out=1, answer_json=:ans WHERE quiz_id=:qid AND student_user_id=:uid AND question_id=:questionId AND locked_at IS NULL`,
      { qid: quizId, uid: req.user.sub, questionId, ans: JSON.stringify({ timedOut: true }) }
    );
    return res.json({ ok: true, locked: true, timedOut: true, answer: { timedOut: true } });
  }
  // Store the raw answer (shuffled positions for Matching); finalize converts
  // to canonical indices with the same scope before scoring.
  const storeAnswer = rawAnswer ?? { timedOut: true };
  await pool.query(
    `UPDATE async_quiz_answers SET locked_at=NOW(3), timed_out=0, answer_json=:ans WHERE quiz_id=:qid AND student_user_id=:uid AND question_id=:questionId AND locked_at IS NULL`,
    { qid: quizId, uid: req.user.sub, questionId, ans: JSON.stringify(storeAnswer) }
  );
  res.json({ ok: true, locked: true, timedOut: false, answer: storeAnswer });
}

export async function finalizeAssignment(uid, quizId, { forced = false } = {}) {
  const [[quiz]] = await pool.query(
    `SELECT q.* FROM quizzes q
     JOIN class_enrollments e ON e.class_id=q.class_id AND e.student_user_id=:uid AND e.removed_at IS NULL
     WHERE q.id=:qid AND q.delivery_mode='ASYNCHRONOUS' AND q.deleted_at IS NULL`,
    { uid, qid: quizId }
  );
  if (!quiz) {
    const err = new Error("Quiz not found.");
    err.status = 404;
    throw err;
  }
  // Idempotent: a forced submit after the kick (or a double-click) returns
  // the stored submission as success instead of an "already submitted" error.
  const [[already]] = await pool.query(
    `SELECT score, max_score, competitive_points, submitted_at FROM async_quiz_submissions WHERE quiz_id=:qid AND student_user_id=:uid LIMIT 1`,
    { qid: quizId, uid }
  );
  if (already) {
    let leaderboard = [];
    try { leaderboard = await buildAssignmentLeaderboard(quizId); } catch { leaderboard = []; }
    const myRank = leaderboard.find((row) => row.student_user_id === Number(uid))?.rank || null;
    return { ok: true, score: Number(already.score), maxScore: Number(already.max_score), competitivePoints: Number(already.competitive_points || 0), rank: myRank, leaderboard, repeated: true };
  }

  const [questions] = await pool.query(
    `SELECT id, prompt, config_json, correct_json FROM quiz_questions WHERE quiz_id=:qid AND deleted_at IS NULL ORDER BY question_order ASC`,
    { qid: quizId }
  );
  const progressById = await getAsyncProgress(quizId, uid);
  const nowMs = await dbNowMs();
  // Score the stored rows only — the browser payload is ignored entirely.
  // Anything never locked counts as timed out.
  let score = 0;
  let maxScore = 0;
  let competitivePoints = 0;
  const checked = [];
  const template = normalizeTemplateType(quiz.template_type);
  for (const q of questions) {
    const config = safeJson(q.config_json) || {};
    const correct = safeJson(q.correct_json) || {};
    const basePoints = Math.min(3, Math.max(1, Number(config.points || quiz.points_per_question || 1)));
    const wordBank = template === "CROSSWORD"
      ? (Array.isArray(correct.answers) && correct.answers.length ? correct.answers : Array.isArray(config.answers) ? config.answers : [])
      : [];
    const matchingPairs = template === "MATCHING" && Array.isArray(correct.pairs) ? correct.pairs.length : 0;
    maxScore += template === "CROSSWORD"
      ? basePoints * wordBank.length
      : template === "MATCHING"
        ? basePoints * matchingPairs
        : basePoints;
    const row = progressById.get(Number(q.id));
    const limitSec = assignmentQuestionLimitSec(config, quiz);
    let answer = null;
    let timeExpired = true;
    let responseMs = limitSec * 1000;
    if (row?.locked_at) {
      try { answer = safeJson(row.answer_json) ?? null; } catch { answer = null; }
      if (template === "MATCHING") {
        try {
          answer = toCanonicalMatchingAnswer(answer, config, assignmentScope(uid, quizId, q.id));
        } catch { /* keep raw on failure; scorer rejects invalid shapes */ }
      }
      timeExpired = !!row.timed_out || !!answer?.timedOut;
      if (!timeExpired) {
        const openedMs = new Date(row.opened_at).getTime();
        const lockedMs = new Date(row.locked_at).getTime();
        if (Number.isFinite(openedMs) && Number.isFinite(lockedMs)) {
          responseMs = Math.max(0, Math.min(lockedMs - openedMs, limitSec * 1000));
        } else {
          responseMs = 0;
        }
      } else {
        responseMs = limitSec * 1000;
      }
    } else {
      answer = { timedOut: true };
      timeExpired = true;
      responseMs = limitSec * 1000;
    }
    const result = scoreAnswer({ templateType: template, correct, answer, config, basePoints });
    if (result?.rejected) console.warn("[integrity] rejected async submit", JSON.stringify({ quizId, questionId: q.id, student: uid, reason: result.rejected, forced }));
    const points = Number(result.pointsAwarded || 0);
    score += points;
    competitivePoints += calculateCompetitivePoints({
      templateType: template,
      scored: result,
      basePoints,
      elapsedMs: responseMs,
      timeLimitMs: limitSec * 1000,
      timeExpired,
    });
    checked.push({ questionId: q.id, answer, isCorrect: !!result.isCorrect, points, rejected: result?.rejected || null, responseMs, timedOut: timeExpired });
  }

  let competitivePointsColumnMissing = false;
  try {
    await pool.query(
      `INSERT INTO async_quiz_submissions(quiz_id,class_id,teacher_id,student_user_id,answers_json,score,max_score,competitive_points)
       VALUES(:qid,:cid,:tid,:uid,:answers,:score,:maxScore,:competitivePoints)`,
      { qid: quiz.id, cid: quiz.class_id, tid: quiz.teacher_id, uid, answers: JSON.stringify(checked), score, maxScore, competitivePoints: Math.round(competitivePoints) }
    );
  } catch (err) {
    if (err?.code === "ER_DUP_ENTRY") {
      const [[dup]] = await pool.query(
        `SELECT score, max_score, competitive_points FROM async_quiz_submissions WHERE quiz_id=:qid AND student_user_id=:uid LIMIT 1`,
        { qid: quizId, uid }
      );
      let leaderboard = [];
      try { leaderboard = await buildAssignmentLeaderboard(quizId); } catch { leaderboard = []; }
      const myRank = leaderboard.find((row) => row.student_user_id === Number(uid))?.rank || null;
      return { ok: true, score: Number(dup.score), maxScore: Number(dup.max_score), competitivePoints: Number(dup.competitive_points || 0), rank: myRank, leaderboard, repeated: true };
    }
    if (err?.code !== "ER_BAD_FIELD_ERROR") throw err;
    competitivePointsColumnMissing = true;
    console.warn("[submitStudentQuiz] async_quiz_submissions.competitive_points is missing - restart the server so the startup check can add it. Submission saved without competitive points.");
    await pool.query(
      `INSERT INTO async_quiz_submissions(quiz_id,class_id,teacher_id,student_user_id,answers_json,score,max_score)
       VALUES(:qid,:cid,:tid,:uid,:answers,:score,:maxScore)`,
      { qid: quiz.id, cid: quiz.class_id, tid: quiz.teacher_id, uid, answers: JSON.stringify(checked), score, maxScore }
    );
  }
  void nowMs;
  let leaderboard = [];
  let myRank = null;
  if (!competitivePointsColumnMissing) {
    leaderboard = await buildAssignmentLeaderboard(quizId);
    broadcastAssignmentLeaderboard(getIO(), quizId, { quizId, leaderboard });
    myRank = leaderboard.find((row) => row.student_user_id === Number(uid))?.rank || null;
  }
  return { ok: true, score, maxScore, competitivePoints: competitivePointsColumnMissing ? 0 : Math.round(competitivePoints), rank: myRank, leaderboard };
}

export async function submitStudentQuiz(req, res) {
  const quizId = Number(req.params.quizId);
  try {
    const out = await finalizeAssignment(req.user.sub, quizId, { forced: false });
    res.json(out);
  } catch (err) {
    if (err?.status === 404) return res.status(404).json({ message: "Quiz not found." });
    throw err;
  }
}
