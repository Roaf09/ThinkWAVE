/* FILE GUIDE:
 * server/src/modules/sessions/offlineEvents.js
 * Purpose: Offline log for live sessions. Each time a participant really drops
 * offline during a LIVE session (the socket stayed gone past the reconnect
 * grace window) one row lands here, tagged with the question that was on
 * screen. The host panel shows the running count, Analytics reads it after
 * the session, and the PDF/XLSX exports include it for the teacher's records.
 * Mirrors integrityEvents.js: the table is created on first use.
 */
import { pool } from "../../db.js";

let offlineTableReady = false;
export async function ensureOfflineTable() {
  if (offlineTableReady) return;
  await pool.query(`CREATE TABLE IF NOT EXISTS offline_events (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    session_id BIGINT NOT NULL,
    participant_id BIGINT NOT NULL,
    question_id BIGINT NULL,
    question_order INT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_offline_session_participant (session_id, participant_id)
  )`);
  offlineTableReady = true;
}

// Question that is live right now (1-based number + id), or null when the
// session is not LIVE. Read at the moment the socket drops so the log points
// at the question the participant actually left on.
export async function loadOfflineContext(sessionId, participantId) {
  try {
    const [[row]] = await pool.query(
      `SELECT s.status, s.current_question_index AS current_index,
              JSON_LENGTH(s.questions_snapshot_json) AS question_count,
              JSON_UNQUOTE(JSON_EXTRACT(s.questions_snapshot_json, CONCAT('$[', s.current_question_index, '].id'))) AS current_question_id
       FROM session_participants p JOIN sessions s ON s.id=p.session_id
       WHERE p.id=:pid AND p.session_id=:sid`,
      { pid: participantId, sid: sessionId }
    );
    if (!row || row.status !== "LIVE") return null;
    const index = Math.max(0, Number(row.current_index || 0));
    const questionId = row.current_question_id != null && row.current_question_id !== "null" ? Number(row.current_question_id) : null;
    // A student who already answered the final question is done; closing the
    // tab then is not an interruption (same rule the tab-out counter uses).
    if (index >= Math.max(0, Number(row.question_count || 0) - 1) && questionId) {
      const [[answered]] = await pool.query(
        `SELECT id FROM responses WHERE session_id=:sid AND participant_id=:pid AND question_id=:qid LIMIT 1`,
        { sid: sessionId, pid: participantId, qid: questionId }
      );
      if (answered) return null;
    }
    return { questionId, questionOrder: index + 1 };
  } catch {
    return null;
  }
}

// Writes one offline row and returns the participant's updated tally, or null
// when nothing was recorded (kicked, session already ended, etc.).
export async function recordOfflineEvent({ sessionId, participantId, context }) {
  try {
    if (!context) return null;
    await ensureOfflineTable();
    const [[state]] = await pool.query(
      `SELECT p.kicked_at, s.status FROM session_participants p JOIN sessions s ON s.id=p.session_id
       WHERE p.id=:pid AND p.session_id=:sid`,
      { pid: participantId, sid: sessionId }
    );
    // Ending the session closes every student socket - that is not "offline".
    if (!state || state.kicked_at || !["LIVE", "PAUSED"].includes(state.status)) return null;
    await pool.query(
      `INSERT INTO offline_events(session_id, participant_id, question_id, question_order) VALUES(:sid,:pid,:qid,:qo)`,
      { sid: sessionId, pid: participantId, qid: context.questionId ?? null, qo: context.questionOrder ?? null }
    );
    return await getOfflineSummary(sessionId, participantId);
  } catch {
    return null;
  }
}

export async function getOfflineSummary(sessionId, participantId) {
  const [rows] = await pool.query(
    `SELECT question_order FROM offline_events WHERE session_id=:sid AND participant_id=:pid ORDER BY id ASC`,
    { sid: sessionId, pid: participantId }
  );
  return {
    count: rows.length,
    questions: rows.map((r) => (r.question_order == null ? null : Number(r.question_order))).filter((n) => n != null),
  };
}
