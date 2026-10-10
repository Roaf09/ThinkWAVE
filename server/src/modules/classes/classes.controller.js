/* FILE GUIDE:
 * server/src/modules/classes/classes.controller.js
 * Purpose: Folder/classes tree logic plus analytics cards grouped under classes.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { pool } from "../../db.js";
import { parsePagination, pagedOrArray } from "../../utils/pagination.js";
import { makeJoinCode } from "../../utils/codes.js";
import { getTeacherPlan } from "../plans/plan.js";
import { buildDetailedQuestionAnalytics, buildStudentResponseDetails, safeJsonValue as safeAnalyticsJson } from "../analytics/analytics.helpers.js";
import { hasDatabaseColumn } from "../../utils/schemaCompat.js";
import { getRememberedQuizBackground, normalizeQuizBackgroundKey } from "../quizzes/quizBackground.runtime.js";
import { drawInfoBlock, drawTable } from "../../utils/pdfTable.js";
import { enqueueExport, queueStats } from "../../queue.js";
import { yieldToLoop } from "../exports/exportStore.js";

// Assignment tab-out store (mirrors live sessions' tab_events 3-strike rule).
// Created lazily so databases predating this feature keep working.
let assignmentTabTableReady = false;
async function ensureAssignmentTabTable() {
  if (assignmentTabTableReady) return;
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS assignment_tab_events (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      quiz_id BIGINT NOT NULL,
      student_user_id BIGINT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_assignment_tab_quiz_student (quiz_id, student_user_id)
    )`);
  } catch {}
  assignmentTabTableReady = true;
}
async function loadAssignmentTabCounts(quizId) {
  try {
    await ensureAssignmentTabTable();
    const [rows] = await pool.query(
      `SELECT student_user_id, COUNT(*) AS tab_out_count
       FROM assignment_tab_events WHERE quiz_id=:qid GROUP BY student_user_id`,
      { qid: Number(quizId) }
    );
    return new Map(rows.map((r) => [Number(r.student_user_id), Number(r.tab_out_count || 0)]));
  } catch {
    return new Map();
  }
}

// Assignment screenshot tally (written by assignment.socket.js). Read-only here;
// the table is created lazily so older databases keep working.
async function loadAssignmentShotCounts(quizId) {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS assignment_screenshot_events (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      quiz_id BIGINT NOT NULL,
      student_user_id BIGINT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_assignment_shot_quiz_student (quiz_id, student_user_id)
    )`);
    const [rows] = await pool.query(
      `SELECT student_user_id, COUNT(*) AS screenshot_count
       FROM assignment_screenshot_events WHERE quiz_id=:qid GROUP BY student_user_id`,
      { qid: Number(quizId) }
    );
    return new Map(rows.map((r) => [Number(r.student_user_id), Number(r.screenshot_count || 0)]));
  } catch {
    return new Map();
  }
}

// Same Asia/Manila pinning as analytics.controller.js's fmtDate - without an
// explicit timeZone this renders in whatever zone the Node process runs in
// (UTC on Render), not Philippine time.
function fmtExportDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", { timeZone: "Asia/Manila", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

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
  const { page, limit, offset, paged } = parsePagination(req, { defaultLimit: 100, maxLimit: 200 });
  const [rows] = await pool.query(
    `SELECT id, teacher_id, name, parent_id, created_at, updated_at
     FROM classes
     WHERE teacher_id=:tid AND deleted_at IS NULL
     ORDER BY COALESCE(parent_id, 0) ASC, name ASC, id ASC LIMIT :limit OFFSET :offset`,
    { tid: req.user.sub, limit, offset }
  );
  return pagedOrArray(res, rows, { page, limit, paged });
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
  if (req.user.role === "ADMIN") {
    // Institution fence, same as restoreQuiz: only folders owned by teachers
    // of the admin's own institution.
    const [[admin]] = await pool.query(`SELECT institution_name FROM users WHERE id=:id AND role='ADMIN'`, { id: req.user.sub });
    const inst = String(admin?.institution_name || "");
    if (!inst) return res.status(403).json({ message: "No institution." });
    await pool.query(
      `UPDATE classes c JOIN users t ON t.id=c.teacher_id
       SET c.deleted_at=NULL
       WHERE c.id=:id AND t.institution_name=:inst AND t.deleted_at IS NULL`,
      { id: req.params.id, inst }
    );
  } else {
    await pool.query(`UPDATE classes SET deleted_at=NULL WHERE id=:id AND teacher_id=:tid`, { id: req.params.id, tid: req.user.sub });
  }
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
  const { page, limit, offset, paged } = parsePagination(req, { defaultLimit: 100, maxLimit: 200 });
  const [rows] = await pool.query(
    `SELECT id, student_user_id, student_id, first_name, last_name, middle_initial, joined_at
     FROM class_enrollments
     WHERE class_id=:cid AND teacher_id=:tid AND removed_at IS NULL
     ORDER BY last_name ASC, first_name ASC, student_id ASC LIMIT :limit OFFSET :offset`,
    { cid: classId, tid: req.user.sub, limit, offset }
  );
  return pagedOrArray(res, rows, { page, limit, paged });
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
  const { page, limit, offset, paged } = parsePagination(req, { defaultLimit: 50, maxLimit: 100 });
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
     ORDER BY q.available_from DESC, q.id DESC LIMIT :limit OFFSET :offset`,
    { cid: classId, tid: req.user.sub, limit, offset }
  );
  return pagedOrArray(res, rows, { page, limit, paged });
}

export async function getAsyncExportData(classId, quizId, teacherId) {
  const [[quiz]] = await pool.query(
    `SELECT q.id, q.title, q.template_type, q.available_from, q.available_until, c.name AS class_name
     FROM quizzes q JOIN classes c ON c.id=q.class_id
     WHERE q.id=:qid AND q.class_id=:cid AND q.teacher_id=:tid AND q.delivery_mode='ASYNCHRONOUS'`,
    { qid: quizId, cid: classId, tid: teacherId }
  );
  if (!quiz) return null;
  const [rows] = await pool.query(
    `SELECT e.last_name, e.first_name, e.middle_initial, e.student_id, e.student_user_id,
            a.score, a.max_score, a.submitted_at
     FROM class_enrollments e
     LEFT JOIN async_quiz_submissions a ON a.student_user_id=e.student_user_id AND a.quiz_id=:qid
     WHERE e.class_id=:cid AND e.teacher_id=:tid AND e.removed_at IS NULL
     ORDER BY e.last_name ASC, e.first_name ASC, e.student_id ASC`,
    { qid: quizId, cid: classId, tid: teacherId }
  );
  const tabCounts = await loadAssignmentTabCounts(quizId);
  const shotCounts = await loadAssignmentShotCounts(quizId);
  for (const r of rows) {
    r.tab_out_count = tabCounts.get(Number(r.student_user_id)) || 0;
    r.screenshot_count = shotCounts.get(Number(r.student_user_id)) || 0;
  }
  return { quiz, rows };
}

// Shared workbook builder: one layout for sync download + async file jobs.
// Student rows stream in 500-row chunks with event-loop yields.
export async function buildAsyncWorkbook(data) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ThinkWAVE";
  const sheet = workbook.addWorksheet("Async Results");
  const submitted = data.rows.filter((r) => r.submitted_at).length;
  const scores = data.rows.filter((r) => r.score != null).map((r) => Number(r.score));
  sheet.addRows([
    ["ThinkWAVE Asynchronous Quiz Results"],
    ["Class", data.quiz.class_name],
    ["Quiz", data.quiz.title],
    ["Opens", fmtExportDate(data.quiz.available_from)],
    ["Closes", fmtExportDate(data.quiz.available_until)],
    ["Submitted", `${submitted} of ${data.rows.length}`],
    ["Average", scores.length ? Number((scores.reduce((sum, value) => sum + value, 0) / scores.length).toFixed(2)) : "—"],
    ["Highest", scores.length ? Math.max(...scores) : "—"],
    ["Lowest", scores.length ? Math.min(...scores) : "—"],
    [],
  ]);
  sheet.getRow(1).font = { bold: true, size: 16 };
  sheet.columns = [
    { width: 24 }, { width: 24 }, { width: 14 }, { width: 18 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 13 }, { width: 28 },
  ];
  sheet.addRow(["Last Name", "First Name", "M.I.", "Student ID", "Score", "Max", "Tab outs", "Screenshots", "Submitted At"]).font = { bold: true };
  // Pre-format submitted_at rather than handing exceljs a raw Date - it
  // serializes date cells on its own UTC/local convention, which is the same
  // timezone mismatch fmtExportDate exists to avoid.
  let i = 0;
  for (const r of data.rows) {
    sheet.addRow([r.last_name, r.first_name, r.middle_initial || "", r.student_id, r.score ?? "—", r.max_score ?? "—", Number(r.tab_out_count || 0), Number(r.screenshot_count || 0), r.submitted_at ? fmtExportDate(r.submitted_at) : "Not submitted"]);
    if (++i % 500 === 0) await yieldToLoop();
  }
  return workbook;
}

export async function exportClassAsyncXlsx(req, res) {
  const plan = await getTeacherPlan(req.user.sub);
  if (plan.code === "BASIC") return res.status(403).json({ message: "Analytics downloads are available on ThinkWAVE Pro and Institution plans." });
  if (queueStats().exportSize > 3) {
    return res.status(429).json({ message: "Export is busy. Please try the async export or try again shortly." });
  }
  const classId = Number(req.params.id);
  const quizId = Number(req.params.quizId);
  await enqueueExport(async () => {
    const data = await getAsyncExportData(classId, quizId, req.user.sub);
    if (!data) {
      if (!res.headersSent) res.status(404).json({ message: "Async quiz not found." });
      return;
    }
    const workbook = await buildAsyncWorkbook(data);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="async-${req.params.quizId}-results.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  });
}

// Per-question analysis for the async PDF second table. Shared by sync + async jobs.
export async function loadAsyncAnalysis({ classId, quizId, teacherId, templateType }) {
  const [asyncQuestions] = await pool.query(
    `SELECT id AS question_id, question_order, prompt, config_json, correct_json
     FROM quiz_questions
     WHERE quiz_id=:qid AND deleted_at IS NULL
     ORDER BY question_order ASC`,
    { qid: quizId }
  );
  const [asyncSubmissions] = await pool.query(
    `SELECT student_user_id, answers_json, submitted_at
     FROM async_quiz_submissions
     WHERE quiz_id=:qid AND class_id=:cid AND teacher_id=:tid`,
    { qid: quizId, cid: classId, tid: teacherId }
  );
  const asyncResponseRows = [];
  for (const submission of asyncSubmissions) {
    const checked = safeAnalyticsJson(submission.answers_json);
    for (const answer of Array.isArray(checked) ? checked : []) {
      asyncResponseRows.push({
        participant_id: Number(submission.student_user_id),
        question_id: Number(answer?.questionId),
        answer_json: answer?.answer ?? null,
        is_correct: answer?.isCorrect ? 1 : 0,
        points_awarded: Number(answer?.points || 0),
        answered_at: submission.submitted_at,
      });
    }
    if (asyncResponseRows.length % 1000 === 0) await yieldToLoop();
  }
  const asyncTemplate = String(templateType || "").toUpperCase();
  const asyncIsBatch = asyncTemplate === "MATCHING" || asyncTemplate === "CROSSWORD" || asyncTemplate === "THINK_SPELL" || asyncTemplate === "THINK_AND_SPELL";
  const asyncDetails = buildDetailedQuestionAnalytics(templateType, asyncQuestions, asyncResponseRows);
  return { asyncDetails, asyncIsBatch };
}

// Shared PDF layout for async results. Draws onto any PDFDocument.
export function renderAsyncPdf(doc, data, analysis) {
  const left = doc.page.margins.left;

  doc.font("Helvetica-Bold").fontSize(18).fillColor("#0f172a").text(data.quiz.title || "Asynchronous Quiz Results", left, doc.page.margins.top);
  doc.font("Helvetica").fontSize(10).fillColor("#64748b").text("Assigned Quiz Results");

  const submitted = data.rows.filter((r) => r.submitted_at).length;
  const scores = data.rows.filter((r) => r.score != null).map((r) => Number(r.score));
  // Same fields the Excel export carries, plus the submitted/average roll-up
  // the teacher would otherwise have to work out by hand from the rows.
  const y = drawInfoBlock(doc, {
    x: left,
    y: doc.y + 10,
    rows: [
      ["Class", data.quiz.class_name],
      ["Opens", fmtExportDate(data.quiz.available_from)],
      ["Closes", fmtExportDate(data.quiz.available_until)],
      ["Submitted", `${submitted} of ${data.rows.length}`],
      ["Average", scores.length ? (scores.reduce((sum, value) => sum + value, 0) / scores.length).toFixed(2) : "—"],
      ["Highest", scores.length ? Math.max(...scores) : "—"],
      ["Lowest", scores.length ? Math.min(...scores) : "—"],
    ],
  });

  const yAfterStudents = drawTable(doc, {
    x: left,
    y,
    title: "Student Results",
    columns: [
      { label: "Last Name", width: 76 },
      { label: "First Name", width: 70 },
      { label: "M.I.", width: 28 },
      { label: "Student ID", width: 62 },
      { label: "Score", width: 34, align: "right" },
      { label: "Max", width: 30, align: "right" },
      { label: "Tab", width: 30, align: "right" },
      { label: "Shots", width: 40, align: "right" },
      { label: "Submitted At", width: 142 },
    ],
    rows: data.rows.map((r) => [
      r.last_name,
      r.first_name,
      r.middle_initial || "",
      r.student_id,
      r.score ?? "—",
      r.max_score ?? "—",
      Number(r.tab_out_count || 0),
      Number(r.screenshot_count || 0),
      r.submitted_at ? fmtExportDate(r.submitted_at) : "Not submitted",
    ]),
  });

  const { asyncDetails, asyncIsBatch } = analysis;

  drawTable(doc, {
    x: left,
    y: yAfterStudents,
    title: asyncIsBatch ? "Batch Results" : "Question Results",
    columns: [
      { label: "#", width: 30, align: "right" },
      { label: asyncIsBatch ? "Batch" : "Question", width: 205 },
      { label: "Correct Answer(s)", width: 160 },
      { label: "% Correct", width: 60, align: "right" },
      { label: "% Incorrect", width: 60, align: "right" },
    ],
    rows: asyncDetails.map((q, idx) => [
      Number(q.question_order ?? idx) + 1,
      q.prompt || (asyncIsBatch ? `Batch ${idx + 1}` : `Question ${idx + 1}`),
      asyncCorrectAnswerText(data.quiz.template_type, q.correct_json, q.config_json),
      `${q.pct_correct ?? 0}% (${q.correct_answers ?? 0})`,
      `${q.pct_incorrect ?? 0}% (${q.incorrect_answers ?? 0})`,
    ]),
  });
}

export async function exportClassAsyncPdf(req, res) {
  const plan = await getTeacherPlan(req.user.sub);
  if (plan.code === "BASIC") return res.status(403).json({ message: "Analytics downloads are available on ThinkWAVE Pro and Institution plans." });
  if (queueStats().exportSize > 3) {
    return res.status(429).json({ message: "Export is busy. Please try the async export or try again shortly." });
  }
  const classId = Number(req.params.id);
  const quizId = Number(req.params.quizId);
  await enqueueExport(async () => {
    const data = await getAsyncExportData(classId, quizId, req.user.sub);
    if (!data) {
      if (!res.headersSent) res.status(404).json({ message: "Async quiz not found." });
      return;
    }
    const analysis = await loadAsyncAnalysis({ classId, quizId, teacherId: req.user.sub, templateType: data.quiz.template_type });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="async-${req.params.quizId}-results.pdf"`);
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    doc.pipe(res);
    renderAsyncPdf(doc, data, analysis);
    doc.end();
  });
}

function asyncCorrectAnswerText(templateType, correct = {}, config = {}) {
  const tt = String(templateType || "").toUpperCase();
  if (tt === "TRUE_FALSE") return String(correct?.choice ?? "—");
  if (tt === "TYPE_ANSWER" || tt === "GUESS_WORD_4PICS") {
    const extra = Array.isArray(correct?.answers) ? correct.answers : [];
    return [correct?.text, ...extra].filter(Boolean).join(" / ") || "—";
  }
  if (tt === "MCQ") {
    const values = Array.isArray(correct?.choices) && correct.choices.length
      ? correct.choices
      : [correct?.choice].filter(Boolean);
    const options = (Array.isArray(config?.options) ? config.options : []).map((option, index) => (
      option && typeof option === "object"
        ? { id: String(option.id || `option-${index + 1}`), text: String(option.text ?? option.label ?? "") }
        : { id: `option-${index + 1}`, text: String(option ?? "") }
    ));
    const resolved = values.map((value) => {
      const actual = String(value ?? "").trim().toLowerCase();
      const match = options.find((option) => [option.id, option.text].some((candidate) => String(candidate ?? "").trim().toLowerCase() === actual));
      return match?.text || String(value ?? "");
    }).filter(Boolean);
    return resolved.join(", ") || "—";
  }
  if (tt === "MATCHING") {
    const count = Array.isArray(correct?.pairs) ? correct.pairs.length : 0;
    return `${count} pair${count === 1 ? "" : "s"}`;
  }
  if (tt === "CROSSWORD" || tt === "THINK_SPELL" || tt === "THINK_AND_SPELL") {
    const words = Array.isArray(correct?.answers) && correct.answers.length
      ? correct.answers
      : Array.isArray(config?.answers) ? config.answers : [];
    return words.map(String).filter(Boolean).join(", ") || "—";
  }
  return String(correct?.text ?? "—");
}

export async function getClassAsyncAnalytics(req, res) {
  const classId = Number(req.params.id);
  const quizId = Number(req.params.quizId);
  const quizzesHaveBackground = await hasDatabaseColumn("quizzes", "background_key");
  const [[quiz]] = await pool.query(
    `SELECT q.id, q.title AS quiz_title, q.template_type, q.category, q.available_from, q.available_until,
            ${quizzesHaveBackground ? "q.background_key AS background_key," : "NULL AS background_key,"}
            q.class_id, c.name AS class_name
     FROM quizzes q
     JOIN classes c ON c.id=q.class_id
     WHERE q.id=:qid AND q.class_id=:cid AND q.teacher_id=:tid
       AND q.delivery_mode='ASYNCHRONOUS' AND q.deleted_at IS NULL`,
    { qid: quizId, cid: classId, tid: req.user.sub }
  );
  if (quiz) quiz.background_key = normalizeQuizBackgroundKey(quiz.background_key || getRememberedQuizBackground(quizId));
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
  const tabCounts = await loadAssignmentTabCounts(quizId);
  const shotCounts = await loadAssignmentShotCounts(quizId);

  const sessionPayload = {
    ...quiz,
    join_mode: "ASSIGNED",
    folder_name: quiz.class_name || "Unassigned",
    display_date: quiz.available_until || quiz.available_from || null,
    question_count: detailedQuestions.length,
  };
  const summaryPayload = { avg_score: avg, min_score: min, max_score: max, participant_count: submissions.length, student_count: submissions.length, guest_count: 0 };
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
      tab_out_count: tabCounts.get(Number(row.student_user_id)) || 0,
      screenshot_count: shotCounts.get(Number(row.student_user_id)) || 0,
      responses: buildStudentResponseDetails(responsesByStudent[Number(row.student_user_id)] || []),
    })),
    questions: detailedQuestions,
    tabMonitoring: submissions.map((row) => ({
      participant_id: row.student_user_id,
      student_user_id: row.student_user_id,
      first_name: row.first_name || "Student",
      last_name: row.last_name || row.student_id || "",
      tab_out_count: tabCounts.get(Number(row.student_user_id)) || 0,
      screenshot_count: shotCounts.get(Number(row.student_user_id)) || 0,
    })),
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

async function buildStudentAnalyticsData(classId, enrollmentId, req) {
  const [[student]] = await pool.query(
    `SELECT id,student_user_id,student_id,first_name,last_name,middle_initial,joined_at FROM class_enrollments
     WHERE id=:eid AND class_id=:cid AND teacher_id=:tid AND removed_at IS NULL`,
    { eid: enrollmentId, cid: classId, tid: req.user.sub }
  );
  if (!student) { const notFound = new Error("Student not found in this class."); notFound.status = 404; throw notFound; }
  const [[liveTotals]] = await pool.query(`SELECT COUNT(*) AS total FROM sessions WHERE class_id=:cid AND teacher_id=:tid AND status='ENDED'`, { cid: classId, tid: req.user.sub });
  const [[assignedTotals]] = await pool.query(`SELECT COUNT(*) AS total FROM quizzes WHERE class_id=:cid AND teacher_id=:tid AND delivery_mode='ASYNCHRONOUS' AND deleted_at IS NULL`, { cid: classId, tid: req.user.sub });
  const [liveRows] = await pool.query(
    `SELECT s.id,s.quiz_id,s.started_at,sc.total_points,r.question_id,r.answer_json,r.is_correct,r.points_awarded,r.answered_at,qq.config_json,
            p.id AS participant_id,p.joined_at,p.kicked_at
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
  // Class context (same numbers as the class view): per-activity averages + accuracy by type.
  let classActivityAvg = new Map();
  let classAccuracyByType = new Map();
  try {
    const full = await buildClassAnalyticsFullData(classId, req);
    for (const a of full.performance.activityAvg || []) classActivityAvg.set(a.key, a.average);
    for (const r of full.learning.accuracyByType || []) classAccuracyByType.set(String(r.type), r.accuracy);
  } catch { /* student view still stands without class lines */ }

  // Activity catalog for this class (titles, modes, dates).
  const [classSessions] = await pool.query(
    `SELECT s.id,s.quiz_id,q.title,q.template_type,s.started_at,s.ended_at
     FROM sessions s JOIN quizzes q ON q.id=s.quiz_id
     WHERE s.class_id=:cid AND s.teacher_id=:tid AND s.status='ENDED'
     ORDER BY COALESCE(s.ended_at,s.started_at,s.id) ASC`,
    { cid: classId, tid: req.user.sub }
  );
  const [classAsync] = await pool.query(
    `SELECT q.id AS quiz_id,q.title,q.template_type,q.available_from,q.available_until,
            COALESCE(q.available_until,q.available_from,q.created_at) AS completed_at
     FROM quizzes q WHERE q.class_id=:cid AND q.teacher_id=:tid
       AND q.delivery_mode='ASYNCHRONOUS' AND q.deleted_at IS NULL
     ORDER BY completed_at ASC,q.id ASC`,
    { cid: classId, tid: req.user.sub }
  );
  const acts = [
    ...classSessions.map((s) => ({ key: `live:${s.id}`, mode: "LIVE", sessionId: Number(s.id), quizId: Number(s.quiz_id), title: s.title || "Quiz", template_type: s.template_type, completed_at: s.ended_at || s.started_at, started_at: s.started_at, available_until: null })),
    ...classAsync.map((q) => ({ key: `async:${q.quiz_id}`, mode: "ASSIGNED", sessionId: null, quizId: Number(q.quiz_id), title: q.title || "Assignment", template_type: q.template_type, completed_at: q.completed_at, started_at: null, available_until: q.available_until })),
  ].sort((a, b) => new Date(a.completed_at || 0) - new Date(b.completed_at || 0));

  const liveSessionIds = new Set(liveRows.map((row) => Number(row.id)));
  const liveQuizIds = Array.from(new Set(liveRows.map((row) => Number(row.quiz_id)).filter(Boolean)));
  const liveMaxMap = await loadQuizMaxPoints(liveQuizIds);
  const sessionMax = new Map();
  for (const row of liveRows) {
    const sid = Number(row.id);
    if (!sessionMax.has(sid)) {
      const max = liveMaxMap.get(Number(row.quiz_id)) || 0;
      sessionMax.set(sid, max);
    }
  }
  const liveScoreBySession = new Map();
  for (const sid of liveSessionIds) {
    const row = liveRows.find((item) => Number(item.id) === sid);
    const max = sessionMax.get(sid) || 0;
    liveScoreBySession.set(sid, max ? (Number(row?.total_points || 0) / max) * 100 : 0);
  }
  // Placement per live session (rank among all scores in that session).
  let rankBySession = new Map();
  if (liveSessionIds.size) {
    try {
      const [allScores] = await pool.query(
        `SELECT session_id,total_points FROM scores WHERE session_id IN (:ids)`,
        { ids: Array.from(liveSessionIds) }
      );
      const bySession = new Map();
      for (const r of allScores) {
        const arr = bySession.get(Number(r.session_id)) || [];
        arr.push(Number(r.total_points || 0));
        bySession.set(Number(r.session_id), arr);
      }
      for (const [sid, arr] of bySession) {
        arr.sort((a, b) => b - a);
        const mine = liveScoreBySession.get(sid);
        const max = sessionMax.get(sid) || 0;
        const myPts = max ? (mine / 100) * max : 0;
        let rank = arr.findIndex((v) => myPts >= v - 1e-9) + 1;
        if (rank < 1) rank = arr.length;
        rankBySession.set(sid, { rank, of: arr.length });
      }
    } catch { rankBySession = new Map(); }
  }
  const asyncScores = asyncRows.map((row) => Number(row.max_score || 0) > 0 ? (Number(row.score || 0) / Number(row.max_score)) * 100 : 0);
  const scoreValues = [...liveScoreBySession.values(), ...asyncScores];

  // Per-activity timeline rows in date order (score + placement + status).
  const partBySession = new Map();
  for (const row of liveRows) {
    const sid = Number(row.id);
    if (!partBySession.has(sid) && row.participant_id) {
      partBySession.set(sid, { participantId: Number(row.participant_id), joinedAt: row.joined_at, kicked: !!row.kicked_at });
    }
  }
  const timeline = acts.map((a) => {
    if (a.mode === "LIVE") {
      const sid = a.sessionId;
      const part = partBySession.get(sid);
      if (!part) return { key: a.key, date: a.completed_at, activity: a.title, mode: "Live", score: null, placement: null, status: "Missed" };
      const score = Number((liveScoreBySession.get(sid) || 0).toFixed(1));
      const rk = rankBySession.get(sid);
      const started = new Date(a.started_at || 0).getTime();
      const joined = new Date(part.joinedAt || 0).getTime();
      const late = started && joined && joined - started > 60000;
      return {
        key: a.key, date: a.completed_at, activity: a.title, mode: "Live", score,
        placement: rk ? `${rk.rank}${rk.rank === 1 ? "st" : rk.rank === 2 ? "nd" : rk.rank === 3 ? "rd" : "th"} of ${rk.of}` : null,
        status: late ? "Joined late" : "On time",
      };
    }
    const sub = asyncRows.find((r) => Number(r.quiz_id) === a.quizId);
    if (!sub) return { key: a.key, date: a.completed_at, activity: a.title, mode: "Assigned", score: null, placement: null, status: "Missed" };
    const until = new Date(a.available_until || 0).getTime();
    const submitted = new Date(sub.submitted_at || 0).getTime();
    const lastHour = until && submitted && until - submitted < 3600000 && until - submitted >= 0;
    return {
      key: a.key, date: a.completed_at, activity: a.title, mode: "Assigned",
      score: Number(sub.max_score || 0) > 0 ? Number(((Number(sub.score || 0) / Number(sub.max_score)) * 100).toFixed(1)) : 0,
      placement: null, status: lastHour ? "Last hour" : "Submitted",
    };
  });

  // Trend (last 3 vs earlier), best, podium finishes.
  const orderedScores = timeline.filter((t) => t.score != null).map((t) => t.score);
  const last3 = orderedScores.slice(-3);
  const earlier = orderedScores.slice(0, Math.max(0, orderedScores.length - 3));
  const avg = (xs) => (xs.length ? xs.reduce((x, y) => x + y, 0) / xs.length : null);
  const trendVal = avg(last3) != null && avg(earlier) != null ? Number((avg(last3) - avg(earlier)).toFixed(1)) : null;
  let bestScore = null;
  for (const t of timeline) {
    if (t.score == null) continue;
    if (!bestScore || t.score > bestScore.score) bestScore = { score: t.score, activity: t.activity, date: t.date };
  }
  let podiums = 0;
  for (const [, rk] of rankBySession) if (rk.rank <= 3) podiums += 1;

  // Learning: real timings (§5) + almost answers + accuracy + most-missed.
  let correctMsSum = 0; let correctMsN = 0;
  let wrongMsSum = 0; let wrongMsN = 0;
  let quickWrong = 0; let timedOut = 0; let almost = 0;
  const typeMine = {};
  const bumpType = (tt, correct) => {
    typeMine[tt] = typeMine[tt] || { total: 0, correct: 0 };
    typeMine[tt].total += 1;
    if (correct) typeMine[tt].correct += 1;
  };
  const wrongDetails = [];
  for (const row of liveRows) {
    if (!row.question_id) continue;
    const answer = safeAnalyticsJson(row.answer_json) || {};
    const correct = Number(row.is_correct) === 1;
    const tt = String(row.template_type || "MCQ");
    bumpType(tt, correct);
    const ms = liveResponseMs(answer);
    if (ms != null) {
      if (correct) { correctMsSum += ms; correctMsN += 1; }
      else { wrongMsSum += ms; wrongMsN += 1; if (ms < 3000) quickWrong += 1; }
    }
    if (liveTimedOut(answer)) timedOut += 1;
    if (!correct && Number(row.points_awarded || 0) > 0) almost += 1;
    if (!correct) {
      wrongDetails.push({
        prompt: null, questionId: Number(row.question_id), templateType: tt,
        activity: null, date: row.answered_at, ms,
        answerRaw: answer, config: safeAnalyticsJson(row.config_json) || {},
      });
    }
  }
  for (const submission of asyncRows) {
    const entries = safeAnalyticsJson(submission.answers_json);
    const tts = String(submission.template_type || "MCQ");
    for (const entry of Array.isArray(entries) ? entries : []) {
      const correct = !!(entry?.isCorrect ?? entry?.answer?.isCorrect);
      bumpType(tts, correct);
      const ms = assignmentEntryMs(entry);
      if (ms != null) {
        if (correct) { correctMsSum += ms; correctMsN += 1; }
        else { wrongMsSum += ms; wrongMsN += 1; if (ms < 3000) quickWrong += 1; }
      }
      if (assignmentEntryTimedOut(entry)) timedOut += 1;
      if (!correct && Number(entry?.points || 0) > 0) almost += 1;
    }
  }
  const accuracyMine = Object.entries(typeMine).map(([type, v]) => ({
    type, accuracy: v.total ? Number(((v.correct / v.total) * 100).toFixed(1)) : 0,
    classAccuracy: classAccuracyByType.has(type) ? classAccuracyByType.get(type) : null,
  }));
  // Resolve most-missed prompts + answer text (ids → teacher words).
  let mostMissed = [];
  if (wrongDetails.length) {
    const qids = Array.from(new Set(wrongDetails.map((w) => w.questionId))).slice(0, 20);
    let qmap = new Map();
    try {
      const [qrows] = await pool.query(`SELECT id,prompt,config_json FROM quiz_questions WHERE id IN (:ids)`, { ids: qids });
      qmap = new Map(qrows.map((r) => [Number(r.id), r]));
    } catch { qmap = new Map(); }
    const actByQuiz = new Map();
    for (const a of acts) if (a.quizId && !actByQuiz.has(a.quizId)) actByQuiz.set(a.quizId, a);
    mostMissed = wrongDetails.slice(0, 30).map((w) => {
      const qrow = qmap.get(w.questionId);
      const cfg = w.config || safeAnalyticsJson(qrow?.config_json) || {};
      const opts = Array.isArray(cfg.options) ? cfg.options : [];
      const raw = w.answerRaw?.choice ?? (Array.isArray(w.answerRaw?.choices) ? w.answerRaw.choices.join(", ") : null) ?? w.answerRaw?.text ?? "";
      const nv = String(raw ?? "").trim().toLowerCase();
      const hit = opts.find((o) => String(o?.id ?? "").trim().toLowerCase() === nv);
      const answerText = (hit && (hit.text || hit.label)) ? String(hit.text || hit.label) : String(raw ?? "");
      return {
        prompt: qrow?.prompt || `Question ${w.questionId}`,
        activity: "", date: w.date,
        answer: answerText.slice(0, 80),
        ms: w.ms, templateType: w.templateType,
      };
    });
    // Attach activity titles by matching answered_at to nearest activity date.
    const actDates = acts.map((a) => ({ a, t: new Date(a.completed_at || 0).getTime() }));
    for (const m of mostMissed) {
      const at = new Date(m.date || 0).getTime();
      let bestA = null; let bestD = Infinity;
      for (const { a, t: tt } of actDates) {
        const d = Math.abs(at - tt);
        if (d < bestD) { bestD = d; bestA = a; }
      }
      m.activity = bestA ? bestA.title : "";
      delete m.date;
    }
    mostMissed = mostMissed.slice(0, 6);
  }

  // Participation: late list, strip, integrity (flagged only), groups.
  const lateList = [];
  for (const [sid, part] of partBySession) {
    const a = acts.find((x) => x.sessionId === sid);
    const started = new Date(a?.started_at || 0).getTime();
    const joined = new Date(part.joinedAt || 0).getTime();
    if (a && started && joined && joined - started > 60000) lateList.push(a.title);
  }
  const strip = acts.map((a) => {
    const t = timeline.find((x) => x.key === a.key);
    return {
      key: a.key, activity: a.title, date: a.completed_at,
      status: !t || t.status === "Missed" ? "missed" : (t.status === "Joined late" || t.status === "Last hour" ? "late" : "attended"),
    };
  });
  const integRows = [];
  const hasShot = await tableExists("screenshot_events");
  const hasAssignTab = await tableExists("assignment_tab_events");
  const hasAssignShot = await tableExists("assignment_screenshot_events");
  for (const a of acts) {
    if (a.mode === "LIVE") {
      const part = partBySession.get(a.sessionId);
      if (!part) continue;
      let tabOuts = 0; let captures = 0;
      try {
        const [[row]] = await pool.query(`SELECT COUNT(*) AS c FROM tab_events WHERE session_id=:sid AND participant_id=:pid`, { sid: a.sessionId, pid: part.participantId });
        tabOuts = Number(row?.c || 0);
      } catch {}
      if (hasShot) {
        try {
          const [[row]] = await pool.query(`SELECT COUNT(*) AS c FROM screenshot_events WHERE session_id=:sid AND participant_id=:pid`, { sid: a.sessionId, pid: part.participantId });
          captures = Number(row?.c || 0);
        } catch {}
      }
      const kicked = part.kicked ? 1 : 0;
      if (tabOuts || captures || kicked) integRows.push({ activity: a.title, date: a.completed_at, tabOuts, captures, kicked: kicked ? "Yes" : "No" });
    } else {
      let tabOuts = 0; let captures = 0;
      if (hasAssignTab) {
        try {
          const [[row]] = await pool.query(`SELECT COUNT(*) AS c FROM assignment_tab_events WHERE quiz_id=:qid AND student_user_id=:uid`, { qid: a.quizId, uid: student.student_user_id });
          tabOuts = Number(row?.c || 0);
        } catch {}
      }
      if (hasAssignShot) {
        try {
          const [[row]] = await pool.query(`SELECT COUNT(*) AS c FROM assignment_screenshot_events WHERE quiz_id=:qid AND student_user_id=:uid`, { qid: a.quizId, uid: student.student_user_id });
          captures = Number(row?.c || 0);
        } catch {}
      }
      if (tabOuts || captures) integRows.push({ activity: a.title, date: a.completed_at, tabOuts, captures, kicked: "No" });
    }
  }
  const integTotals = {
    tabOuts: integRows.reduce((s, r) => s + r.tabOuts, 0),
    captures: integRows.reduce((s, r) => s + r.captures, 0),
    kicked: integRows.filter((r) => r.kicked === "Yes").length,
  };
  let group = { sessions: 0, sessionTitles: [], proposals: 0, approved: 0, votes: 0 };
  try {
    if ((await tableExists("group_answer_proposals")) && partBySession.size) {
      const pids = Array.from(partBySession.values()).map((p) => p.participantId);
      const [props] = await pool.query(
        `SELECT session_id,status FROM group_answer_proposals WHERE proposer_participant_id IN (:ids)`,
        { ids: pids }
      );
      const gSessions = new Set(props.map((r) => Number(r.session_id)));
      let votes = 0;
      try {
        const [vrows] = await pool.query(`SELECT COUNT(*) AS c FROM group_answer_votes WHERE participant_id IN (:ids)`, { ids: pids });
        votes = Number(vrows?.[0]?.c || 0);
      } catch {}
      const approved = props.filter((r) => String(r.status) === "APPROVED").length;
      group = {
        sessions: gSessions.size,
        sessionTitles: acts.filter((a) => gSessions.has(a.sessionId)).map((a) => a.title),
        proposals: props.length, approved, votes,
        approvalPct: props.length ? Math.round((approved / props.length) * 100) : 0,
      };
    }
  } catch { /* group section optional */ }

  const liveParticipation = percent(liveSessionIds.size, liveTotals?.total || 0);
  const assignmentCompletion = percent(asyncRows.length, assignedTotals?.total || 0);
  const overallParticipation = percent(liveSessionIds.size + asyncRows.length, Number(liveTotals?.total || 0) + Number(assignedTotals?.total || 0));
  return {
    student,
    stats: {
      overall_participation: overallParticipation,
      average_score: scoreValues.length ? Number((scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length).toFixed(2)) : 0,
      live_participation: liveParticipation,
      assignment_completion: assignmentCompletion,
      average_answer_time: (correctMsN + wrongMsN) ? Number((((correctMsSum + wrongMsSum) / (correctMsN + wrongMsN)) / 1000).toFixed(1)) : 0,
      questions_timed_out: timedOut,
    },
    performance: {
      average: scoreValues.length ? Number((scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length).toFixed(1)) : 0,
      completed: orderedScores.length, total: acts.length,
      trend: trendVal,
      trendDetail: last3.length && earlier.length ? {
        last: Number(avg(last3).toFixed(1)), earlier: Number(avg(earlier).toFixed(1)),
      } : null,
      best: bestScore, podiums,
      series: timeline.map((t) => ({ key: t.key, activity: t.activity, date: t.date, score: t.score, classAverage: classActivityAvg.get(t.key) ?? null })),
      timeline,
    },
    learning: {
      correctMs: correctMsN ? Number((correctMsSum / correctMsN / 1000).toFixed(1)) : null,
      wrongMs: wrongMsN ? Number((wrongMsSum / wrongMsN / 1000).toFixed(1)) : null,
      quickWrong, timeouts: timedOut, almost,
      averageMs: (correctMsN + wrongMsN) ? Number((((correctMsSum + wrongMsSum) / (correctMsN + wrongMsN)) / 1000).toFixed(1)) : 0,
      accuracyByType: accuracyMine,
      mostMissed,
    },
    participation: {
      overall: overallParticipation, live: liveParticipation, assigned: assignmentCompletion,
      late: lateList.length, lateList: lateList.slice(0, 8),
      strip, integrity: integRows, integrityTotals: integTotals, group,
      totals: { live: liveTotals?.total || 0, assigned: assignedTotals?.total || 0 },
    },
  };
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

// --- Helpers for the three-tab class analytics (mockup doc). All metrics are
// computed from already-stored tables; no schema changes. -----------------

// Live responseMs lives in answer_json.__tw_live.responseMs; assignment
// entries carry responseMs; timeouts are __tw_live.timeExpired /
// __tw_time_expired / timedOut (doc section 5).
function liveResponseMs(answer) {
  if (!answer || typeof answer !== "object") return null;
  const v = Number(answer?.__tw_live?.responseMs);
  return Number.isFinite(v) && v >= 0 ? v : null;
}
function liveTimedOut(answer) {
  if (!answer || typeof answer !== "object") return false;
  return !!(answer?.__tw_live?.timeExpired || answer?.__tw_time_expired || answer?.timedOut);
}
function assignmentEntryMs(entry) {
  const v = Number(entry?.responseMs);
  return Number.isFinite(v) && v >= 0 ? v : null;
}
function assignmentEntryTimedOut(entry) {
  return !!(entry?.timedOut || entry?.answer?.timedOut || entry?.timeExpired);
}
async function tableExists(name) {
  try {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = :name`,
      { name }
    );
    return Number(rows?.[0]?.c || 0) > 0;
  } catch { return false; }
}

// Shared builder for the three-tab class analytics window. Export jobs reuse
// the exact same numbers so the files match what the teacher sees.
async function buildClassAnalyticsFullData(classId, req) {
  const [[folder]] = await pool.query(
    `SELECT id,name FROM classes WHERE id=:id AND teacher_id=:tid AND deleted_at IS NULL`,
    { id: classId, tid: req.user.sub }
  );
  if (!folder) { const e = new Error("Class folder not found."); e.status = 404; throw e; }

  const [enrollments] = await pool.query(
    `SELECT id,student_user_id,student_id,first_name,last_name,joined_at
     FROM class_enrollments WHERE class_id=:cid AND teacher_id=:tid AND removed_at IS NULL ORDER BY first_name,last_name`,
    { cid: classId, tid: req.user.sub }
  );
  const studentCount = enrollments.length;
  const uidByEnrollment = new Map(enrollments.map((e) => [Number(e.id), Number(e.student_user_id)]));
  const enrollByUid = new Map(enrollments.map((e) => [Number(e.student_user_id), e]));
  void uidByEnrollment;

  // --- Activities: ended live sessions + assignments ----------------------------
  const [liveSessions] = await pool.query(
    `SELECT s.id,s.quiz_id,q.title,q.template_type,s.started_at,s.ended_at
     FROM sessions s JOIN quizzes q ON q.id=s.quiz_id
     WHERE s.class_id=:cid AND s.teacher_id=:tid AND s.status='ENDED'
     ORDER BY COALESCE(s.ended_at,s.started_at,s.id) ASC`,
    { cid: classId, tid: req.user.sub }
  );
  const [asyncQuizzes] = await pool.query(
    `SELECT q.id AS quiz_id,q.title,q.template_type,q.available_from,q.available_until,
            COALESCE(q.available_until,q.available_from,q.created_at) AS completed_at
     FROM quizzes q WHERE q.class_id=:cid AND q.teacher_id=:tid
       AND q.delivery_mode='ASYNCHRONOUS' AND q.deleted_at IS NULL
     ORDER BY completed_at ASC,q.id ASC`,
    { cid: classId, tid: req.user.sub }
  );
  const liveMaxMap = await loadQuizMaxPoints(liveSessions.map((s) => Number(s.quiz_id)));
  const asyncMaxMap = await loadQuizMaxPoints(asyncQuizzes.map((q) => Number(q.quiz_id)));

  const activities = [
    ...liveSessions.map((s, i) => ({
      key: `live:${s.id}`, mode: "LIVE", sessionId: Number(s.id), quizId: Number(s.quiz_id),
      title: s.title || `Quiz ${i + 1}`, short: `Q${liveSessions.indexOf(s) + 1}`,
      template_type: s.template_type, completed_at: s.ended_at || s.started_at,
      max: Number(liveMaxMap.get(Number(s.quiz_id)) || 0),
    })),
    ...asyncQuizzes.map((q) => ({
      key: `async:${q.quiz_id}`, mode: "ASSIGNED", sessionId: null, quizId: Number(q.quiz_id),
      title: q.title || "Assignment", short: `A${asyncQuizzes.indexOf(q) + 1}`,
      template_type: q.template_type, completed_at: q.completed_at,
      available_from: q.available_from, available_until: q.available_until,
      max: Number(asyncMaxMap.get(Number(q.quiz_id)) || 0),
    })),
  ].sort((a, b) => new Date(a.completed_at || 0) - new Date(b.completed_at || 0));
  activities.forEach((a, i) => {
    const n = activities.filter((x, j) => j < i && x.mode === a.mode).length + 1;
    a.short = `${a.mode === "LIVE" ? "Q" : "A"}${n}`;
  });

  // --- Live scores / participants ------------------------------------------------
  const liveIds = liveSessions.map((s) => Number(s.id));
  let liveScores = [];
  let liveParticipants = [];
  let liveResponses = [];
  if (liveIds.length) {
    [liveScores] = await pool.query(
      `SELECT sc.session_id,sc.participant_id,COALESCE(sc.total_points,0) AS total_points,
              p.student_user_id,p.joined_at,p.kicked_at,p.first_name,p.last_name
       FROM scores sc JOIN session_participants p ON p.id=sc.participant_id
       WHERE sc.session_id IN (:ids)`,
      { ids: liveIds }
    );
    [liveParticipants] = await pool.query(
      `SELECT p.id,p.session_id,p.student_user_id,p.joined_at,p.kicked_at,s.started_at
       FROM session_participants p JOIN sessions s ON s.id=p.session_id
       WHERE p.session_id IN (:ids)`,
      { ids: liveIds }
    );
    [liveResponses] = await pool.query(
      `SELECT r.session_id,r.participant_id,r.question_id,r.answer_json,r.is_correct,r.points_awarded,
              qq.config_json,qq.prompt,q.template_type
       FROM responses r
       JOIN quiz_questions qq ON qq.id=r.question_id
       JOIN quizzes q ON q.id=qq.quiz_id
       WHERE r.session_id IN (:ids)`,
      { ids: liveIds }
    );
  }
  const [asyncSubs] = await pool.query(
    `SELECT a.quiz_id,a.student_user_id,a.score,a.max_score,a.answers_json,a.submitted_at,
            q.title,q.template_type,q.available_from,q.available_until
     FROM async_quiz_submissions a JOIN quizzes q ON q.id=a.quiz_id
     WHERE a.class_id=:cid AND a.teacher_id=:tid`,
    { cid: classId, tid: req.user.sub }
  );

  // Per-student per-activity percent (for bands, attention, improved, grid).
  const pctByStudentActivity = new Map(); // uid -> Map(key -> pct|null)
  const timeoutsByUid = new Map();
  const missedByUid = new Map();
  const lateByUid = new Map();
  const lastHourByUid = new Map();
  for (const e of enrollments) {
    pctByStudentActivity.set(Number(e.student_user_id), new Map());
    timeoutsByUid.set(Number(e.student_user_id), 0);
    missedByUid.set(Number(e.student_user_id), 0);
    lateByUid.set(Number(e.student_user_id), 0);
    lastHourByUid.set(Number(e.student_user_id), 0);
  }
  const partById = new Map(liveParticipants.map((p) => [Number(p.id), p]));
  const sessionById = new Map(liveSessions.map((s) => [Number(s.id), s]));

  for (const a of activities) {
    if (a.mode === "LIVE") {
      const started = new Date(sessionById.get(a.sessionId)?.started_at || 0).getTime();
      for (const e of enrollments) {
        const uid = Number(e.student_user_id);
        const part = liveParticipants.find((p) => Number(p.session_id) === a.sessionId && Number(p.student_user_id) === uid && !p.kicked_at);
        if (!part) {
          pctByStudentActivity.get(uid).set(a.key, null);
          missedByUid.set(uid, (missedByUid.get(uid) || 0) + 1);
          continue;
        }
        const score = liveScores.find((s) => Number(s.session_id) === a.sessionId && Number(s.participant_id) === Number(part.id));
        const pct = a.max > 0 ? (Number(score?.total_points || 0) / a.max) * 100 : 0;
        pctByStudentActivity.get(uid).set(a.key, Number(pct.toFixed(2)));
        const joined = new Date(part.joined_at || 0).getTime();
        if (started && joined && joined - started > 60000) lateByUid.set(uid, (lateByUid.get(uid) || 0) + 1);
      }
    } else {
      const until = new Date(a.available_until || 0).getTime();
      for (const e of enrollments) {
        const uid = Number(e.student_user_id);
        const sub = asyncSubs.find((s) => Number(s.quiz_id) === a.quizId && Number(s.student_user_id) === uid);
        if (!sub) {
          pctByStudentActivity.get(uid).set(a.key, null);
          missedByUid.set(uid, (missedByUid.get(uid) || 0) + 1);
          continue;
        }
        const pct = Number(sub.max_score || 0) > 0 ? (Number(sub.score || 0) / Number(sub.max_score)) * 100 : 0;
        pctByStudentActivity.get(uid).set(a.key, Number(pct.toFixed(2)));
        const submitted = new Date(sub.submitted_at || 0).getTime();
        if (until && submitted && until - submitted < 3600000 && until - submitted >= 0) {
          lastHourByUid.set(uid, (lastHourByUid.get(uid) || 0) + 1);
        }
      }
    }
  }
  // Timeouts per student (doc section 5: __tw_live.timeExpired + __tw_time_expired + timedOut).
  for (const r of liveResponses) {
    const part = partById.get(Number(r.participant_id));
    if (!part?.student_user_id) continue;
    const ans = safeAnalyticsJson(r.answer_json) || {};
    if (liveTimedOut(ans)) timeoutsByUid.set(Number(part.student_user_id), (timeoutsByUid.get(Number(part.student_user_id)) || 0) + 1);
  }
  for (const s of asyncSubs) {
    const entries = safeAnalyticsJson(s.answers_json);
    for (const entry of Array.isArray(entries) ? entries : []) {
      if (assignmentEntryTimedOut(entry)) timeoutsByUid.set(Number(s.student_user_id), (timeoutsByUid.get(Number(s.student_user_id)) || 0) + 1);
    }
  }

  // --- Performance ---------------------------------------------------------------
  const activityAvg = activities.map((a) => {
    const vals = [];
    for (const e of enrollments) {
      const v = pctByStudentActivity.get(Number(e.student_user_id))?.get(a.key);
      if (v != null) vals.push(v);
    }
    return { ...a, average: vals.length ? Number((vals.reduce((x, y) => x + y, 0) / vals.length).toFixed(1)) : 0, takers: vals.length };
  });
  const classAverage = (() => {
    const all = [];
    for (const e of enrollments) for (const [, v] of pctByStudentActivity.get(Number(e.student_user_id))) if (v != null) all.push(v);
    return all.length ? Number((all.reduce((x, y) => x + y, 0) / all.length).toFixed(1)) : 0;
  })();
  const withTakers = activityAvg.filter((a) => a.takers > 0);
  const best = withTakers.length ? withTakers.reduce((x, y) => (y.average > x.average ? y : x)) : null;
  const weakest = withTakers.length ? withTakers.reduce((x, y) => (y.average < x.average ? y : x)) : null;
  const liveAvgs = activityAvg.filter((a) => a.mode === "LIVE" && a.takers > 0).map((a) => a.average);
  const assignedAvgs = activityAvg.filter((a) => a.mode === "ASSIGNED" && a.takers > 0).map((a) => a.average);
  const liveVsAssigned = {
    live: liveAvgs.length ? Number((liveAvgs.reduce((x, y) => x + y, 0) / liveAvgs.length).toFixed(1)) : 0,
    assigned: assignedAvgs.length ? Number((assignedAvgs.reduce((x, y) => x + y, 0) / assignedAvgs.length).toFixed(1)) : 0,
  };
  const scoreBands = activityAvg.map((a) => {
    const bands = { b0_25: 0, b26_50: 0, b51_75: 0, b76_100: 0 };
    for (const e of enrollments) {
      const v = pctByStudentActivity.get(Number(e.student_user_id))?.get(a.key);
      if (v == null) continue;
      if (v <= 25) bands.b0_25 += 1;
      else if (v <= 50) bands.b26_50 += 1;
      else if (v <= 75) bands.b51_75 += 1;
      else bands.b76_100 += 1;
    }
    return { key: a.key, short: a.short, title: a.title, mode: a.mode, ...bands, takers: a.takers };
  });
  const perStudentRecent = enrollments.map((e) => {
    const uid = Number(e.student_user_id);
    const vals = activities.map((a) => pctByStudentActivity.get(uid)?.get(a.key)).filter((v) => v != null);
    const last3 = vals.slice(-3);
    const earlier = vals.slice(0, Math.max(0, vals.length - 3));
    const avg = (xs) => (xs.length ? xs.reduce((x, y) => x + y, 0) / xs.length : null);
    return {
      enrollment_id: Number(e.id), student_user_id: uid,
      first_name: e.first_name, last_name: e.last_name, student_id: e.student_id,
      recentAvg: avg(last3) != null ? Number(avg(last3).toFixed(1)) : null,
      earlierAvg: avg(earlier) != null ? Number(avg(earlier).toFixed(1)) : null,
      gain: avg(last3) != null && avg(earlier) != null ? Number((avg(last3) - avg(earlier)).toFixed(1)) : null,
      missed: missedByUid.get(uid) || 0,
      timeouts: timeoutsByUid.get(uid) || 0,
      completed: vals.length, total: activities.length,
    };
  });
  const needsAttention = perStudentRecent
    .filter((s) => (s.recentAvg != null && s.recentAvg < 60) || s.missed >= 2 || s.timeouts >= 3)
    .sort((a, b) => (a.recentAvg ?? 999) - (b.recentAvg ?? 999))
    .slice(0, 5)
    .map((s) => ({
      ...s,
      reason: s.recentAvg != null && s.recentAvg < 60 ? `${s.recentAvg}% avg` : s.missed >= 2 ? `missed ${s.missed}` : `${s.timeouts} timeouts`,
    }));
  const mostImproved = perStudentRecent
    .filter((s) => s.gain != null)
    .sort((a, b) => b.gain - a.gain)
    .slice(0, 3);

  // --- Learning ------------------------------------------------------------------
  const typeStats = {};
  for (const r of liveResponses) {
    const tt = String(r.template_type || "MCQ");
    typeStats[tt] = typeStats[tt] || { total: 0, correct: 0 };
    typeStats[tt].total += 1;
    if (Number(r.is_correct) === 1) typeStats[tt].correct += 1;
  }
  for (const s of asyncSubs) {
    const entries = safeAnalyticsJson(s.answers_json);
    const tts = String(s.template_type || "MCQ");
    for (const entry of Array.isArray(entries) ? entries : []) {
      typeStats[tts] = typeStats[tts] || { total: 0, correct: 0 };
      typeStats[tts].total += 1;
      // Assignment entries store isCorrect in various shapes; count conservatively.
      const c = entry?.isCorrect ?? entry?.answer?.isCorrect ?? entry?.correct;
      if (c === true || c === 1 || Number(entry?.points) > 0) typeStats[tts].correct += 1;
    }
  }
  const accuracyByType = Object.entries(typeStats).map(([type, v]) => ({
    type, total: v.total, correct: v.correct,
    accuracy: v.total ? Number(((v.correct / v.total) * 100).toFixed(1)) : 0,
  }));

  // Time used vs limit per activity + timeout counts.
  const timeByActivity = await Promise.all(activities.map(async (a) => {
    if (a.mode === "LIVE") {
      const rows = liveResponses.filter((r) => Number(r.session_id) === a.sessionId);
      let msSum = 0; let msN = 0; let timeouts = 0; let limitSum = 0; let limitN = 0;
      for (const r of rows) {
        const ans = safeAnalyticsJson(r.answer_json) || {};
        const ms = liveResponseMs(ans);
        if (ms != null) { msSum += ms; msN += 1; }
        if (liveTimedOut(ans)) timeouts += 1;
        const cfg = safeAnalyticsJson(r.config_json) || {};
        const lim = Number(cfg.timeLimitSec || 0);
        if (lim > 0) { limitSum += lim * 1000; limitN += 1; }
      }
      const avgMs = msN ? msSum / msN : 0;
      const avgLimit = limitN ? limitSum / limitN : 0;
      return { key: a.key, short: a.short, title: a.title, mode: a.mode, avgPct: avgLimit ? Number(((avgMs / avgLimit) * 100).toFixed(1)) : 0, timeouts, answers: rows.length };
    }
    const subs = asyncSubs.filter((s) => Number(s.quiz_id) === a.quizId);
    let msSum = 0; let msN = 0; let timeouts = 0;
    for (const s of subs) {
      for (const entry of Array.isArray(safeAnalyticsJson(s.answers_json)) ? safeAnalyticsJson(s.answers_json) : []) {
        const ms = assignmentEntryMs(entry);
        if (ms != null) { msSum += ms; msN += 1; }
        if (assignmentEntryTimedOut(entry)) timeouts += 1;
      }
    }
    // Assignment limit: quiz time_limit_sec fallback 300s.
    const [[quiz]] = await pool.query(`SELECT time_limit_sec FROM quizzes WHERE id=:id`, { id: a.quizId }).catch(() => [[null]]);
    const limitMs = Number(quiz?.time_limit_sec || 300) * 1000;
    const avgMs = msN ? msSum / msN : 0;
    return { key: a.key, short: a.short, title: a.title, mode: a.mode, avgPct: limitMs ? Number(((avgMs / limitMs) * 100).toFixed(1)) : 0, timeouts, answers: msN };
  }));

  // Hardest questions: lowest % correct across class live responses.
  // Stored answers are often option ids (e.g. choice-...) — resolve them to
  // the teacher-typed choice text via the question config so the
  // most-picked wrong answer reads as words, not ids.
  const normChoiceVal = (v) => String(v ?? "").trim().toLowerCase();
  const optionsOf = (templateType, config) => {
    if (String(templateType || "") === "TRUE_FALSE") return [{ id: "true", text: "True" }, { id: "false", text: "False" }];
    const list = Array.isArray(config?.options) ? config.options : [];
    return list.map((o, i) => (o && typeof o === "object"
      ? { id: String(o.id ?? `option-${i + 1}`), text: String(o.text ?? o.label ?? "") }
      : { id: `option-${i + 1}`, text: String(o ?? "") }));
  };
  const displayChoice = (raw, options) => {
    const hit = (options || []).find((o) => normChoiceVal(o.id) === normChoiceVal(raw));
    if (hit && hit.text) return hit.text;
    return String(raw ?? "");
  };
  const byQuestion = new Map();
  for (const r of liveResponses) {
    const qid = Number(r.question_id);
    if (!byQuestion.has(qid)) {
      const cfg = safeAnalyticsJson(r.config_json) || {};
      byQuestion.set(qid, {
        question_id: qid, prompt: r.prompt || `Question ${qid}`, template_type: r.template_type,
        sessionId: Number(r.session_id), total: 0, correct: 0, msSum: 0, msN: 0,
        picks: new Map(), options: optionsOf(r.template_type, cfg),
      });
    }
    const q = byQuestion.get(qid);
    q.total += 1;
    if (Number(r.is_correct) === 1) q.correct += 1;
    const ans = safeAnalyticsJson(r.answer_json) || {};
    const ms = liveResponseMs(ans);
    if (ms != null) { q.msSum += ms; q.msN += 1; }
    const raws = Array.isArray(ans?.choices) && ans.choices.length ? ans.choices : [ans?.choice ?? ans?.text].filter((x) => x !== undefined && x !== null && x !== "");
    for (const raw of raws) {
      const label = displayChoice(raw, q.options).trim().slice(0, 60);
      if (label && Number(r.is_correct) !== 1) q.picks.set(label, (q.picks.get(label) || 0) + 1);
    }
  }
  const hardest = [...byQuestion.values()]
    .map((q) => {
      const acc = q.total ? (q.correct / q.total) * 100 : 100;
      let topWrong = null;
      for (const [label, n] of q.picks) if (!topWrong || n > topWrong.n) topWrong = { label, n };
      const act = activities.find((a) => a.sessionId === q.sessionId);
      return {
        question_id: q.question_id, prompt: q.prompt, template_type: q.template_type,
        activity: act?.title || "", short: act?.short || "",
        accuracy: Number(acc.toFixed(1)), total: q.total,
        topWrong: topWrong ? { label: topWrong.label, pct: Number(((topWrong.n / Math.max(1, q.total)) * 100).toFixed(1)) } : null,
        avgSec: q.msN ? Number((q.msSum / q.msN / 1000).toFixed(1)) : null,
      };
    })
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 5);

  // Answer breakdown for hardest MCQ / True-False (reuses session choice-breakdown recipe).
  try {
    const hardIds = hardest.map((q) => Number(q.question_id)).filter(Boolean);
    if (hardIds.length) {
      const [qrows] = await pool.query(
        `SELECT id,config_json,correct_json FROM quiz_questions WHERE id IN (:ids)`,
        { ids: hardIds }
      );
      const normOpt = (o, i) => (o && typeof o === "object"
        ? { id: String(o.id ?? `option-${i + 1}`), text: String(o.text ?? o.label ?? "") }
        : { id: `option-${i + 1}`, text: String(o ?? "") });
      const normVal = (v) => String(v ?? "").trim().toLowerCase();
      for (const h of hardest) {
        const row = qrows.find((r) => Number(r.id) === Number(h.question_id));
        if (!row) continue;
        const tt = String(h.template_type || "MCQ");
        if (tt !== "MCQ" && tt !== "TRUE_FALSE") continue;
        const cfg = safeAnalyticsJson(row.config_json) || {};
        const cor = safeAnalyticsJson(row.correct_json) || {};
        const options = tt === "TRUE_FALSE"
          ? [{ id: "true", text: "True" }, { id: "false", text: "False" }]
          : (Array.isArray(cfg.options) ? cfg.options : []).map(normOpt);
        if (!options.length) continue;
        const correctVals = Array.isArray(cor.choices) && cor.choices.length ? cor.choices : [cor.choice].filter(Boolean);
        const correctIdx = new Set();
        correctVals.forEach((v) => {
          const i = options.findIndex((o) => normVal(o.id) === normVal(v) || normVal(o.text) === normVal(v));
          if (i >= 0) correctIdx.add(i);
        });
        const counts = new Array(options.length).fill(0);
        let n = 0;
        for (const r of liveResponses) {
          if (Number(r.question_id) !== Number(h.question_id)) continue;
          const ans = safeAnalyticsJson(r.answer_json) || {};
          const sel = Array.isArray(ans.choices) ? ans.choices : [ans.choice].filter((x) => x !== undefined && x !== null && x !== "");
          n += 1;
          const seen = new Set();
          for (const v of sel) {
            const i = options.findIndex((o) => normVal(o.id) === normVal(v) || normVal(o.text) === normVal(v));
            if (i >= 0 && !seen.has(i)) { seen.add(i); counts[i] += 1; }
          }
        }
        h.breakdown = options.map((o, i) => ({
          label: o.text || o.id, isCorrect: correctIdx.has(i),
          pct: n ? Number(((counts[i] / n) * 100).toFixed(1)) : 0,
        }));
      }
    }
  } catch { /* breakdown optional; hardest list still stands */ }

  // --- Participation & integrity ---------------------------------------------------
  const livePart = liveSessions.length
    ? liveParticipants.filter((p) => !p.kicked_at).length / Math.max(1, liveSessions.length * Math.max(1, studentCount)) * 100
    : 0;
  const asyncDone = asyncSubs.length;
  const asyncTotal = asyncQuizzes.length * Math.max(1, studentCount);
  const notSubmittedByQuiz = asyncQuizzes.map((q) => {
    const submitted = new Set(asyncSubs.filter((s) => Number(s.quiz_id) === Number(q.quiz_id)).map((s) => Number(s.student_user_id)));
    const missing = enrollments.filter((e) => !submitted.has(Number(e.student_user_id)));
    return {
      quiz_id: Number(q.quiz_id), title: q.title, missing: missing.map((e) => ({ enrollment_id: Number(e.id), first_name: e.first_name, last_name: e.last_name })),
    };
  }).filter((q) => q.missing.length > 0);
  const notSubmittedCount = notSubmittedByQuiz.length ? Math.max(...notSubmittedByQuiz.map((q) => q.missing.length)) : 0;

  let repeatGuests = [];
  if (await tableExists("guest_session_joins")) {
    try {
      const [rows] = await pool.query(
        `SELECT name_key AS name, device_hash, COUNT(DISTINCT session_id) AS visits, MAX(created_at) AS last_visit
         FROM guest_session_joins WHERE class_id=:cid GROUP BY name_key, device_hash HAVING visits >= 3`,
        { cid: classId }
      );
      repeatGuests = rows.map((r) => ({ name: r.name || "Guest", visits: Number(r.visits || 0), last_visit: r.last_visit }));
    } catch { repeatGuests = []; }
  }
  const attendanceGrid = enrollments.map((e) => {
    const uid = Number(e.student_user_id);
    return {
      enrollment_id: Number(e.id), first_name: e.first_name, last_name: e.last_name,
      cells: activities.map((a) => {
        const v = pctByStudentActivity.get(uid)?.get(a.key);
        if (v == null) return { key: a.key, status: "missed" };
        if (a.mode === "LIVE") {
          const part = liveParticipants.find((p) => Number(p.session_id) === a.sessionId && Number(p.student_user_id) === uid);
          const started = new Date(sessionById.get(a.sessionId)?.started_at || 0).getTime();
          const joined = new Date(part?.joined_at || 0).getTime();
          if (started && joined && joined - started > 60000) return { key: a.key, status: "late" };
          return { key: a.key, status: "attended" };
        }
        const sub = asyncSubs.find((s) => Number(s.quiz_id) === a.quizId && Number(s.student_user_id) === uid);
        const until = new Date(a.available_until || 0).getTime();
        const submitted = new Date(sub?.submitted_at || 0).getTime();
        if (until && submitted && until - submitted < 3600000 && until - submitted >= 0) return { key: a.key, status: "late" };
        return { key: a.key, status: "attended" };
      }),
    };
  });
  // Integrity signals per activity.
  const hasTab = await tableExists("tab_events");
  const hasShot = await tableExists("screenshot_events");
  const hasInteg = await tableExists("integrity_events");
  const hasAssignTab = await tableExists("assignment_tab_events");
  const hasAssignShot = await tableExists("assignment_screenshot_events");
  const integrityByActivity = await Promise.all(activities.map(async (a) => {
    if (a.mode === "LIVE") {
      let tabOuts = 0; let captures = 0; let tamper = 0;
      if (hasTab) {
        try {
          const [[row]] = await pool.query(`SELECT COUNT(*) AS c FROM tab_events WHERE session_id=:sid`, { sid: a.sessionId });
          tabOuts = Number(row?.c || 0);
        } catch {}
      }
      if (hasShot) {
        try {
          const [[row]] = await pool.query(`SELECT COUNT(*) AS c FROM screenshot_events WHERE session_id=:sid`, { sid: a.sessionId });
          captures = Number(row?.c || 0);
        } catch {}
      }
      if (hasInteg) {
        try {
          const [[row]] = await pool.query(`SELECT COUNT(*) AS c FROM integrity_events WHERE session_id=:sid`, { sid: a.sessionId });
          tamper = Number(row?.c || 0);
        } catch {}
      }
      let kicks = 0;
      try {
        const [[row]] = await pool.query(`SELECT COUNT(*) AS c FROM session_participants WHERE session_id=:sid AND kicked_at IS NOT NULL`, { sid: a.sessionId });
        kicks = Number(row?.c || 0);
      } catch {}
      return { key: a.key, short: a.short, title: a.title, tabOuts, captures, tamper, kicks, total: tabOuts + captures + tamper + kicks };
    }
    let tabOuts = 0; let captures = 0;
    if (hasAssignTab) {
      try {
        const [[row]] = await pool.query(`SELECT COUNT(*) AS c FROM assignment_tab_events WHERE quiz_id=:qid`, { qid: a.quizId });
        tabOuts = Number(row?.c || 0);
      } catch {}
    }
    if (hasAssignShot) {
      try {
        const [[row]] = await pool.query(`SELECT COUNT(*) AS c FROM assignment_screenshot_events WHERE quiz_id=:qid`, { qid: a.quizId });
        captures = Number(row?.c || 0);
      } catch {}
    }
    return { key: a.key, short: a.short, title: a.title, tabOuts, captures, tamper: 0, kicks: 0, total: tabOuts + captures };
  }));
  const lastHourSubs = asyncSubs.filter((s) => {
    const q = asyncQuizzes.find((x) => Number(x.quiz_id) === Number(s.quiz_id));
    const until = new Date(q?.available_until || 0).getTime();
    const submitted = new Date(s.submitted_at || 0).getTime();
    return until && submitted && until - submitted < 3600000 && until - submitted >= 0;
  });
  const lastHourList = lastHourSubs.slice(0, 8).map((s) => {
    const e = enrollByUid.get(Number(s.student_user_id));
    return { first_name: e?.first_name || "", last_name: e?.last_name || "", submitted_at: s.submitted_at };
  });

  return {
    class: folder,
    meta: {
      studentCount, liveCount: liveSessions.length, assignmentCount: asyncQuizzes.length,
      range: { from: activities[0]?.completed_at || null, to: activities[activities.length - 1]?.completed_at || null },
    },
    performance: {
      classAverage, best, weakest, liveVsAssigned, activityAvg, scoreBands, needsAttention, mostImproved,
    },
    learning: { accuracyByType, timeByActivity, hardest },
    participation: {
      liveParticipation: Number(livePart.toFixed(1)),
      assignmentCompletion: asyncTotal ? Number(((asyncDone / asyncTotal) * 100).toFixed(1)) : 0,
      notSubmittedCount, notSubmittedByQuiz: notSubmittedByQuiz.slice(0, 3),
      repeatGuests: repeatGuests.slice(0, 8),
      attendanceGrid: attendanceGrid.slice(0, 60),
      attendanceActivities: activities.map((a) => ({ key: a.key, short: a.short, title: a.title, mode: a.mode })),
      integrityByActivity, lastHourList,
      totals: { students: studentCount, activities: activities.length },
    },
  };
}

export async function getClassAnalyticsFull(req, res) {
  if (!(await requireAdvancedClassAnalytics(req, res))) return;
  try {
    const data = await buildClassAnalyticsFullData(Number(req.params.id), req);
    return res.json(data);
  } catch (e) {
    if (!res.headersSent) return res.status(Number(e?.status) || 500).json({ message: e?.message || "Server error" });
  }
}

function classExportFileBase(data, classId) {
  const name = String(data?.class?.name || `class-${classId}`).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || `class-${classId}`;
  const day = new Date().toISOString().slice(0, 10);
  return `class-${name}-${day}`;
}

// Shared PDF layout for the class analytics window: same cards, tables and
// lists in the same tab order (charts become their underlying numbers).
export function renderClassAnalyticsPdf(data, doc) {
  const left = doc.page.margins.left;
  const meta = data.meta || {};
  doc.font("Helvetica-Bold").fontSize(18).fillColor("#0f172a").text(`Class Analytics · ${data?.class?.name || ""}`, left, doc.page.margins.top);
  doc.font("Helvetica").fontSize(10).fillColor("#64748b").text(
    `${meta.studentCount ?? 0} students · ${meta.liveCount ?? 0} live sessions · ${meta.assignmentCount ?? 0} assignments`
  );
  const perf = data.performance || {};
  let y = drawInfoBlock(doc, {
    x: left,
    y: doc.y + 10,
    rows: [
      ["Class average", `${perf.classAverage ?? 0}%`],
      ["Best activity", perf.best ? `${perf.best.average}% · ${perf.best.title} (${perf.best.mode === "LIVE" ? "Live" : "Assigned"})` : "—"],
      ["Weakest activity", perf.weakest ? `${perf.weakest.average}% · ${perf.weakest.title} (${perf.weakest.mode === "LIVE" ? "Live" : "Assigned"})` : "—"],
      ["Live vs assignment", `${perf.liveVsAssigned?.live ?? 0}% · ${perf.liveVsAssigned?.assigned ?? 0}%`],
    ],
  });
  y = drawTable(doc, {
    x: left, y, title: "Performance — Class average per activity",
    columns: [
      { label: "Activity", width: 180 },
      { label: "Mode", width: 80 },
      { label: "Average", width: 70, align: "right" },
      { label: "Takers", width: 60, align: "right" },
    ],
    rows: (perf.activityAvg || []).map((a) => [a.title, a.mode === "LIVE" ? "Live" : "Assigned", `${a.average}%`, a.takers]),
  });
  y = drawTable(doc, {
    x: left, y, title: "Performance — Needs attention",
    columns: [
      { label: "Student", width: 220 },
      { label: "Detail", width: 170 },
    ],
    rows: (perf.needsAttention || []).map((s) => [`${s.first_name} ${s.last_name}`, s.reason]),
  });
  y = drawTable(doc, {
    x: left, y, title: "Performance — Most improved",
    columns: [
      { label: "Student", width: 220 },
      { label: "Gain", width: 170, align: "right" },
    ],
    rows: (perf.mostImproved || []).map((s) => [`${s.first_name} ${s.last_name}`, `+${s.gain} pts`]),
  });
  const learning = data.learning || {};
  y = drawTable(doc, {
    x: left, y, title: "Learning — Accuracy by question type",
    columns: [
      { label: "Type", width: 180 },
      { label: "Answers", width: 80, align: "right" },
      { label: "Accuracy", width: 130, align: "right" },
    ],
    rows: (learning.accuracyByType || []).map((r) => [r.type, r.total, `${r.accuracy}%`]),
  });
  y = drawTable(doc, {
    x: left, y, title: "Learning — Time used vs time limit",
    columns: [
      { label: "Activity", width: 180 },
      { label: "Time used", width: 100, align: "right" },
      { label: "Timeouts", width: 110, align: "right" },
    ],
    rows: (learning.timeByActivity || []).map((r) => [r.title, `${r.avgPct}%`, r.timeouts]),
  });
  y = drawTable(doc, {
    x: left, y, title: "Learning — Hardest questions",
    columns: [
      { label: "Question", width: 200 },
      { label: "Activity", width: 80 },
      { label: "Correct", width: 60, align: "right" },
      { label: "Most-picked wrong", width: 150 },
    ],
    rows: (learning.hardest || []).map((q) => [q.prompt, q.activity, `${q.accuracy}%`, q.topWrong ? `${q.topWrong.label} (${q.topWrong.pct}%)` : "—"]),
  });
  const part = data.participation || {};
  y = drawTable(doc, {
    x: left, y, title: "Participation",
    columns: [
      { label: "Metric", width: 220 },
      { label: "Value", width: 170 },
    ],
    rows: [
      ["Live participation", `${part.liveParticipation ?? 0}%`],
      ["Assignment completion", `${part.assignmentCompletion ?? 0}%`],
      ["Not submitted (worst assignment)", part.notSubmittedCount ?? 0],
      ["Repeat guests", (part.repeatGuests || []).length],
    ],
  });
  drawTable(doc, {
    x: left, y, title: "Participation — Integrity signals per activity",
    columns: [
      { label: "Activity", width: 120 },
      { label: "Tab-outs", width: 70, align: "right" },
      { label: "Capture keys", width: 80, align: "right" },
      { label: "Kicks", width: 60, align: "right" },
    ],
    rows: (part.integrityByActivity || []).map((r) => [r.title, r.tabOuts, r.captures, r.kicks]),
  });
}

export async function buildClassAnalyticsWorkbook(data) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ThinkWAVE";
  const meta = data.meta || {};
  const perf = data.performance || {};
  const learning = data.learning || {};
  const part = data.participation || {};

  const summary = workbook.addWorksheet("Summary");
  summary.addRows([
    ["Class", data?.class?.name || ""],
    ["Students", meta.studentCount ?? 0],
    ["Live sessions", meta.liveCount ?? 0],
    ["Assignments", meta.assignmentCount ?? 0],
    ["Class average", `${perf.classAverage ?? 0}%`],
    ["Best activity", perf.best ? `${perf.best.title} (${perf.best.average}%)` : "—"],
    ["Weakest activity", perf.weakest ? `${perf.weakest.title} (${perf.weakest.average}%)` : "—"],
    ["Live average", `${perf.liveVsAssigned?.live ?? 0}%`],
    ["Assignment average", `${perf.liveVsAssigned?.assigned ?? 0}%`],
  ]);

  const activities = workbook.addWorksheet("Performance");
  activities.columns = [
    { header: "Activity", key: "title", width: 34 },
    { header: "Mode", key: "mode", width: 12 },
    { header: "Average %", key: "average", width: 12 },
    { header: "Takers", key: "takers", width: 10 },
  ];
  (perf.activityAvg || []).forEach((a) => activities.addRow({ title: a.title, mode: a.mode, average: a.average, takers: a.takers }));

  const attention = workbook.addWorksheet("Needs attention");
  attention.columns = [
    { header: "First name", key: "first", width: 20 },
    { header: "Last name", key: "last", width: 20 },
    { header: "Detail", key: "reason", width: 26 },
  ];
  (perf.needsAttention || []).forEach((s) => attention.addRow({ first: s.first_name, last: s.last_name, reason: s.reason }));
  (perf.mostImproved || []).forEach((s) => attention.addRow({ first: s.first_name, last: s.last_name, reason: `+${s.gain} pts improved` }));

  const accuracy = workbook.addWorksheet("Accuracy by type");
  accuracy.columns = [
    { header: "Question type", key: "type", width: 22 },
    { header: "Answers", key: "total", width: 12 },
    { header: "Accuracy %", key: "accuracy", width: 12 },
  ];
  (learning.accuracyByType || []).forEach((r) => accuracy.addRow(r));

  const hardest = workbook.addWorksheet("Hardest questions");
  hardest.columns = [
    { header: "Question", key: "prompt", width: 50 },
    { header: "Activity", key: "activity", width: 20 },
    { header: "Accuracy %", key: "accuracy", width: 12 },
    { header: "Most-picked wrong", key: "wrong", width: 34 },
  ];
  (learning.hardest || []).forEach((q) => hardest.addRow({
    prompt: q.prompt, activity: q.activity, accuracy: q.accuracy,
    wrong: q.topWrong ? `${q.topWrong.label} (${q.topWrong.pct}%)` : "—",
  }));

  const integrity = workbook.addWorksheet("Integrity signals");
  integrity.columns = [
    { header: "Activity", key: "title", width: 24 },
    { header: "Tab-outs", key: "tabOuts", width: 12 },
    { header: "Capture keys", key: "captures", width: 14 },
    { header: "Kicks", key: "kicks", width: 10 },
  ];
  (part.integrityByActivity || []).forEach((r) => integrity.addRow(r));

  return workbook;
}

export async function exportClassAnalyticsPdf(req, res) {
  if (!(await requireAdvancedClassAnalytics(req, res))) return;
  if (queueStats().exportSize > 3) {
    return res.status(429).json({ message: "Export is busy. Please try again shortly." });
  }
  const classId = Number(req.params.id);
  await enqueueExport(async () => {
    let data;
    try {
      data = await buildClassAnalyticsFullData(classId, req);
    } catch (e) {
      if (!res.headersSent) return res.status(Number(e?.status) || 404).json({ message: e?.message || "Class not found." });
      return;
    }
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${classExportFileBase(data, classId)}.pdf"`);
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    doc.pipe(res);
    renderClassAnalyticsPdf(data, doc);
    doc.end();
  });
}

export async function exportClassAnalyticsXlsx(req, res) {
  if (!(await requireAdvancedClassAnalytics(req, res))) return;
  if (queueStats().exportSize > 3) {
    return res.status(429).json({ message: "Export is busy. Please try again shortly." });
  }
  const classId = Number(req.params.id);
  await enqueueExport(async () => {
    let data;
    try {
      data = await buildClassAnalyticsFullData(classId, req);
    } catch (e) {
      if (!res.headersSent) return res.status(Number(e?.status) || 404).json({ message: e?.message || "Class not found." });
      return;
    }
    const workbook = await buildClassAnalyticsWorkbook(data);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${classExportFileBase(data, classId)}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  });
}

function studentExportFileBase(data) {
  const name = `${data?.student?.first_name || ""}-${data?.student?.last_name || ""}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "student";
  const day = new Date().toISOString().slice(0, 10);
  return `student-${name}-${day}`;
}

// PDF-only per-student report (the class workbook already holds every
// student's rows). Same numbers as the three-tab student window.
export function renderStudentAnalyticsPdf(data, doc) {
  const left = doc.page.margins.left;
  const st = data.student || {};
  const perf = data.performance || {};
  const learning = data.learning || {};
  const part = data.participation || {};
  doc.font("Helvetica-Bold").fontSize(18).fillColor("#0f172a")
    .text(`${st.first_name || ""} ${st.last_name || ""}`.trim() || "Student", left, doc.page.margins.top);
  doc.font("Helvetica").fontSize(10).fillColor("#64748b")
    .text(`Student ID ${st.student_id || "—"} · enrolled ${st.joined_at ? new Date(st.joined_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}`);
  let y = drawInfoBlock(doc, {
    x: left,
    y: doc.y + 10,
    rows: [
      ["Average score", `${perf.average ?? 0}% (${perf.completed ?? 0} of ${perf.total ?? 0} activities)`],
      ["Trend", perf.trendDetail ? `+${perf.trend} pts (last 3 ${perf.trendDetail.last}% vs earlier ${perf.trendDetail.earlier}%)` : "—"],
      ["Best score", perf.best ? `${perf.best.score}% · ${perf.best.activity}` : "—"],
      ["Podium finishes", perf.podiums ?? 0],
    ],
  });
  y = drawTable(doc, {
    x: left, y, title: "Performance — Activity timeline",
    columns: [
      { label: "Date", width: 70 },
      { label: "Activity", width: 150 },
      { label: "Mode", width: 65 },
      { label: "Score", width: 55, align: "right" },
      { label: "Placement", width: 75 },
      { label: "Status", width: 100 },
    ],
    rows: (perf.timeline || []).map((t) => [
      t.date ? new Date(t.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—",
      t.activity, t.mode, t.score == null ? "—" : `${t.score}%`, t.placement || "—", t.status,
    ]),
  });
  y = drawTable(doc, {
    x: left, y, title: "Learning",
    columns: [
      { label: "Metric", width: 220 },
      { label: "Value", width: 170 },
    ],
    rows: [
      ["Avg time when correct", learning.correctMs != null ? `${learning.correctMs} s` : "—"],
      ["Avg time when wrong", learning.wrongMs != null ? `${learning.wrongMs} s` : "—"],
      ["Quick wrong answers (<3s)", learning.quickWrong ?? 0],
      ["Average answer time", `${learning.averageMs ?? 0} s`],
      ["Timeouts", learning.timeouts ?? 0],
      ["Almost answers (partial credit)", learning.almost ?? 0],
    ],
  });
  y = drawTable(doc, {
    x: left, y, title: "Learning — Most-missed questions",
    columns: [
      { label: "Question", width: 200 },
      { label: "Activity", width: 90 },
      { label: "Answer given", width: 130 },
      { label: "Time", width: 60, align: "right" },
    ],
    rows: (learning.mostMissed || []).map((m) => [m.prompt, m.activity, m.answer || "—", m.ms != null ? `${(m.ms / 1000).toFixed(1)} s` : "—"]),
  });
  y = drawTable(doc, {
    x: left, y, title: "Participation & Integrity",
    columns: [
      { label: "Metric", width: 220 },
      { label: "Value", width: 170 },
    ],
    rows: [
      ["Overall participation", `${part.overall ?? 0}%`],
      ["Live participation", `${part.live ?? 0}%`],
      ["Assignment completion", `${part.assigned ?? 0}%`],
      ["Joined late", `${part.late ?? 0}`],
      ["Tab-outs (total)", part.integrityTotals?.tabOuts ?? 0],
      ["Capture keys (total)", part.integrityTotals?.captures ?? 0],
      ["Group proposals", part.group?.proposals ?? 0],
      ["Approved by group", part.group?.approved ?? 0],
      ["Votes cast", part.group?.votes ?? 0],
    ],
  });
  drawTable(doc, {
    x: left, y, title: "Participation — Integrity signals by activity (flagged only)",
    columns: [
      { label: "Activity", width: 170 },
      { label: "Tab-outs", width: 70, align: "right" },
      { label: "Capture keys", width: 80, align: "right" },
      { label: "Kicked", width: 70 },
    ],
    rows: (part.integrity || []).map((r) => [r.activity, r.tabOuts, r.captures, r.kicked]),
  });
}

export async function getClassStudentAnalytics(req, res) {
  if (!(await requireAdvancedClassAnalytics(req, res))) return;
  try {
    const data = await buildStudentAnalyticsData(Number(req.params.id), Number(req.params.enrollmentId), req);
    return res.json(data);
  } catch (e) {
    if (!res.headersSent) return res.status(Number(e?.status) || 500).json({ message: e?.message || "Server error" });
  }
}

export async function exportStudentAnalyticsPdf(req, res) {
  if (!(await requireAdvancedClassAnalytics(req, res))) return;
  if (queueStats().exportSize > 3) {
    return res.status(429).json({ message: "Export is busy. Please try again shortly." });
  }
  const classId = Number(req.params.id);
  const enrollmentId = Number(req.params.enrollmentId);
  await enqueueExport(async () => {
    let data;
    try {
      data = await buildStudentAnalyticsData(classId, enrollmentId, req);
    } catch (e) {
      if (!res.headersSent) return res.status(Number(e?.status) || 404).json({ message: e?.message || "Student not found." });
      return;
    }
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${studentExportFileBase(data)}.pdf"`);
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    doc.pipe(res);
    renderStudentAnalyticsPdf(data, doc);
    doc.end();
  });
}
