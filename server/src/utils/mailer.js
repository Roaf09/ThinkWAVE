/* FILE GUIDE:
 * server/src/utils/mailer.js
 * Purpose: Central email helper used by OTP and future transactional emails.
 * Sends through the Brevo (formerly Sendinblue) HTTP API over HTTPS (port 443)
 * instead of raw SMTP (ports 25/465/587), because Render's free tier blocks
 * outbound SMTP ports but allows normal HTTPS traffic.
 */

import { env } from "../env.js";

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

export function hasMailConfig() {
  return Boolean(env.BREVO_API_KEY && env.BREVO_SENDER_EMAIL);
}

export async function sendMail({ to, subject, text, html }) {
  if (!hasMailConfig()) {
    console.warn("[OTP EMAIL NOT SENT] Brevo is not configured.", { to, subject });
    return { sent: false, reason: "BREVO_NOT_CONFIGURED" };
  }

  const payload = {
    sender: { name: env.BREVO_SENDER_NAME, email: env.BREVO_SENDER_EMAIL },
    to: [{ email: to }],
    subject,
    textContent: text,
    htmlContent: html,
  };

  let response;
  try {
    response = await fetch(BREVO_ENDPOINT, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "api-key": env.BREVO_API_KEY,
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error("[OTP EMAIL FAILED]", {
      to,
      subject,
      reason: "NETWORK_ERROR",
      message: error?.message || String(error),
    });
    return {
      sent: false,
      reason: "BREVO_REQUEST_FAILED",
      error: error?.message || String(error),
    };
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error("[OTP EMAIL FAILED]", {
      to,
      subject,
      status: response.status,
      code: data?.code,
      message: data?.message || `HTTP ${response.status}`,
    });
    return {
      sent: false,
      reason: "BREVO_SEND_FAILED",
      error: data?.message || `HTTP ${response.status}`,
    };
  }

  return { sent: true, messageId: data?.messageId };
}