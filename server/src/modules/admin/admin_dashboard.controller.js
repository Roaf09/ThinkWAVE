/* FILE GUIDE:
 * server/src/modules/admin/admin_dashboard.controller.js
 * Purpose: Admin dashboard data for institution setup, overview, teacher management, and invitation handling.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import { pool } from "../../db.js";
import { makeJoinCode } from "../../utils/codes.js";

async function getAdminInstitution(adminId) {
  const [[row]] = await pool.query(
    `SELECT id, first_name, last_name, email, institution_name, institution_setup_done, created_at, is_active
     FROM users
     WHERE id = :id AND role = 'ADMIN'`,
    { id: adminId }
  );
  return row || null;
}

async function buildInstitutionActivity(inst, limit = 8) {
  if (!inst) return [];

  const [rows] = await pool.query(
    `(
       SELECT
         'SESSION_ENDED' AS kind,
         COALESCE(q.title, 'Quiz Session') AS title,
         CONCAT(u.first_name, ' ', u.last_name) AS subtitle,
         CASE
           WHEN s.end_reason = 'TEACHER_DISCONNECTED' THEN 'Session auto-ended after a teacher disconnect.'
           ELSE CONCAT('Finished with ', (SELECT COUNT(*) FROM session_participants sp WHERE sp.session_id = s.id), ' participant(s).')
         END AS detail,
         COALESCE(s.ended_at, s.created_at) AS event_at
       FROM sessions s
       JOIN users u ON u.id = s.teacher_id
       LEFT JOIN quizzes q ON q.id = s.quiz_id
       WHERE u.institution_name = :inst
     )
     UNION ALL
     (
       SELECT
         'TEACHER_ADDED' AS kind,
         CONCAT(first_name, ' ', last_name) AS title,
         email AS subtitle,
         'Teacher account is part of this institution.' AS detail,
         created_at AS event_at
       FROM users
       WHERE role = 'TEACHER'
         AND institution_name = :inst
         AND deleted_at IS NULL
     )
     ORDER BY event_at DESC
     LIMIT :lim`,
    { inst, lim: Number(limit) }
  );

  return rows;
}

// institution setup
export async function setupInstitution(req, res) {
  const { institutionName } = req.body;
  if (!institutionName?.trim()) {
    return res.status(400).json({ message: "Institution name is required." });
  }

  const [[adminRow]] = await pool.query(
    `SELECT first_name, last_name, email FROM users WHERE id = :id`,
    { id: req.user.sub }
  );

  await pool.query(
    `UPDATE users
     SET institution_name = :name,
         institution_setup_done = 1
     WHERE id = :id AND role = 'ADMIN'`,
    { name: institutionName.trim(), id: req.user.sub }
  );

  try {
    await pool.query(
      `INSERT INTO activity_log (type, user_id, name, email, role, institution_name)
       VALUES ('INSTITUTION_SETUP', :uid, :name, :email, 'ADMIN', :inst)`,
      {
        uid: req.user.sub,
        name: `${adminRow.first_name} ${adminRow.last_name}`,
        email: adminRow.email,
        inst: institutionName.trim(),
      }
    );
  } catch (_) {}

  res.json({ ok: true });
}

export async function getSetupStatus(req, res) {
  const admin = await getAdminInstitution(req.user.sub);
  res.json({
    setupDone: !!admin?.institution_setup_done,
    institutionName: admin?.institution_name || null,
  });
}

export async function getStats(req, res) {
  const admin = await getAdminInstitution(req.user.sub);
  const inst = admin?.institution_name || null;

  const [[teacherCounts]] = await pool.query(
    `SELECT
       COUNT(*) AS total_teachers,
       SUM(is_active = 1) AS active_teachers,
       SUM(last_active_at >= DATE_SUB(NOW(), INTERVAL 30 MINUTE) AND is_active = 1) AS currently_online
     FROM users
     WHERE role = 'TEACHER'
       AND institution_name = :inst
       AND deleted_at IS NULL`,
    { inst }
  );

  const [[memberCounts]] = await pool.query(
    `SELECT COUNT(*) AS institution_members
     FROM users
     WHERE institution_name = :inst
       AND role IN ('ADMIN', 'TEACHER')
       AND deleted_at IS NULL`,
    { inst }
  );

  const [[sessionCounts]] = await pool.query(
    `SELECT
       COUNT(*) AS live_sessions,
       SUM(COALESCE(s.ended_at, s.created_at) >= DATE_SUB(NOW(), INTERVAL 7 DAY)) AS recent_sessions,
       SUM(s.end_reason = 'TEACHER_DISCONNECTED'
           AND COALESCE(s.ended_at, s.created_at) >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS disconnected_sessions
     FROM sessions s
     JOIN users u ON u.id = s.teacher_id
     WHERE u.institution_name = :inst`,
    { inst }
  );

  const [[tabFlags]] = await pool.query(
    `SELECT COUNT(*) AS flagged_sessions
     FROM (
       SELECT te.session_id
       FROM tab_events te
       JOIN sessions s ON s.id = te.session_id
       JOIN users u ON u.id = s.teacher_id
       WHERE u.institution_name = :inst
         AND te.event_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       GROUP BY te.session_id
       HAVING COUNT(*) >= 8
     ) flagged`,
    { inst }
  );

  const activity = await buildInstitutionActivity(inst, 6);

  const alerts = [];
  const flaggedIssues = Number(sessionCounts.disconnected_sessions || 0) + Number(tabFlags.flagged_sessions || 0);

  if (!inst) {
    alerts.push({ level: "warning", title: "Institution profile incomplete", detail: "Complete your institution profile to fully use the admin dashboard." });
  }
  if (flaggedIssues > 0) {
    alerts.push({ level: "critical", title: `${flaggedIssues} flagged issue${flaggedIssues === 1 ? "" : "s"} detected`, detail: "Review disconnect-heavy sessions or unusual tab-switching behaviour." });
  }
  if (Number(sessionCounts.recent_sessions || 0) === 0) {
    alerts.push({ level: "info", title: "No recent sessions this week", detail: "Recent activity will appear here after teachers finish hosted sessions." });
  }
  if (Number(teacherCounts.currently_online || 0) > 0) {
    alerts.push({ level: "success", title: `${teacherCounts.currently_online} teacher${Number(teacherCounts.currently_online) === 1 ? "" : "s"} active now`, detail: "Teachers were active within the last 30 minutes." });
  }

  res.json({
    institutionName: inst,
    totalTeachers: Number(teacherCounts.total_teachers || 0),
    activeTeachers: Number(teacherCounts.active_teachers || 0),
    currentlyOnline: Number(teacherCounts.currently_online || 0),
    liveSessionCount: Number(sessionCounts.live_sessions || 0),
    recentSessionCount: Number(sessionCounts.recent_sessions || 0),
    institutionMembers: Number(memberCounts.institution_members || 0),
    flaggedIssues,
    alerts,
    recentActivityCount: activity.length,
  });
}

export async function listTeachers(req, res) {
  const admin = await getAdminInstitution(req.user.sub);
  const inst = admin?.institution_name || null;

  const [rows] = await pool.query(
    `SELECT
       u.id,
       u.email,
       u.first_name,
       u.last_name,
       u.is_active,
       u.contact_number,
       u.created_at,
       u.last_active_at,
       u.approval_status,
       (
         SELECT COUNT(*)
         FROM sessions s
         WHERE s.teacher_id = u.id
       ) AS hosted_sessions_count,
       (
         SELECT MAX(COALESCE(s.ended_at, s.created_at))
         FROM sessions s
         WHERE s.teacher_id = u.id
       ) AS last_session_at
     FROM users u
     WHERE u.role = 'TEACHER'
       AND u.institution_name = :inst
       AND u.deleted_at IS NULL
     ORDER BY u.last_name ASC, u.first_name ASC`,
    { inst }
  );
  res.json(rows);
}

export async function setTeacherActive(req, res) {
  const [[teacher]] = await pool.query(
    `SELECT id FROM users
     WHERE id = :id
       AND role = 'TEACHER'
       AND institution_name = (
         SELECT institution_name FROM users WHERE id = :adminId
       )`,
    { id: req.params.id, adminId: req.user.sub }
  );
  if (!teacher) return res.status(404).json({ message: "Teacher not found." });

  const active = req.body?.active ? 1 : 0;
  await pool.query(`UPDATE users SET is_active = :a WHERE id = :id`, { a: active, id: req.params.id });
  res.json({ ok: true });
}

export async function deleteTeacher(req, res) {
  await pool.query(
    `UPDATE users
     SET deleted_at = NOW()
     WHERE id = :id
       AND role = 'TEACHER'`,
    { id: req.params.id }
  );
  res.json({ ok: true });
}

export async function getInstitutionDetails(req, res) {
  const admin = await getAdminInstitution(req.user.sub);
  const inst = admin?.institution_name || null;
  const teachers = inst
    ? (await pool.query(
        `SELECT
           id,
           email,
           first_name,
           last_name,
           is_active,
           created_at,
           last_active_at
         FROM users
         WHERE role = 'TEACHER'
           AND institution_name = :inst
           AND deleted_at IS NULL
         ORDER BY last_name ASC, first_name ASC`,
        { inst }
      ))[0]
    : [];

  const [[sessionSummary]] = await pool.query(
    `SELECT
       COUNT(*) AS total_sessions,
       SUM(COALESCE(s.ended_at, s.created_at) >= DATE_SUB(NOW(), INTERVAL 7 DAY)) AS sessions_this_week,
       MAX(COALESCE(s.ended_at, s.created_at)) AS last_activity
     FROM sessions s
     JOIN users u ON u.id = s.teacher_id
     WHERE u.institution_name = :inst`,
    { inst }
  );

  const activity = await buildInstitutionActivity(inst, 8);

  res.json({
    institution: {
      name: inst,
      adminName: admin ? `${admin.first_name} ${admin.last_name}` : null,
      adminEmail: admin?.email || null,
      createdAt: admin?.created_at || null,
      status: admin?.is_active ? "Active" : "Inactive",
      totalTeachers: teachers.length,
      totalSessions: Number(sessionSummary.total_sessions || 0),
      sessionsThisWeek: Number(sessionSummary.sessions_this_week || 0),
      lastActivity: sessionSummary.last_activity || null,
    },
    teachers,
    recentActivity: activity,
  });
}

export async function getActivity(req, res) {
  const admin = await getAdminInstitution(req.user.sub);
  const inst = admin?.institution_name || null;
  const activity = await buildInstitutionActivity(inst, 10);
  res.json(activity);
}

export async function getInvitation(req, res) {
  const [rows] = await pool.query(
    `SELECT id, invite_code, institution_name, is_active, created_at
     FROM teacher_invitations
     WHERE admin_id = :aid AND is_active = 1
     ORDER BY created_at DESC LIMIT 1`,
    { aid: req.user.sub }
  );
  res.json(rows[0] || null);
}

export async function createInvitation(req, res) {
  const admin = await getAdminInstitution(req.user.sub);
  if (!admin?.institution_name) {
    return res.status(400).json({ message: "Please complete institution setup first." });
  }

  await pool.query(
    `UPDATE teacher_invitations
     SET is_active = 0, revoked_at = NOW()
     WHERE admin_id = :aid AND is_active = 1`,
    { aid: req.user.sub }
  );

  const code = makeJoinCode();
  const [r] = await pool.query(
    `INSERT INTO teacher_invitations(admin_id, invite_code, institution_name)
     VALUES(:aid, :code, :inst)`,
    { aid: req.user.sub, code, inst: admin.institution_name }
  );
  res.status(201).json({ id: r.insertId, invite_code: code, institution_name: admin.institution_name });
}

export async function revokeInvitation(req, res) {
  await pool.query(
    `UPDATE teacher_invitations
     SET is_active = 0, revoked_at = NOW()
     WHERE id = :id AND admin_id = :aid`,
    { id: req.params.id, aid: req.user.sub }
  );
  res.json({ ok: true });
}

export async function joinViaInvitation(req, res) {
  const { code } = req.body;
  if (!code) return res.status(400).json({ message: "Code is required." });

  const [[invite]] = await pool.query(
    `SELECT id, institution_name, admin_id
     FROM teacher_invitations
     WHERE invite_code = :code AND is_active = 1`,
    { code: code.trim().toUpperCase() }
  );
  if (!invite) {
    return res.status(404).json({ message: "Invalid or expired invitation code." });
  }

  await pool.query(
    `UPDATE users
     SET institution_name = :inst
     WHERE id = :tid AND role = 'TEACHER'`,
    { inst: invite.institution_name, tid: req.user.sub }
  );

  res.json({ ok: true, institutionName: invite.institution_name });
}
