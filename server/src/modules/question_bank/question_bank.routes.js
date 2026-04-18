/* FILE GUIDE:
 * server/src/modules/question_bank/question_bank.routes.js
 * Purpose: Project source file. Read the file name and exports first, then follow the imported helpers to understand the flow.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/rbac.js";
import { validateBody } from "../../middleware/validate.js";
import { listBankQuestions, saveToBank, deleteFromBank } from "./question_bank.controller.js";

export const questionBankRouter = Router();

const SaveSchema = z.object({
  templateType: z.string().min(1),
  category:     z.enum(["K12", "COLLEGE"]),
  prompt:       z.string().min(1),
  config:       z.any().optional().nullable(),
  correct:      z.any().optional().nullable(),
});

questionBankRouter.get(  "/",    requireAuth, requireRole("TEACHER"), listBankQuestions);
questionBankRouter.post( "/",    requireAuth, requireRole("TEACHER"), validateBody(SaveSchema), saveToBank);
questionBankRouter.delete("/:id", requireAuth, requireRole("TEACHER"), deleteFromBank);
