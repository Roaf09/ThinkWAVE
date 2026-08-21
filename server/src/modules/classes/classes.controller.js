/* FILE GUIDE:
 * server/src/modules/classes/classes.controller.js
 * Purpose: Folder/classes tree logic plus analytics cards grouped under classes.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { pool } from "../../db.js";
import { makeJoinCode } from "../../utils/codes.js";
import { getTeacherPlan } from "../plans/plan.js";
import { buildDetailedQuestionAnalytics, buildStudentResponseDetails, safeJsonValue as safeAnalyticsJson } from "../analytics/analytics.helpers.js";

async function getTeacherFolders(teacherId) {
  const [rows] = await pool.query(
    `SELECT id, parent_id, teacher_id
     FROM classes
     WHERE teacher_id=:tid AND deleted_at IS NULL
     ORDER BY id ASC`,
    { tid: teacherId }
  );
  return rows;
}

function collectFolderAndDescendants(rows, rootId) {
  const byParent = rows.reduce((acc, row) => {
    const key = row.parent_id ?? 0;
    if (!acc[key]) acc[key] = [];
    acc[key].push(row.id);
    return acc;
  }, {});

  const found = [];
  const stack = [Number(rootId)];
  const seen = new Set();

  while (stack.length) {
    const id = stack.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    found.push(id);
    const kids = byParent[id] || [];
    for (const childId of kids) stack.push(childId);
  }

  return found;
}

export async function listClasses(req, res) {
  const [rows] = await pool.query(
    `SELECT id, teacher_id, name, parent_id, created_at, updated_at
     FROM classes
     WHERE teacher_id=:tid AND deleted_at IS NULL
     ORDER BY COALESCE(parent_id, 0) ASC, name ASC, id ASC`,
    { tid: req.user.sub }
  );
  res.json(rows);
}

export async function createClass(req, res) {
  const { name, parentId } = req.body;
  const normalizedParentId = parentId ? Number(parentId) : null;

  if (normalizedParentId) {
    const [[parent]] = await pool.query(
      `SELECT id FROM classes WHERE id=:id AND teacher_id=:tid AND deleted_at IS NULL`,
      { id: normalizedParentId, tid: req.user.sub }
    );
    if (!parent) return res.status(400).json({ message: "Parent folder not found." });
  }

  const [r] = await pool.query(
    `INSERT INTO classes(teacher_id,name,parent_id) VALUES(:tid,:name,:parentId)`,
    { tid: req.user.sub, name: name.trim(), parentId: normalizedParentId }
  );
  res.status(201).json({ id: r.insertId });
}

export async function updateClass(req, res) {
  const folderId = Number(req.params.id);
  const { name, parentId } = req.body;
  const normalizedParentId = parentId ? Number(parentId) : null;

  const [[folder]] = await pool.query(
    `SELECT id FROM classes WHERE id=:id AND teacher_id=:tid AND deleted_at IS NULL`,
    { id: folderId, tid: req.user.sub }
  );
  if (!folder) return res.status(404).json({ message: "Folder not found." });

  if (normalizedParentId === folderId) {
    return res.status(400).json({ message: "A folder cannot be its own parent." });
  }

  const allRows = await getTeacherFolders(req.user.sub);
  const descendants = new Set(collectFolderAndDescendants(allRows, folderId));
  if (normalizedParentId && descendants.has(normalizedParentId)) {
    return res.status(400).json({ message: "You cannot move a folder inside its own subtree." });
  }

  if (normalizedParentId) {
    const [[parent]] = await pool.query(
      `SELECT id FROM classes WHERE id=:id AND teacher_id=:tid AND deleted_at IS NULL`,
      { id: normalizedParentId, tid: req.user.sub }
    );
    if (!parent) return res.status(400).json({ message: "Parent folder not found." });
  }

  await pool.query(
    `UPDATE classes
     SET name=:name, parent_id=:parentId
     WHERE id=:id AND teacher_id=:tid AND deleted_at IS NULL`,
    { id: folderId, tid: req.user.sub, name: name.trim(), parentId: normalizedParentId }
  );
  res.json({ ok: true });
}

export async function softDeleteClass(req, res) {
  const folderId = Number(req.params.id);
  const rows = await getTeacherFolders(req.user.sub);
  const ids = collectFolderAndDescendants(rows, folderId);
  if (!ids.length) return res.json({ ok: true });

  await pool.query(
    `UPDATE classes SET deleted_at=NOW() WHERE teacher_id=:tid AND id IN (:ids)`,
    { tid: req.user.sub, ids }
  );
  res.json({ ok: true, deletedIds: ids });
}

export async function restoreClass(req, res) {
  const where = req.user.role === "ADMIN" ? "id=:id" : "id=:id AND teacher_id=:tid";
  await pool.query(`UPDATE classes SET deleted_at=NULL WHERE ${where}`, { id: req.params.id, tid: req.user.sub });
  res.json({ ok: true });
}


export async function duplicateClass(req, res) {
  const folderId = Number(req.params.id);
  const [[folder]] = await pool.query(
    `SELECT name, parent_id FROM classes WHERE id=:id AND teacher_id=:tid AND deleted_at IS NULL`,
    { id: folderId, tid: req.user.sub }
  );
  if (!folder) return res.status(404).json({ message: "Folder not found." });
  const baseName = `${folder.name} Copy`.slice(0, 95);
  const [r] = await pool.query(
    `INSERT INTO classes(teacher_id,name,parent_id) VALUES(:tid,:name,:parentId)`,
    { tid: req.user.sub, name: baseName, parentId: folder.parent_id || null }
  );
  res.status(201).json({ id: r.insertId });
}

export async function getOrCreateClassCode(req, res) {
  const classId = Number(req.params.id);
  const [[folder]] = await pool.query(
    `SELECT id, name, class_code FROM classes WHERE id=:id AND teacher_id=:tid AND deleted_at IS NULL`,
    { id: classId, tid: req.user.sub }
  );
  if (!folder) return res.status(404).json({ message: "Class folder not found." });
  if (folder.class_code) return res.json({ classCode: folder.class_code });
  let code = makeJoinCode().slice(0, 8);
  for (let i = 0; i < 5; i += 1) {
    const [[existing]] = await pool.query(`SELECT id FROM classes WHERE class_code=:code LIMIT 1`, { code });
    if (!existing) break;
    code = makeJoinCode().slice(0, 8);
  }
  await pool.query(`UPDATE classes SET class_code=:code WHERE id=:id AND teacher_id=:tid`, { code, id: classId, tid: req.user.sub });
  res.json({ classCode: code });
}

export async function listClassStudents(req, res) {
  const classId = Number(req.params.id);
  const [[folder]] = await pool.query(`SELECT id FROM classes WHERE id=:id AND teacher_id=:tid AND deleted_at IS NULL`, { id: classId, tid: req.user.sub });
  if (!folder) return res.status(404).json({ message: "Class folder not found." });
  const [rows] = await pool.query(
    `SELECT id, student_user_id, student_id, first_name, last_name, middle_initial, joined_at
     FROM class_enrollments
     WHERE class_id=:cid AND teacher_id=:tid AND removed_at IS NULL
     ORDER BY last_name ASC, first_name ASC, student_id ASC`,
    { cid: classId, tid: req.user.sub }
  );
  res.json(rows);
}

export async function removeClassStudent(req, res) {
  const classId = Number(req.params.id);
  const enrollmentId = Number(req.params.enrollmentId);
  await pool.query(
    `UPDATE class_enrollments SET removed_at=NOW(), removal_notice_pending=1
     WHERE id=:eid AND class_id=:cid AND teacher_id=:tid AND removed_at IS NULL`,
    { eid: enrollmentId, cid: classId, tid: req.user.sub }
  );
  res.json({ ok: true });
}

export async function listClassAsyncResults(req, res) {
  const classId = Number(req.params.id);
  const [[folder]] = await pool.query(`SELECT id FROM classes WHERE id=:id AND teacher_id=:tid AND deleted_at IS NULL`, { id: classId, tid: req.user.sub });
  if (!folder) return res.status(404).json({ message: "Class folder not found." });
  const [rows] = await pool.query(
    `SELECT q.id AS quiz_id, q.title AS quiz_title, q.template_type, q.available_from, q.available_until,
            COUNT(a.id) AS submitted_count,
            ROUND(AVG(a.score),2) AS avg_score,
            MAX(a.score) AS max_score,
            MAX(a.max_score) AS max_possible
     FROM quizzes q
     LEFT JOIN async_quiz_submissions a ON a.quiz_id=q.id
     WHERE q.class_id=:cid AND q.teacher_id=:tid AND q.delivery_mode='ASYNCHRONOUS' AND q.deleted_at IS NULL
     GROUP BY q.id
     ORDER BY q.available_from DESC, q.id DESC`,
    { cid: classId, tid: req.user.sub }
  );
  res.json(rows);
}

async function getAsyncExportData(classId, quizId, teacherId) {
  const [[quiz]] = await pool.query(
    `SELECT q.id, q.title, q.available_from, q.available_until, c.name AS class_name
     FROM quizzes q JOIN classes c ON c.id=q.class_id
     WHERE q.id=:qid AND q.class_id=:cid AND q.teacher_id=:tid AND q.delivery_mode='ASYNCHRONOUS'`,
    { qid: quizId, cid: classId, tid: teacherId }
  );
  if (!quiz) return null;
  const [rows] = await pool.query(
    `SELECT e.last_name, e.first_name, e.middle_initial, e.student_id,
            a.score, a.max_score, a.submitted_at
     FROM class_enrollments e
     LEFT JOIN async_quiz_submissions a ON a.student_user_id=e.student_user_id AND a.quiz_id=:qid
     WHERE e.class_id=:cid AND e.teacher_id=:tid AND e.removed_at IS NULL
     ORDER BY e.last_name ASC, e.first_name ASC, e.student_id ASC`,
    { qid: quizId, cid: classId, tid: teacherId }
  );
  return { quiz, rows };
}

export async function exportClassAsyncXlsx(req, res) {
  const plan = await getTeacherPlan(req.user.sub);
  if (plan.code === "BASIC") return res.status(403).json({ message: "Analytics downloads are available on ThinkWAVE Pro and Institution plans." });
  const data = await getAsyncExportData(Number(req.params.id), Number(req.params.quizId), req.user.sub);
  if (!data) return res.status(404).json({ message: "Async quiz not found." });
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Async Results");
  sheet.addRows([
    ["ThinkWAVE Asynchronous Quiz Results"],
    ["Class", data.quiz.class_name],
    ["Quiz", data.quiz.title],
    ["Start", data.quiz.available_from],
    ["End", data.quiz.available_until],
    [],
  ]);
  sheet.columns = [
    { width: 24 }, { width: 24 }, { width: 14 }, { width: 18 }, { width: 12 }, { width: 12 }, { width: 24 },
  ];
  sheet.addRow(["Last Name", "First Name", "M.I.", "Student ID", "Score", "Max", "Submitted At"]).font = { bold: true };
  data.rows.forEach((r) => sheet.addRow([r.last_name, r.first_name, r.middle_initial || "", r.student_id, r.score ?? "—", r.max_score ?? "—", r.submitted_at || "Not submitted"]));
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="async-${req.params.quizId}-results.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
}

export async function exportClassAsyncPdf(req, res) {
  const plan = await getTeacherPlan(req.user.sub);
  if (plan.code === "BASIC") return res.status(403).json({ message: "Analytics downloads are available on ThinkWAVE Pro and Institution plans." });
  const data = await getAsyncExportData(Number(req.params.id), Number(req.params.quizId), req.user.sub);
  if (!data) return res.status(404).json({ message: "Async quiz not found." });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="async-${req.params.quizId}-results.pdf"`);
  const doc = new PDFDocument({ margin: 40, size: "A4" });
  doc.pipe(res);
  doc.fontSize(16).text(data.quiz.title || "Asynchronous Quiz Results");
  doc.fontSize(10).fillColor("#555").text(`Class: ${data.quiz.class_name || "—"}`).text(`Start: ${data.quiz.available_from || "—"}`).text(`End: ${data.quiz.available_until || "—"}`);
  doc.moveDown();
  data.rows.forEach((r, idx) => {
    doc.fillColor("#000").fontSize(9).text(`${idx + 1}. ${r.last_name}, ${r.first_name} ${r.middle_initial || ""} | ${r.student_id} | ${r.score ?? "—"}/${r.max_score ?? "—"} | ${r.submitted_at ? "Submitted" : "Not submitted"}`);
  });
  doc.end();
}

export async function getClassAsyncAnalytics(req, res) {
  const classId = Number(req.params.id);
  const quizId = Number(req.params.quizId);
  const [[quiz]] = await pool.query(
    `SELECT q.id, q.title AS quiz_title, q.template_type, q.category, q.available_from, q.available_until,
            q.class_id, c.name AS class_name
     FROM quizzes q
     JOIN classes c ON c.id=q.class_id
     WHERE q.id=:qid AND q.class_id=:cid AND q.teacher_id=:tid
       AND q.delivery_mode='ASYNCHRONOUS' AND q.deleted_at IS NULL`,
    { qid: quizId, cid: classId, tid: req.user.sub }
  );
  if (!quiz) return res.status(404).json({ message: "Assigned session not found." });

  const [questions] = await pool.query(
    `SELECT id AS question_id, question_order, prompt, config_json, correct_json
     FROM quiz_questions
     WHERE quiz_id=:qid AND deleted_at IS NULL
     ORDER BY question_order ASC`,
    { qid: quizId }
  );
  const [submissions] = await pool.query(
    `SELECT a.id, a.student_user_id, a.answers_json, a.score AS total_points, a.max_score, a.submitted_at,
            e.first_name, e.last_name, e.student_id
     FROM async_quiz_submissions a
     LEFT JOIN class_enrollments e
       ON e.class_id=a.class_id AND e.student_user_id=a.student_user_id AND e.teacher_id=a.teacher_id
     WHERE a.quiz_id=:qid AND a.class_id=:cid AND a.teacher_id=:tid
     ORDER BY e.last_name ASC, e.first_name ASC, a.id ASC`,
    { qid: quizId, cid: classId, tid: req.user.sub }
  );

  const responseRows = [];
  for (const submission of submissions) {
    const checked = safeAnalyticsJson(submission.answers_json);
    for (const answer of Array.isArray(checked) ? checked : []) {
      responseRows.push({
        participant_id: Number(submission.student_user_id),
        question_id: Number(answer?.questionId),
        answer_json: answer?.answer ?? null,
        is_correct: answer?.isCorrect ? 1 : 0,
        points_awarded: Number(answer?.points || 0),
        answered_at: submission.submitted_at,
      });
    }
  }
  const detailedQuestions = buildDetailedQuestionAnalytics(quiz.template_type, questions, responseRows);
  const responsesByStudent = responseRows.reduce((acc, row) => {
    (acc[Number(row.participant_id)] ||= []).push(row);
    return acc;
  }, {});
  const scores = submissions.map((row) => Number(row.total_points || 0));
  const avg = scores.length ? Number((scores.reduce((sum, value) => sum + value, 0) / scores.length).toFixed(2)) : 0;
  const min = scores.length ? Math.min(...scores) : 0;
  const max = scores.length ? Math.max(...scores) : 0;

  const plan = await getTeacherPlan(req.user.sub);
  const sessionPayload = {
    ...quiz,
    join_mode: "ASSIGNED",
    folder_name: quiz.class_name || "Unassigned",
    display_date: quiz.available_until || quiz.available_from || null,
    question_count: detailedQuestions.length,
  };
  const summaryPayload = { avg_score: avg, min_score: min, max_score: max, participant_count: submissions.length, student_count: submissions.length, guest_count: 0 };
  if (plan.code === "BASIC") {
    return res.json({
      session: sessionPayload,
      summary: { avg_score: avg, min_score: min, max_score: max, participant_count: submissions.length },
      students: submissions.map((row) => ({
        participant_id: row.student_user_id,
        first_name: row.first_name || "Student",
        last_name: row.last_name || row.student_id || "",
        total_points: Number(row.total_points || 0),
        max_score: Number(row.max_score || 0),
        joined_at: row.submitted_at,
      })),
      questions: detailedQuestions.map((question) => ({
        question_id: question.question_id,
        question_order: question.question_order,
        prompt: question.prompt,
        total_answers: question.total_answers,
        correct_answers: question.correct_answers,
        incorrect_answers: question.incorrect_answers,
        pct_correct: question.pct_correct,
        pct_incorrect: question.pct_incorrect,
      })),
      tabMonitoring: [],
    });
  }
  res.json({
    session: sessionPayload,
    summary: summaryPayload,
    students: submissions.map((row) => ({
      participant_id: row.student_user_id,
      student_user_id: row.student_user_id,
      participant_type: "STUDENT",
      first_name: row.first_name || "Student",
      last_name: row.last_name || row.student_id || "",
      total_points: Number(row.total_points || 0),
      max_score: Number(row.max_score || 0),
      joined_at: row.submitted_at,
      responses: buildStudentResponseDetails(responsesByStudent[Number(row.student_user_id)] || []),
    })),
    questions: detailedQuestions,
    tabMonitoring: [],
  });
}

function percent(value, total) { return total ? Number(((Number(value || 0) / Number(total)) * 100).toFixed(2)) : 0; }

async function requireAdvancedClassAnalytics(req, res) {
  const plan = await getTeacherPlan(req.user.sub);
  if (plan.code === "BASIC") {
    res.status(403).json({ message: "Class and student analytics are available on ThinkWAVE Pro and Institution plans." });
    return null;
  }
  return plan;
}

export async function getClassAnalytics(req, res) {
  if (!(await requireAdvancedClassAnalytics(req, res))) return;
  const classId = Number(req.params.id);
  const [[folder]] = await pool.query(`SELECT id,name FROM classes WHERE id=:id AND teacher_id=:tid AND deleted_at IS NULL`, { id: classId, tid: req.user.sub });
  if (!folder) return res.status(404).json({ message: "Class folder not found." });
  const [[countRow]] = await pool.query(`SELECT COUNT(*) AS total FROM class_enrollments WHERE class_id=:cid AND teacher_id=:tid AND removed_at IS NULL`, { cid: classId, tid: req.user.sub });
  const studentCount = Number(countRow?.total || 0);
  const [live] = await pool.query(
    `SELECT s.id, s.quiz_id, q.title, q.template_type, s.ended_at AS completed_at,
            COUNT(DISTINCT CASE WHEN p.student_user_id IS NOT NULL THEN p.student_user_id END) AS participant_count,
            ROUND(AVG(CASE WHEN p.student_user_id IS NOT NULL THEN COALESCE(sc.total_points,0) END),2) AS avg_points
     FROM sessions s
     JOIN quizzes q ON q.id=s.quiz_id
     LEFT JOIN session_participants p ON p.session_id=s.id
     LEFT JOIN scores sc ON sc.session_id=s.id AND sc.participant_id=p.id
     WHERE s.class_id=:cid AND s.teacher_id=:tid AND s.status='ENDED'
     GROUP BY s.id,q.id,q.title,q.template_type,s.ended_at
     ORDER BY s.ended_at ASC, s.id ASC`,
    { cid: classId, tid: req.user.sub }
  );
  const [assigned] = await pool.query(
    `SELECT q.id AS quiz_id, q.title, q.template_type, COALESCE(q.available_until,q.available_from,q.created_at) AS completed_at,
            COUNT(a.id) AS submission_count,
            ROUND(AVG(CASE WHEN a.max_score>0 THEN (a.score/a.max_score)*100 ELSE 0 END),2) AS avg_percent
     FROM quizzes q
     LEFT JOIN async_quiz_submissions a ON a.quiz_id=q.id
     WHERE q.class_id=:cid AND q.teacher_id=:tid AND q.delivery_mode='ASYNCHRONOUS' AND q.deleted_at IS NULL
     GROUP BY q.id,q.title,q.template_type,q.available_until,q.available_from,q.created_at
     ORDER BY completed_at ASC,q.id ASC`,
    { cid: classId, tid: req.user.sub }
  );
  const liveMaxMap = await loadQuizMaxPoints(live.map((row) => Number(row.quiz_id)));
  const liveTrends = live.map((row) => ({
    id: Number(row.id), mode: "LIVE", title: row.title, template_type: row.template_type, completed_at: row.completed_at,
    participation_rate: percent(row.participant_count, studentCount), participant_count: Number(row.participant_count || 0),
    performance: liveMaxMap.get(Number(row.quiz_id)) ? Number(((Number(row.avg_points || 0) / liveMaxMap.get(Number(row.quiz_id))) * 100).toFixed(2)) : 0,
  }));
  const assignedTrends = assigned.map((row) => ({
    id: Number(row.quiz_id), mode: "ASSIGNED", title: row.title, template_type: row.template_type, completed_at: row.completed_at,
    completion_rate: percent(row.submission_count, studentCount), submission_count: Number(row.submission_count || 0), performance: Number(row.avg_percent || 0),
  }));
  const averageParticipation = liveTrends.length ? Number((liveTrends.reduce((sum,row)=>sum+row.participation_rate,0)/liveTrends.length).toFixed(2)) : 0;
  const averageCompletion = assignedTrends.length ? Number((assignedTrends.reduce((sum,row)=>sum+row.completion_rate,0)/assignedTrends.length).toFixed(2)) : 0;
  res.json({ class: folder, stats: { student_count: studentCount, average_participation: averageParticipation, average_completion: averageCompletion }, trends: [...liveTrends, ...assignedTrends].sort((a,b)=>new Date(a.completed_at||0)-new Date(b.completed_at||0)) });
}

export async function getClassStudentAnalytics(req, res) {
  if (!(await requireAdvancedClassAnalytics(req, res))) return;
  const classId = Number(req.params.id);
  const enrollmentId = Number(req.params.enrollmentId);
  const [[student]] = await pool.query(
    `SELECT id,student_user_id,student_id,first_name,last_name,middle_initial,joined_at FROM class_enrollments
     WHERE id=:eid AND class_id=:cid AND teacher_id=:tid AND removed_at IS NULL`,
    { eid: enrollmentId, cid: classId, tid: req.user.sub }
  );
  if (!student) return res.status(404).json({ message: "Student not found in this class." });
  const [[liveTotals]] = await pool.query(`SELECT COUNT(*) AS total FROM sessions WHERE class_id=:cid AND teacher_id=:tid AND status='ENDED'`, { cid: classId, tid: req.user.sub });
  const [[assignedTotals]] = await pool.query(`SELECT COUNT(*) AS total FROM quizzes WHERE class_id=:cid AND teacher_id=:tid AND delivery_mode='ASYNCHRONOUS' AND deleted_at IS NULL`, { cid: classId, tid: req.user.sub });
  const [liveRows] = await pool.query(
    `SELECT s.id,s.quiz_id,s.started_at,sc.total_points,r.question_id,r.answer_json,r.is_correct,r.points_awarded,r.answered_at,qq.config_json
     FROM sessions s
     JOIN session_participants p ON p.session_id=s.id AND p.student_user_id=:uid
     LEFT JOIN scores sc ON sc.session_id=s.id AND sc.participant_id=p.id
     LEFT JOIN responses r ON r.session_id=s.id AND r.participant_id=p.id
     LEFT JOIN quiz_questions qq ON qq.id=r.question_id
     WHERE s.class_id=:cid AND s.teacher_id=:tid AND s.status='ENDED'
     ORDER BY s.id,r.answered_at,r.id`,
    { uid: student.student_user_id, cid: classId, tid: req.user.sub }
  );
  const [asyncRows] = await pool.query(
    `SELECT a.quiz_id,a.score,a.max_score,a.answers_json,a.submitted_at FROM async_quiz_submissions a
     WHERE a.class_id=:cid AND a.teacher_id=:tid AND a.student_user_id=:uid ORDER BY a.submitted_at ASC`,
    { cid: classId, tid: req.user.sub, uid: student.student_user_id }
  );
  const liveSessionIds = new Set(liveRows.map((row)=>Number(row.id)));
  const liveQuizIds = Array.from(new Set(liveRows.map((row)=>Number(row.quiz_id)).filter(Boolean)));
  const liveMaxMap = await loadQuizMaxPoints(liveQuizIds);
  const liveScores = [];
  for (const sid of liveSessionIds) {
    const row = liveRows.find((item)=>Number(item.id)===sid);
    const max = liveMaxMap.get(Number(row?.quiz_id)) || 0;
    liveScores.push(max ? (Number(row?.total_points || 0) / max) * 100 : 0);
  }
  const asyncScores = asyncRows.map((row)=>Number(row.max_score||0)>0 ? (Number(row.score||0)/Number(row.max_score))*100 : 0);
  const scoreValues = [...liveScores, ...asyncScores];
  let timedOut = 0;
  const responseIntervals = [];
  const liveGrouped = new Map();
  for (const row of liveRows) {
    if (!row.question_id) continue;
    const answer = safeAnalyticsJson(row.answer_json) || {};
    if (answer?.timedOut) timedOut += 1;
    const group = liveGrouped.get(Number(row.id)) || [];
    group.push(row); liveGrouped.set(Number(row.id), group);
  }
  for (const rows of liveGrouped.values()) {
    let previous = new Date(rows[0]?.started_at || rows[0]?.answered_at || 0).getTime();
    for (const row of rows) {
      const at = new Date(row.answered_at || 0).getTime();
      if (!Number.isFinite(at) || !previous) continue;
      const limit = Number(safeAnalyticsJson(row.config_json)?.timeLimitSec || 300);
      responseIntervals.push(Math.min(limit, Math.max(0, (at - previous) / 1000)));
      previous = at;
    }
  }
  for (const submission of asyncRows) {
    const answers = safeAnalyticsJson(submission.answers_json);
    for (const entry of Array.isArray(answers) ? answers : []) if (entry?.answer?.timedOut) timedOut += 1;
  }
  const liveParticipation = percent(liveSessionIds.size, liveTotals?.total || 0);
  const assignmentCompletion = percent(asyncRows.length, assignedTotals?.total || 0);
  const overallParticipation = percent(liveSessionIds.size + asyncRows.length, Number(liveTotals?.total||0) + Number(assignedTotals?.total||0));
  res.json({
    student,
    stats: {
      overall_participation: overallParticipation,
      average_score: scoreValues.length ? Number((scoreValues.reduce((a,b)=>a+b,0)/scoreValues.length).toFixed(2)) : 0,
      live_participation: liveParticipation,
      assignment_completion: assignmentCompletion,
      average_answer_time: responseIntervals.length ? Number((responseIntervals.reduce((a,b)=>a+b,0)/responseIntervals.length).toFixed(2)) : 0,
      questions_timed_out: timedOut,
    },
  });
}

async function loadQuizMaxPoints(quizIds = []) {
  const ids = Array.from(new Set(quizIds.map(Number).filter(Boolean)));
  const map = new Map();
  if (!ids.length) return map;
  const [rows] = await pool.query(`SELECT qq.id,qq.quiz_id,qq.config_json,qq.correct_json,q.points_per_question FROM quiz_questions qq JOIN quizzes q ON q.id=qq.quiz_id WHERE qq.quiz_id IN (:ids) AND qq.deleted_at IS NULL`, { ids });
  for (const row of rows) {
    const config = safeAnalyticsJson(row.config_json) || {};
    const correct = safeAnalyticsJson(row.correct_json) || {};
    const points = Math.max(1, Math.min(3, Number(config.points ?? row.points_per_question ?? 1)));
    let max = points;
    const pairs = Array.isArray(correct.pairs) ? correct.pairs.length : 0;
    const words = Array.isArray(correct.answers) && correct.answers.length ? correct.answers.length : Array.isArray(config.answers) ? config.answers.length : 0;
    if (pairs) max = points * pairs;
    else if (words) max = points * words;
    map.set(Number(row.quiz_id), Number(map.get(Number(row.quiz_id)) || 0) + max);
  }
  return map;
}

function safeJsonValue(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return null; }
}
