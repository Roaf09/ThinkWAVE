/* FILE GUIDE:
 * server/src/modules/sessions/integrityEvents.js
 * Purpose: Tamper-evidence tally (Fix 6). scoreAnswer() returns rejected only
 * for shapes the UI can never produce, so each row is a hand-crafted payload.
 * Live flags land here; roster + Analytics count from here; the host badge
 * reads the count. Async rejects stay in answers_json + server log (no
 * session room to alert).
 */
import { pool } from "../../db.js";

let integrityTableReady = false;
export async function ensureIntegrityTable() {
  if (integrityTableReady) return;
  await pool.query(`CREATE TABLE IF NOT EXISTS integrity_events (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    session_id BIGINT NOT NULL,
    participant_id BIGINT NOT NULL,
    question_id BIGINT NULL,
    reason VARCHAR(64) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_integrity_session_participant (session_id, participant_id)
  )`);
  // Migrate stub tables created by Fix A (no question/reason columns yet).
  for (const ddl of [
    `ALTER TABLE integrity_events ADD COLUMN question_id BIGINT NULL`,
    `ALTER TABLE integrity_events ADD COLUMN reason VARCHAR(64) NULL`,
  ]) {
    try {
      await pool.query(ddl);
    } catch (e) {
      if (e?.code !== "ER_DUP_FIELDNAME") throw e;
    }
  }
  integrityTableReady = true;
}

export async function recordIntegrityEvent({ sessionId, participantId, questionId = null, reason = null }) {
  try {
    await ensureIntegrityTable();
    await pool.query(
      `INSERT INTO integrity_events(session_id, participant_id, question_id, reason) VALUES(:sid,:pid,:qid,:reason)`,
      { sid: sessionId, pid: participantId, qid: questionId ?? null, reason: reason ?? null }
    );
  } catch {
    /* best-effort only */
  }
}

export async function countIntegrityEvents(sessionId, participantId) {
  try {
    await ensureIntegrityTable();
    const [[row]] = await pool.query(
      `SELECT COUNT(*) AS total FROM integrity_events WHERE session_id=:sid AND participant_id=:pid`,
      { sid: sessionId, pid: participantId }
    );
    return Number(row?.total || 0);
  } catch {
    return 0;
  }
}
