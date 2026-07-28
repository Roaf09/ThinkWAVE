/* FILE GUIDE:
 * server/src/modules/admin/admin_dashboard.routes.js
 * Purpose: Project source file. Read the file name and exports first, then follow the imported helpers to understand the flow.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

// NEW FILE

import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { z }      from "zod";
import { requireAuth }  from "../../middleware/auth.js";
import { requireRole }  from "../../middleware/rbac.js";
import { validateBody } from "../../middleware/validate.js";
import {
  setupInstitution, getSetupStatus,
  getStats, listTeachers,
  setTeacherActive, deleteTeacher,
  getInvitation, createInvitation, revokeInvitation,
  joinViaInvitation, getInstitutionDetails, getActivity,
} from "./admin_dashboard.controller.js";

export const adminDashboardRouter = Router();

const ADMIN   = [requireAuth, requireRole("ADMIN")];
const TEACHER = [requireAuth, requireRole("TEACHER")];

// institution setup
adminDashboardRouter.get( "/setup-status",       ...ADMIN, asyncHandler(getSetupStatus));
adminDashboardRouter.post("/setup-institution",   ...ADMIN,
  validateBody(z.object({ institutionName: z.string().min(1) })),
  asyncHandler(setupInstitution)
);

// stats/teachers
adminDashboardRouter.get("/stats",                ...ADMIN, asyncHandler(getStats));
adminDashboardRouter.get("/teachers",             ...ADMIN, asyncHandler(listTeachers));
adminDashboardRouter.get("/institution",          ...ADMIN, asyncHandler(getInstitutionDetails));
adminDashboardRouter.get("/activity",             ...ADMIN, asyncHandler(getActivity));
adminDashboardRouter.post("/teachers/:id/active", ...ADMIN, asyncHandler(setTeacherActive));
adminDashboardRouter.delete("/teachers/:id",      ...ADMIN, asyncHandler(deleteTeacher));

// invitation ciodes (admin side)
adminDashboardRouter.get(   "/invitation",        ...ADMIN, asyncHandler(getInvitation));
adminDashboardRouter.post(  "/invitation",        ...ADMIN, asyncHandler(createInvitation));
adminDashboardRouter.delete("/invitation/:id",    ...ADMIN, asyncHandler(revokeInvitation));

// teacher joins via code (teacher side)
adminDashboardRouter.post("/join-institution",    ...TEACHER, asyncHandler(joinViaInvitation));
