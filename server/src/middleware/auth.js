/* FILE GUIDE:
 * server/src/middleware/auth.js
 * Purpose: Project source file. Read the file name and exports first, then follow the imported helpers to understand the flow.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import jwt from "jsonwebtoken";
import { env } from "../env.js";

export function requireAuth(req, res, next) {
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  if (!token) return res.status(401).json({ message: "Missing token" });
  try {
    req.user = jwt.verify(token, env.JWT_SECRET); // { sub, role }
    next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}
