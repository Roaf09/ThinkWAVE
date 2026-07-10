/* FILE GUIDE:
 * server/src/modules/superadmin/superadmin.routes.js
 * Purpose: Project source file. Read the file name and exports first, then follow the imported helpers to understand the flow.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

// NEW FILE

import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/rbac.js";
import {
  getStats, listAccounts, listPending,
  approveAccount, rejectAccount,
  setActive, deleteAccount, getNotifications, getHealth,
} from "./superadmin.controller.js";

export const superadminRouter = Router();

const SA = [requireAuth, requireRole("SUPERADMIN")];

superadminRouter.get("/stats",                   ...SA, getStats);
superadminRouter.get("/accounts",                ...SA, listAccounts);
superadminRouter.get("/pending",                 ...SA, listPending);
superadminRouter.post("/accounts/:id/approve",   ...SA, approveAccount);
superadminRouter.post("/accounts/:id/reject",    ...SA, rejectAccount);
superadminRouter.post("/accounts/:id/active",    ...SA, setActive);
superadminRouter.delete("/accounts/:id",         ...SA, deleteAccount);
superadminRouter.get('/notifications', requireAuth, requireRole('SUPERADMIN'), getNotifications);
// Revision 7: health route is mounted so overview cards do not stay as loading ellipses.
superadminRouter.get('/health', ...SA, getHealth);
