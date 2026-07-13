/* FILE GUIDE:
 * server/src/modules/auth/otp.service.js
 * Purpose: Create, send, and verify one-time passcodes used during account verification.
 * Tip: Read sendOtpForUser first, then verifyOtpCode. That shows the full OTP lifecycle.
 */

import bcrypt from "bcrypt";
import { pool } from "../../db.js";
import { sendMail } from "../../utils/mailer.js";

const OTP_EXPIRY_MINUTES = 10;

function randomOtp() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
}

function buildOtpEmail({ code, email }) {
  const subject = "Verify your ThinkWAVE account";
  const text = [
    "Welcome to ThinkWAVE.",
    "",
    `Use this one-time verification code to finish setting up your account: ${code}`,
    `This code expires in ${OTP_EXPIRY_MINUTES} minutes.`,
    "",
    `If you did not request this, you can ignore this email sent to ${email}.`,
    "",
    "— ThinkWAVE Team"
  ].join("\n");

  const html = `
    <div style="margin:0;padding:24px;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
        <tr>
          <td style="padding:28px 32px 12px 32px;">
            <div style="font-size:12px;font-weight:700;letter-spacing:.12em;color:#7c3aed;text-transform:uppercase;">ThinkWAVE</div>
            <h1 style="margin:12px 0 8px 0;font-size:22px;line-height:1.3;color:#111827;">Verify your account</h1>
            <p style="margin:0;font-size:14px;line-height:1.6;color:#4b5563;">Use the verification code below to complete your account setup.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 32px 8px 32px;">
            <div style="margin:8px 0 4px 0;padding:18px 20px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:14px;text-align:center;">
              <div style="font-size:30px;letter-spacing:0.35em;font-weight:700;color:#111827;">${code}</div>
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 32px 28px 32px;">
            <p style="margin:0 0 10px 0;font-size:14px;line-height:1.7;color:#4b5563;">This code expires in <strong>${OTP_EXPIRY_MINUTES} minutes</strong>.</p>
            <p style="margin:0 0 10px 0;font-size:14px;line-height:1.7;color:#4b5563;">If you did not request this verification, you can safely ignore this email.</p>
            <p style="margin:18px 0 0 0;font-size:13px;line-height:1.6;color:#6b7280;">This message was sent to <span style="word-break:break-all;">${email}</span> by the ThinkWAVE Team.</p>
          </td>
        </tr>
      </table>
    </div>
  `;

  return { subject, text, html };
}

export async function sendOtpForUser(userId, email) {
  const code = randomOtp();
  const codeHash = await bcrypt.hash(code, 10);

  await pool.query(
    `INSERT INTO otp_codes(user_id, code_hash, expires_at)
     VALUES(:uid,:ch, DATE_ADD(NOW(), INTERVAL ${OTP_EXPIRY_MINUTES} MINUTE))`,
    { uid: userId, ch: codeHash }
  );

  const mail = buildOtpEmail({ code, email });
  const delivery = await sendMail({ to: email, ...mail });
  if (!delivery?.sent) {
    // Local/dev fallback: keep registration usable and make the missing SMTP setup visible.
    // This is intentionally not returned to production clients.
    console.warn(`[DEV OTP FALLBACK] OTP for ${email}: ${code}`);
  }
  return { code, delivery: delivery || { sent: false, reason: "UNKNOWN" } };
}

export async function verifyOtpCode(userId, code) {
  const [rows] = await pool.query(
    `SELECT id, code_hash, expires_at, used_at
     FROM otp_codes WHERE user_id=:uid ORDER BY id DESC LIMIT 1`,
    { uid: userId }
  );
  if (!rows.length) return false;
  const otp = rows[0];
  if (otp.used_at) return false;
  if (new Date(otp.expires_at).getTime() < Date.now()) return false;

  const ok = await bcrypt.compare(code, otp.code_hash);
  if (!ok) return false;

  await pool.query(`UPDATE otp_codes SET used_at=NOW() WHERE id=:id`, { id: otp.id });
  return true;
}
