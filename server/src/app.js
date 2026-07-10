/* FILE GUIDE:
 * server/src/app.js
 * Purpose: Express application bootstrap. Registers middleware and mounts every REST route used by the client.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import express from "express";
import cors    from "cors";
import helmet  from "helmet";
import morgan  from "morgan";
import { env } from "./env.js";

import { authRouter }           from "./modules/auth/auth.routes.js";
import { classesRouter }        from "./modules/classes/classes.routes.js";
import { quizzesRouter }        from "./modules/quizzes/quizzes.routes.js";
import { sessionsRouter }       from "./modules/sessions/sessions.routes.js";
import { analyticsRouter }      from "./modules/analytics/analytics.routes.js";
import { adminRouter }          from "./modules/users/admin.routes.js";
import { questionBankRouter }   from "./modules/question_bank/question_bank.routes.js";
import { superadminRouter }     from "./modules/superadmin/superadmin.routes.js";
import { adminDashboardRouter } from "./modules/admin/admin_dashboard.routes.js";
import { studentRouter }        from "./modules/student/student.routes.js";

export function makeApp() {
  const app = express();

  // Global middleware: security headers, CORS, JSON body parsing, and request logging.
  app.use(helmet());
  app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
  app.use(express.json({ limit: "5mb" }));
  app.use(morgan("dev"));
  // Health route is useful for quick checks during deployment or local debugging.
  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  // Route registration order is kept simple by module. Each router owns one feature area.
  app.use("/api/auth",            authRouter);
  app.use("/api/classes",         classesRouter);
  app.use("/api/quizzes",         quizzesRouter);
  app.use("/api/sessions",        sessionsRouter);
  app.use("/api/analytics",       analyticsRouter);
  app.use("/api/admin",           adminRouter);
  app.use("/api/question-bank",   questionBankRouter);
  app.use("/api/superadmin",      superadminRouter);
  app.use("/api/admin-dashboard", adminDashboardRouter);
  app.use("/api/student",         studentRouter);
  return app;
}
