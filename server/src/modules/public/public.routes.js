import { Router } from "express";
import { getPublicStats,createInstitutionApplication,submitFeedback } from "./public.controller.js";
export const publicRouter=Router();
publicRouter.get("/stats",getPublicStats);
publicRouter.post("/institution-applications",createInstitutionApplication);
publicRouter.post("/feedback",submitFeedback);
