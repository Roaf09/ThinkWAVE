/* FILE GUIDE:
 * server/src/modules/student/student.controller.js
 */

import { pool } from "../../db.js";
import { scoreAnswer, normalizeTemplateType } from "../quizzes/templates.js";
import { makeReconnectKey } from "../../utils/codes.js";
import { getRememberedQuizBackground, normalizeQuizBackgroundKey } from "../quizzes/quizBackground.runtime.js";

const asyncAnswerChecks = new Map();

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

function gamificationBoundaries(now = new Date()) {
  const daily = new Date(now);
  daily.setHours(6,0,0,0);
  if (now < daily) daily.setDate(daily.getDate() - 1);
  const weekly = new Date(daily);
  const day = (weekly.getDay() + 6) % 7;
  weekly.setDate(weekly.getDate() - day);
  const sql = (date) => {
    const pad = (n) => String(n).padStart(2,'0');
    return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  };
  const key = (date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  return { dailyAt:sql(daily), weeklyAt:sql(weekly), dailyKey:key(daily), weeklyKey:key(weekly) };
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

async function getProfile(userId) {
  const [[profile]] = await pool.query(`SELECT * FROM student_profiles WHERE user_id=:uid`, { uid: userId });
  return profile || null;
}

export async function upsertProfile(req, res) {
  const { lastName, firstName, middleInitial, studentId, birthDate = null, profileImage = null } = req.body;
  await pool.query(
    `INSERT INTO student_profiles(user_id,last_name,first_name,middle_initial,student_id,birth_date,profile_image)
     VALUES(:uid,:ln,:fn,:mi,:sid,:birthDate,:profileImage)
     ON DUPLICATE KEY UPDATE last_name=:ln2, first_name=:fn2, middle_initial=:mi2, student_id=:sid2, birth_date=:birthDate2, profile_image=COALESCE(:profileImage2, profile_image)`,
    {
      uid: req.user.sub,
      ln: String(lastName || "").trim(), fn: String(firstName || "").trim(),
      mi: String(middleInitial || "").trim() || null, sid: String(studentId || "").trim(),
      birthDate: birthDate || null, profileImage: profileImage || null,
      ln2: String(lastName || "").trim(), fn2: String(firstName || "").trim(),
      mi2: String(middleInitial || "").trim() || null, sid2: String(studentId || "").trim(),
      birthDate2: birthDate || null, profileImage2: profileImage || null,
    }
  );
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
     ORDER BY q.available_from DESC, q.id DESC`, { uid }
  );
  const [openLiveSessions] = await pool.query(
    `SELECT DISTINCT s.id AS session_id, s.status, s.join_code, s.created_at, s.started_at, s.class_id, q.title AS quiz_title, q.template_type, c.name AS class_name
     FROM class_enrollments e
     JOIN sessions s ON s.class_id=e.class_id AND s.status IN ('LOBBY','LIVE','PAUSED')
     JOIN quizzes q ON q.id=s.quiz_id
     JOIN classes c ON c.id=s.class_id
     WHERE e.student_user_id=:uid AND e.removed_at IS NULL
     ORDER BY s.id DESC`, { uid }
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
     ORDER BY submitted_at ASC`, { uid }
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
     WHERE p.student_user_id=:uid ORDER BY r.answered_at ASC,r.id ASC`, { uid }
  );
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
  const top5Count=rankRows.filter((row)=>Number(row.final_rank)<=5).length;
  const top3Count=rankRows.filter((row)=>Number(row.final_rank)<=3).length;
  const firstPlaceCount=rankRows.filter((row)=>Number(row.final_rank)===1).length;
  const weeklyTop3=rankRows.filter((row)=>Number(row.final_rank)<=3 && new Date(row.ended_at||0)>=new Date(boundaries.weeklyAt)).length;
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
  const dailyValues={ sessions:Number(dailyGoalStats?.sessions||0),correct:Number(dailyGoalStats?.correct||0),competitive:Number(dailyGoalStats?.competitive||0) };
  const weeklyValues={ sessions:Number(weeklyGoalStats?.sessions||0),correct:Number(weeklyGoalStats?.correct||0),competitive:Number(weeklyGoalStats?.competitive||0),top3:weeklyTop3 };
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
  if (!['LOBBY','LIVE','PAUSED'].includes(session.status)) return res.status(400).json({ message: 'Session has ended.' });
  const profile = await getProfile(uid);
  if (!profile) return res.status(400).json({ message:"Complete your Student Info first." });
  const [[existing]] = await pool.query(`SELECT id,reconnect_key,kicked_at FROM session_participants WHERE session_id=:sid AND student_user_id=:uid LIMIT 1`, { sid:sessionId, uid });
  if (existing?.kicked_at) return res.status(403).json({ message:'You were removed from this session and cannot rejoin.' });
  if (existing) return res.json({ sessionId, participantId:existing.id, reconnectKey:existing.reconnect_key, joinMode:session.join_mode, existing:true });
  if (Number(session.max_participants || 0) > 0) {
    const [[count]] = await pool.query(`SELECT COUNT(*) AS total FROM session_participants WHERE session_id=:sid`, { sid:sessionId });
    if (Number(count?.total||0) >= Number(session.max_participants)) return res.status(400).json({ message:'Session is full.' });
  }
  const reconnectKey = makeReconnectKey();
  const [r] = await pool.query(
    `INSERT INTO session_participants(session_id,first_name,last_name,reconnect_key,student_user_id,connected,join_type,group_name) VALUES(:sid,:fn,:ln,:rk,:uid,1,:jt,NULL)`,
    { sid:sessionId, fn:profile.first_name, ln:profile.last_name, rk:reconnectKey, uid, jt:session.join_mode }
  );
  await pool.query(`INSERT INTO scores(session_id,participant_id,total_points) VALUES(:sid,:pid,0)`, { sid:sessionId, pid:r.insertId });
  res.status(201).json({ sessionId, participantId:r.insertId, reconnectKey, joinMode:session.join_mode });
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
  if (tt === 'THINK_SPELL') return correct?.answers || config?.answers || [];
  return correct?.text ?? correct?.answer ?? correct;
}

export async function getAssignedStudentAnalytics(req, res) {
  const quizId=Number(req.params.quizId), uid=req.user.sub;
  const [[submission]] = await pool.query(`SELECT a.*,q.title,q.template_type,c.name AS class_name FROM async_quiz_submissions a JOIN quizzes q ON q.id=a.quiz_id LEFT JOIN classes c ON c.id=a.class_id WHERE a.quiz_id=:qid AND a.student_user_id=:uid`, { qid:quizId, uid });
  if (!submission) return res.status(404).json({ message:'Completed assigned work not found.' });
  const checked=safeJson(submission.answers_json)||[]; const byId=new Map(checked.map(x=>[Number(x.questionId),x]));
  const [questions]=await pool.query(`SELECT id,question_order,prompt,config_json,correct_json FROM quiz_questions WHERE quiz_id=:qid AND deleted_at IS NULL ORDER BY question_order`, { qid:quizId });
  res.json({ session:{ id:quizId,type:'ASSIGNED',title:submission.title,template_type:submission.template_type,class_name:submission.class_name,score:submission.score,max_score:submission.max_score }, questions:questions.map((q,i)=>{ const cfg=safeJson(q.config_json)||{}, cor=safeJson(q.correct_json)||{}, ans=byId.get(Number(q.id))||{}; return { id:q.id,number:i+1,prompt:q.prompt,answer:ans.answer,isCorrect:!!ans.isCorrect,points:ans.points,correctAnswer:questionCorrectDisplay(submission.template_type,cor,cfg),config:cfg }; }) });
}

export async function getLiveStudentAnalytics(req, res) {
  const sessionId=Number(req.params.sessionId), uid=req.user.sub;
  const [[row]]=await pool.query(`SELECT s.*,q.title,q.template_type,c.name AS class_name,p.id AS participant_id,sc.total_points FROM sessions s JOIN quizzes q ON q.id=s.quiz_id LEFT JOIN classes c ON c.id=s.class_id JOIN session_participants p ON p.session_id=s.id AND p.student_user_id=:uid LEFT JOIN scores sc ON sc.session_id=s.id AND sc.participant_id=p.id WHERE s.id=:sid AND s.status='ENDED'`, { uid,sid:sessionId });
  if (!row) return res.status(404).json({ message:'Completed live session not found.' });
  const snapshot=safeJson(row.questions_snapshot_json)||[];
  const [responses]=await pool.query(`SELECT question_id,answer_json,is_correct,points_awarded FROM responses WHERE session_id=:sid AND participant_id=:pid`, { sid:sessionId,pid:row.participant_id });
  const byId=new Map(responses.map(r=>[Number(r.question_id),r]));
  res.json({ session:{ id:sessionId,type:'LIVE',title:row.title,template_type:row.template_type,class_name:row.class_name,score:row.total_points }, questions:snapshot.map((q,i)=>{ const response=byId.get(Number(q.id))||{}; return { id:q.id,number:i+1,prompt:q.prompt,answer:safeJson(response.answer_json),isCorrect:response.is_correct===1,points:Number(response.points_awarded||0),correctAnswer:questionCorrectDisplay(row.template_type,q.correct_json||{},q.config_json||{}),config:q.config_json||{} }; }) });
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
  const template = normalizeTemplateType(quiz.template_type);
  let questions = questionRows.map((q) => ({ ...q, config_json: safeJson(q.config_json) || {} }));
  const learnerSeed = `${req.user.sub}:${quizId}`;
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
  res.json({ quiz, questions });
}


export async function checkStudentQuizAnswer(req, res) {
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
  const checkKey = `${req.user.sub}:${quizId}:${questionId}`;
  if (asyncAnswerChecks.has(checkKey)) return res.json(asyncAnswerChecks.get(checkKey));
  const [[question]] = await pool.query(
    `SELECT id, config_json, correct_json FROM quiz_questions WHERE id=:questionId AND quiz_id=:quizId AND deleted_at IS NULL`,
    { questionId, quizId }
  );
  if (!question) return res.status(404).json({ message: "Question not found." });
  const config = safeJson(question.config_json) || {};
  const correct = safeJson(question.correct_json) || {};
  const basePoints = Math.min(3, Math.max(1, Number(config.points || quiz.points_per_question || 1)));
  const scored = scoreAnswer({ templateType: normalizeTemplateType(quiz.template_type), correct, answer, config, basePoints });
  const result = {
    isCorrect: !!scored.isCorrect,
    points: Number(scored.pointsAwarded || 0),
    feedbackType: scored.feedbackType || (scored.isCorrect ? "correct" : Number(scored.pointsAwarded || 0) > 0 ? "almost" : "wrong"),
    correctCount: Number(scored.correctCount ?? scored.totalWords ?? 0),
    totalCorrect: Number(scored.totalCorrect ?? scored.totalPairs ?? scored.totalItems ?? scored.requiredWords ?? 0),
    hasWrongSelected: !!scored.hasWrongSelected,
    explanation: String(config?.explanation || ""),
  };
  asyncAnswerChecks.set(checkKey, result);
  setTimeout(() => asyncAnswerChecks.delete(checkKey), 6 * 60 * 60 * 1000).unref?.();
  res.json(result);
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
    const template = normalizeTemplateType(quiz.template_type);
    const wordBank = template === "THINK_SPELL"
      ? (Array.isArray(correct.answers) && correct.answers.length ? correct.answers : Array.isArray(config.answers) ? config.answers : [])
      : [];
    const matchingPairs = template === "MATCHING" && Array.isArray(correct.pairs) ? correct.pairs.length : 0;
    maxScore += template === "THINK_SPELL"
      ? basePoints * wordBank.length
      : template === "MATCHING"
        ? basePoints * matchingPairs
        : basePoints;
    const answer = byId.get(Number(q.id)) ?? null;
    const result = scoreAnswer({ templateType: template, correct, answer, config, basePoints });
    const points = Number(result.pointsAwarded || 0);
    score += points;
    checked.push({ questionId: q.id, answer, isCorrect: !!result.isCorrect, points });
  }

  await pool.query(
    `INSERT INTO async_quiz_submissions(quiz_id,class_id,teacher_id,student_user_id,answers_json,score,max_score)
     VALUES(:qid,:cid,:tid,:uid,:answers,:score,:maxScore)`,
    { qid: quiz.id, cid: quiz.class_id, tid: quiz.teacher_id, uid: req.user.sub, answers: JSON.stringify(checked), score, maxScore }
  );
  for (const key of asyncAnswerChecks.keys()) {
    if (key.startsWith(`${req.user.sub}:${quizId}:`)) asyncAnswerChecks.delete(key);
  }
  res.json({ ok: true, score, maxScore });
}
