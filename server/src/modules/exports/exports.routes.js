/* FILE GUIDE:
 * server/src/modules/exports/exports.routes.js
 * Purpose: Async export job endpoints (opt-in; sync blob downloads unchanged).
 */
import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/rbac.js";
import { createExport, getExport, downloadExport } from "./exports.controller.js";

export const exportsRouter = Router();

exportsRouter.post("/", requireAuth, requireRole("TEACHER", "GUEST_HOST"), asyncHandler(createExport));
exportsRouter.get("/:id", requireAuth, requireRole("TEACHER", "GUEST_HOST"), asyncHandler(getExport));
exportsRouter.get("/:id/download", requireAuth, requireRole("TEACHER", "GUEST_HOST"), asyncHandler(downloadExport));
