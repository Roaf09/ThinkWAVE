/* FILE GUIDE:
 * server/src/modules/analytics/analytics.controller.js
 * Purpose: Analytics/export logic used after sessions end and when teachers open result views.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { pool } from "../../db.js";

function safeJson(v) {
  if (!v) return null;
  if (typeof v === "object") return v;
  try { return JSON.parse(v); } catch { return null; }
}

function fmtDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function cleanTemplateLabel(value) {
  return String(value || "")
    .replace("TYPE_ANSWER", "IDENTIFICATION")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

async function getSessionOwned(sessionId, teacherId) {
  const [[row]] = await pool.query(
    `SELECT s.id, s.quiz_id, s.join_mode, s.join_code, s.started_at, s.ended_at, s.created_at,
            q.title AS quiz_title, q.template_type, q.category,
            c.name AS class_name
     FROM sessions s
     JOIN quizzes q ON q.id=s.quiz_id
     LEFT JOIN classes c ON c.id=s.class_id
     WHERE s.id=:sid AND s.teacher_id=:tid`,
    { sid: sessionId, tid: teacherId }
  );
  return row || null;
}

// New shared analytics builder keeps screen, PDF, and XLSX exports consistent.
export async function buildFullAnalyticsData(sessionId, teacherId) {
  const session = await getSessionOwned(sessionId, teacherId);
  if (!session) return null;

  const [[summary]] = await pool.query(
    `SELECT
       COUNT(p.id) AS participant_count,
       ROUND(AVG(COALESCE(sc.total_points,0)), 2) AS avg_score,
       MIN(COALESCE(sc.total_points,0)) AS min_score,
       MAX(COALESCE(sc.total_points,0)) AS max_score
     FROM session_participants p
     LEFT JOIN scores sc ON sc.session_id=p.session_id AND sc.participant_id=p.id
     WHERE p.session_id=:sid`,
    { sid: sessionId }
  );

  const [questions] = await pool.query(
    `SELECT
       q.id AS question_id,
       q.question_order,
       q.prompt,
       COUNT(r.id) AS total_answers,
       SUM(CASE WHEN r.is_correct = 1 THEN 1 ELSE 0 END) AS correct_answers,
       SUM(CASE WHEN r.id IS NOT NULL AND (r.is_correct = 0 OR r.is_correct IS NULL) THEN 1 ELSE 0 END) AS incorrect_answers,
       ROUND(100 * SUM(CASE WHEN r.is_correct = 1 THEN 1 ELSE 0 END) / NULLIF(COUNT(r.id), 0), 2) AS pct_correct,
       ROUND(100 * SUM(CASE WHEN r.id IS NOT NULL AND (r.is_correct = 0 OR r.is_correct IS NULL) THEN 1 ELSE 0 END) / NULLIF(COUNT(r.id), 0), 2) AS pct_incorrect
     FROM quiz_questions q
     LEFT JOIN responses r ON r.question_id=q.id AND r.session_id=:sid
     WHERE q.quiz_id=:qid AND q.deleted_at IS NULL
     GROUP BY q.id
     ORDER BY q.question_order ASC`,
    { sid: sessionId, qid: session.quiz_id }
  );

  const [students] = await pool.query(
    `SELECT
       p.id AS participant_id,
       p.first_name,
       p.last_name,
       p.joined_at,
       p.group_name,
       COALESCE(sg.display_name, p.group_name) AS assigned_group_name,
       COALESCE(sc.total_points, 0) AS total_points
     FROM session_participants p
     LEFT JOIN scores sc ON sc.session_id=p.session_id AND sc.participant_id=p.id
     LEFT JOIN session_group_members gm ON gm.participant_id=p.id
     LEFT JOIN session_groups sg ON sg.id=gm.group_id
     WHERE p.session_id=:sid
     ORDER BY p.last_name ASC, p.first_name ASC, p.id ASC`,
    { sid: sessionId }
  );

  const [tabMonitoring] = await pool.query(
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
     ORDER BY p.last_name ASC, p.first_name ASC, p.id ASC`,
    { sid: sessionId, sid2: sessionId }
  );

  return {
    session: {
      ...session,
      template_label: cleanTemplateLabel(session.template_type),
      folder_name: session.class_name || "Unassigned",
      display_date: fmtDate(session.ended_at || session.started_at || session.created_at),
      question_count: questions.length,
    },
    summary: summary || {},
    questions: questions.map((q) => ({
      ...q,
      correct_answers: Number(q.correct_answers || 0),
      incorrect_answers: Number(q.incorrect_answers || 0),
      pct_correct: Number(q.pct_correct || 0),
      pct_incorrect: Number(q.pct_incorrect || 0),
    })),
    students,
    tabMonitoring,
  };
}

export async function sessionSummary(req, res) {
  const sessionId = Number(req.params.sessionId);
  const owner = await getSessionOwned(sessionId, req.user.sub);
  if (!owner) return res.status(404).json({ message: "Session not found" });

  const data = await buildFullAnalyticsData(sessionId, req.user.sub);
  res.json({ average: data.summary, distribution: [] });
}

export async function sessionQuestionStats(req, res) {
  const sessionId = Number(req.params.sessionId);
  const data = await buildFullAnalyticsData(sessionId, req.user.sub);
  if (!data) return res.status(404).json({ message: "Session not found" });
  res.json(data.questions);
}

export async function exportSessionXlsx(req, res) {
  const sessionId = Number(req.params.sessionId);
  const data = await buildFullAnalyticsData(sessionId, req.user.sub);
  if (!data) return res.status(404).json({ message: "Session not found" });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ThinkWAVE";

  const summary = workbook.addWorksheet("Summary");
  summary.addRows([
    ["ThinkWAVE Session Analytics"],
    ["Quiz Title", data.session.quiz_title],
    ["Template", data.session.template_label],
    ["Folder", data.session.folder_name],
    ["Date", data.session.display_date],
    ["Join Mode", data.session.join_mode],
    ["Join Code", data.session.join_code],
    [],
    ["Average", data.summary.avg_score ?? 0],
    ["Min", data.summary.min_score ?? 0],
    ["Max", data.summary.max_score ?? 0],
    ["Attendance", data.summary.participant_count ?? data.students.length],
  ]);
  summary.getRow(1).font = { bold: true, size: 16 };
  summary.getColumn(1).width = 24;
  summary.getColumn(2).width = 42;

  const attendance = workbook.addWorksheet("Attendance");
  attendance.columns = [
    { header: "Last Name", key: "last_name", width: 24 },
    { header: "First Name", key: "first_name", width: 24 },
    { header: "Group", key: "assigned_group_name", width: 24 },
    { header: "Total Points", key: "total_points", width: 16 },
    { header: "Joined At", key: "joined_at", width: 24 },
  ];
  data.students.forEach((r) => attendance.addRow(r));
  attendance.getRow(1).font = { bold: true };

  const qSheet = workbook.addWorksheet("Per Question Percentage");
  qSheet.columns = [
    { header: "Question No.", key: "question_order", width: 14 },
    { header: "Prompt", key: "prompt", width: 60 },
    { header: "Total Answers", key: "total_answers", width: 16 },
    { header: "Correct Answers", key: "correct_answers", width: 18 },
    { header: "% Answered Correct", key: "pct_correct", width: 20 },
    { header: "Incorrect Answers", key: "incorrect_answers", width: 18 },
    { header: "% Answered Incorrect", key: "pct_incorrect", width: 22 },
  ];
  data.questions.forEach((q, idx) => qSheet.addRow({ ...q, question_order: Number(q.question_order ?? idx) + 1 }));
  qSheet.getRow(1).font = { bold: true };

  const tabSheet = workbook.addWorksheet("Tab Monitoring");
  tabSheet.columns = [
    { header: "Last Name", key: "last_name", width: 24 },
    { header: "First Name", key: "first_name", width: 24 },
    { header: "Group", key: "assigned_group_name", width: 24 },
    { header: "Tab Out Count", key: "tab_out_count", width: 16 },
  ];
  data.tabMonitoring.forEach((r) => tabSheet.addRow(r));
  tabSheet.getRow(1).font = { bold: true };

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="session-${sessionId}-analytics.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
}

export async function exportSessionPdf(req, res) {
  const sessionId = Number(req.params.sessionId);
  const data = await buildFullAnalyticsData(sessionId, req.user.sub);
  if (!data) return res.status(404).json({ message: "Session not found" });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="session-${sessionId}-analytics.pdf"`);

  const doc = new PDFDocument({ margin: 40, size: "A4" });
  doc.pipe(res);

  doc.fontSize(18).text(data.session.quiz_title || `Session #${sessionId}`, { continued: false });
  doc.fontSize(10).fillColor("#555").text("Session Analytics");
  doc.moveDown(0.3);
  doc.fillColor("#000").fontSize(11)
    .text(`Template: ${data.session.template_label}`)
    .text(`Folder: ${data.session.folder_name}`)
    .text(`Date: ${data.session.display_date}`)
    .text(`Join Mode: ${data.session.join_mode}`)
    .text(`Join Code: ${data.session.join_code}`);

  doc.moveDown(0.8);
  doc.fontSize(13).text("Summary", { underline: true });
  doc.fontSize(10)
    .text(`Average: ${data.summary.avg_score ?? 0}`)
    .text(`Min: ${data.summary.min_score ?? 0}`)
    .text(`Max: ${data.summary.max_score ?? 0}`)
    .text(`Attendance: ${data.summary.participant_count ?? data.students.length}`);

  doc.moveDown(0.8);
  doc.fontSize(13).text("Attendance", { underline: true });
  data.students.forEach((r, idx) => {
    doc.fontSize(9).text(`${idx + 1}. ${r.last_name || ""}, ${r.first_name || ""} ${r.assigned_group_name ? `(${r.assigned_group_name})` : ""} — ${r.total_points} pt(s)`);
  });

  doc.addPage();
  doc.fontSize(13).text("Per-question Percentage", { underline: true });
  data.questions.forEach((q, idx) => {
    doc.moveDown(0.35);
    doc.fontSize(10).fillColor("#000").text(`Q${Number(q.question_order ?? idx) + 1}: ${q.prompt || ""}`);
    doc.fontSize(9).fillColor("#555").text(`${q.pct_correct ?? 0}% answered correct (${q.correct_answers}/${q.total_answers || 0}); ${q.pct_incorrect ?? 0}% answered incorrect (${q.incorrect_answers}/${q.total_answers || 0})`);
  });

  doc.moveDown(0.9);
  doc.fontSize(13).fillColor("#000").text("Tab Monitoring", { underline: true });
  data.tabMonitoring.forEach((r, idx) => {
    doc.fontSize(9).text(`${idx + 1}. ${r.last_name || ""}, ${r.first_name || ""} ${r.assigned_group_name ? `(${r.assigned_group_name})` : ""} — ${r.tab_out_count || 0} tab out`);
  });

  doc.end();
}
