import mysql from "mysql2/promise";
import fs from "fs";
import { env } from "./env.js";

const poolConfig = {
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASS,
  database: env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true,
  decimalNumbers: true,
  // Stored DATETIME values (available_from/available_until, etc.) are naive
  // wall-clock timestamps entered in Asia/Manila local time (see
  // toMysqlDateTime in quizzes.controller.js, which stores the picker value
  // as-is, e.g. "2026-08-07 18:01:00" for a teacher who picked 6:01 PM).
  // Without this, mysql2 defaults to interpreting those digits using the
  // Node process's own timezone (UTC on Render), which silently shifts every
  // stored timestamp 8 hours forward when read back as a JS Date — a 6:01 PM
  // assignment start turns into 2:01 AM the next day on the student side.
  timezone: "+08:00",
};

if (env.DB_SSL) {
  let caCert = null;
  if (env.DB_SSL_CA_PATH) {
    try {
      caCert = fs.readFileSync(env.DB_SSL_CA_PATH, "utf8");
    } catch (err) {
      console.error(
        `WARNING: DB_SSL_CA_PATH is set to "${env.DB_SSL_CA_PATH}" but the file could not be read (${err.code || err.message}). ` +
        `Falling back to SSL without a pinned CA. Fix the Render Secret File path to remove this warning.`
      );
    }
  }
  poolConfig.ssl = caCert
    ? { ca: caCert, rejectUnauthorized: true }
    : { rejectUnauthorized: true };
}

export const pool = mysql.createPool(poolConfig);