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
    console.warn("[EMAIL NOT SENT] SMTP is not configured.", { to, subject });
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
    console.error("[EMAIL FAILED]", {
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

export function thinkwaveEmailTemplate({ eyebrow = "ThinkWAVE", title, intro, bodyHtml = "", actionLabel, actionUrl, footer = "This is an automated message from ThinkWAVE." }) {
  const action = actionLabel && actionUrl ? `<p style="margin:26px 0"><a href="${actionUrl}" style="display:inline-block;background:#2b6cff;color:#fff;text-decoration:none;padding:13px 22px;border-radius:12px;font-weight:800">${actionLabel}</a></p>` : "";
  return `<div style="background:#f4f7fb;padding:28px;font-family:Arial,sans-serif;color:#172033"><div style="max-width:600px;margin:auto;background:#fff;border:1px solid #dce4ef;border-radius:20px;overflow:hidden"><div style="padding:28px 32px;background:linear-gradient(135deg,#17356f,#2b6cff);color:#fff"><div style="font-size:13px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;opacity:.85">${eyebrow}</div><h1 style="margin:9px 0 0;font-size:28px">${title}</h1></div><div style="padding:30px 32px"><p style="font-size:15px;line-height:1.7;margin:0 0 16px">${intro}</p>${bodyHtml}${action}<p style="margin:28px 0 0;color:#6b7280;font-size:12px;line-height:1.6">${footer}</p></div></div></div>`;
}
