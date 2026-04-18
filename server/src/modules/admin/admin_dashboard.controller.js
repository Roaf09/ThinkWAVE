/* FILE GUIDE:
 * server/src/modules/admin/admin_dashboard.controller.js
 * Purpose: Project source file. Read the file name and exports first, then follow the imported helpers to understand the flow.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

// NEW FILE  (separate from the existing admin.controller.js which manages users)
//
// 
//   - institution name setup on first login
//   - admin dashboard stats (teachers, online, live sessions)
//   - teacher list for the admin's institution
//   - teacher invitation code: generate, view, revoke

import { pool } from "../../db.js";
import { makeJoinCode } from "../../utils/codes.js";

// institution setup
// POST /api/admin-dashboard/setup-institution
// called once after admin first log in to setup institution
export async function setupInstitution(req, res) {
  const { institutionName } = req.body;
  if (!institutionName?.trim()) {
    return res.status(400).json({ message: "Institution name is required." });
  }

  // Fetch admin details for the activity log
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

  // Log the activity
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
  } catch (_) {} // silently skip if activity_log table is missing

  res.json({ ok: true });
}

// check setup
// GET /api/admin-dashboard/setup-status
export async function getSetupStatus(req, res) {
  const [[row]] = await pool.query(
    `SELECT institution_setup_done, institution_name
     FROM users WHERE id = :id`,
    { id: req.user.sub }
  );
  res.json({
    setupDone: !!row?.institution_setup_done,
    institutionName: row?.institution_name || null,
  });
}

// dashboard stats
// GET /api/admin-dashboard/stats
export async function getStats(req, res) {
  // get admin school/institution name first
  const [[admin]] = await pool.query(
    `SELECT institution_name FROM users WHERE id = :id`,
    { id: req.user.sub }
  );
  const inst = admin?.institution_name || null;

  const [[counts]] = await pool.query(
    `SELECT
       COUNT(*) AS total_teachers,
       SUM(last_active_at >= DATE_SUB(NOW(), INTERVAL 30 MINUTE)
           AND is_active = 1) AS currently_online
     FROM users
     WHERE role = 'TEACHER'
       AND institution_name = :inst
       AND deleted_at IS NULL
       AND approval_status = 'APPROVED'`,
    { inst }
  );

  const [[sessions]] = await pool.query(
    `SELECT COUNT(*) AS live_sessions
     FROM sessions s
     JOIN users u ON u.id = s.teacher_id
     WHERE s.status = 'LIVE'
       AND u.institution_name = :inst`,
    { inst }
  );

  res.json({
    institutionName: inst,
    totalTeachers: Number(counts.total_teachers || 0),
    currentlyOnline: Number(counts.currently_online || 0),
    liveSessionCount: Number(sessions.live_sessions || 0),
  });
}

// teacher list
// GET /api/admin-dashboard/teachers
export async function listTeachers(req, res) {
  const [[admin]] = await pool.query(
    `SELECT institution_name FROM users WHERE id = :id`,
    { id: req.user.sub }
  );
  const inst = admin?.institution_name || null;

  const [rows] = await pool.query(
    `SELECT id, email, first_name, last_name, is_active,
            contact_number, created_at, last_active_at, approval_status
     FROM users
     WHERE role = 'TEACHER'
       AND institution_name = :inst
       AND deleted_at IS NULL
     ORDER BY last_name ASC, first_name ASC`,
    { inst }
  );
  res.json(rows);
}

// managae teacher (activate/deactivate/delete)
// POST /api/admin-dashboard/teachers/:id/active  body: { active: bool }
export async function setTeacherActive(req, res) {
  const [[teacher]] = await pool.query(
    `SELECT id FROM users
     WHERE id = :id AND role = 'TEACHER' AND institution_name = (
       SELECT institution_name FROM users WHERE id = :adminId
     )`,
    { id: req.params.id, adminId: req.user.sub }
  );
  if (!teacher) return res.status(404).json({ message: "Teacher not found" });

  const active = req.body?.active ? 1 : 0;
  await pool.query(
    `UPDATE users SET is_active = :a WHERE id = :id`,
    { a: active, id: req.params.id }
  );
  res.json({ ok: true });
}

export async function deleteTeacher(req, res) {
  await pool.query(
    `UPDATE users SET deleted_at = NOW()
     WHERE id = :id AND role = 'TEACHER'`,
    { id: req.params.id }
  );
  res.json({ ok: true });
}

// in vitation code
// GET /api/admin-dashboard/invitation   — get active invite for this admin
export async function getInvitation(req, res) {
  const [[admin]] = await pool.query(
    `SELECT institution_name FROM users WHERE id = :id`,
    { id: req.user.sub }
  );

  const [rows] = await pool.query(
    `SELECT id, invite_code, institution_name, is_active, created_at
     FROM teacher_invitations
     WHERE admin_id = :aid AND is_active = 1
     ORDER BY created_at DESC LIMIT 1`,
    { aid: req.user.sub }
  );
  res.json(rows[0] || null);
}

// POST /api/admin-dashboard/invitation  — generate new invite code
export async function createInvitation(req, res) {
  const [[admin]] = await pool.query(
    `SELECT institution_name FROM users WHERE id = :id`,
    { id: req.user.sub }
  );
  if (!admin?.institution_name) {
    return res.status(400).json({ message: "Please complete institution setup first." });
  }

  // revoke any existing active codes for this admin
  await pool.query(
    `UPDATE teacher_invitations
     SET is_active = 0, revoked_at = NOW()
     WHERE admin_id = :aid AND is_active = 1`,
    { aid: req.user.sub }
  );

  const code = makeJoinCode(); // reuses the existing utility
  const [r] = await pool.query(
    `INSERT INTO teacher_invitations(admin_id, invite_code, institution_name)
     VALUES(:aid, :code, :inst)`,
    { aid: req.user.sub, code, inst: admin.institution_name }
  );
  res.status(201).json({ id: r.insertId, invite_code: code, institution_name: admin.institution_name });
}

// DELETE /api/admin-dashboard/invitation/:id  — revoke a code
export async function revokeInvitation(req, res) {
  await pool.query(
    `UPDATE teacher_invitations
     SET is_active = 0, revoked_at = NOW()
     WHERE id = :id AND admin_id = :aid`,
    { id: req.params.id, aid: req.user.sub }
  );
  res.json({ ok: true });
}

// teacher joins via invitation 
// POST /api/admin-dashboard/join-institution  (no auth — teacher not yet linked)
// body: { code }  - called from the teacher's "Invitation" tab
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

  // link the teacher to this institution
  await pool.query(
    `UPDATE users
     SET institution_name = :inst
     WHERE id = :tid AND role = 'TEACHER'`,
    { inst: invite.institution_name, tid: req.user.sub }
  );

  res.json({ ok: true, institutionName: invite.institution_name });
}
