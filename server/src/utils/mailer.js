/* FILE GUIDE:
 * server/src/utils/mailer.js
 * Purpose: Central email helper used by OTP and future transactional emails.
 *
 * MIGRATION NOTE (Gmail SMTP -> Mailgun):
 * Render blocks/limits outbound SMTP ports on some plans, which breaks
 * nodemailer + Gmail. Mailgun's HTTP API sends mail over normal HTTPS
 * (port 443), so it is not affected by that restriction. The exported
 * functions below (hasMailConfig, sendMail, thinkwaveEmailTemplate) keep the
 * exact same signatures as before, so nothing in otp.service.js or
 * superadmin.controller.js needs to change.
 */

import FormData from "form-data";
import Mailgun from "mailgun.js";
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
      url: env.MAILGUN_BASE_URL || "https://api.mailgun.net",
    })
  : null;

export function hasMailConfig() {
  return Boolean(env.MAILGUN_API_KEY && env.MAILGUN_DOMAIN);
}

export async function sendMail({ to, subject, text, html }) {
  if (!hasMailConfig()) {
    console.warn("[EMAIL NOT SENT] Mailgun is not configured.", { to, subject });
    return { sent: false, reason: "MAILGUN_NOT_CONFIGURED" };
  }

  try {
    const info = await mg.messages.create(env.MAILGUN_DOMAIN, {
      from: env.SMTP_FROM,
      to,
      subject,
      text,
      html,
    });
    return { sent: true, messageId: info?.id };
  } catch (error) {
    console.error("[EMAIL FAILED]", {
      to,
      subject,
      status: error?.status,
      message: error?.message || String(error),
      details: error?.details,
    });
    return {
      sent: false,
      reason: "MAILGUN_SEND_FAILED",
      error: error?.message || String(error),
    };
  }
}

export function thinkwaveEmailTemplate({ eyebrow = "ThinkWAVE", title, intro, bodyHtml = "", actionLabel, actionUrl, footer = "This is an automated message from ThinkWAVE." }) {
  const action = actionLabel && actionUrl ? `<p style="margin:26px 0"><a href="${actionUrl}" style="display:inline-block;background:#2b6cff;color:#fff;text-decoration:none;padding:13px 22px;border-radius:12px;font-weight:800">${actionLabel}</a></p>` : "";
  return `<div style="background:#f4f7fb;padding:28px;font-family:Arial,sans-serif;color:#172033"><div style="max-width:600px;margin:auto;background:#fff;border:1px solid #dce4ef;border-radius:20px;overflow:hidden"><div style="padding:28px 32px;background:linear-gradient(135deg,#17356f,#2b6cff);color:#fff"><div style="font-size:13px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;opacity:.85">${eyebrow}</div><h1 style="margin:9px 0 0;font-size:28px">${title}</h1></div><div style="padding:30px 32px"><p style="font-size:15px;line-height:1.7;margin:0 0 16px">${intro}</p>${bodyHtml}${action}<p style="margin:28px 0 0;color:#6b7280;font-size:12px;line-height:1.6">${footer}</p></div></div></div>`;
}
