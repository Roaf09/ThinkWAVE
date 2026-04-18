/* FILE GUIDE:
 * server/src/modules/classes/classes.routes.js
 * Purpose: Project source file. Read the file name and exports first, then follow the imported helpers to understand the flow.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/rbac.js";
import { validateBody } from "../../middleware/validate.js";
import { listClasses, createClass, updateClass, softDeleteClass, restoreClass } from "./classes.controller.js";

export const classesRouter = Router();

const FolderSchema = z.object({
  name: z.string().min(1),
  parentId: z.coerce.number().int().positive().optional().nullable()
});

classesRouter.get("/", requireAuth, requireRole("TEACHER"), listClasses);
classesRouter.post("/", requireAuth, requireRole("TEACHER"), validateBody(FolderSchema), createClass);
classesRouter.put("/:id", requireAuth, requireRole("TEACHER"), validateBody(FolderSchema), updateClass);
classesRouter.delete("/:id", requireAuth, requireRole("TEACHER"), softDeleteClass);
classesRouter.post("/:id/restore", requireAuth, requireRole("TEACHER","ADMIN"), restoreClass);
