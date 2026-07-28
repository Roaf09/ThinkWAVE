/* FILE GUIDE:
 * server/src/modules/student/student.routes.js
 */

import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/rbac.js";
import { validateBody } from "../../middleware/validate.js";
import { getStudentDashboard, getStudentClasses, joinClass, upsertProfile, deleteProfileImage, joinStudentLiveSession, getAssignedStudentAnalytics, getLiveStudentAnalytics, getStudentQuiz, submitStudentQuiz } from "./student.controller.js";

export const studentRouter = Router();

const profileSchema = z.object({
  lastName: z.string().min(1).max(100),
  firstName: z.string().min(1).max(100),
  middleInitial: z.string().max(10).optional().nullable(),
  studentId: z.string().min(1).max(80),
  birthDate: z.string().optional().nullable(),
  profileImage: z.string().max(5000000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/).optional().nullable(),
});

studentRouter.use(requireAuth, requireRole("STUDENT"));
studentRouter.get("/dashboard", asyncHandler(getStudentDashboard));
studentRouter.get("/classes", asyncHandler(getStudentClasses));
studentRouter.post("/profile", validateBody(profileSchema), asyncHandler(upsertProfile));
studentRouter.delete("/profile/image", asyncHandler(deleteProfileImage));
studentRouter.post("/classes/join", validateBody(z.object({ classCode: z.string().min(4), profile: profileSchema.optional() })), asyncHandler(joinClass));
studentRouter.post("/live-sessions/:sessionId/join", asyncHandler(joinStudentLiveSession));
studentRouter.get("/analytics/assigned/:quizId", asyncHandler(getAssignedStudentAnalytics));
studentRouter.get("/analytics/live/:sessionId", asyncHandler(getLiveStudentAnalytics));
studentRouter.get("/quizzes/:quizId", asyncHandler(getStudentQuiz));
studentRouter.post("/quizzes/:quizId/submit", validateBody(z.object({ answers: z.array(z.any()).default([]) })), asyncHandler(submitStudentQuiz));
