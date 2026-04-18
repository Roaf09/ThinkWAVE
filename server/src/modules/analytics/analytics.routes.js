/* FILE GUIDE:
 * server/src/modules/analytics/analytics.routes.js
 * Purpose: Project source file. Read the file name and exports first, then follow the imported helpers to understand the flow.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/rbac.js";
import { sessionSummary, sessionQuestionStats, exportSessionPdf, exportSessionXlsx } from "./analytics.controller.js";

export const analyticsRouter = Router();

analyticsRouter.get("/sessions/:sessionId/summary", requireAuth, requireRole("TEACHER"), sessionSummary);
analyticsRouter.get("/sessions/:sessionId/questions", requireAuth, requireRole("TEACHER"), sessionQuestionStats);
analyticsRouter.get("/sessions/:sessionId/export/pdf", requireAuth, requireRole("TEACHER"), exportSessionPdf);
analyticsRouter.get("/sessions/:sessionId/export/xlsx", requireAuth, requireRole("TEACHER"), exportSessionXlsx);
