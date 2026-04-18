/* FILE GUIDE:
 * server/src/modules/analytics/analytics.controller.js
 * Purpose: Analytics/export logic used after sessions end and when teachers open result views.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { pool } from "../../db.js";

async function getSessionOwned(sessionId, teacherId) {
  const [[row]] = await pool.query(
    `SELECT s.id, s.quiz_id, q.title AS quiz_title
     FROM sessions s JOIN quizzes q ON q.id=s.quiz_id
     WHERE s.id=:sid AND s.teacher_id=:tid`,
    { sid: sessionId, tid: teacherId }
  );
  return row || null;
}

async function getSortedRecords(sessionId) {
  const [rows] = await pool.query(
    `SELECT p.last_name, p.first_name, COALESCE(sc.total_points,0) AS total_points, p.joined_at
     FROM session_participants p
     LEFT JOIN scores sc ON sc.session_id=p.session_id AND sc.participant_id=p.id
     WHERE p.session_id=:sid
     ORDER BY p.last_name ASC, p.first_name ASC, p.id ASC`,
    { sid: sessionId }
  );
  return rows;
}

export async function sessionSummary(req, res) {
  const sessionId = Number(req.params.sessionId);
  const owner = await getSessionOwned(sessionId, req.user.sub);
  if (!owner) return res.status(404).json({ message: "Session not found" });

  const [[avgRow]] = await pool.query(
    `SELECT ROUND(AVG(total_points),2) AS avg_score, MIN(total_points) AS min_score, MAX(total_points) AS max_score
     FROM scores WHERE session_id=:sid`,
    { sid: sessionId }
  );

  const [dist] = await pool.query(
    `SELECT total_points AS score, COUNT(*) AS count
     FROM scores WHERE session_id=:sid
     GROUP BY total_points ORDER BY total_points ASC`,
    { sid: sessionId }
  );

  res.json({ average: avgRow, distribution: dist });
}

export async function sessionQuestionStats(req, res) {
  const sessionId = Number(req.params.sessionId);
  const owner = await getSessionOwned(sessionId, req.user.sub);
  if (!owner) return res.status(404).json({ message: "Session not found" });

  const [rows] = await pool.query(
    `SELECT 
      q.id AS question_id,
      q.question_order,
      q.prompt,
      COUNT(r.id) AS total_answers,
      SUM(CASE WHEN r.is_correct=1 THEN 1 ELSE 0 END) AS correct_answers,
      ROUND(100 * SUM(CASE WHEN r.is_correct=1 THEN 1 ELSE 0 END) / NULLIF(COUNT(r.id),0), 2) AS pct_correct
     FROM quiz_questions q
     LEFT JOIN responses r ON r.question_id=q.id AND r.session_id=:sid
     WHERE q.quiz_id=:qid AND q.deleted_at IS NULL
     GROUP BY q.id
     ORDER BY q.question_order ASC`,
    { sid: sessionId, qid: owner.quiz_id }
  );

  const withDifficulty = rows.map(r => ({
    ...r,
    difficulty: (r.pct_correct ?? 0) < 50 ? "Difficult" : "Easy"
  }));

  res.json(withDifficulty);
}

export async function exportSessionXlsx(req, res) {
  const sessionId = Number(req.params.sessionId);
  const owner = await getSessionOwned(sessionId, req.user.sub);
  if (!owner) return res.status(404).json({ message: "Session not found" });

  const records = await getSortedRecords(sessionId);
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("Quiz Records");
  ws.columns = [
    { header: "Last Name", key: "last_name", width: 24 },
    { header: "First Name", key: "first_name", width: 24 },
    { header: "Total Points", key: "total_points", width: 16 },
    { header: "Joined At", key: "joined_at", width: 24 }
  ];
  records.forEach((r) => ws.addRow(r));
  ws.getRow(1).font = { bold: true };

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="session-${sessionId}-records.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
}

export async function exportSessionPdf(req, res) {
  const sessionId = Number(req.params.sessionId);
  const owner = await getSessionOwned(sessionId, req.user.sub);
  if (!owner) return res.status(404).json({ message: "Session not found" });

  const records = await getSortedRecords(sessionId);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="session-${sessionId}-records.pdf"`);

  const doc = new PDFDocument({ margin: 40, size: "A4" });
  doc.pipe(res);
  doc.fontSize(18).text(`ThinkWAVE Session Record #${sessionId}`);
  doc.moveDown(0.5);
  doc.fontSize(12).text(`Quiz: ${owner.quiz_title}`);
  doc.moveDown(1);
  doc.fontSize(11).text("Sorted by Last Name, First Name", { underline: true });
  doc.moveDown(0.5);

  records.forEach((r, idx) => {
    doc.fontSize(10).text(`${idx + 1}. ${r.last_name}, ${r.first_name} - ${r.total_points} point(s)`);
  });

  doc.end();
}
