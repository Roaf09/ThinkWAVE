/* FILE GUIDE:
 * server/src/middleware/rateLimit.js
 * Purpose: In-memory sliding-window rate limiter. Zero DB queries per request.
 *
 * Single-service free: one Node process owns all traffic (localhost XAMPP and
 * one Render service), so a process-local Map is exact. The old MySQL version
 * cost INSERT + SELECT on EVERY request (~100ms on XAMPP) just to protect the DB.
 * If this ever runs multi-instance, swap the store for Redis (same factory API).
 */

// endpointKey -> clientKey -> array of hit timestamps (ms)
const buckets = new Map();
const MAX_BUCKETS = 20000;
let lastSweepAt = 0;

function sweep() {
  const now = Date.now();
  if (now - lastSweepAt < 60_000) return;
  lastSweepAt = now;
  // Drop empty buckets; cap total size (Map keeps insertion order).
  for (const [key, arr] of buckets) {
    if (!arr.length) buckets.delete(key);
  }
  while (buckets.size > MAX_BUCKETS) {
    buckets.delete(buckets.keys().next().value);
  }
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
  const window = Math.max(100, Number(windowMs) || 60000);
  const limit = Math.max(1, Number(max) || 10);
  return async (req, res, next) => {
    try {
      if (skip && skip(req)) return next();

      const endpointKey = String(key || `${req.baseUrl || ""}${req.path || ""}`).slice(0, 190);
      const cKey = String(keyGenerator(req) || "unknown").slice(0, 190);
      const bucketKey = `${endpointKey}\n${cKey}`;
      const now = Date.now();
      const cutoff = now - window;

      let arr = buckets.get(bucketKey);
      if (!arr) {
        arr = [];
        buckets.set(bucketKey, arr);
      } else if (arr.length && arr[0] <= cutoff) {
        // Timestamps only grow, so trim expired from the front.
        let drop = 0;
        while (drop < arr.length && arr[drop] <= cutoff) drop += 1;
        if (drop) arr.splice(0, drop);
      }

      if (arr.length >= limit) {
        const retrySec = Math.max(1, Math.ceil((arr[0] + window - now) / 1000));
        res.setHeader("Retry-After", retrySec);
        return res.status(429).json({ message });
      }
      arr.push(now);
      sweep();
      return next();
    } catch {
      // A limiter must never take the site down: fail open on any bug.
      return next();
    }
  };
}
