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

export function registerAssignmentSockets(io) {
  io.on("connection", (socket) => {
    socket.on("assignment:join-leaderboard", async ({ quizId } = {}, ack) => {
      try {
        const uid = socket.data.user?.sub;
        const qid = Number(quizId);
        if (!uid || !qid) return ack?.({ ok: false });
        // Only let a student join the room for an assignment they're actually
        // enrolled to see, mirroring the access check the REST endpoints use.
        const [[row]] = await pool.query(
          `SELECT q.id FROM quizzes q
           JOIN class_enrollments e ON e.class_id=q.class_id AND e.student_user_id=:uid AND e.removed_at IS NULL
           WHERE q.id=:qid AND q.delivery_mode='ASYNCHRONOUS' AND q.deleted_at IS NULL`,
          { uid, qid }
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
  });
}

export function broadcastAssignmentLeaderboard(io, quizId, payload) {
  if (!io) return;
  io.to(assignmentRoom(quizId)).emit("assignment:leaderboard-update", payload);
}
