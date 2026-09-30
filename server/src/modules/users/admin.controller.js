/* FILE GUIDE:
 * server/src/modules/users/admin.controller.js
 * Purpose: Project source file. Read the file name and exports first, then follow the imported helpers to understand the flow.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import bcrypt from "bcryptjs";
import { pool } from "../../db.js";
import { invalidateAuthUser } from "../../utils/authCache.js";
import { sendOtpForUser } from "../auth/otp.service.js";

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

async function getCallerInstitution(adminId) {
  const [[row]] = await pool.query(
    `SELECT institution_name FROM users WHERE id=:id AND role='ADMIN' AND deleted_at IS NULL`,
    { id: adminId }
  );
  return String(row?.institution_name || "");
}

// Same-institution fence shared by every write below: an admin acts only on
// TEACHER accounts of their own institution — never on SUPERADMIN accounts,
// and never on fellow ADMINs (admin accounts are minted and removed only
// through the superadmin flow). Matches createUser + the admin dashboard,
// which are TEACHER-only.
async function institutionScopedUser(adminId, targetId, { includeDeleted = false } = {}) {
  const inst = await getCallerInstitution(adminId);
  if (!inst) return null;
  const [[row]] = await pool.query(
    `SELECT id FROM users
     WHERE id=:id AND role = 'TEACHER'${includeDeleted ? "" : " AND deleted_at IS NULL"}
       AND institution_name=:inst`,
    { id: targetId, inst }
  );
  return row || null;
}

export async function listUsers(req, res) {
  const inst = await getCallerInstitution(req.user.sub);
  if (!inst) return res.json([]);
  const [rows] = await pool.query(
    `SELECT id, role, email, first_name, last_name, is_verified, is_active, deleted_at
     FROM users WHERE institution_name=:inst AND role <> 'SUPERADMIN'
     ORDER BY last_name ASC, first_name ASC, id ASC`,
    { inst }
  );
  res.json(rows);
}

export async function createUser(req, res) {
  const { email, password, firstName, lastName } = req.body;
  const inst = await getCallerInstitution(req.user.sub);
  if (!inst) return res.status(403).json({ message: "No institution." });
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const cleanEmail = normalizeEmail(email);
    // TEACHER-only inside the caller's institution. Admin accounts are created
    // exclusively through the superadmin invitation flow — never minted here.
    const [result] = await pool.query(
      `INSERT INTO users(role,email,password_hash,first_name,last_name,institution_name)
       VALUES('TEACHER',:email,:ph,:fn,:ln,:inst)`,
      { email: cleanEmail, ph: passwordHash, fn: firstName.trim(), ln: lastName.trim(), inst }
    );

    await sendOtpForUser(result.insertId, cleanEmail);
    res.status(201).json({ ok: true, message: "Account created. OTP sent to email." });
  } catch (e) {
    if (String(e).toLowerCase().includes("duplicate")) {
      return res.status(409).json({ message: "Email already used." });
    }
    console.error(e);
    res.status(500).json({ message: "Failed to create account" });
  }
}

export async function setActive(req, res) {
  const target = await institutionScopedUser(req.user.sub, req.params.id);
  if (!target) return res.status(404).json({ message: "User not found." });
  const active = req.body?.active ? 1 : 0;
  await pool.query(`UPDATE users SET is_active=:a WHERE id=:id`, { a: active, id: req.params.id });
  invalidateAuthUser(req.params.id);
  res.json({ ok: true });
}

export async function softDeleteUser(req, res) {
  const target = await institutionScopedUser(req.user.sub, req.params.id);
  if (!target) return res.status(404).json({ message: "User not found." });
  await pool.query(`UPDATE users SET deleted_at=NOW() WHERE id=:id`, { id: req.params.id });
  invalidateAuthUser(req.params.id);
  res.json({ ok: true });
}

export async function restoreUser(req, res) {
  const target = await institutionScopedUser(req.user.sub, req.params.id, { includeDeleted: true });
  if (!target) return res.status(404).json({ message: "User not found." });
  await pool.query(`UPDATE users SET deleted_at=NULL WHERE id=:id`, { id: req.params.id });
  invalidateAuthUser(req.params.id);
  res.json({ ok: true });
}
