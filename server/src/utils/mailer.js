/* FILE GUIDE:
 * server/src/utils/mailer.js
 * Purpose: Central email helper used by OTP and future transactional emails.
 *
 * PROVIDERS:
 * - Mailgun HTTP API (production — Render blocks/limits outbound SMTP ports on
 *   some plans, but HTTPS port 443 always works).
 * - SMTP via nodemailer (local dev — your Gmail app-password .env still works).
 * sendMail() prefers Mailgun when configured, otherwise falls back to SMTP.
 * The exported signatures (hasMailConfig, sendMail, thinkwaveEmailTemplate)
 * are unchanged, so callers in otp.service.js / superadmin.controller.js work
 * with either provider.
 */

import FormData from "form-data";
import Mailgun from "mailgun.js";
import nodemailer from "nodemailer";
import { env } from "../env.js";

const mailgun = new Mailgun(FormData);

// Only construct the client if a key is present so local/dev environments
// without Mailgun configured don't throw on startup.
const mg = env.MAILGUN_API_KEY
  ? mailgun.client({
      username: "api",
      key: env.MAILGUN_API_KEY,
      // Change MAILGUN_BASE_URL to https://api.eu.mailgun.net if your Mailgun
      // domain was created in the EU region.
      url: env.MAILGUN_BASE_URL,
    })
  : null;

export function hasMailgunConfig() {
  return Boolean(env.MAILGUN_API_KEY && env.MAILGUN_DOMAIN);
}

export function hasSmtpConfig() {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
}

export function hasMailConfig() {
  return hasMailgunConfig() || hasSmtpConfig();
}

export function mailProvider() {
  if (hasMailgunConfig()) return "mailgun";
  if (hasSmtpConfig()) return "smtp";
  return "not configured";
}

let smtpTransporter = null;
function getSmtpTransporter() {
  if (smtpTransporter) return smtpTransporter;
  const secure = Number(env.SMTP_PORT) === 465;
  smtpTransporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT) || 587,
    secure,
    // Port 587 (STARTTLS) — require the upgrade; port 465 uses implicit TLS.
    requireTLS: !secure,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    // Local dev machines can have odd DNS/timeouts — fail fast instead of
    // hanging the OTP request for a minute.
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });
  return smtpTransporter;
}

async function sendViaSmtp({ to, subject, text, html }) {
  const info = await getSmtpTransporter().sendMail({
    from: env.MAIL_FROM,
    to,
    subject,
    text,
    html,
  });
  return { sent: true, messageId: info?.messageId };
}

export async function sendMail({ to, subject, text, html }) {
  if (!hasMailConfig()) {
    console.warn("[EMAIL NOT SENT] No mail provider configured (Mailgun or SMTP).", { to, subject });
    return { sent: false, reason: "MAIL_NOT_CONFIGURED" };
  }

  // Production path first — HTTPS, unaffected by SMTP port blocks.
  if (hasMailgunConfig()) {
    try {
      const info = await mg.messages.create(env.MAILGUN_DOMAIN, {
        from: env.MAIL_FROM || env.SMTP_FROM,
        to,
        subject,
        text,
        html,
      });
      return { sent: true, messageId: info?.id };
    } catch (error) {
      console.error("[EMAIL FAILED] via mailgun", {
        to,
        subject,
        status: error?.status,
        message: error?.message || String(error),
        details: error?.details,
      });
      // If SMTP is also configured (local dev with both), try it before giving up.
      if (!hasSmtpConfig()) {
        return {
          sent: false,
          reason: "MAILGUN_SEND_FAILED",
          error: error?.message || String(error),
        };
      }
    }
  }

  try {
    return await sendViaSmtp({ to, subject, text, html });
  } catch (error) {
    console.error("[EMAIL FAILED] via smtp", {
      to,
      subject,
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
