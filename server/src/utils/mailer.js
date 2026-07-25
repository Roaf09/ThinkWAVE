/* FILE GUIDE:
 * server/src/utils/mailer.js
 * Purpose: Central email helper used by OTP and future transactional emails.
 */

import nodemailer from "nodemailer";
import { env } from "../env.js";

export function hasMailConfig() {
  return Boolean((env.SMTP_HOST || env.SMTP_SERVICE) && env.SMTP_USER && env.SMTP_PASS);
}

function smtpPassword() {
  const raw = String(env.SMTP_PASS || "");
  // Google displays App Passwords in grouped blocks. Removing whitespace prevents
  // accidental authentication failures when the grouped value is pasted into .env.
  return String(env.SMTP_SERVICE || "").toLowerCase() === "gmail"
    ? raw.replace(/\s+/g, "")
    : raw;
}

function buildTransporter() {
  const auth = { user: env.SMTP_USER, pass: smtpPassword() };
  return nodemailer.createTransport(
    env.SMTP_SERVICE
      ? { service: env.SMTP_SERVICE, auth }
      : {
          host: env.SMTP_HOST,
          port: env.SMTP_PORT,
          secure: env.SMTP_PORT === 465,
          auth,
        }
  );
}

export async function sendMail({ to, subject, text, html }) {
  if (!hasMailConfig()) {
    console.warn("[OTP EMAIL NOT SENT] SMTP is not configured.", { to, subject });
    return { sent: false, reason: "SMTP_NOT_CONFIGURED" };
  }

  try {
    const transporter = buildTransporter();
    const info = await transporter.sendMail({
      from: env.SMTP_FROM || env.SMTP_USER,
      to,
      subject,
      text,
      html,
    });
    return { sent: true, messageId: info.messageId };
  } catch (error) {
    console.error("[OTP EMAIL FAILED]", {
      to,
      subject,
      code: error?.code,
      responseCode: error?.responseCode,
      message: error?.message || String(error),
    });
    return {
      sent: false,
      reason: "SMTP_SEND_FAILED",
      error: error?.message || String(error),
    };
  }
}
