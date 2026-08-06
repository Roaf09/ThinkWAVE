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
};

if (env.DB_SSL) {
  let caCert = null;
  if (env.DB_SSL_CA_PATH) {
    try {
      caCert = fs.readFileSync(env.DB_SSL_CA_PATH, "utf8");
    } catch (err) {
      // Don't let a missing/misconfigured cert file take down the entire
      // process before the HTTP server can bind its port. Log loudly and
      // fall back to SSL without a pinned CA (still encrypted, just not
      // certificate-pinned) so the service can still start and be debugged.
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