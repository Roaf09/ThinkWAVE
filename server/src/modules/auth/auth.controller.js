/* FILE GUIDE:
 * server/src/modules/auth/auth.controller.js
 * Purpose: Authentication/business logic for register, verify OTP, login, and current-user lookup.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */


import bcrypt from "bcrypt";
import jwt    from "jsonwebtoken";
import { pool } from "../../db.js";
import { env  } from "../../env.js";
import { sendOtpForUser, verifyOtpCode } from "./otp.service.js";


function otpClientPayload(otpResult) {
  const sent = !!otpResult?.delivery?.sent;
  const payload = { emailSent: sent };
  if (!sent) {
    payload.deliveryWarning = otpResult?.delivery?.reason === "SMTP_NOT_CONFIGURED"
      ? "Email delivery is not configured on the server. Configure Gmail/SMTP in server/.env to receive OTP emails."
      : "The OTP email could not be sent. Check the server email settings and logs.";
    if (process.env.NODE_ENV !== "production" && otpResult?.code) payload.devOtp = otpResult.code;
  }
  return payload;
}

// Always normalize emails so duplicate accounts do not appear because of casing/spaces.
function normalizeEmail(e) { return String(e || "").trim().toLowerCase(); }

// Registration handles the role rules used by the project:
// - first user becomes SUPERADMIN
// - admin registrations stay ADMIN
// - regular registrations default to TEACHER
export async function register(req, res) {
  const { email, password, firstName, lastName, role: requestedRole } = req.body;
  const cleanEmail   = normalizeEmail(email);
  const passwordHash = await bcrypt.hash(password, 12);

  try {
    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) AS total FROM users WHERE deleted_at IS NULL`
    );
    const isFirst = Number(countRow?.total || 0) === 0;

    let role, approvalStatus;
    if (isFirst) {
      role = "SUPERADMIN"; approvalStatus = "APPROVED";
    } else if (requestedRole === "ADMIN") {
      role = "ADMIN";      approvalStatus = "APPROVED";
    } else if (requestedRole === "STUDENT") {
      // Revision 6: students now register their own accounts.
      role = "STUDENT";    approvalStatus = "APPROVED";
    } else {
      role = "TEACHER";    approvalStatus = "APPROVED";
    }

    const [result] = await pool.query(
      `INSERT INTO users (role, email, password_hash, first_name, last_name, approval_status)
       VALUES (:role, :email, :ph, :fn, :ln, :as)`,
      { role, email: cleanEmail, ph: passwordHash,
        fn: firstName.trim(), ln: lastName.trim(), as: approvalStatus }
    );

    try {
      await pool.query(
        `INSERT INTO activity_log (type, user_id, name, email, role)
         VALUES ('REGISTERED', :uid, :name, :email, :role)`,
        { uid: result.insertId,
          name: `${firstName.trim()} ${lastName.trim()}`.trim(),
          email: cleanEmail, role }
      );
    } catch (_) {}

    const otpResult = await sendOtpForUser(result.insertId, cleanEmail);
    const otpPayload = otpClientPayload(otpResult);

    res.status(201).json({
      message: otpPayload.emailSent
        ? "Registered. OTP sent to email."
        : "Registered. OTP email was not sent because email delivery needs server setup.",
      role,
      approvalStatus,
      ...otpPayload,
    });
  } catch (e) {
    if (String(e).toLowerCase().includes("duplicate"))
      return res.status(409).json({ message: "Email already in use." });
    console.error(e);
    res.status(500).json({ message: "Server error" });
  }
}

export async function verifyOtp(req, res) {
  const { email, code } = req.body;
  const cleanEmail = normalizeEmail(email);
  const [rows] = await pool.query(
    `SELECT id, is_verified FROM users WHERE email=:email AND deleted_at IS NULL LIMIT 1`,
    { email: cleanEmail }
  );
  if (!rows.length) return res.status(404).json({ message: "User not found" });
  const user = rows[0];
  if (user.is_verified) return res.json({ message: "Already verified" });
  const ok = await verifyOtpCode(user.id, code);
  if (!ok) return res.status(400).json({ message: "Invalid or expired OTP" });
  await pool.query(`UPDATE users SET is_verified=1 WHERE id=:id`, { id: user.id });
  res.json({ message: "Verified. You can now log in." });
}

// Login also checks which portal the user came from so teacher/admin/superadmin pages stay separated.
export async function login(req, res) {
  const { email, password, loginPortal } = req.body;
  const cleanEmail = normalizeEmail(email);
  const [rows] = await pool.query(
    `SELECT id, role, password_hash, is_verified, is_active, approval_status
     FROM users WHERE email=:email AND deleted_at IS NULL LIMIT 1`,
    { email: cleanEmail }
  );
  if (!rows.length) return res.status(401).json({ message: "Invalid credentials" });
  const u = rows[0];
  if (!u.is_active)                     return res.status(403).json({ message: "Account deactivated" });
  if (!u.is_verified)                   return res.status(403).json({ message: "Account not verified. Check your email for the OTP." });
  if (u.approval_status === "PENDING")  return res.status(403).json({ message: "Your account is awaiting approval from a superadmin." });
  if (u.approval_status === "REJECTED") return res.status(403).json({ message: "Your account registration was rejected." });
  const ok = await bcrypt.compare(password, u.password_hash);
  if (!ok) return res.status(401).json({ message: "Invalid credentials" });

  if (loginPortal === "TEACHER" && u.role !== "TEACHER") {
    return res.status(403).json({ message: "Only teacher accounts can use the standard login page." });
  }
  if (loginPortal === "ADMIN" && u.role !== "ADMIN") {
    return res.status(403).json({ message: "Only admin accounts can use the admin login page." });
  }
  if (loginPortal === "SUPERADMIN" && u.role !== "SUPERADMIN") {
    return res.status(403).json({ message: "Only superadmin accounts can use the superadmin login page." });
  }
  if (loginPortal === "STUDENT" && u.role !== "STUDENT") {
    // Revision 6: keep the student portal separate from teacher/admin logins.
    return res.status(403).json({ message: "Only student accounts can use the student login page." });
  }

  await pool.query(`UPDATE users SET last_active_at=NOW() WHERE id=:id`, { id: u.id });
  const token = jwt.sign({ sub: u.id, role: u.role }, env.JWT_SECRET, { expiresIn: "8h" });
  res.json({ token, role: u.role });
}

export async function requestPasswordReset(req, res) {
  const { email } = req.body;
  const cleanEmail = normalizeEmail(email);
  const [rows] = await pool.query(
    `SELECT id FROM users WHERE email=:email AND deleted_at IS NULL LIMIT 1`,
    { email: cleanEmail }
  );
  // Revision 1: password changes use OTP verification only, no admin approval.
  if (rows.length) {
    const otpResult = await sendOtpForUser(rows[0].id, cleanEmail);
    return res.json({
      message: otpResult?.delivery?.sent
        ? "If the email exists, an OTP has been sent."
        : "The account exists, but the OTP email could not be sent because email delivery needs server setup.",
      ...otpClientPayload(otpResult),
    });
  }
  res.json({ message: "If the email exists, an OTP has been sent.", emailSent: false });
}

export async function confirmPasswordReset(req, res) {
  const { email, code, newPassword } = req.body;
  const cleanEmail = normalizeEmail(email);
  const [rows] = await pool.query(
    `SELECT id FROM users WHERE email=:email AND deleted_at IS NULL LIMIT 1`,
    { email: cleanEmail }
  );
  if (!rows.length) return res.status(404).json({ message: "User not found" });
  const ok = await verifyOtpCode(rows[0].id, code);
  if (!ok) return res.status(400).json({ message: "Invalid or expired OTP" });
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await pool.query(`UPDATE users SET password_hash=:ph WHERE id=:id`, { ph: passwordHash, id: rows[0].id });
  res.json({ message: "Password changed successfully." });
}

export async function me(req, res) {
  const [rows] = await pool.query(
    `SELECT id, role, email, first_name, last_name, is_verified, is_active,
            approval_status, institution_name, contact_number
     FROM users WHERE id=:id`,
    { id: req.user.sub }
  );
  res.json(rows[0] || null);
}
