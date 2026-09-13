/* FILE GUIDE:
 * server/src/env.js
 * Purpose: Centralized environment variable reader so config stays in one place.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Always load server/.env regardless of the terminal working directory.
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const JWT_SECRET = process.env.JWT_SECRET || "";

if (!JWT_SECRET || JWT_SECRET === "dev_secret_change_me") {
  if (process.env.NODE_ENV === "production") {
    console.error("FATAL: JWT_SECRET is not set or is using the default value. Refusing to start in production.");
    process.exit(1);
  } else {
    console.warn("WARNING: JWT_SECRET is not set. Using insecure default — do NOT use this in production.");
  }
}

// CLIENT_ORIGIN accepts a comma-separated allowlist so the same server can
// serve local dev and one or more deployed frontends, e.g.
// CLIENT_ORIGIN=http://localhost:5173,https://your-frontend.onrender.com
// The first entry is canonical and is used for absolute links in emails.
const CLIENT_ORIGINS = String(process.env.CLIENT_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((s) => s.trim().replace(/\/$/, ""))
  .filter(Boolean);

export const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: Number(process.env.PORT || 4000),
  CLIENT_ORIGIN: CLIENT_ORIGINS[0] || "http://localhost:5173",
  CLIENT_ORIGINS,
  JWT_SECRET: process.env.JWT_SECRET || "dev_secret_change_me",
  BOOTSTRAP_SECRET: String(process.env.BOOTSTRAP_SECRET || "").trim(),

  // Local-dev defaults only. Production must set DB_HOST/DB_USER/DB_PASS/DB_NAME
  // explicitly — there are intentionally no production host fallbacks here so a
  // missing env var fails closed instead of silently connecting elsewhere.
  DB_HOST: process.env.DB_HOST || "127.0.0.1",
  DB_PORT: Number(process.env.DB_PORT || 3306),
  DB_USER: process.env.DB_USER || "root",
  DB_PASS: process.env.DB_PASS || "",
  DB_NAME: process.env.DB_NAME || "thinkwave",
  DB_SSL: String(process.env.DB_SSL || "false").toLowerCase() === "true",
  DB_SSL_CA_PATH: process.env.DB_SSL_CA_PATH || "",

  MAILGUN_API_KEY: process.env.MAILGUN_API_KEY || "",
  MAILGUN_DOMAIN: process.env.MAILGUN_DOMAIN || "",
  // Only needed for EU Mailgun accounts. Leave unset for the default US region.
  MAILGUN_BASE_URL: process.env.MAILGUN_BASE_URL || "https://api.mailgun.net",
  // Canonical sender. MAILGUN_FROM is preferred; SMTP_FROM is accepted as a
  // legacy fallback so older local .env files keep working.
  MAIL_FROM:
    process.env.MAILGUN_FROM ||
    process.env.SMTP_FROM ||
    "ThinkWAVE <no-reply@thinkwave.local>",

  // NOTE: some local .env files contain the typo TEACHER_GRACE_SEC7777.
  // Accept it as a fallback so those files keep working, but the documented
  // variable is TEACHER_GRACE_SEC.
  TEACHER_GRACE_SEC: Number(
    process.env.TEACHER_GRACE_SEC || process.env.TEACHER_GRACE_SEC7777 || 30
  ),

  // MySQL pool size. A 45-student join burst fans out (REST join + socket
  // connect + roster/state/group broadcasts, each several queries), so the
  // default 10 can serialize joins into multi-second waits. Raise on paid DB
  // tiers; keep <= your provider's max_connections (Aiven free is small).
  DB_POOL_LIMIT: Number(process.env.DB_POOL_LIMIT || 10),

  // Session token lifetime. Accepts jsonwebtoken format ("8h", "30m", "7d").
  // Falls back to 8h on invalid values rather than crashing boot.
  JWT_EXPIRES_IN: /^[1-9]\d*[smhd]$/.test(String(process.env.JWT_EXPIRES_IN || ""))
    ? String(process.env.JWT_EXPIRES_IN)
    : "8h",
};
