import jwt from "jsonwebtoken";
import { env } from "../env.js";
import { pool } from "../db.js";

export async function requireAuth(req, res, next) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ message: "Missing token" });
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    const [[user]] = await pool.query(
      `SELECT id, role, is_active, deleted_at, token_version FROM users WHERE id=:id LIMIT 1`,
      { id: payload.sub }
    );
    const guestHost = payload.role === "GUEST_HOST" && user?.role === "TEACHER";
    if (!user || !user.is_active || (!guestHost && user.deleted_at)) {
      return res.status(401).json({ message: "Account is no longer active" });
    }
    if (!guestHost && user.role !== payload.role) {
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
