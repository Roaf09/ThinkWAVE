/* FILE GUIDE:
 * server/src/modules/auth/otp.service.js
 * Purpose: Create, send, and verify one-time passcodes used during account verification and password reset.
 */

import bcrypt from "bcryptjs";
import crypto from "crypto";
import { pool } from "../../db.js";
import { sendMail, thinkwaveEmailTemplate } from "../../utils/mailer.js";
import { env } from "../../env.js";

const OTP_EXPIRY_MINUTES = 10;

function randomOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

function otpBlock(code) {
  return `<div style="margin:22px 0 18px;padding:19px 20px;background:#f8fafc;border:1px solid #dce4ef;border-radius:14px;text-align:center">
    <div style="font-size:30px;letter-spacing:.32em;font-weight:900;color:#172033;padding-left:.32em">${code}</div>
  </div>`;
}

function buildOtpEmail({ code, email, purpose = "ACCOUNT_VERIFICATION" }) {
  const isReset = purpose === "PASSWORD_RESET";
  const subject = isReset ? "Reset your ThinkWAVE password" : "Verify your ThinkWAVE account";
  const title = isReset ? "Reset your password" : "Verify your account";
  const intro = isReset
    ? "Use the one-time code below to continue resetting your ThinkWAVE password."
    : "Use the one-time code below to finish verifying your ThinkWAVE account.";
  const text = [
    `ThinkWAVE — ${title}`,
    "",
    `${intro} ${code}`,
    `This code expires in ${OTP_EXPIRY_MINUTES} minutes.`,
    "",
    `This message was sent to ${email}. If you did not request it, you can ignore this email.`,
  ].join("\n");
  const html = thinkwaveEmailTemplate({
    eyebrow: isReset ? "ThinkWAVE Security" : "ThinkWAVE Verification",
    title,
    intro,
    bodyHtml: `${otpBlock(code)}<p style="margin:0;color:#4b5563;font-size:14px;line-height:1.7">This code expires in <strong>${OTP_EXPIRY_MINUTES} minutes</strong>. For your security, do not share it with anyone.</p>`,
    footer: `This message was sent to ${email}. If you did not request this ${isReset ? "password reset" : "verification"}, you can safely ignore it.`,
  });
  return { subject, text, html };
}

export async function sendOtpForUser(userId, email, { purpose = "ACCOUNT_VERIFICATION" } = {}) {
  const code = randomOtp();
  const codeHash = await bcrypt.hash(code, 10);

  await pool.query(
    `INSERT INTO otp_codes(user_id, code_hash, expires_at)
     VALUES(:uid,:ch, DATE_ADD(NOW(), INTERVAL ${OTP_EXPIRY_MINUTES} MINUTE))`,
    { uid: userId, ch: codeHash }
  );

  const mail = buildOtpEmail({ code, email, purpose });
  const delivery = await sendMail({ to: email, ...mail });
  if (env.NODE_ENV !== "production") {
    console.info(`[ThinkWAVE OTP:${purpose}] ${email}: ${code}`);
  }
  return { code, delivery: delivery || { sent: false, reason: "UNKNOWN" } };
}

export async function verifyOtpCode(userId, code) {
  const submitted = String(code ?? "").replace(/\s+/g, "").trim();
  if (!/^\d{6}$/.test(submitted)) return false;

  // More than one still-valid OTP can exist when a user resends, retries signup,
  // or logs in again before the earlier email arrives. Do not reject a genuinely
  // unexpired code just because a newer row was generated afterward.
  const [rows] = await pool.query(
    `SELECT id, code_hash, attempt_count
     FROM otp_codes
     WHERE user_id=:uid
       AND used_at IS NULL
       AND expires_at > NOW()
       AND attempt_count < 5
     ORDER BY id DESC
     LIMIT 8`,
    { uid: userId }
  );
  if (!rows.length) return false;

  for (const otp of rows) {
    if (await bcrypt.compare(submitted, otp.code_hash)) {
      // Verifying one code completes the verification challenge. Retire every
      // other outstanding code for this user so none can be reused afterward.
      await pool.query(
        `UPDATE otp_codes SET used_at=NOW() WHERE user_id=:uid AND used_at IS NULL`,
        { uid: userId }
      );
      return true;
    }
  }

  // Count one failed submission against only the newest challenge rather than
  // burning attempts on every still-valid code in the user's inbox.
  await pool.query(
    `UPDATE otp_codes SET attempt_count=attempt_count+1 WHERE id=:id`,
    { id: rows[0].id }
  );
  return false;
}
