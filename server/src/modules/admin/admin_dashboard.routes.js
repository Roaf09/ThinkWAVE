/* FILE GUIDE:
 * server/src/modules/admin/admin_dashboard.routes.js
 * Purpose: Project source file. Read the file name and exports first, then follow the imported helpers to understand the flow.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

// NEW FILE

import { Router } from "express";
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
adminDashboardRouter.get( "/setup-status",       ...ADMIN, getSetupStatus);
adminDashboardRouter.post("/setup-institution",   ...ADMIN,
  validateBody(z.object({ institutionName: z.string().min(1) })),
  setupInstitution
);

// stats/teachers
adminDashboardRouter.get("/stats",                ...ADMIN, getStats);
adminDashboardRouter.get("/teachers",             ...ADMIN, listTeachers);
adminDashboardRouter.get("/institution",          ...ADMIN, getInstitutionDetails);
adminDashboardRouter.get("/activity",             ...ADMIN, getActivity);
adminDashboardRouter.post("/teachers/:id/active", ...ADMIN, setTeacherActive);
adminDashboardRouter.delete("/teachers/:id",      ...ADMIN, deleteTeacher);

// invitation ciodes (admin side)
adminDashboardRouter.get(   "/invitation",        ...ADMIN, getInvitation);
adminDashboardRouter.post(  "/invitation",        ...ADMIN, createInvitation);
adminDashboardRouter.delete("/invitation/:id",    ...ADMIN, revokeInvitation);

// teacher joins via code (teacher side)
adminDashboardRouter.post("/join-institution",    ...TEACHER, joinViaInvitation);
