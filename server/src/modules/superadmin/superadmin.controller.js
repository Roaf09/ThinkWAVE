/* FILE GUIDE:
 * server/src/modules/superadmin/superadmin.controller.js
 * Purpose: Superadmin dashboard data for overview, institution management, notifications, and system health.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import { pool } from "../../db.js";

function numberify(value) {
  return Number(value || 0);
}

// Overview cards and high-level counts.
export async function getStats(req, res) {
  const [[counts]] = await pool.query(
    `SELECT
       COUNT(DISTINCT CASE WHEN role = 'ADMIN' AND institution_name IS NOT NULL THEN institution_name END) AS total_institutions,
       SUM(role = 'ADMIN' AND deleted_at IS NULL) AS total_admins,
       SUM(role = 'TEACHER' AND deleted_at IS NULL) AS total_teachers
     FROM users`
  );

  const [[sessions]] = await pool.query(
    `SELECT
       SUM(COALESCE(ended_at, created_at) >= DATE_SUB(NOW(), INTERVAL 7 DAY)) AS sessions_this_week,
       SUM(end_reason = 'TEACHER_DISCONNECTED'
           AND COALESCE(ended_at, created_at) >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS disconnected_sessions
     FROM sessions`
  );

  const [[tabFlags]] = await pool.query(
    `SELECT COUNT(*) AS flagged_sessions
     FROM (
       SELECT te.session_id
       FROM tab_events te
       WHERE te.event_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       GROUP BY te.session_id
       HAVING COUNT(*) >= 8
     ) flagged`
  );

  res.json({
    totalInstitutions: numberify(counts.total_institutions),
    totalAdmins: numberify(counts.total_admins),
    totalTeachers: numberify(counts.total_teachers),
    sessionsThisWeek: numberify(sessions.sessions_this_week),
    flaggedIncidents: numberify(sessions.disconnected_sessions) + numberify(tabFlags.flagged_sessions),
  });
}

// Institution listing. One admin is surfaced per institution.
export async function listAccounts(req, res) {
  const [admins] = await pool.query(
    `SELECT
       id, email, first_name, last_name, is_active, contact_number,
       institution_name, created_at, last_active_at
     FROM users
     WHERE role = 'ADMIN'
       AND deleted_at IS NULL
       AND institution_name IS NOT NULL
     ORDER BY institution_name ASC, created_at ASC`
  );

  const [teachers] = await pool.query(
    `SELECT
       id, email, first_name, last_name, is_active, contact_number,
       institution_name, created_at, last_active_at
     FROM users
     WHERE role = 'TEACHER'
       AND deleted_at IS NULL
       AND institution_name IS NOT NULL
     ORDER BY institution_name ASC, last_name ASC, first_name ASC`
  );

  const [sessionStats] = await pool.query(
    `SELECT
       u.institution_name,
       SUM(COALESCE(s.ended_at, s.created_at) >= DATE_SUB(NOW(), INTERVAL 7 DAY)) AS recent_sessions,
       MAX(COALESCE(s.ended_at, s.created_at)) AS last_activity
     FROM sessions s
     JOIN users u ON u.id = s.teacher_id
     WHERE u.institution_name IS NOT NULL
     GROUP BY u.institution_name`
  );

  const sessionMap = Object.fromEntries(
    sessionStats.map(row => [row.institution_name, row])
  );

  const institutionMap = {};

  for (const admin of admins) {
    const inst = admin.institution_name;
    if (!institutionMap[inst]) {
      const stat = sessionMap[inst] || {};
      institutionMap[inst] = {
        name: inst,
        admin,
        teachers: [],
        teacherCount: 0,
        recentSessions: numberify(stat.recent_sessions),
        lastActivity: stat.last_activity || admin.last_active_at || admin.created_at,
      };
    }
  }

  for (const teacher of teachers) {
    const inst = teacher.institution_name;
    if (!institutionMap[inst]) {
      const stat = sessionMap[inst] || {};
      institutionMap[inst] = {
        name: inst,
        admin: null,
        teachers: [],
        teacherCount: 0,
        recentSessions: numberify(stat.recent_sessions),
        lastActivity: stat.last_activity || teacher.last_active_at || teacher.created_at,
      };
    }
    institutionMap[inst].teachers.push(teacher);
    institutionMap[inst].teacherCount += 1;
    institutionMap[inst].lastActivity = institutionMap[inst].lastActivity || teacher.last_active_at || teacher.created_at;
  }

  const institutions = Object.values(institutionMap).sort((a, b) => a.name.localeCompare(b.name));
  res.json(institutions);
}

// Existing moderation endpoints are kept for compatibility even if the latest UI no longer surfaces them.
export async function listPending(req, res) {
  const [rows] = await pool.query(
    `SELECT id, role, email, first_name, last_name,
            contact_number, institution_name, created_at
     FROM users
     WHERE approval_status = 'PENDING' AND deleted_at IS NULL
     ORDER BY created_at ASC`
  );
  res.json(rows);
}

export async function approveAccount(req, res) {
  await pool.query(
    `UPDATE users SET approval_status = 'APPROVED' WHERE id = :id AND deleted_at IS NULL`,
    { id: req.params.id }
  );
  res.json({ ok: true });
}

export async function rejectAccount(req, res) {
  await pool.query(
    `UPDATE users SET approval_status = 'REJECTED' WHERE id = :id AND deleted_at IS NULL`,
    { id: req.params.id }
  );
  res.json({ ok: true });
}

export async function setActive(req, res) {
  const active = req.body?.active ? 1 : 0;
  await pool.query(
    `UPDATE users SET is_active = :a WHERE id = :id AND deleted_at IS NULL`,
    { a: active, id: req.params.id }
  );
  res.json({ ok: true });
}

export async function deleteAccount(req, res) {
  await pool.query(`UPDATE users SET deleted_at = NOW() WHERE id = :id`, { id: req.params.id });
  res.json({ ok: true });
}

export async function getNotifications(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT id, type, user_id, name, email, role, institution_name, created_at
       FROM activity_log
       ORDER BY created_at DESC
       LIMIT 100`
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Failed to load notifications." });
  }
}

export async function getHealth(req, res) {
  const [disconnects] = await pool.query(
    `SELECT
       s.id,
       COALESCE(q.title, 'Quiz Session') AS quiz_title,
       u.institution_name,
       CONCAT(u.first_name, ' ', u.last_name) AS teacher_name,
       COALESCE(s.ended_at, s.created_at) AS event_at
     FROM sessions s
     JOIN users u ON u.id = s.teacher_id
     LEFT JOIN quizzes q ON q.id = s.quiz_id
     WHERE s.end_reason = 'TEACHER_DISCONNECTED'
     ORDER BY COALESCE(s.ended_at, s.created_at) DESC
     LIMIT 10`
  );

  const [tabSwitch] = await pool.query(
    `SELECT
       te.session_id,
       COALESCE(q.title, 'Quiz Session') AS quiz_title,
       u.institution_name,
       CONCAT(p.first_name, ' ', p.last_name) AS participant_name,
       COUNT(*) AS switch_count,
       MAX(te.event_at) AS event_at
     FROM tab_events te
     JOIN session_participants p ON p.id = te.participant_id
     JOIN sessions s ON s.id = te.session_id
     JOIN users u ON u.id = s.teacher_id
     LEFT JOIN quizzes q ON q.id = s.quiz_id
     GROUP BY te.session_id, te.participant_id
     HAVING COUNT(*) >= 3
     ORDER BY switch_count DESC, event_at DESC
     LIMIT 10`
  );

  const [inactiveAccounts] = await pool.query(
    `SELECT
       id,
       CONCAT(first_name, ' ', last_name) AS name,
       email,
       role,
       institution_name,
       updated_at AS event_at
     FROM users
     WHERE is_active = 0 AND deleted_at IS NULL
     ORDER BY updated_at DESC
     LIMIT 10`
  );

  res.json({
    summary: {
      disconnectCount: disconnects.length,
      tabSwitchCount: tabSwitch.length,
      inactiveAccountCount: inactiveAccounts.length,
    },
    disconnects,
    tabSwitch,
    inactiveAccounts,
  });
}
