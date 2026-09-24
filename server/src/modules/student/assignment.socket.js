/* FILE GUIDE:
 * server/src/modules/student/assignment.socket.js
 * Purpose: Lightweight realtime layer for assignment leaderboards. Unlike
 * live sessions, assignments have no persistent game-state socket - this
 * just lets a student's browser join a room for the assignment they're
 * viewing the leaderboard for, so submitStudentQuiz can broadcast an updated
 * leaderboard to everyone currently looking at it.
 */

import { pool } from "../../db.js";

function assignmentRoom(quizId) {
  return `assignment-leaderboard:${Number(quizId)}`;
}

let assignmentTabTableReady = false;
async function ensureAssignmentTabTable() {
  if (assignmentTabTableReady) return;
  await pool.query(`CREATE TABLE IF NOT EXISTS assignment_tab_events (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    quiz_id BIGINT NOT NULL,
    student_user_id BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_assignment_tab_quiz_student (quiz_id, student_user_id)
  )`);
  assignmentTabTableReady = true;
}

export async function getAssignmentTabCounts(quizId) {
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

export function registerAssignmentSockets(io) {
  io.on("connection", (socket) => {
    const actionTimes = new Map();
    const allowAction = (key, limit = 10, windowMs = 10_000) => {
      const now = Date.now();
      const recent = (actionTimes.get(key) || []).filter((t) => now - t < windowMs);
      if (recent.length >= limit) return false;
      recent.push(now);
      actionTimes.set(key, recent);
      return true;
    };
    socket.on("assignment:join-leaderboard", async ({ quizId } = {}, ack) => {
      try {
        const uid = socket.data.user?.sub;
        const qid = Number(quizId);
        if (!uid || !qid) return ack?.({ ok: false });
        // Only let a student join the room for an assignment they're actually
        // enrolled to see, mirroring the access check the REST endpoints use.
        // The owning teacher may join too, so their analytics report updates
        // live as submissions arrive instead of freezing at open time.
        const [[row]] = await pool.query(
          `SELECT q.id FROM quizzes q
           LEFT JOIN class_enrollments e ON e.class_id=q.class_id AND e.student_user_id=:uid AND e.removed_at IS NULL
           WHERE q.id=:qid AND q.delivery_mode='ASYNCHRONOUS' AND q.deleted_at IS NULL
             AND (e.student_user_id IS NOT NULL OR q.teacher_id=:tid)`,
          { uid, qid, tid: uid }
        );
        if (!row) return ack?.({ ok: false });
        socket.join(assignmentRoom(qid));
        ack?.({ ok: true });
      } catch {
        ack?.({ ok: false });
      }
    });

    socket.on("assignment:leave-leaderboard", ({ quizId } = {}) => {
      const qid = Number(quizId);
      if (qid) socket.leave(assignmentRoom(qid));
    });

    // Assignment tab monitoring: count 1 records, count 2 warns, count 3 kicks
    // (client auto-submits + locks out). Mirrors live sessions' 3-strike rule.
    socket.on("assignment:tabOut", async ({ quizId } = {}) => {
      try {
        if (!allowAction("assignment:tabOut")) return;
        const uid = socket.data.user?.sub;
        const qid = Number(quizId);
        if (!uid || !qid) return;
        await ensureAssignmentTabTable();
        const [[row]] = await pool.query(
          `SELECT q.id FROM quizzes q
           LEFT JOIN class_enrollments e ON e.class_id=q.class_id AND e.student_user_id=:uid AND e.removed_at IS NULL
           WHERE q.id=:qid AND q.delivery_mode='ASYNCHRONOUS' AND q.deleted_at IS NULL
             AND (e.student_user_id IS NOT NULL OR q.teacher_id=:tid)`,
          { uid, qid, tid: uid }
        );
        if (!row) return;
        // Never count tab-outs after the student already submitted.
        const [[existing]] = await pool.query(
          `SELECT id FROM async_quiz_submissions WHERE quiz_id=:qid AND student_user_id=:uid LIMIT 1`,
          { qid, uid }
        );
        if (existing) return;
        await pool.query(
          `INSERT INTO assignment_tab_events(quiz_id, student_user_id) VALUES(:qid,:uid)`,
          { qid, uid }
        );
        const [[countRow]] = await pool.query(
          `SELECT COUNT(*) AS total FROM assignment_tab_events WHERE quiz_id=:qid AND student_user_id=:uid`,
          { qid, uid }
        );
        const count = Number(countRow?.total || 0);
        if (count >= 3) {
          socket.emit("assignment:kicked", { quizId: qid, count });
        } else if (count === 2) {
          socket.emit("assignment:warning", { quizId: qid, count });
        } else {
          socket.emit("assignment:tabCount", { quizId: qid, count });
        }
      } catch {
        // Tab tracking must never break gameplay.
      }
    });
  });
}

export function broadcastAssignmentLeaderboard(io, quizId, payload) {
  if (!io) return;
  io.to(assignmentRoom(quizId)).emit("assignment:leaderboard-update", payload);
}
