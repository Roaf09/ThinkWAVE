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
  // as-is). Without this, mysql2 defaults to interpreting them using the
  // Node process's own timezone (UTC on Render), which silently shifts every
  // stored timestamp by 8 hours when read back as a JS Date.
  timezone: "+08:00",
};

if (env.DB_SSL) {
  poolConfig.ssl = env.DB_SSL_CA_PATH
    ? {
        ca: fs.readFileSync(env.DB_SSL_CA_PATH, "utf8"),
        rejectUnauthorized: true,
      }
    : {
        rejectUnauthorized: true,
      };
}

export const pool = mysql.createPool(poolConfig);