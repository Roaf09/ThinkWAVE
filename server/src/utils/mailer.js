/* FILE GUIDE:
 * server/src/utils/mailer.js
 * Purpose: Central email helper used by OTP and any future transactional emails.
 * Tip: Keep transport setup here so other modules only worry about content, not SMTP details.
 */

import nodemailer from "nodemailer";
import { env } from "../env.js";

function hasMailConfig() {
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
    console.log("[OTP EMAIL NOT SENT - configure Gmail/SMTP in server/.env]", { to, subject, text });
    return;
  }

  const transporter = buildTransporter();

  await transporter.sendMail({
    from: env.SMTP_FROM,
    to,
    subject,
    text,
    html
  });
}
