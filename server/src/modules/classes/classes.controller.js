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


// Revision 7: duplicate a folder card beside the original for quick class setup.
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

// Revision 6: generate or return a class code for the selected teacher folder/section.
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

// Revision 6: teacher roster for students enrolled in a class folder.
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

// Revision 6: teacher can remove a student from a class without deleting the student account.
export async function removeClassStudent(req, res) {
  const classId = Number(req.params.id);
  const enrollmentId = Number(req.params.enrollmentId);
  await pool.query(
    `UPDATE class_enrollments SET removed_at=NOW()
     WHERE id=:eid AND class_id=:cid AND teacher_id=:tid AND removed_at IS NULL`,
    { eid: enrollmentId, cid: classId, tid: req.user.sub }
  );
  res.json({ ok: true });
}

// Revision 6: async quiz score list shown inside the teacher's class folder.
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

// Revision 6: downloadable async results in XLSX.
export async function exportClassAsyncXlsx(req, res) {
  const plan = await getTeacherPlan(req.user.sub);
  if (plan.code !== "INSTITUTION") return res.status(403).json({ message: "Analytics downloads are available on the Institution plan." });
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

// Revision 6: downloadable async results in PDF.
export async function exportClassAsyncPdf(req, res) {
  const plan = await getTeacherPlan(req.user.sub);
  if (plan.code !== "INSTITUTION") return res.status(403).json({ message: "Analytics downloads are available on the Institution plan." });
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

// Revision 18: full analytics for assigned/asynchronous sessions using the same UI payload as live analytics.
export async function getClassAsyncAnalytics(req, res) {
  const classId = Number(req.params.id);
  const quizId = Number(req.params.quizId);
  const [[quiz]] = await pool.query(
    `SELECT q.id, q.title AS quiz_title, q.template_type, q.category, q.available_from, q.available_until,
            c.name AS class_name
     FROM quizzes q
     JOIN classes c ON c.id=q.class_id
     WHERE q.id=:qid AND q.class_id=:cid AND q.teacher_id=:tid
       AND q.delivery_mode='ASYNCHRONOUS' AND q.deleted_at IS NULL`,
    { qid: quizId, cid: classId, tid: req.user.sub }
  );
  if (!quiz) return res.status(404).json({ message: "Assigned session not found." });

  const [questions] = await pool.query(
    `SELECT id AS question_id, question_order, prompt
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

  const stats = new Map(questions.map((q) => [Number(q.question_id), { total: 0, correct: 0, incorrect: 0 }]));
  for (const submission of submissions) {
    const checked = safeJsonValue(submission.answers_json);
    for (const answer of Array.isArray(checked) ? checked : []) {
      const row = stats.get(Number(answer?.questionId));
      if (!row) continue;
      row.total += 1;
      if (answer?.isCorrect) row.correct += 1;
      else row.incorrect += 1;
    }
  }

  const scores = submissions.map((row) => Number(row.total_points || 0));
  const avg = scores.length ? Number((scores.reduce((sum, value) => sum + value, 0) / scores.length).toFixed(2)) : 0;
  const min = scores.length ? Math.min(...scores) : 0;
  const max = scores.length ? Math.max(...scores) : 0;

  res.json({
    session: {
      ...quiz,
      join_mode: "ASSIGNED",
      folder_name: quiz.class_name || "Unassigned",
      display_date: quiz.available_until || quiz.available_from || null,
      question_count: questions.length,
    },
    summary: { avg_score: avg, min_score: min, max_score: max, participant_count: submissions.length },
    students: submissions.map((row) => ({
      participant_id: row.student_user_id,
      first_name: row.first_name || "Student",
      last_name: row.last_name || row.student_id || "",
      total_points: Number(row.total_points || 0),
      max_score: Number(row.max_score || 0),
      joined_at: row.submitted_at,
    })),
    questions: questions.map((q) => {
      const row = stats.get(Number(q.question_id)) || { total: 0, correct: 0, incorrect: 0 };
      return {
        ...q,
        total_answers: row.total,
        correct_answers: row.correct,
        incorrect_answers: row.incorrect,
        pct_correct: row.total ? Number(((row.correct / row.total) * 100).toFixed(2)) : 0,
        pct_incorrect: row.total ? Number(((row.incorrect / row.total) * 100).toFixed(2)) : 0,
      };
    }),
    tabMonitoring: [],
  });
}

function safeJsonValue(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return null; }
}
