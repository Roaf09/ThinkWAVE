import jwt from "jsonwebtoken";
import { env } from "../env.js";
import { getCachedAuthUser } from "../utils/authCache.js";

export async function requireAuth(req, res, next) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ message: "Missing token" });
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    const user = await getCachedAuthUser(payload.sub);
    if (!user || !user.is_active || user.deleted_at) {
      return res.status(401).json({ message: "Account is no longer active" });
    }
    // Login blocks PENDING/REJECTED accounts; enforce the same on every
    // request so a rejection/revocation lands within the cache TTL instead of
    // living on until the 8h token expires. Legacy rows have NULL, treated as ok.
    if (user.approval_status === "PENDING") {
      return res.status(403).json({ message: "Your account is awaiting approval from a superadmin." });
    }
    if (user.approval_status === "REJECTED") {
      return res.status(403).json({ message: "Your account registration was rejected." });
    }
    if (user.role !== payload.role) {
      return res.status(401).json({ message: "Account permissions changed. Please log in again." });
    }
    if (Number(payload.ver || 0) !== Number(user.token_version || 0)) {
      return res.status(401).json({ message: "Session expired. Please log in again." });
    }
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}

export async function optionalAuth(req, _res, next) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return next();
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    const user = await getCachedAuthUser(payload.sub);
    if (user && user.is_active && !user.deleted_at && user.role === payload.role && Number(payload.ver || 0) === Number(user.token_version || 0) && user.approval_status !== "PENDING" && user.approval_status !== "REJECTED") {
      req.user = payload;
    }
  } catch {}
  next();
}
