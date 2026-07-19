/* FILE GUIDE:
 * server/src/env.js
 * Purpose: Centralized environment variable reader so config stays in one place.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import dotenv from "dotenv";
dotenv.config();

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
  NODE_ENV: process.env.NODE_ENV || "production",
  PORT: Number(process.env.PORT || 4000),
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN || "https://thinkwave-1-xsiy.onrender.com",
  JWT_SECRET: process.env.JWT_SECRET || "c36e5cefa4f23092143ad00114fd90b585651436d70890f20a10412fb18b51d93a3e2625b8b92d908720fa0eac3d6ea8",

  DB_HOST: process.env.DB_HOST || "thinkwave-mysql-thinkwave-mysql.g.aivencloud.com",
DB_PORT: Number(process.env.DB_PORT || 15614),
DB_USER: process.env.DB_USER || "avnadmin",
DB_PASS: process.env.DB_PASS || "AVNS_O-159EKs9_11uTqYJ3j",
DB_NAME: process.env.DB_NAME || "defaultdb",
DB_SSL: String(process.env.DB_SSL || "true").toLowerCase() === "true",
DB_SSL_CA_PATH: process.env.DB_SSL_CA_PATH || "/etc/secrets/ca.pem",

  SMTP_SERVICE: process.env.SMTP_SERVICE || "gmail",
  SMTP_HOST: process.env.SMTP_HOST || "smtp.gmail.com",
  SMTP_PORT: Number(process.env.SMTP_PORT || 587),
  SMTP_USER: process.env.SMTP_USER || "thinkwave.pdm@gmail.com",
  SMTP_PASS: process.env.SMTP_PASS || "ziro npps  ulbk czyz",
  SMTP_FROM: process.env.SMTP_FROM || "ThinkWAVE Team <thinkwave.pdm@gmail.com>",
  OTP_DEV_FALLBACK: String(process.env.OTP_DEV_FALLBACK || "false").toLowerCase() === "true",

  TEACHER_GRACE_SEC: Number(process.env.TEACHER_GRACE_SEC || 30),
};