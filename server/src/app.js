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
import { publicRouter }         from "./modules/public/public.routes.js";
import { metricsMiddleware }     from "./metrics.js";
import { rateLimit }             from "./middleware/rateLimit.js";

export function makeApp() {
  const app = express();

  // Behind Render/Railway/etc. req.ip would otherwise be the proxy's IP,
  // which breaks IP-based rate limiting. Trust the first proxy hop only.
  app.set("trust proxy", 1);

  // CORS allowlist: exact-match against CLIENT_ORIGINS. Requests with no
  // Origin (curl, Postman, same-origin) are allowed through.
  const allowedOrigins = new Set(env.CLIENT_ORIGINS || [env.CLIENT_ORIGIN]);
  const corsOptions = {
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) return callback(null, true);
      return callback(new Error("CORS: origin not allowed"));
    },
    credentials: true,
  };

  // Global middleware: security headers, CORS, JSON body parsing, and request logging.
  app.use(helmet());
  app.use(cors(corsOptions));
  app.use(express.json({ limit: "6mb" }));
  // Verbose request logs in dev only; combined format in production.
  // Never log request bodies here — they may contain passwords/OTPs.
  app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));
  app.use(metricsMiddleware);
  // Health route is useful for quick checks during deployment or local debugging.
  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  // Safety-net limiter for every /api route (authenticated or not), so a
  // route that never got its own tight limiter still can't be hammered.
  // Budgets are per route + IP (endpoint_key), and /api/health is skipped so
  // uptime probes never consume budget. Tight per-route limiters below still
  // apply on top of this one.
  app.use(
    "/api",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 1200,
      skip: (req) => req.path === "/health",
    })
  );

  // Route registration order is kept simple by module. Each router owns one feature area.
  app.use("/api/public",          publicRouter);
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

  // Unknown API route — JSON 404 instead of the default HTML page
  // (avoids leaking stack traces / framework fingerprinting).
  app.use("/api", (_req, res) => res.status(404).json({ message: "Not found" }));

  app.use((err, _req, res, _next) => {
    // CORS rejections from the allowlist above surface here as 403s.
    if (err && err.message === "CORS: origin not allowed") {
      return res.status(403).json({ message: "Origin not allowed" });
    }
    console.error("Unhandled request error:", err);
    if (res.headersSent) return;
    res.status(500).json({ message: "Server error" });
  });
  return app;
}
