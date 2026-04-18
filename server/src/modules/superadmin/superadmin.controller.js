/* FILE GUIDE:
 * server/src/modules/superadmin/superadmin.controller.js
 * Purpose: Project source file. Read the file name and exports first, then follow the imported helpers to understand the flow.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

// NEW FILE

import { pool } from "../../db.js";

// dashboard stats
// GET /api/superadmin/stats
export async function getStats(req, res) {
  const [[counts]] = await pool.query(
    `SELECT
       SUM(role = 'ADMIN')   AS total_admins,
       SUM(role = 'TEACHER') AS total_teachers,
       SUM(role IN ('ADMIN','TEACHER')
           AND last_active_at >= DATE_SUB(NOW(), INTERVAL 30 MINUTE)
           AND is_active = 1) AS currently_online
     FROM users
     WHERE deleted_at IS NULL AND approval_status = 'APPROVED'`
  );

  const [[sessions]] = await pool.query(
    `SELECT COUNT(*) AS live_sessions FROM sessions WHERE status = 'LIVE'`
  );

  res.json({
    totalAdmins:      Number(counts.total_admins   || 0),
    totalTeachers:    Number(counts.total_teachers  || 0),
    currentlyOnline:  Number(counts.currently_online|| 0),
    liveSessionCount: Number(sessions.live_sessions  || 0),
  });
}

// account management
// GET /api/superadmin/accounts
// returns all APPROVED admins with the teachers nested under them
export async function listAccounts(req, res) {
  // All approved admins
  const [admins] = await pool.query(
    `SELECT id, email, first_name, last_name, is_active, contact_number,
            institution_name, created_at, last_active_at, approval_status
     FROM users
     WHERE role='ADMIN' AND deleted_at IS NULL AND approval_status='APPROVED'
     ORDER BY institution_name ASC, last_name ASC`
  );

  // All teachers (will be grouped uner their institution group)
  const [teachers] = await pool.query(
    `SELECT id, email, first_name, last_name, is_active, contact_number,
            institution_name, created_at, last_active_at, approval_status
     FROM users
     WHERE role='TEACHER' AND deleted_at IS NULL AND approval_status='APPROVED'
     ORDER BY last_name ASC`
  );

  // Group: institutions -> admins -> teachers
  // we group by institution_name (set during admin first login)
  const institutionMap = {};

  for (const admin of admins) {
    const inst = admin.institution_name || "(No institution set)";
    if (!institutionMap[inst]) institutionMap[inst] = { name: inst, admins: [] };
    institutionMap[inst].admins.push({ ...admin, teachers: [] });
  }

  // assign teachers to their institution
  for (const teacher of teachers) {
    const inst = teacher.institution_name || "(No institution set)";
    if (!institutionMap[inst]) {
      institutionMap[inst] = { name: inst, admins: [] };
    }
    // put teacher under the first admin of that institution,
    // or in a standalone list if no admin yet
    const entry = institutionMap[inst];
    if (entry.admins.length > 0) {
      entry.admins[0].teachers.push(teacher);
    } else {
      if (!entry.orphanTeachers) entry.orphanTeachers = [];
      entry.orphanTeachers.push(teacher);
    }
  }

  res.json(Object.values(institutionMap));
}

// pending approvals
// GET /api/superadmin/pending
export async function listPending(req, res) {
  const [rows] = await pool.query(
    `SELECT id, role, email, first_name, last_name,
            contact_number, institution_name, created_at
     FROM users
     WHERE approval_status='PENDING' AND deleted_at IS NULL
     ORDER BY created_at ASC`
  );
  res.json(rows);
}

// approve
// POST /api/superadmin/accounts/:id/approve
export async function approveAccount(req, res) {
  await pool.query(
    `UPDATE users SET approval_status='APPROVED' WHERE id=:id AND deleted_at IS NULL`,
    { id: req.params.id }
  );
  res.json({ ok: true });
}

// reject
// POST /api/superadmin/accounts/:id/reject
export async function rejectAccount(req, res) {
  await pool.query(
    `UPDATE users SET approval_status='REJECTED' WHERE id=:id AND deleted_at IS NULL`,
    { id: req.params.id }
  );
  res.json({ ok: true });
}

// activate , deactiate
// POST /api/superadmin/accounts/:id/active  body: { active: bool }
export async function setActive(req, res) {
  const active = req.body?.active ? 1 : 0;
  await pool.query(
    `UPDATE users SET is_active=:a WHERE id=:id AND deleted_at IS NULL`,
    { a: active, id: req.params.id }
  );
  res.json({ ok: true });
}

// soft delete
// DELETE /api/superadmin/accounts/:id
export async function deleteAccount(req, res) {
  await pool.query(
    `UPDATE users SET deleted_at=NOW() WHERE id=:id`,
    { id: req.params.id }
  );
  res.json({ ok: true });
}

export async function getNotifications(req, res) {                      // latestS addition
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
    res.status(500).json({ message: "Server error" });
  }
}