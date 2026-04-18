/* FILE GUIDE:
 * server/src/modules/users/admin.routes.js
 * Purpose: Project source file. Read the file name and exports first, then follow the imported helpers to understand the flow.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/rbac.js";
import { validateBody } from "../../middleware/validate.js";
import { listUsers, createUser, setActive, softDeleteUser, restoreUser } from "./admin.controller.js";

export const adminRouter = Router();

const strongPassword = z.string()
  .min(8)
  .max(72)
  .regex(/[A-Z]/)
  .regex(/[a-z]/)
  .regex(/[0-9]/)
  .regex(/[^A-Za-z0-9]/);

const CreateUserSchema = z.object({
  email: z.string().email(),
  password: strongPassword,
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.enum(["TEACHER", "ADMIN"]).default("TEACHER")
});

adminRouter.get("/users", requireAuth, requireRole("ADMIN"), listUsers);
adminRouter.post("/users", requireAuth, requireRole("ADMIN"), validateBody(CreateUserSchema), createUser);
adminRouter.post("/users/:id/active", requireAuth, requireRole("ADMIN"), setActive);
adminRouter.delete("/users/:id", requireAuth, requireRole("ADMIN"), softDeleteUser);
adminRouter.post("/users/:id/restore", requireAuth, requireRole("ADMIN"), restoreUser);
