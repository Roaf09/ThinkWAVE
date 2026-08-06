import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { rateLimit } from "../../middleware/rateLimit.js";
import { getPublicStats,createInstitutionApplication,createPlanApplication,submitFeedback } from "./public.controller.js";
export const publicRouter=Router();
publicRouter.get("/stats",asyncHandler(getPublicStats));
publicRouter.post("/institution-applications", rateLimit({ windowMs: 60 * 60 * 1000, max: 5 }), asyncHandler(createInstitutionApplication));
publicRouter.post("/plan-applications", rateLimit({ windowMs: 60 * 60 * 1000, max: 5 }), asyncHandler(createPlanApplication));
publicRouter.post("/feedback", rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }), asyncHandler(submitFeedback));
