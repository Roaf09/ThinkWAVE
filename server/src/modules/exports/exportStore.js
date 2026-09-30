/* FILE GUIDE:
 * server/src/modules/exports/exportStore.js
 * Purpose: DB + disk backing for async export jobs (PENDING -> RUNNING -> DONE/FAILED).
 * Free single-service: files live in uploads/exports/, status in MySQL `exports`.
 * Long-run: same API works if files move to R2 — only filePathFor() changes.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../../db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const EXPORT_DIR = path.resolve(__dirname, "../../../uploads/exports");

export function ensureExportDir() {
  try {
    fs.mkdirSync(EXPORT_DIR, { recursive: true });
  } catch (err) {
    console.warn("[exports] could not create dir:", err?.message || err);
  }
}

export async function ensureExportsTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS exports (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        teacher_id BIGINT NOT NULL,
        kind ENUM('SESSION','ASYNC') NOT NULL,
        ref_session_id BIGINT NULL,
        ref_class_id BIGINT NULL,
        ref_quiz_id BIGINT NULL,
        format ENUM('xlsx','pdf') NOT NULL,
        status ENUM('PENDING','RUNNING','DONE','FAILED') NOT NULL DEFAULT 'PENDING',
        file_path VARCHAR(500) NULL,
        error VARCHAR(500) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        done_at TIMESTAMP NULL,
        INDEX idx_exports_teacher_status (teacher_id, status, created_at)
      )`);
    // Jobs stuck mid-flight by a restart can never finish — fail them once at boot.
    await pool.query(
      `UPDATE exports SET status='FAILED', error='Server restarted before the export finished. Please try again.', done_at=NOW()
       WHERE status IN ('PENDING','RUNNING')`
    );
  } catch (err) {
    console.warn("[exports] table ensure failed:", err?.message || err);
  }
}

/** Let queued work interleave with live sockets every N rows. */
export async function yieldToLoop() {
  await new Promise((resolve) => setImmediate(resolve));
}

export async function createExportJob({ teacherId, kind, format, refSessionId = null, refClassId = null, refQuizId = null }) {
  const [r] = await pool.query(
    `INSERT INTO exports(teacher_id, kind, ref_session_id, ref_class_id, ref_quiz_id, format, status)
     VALUES(:tid, :kind, :sid, :cid, :qid, :fmt, 'PENDING')`,
    { tid: teacherId, kind, sid: refSessionId, cid: refClassId, qid: refQuizId, fmt: format }
  );
  return Number(r.insertId);
}

export async function getExportJob(id, teacherId) {
  const [[row]] = await pool.query(
    `SELECT id, kind, ref_session_id, ref_class_id, ref_quiz_id, format, status, error, created_at, done_at
     FROM exports WHERE id=:id AND teacher_id=:tid LIMIT 1`,
    { id, tid: teacherId }
  );
  return row || null;
}

export async function markExportRunning(id) {
  await pool.query(`UPDATE exports SET status='RUNNING' WHERE id=:id`, { id });
}

export async function markExportDone(id, fileName) {
  await pool.query(
    `UPDATE exports SET status='DONE', file_path=:fp, done_at=NOW() WHERE id=:id`,
    { id, fp: fileName }
  );
}

export async function markExportFailed(id, message) {
  await pool.query(
    `UPDATE exports SET status='FAILED', error=:err, done_at=NOW() WHERE id=:id`,
    { id, err: String(message || "Export failed").slice(0, 500) }
  );
}

export function exportFilePath(fileName) {
  return path.join(EXPORT_DIR, path.basename(String(fileName || "")));
}

export async function pruneOldExports({ maxAgeDays = 7 } = {}) {
  try {
    const [rows] = await pool.query(
      `SELECT id, file_path FROM exports WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY) LIMIT 100`,
      [maxAgeDays]
    );
    for (const row of rows) {
      try {
        if (row.file_path) fs.unlinkSync(exportFilePath(row.file_path));
      } catch { /* file already gone */ }
    }
    if (rows.length) {
      await pool.query(`DELETE FROM exports WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)`, [maxAgeDays]);
      console.log(`[prune] removed ${rows.length} old export(s).`);
    }
  } catch (err) {
    console.warn("[prune] exports failed:", err?.message || err);
  }
}
