/* FILE GUIDE:
 * server/src/modules/student/student.controller.js
 * Purpose: Revision 6 student account dashboard, class joining, and asynchronous quiz submission.
 */

import { pool } from "../../db.js";
import { scoreAnswer, normalizeTemplateType } from "../quizzes/templates.js";
import { makeReconnectKey } from "../../utils/codes.js";

function safeJson(v) {
  if (!v) return null;
  if (typeof v === "object") return v;
  try { return JSON.parse(v); } catch { return null; }
}


function shuffleRows(values) {
  const rows = [...values];
  for (let i = rows.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [rows[i], rows[j]] = [rows[j], rows[i]];
  }
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

// Revision 6: stores the student's basic profile only once after their first class join.
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
    profile, classes, assignments, recentCompleted: recentAssigned, recentAssigned, recentLive, openLiveSessions,
    weekStats: { assignedThisWeek:Number(weekStats?.assigned_this_week||0), liveThisWeek:liveTotal, liveAttended, liveUnattended:Math.max(0,liveTotal-liveAttended) }
  });
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

export async function joinStudentLiveSession(req, res) {
  const sessionId = Number(req.params.sessionId);
  const uid = req.user.sub;
  const [[session]] = await pool.query(
    `SELECT s.* FROM sessions s JOIN class_enrollments e ON e.class_id=s.class_id AND e.student_user_id=:uid AND e.removed_at IS NULL WHERE s.id=:sid LIMIT 1`,
    { uid, sid:sessionId }
  );
  if (!session) return res.status(404).json({ message:"Live session not found for your classes." });
  if (session.status !== 'LOBBY') return res.status(400).json({ message: session.status === 'ENDED' ? 'Session has ended.' : 'The session has already started.' });
  const profile = await getProfile(uid);
  if (!profile) return res.status(400).json({ message:"Complete your Student Info first." });
  const [[existing]] = await pool.query(`SELECT id,reconnect_key FROM session_participants WHERE session_id=:sid AND student_user_id=:uid LIMIT 1`, { sid:sessionId, uid });
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
  if (!nowWithin(quiz.available_from, quiz.available_until)) return res.status(403).json({ message: "This quiz is not open right now." });
  if (quiz.submission_id) return res.status(400).json({ message: "You already submitted this quiz." });

  const [questionRows] = await pool.query(
    `SELECT id, question_order, prompt, config_json
     FROM quiz_questions WHERE quiz_id=:qid AND deleted_at IS NULL ORDER BY question_order ASC`,
    { qid: quizId }
  );
  const template = normalizeTemplateType(quiz.template_type);
  let questions = questionRows.map((q) => ({ ...q, config_json: safeJson(q.config_json) || {} }));
  if (quiz.randomize_questions) questions = shuffleRows(questions);
  if (quiz.shuffle_answers) {
    questions = questions.map((q) => {
      const config_json = { ...(q.config_json || {}) };
      if (template === "MCQ" && Array.isArray(config_json.options)) config_json.options = shuffleRows(config_json.options);
      if (template === "MATCHING") config_json.shuffleColA = true;
      return { ...q, config_json };
    });
  }
  res.json({ quiz, questions });
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
    maxScore += template === "THINK_SPELL" ? basePoints * wordBank.length : basePoints;
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
  res.json({ ok: true, score, maxScore });
}
