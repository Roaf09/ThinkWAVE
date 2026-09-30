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
  connectionLimit: Math.max(1, Math.floor(env.DB_POOL_LIMIT || 10)),
  // Long-run free single-service: never queue forever. Fail fast (once pool
  // + 100 waiting) so one heavy export can't avalanche into minutes of lag.
  queueLimit: 100,
  maxIdle: 10,
  idleTimeout: 60000,
  namedPlaceholders: true,
  decimalNumbers: true,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  connectTimeout: 10000,
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

// The driver option above only tells mysql2 how to *interpret* the digits it
// receives; MySQL itself renders TIMESTAMP columns and NOW() in the session
// time_zone, which defaults to the server's global setting — SYSTEM (+08:00)
// on a Manila developer machine but UTC on Aiven. Reading "12:16" (UTC) as
// "12:16 +08:00" put every session, export and analytics timestamp exactly
// eight hours early in production while local runs looked correct (DEF-17,
// the reported "8:13 PM session shows 04:13 AM"). Pin every pooled connection
// to the same offset the driver assumes so both sides agree everywhere.
pool.on("connection", (connection) => {
  connection.query(`SET time_zone = '${poolConfig.timezone}'`, (error) => {
    if (error) console.error("[db] could not set session time_zone:", error?.message || error);
  });
  // MySQL's default GROUP_CONCAT cap (1024 chars) silently truncates group
  // member lists once classes grow — JSON then fails to parse and groups show
  // empty. Set once per pooled connection: zero per-query cost, covers every
  // present and future GROUP_CONCAT.
  connection.query(`SET SESSION group_concat_max_len = 1048576`, (error) => {
    if (error) console.error("[db] could not set group_concat_max_len:", error?.message || error);
  });
});

// Transient network blips (ECONNRESET / PROTOCOL_CONNECTION_LOST) idle-timeout
// a pooled connection between requests. Retrying once on a fresh connection
// avoids surfacing a 500 for a single dropped socket.
const TRANSIENT_CODES = new Set(["ECONNRESET", "PROTOCOL_CONNECTION_LOST", "PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR", "ETIMEDOUT"]);
const rawQuery = pool.query.bind(pool);
// Queue-full means the query never ran (still waiting), so retrying any
// statement type is safe. Absorbs join/answer bursts on a small pool.
function isQueueFull(err) {
  return err?.code === "ER_QUEUE_LIMIT" || /queue limit reached/i.test(err?.message || "");
}
async function rawQueryRetryingQueueFull(args, { attempts = 3 } = {}) {
  for (let i = 1; ; i += 1) {
    try {
      return await rawQuery(...args);
    } catch (err) {
      if (!isQueueFull(err) || i >= attempts) throw err;
      await new Promise((r) => setTimeout(r, 50 * i));
    }
  }
}
// Slow-query watch: set DB_LOG_SLOW_MS=50 to log any query slower than that
// with its first 120 chars. Off by default (0). Permanent, free, no deps.
const SLOW_MS = Math.max(0, Number(process.env.DB_LOG_SLOW_MS || 0));
pool.query = async (...args) => {
  const started = SLOW_MS > 0 ? Date.now() : 0;
  try {
    try {
      return await rawQueryRetryingQueueFull(args);
    } catch (err) {
      if (err && TRANSIENT_CODES.has(err.code)) {
        await new Promise((r) => setTimeout(r, 150));
        return await rawQueryRetryingQueueFull(args);
      }
      throw err;
    }
  } finally {
    if (SLOW_MS > 0) {
      const ms = Date.now() - started;
      if (ms >= SLOW_MS) {
        const sql = String(args?.[0] || "").replace(/\s+/g, " ").slice(0, 120);
        console.warn(`[db slow ${ms}ms] ${sql}`);
      }
    }
  }
};

// A single autocommit statement chosen as an InnoDB deadlock victim
// (ER_LOCK_DEADLOCK 1213, "try restarting transaction") is rolled back in
// full, so re-issuing it is safe. The seat-claim INSERT ... SELECT in
// joinSession / joinStudentLiveSession takes shared locks on
// session_participants for its COUNT(*) and then an insert lock; under a
// classroom-sized join burst two of those collide constantly and MySQL kills
// one, which used to surface as a 500 and capped a 45-seat session at ~20
// students (DEF-16). Bounded retries with jitter let every claimant through.
export async function queryRetryingDeadlock(sql, params, { attempts = 8 } = {}) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await pool.query(sql, params);
    } catch (err) {
      if (err?.code !== "ER_LOCK_DEADLOCK" || attempt >= attempts) throw err;
      await new Promise((r) => setTimeout(r, 15 + Math.floor(Math.random() * 60 * attempt)));
    }
  }
}