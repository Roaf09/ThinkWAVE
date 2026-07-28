const buckets = new Map();

function clientKey(req) {
  return String(req.ip || req.socket?.remoteAddress || "unknown");
}

export function rateLimit({ windowMs, max, keyGenerator = clientKey, message = "Too many requests. Please try again later." }) {
  return (req, res, next) => {
    const now = Date.now();
    const key = `${req.baseUrl}${req.path}:${keyGenerator(req)}`;
    const current = buckets.get(key);
    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    current.count += 1;
    if (current.count > max) {
      res.setHeader("Retry-After", Math.max(1, Math.ceil((current.resetAt - now) / 1000)));
      return res.status(429).json({ message });
    }
    return next();
  };
}
