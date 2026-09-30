/* FILE GUIDE:
 * server/src/utils/authCache.js
 * Purpose: 60s cache for the per-request auth lookup (role/is_active/token_version).
 * Long-run: auth runs on EVERY request + socket handshake, so it is the
 * hottest pool query. Cache absorbs join bursts; 60s TTL bounds how long a
 * deactivation/role change takes to enforce. Password changes invalidate now.
 */
import { createTTLCache } from "./ttlCache.js";
import { pool } from "../db.js";

const cache = createTTLCache({ max: 2000, ttlMs: 60 * 1000 });

export async function getCachedAuthUser(id) {
  const key = Number(id);
  const hit = cache.get(key);
  if (hit) return hit;
  const [[user]] = await pool.query(
    `SELECT id, role, is_active, deleted_at, token_version, approval_status FROM users WHERE id=:id LIMIT 1`,
    { id: key }
  );
  if (user) cache.set(key, user);
  return user || null;
}

export function invalidateAuthUser(id) {
  cache.delete(Number(id));
}
