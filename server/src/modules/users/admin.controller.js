/* FILE GUIDE:
 * server/src/modules/users/admin.controller.js
 * Purpose: Project source file. Read the file name and exports first, then follow the imported helpers to understand the flow.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import bcrypt from "bcryptjs";
import { pool } from "../../db.js";
import { sendOtpForUser } from "../auth/otp.service.js";

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export async function listUsers(req, res) {
  const [rows] = await pool.query(
    `SELECT id, role, email, first_name, last_name, is_verified, is_active, deleted_at
     FROM users ORDER BY last_name ASC, first_name ASC, id ASC`
  );
  res.json(rows);
}

export async function createUser(req, res) {
  const { email, password, firstName, lastName, role } = req.body;
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const cleanEmail = normalizeEmail(email);
    const safeRole = role === "ADMIN" ? "ADMIN" : "TEACHER";

    const [result] = await pool.query(
      `INSERT INTO users(role,email,password_hash,first_name,last_name)
       VALUES(:role,:email,:ph,:fn,:ln)`,
      { role: safeRole, email: cleanEmail, ph: passwordHash, fn: firstName.trim(), ln: lastName.trim() }
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
  const active = req.body?.active ? 1 : 0;
  await pool.query(`UPDATE users SET is_active=:a WHERE id=:id`, { a: active, id: req.params.id });
  res.json({ ok: true });
}

export async function softDeleteUser(req, res) {
  await pool.query(`UPDATE users SET deleted_at=NOW() WHERE id=:id`, { id: req.params.id });
  res.json({ ok: true });
}

export async function restoreUser(req, res) {
  await pool.query(`UPDATE users SET deleted_at=NULL WHERE id=:id`, { id: req.params.id });
  res.json({ ok: true });
}
