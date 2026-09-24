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
import { tutorialStateRouter }  from "./modules/tutorial_state/tutorial_state.routes.js";
import { publicRouter }         from "./modules/public/public.routes.js";
import { metricsMiddleware }     from "./metrics.js";
import { rateLimit }             from "./middleware/rateLimit.js";

export function makeApp() {
  const app = express();

  // Render fronts every service with Cloudflare, so a request reaches Express
  // through TWO proxies and X-Forwarded-For reads "<client>, <cloudflare edge>".
  // Trusting a single hop made req.ip the Cloudflare edge address, which
  // changes from request to request, so every IP-keyed rate limit was spread
  // across many buckets: on Render the login limiter first fired at the 19th
  // wrong password instead of the 11th, then intermittently (DEF-18). Trusting
  // two hops yields the client address as Cloudflare saw it; a client-supplied
  // X-Forwarded-For prefix is still ignored because only the two rightmost
  // entries are trusted. Locally (no proxy) the socket address is used as before.
  // Override with TRUST_PROXY_HOPS if the deployment ever changes topology.
  app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS || 2));

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

  // Every numeric route parameter (:id, :quizId, :sessionId, :enrollmentId) is
  // read with Number(...) inside the controllers. A non-numeric value such as
  // /analytics/sessions/undefined/summary became NaN, reached MySQL as the
  // literal `NaN` and surfaced as a 500 "Server error" (DEF-03). Reject it here
  // once, for every router, with a 400 instead.
  const NUMERIC_PARAMS = ["id", "quizId", "sessionId", "enrollmentId"];
  const ensureNumericParam = (req, res, next, value, name) => {
    if (/^\d{1,15}$/.test(String(value))) return next();
    return res.status(400).json({ message: `Invalid ${name}.` });
  };
  for (const router of [publicRouter, authRouter, classesRouter, quizzesRouter, sessionsRouter, analyticsRouter, adminRouter, questionBankRouter, superadminRouter, adminDashboardRouter, studentRouter]) {
    for (const name of NUMERIC_PARAMS) router.param(name, ensureNumericParam);
  }

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
  app.use("/api/tutorial-state",  tutorialStateRouter);

  // Unknown API route — JSON 404 instead of the default HTML page
  // (avoids leaking stack traces / framework fingerprinting).
  app.use("/api", (_req, res) => res.status(404).json({ message: "Not found" }));

  app.use((err, _req, res, _next) => {
    // CORS rejections from the allowlist above surface here as 403s.
    if (err && err.message === "CORS: origin not allowed") {
      return res.status(403).json({ message: "Origin not allowed" });
    }
    // body-parser rejections carry their own status (413 payload too large,
    // 400 malformed JSON). They used to fall through to the generic 500 below
    // (DEF-19), so a 6.5 MB profile image or a truncated JSON body looked like
    // a server crash instead of a client-side mistake with a clear message.
    if (err && err.type === "entity.too.large") {
      return res.status(413).json({ message: "The request is too large (limit 6 MB). Please use a smaller image." });
    }
    if (err && err.type === "entity.parse.failed") {
      return res.status(400).json({ message: "Malformed JSON body." });
    }
    console.error("Unhandled request error:", err);
    if (res.headersSent) return;
    res.status(500).json({ message: "Server error" });
  });
  return app;
}
