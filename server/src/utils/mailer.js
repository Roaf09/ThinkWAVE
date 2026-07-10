/* FILE GUIDE:
 * server/src/utils/mailer.js
 * Purpose: Central email helper used by OTP and any future transactional emails.
 * Tip: Keep transport setup here so other modules only worry about content, not SMTP details.
 */

import nodemailer from "nodemailer";
import { env } from "../env.js";

// Render's free-tier web services block outbound traffic on SMTP ports
// 25/465/587 (platform change effective Sept 26, 2025). Raw Gmail SMTP below
// still works for local dev / non-Render hosts, but on Render's free tier it
// will hang until ETIMEDOUT. Brevo's HTTP API sends over HTTPS (443), which
// Render does not block, so we use it whenever BREVO_API_KEY is configured.
function hasBrevoConfig() {
  return Boolean(env.BREVO_API_KEY && env.BREVO_SENDER_EMAIL);
}

function hasSmtpConfig() {
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

async function sendViaBrevo({ to, subject, text, html }) {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "api-key": env.BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: { email: env.BREVO_SENDER_EMAIL, name: env.BREVO_SENDER_NAME },
      to: [{ email: to }],
      subject,
      textContent: text,
      htmlContent: html,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Brevo send failed (${res.status}): ${body}`);
  }
}

export async function sendMail({ to, subject, text, html }) {
  // Preferred path on Render: HTTPS API, not subject to the SMTP port block.
  if (hasBrevoConfig()) {
    await sendViaBrevo({ to, subject, text, html });
    return;
  }

  // Fallback path: raw Gmail SMTP — works locally, will time out on Render free tier.
  if (hasSmtpConfig()) {
    const transporter = buildTransporter();
    await transporter.sendMail({
      from: env.SMTP_FROM,
      to,
      subject,
      text,
      html
    });
    return;
  }

  console.log("[OTP EMAIL NOT SENT - configure BREVO_API_KEY or SMTP in server/.env]", { to, subject, text });
}