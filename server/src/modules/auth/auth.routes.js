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
import { register, checkAdminInvitation, verifyOtp, resendOtp, login, me, updateMe, requestPasswordReset, verifyPasswordResetOtp, confirmPasswordReset } from "./auth.controller.js";
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
const PasswordResetVerifySchema = z.object({ email: z.string().email(), code: z.string().length(6).regex(/^\d{6}$/) });
const PasswordResetConfirmSchema = z.object({ resetToken: z.string().min(20), newPassword: strongPassword });
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

const GuestTokenSchema = z.object({
  guestKey: z.string().regex(/^[a-f0-9]{64}$/i),
});

function persistentGuestEmail(guestKey) {
  const digest = crypto.createHmac("sha256", env.JWT_SECRET).update(guestKey).digest("hex").slice(0, 48);
  return `guest_${digest}@thinkwave.guest`;
}

async function findLegacyGuestFromBearer(req) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    if (payload.role !== "GUEST_HOST") return null;
    const [[user]] = await pool.query(
      `SELECT id, role, token_version, last_name
       FROM users
       WHERE id=:id AND role='GUEST_HOST' AND is_active=1 AND deleted_at IS NULL
       LIMIT 1`,
      { id: payload.sub }
    );
    return user || null;
  } catch {
    return null;
  }
}

authRouter.get("/setup-status", async (_req, res) => {
  try {
    const [[row]] = await pool.query(`SELECT COUNT(*) AS total FROM users WHERE role='SUPERADMIN' AND deleted_at IS NULL`);
    res.json({ isFirstRun: Number(row.total) === 0 });
  } catch { res.status(500).json({ message: "Server error" }); }
});

authRouter.post("/guest-token", rateLimit({ windowMs: 60 * 60 * 1000, max: 60, keyGenerator: (req) => `${req.ip || req.socket?.remoteAddress || "unknown"}:${String(req.body?.guestKey || "").slice(0, 16)}` }), validateBody(GuestTokenSchema), asyncHandler(async (req, res) => {
  const guestEmail = persistentGuestEmail(req.body.guestKey);
  let [[guest]] = await pool.query(
    `SELECT id, role, token_version, last_name
     FROM users
     WHERE email=:email AND role='GUEST_HOST'
     LIMIT 1`,
    { email: guestEmail }
  );

  // Preserve quizzes made before Revision 9.1 by binding the currently valid
  // legacy Guest Host token to the browser's new persistent guest key.
  if (!guest) {
    const legacyGuest = await findLegacyGuestFromBearer(req);
    if (legacyGuest) {
      try {
        await pool.query(
          `UPDATE users
           SET email=:email, is_active=1, deleted_at=NULL
           WHERE id=:id AND role='GUEST_HOST'`,
          { email: guestEmail, id: legacyGuest.id }
        );
        guest = legacyGuest;
      } catch (error) {
        if (error?.code !== "ER_DUP_ENTRY") throw error;
      }
    }
  }

  if (!guest) {
    try {
      const guestId = `G-${crypto.createHash("sha256").update(req.body.guestKey).digest("hex").slice(0, 8).toUpperCase()}`;
      const [created] = await pool.query(
        `INSERT INTO users (role, email, password_hash, first_name, last_name,
                            is_verified, is_active, deleted_at)
         VALUES ('GUEST_HOST', :email, 'GUEST_NO_PASSWORD', 'Guest', :guestId, 1, 1, NULL)`,
        { email: guestEmail, guestId }
      );
      [[guest]] = await pool.query(
        `SELECT id, role, token_version, last_name FROM users WHERE id=:id LIMIT 1`,
        { id: created.insertId }
      );
    } catch (error) {
      if (error?.code !== "ER_DUP_ENTRY") throw error;
      [[guest]] = await pool.query(
        `SELECT id, role, token_version, last_name
         FROM users WHERE email=:email AND role='GUEST_HOST' LIMIT 1`,
        { email: guestEmail }
      );
    }
  }

  if (!guest || guest.role !== "GUEST_HOST") {
    return res.status(500).json({ message: "Guest Host role is not enabled in the database. Re-import the current server/schema.sql." });
  }

  await pool.query(
    `UPDATE users SET is_active=1, deleted_at=NULL WHERE id=:id AND role='GUEST_HOST'`,
    { id: guest.id }
  );
  const token = jwt.sign(
    { sub: guest.id, role: "GUEST_HOST", ver: Number(guest.token_version || 0) },
    env.JWT_SECRET,
    { expiresIn: "8h" }
  );
  res.json({ token, guestId: guest.last_name || null });
}));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });
const otpLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 6 });

authRouter.get("/admin-invitation/:token", authLimiter, asyncHandler(checkAdminInvitation));
authRouter.post("/register", authLimiter, validateBody(RegisterSchema), asyncHandler(register));
authRouter.post("/verify-otp", otpLimiter, validateBody(VerifySchema), asyncHandler(verifyOtp));
authRouter.post("/resend-otp", otpLimiter, validateBody(PasswordResetRequestSchema), asyncHandler(resendOtp));
authRouter.post("/password/request-reset", otpLimiter, validateBody(PasswordResetRequestSchema), asyncHandler(requestPasswordReset));
authRouter.post("/password/verify-reset", otpLimiter, validateBody(PasswordResetVerifySchema), asyncHandler(verifyPasswordResetOtp));
authRouter.post("/password/confirm-reset", otpLimiter, validateBody(PasswordResetConfirmSchema), asyncHandler(confirmPasswordReset));
authRouter.post("/login", authLimiter, validateBody(LoginSchema), asyncHandler(login));
authRouter.get( "/me", requireAuth, asyncHandler(me));
authRouter.patch("/me", requireAuth, requireRole("TEACHER", "ADMIN", "SUPERADMIN", "STUDENT"), validateBody(ProfileSchema), asyncHandler(updateMe));
