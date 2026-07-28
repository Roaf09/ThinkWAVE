/* FILE GUIDE:
 * server/src/modules/analytics/analytics.routes.js
 * Purpose: Project source file. Read the file name and exports first, then follow the imported helpers to understand the flow.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/rbac.js";
import { sessionSummary, sessionQuestionStats, exportSessionPdf, exportSessionXlsx } from "./analytics.controller.js";

export const analyticsRouter = Router();

analyticsRouter.get("/sessions/:sessionId/summary", requireAuth, requireRole("TEACHER", "GUEST_HOST"), asyncHandler(sessionSummary));
analyticsRouter.get("/sessions/:sessionId/questions", requireAuth, requireRole("TEACHER", "GUEST_HOST"), asyncHandler(sessionQuestionStats));
analyticsRouter.get("/sessions/:sessionId/export/pdf", requireAuth, requireRole("TEACHER", "GUEST_HOST"), asyncHandler(exportSessionPdf));
analyticsRouter.get("/sessions/:sessionId/export/xlsx", requireAuth, requireRole("TEACHER", "GUEST_HOST"), asyncHandler(exportSessionXlsx));
