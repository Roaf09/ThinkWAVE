import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/rbac.js";
import { getStats,listAccounts,listPending,approveAccount,rejectAccount,setActive,deleteAccount,getNotifications,reviewApplication,getHealth } from "./superadmin.controller.js";
export const superadminRouter=Router(); const SA=[requireAuth,requireRole("SUPERADMIN")];
superadminRouter.get("/stats",...SA,getStats);superadminRouter.get("/accounts",...SA,listAccounts);superadminRouter.get("/pending",...SA,listPending);superadminRouter.post("/accounts/:id/approve",...SA,approveAccount);superadminRouter.post("/accounts/:id/reject",...SA,rejectAccount);superadminRouter.post("/accounts/:id/active",...SA,setActive);superadminRouter.delete("/accounts/:id",...SA,deleteAccount);superadminRouter.get("/notifications",...SA,getNotifications);superadminRouter.post("/applications/:id/review",...SA,reviewApplication);superadminRouter.get("/health",...SA,getHealth);
