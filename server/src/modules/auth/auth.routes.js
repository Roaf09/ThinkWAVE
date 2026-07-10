/* FILE GUIDE:
 * server/src/modules/auth/auth.routes.js
 * Purpose: Route map for auth endpoints. Keeps HTTP URLs separate from auth business logic.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import { Router } from "express";
import { z }      from "zod";
import jwt        from "jsonwebtoken";
import { pool }   from "../../db.js";
import { env }    from "../../env.js";
import { validateBody } from "../../middleware/validate.js";
import { register, verifyOtp, login, me, requestPasswordReset, confirmPasswordReset } from "./auth.controller.js";
import { requireAuth } from "../../middleware/auth.js";

export const authRouter = Router();

const strongPassword = z.string()
  .min(8).max(72)
  .regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/).regex(/[^A-Za-z0-9]/);

const RegisterSchema = z.object({
  email:     z.string().email(),
  password:  strongPassword,
  firstName: z.string().min(1),
  lastName:  z.string().min(1),
  role:      z.enum(["ADMIN","STUDENT"]).optional(),
});

const VerifySchema = z.object({ email: z.string().email(), code: z.string().min(4).max(10) });
const PasswordResetRequestSchema = z.object({ email: z.string().email() });
const PasswordResetConfirmSchema = z.object({ email: z.string().email(), code: z.string().min(4).max(10), newPassword: strongPassword });
const LoginSchema  = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  loginPortal: z.enum(["TEACHER", "ADMIN", "SUPERADMIN", "STUDENT"]).optional(),
});

authRouter.get("/setup-status", async (_req, res) => {
  try {
    const [[row]] = await pool.query(`SELECT COUNT(*) AS total FROM users WHERE deleted_at IS NULL`);
    res.json({ isFirstRun: Number(row.total) === 0 });
  } catch { res.status(500).json({ message: "Server error" }); }
});

authRouter.post("/guest-token", async (_req, res) => {
  try {
    const rand = Math.random().toString(36).slice(2, 14);
    const guestEmail = `guest_${rand}@thinkwave.guest`;
    const [r] = await pool.query(
      `INSERT INTO users (role, email, password_hash, first_name, last_name,
                          is_verified, is_active, deleted_at)
       VALUES ('TEACHER', :email, 'GUEST_NO_PASSWORD', 'Guest', 'User', 1, 1, NOW())`,
      { email: guestEmail }
    );
    const token = jwt.sign({ sub: r.insertId, role: "TEACHER" }, env.JWT_SECRET, { expiresIn: "2h" });
    res.json({ token });
  } catch (e) { console.error(e); res.status(500).json({ message: "Could not create guest session." }); }
});

authRouter.post("/register",   validateBody(RegisterSchema), register);
authRouter.post("/verify-otp", validateBody(VerifySchema),  verifyOtp);
authRouter.post("/password/request-reset", validateBody(PasswordResetRequestSchema), requestPasswordReset);
authRouter.post("/password/confirm-reset", validateBody(PasswordResetConfirmSchema), confirmPasswordReset);
authRouter.post("/login",      validateBody(LoginSchema),   login);
authRouter.get( "/me",         requireAuth,                 me);
