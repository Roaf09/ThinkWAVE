/* FILE GUIDE:
 * server/src/utils/mailer.js
 * Purpose: Central email helper used by OTP and any future transactional emails.
 * Tip: Keep transport setup here so other modules only worry about content, not SMTP details.
 */

import nodemailer from "nodemailer";
import { env } from "../env.js";

export function hasMailConfig() {
  return Boolean((env.SMTP_HOST || env.SMTP_SERVICE) && env.SMTP_USER && env.SMTP_PASS);
}

function buildTransporter() {
  return nodemailer.createTransport(
    env.SMTP_SERVICE
      ? {
          service: env.SMTP_SERVICE,
          auth: { user: env.SMTP_USER, pass: env.SMTP_PASS }
        }
      : {
          host: env.SMTP_HOST,
          port: env.SMTP_PORT,
          secure: env.SMTP_PORT === 465,
          auth: { user: env.SMTP_USER, pass: env.SMTP_PASS }
        }
  );
}

export async function sendMail({ to, subject, text, html }) {
  if (!hasMailConfig()) {
    console.warn("[OTP EMAIL NOT SENT - configure Gmail/SMTP in server/.env]", { to, subject });
    return { sent: false, reason: "SMTP_NOT_CONFIGURED" };
  }

  try {
    const transporter = buildTransporter();
    await transporter.sendMail({
      from: env.SMTP_FROM || env.SMTP_USER,
      to,
      subject,
      text,
      html
    });
    return { sent: true };
  } catch (error) {
    console.error("[OTP EMAIL FAILED]", { to, subject, error: error?.message || error });
    return { sent: false, reason: "SMTP_SEND_FAILED", error: error?.message || String(error) };
  }
}
