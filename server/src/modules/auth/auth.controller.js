/* FILE GUIDE:
 * server/src/modules/auth/auth.controller.js
 * Purpose: Authentication/business logic for register, verify OTP, login, and current-user lookup.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */


import bcrypt from "bcryptjs";
import jwt    from "jsonwebtoken";
import crypto from "crypto";
import { pool } from "../../db.js";
import { env  } from "../../env.js";
import { sendOtpForUser, verifyOtpCode } from "./otp.service.js";
import { getTeacherPlan } from "../plans/plan.js";


function otpClientPayload(otpResult) {
  const sent = !!otpResult?.delivery?.sent;
  const payload = { emailSent: sent };
  if (!sent) {
    payload.deliveryWarning = otpResult?.delivery?.reason === "EMAIL_NOT_CONFIGURED"
      ? "Email delivery is not configured. Add your SMTP settings to server/.env for localhost."
      : "The OTP email could not be sent. Check the server email settings and logs.";
  }
  return payload;
}

// Always normalize emails so duplicate accounts do not appear because of casing/spaces.
function normalizeEmail(e) { return String(e || "").trim().toLowerCase(); }

// Registration handles the role rules used by the project:
// - the first SUPERADMIN is created through the protected setup form
// - approved Admin invitations create ADMIN accounts
// - regular registrations default to TEACHER
export async function register(req, res) {
  const { email, password, firstName, lastName, role: requestedRole, bootstrapSecret, adminInviteToken } = req.body;
  const cleanEmail = normalizeEmail(email);
  const passwordHash = await bcrypt.hash(password, 12);

  try {
    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) AS total FROM users WHERE role='SUPERADMIN' AND deleted_at IS NULL`
    );
    const needsSuperadmin = Number(countRow?.total || 0) === 0;

    let role, approvalStatus, invitation = null;
    if (needsSuperadmin) {
      const submittedSecret = String(bootstrapSecret || "").trim();
      if (!env.BOOTSTRAP_SECRET) {
        return res.status(503).json({ message: "BOOTSTRAP_SECRET is not configured. Add it to server/.env, then restart the server." });
      }
      if (submittedSecret !== env.BOOTSTRAP_SECRET) {
        return res.status(403).json({ message: "The Secret Password is incorrect." });
      }
      role = "SUPERADMIN"; approvalStatus = "APPROVED";
    } else if (adminInviteToken) {
      const tokenHash = crypto.createHash("sha256").update(String(adminInviteToken).trim()).digest("hex");
      const [invites] = await pool.query(`SELECT * FROM admin_invitations WHERE token_hash=:tokenHash AND used_at IS NULL AND expires_at>NOW() LIMIT 1`, { tokenHash });
      invitation = invites[0];
      if (!invitation || normalizeEmail(invitation.email) !== cleanEmail) return res.status(403).json({ message: "This Admin invitation is invalid, expired, or belongs to another email address." });
      role = "ADMIN"; approvalStatus = "APPROVED";
    } else if (requestedRole === "STUDENT") {
      role = "STUDENT"; approvalStatus = "APPROVED";
    } else {
      role = "TEACHER"; approvalStatus = "APPROVED";
    }

    // A registration that crashed before OTP verification should be resumable instead
    // of permanently reserving the email as "already used". The latest submitted
    // profile/password becomes the pending account data; email ownership is still
    // proven only when the OTP is completed.
    const [[existing]] = await pool.query(
      `SELECT id, role, is_verified, is_active, approval_status
       FROM users WHERE email=:email AND deleted_at IS NULL LIMIT 1`,
      { email: cleanEmail }
    );
    if (existing) {
      if (!existing.is_verified && existing.role === role && !adminInviteToken) {
        if (!existing.is_active) return res.status(403).json({ message: "Account deactivated" });
        await pool.query(
          `UPDATE users SET password_hash=:ph, first_name=:fn, last_name=:ln WHERE id=:id`,
          { ph: passwordHash, fn: firstName.trim(), ln: lastName.trim(), id: existing.id }
        );
        const otpResult = await sendOtpForUser(existing.id, cleanEmail, { purpose: "ACCOUNT_VERIFICATION" });
        const otpPayload = otpClientPayload(otpResult);
        return res.status(200).json({
          message: otpPayload.emailSent
            ? "Your unverified account was found. A new OTP was sent."
            : "Your unverified account was found. A new OTP was generated, but email delivery needs server setup.",
          role: existing.role,
          approvalStatus: existing.approval_status,
          requiresVerification: true,
          resumedVerification: true,
          ...otpPayload,
        });
      }
      if (!existing.is_verified) {
        return res.status(409).json({ message: `This email already belongs to an unverified ${String(existing.role || "account").toLowerCase()} account. Continue from its login page to verify it.` });
      }
      return res.status(409).json({ message: "Email already in use." });
    }

    const [result] = await pool.query(
      `INSERT INTO users (role, email, password_hash, first_name, last_name, approval_status, institution_name)
       VALUES (:role, :email, :ph, :fn, :ln, :as, :institution)`,
      { role, email: cleanEmail, ph: passwordHash,
        fn: firstName.trim(), ln: lastName.trim(), as: approvalStatus, institution: invitation?.institution_name || null }
    );

    if (invitation) {
      await pool.query(`UPDATE admin_invitations SET used_at=NOW() WHERE id=:id`, { id: invitation.id });
      const [[approvedPlan]] = await pool.query(`SELECT plan_expires_at FROM institution_applications WHERE id=:id`, { id: invitation.application_id });
      await pool.query(`UPDATE users SET plan_code='INSTITUTION', plan_expires_at=:expiresAt WHERE id=:userId`, { expiresAt: approvedPlan?.plan_expires_at || null, userId: result.insertId });
      await pool.query(`UPDATE institution_applications SET status='ACTIVATED' WHERE id=:id`, { id: invitation.application_id });
      try { await pool.query(`INSERT INTO system_notifications(type,user_id,name,email,role,institution_name,payload_json) VALUES('ADMIN_ACCOUNT_CREATED',:uid,:name,:email,'ADMIN',:inst,:payload)`,{uid:result.insertId,name:`${firstName.trim()} ${lastName.trim()}`.trim(),email:cleanEmail,inst:invitation.institution_name,payload:JSON.stringify({applicationId:invitation.application_id})}); } catch (_) {}
    }

    try {
      await pool.query(
        `INSERT INTO activity_log (type, user_id, name, email, role)
         VALUES ('REGISTERED', :uid, :name, :email, :role)`,
        { uid: result.insertId,
          name: `${firstName.trim()} ${lastName.trim()}`.trim(),
          email: cleanEmail, role }
      );
    } catch (_) {}
    try {
      await pool.query(`INSERT INTO system_notifications(type,user_id,name,email,role,payload_json) VALUES('USER_REGISTERED',:uid,:name,:email,:role,:payload)`, {
        uid: result.insertId, name: `${firstName.trim()} ${lastName.trim()}`.trim(), email: cleanEmail, role,
        payload: JSON.stringify({ role, email: cleanEmail })
      });
    } catch (_) {}

    const otpResult = await sendOtpForUser(result.insertId, cleanEmail, { purpose: "ACCOUNT_VERIFICATION" });
    const otpPayload = otpClientPayload(otpResult);

    res.status(201).json({
      message: otpPayload.emailSent
        ? "Registered. OTP sent to email."
        : "Registered. OTP email was not sent because email delivery needs server setup.",
      role,
      approvalStatus,
      requiresVerification: true,
      ...otpPayload,
    });
  } catch (e) {
    if (String(e).toLowerCase().includes("duplicate"))
      return res.status(409).json({ message: "Email already in use." });
    console.error(e);
    res.status(500).json({ message: "Server error" });
  }
}

export async function checkAdminInvitation(req, res) {
  const tokenHash = crypto.createHash("sha256").update(String(req.params.token || "").trim()).digest("hex");
  // Evaluate expiry in MySQL so TIMESTAMP/DATETIME values are compared in the same
  // clock/timezone that created them. Parsing a MySQL timestamp with `new Date()`
  // can shift it by the server runtime timezone and incorrectly report a fresh
  // invitation as expired.
  const [[invitation]] = await pool.query(
    `SELECT id,email,institution_name,expires_at,used_at,(expires_at > NOW()) AS is_unexpired
     FROM admin_invitations
     WHERE token_hash=:tokenHash
     LIMIT 1`,
    { tokenHash }
  );
  if (!invitation) return res.status(404).json({ message: "This Admin invitation is invalid." });
  if (invitation.used_at) return res.status(409).json({ message: "This Admin invitation has already been used and cannot create another account." });
  if (!Number(invitation.is_unexpired)) return res.status(410).json({ message: "This Admin invitation has expired." });
  res.json({ valid: true, email: invitation.email, institutionName: invitation.institution_name, expiresAt: invitation.expires_at });
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
    `SELECT id, role, password_hash, is_verified, is_active, approval_status, last_active_at, token_version
     FROM users WHERE email=:email AND deleted_at IS NULL LIMIT 1`,
    { email: cleanEmail }
  );
  if (!rows.length) return res.status(401).json({ message: "Invalid credentials" });
  const u = rows[0];
  if (!u.is_active) return res.status(403).json({ message: "Account deactivated" });

  // Check the password before revealing verification state or issuing another OTP.
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
    return res.status(403).json({ message: "Only student accounts can use the student login page." });
  }

  if (!u.is_verified) {
    const otpResult = await sendOtpForUser(u.id, cleanEmail, { purpose: "ACCOUNT_VERIFICATION" });
    return res.status(403).json({
      message: "Account not verified. A new verification code has been generated.",
      role: u.role,
      requiresVerification: true,
      ...otpClientPayload(otpResult),
    });
  }
  if (u.approval_status === "PENDING")  return res.status(403).json({ message: "Your account is awaiting approval from a superadmin." });
  if (u.approval_status === "REJECTED") return res.status(403).json({ message: "Your account registration was rejected." });

  const firstLogin = !u.last_active_at;
  await pool.query(`UPDATE users SET last_active_at=NOW() WHERE id=:id`, { id: u.id });
  const token = jwt.sign({ sub: u.id, role: u.role, ver: Number(u.token_version || 0) }, env.JWT_SECRET, { expiresIn: "8h" });
  res.json({ token, role: u.role, firstLogin });
}

export async function resendOtp(req, res) {
  const cleanEmail = normalizeEmail(req.body.email);
  const [rows] = await pool.query(
    `SELECT id, is_verified FROM users WHERE email=:email AND deleted_at IS NULL LIMIT 1`,
    { email: cleanEmail }
  );
  if (!rows.length) return res.status(404).json({ message: "Account not found." });
  if (rows[0].is_verified) return res.status(400).json({ message: "This account is already verified." });
  const otpResult = await sendOtpForUser(rows[0].id, cleanEmail);
  return res.json({ message: "A new verification code has been generated.", ...otpClientPayload(otpResult) });
}

export async function requestPasswordReset(req, res) {
  const { email } = req.body;
  const cleanEmail = normalizeEmail(email);
  const [rows] = await pool.query(
    `SELECT id FROM users WHERE email=:email AND deleted_at IS NULL LIMIT 1`,
    { email: cleanEmail }
  );
  if (rows.length) {
    const otpResult = await sendOtpForUser(rows[0].id, cleanEmail, { purpose: "PASSWORD_RESET" });
    return res.json({
      message: "If the email exists, an OTP request has been processed.",
      ...otpClientPayload(otpResult),
    });
  }
  res.json({ message: "If the email exists, an OTP has been sent.", emailSent: false });
}

export async function verifyPasswordResetOtp(req, res) {
  const cleanEmail = normalizeEmail(req.body.email);
  const [rows] = await pool.query(`SELECT id FROM users WHERE email=:email AND deleted_at IS NULL LIMIT 1`, { email: cleanEmail });
  if (!rows.length) return res.status(404).json({ message: "User not found" });
  const ok = await verifyOtpCode(rows[0].id, req.body.code);
  if (!ok) return res.status(400).json({ message: "Invalid or expired OTP" });
  const resetToken = jwt.sign({ sub: rows[0].id, purpose: "PASSWORD_RESET" }, env.JWT_SECRET, { expiresIn: "10m" });
  res.json({ message: "OTP verified.", resetToken });
}

export async function confirmPasswordReset(req, res) {
  let payload;
  try { payload = jwt.verify(req.body.resetToken, env.JWT_SECRET); }
  catch { return res.status(400).json({ message: "Reset authorisation is invalid or expired." }); }
  if (payload?.purpose !== "PASSWORD_RESET") return res.status(400).json({ message: "Invalid reset authorisation." });
  const passwordHash = await bcrypt.hash(req.body.newPassword, 12);
  await pool.query(`UPDATE users SET password_hash=:ph, token_version=token_version+1 WHERE id=:id AND deleted_at IS NULL`, { ph: passwordHash, id: payload.sub });
  try { const [[user]]=await pool.query(`SELECT id,first_name,last_name,email,role,institution_name FROM users WHERE id=:id`,{id:payload.sub}); if(user) await pool.query(`INSERT INTO system_notifications(type,user_id,name,email,role,institution_name,payload_json) VALUES('PASSWORD_CHANGED',:uid,:name,:email,:role,:inst,:payload)`,{uid:user.id,name:`${user.first_name||''} ${user.last_name||''}`.trim(),email:user.email,role:user.role,inst:user.institution_name,payload:JSON.stringify({method:'OTP_RESET'})}); } catch (_) {}
  res.json({ message: "Password changed successfully." });
}

export async function me(req, res) {
  const [rows] = await pool.query(
    `SELECT id, role, email, first_name, last_name, is_verified, is_active,
            approval_status, institution_name, contact_number, profile_image
     FROM users WHERE id=:id`,
    { id: req.user.sub }
  );
  const user = rows[0] || null;
  if (user?.role === "TEACHER" || user?.role === "GUEST_HOST") {
    const plan = await getTeacherPlan(req.user.sub);
    return res.json({
      ...user,
      role: user.role,
      plan_code: plan.code,
      plan_expires_at: plan.expiresAt || null,
      plan_limits: plan.limits,
    });
  }
  res.json(user);
}


export async function updateMe(req, res) {
  const fields = [];
  const params = { id: req.user.sub };
  const mapping = { firstName: "first_name", lastName: "last_name", contactNumber: "contact_number", profileImage: "profile_image" };
  for (const [key, column] of Object.entries(mapping)) {
    if (!Object.prototype.hasOwnProperty.call(req.body || {}, key)) continue;
    const param = `v_${key}`;
    fields.push(`${column}=:${param}`);
    params[param] = req.body[key] === null ? null : String(req.body[key] ?? "").trim();
  }
  if (!fields.length) return res.status(400).json({ message: "No profile changes supplied." });
  await pool.query(`UPDATE users SET ${fields.join(", ")} WHERE id=:id AND deleted_at IS NULL`, params);
  return me(req, res);
}
