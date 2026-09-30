/* FILE GUIDE:
 * server/src/utils/ttlCache.js
 * Purpose: Bounded in-memory cache with TTL. Drops oldest + expired entries.
 * Long-run: prevents gradual memory growth when server runs for weeks.
 * Single-service free: no Redis needed. If REDIS_URL is set later, swap this
 * module for a Redis client without changing callers (same get/set/has/delete).
 */
import { LRUCache } from "lru-cache";

export function createTTLCache({ max = 500, ttlMs = 10 * 60 * 1000 } = {}) {
  const cache = new LRUCache({
    max,
    ttl: ttlMs,
    updateAgeOnGet: false,
    allowStale: false,
  });

  return {
    get: (key) => cache.get(key),
    set: (key, value) => cache.set(key, value),
    has: (key) => cache.has(key),
    delete: (key) => cache.delete(key),
    clear: () => cache.clear(),
    keys: () => [...cache.keys()],
    get size() {
      return cache.size;
    },
  };
}
