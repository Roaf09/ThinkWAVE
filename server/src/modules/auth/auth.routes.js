/* FILE GUIDE:
 * server/src/modules/auth/auth.routes.js
 * Purpose: Route map for auth endpoints. Keeps HTTP URLs separate from auth business logic.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import { Router } from "express";
import { z }      from "zod";
import jwt        from "jsonwebtoken";
import crypto     from "crypto";
import { pool }   from "../../db.js";
import { env }    from "../../env.js";
import { validateBody } from "../../middleware/validate.js";
import { register, checkAdminInvitation, verifyOtp, resendOtp, login, me, updateMe, requestPasswordReset, confirmPasswordReset } from "./auth.controller.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/rbac.js";
import { rateLimit } from "../../middleware/rateLimit.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";

export const authRouter = Router();

const strongPassword = z.string()
  .min(8).max(72)
  .regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/).regex(/[^A-Za-z0-9]/);

const RegisterSchema = z.object({
  email:     z.string().email(),
  password:  strongPassword,
  firstName: z.string().min(1),
  lastName:  z.string().min(1),
  role:      z.enum(["STUDENT"]).optional(),
  bootstrapSecret: z.string().min(16).max(256).optional(),
  adminInviteToken: z.string().min(32).max(256).optional(),
});

const VerifySchema = z.object({ email: z.string().email(), code: z.string().length(6).regex(/^\d{6}$/) });
const PasswordResetRequestSchema = z.object({ email: z.string().email() });
const PasswordResetConfirmSchema = z.object({ email: z.string().email(), code: z.string().length(6).regex(/^\d{6}$/), newPassword: strongPassword });
const safeImage = z.string().max(4000000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/).nullable();

const ProfileSchema = z.object({
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  contactNumber: z.string().max(40).nullable().optional(),
  profileImage: safeImage.optional(),
}).refine((value) => Object.keys(value).length > 0, { message: "No profile changes supplied." });

const LoginSchema  = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  loginPortal: z.enum(["TEACHER", "ADMIN", "SUPERADMIN", "STUDENT"]).optional(),
});

authRouter.get("/setup-status", async (_req, res) => {
  try {
    const [[row]] = await pool.query(`SELECT COUNT(*) AS total FROM users WHERE role='SUPERADMIN' AND deleted_at IS NULL`);
    res.json({ isFirstRun: Number(row.total) === 0 });
  } catch { res.status(500).json({ message: "Server error" }); }
});

authRouter.post("/guest-token", rateLimit({ windowMs: 60 * 60 * 1000, max: 10 }), asyncHandler(async (_req, res) => {
  try {
    const rand = crypto.randomBytes(12).toString("hex");
    const guestEmail = `guest_${rand}@thinkwave.guest`;
    const [r] = await pool.query(
      `INSERT INTO users (role, email, password_hash, first_name, last_name,
                          is_verified, is_active, deleted_at)
       VALUES ('TEACHER', :email, 'GUEST_NO_PASSWORD', 'Guest', 'User', 1, 1, NOW())`,
      { email: guestEmail }
    );
    const token = jwt.sign({ sub: r.insertId, role: "GUEST_HOST", ver: 0 }, env.JWT_SECRET, { expiresIn: "2h" });
    res.json({ token });
  } catch (e) { console.error(e); res.status(500).json({ message: "Could not create guest session." }); }
}));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });
const otpLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 6 });

authRouter.get("/admin-invitation/:token", authLimiter, asyncHandler(checkAdminInvitation));
authRouter.post("/register", authLimiter, validateBody(RegisterSchema), asyncHandler(register));
authRouter.post("/verify-otp", otpLimiter, validateBody(VerifySchema), asyncHandler(verifyOtp));
authRouter.post("/resend-otp", otpLimiter, validateBody(PasswordResetRequestSchema), asyncHandler(resendOtp));
authRouter.post("/password/request-reset", otpLimiter, validateBody(PasswordResetRequestSchema), asyncHandler(requestPasswordReset));
authRouter.post("/password/confirm-reset", otpLimiter, validateBody(PasswordResetConfirmSchema), asyncHandler(confirmPasswordReset));
authRouter.post("/login", authLimiter, validateBody(LoginSchema), asyncHandler(login));
authRouter.get( "/me", requireAuth, asyncHandler(me));
authRouter.patch("/me", requireAuth, requireRole("TEACHER", "ADMIN", "SUPERADMIN", "STUDENT"), validateBody(ProfileSchema), asyncHandler(updateMe));
