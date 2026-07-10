/* FILE GUIDE:
 * server/src/modules/quizzes/quizzes.routes.js
 * Purpose: Project source file. Read the file name and exports first, then follow the imported helpers to understand the flow.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import { Router } from "express";
import { z } from "zod";
import { requireAuth }  from "../../middleware/auth.js";
import { requireRole }  from "../../middleware/rbac.js";
import { validateBody } from "../../middleware/validate.js";
import {
  listQuizzes, createQuiz, getQuiz,
  upsertQuestions, publishQuiz,
  softDeleteQuiz, restoreQuiz,
  updateQuizSettings,
  updateQuizMeta,
  copyQuizToBank,
  duplicateQuiz,
  reuseQuiz,
  assignQuiz,
} from "./quizzes.controller.js";

export const quizzesRouter = Router();

const QuizSchema = z.object({
  title:              z.string().min(1),
  category:           z.enum(["K12","COLLEGE"]),
  templateType:       z.string().min(1),
  classId:            z.coerce.number().optional().nullable(),
  timeLimitSec:       z.coerce.number().int().min(5).max(600).default(30),
  pointsPerQuestion:  z.coerce.number().int().min(1).max(100).default(1),
  randomizeQuestions: z.boolean().default(false),
  shuffleAnswers:     z.boolean().default(false),
  deliveryMode:       z.enum(["SYNCHRONOUS","ASYNCHRONOUS"]).default("SYNCHRONOUS"),
  availableFrom:      z.string().optional().nullable(),
  availableUntil:     z.string().optional().nullable(),
});

const QuestionsSchema = z.object({
  questions: z.array(z.object({
    id:      z.coerce.number().optional(),
    order:   z.coerce.number().int().min(0),
    prompt:  z.string().min(1),
    config:  z.any().optional().nullable(),
    correct: z.any().optional().nullable(),
  })).min(1),
});

const SettingsSchema = z.object({
  timeLimitSec:       z.coerce.number().int().min(5).max(600),
  pointsPerQuestion:  z.coerce.number().int().min(1).max(100),
  randomizeQuestions: z.boolean(),
  shuffleAnswers:     z.boolean(),
});

const MetaSchema = z.object({
  title: z.string().min(1).max(255),
});

const ReuseSchema = z.object({
  classId: z.coerce.number().int().positive(),
});

const AssignSchema = z.object({
  availableFrom: z.string().min(1),
  availableUntil: z.string().min(1),
});

quizzesRouter.get("/",    requireAuth, requireRole("TEACHER"), listQuizzes);
quizzesRouter.post("/",   requireAuth, requireRole("TEACHER"), validateBody(QuizSchema), createQuiz);
quizzesRouter.get("/:id", requireAuth, requireRole("TEACHER"), getQuiz);

quizzesRouter.put("/:id/questions", requireAuth, requireRole("TEACHER"), validateBody(QuestionsSchema), upsertQuestions);
quizzesRouter.put("/:id/settings",  requireAuth, requireRole("TEACHER"), validateBody(SettingsSchema),  updateQuizSettings);
quizzesRouter.put("/:id/meta",      requireAuth, requireRole("TEACHER"), validateBody(MetaSchema),      updateQuizMeta);

quizzesRouter.post("/:id/publish",      requireAuth, requireRole("TEACHER"), publishQuiz);
quizzesRouter.post("/:id/copy-to-bank", requireAuth, requireRole("TEACHER"), copyQuizToBank);
quizzesRouter.post("/:id/duplicate",    requireAuth, requireRole("TEACHER"), duplicateQuiz);
quizzesRouter.post("/:id/assign",       requireAuth, requireRole("TEACHER"), validateBody(AssignSchema), assignQuiz);
quizzesRouter.post("/:id/reuse",        requireAuth, requireRole("TEACHER"), validateBody(ReuseSchema), reuseQuiz);
quizzesRouter.delete("/:id",            requireAuth, requireRole("TEACHER"), softDeleteQuiz);
quizzesRouter.post("/:id/restore",      requireAuth, requireRole("TEACHER","ADMIN"), restoreQuiz);
