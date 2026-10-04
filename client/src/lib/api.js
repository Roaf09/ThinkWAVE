/* FILE GUIDE:
 * client/src/lib/api.js
 * Purpose: Axios/API helper definitions used by the React pages.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import axios from "axios";

export const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

export const api = axios.create({ baseURL: API_BASE + "/api", timeout: 15000 });

// Timeout gives every loader a ceiling (no more infinite spinner on hung
// /auth/me, /sessions/:id/state, /quizzes/:id). 401 clears stale token and
// sends user to Enter instead of 401-looping in every tab.
// Login/register/verify endpoints return 401 for bad credentials — that is a
// validation result for the form to display, not a stale session. Only
// redirect on 401s from every other endpoint.
const AUTH_ATTEMPT_PATHS = ["/auth/login", "/auth/register", "/auth/verify", "/auth/password", "/auth/otp", "/auth/resend"];
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err?.code === "ECONNABORTED" && !err?.response) {
      err.message = "Request timed out. Please check your connection and retry.";
    }
    if (err?.response?.status === 401) {
      const url = String(err?.config?.url || "");
      const isAuthAttempt = AUTH_ATTEMPT_PATHS.some((p) => url.includes(p));
      // Public pages (e.g. /plan) may probe /auth/me just to prefill a form.
      // They opt out via { skipAuthRedirect: true } so a logged-out visitor
      // stays on the page instead of being bounced to Enter.
      if (err?.config?.skipAuthRedirect) return Promise.reject(err);
      if (!isAuthAttempt) {
        try {
          localStorage.removeItem("qz_token");
          localStorage.removeItem("qz_role");
        } catch {}
        try { delete api.defaults.headers.common.Authorization; } catch {}
        if (typeof window !== "undefined") {
          const path = String(window.location.pathname || "");
          // Never force-redirect away from public pages — just clear the
          // stale token and let the page render its logged-out state.
          const isPublicPage =
            path === "/" ||
            path.startsWith("/enter") ||
            path.startsWith("/plan") ||
            path.startsWith("/login") ||
            path.startsWith("/register") ||
            path.startsWith("/verify") ||
            path.startsWith("/forgot-password") ||
            path.startsWith("/superadmin-login") ||
            path.startsWith("/superadmin-register") ||
            path.startsWith("/play") ||
            path.startsWith("/guest");
          if (!isPublicPage) {
            window.location.href = "/enter?mode=login";
          }
        }
      }
    }
    return Promise.reject(err);
  }
);

// Attach the latest saved token to every request. This prevents protected pages
// from firing their first request before App's mount effect restores Axios state.
api.interceptors.request.use((config) => {
  const savedToken = localStorage.getItem("qz_token") || "";
  if (savedToken) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${savedToken}`;
  }
  return config;
});

export function setAuthToken(token) {
  if (token) api.defaults.headers.common.Authorization = `Bearer ${token}`;
  else delete api.defaults.headers.common.Authorization;
}
