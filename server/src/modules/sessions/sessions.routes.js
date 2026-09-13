/* FILE GUIDE:
 * server/src/modules/sessions/sessions.routes.js
 * Purpose: Route map for session endpoints. Use this file first when tracing what URL calls which handler.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { rateLimit } from "../../middleware/rateLimit.js";
import { z } from "zod";
import { optionalAuth, requireAuth } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/rbac.js";
import { validateBody } from "../../middleware/validate.js";
import {
  createSession,
  listActiveSessions,
  getSession,
  startSession,
  pauseSession,
  endSession,
  validateJoinCode,
  joinSession,
  getSessionStateTeacher,
  getTeacherSessionHistory,
  getSessionFullAnalytics,
  logTabEvent,
  getTabMonitoring,
  deleteTeacherSession
} from "./sessions.controller.js";

export const sessionsRouter = Router();

const CreateSchema = z.object({
  quizId: z.coerce.number().int().positive(),
  joinMode: z.enum(["SOLO", "GROUP"]).default("SOLO"),
  classId: z.coerce.number().int().positive().optional().nullable(),
  backgroundKey: z.string().regex(/^background-(?:0[1-9]|1[0-9]|2[0-2])$/).optional().nullable(),
  tutorialDemo: z.boolean().optional().default(false),
});

const JoinSchema = z.object({
  code: z.string().min(4),
  firstName: z.string().min(1),
  lastName: z.string().optional(),
});

const CodeSchema = z.object({
  code: z.string().min(4),
});

// The unload beacon proves ownership of the seat with the same reconnectKey
// the socket handshake uses (nanoid 32). Without it anyone could POST another
// student's sequential participantId and forge tab-outs (false cheating
// flags). Lenient length bounds so old clients fail closed with a clear 400
// instead of silently recording nothing.
const TabEventSchema = z.object({
  participantId: z.coerce.number().int().positive(),
  reconnectKey: z.string().min(20).max(64),
});

// Keyed by IP + join code (not IP alone): a whole classroom typically joins
// from behind one school NAT/WiFi gateway sharing a single public IP, and a
// pure-IP key would let one session's burst eat the budget for every other
// session. The real per-session capacity is still enforced by joinSession via
// max_participants; this only guards against a script hammering the endpoint.
sessionsRouter.post("/join", rateLimit({ windowMs: 10 * 60 * 1000, max: 300, keyGenerator: (req) => `${req.ip || req.socket?.remoteAddress || "unknown"}:${String(req.body?.code || "").toUpperCase().slice(0, 16)}` }), optionalAuth, validateBody(JoinSchema), asyncHandler(joinSession));
sessionsRouter.post("/validate-code", rateLimit({ windowMs: 10 * 60 * 1000, max: 300, keyGenerator: (req) => `${req.ip || req.socket?.remoteAddress || "unknown"}:${String(req.body?.code || "").toUpperCase().slice(0, 16)}` }), optionalAuth, validateBody(CodeSchema), asyncHandler(validateJoinCode));
sessionsRouter.get("/history", requireAuth, requireRole("TEACHER", "GUEST_HOST"), asyncHandler(getTeacherSessionHistory));
sessionsRouter.get("/active", requireAuth, requireRole("TEACHER", "GUEST_HOST"), asyncHandler(listActiveSessions));
sessionsRouter.post("/", requireAuth, requireRole("TEACHER", "GUEST_HOST"), validateBody(CreateSchema), asyncHandler(createSession));

sessionsRouter.get("/:id", requireAuth, requireRole("TEACHER", "GUEST_HOST"), asyncHandler(getSession));
sessionsRouter.get("/:id/state", requireAuth, requireRole("TEACHER", "GUEST_HOST"), asyncHandler(getSessionStateTeacher));
sessionsRouter.get("/:id/full-analytics", requireAuth, requireRole("TEACHER", "GUEST_HOST"), asyncHandler(getSessionFullAnalytics));
sessionsRouter.post("/:id/start", requireAuth, requireRole("TEACHER", "GUEST_HOST"), asyncHandler(startSession));
sessionsRouter.post("/:id/pause", requireAuth, requireRole("TEACHER", "GUEST_HOST"), asyncHandler(pauseSession));
sessionsRouter.post("/:id/end", requireAuth, requireRole("TEACHER", "GUEST_HOST"), asyncHandler(endSession));
// Same per-IP-behind-one-school-NAT consideration as /join above, but
// tab-event beacons carry no session code in the body path — the session id
// is in the URL, so scope the bucket per session instead. StudentPlay.jsx
// sendBeacon()s here when the page is being torn down (the one case a socket
// emit can't survive). Per-participant duplicate protection is the
// client-side throttle, not this limiter - this only guards against a
// script hammering the endpoint.
sessionsRouter.post("/:id/tab-event", rateLimit({ windowMs: 60 * 1000, max: 400, keyGenerator: (req) => `${req.ip || req.socket?.remoteAddress || "unknown"}:session:${String(req.params?.id || "").slice(0, 16)}` }), validateBody(TabEventSchema), asyncHandler(logTabEvent));
sessionsRouter.get("/:id/tab-monitoring", requireAuth, requireRole("TEACHER"), asyncHandler(getTabMonitoring));
sessionsRouter.delete("/:id", requireAuth, requireRole("TEACHER", "GUEST_HOST"), asyncHandler(deleteTeacherSession));
