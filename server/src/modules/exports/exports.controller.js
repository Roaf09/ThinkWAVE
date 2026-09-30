/* FILE GUIDE:
 * server/src/modules/exports/exports.controller.js
 * Purpose: Async export jobs — POST returns PENDING immediately, worker builds
 * the file in 500-row chunks, client polls status then downloads.
 * Sync blob downloads still exist (now queue-gated); this is the opt-in path
 * that never holds a live-classroom request open during a big build.
 */
import fs from "fs";
import PDFDocument from "pdfkit";
import { pool } from "../../db.js";
import { enqueueExport } from "../../queue.js";
import { getTeacherPlan } from "../plans/plan.js";
import { buildFullAnalyticsData, buildSessionWorkbook, renderSessionPdf } from "../analytics/analytics.controller.js";
import { getAsyncExportData, buildAsyncWorkbook, loadAsyncAnalysis, renderAsyncPdf } from "../classes/classes.controller.js";
import {
  ensureExportDir,
  exportFilePath,
  createExportJob,
  getExportJob,
  markExportRunning,
  markExportDone,
  markExportFailed,
} from "./exportStore.js";

async function canUseSessionExports(userId) {
  const [[user]] = await pool.query(`SELECT email FROM users WHERE id=:id LIMIT 1`, { id: userId });
  if (String(user?.email || "").toLowerCase().endsWith("@thinkwave.guest")) return true;
  const plan = await getTeacherPlan(userId);
  return plan.code !== "BASIC";
}

async function ownsSession(sessionId, teacherId) {
  const [[row]] = await pool.query(`SELECT id FROM sessions WHERE id=:sid AND teacher_id=:tid LIMIT 1`, {
    sid: sessionId,
    tid: teacherId,
  });
  return !!row;
}

async function ownsAsyncQuiz(classId, quizId, teacherId) {
  const [[row]] = await pool.query(
    `SELECT id FROM quizzes WHERE id=:qid AND class_id=:cid AND teacher_id=:tid AND delivery_mode='ASYNCHRONOUS' AND deleted_at IS NULL LIMIT 1`,
    { qid: quizId, cid: classId, tid: teacherId }
  );
  return !!row;
}

function friendlyName(job) {
  const ext = job.format === "pdf" ? "pdf" : "xlsx";
  if (job.kind === "SESSION") return `session-${job.ref_session_id}-analytics.${ext}`;
  return `async-${job.ref_quiz_id}-results.${ext}`;
}

async function buildJobFile(jobId, job) {
  const ext = job.format === "pdf" ? "pdf" : "xlsx";
  const fileName = `job-${jobId}.${ext}`;
  const absPath = exportFilePath(fileName);
  ensureExportDir();

  if (job.kind === "SESSION") {
    const data = await buildFullAnalyticsData(Number(job.ref_session_id), Number(job.teacher_id));
    if (!data) throw new Error("Session not found");
    if (job.format === "xlsx") {
      const workbook = await buildSessionWorkbook(data);
      await workbook.xlsx.writeFile(absPath);
    } else {
      await new Promise((resolve, reject) => {
        const stream = fs.createWriteStream(absPath);
        stream.on("error", reject);
        stream.on("finish", resolve);
        const doc = new PDFDocument({ margin: 40, size: "A4" });
        doc.on("error", reject);
        doc.pipe(stream);
        renderSessionPdf(data, doc, Number(job.ref_session_id));
        doc.end();
      });
    }
  } else {
    const data = await getAsyncExportData(Number(job.ref_class_id), Number(job.ref_quiz_id), Number(job.teacher_id));
    if (!data) throw new Error("Async quiz not found");
    if (job.format === "xlsx") {
      const workbook = await buildAsyncWorkbook(data);
      await workbook.xlsx.writeFile(absPath);
    } else {
      const analysis = await loadAsyncAnalysis({
        classId: Number(job.ref_class_id),
        quizId: Number(job.ref_quiz_id),
        teacherId: Number(job.teacher_id),
        templateType: data.quiz.template_type,
      });
      await new Promise((resolve, reject) => {
        const stream = fs.createWriteStream(absPath);
        stream.on("error", reject);
        stream.on("finish", resolve);
        const doc = new PDFDocument({ margin: 40, size: "A4" });
        doc.on("error", reject);
        doc.pipe(stream);
        renderAsyncPdf(doc, data, analysis);
        doc.end();
      });
    }
  }
  return fileName;
}

export async function createExport(req, res) {
  const kind = String(req.body?.kind || "").toUpperCase();
  const format = String(req.body?.format || "").toLowerCase();
  if (!["SESSION", "ASYNC"].includes(kind)) return res.status(400).json({ message: "kind must be SESSION or ASYNC." });
  if (!["xlsx", "pdf"].includes(format)) return res.status(400).json({ message: "format must be xlsx or pdf." });

  const teacherId = req.user.sub;
  let refSessionId = null;
  let refClassId = null;
  let refQuizId = null;

  if (kind === "SESSION") {
    refSessionId = Number(req.body?.sessionId);
    if (!refSessionId) return res.status(400).json({ message: "sessionId is required." });
    if (!(await ownsSession(refSessionId, teacherId))) return res.status(404).json({ message: "Session not found." });
    if (!(await canUseSessionExports(teacherId))) {
      return res.status(403).json({ message: "Extensive analytics and downloads are available on ThinkWAVE Pro and Institution plans." });
    }
  } else {
    refClassId = Number(req.body?.classId);
    refQuizId = Number(req.body?.quizId);
    if (!refClassId || !refQuizId) return res.status(400).json({ message: "classId and quizId are required." });
    if (!(await ownsAsyncQuiz(refClassId, refQuizId, teacherId))) return res.status(404).json({ message: "Async quiz not found." });
    const plan = await getTeacherPlan(teacherId);
    if (plan.code === "BASIC") {
      return res.status(403).json({ message: "Analytics downloads are available on ThinkWAVE Pro and Institution plans." });
    }
  }

  const jobId = await createExportJob({ teacherId, kind, format, refSessionId, refClassId, refQuizId });
  // Fire-and-forget: the POST responds now, the queue builds the file.
  enqueueExport(async () => {
    try {
      await markExportRunning(jobId);
      const fileName = await buildJobFile(jobId, {
        kind,
        format,
        ref_session_id: refSessionId,
        ref_class_id: refClassId,
        ref_quiz_id: refQuizId,
        teacher_id: teacherId,
      });
      await markExportDone(jobId, fileName);
    } catch (err) {
      await markExportFailed(jobId, err?.message || err);
    }
  }).catch((err) => markExportFailed(jobId, err?.message || err));

  res.status(202).json({ jobId, status: "PENDING" });
}

export async function getExport(req, res) {
  const job = await getExportJob(Number(req.params.id), req.user.sub);
  if (!job) return res.status(404).json({ message: "Export not found." });
  res.json({
    jobId: job.id,
    status: job.status,
    error: job.error || null,
    downloadUrl: job.status === "DONE" ? `/api/exports/${job.id}/download` : null,
    fileName: job.status === "DONE" ? friendlyName(job) : null,
  });
}

export async function downloadExport(req, res) {
  const job = await getExportJob(Number(req.params.id), req.user.sub);
  if (!job) return res.status(404).json({ message: "Export not found." });
  if (job.status !== "DONE") return res.status(409).json({ message: `Export is ${job.status}.` });
  const [[row]] = await pool.query(`SELECT file_path FROM exports WHERE id=:id LIMIT 1`, { id: job.id });
  const absPath = exportFilePath(row?.file_path);
  if (!row?.file_path || !fs.existsSync(absPath)) return res.status(410).json({ message: "Export file expired. Please create a new export." });
  if (job.format === "pdf") {
    res.setHeader("Content-Type", "application/pdf");
  } else {
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  }
  res.setHeader("Content-Disposition", `attachment; filename="${friendlyName(job)}"`);
  fs.createReadStream(absPath).pipe(res);
}
