/* FILE GUIDE:
 * client/src/lib/oauthClient.js
 * Purpose: Shared finish step for social login: swap a one-time code for a
 * JWT, store it exactly like password login does, then route by role.
 */
import { api, setAuthToken } from "./api";
import { setRole, setToken } from "./auth";
import { consumeLastRoute } from "./lastRoute";

export async function finishOAuthLogin(code, { onLoginSuccess, nav }) {
  const { data } = await api.post("/auth/oauth/consume", { code });
  setToken(data.token);
  setRole(data.role);
  setAuthToken(data.token);
  if (onLoginSuccess) onLoginSuccess(data.token, data.role, data);
  if (data.role === "ADMIN") nav(consumeLastRoute(data.role) || "/admin");
  else if (data.role === "STUDENT") nav(consumeLastRoute(data.role) || "/student");
  else nav(consumeLastRoute(data.role) || "/teacher");
  return data;
}

const OAUTH_ERROR_TEXT = {
  cancelled: "Sign-in was cancelled. Please try again.",
  invalid_state: "This sign-in expired. Please try again.",
  exchange_failed: "Could not reach the provider. Please try again.",
  profile_failed: "Could not read your provider profile. Please try again.",
  misconfigured: "Social login is not available right now.",
  need_signup: "No ThinkWAVE account uses that email yet — sign up first, then connect it.",
  link_failed: "Could not finish sign-in. Please try again.",
};

export function oauthErrorText(code) {
  return OAUTH_ERROR_TEXT[code] || "Could not finish sign-in. Please try again.";
}
