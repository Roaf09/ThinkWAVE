/* FILE GUIDE:
 * server/src/modules/tutorial_state/tutorial_state.routes.js
 * Purpose: Route map for per-user tutorial progress sync (desktop <-> mobile).
 */

import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/rbac.js";
import { validateBody } from "../../middleware/validate.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { getTutorialState, putTutorialState } from "./tutorial_state.controller.js";

export const tutorialStateRouter = Router();

const PutSchema = z.object({
  state: z.record(z.any()),
  updatedAt: z.number().int().positive().optional(),
});

tutorialStateRouter.get("/", requireAuth, requireRole("TEACHER", "STUDENT", "GUEST_HOST"), asyncHandler(getTutorialState));
tutorialStateRouter.put("/", requireAuth, requireRole("TEACHER", "STUDENT", "GUEST_HOST"), validateBody(PutSchema), asyncHandler(putTutorialState));
