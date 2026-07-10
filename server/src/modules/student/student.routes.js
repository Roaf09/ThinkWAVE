/* FILE GUIDE:
 * server/src/modules/student/student.routes.js
 * Purpose: Revision 6 REST routes for student accounts, classes, and async quizzes.
 */

import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/rbac.js";
import { validateBody } from "../../middleware/validate.js";
import { getStudentDashboard, getStudentClasses, joinClass, upsertProfile, getStudentQuiz, submitStudentQuiz } from "./student.controller.js";

export const studentRouter = Router();

const profileSchema = z.object({
  lastName: z.string().min(1).max(100),
  firstName: z.string().min(1).max(100),
  middleInitial: z.string().max(10).optional().nullable(),
  studentId: z.string().min(1).max(80),
});

studentRouter.use(requireAuth, requireRole("STUDENT"));
studentRouter.get("/dashboard", getStudentDashboard);
studentRouter.get("/classes", getStudentClasses);
studentRouter.post("/profile", validateBody(profileSchema), upsertProfile);
studentRouter.post("/classes/join", validateBody(z.object({ classCode: z.string().min(4), profile: profileSchema.optional() })), joinClass);
studentRouter.get("/quizzes/:quizId", getStudentQuiz);
studentRouter.post("/quizzes/:quizId/submit", validateBody(z.object({ answers: z.array(z.any()).default([]) })), submitStudentQuiz);
