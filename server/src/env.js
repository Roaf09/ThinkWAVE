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
  PORT: Number(process.env.PORT || 4000),
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  JWT_SECRET: process.env.JWT_SECRET || "dev_secret_change_me",

  DB_HOST: process.env.DB_HOST || "127.0.0.1",
DB_PORT: Number(process.env.DB_PORT || 3306),
DB_USER: process.env.DB_USER || "root",
DB_PASS: process.env.DB_PASS || "",
DB_NAME: process.env.DB_NAME || "defaultdb",
DB_SSL: String(process.env.DB_SSL || "false").toLowerCase() === "true",
DB_SSL_CA_PATH: process.env.DB_SSL_CA_PATH || "",

  SMTP_SERVICE: process.env.SMTP_SERVICE || "",
  SMTP_HOST: process.env.SMTP_HOST || "",
  SMTP_PORT: Number(process.env.SMTP_PORT || 587),
  SMTP_USER: process.env.SMTP_USER || "",
  SMTP_PASS: process.env.SMTP_PASS || "",
  SMTP_FROM: process.env.SMTP_FROM || "ThinkWAVE <no-reply@thinkwave.local>",

  TEACHER_GRACE_SEC: Number(process.env.TEACHER_GRACE_SEC || 30),
};
