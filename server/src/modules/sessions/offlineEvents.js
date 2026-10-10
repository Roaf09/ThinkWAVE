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
  // When the participant came back (NULL = never returned). Added later, so
  // older tables are migrated in place.
  try {
    await pool.query(`ALTER TABLE offline_events ADD COLUMN back_online_at TIMESTAMP NULL DEFAULT NULL`);
  } catch (e) {
    if (e?.code !== "ER_DUP_FIELDNAME") throw e;
  }
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

// Stamps the return time on every still-open offline row for this participant.
export async function markBackOnline({ sessionId, participantId }) {
  try {
    await ensureOfflineTable();
    await pool.query(
      `UPDATE offline_events SET back_online_at=NOW()
       WHERE session_id=:sid AND participant_id=:pid AND back_online_at IS NULL`,
      { sid: sessionId, pid: participantId }
    );
  } catch {
    /* best-effort only */
  }
}

// The student's own device reports a drop it saw (browser offline event or
// socket disconnect) once it is back online. The server alone only notices a
// drop after the socket times out plus the reconnect grace window, so short
// outages were never logged. If the server already logged this same drop, the
// report only fills in the return time instead of counting twice.
export async function recordClientOfflineReport({ sessionId, participantId, questionId, durationMs }) {
  try {
    const ms = Number(durationMs);
    if (!Number.isFinite(ms) || ms < 2000 || ms > 6 * 60 * 60 * 1000) return null;
    const context = await loadOfflineContext(sessionId, participantId);
    if (!context) return null; // not LIVE, or the student already finished the last question
    await ensureOfflineTable();
    const seconds = Math.round(ms / 1000);
    // Same drop already logged by the server-side detection? Then just stamp it.
    const [dupe] = await pool.query(
      `SELECT id FROM offline_events
       WHERE session_id=:sid AND participant_id=:pid
         AND created_at >= DATE_SUB(NOW(), INTERVAL :win SECOND) LIMIT 1`,
      { sid: sessionId, pid: participantId, win: seconds + 60 }
    );
    if (dupe.length) {
      await markBackOnline({ sessionId, participantId });
      return await getOfflineSummary(sessionId, participantId);
    }
    // Prefer the question the student reported (the one they were on when the
    // connection dropped); fall back to whatever is live now.
    let questionOrder = context.questionOrder;
    let qid = context.questionId;
    const reportedId = Number(questionId);
    if (Number.isFinite(reportedId) && reportedId > 0) {
      const [[snap]] = await pool.query(`SELECT questions_snapshot_json FROM sessions WHERE id=:sid`, { sid: sessionId });
      let list = snap?.questions_snapshot_json;
      if (typeof list === "string") { try { list = JSON.parse(list); } catch { list = []; } }
      const at = Array.isArray(list) ? list.findIndex((q) => Number(q?.id) === reportedId) : -1;
      if (at >= 0) { questionOrder = at + 1; qid = reportedId; }
    }
    await pool.query(
      `INSERT INTO offline_events(session_id, participant_id, question_id, question_order, created_at, back_online_at)
       VALUES(:sid,:pid,:qid,:qo, DATE_SUB(NOW(), INTERVAL :sec SECOND), NOW())`,
      { sid: sessionId, pid: participantId, qid: qid ?? null, qo: questionOrder ?? null, sec: seconds }
    );
    return await getOfflineSummary(sessionId, participantId);
  } catch {
    return null;
  }
}
