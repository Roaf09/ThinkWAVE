import { pool } from "../db.js";

// Shared rate limiter backed by MySQL so budgets hold across restarts and
// across multiple server instances (the previous in-memory Map reset on every
// restart and diverged per instance).
//
// Table is created lazily on first use (same pattern as other runtime tables
// in this codebase) and must also exist in schema.sql for fresh installs.
//
// Failure mode is fail-OPEN: if MySQL is unreachable the request is allowed
// through and a throttled warning is logged. Rate limiting must never become
// the thing that takes the site down during a DB blip.
//
// Cost: one INSERT + one SELECT per guarded request. Auth/public/join
// endpoints are low-frequency; the high-frequency socket path keeps its own
// per-socket in-memory throttle in sessions.socket.js (no DB round trip).

let tableReady = false;
let tableFailedAt = 0;
let lastPruneAt = 0;
let lastWarnAt = 0;

async function ensureTable() {
  if (tableReady) return true;
  // Back off for a minute after a failure so a down DB isn't hammered.
  if (Date.now() - tableFailedAt < 60_000) return false;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS rate_limit_hits (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        endpoint_key VARCHAR(190) NOT NULL,
        client_key VARCHAR(190) NOT NULL,
        hit_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_ratelimit_lookup (endpoint_key, client_key, hit_at)
      ) ENGINE=InnoDB`);
    tableReady = true;
    return true;
  } catch {
    tableFailedAt = Date.now();
    return false;
  }
}

function warnThrottled(message) {
  const now = Date.now();
  if (now - lastWarnAt < 60_000) return;
  lastWarnAt = now;
  console.warn(message);
}

function clientKey(req) {
  return String(req.ip || req.socket?.remoteAddress || "unknown").slice(0, 190);
}

export function rateLimit({
  windowMs,
  max,
  key,
  keyGenerator = clientKey,
  skip,
  message = "Too many requests. Please try again later.",
}) {
  const windowSec = Math.max(1, Math.round(windowMs / 1000));
  return async (req, res, next) => {
    try {
      if (skip && skip(req)) return next();
      if (!(await ensureTable())) {
        warnThrottled("[rateLimit] MySQL unavailable — failing open.");
        return next();
      }

      const endpointKey = String(key || `${req.baseUrl || ""}${req.path || ""}`).slice(0, 190);
      const cKey = String(keyGenerator(req) || "unknown").slice(0, 190);

      await pool.query(
        `INSERT INTO rate_limit_hits (endpoint_key, client_key) VALUES (:endpoint, :client)`,
        { endpoint: endpointKey, client: cKey }
      );
      const [[row]] = await pool.query(
        `SELECT COUNT(*) AS hits, MIN(hit_at) AS oldest
         FROM rate_limit_hits
         WHERE endpoint_key = :endpoint
           AND client_key = :client
           AND hit_at > DATE_SUB(NOW(3), INTERVAL :windowSec SECOND)`,
        { endpoint: endpointKey, client: cKey, windowSec }
      );

      // Opportunistic prune, at most once a minute per process. The 2-hour
      // horizon covers the longest configured window (1h) with margin.
      const now = Date.now();
      if (now - lastPruneAt > 60_000) {
        lastPruneAt = now;
        pool.query(`DELETE FROM rate_limit_hits WHERE hit_at < DATE_SUB(NOW(3), INTERVAL 2 HOUR)`).catch(() => {});
      }

      if (Number(row?.hits || 0) > max) {
        const oldestMs = row?.oldest ? new Date(row.oldest).getTime() : now;
        const retrySec = Math.max(1, Math.ceil((oldestMs + windowMs - now) / 1000));
        res.setHeader("Retry-After", retrySec);
        return res.status(429).json({ message });
      }
      return next();
    } catch {
      warnThrottled("[rateLimit] check failed — failing open.");
      return next();
    }
  };
}
