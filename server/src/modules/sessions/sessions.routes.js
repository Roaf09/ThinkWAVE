/* FILE GUIDE:
 * server/src/modules/sessions/sessions.routes.js
 * Purpose: Route map for session endpoints. Use this file first when tracing what URL calls which handler.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
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
});

const JoinSchema = z.object({
  code: z.string().min(4),
  firstName: z.string().min(1),
  lastName: z.string().optional(),
});

sessionsRouter.post("/join", validateBody(JoinSchema), joinSession);
sessionsRouter.get("/history", requireAuth, requireRole("TEACHER"), getTeacherSessionHistory);
sessionsRouter.get("/active", requireAuth, requireRole("TEACHER"), listActiveSessions);
sessionsRouter.post("/", requireAuth, requireRole("TEACHER"), validateBody(CreateSchema), createSession);

sessionsRouter.get("/:id", requireAuth, requireRole("TEACHER"), getSession);
sessionsRouter.get("/:id/state", requireAuth, requireRole("TEACHER"), getSessionStateTeacher);
sessionsRouter.get("/:id/full-analytics", requireAuth, requireRole("TEACHER"), getSessionFullAnalytics);
sessionsRouter.post("/:id/start", requireAuth, requireRole("TEACHER"), startSession);
sessionsRouter.post("/:id/pause", requireAuth, requireRole("TEACHER"), pauseSession);
sessionsRouter.post("/:id/end", requireAuth, requireRole("TEACHER"), endSession);
sessionsRouter.post("/:id/tab-event", logTabEvent);
sessionsRouter.get("/:id/tab-monitoring", requireAuth, requireRole("TEACHER"), getTabMonitoring);
sessionsRouter.delete("/:id", requireAuth, requireRole("TEACHER"), deleteTeacherSession);
