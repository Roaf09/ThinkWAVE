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

// This limiter's default key is the requester's IP (middleware/rateLimit.js),
// and a whole classroom typically joins from behind one school NAT/WiFi
// gateway - they all share this bucket. At max:20 the 21st student from that
// network hit "Too many requests" even though the session's own capacity
// (checked separately below, in joinSession, via max_participants) allows up
// to 45. Raised well above any realistic per-network join burst; the real
// per-session capacity is still enforced by joinSession, this only guards
// against a script hammering the endpoint.
sessionsRouter.post("/join", rateLimit({ windowMs: 10 * 60 * 1000, max: 300 }), optionalAuth, validateBody(JoinSchema), asyncHandler(joinSession));
sessionsRouter.get("/history", requireAuth, requireRole("TEACHER", "GUEST_HOST"), asyncHandler(getTeacherSessionHistory));
sessionsRouter.get("/active", requireAuth, requireRole("TEACHER", "GUEST_HOST"), asyncHandler(listActiveSessions));
sessionsRouter.post("/", requireAuth, requireRole("TEACHER", "GUEST_HOST"), validateBody(CreateSchema), asyncHandler(createSession));

sessionsRouter.get("/:id", requireAuth, requireRole("TEACHER", "GUEST_HOST"), asyncHandler(getSession));
sessionsRouter.get("/:id/state", requireAuth, requireRole("TEACHER", "GUEST_HOST"), asyncHandler(getSessionStateTeacher));
sessionsRouter.get("/:id/full-analytics", requireAuth, requireRole("TEACHER", "GUEST_HOST"), asyncHandler(getSessionFullAnalytics));
sessionsRouter.post("/:id/start", requireAuth, requireRole("TEACHER", "GUEST_HOST"), asyncHandler(startSession));
sessionsRouter.post("/:id/pause", requireAuth, requireRole("TEACHER", "GUEST_HOST"), asyncHandler(pauseSession));
sessionsRouter.post("/:id/end", requireAuth, requireRole("TEACHER", "GUEST_HOST"), asyncHandler(endSession));
sessionsRouter.post("/:id/tab-event", rateLimit({ windowMs: 60 * 1000, max: 10 }), asyncHandler(logTabEvent));
sessionsRouter.get("/:id/tab-monitoring", requireAuth, requireRole("TEACHER"), asyncHandler(getTabMonitoring));
sessionsRouter.delete("/:id", requireAuth, requireRole("TEACHER", "GUEST_HOST"), asyncHandler(deleteTeacherSession));
