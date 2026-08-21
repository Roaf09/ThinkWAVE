/* FILE GUIDE:
 * server/src/modules/classes/classes.routes.js
 * Purpose: Project source file. Read the file name and exports first, then follow the imported helpers to understand the flow.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/rbac.js";
import { validateBody } from "../../middleware/validate.js";
import { listClasses, createClass, updateClass, softDeleteClass, restoreClass, getOrCreateClassCode, listClassStudents, removeClassStudent, listClassAsyncResults, exportClassAsyncPdf, exportClassAsyncXlsx, duplicateClass, getClassAsyncAnalytics, getClassAnalytics, getClassStudentAnalytics } from "./classes.controller.js";

export const classesRouter = Router();

const FolderSchema = z.object({
  name: z.string().min(1),
  parentId: z.coerce.number().int().positive().optional().nullable()
});

classesRouter.get("/", requireAuth, requireRole("TEACHER"), asyncHandler(listClasses));
classesRouter.post("/", requireAuth, requireRole("TEACHER"), validateBody(FolderSchema), asyncHandler(createClass));
classesRouter.put("/:id", requireAuth, requireRole("TEACHER"), validateBody(FolderSchema), asyncHandler(updateClass));
classesRouter.delete("/:id", requireAuth, requireRole("TEACHER"), asyncHandler(softDeleteClass));
classesRouter.post("/:id/duplicate", requireAuth, requireRole("TEACHER"), asyncHandler(duplicateClass));
classesRouter.post("/:id/restore", requireAuth, requireRole("TEACHER","ADMIN"), asyncHandler(restoreClass));
classesRouter.get("/:id/code", requireAuth, requireRole("TEACHER"), asyncHandler(getOrCreateClassCode));
classesRouter.get("/:id/students", requireAuth, requireRole("TEACHER"), asyncHandler(listClassStudents));
classesRouter.get("/:id/analytics", requireAuth, requireRole("TEACHER"), asyncHandler(getClassAnalytics));
classesRouter.get("/:id/students/:enrollmentId/analytics", requireAuth, requireRole("TEACHER"), asyncHandler(getClassStudentAnalytics));
classesRouter.delete("/:id/students/:enrollmentId", requireAuth, requireRole("TEACHER"), asyncHandler(removeClassStudent));
classesRouter.get("/:id/async-results", requireAuth, requireRole("TEACHER"), asyncHandler(listClassAsyncResults));
classesRouter.get("/:id/async-results/:quizId/analytics", requireAuth, requireRole("TEACHER"), asyncHandler(getClassAsyncAnalytics));
classesRouter.get("/:id/async-results/:quizId/export/pdf", requireAuth, requireRole("TEACHER"), asyncHandler(exportClassAsyncPdf));
classesRouter.get("/:id/async-results/:quizId/export/xlsx", requireAuth, requireRole("TEACHER"), asyncHandler(exportClassAsyncXlsx));
