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

export const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: Number(process.env.PORT || 4000),
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN || "https://thinkwave-1.onrender.com",
  JWT_SECRET: process.env.JWT_SECRET || "dev_secret_change_me",
  BOOTSTRAP_SECRET: String(process.env.BOOTSTRAP_SECRET || "").trim(),

  DB_HOST: process.env.DB_HOST || "thinkwave-mysql-thinkwave-mysql.g.aivencloud.com",
  DB_PORT: Number(process.env.DB_PORT || 15614),
  DB_USER: process.env.DB_USER || "avnadmin",
  DB_PASS: process.env.DB_PASS || "",
  DB_NAME: process.env.DB_NAME || "defaultdb",
  DB_SSL: String(process.env.DB_SSL || "false").toLowerCase() === "true",
  DB_SSL_CA_PATH: process.env.DB_SSL_CA_PATH || "/etc/secrets/ca.pem",

  MAILGUN_API_KEY: process.env.MAILGUN_API_KEY || "",
  MAILGUN_DOMAIN: process.env.MAILGUN_DOMAIN || "",
  // Only needed for EU Mailgun accounts. Leave unset for the default US region.
  MAILGUN_BASE_URL: process.env.MAILGUN_BASE_URL || "https://api.mailgun.net",
  SMTP_FROM: process.env.SMTP_FROM || process.env.MAILGUN_FROM || "ThinkWAVE <no-reply@thinkwave.local>",
  OTP_DEV_FALLBACK: String(process.env.OTP_DEV_FALLBACK || "false").toLowerCase() === "true",

  TEACHER_GRACE_SEC: Number(process.env.TEACHER_GRACE_SEC || 30),
};
