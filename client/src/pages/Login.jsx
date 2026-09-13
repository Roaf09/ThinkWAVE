/* FILE GUIDE:
 * client/src/pages/Login.jsx
 * Purpose: Shared login screen for teacher/admin variants.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import { useState } from "react";
import PublicHeader from "../components/PublicHeader";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { api, setAuthToken } from "../lib/api";
import { setRole, setToken } from "../lib/auth";
import { consumeLastRoute } from "../lib/lastRoute";
import { useTheme } from "../context/ThemeContext";
import { TwIcon } from "../components/TwUI";
import ThemeIconButton from "../components/ThemeIconButton";

// Auth pilot: colors via @theme tokens + `dark:` variant (see styles/tailwind.css).
// Legacy `tw-auth-*` hooks stay for animations only. `useColors` is gone here —
// do not reintroduce `style={s.*(c)}`. Inputs use trailing `!` so utilities beat
// the unlayered `input` rule in styles/base.css during the transition.

export default function Login({ onLoginSuccess }) {
  const nav = useNavigate();
  const loc = useLocation();
  const [sp] = useSearchParams();
  const isAdminLogin = sp.get("role") === "admin";
  const { dark, toggleTheme } = useTheme();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(false);
  const [exitClass, setExitClass] = useState("");
  const enterClass = (loc.state?.authFrom || sessionStorage.getItem("tw_auth_from")) === "left" ? "from-left" : "from-right";
  function moveAuth(to, direction) {
    const incoming = direction === "left" ? "right" : "left";
    sessionStorage.setItem("tw_auth_from", incoming);
    setExitClass(direction === "left" ? "exit-left" : "exit-right");
    window.setTimeout(() => nav(to, { state: { authFrom: incoming } }), 190);
  }

  async function submit(e) {
    e.preventDefault();
    // No loading guard here used to mean a double-click (or an impatient
    // retry on a slow network) fired parallel /auth/login requests. Each
    // login stamps last_active_at, so the second response carries
    // firstLogin:false and overwrites the first-login flag the dashboard
    // tutorial depends on — silently eating the onboarding tour.
    if (loading) return;
    setLoading(true);
    setError("");
    setNotFound(false);
    try {
      const { data } = await api.post("/auth/login", {
        email,
        password,
        loginPortal: isAdminLogin ? "ADMIN" : "TEACHER",
      });
      setToken(data.token);
      setRole(data.role);
      setAuthToken(data.token);
      if (rememberMe) {
        try { localStorage.setItem("tw_remember_email", email); } catch {}
      }
      if (data.role === "TEACHER") {
        try {
          sessionStorage.setItem("tw_teacher_first_login", data.firstLogin ? "1" : "0");
        } catch {}
      }
      if (onLoginSuccess) onLoginSuccess(data.token, data.role, data);
      if (data.role === "ADMIN") nav(consumeLastRoute(data.role) || "/admin");
      else nav(consumeLastRoute(data.role) || "/teacher");
    } catch (err) {
      const response = err?.response?.data || {};
      if (response.requiresVerification) {
        const mode = response.role === "ADMIN" ? "admin" : "teacher";
        nav(`/verify?mode=${mode}`, { state: { email: email.trim(), loginMode: mode } });
        return;
      }
      const msg = response.message || "Login failed.";
      // The server deliberately returns this same generic message whether
      // the email isn't registered at all or the password is just wrong -
      // that ambiguity is intentional (it stops a login attempt from being
      // used to check which emails have accounts). Treating it as "no
      // account, go register" was flatly wrong for the far more common case
      // of a real account with a mistyped password.
      setError(msg.toLowerCase().includes("invalid credentials") ? "Incorrect email or password. Please try again." : msg);
      setLoading(false);
    }
  }

  return (
    <div
      className="tw-starry-page tw-auth-page min-h-screen flex flex-col bg-auth-page dark:bg-auth-page-dark text-auth-text dark:text-auth-text-dark"
      style={{ fontFamily: "'Segoe UI', system-ui, sans-serif" }}
    >
      <PublicHeader compact hideSuper hideTheme />

      <main className="tw-auth-main flex-1 flex items-start sm:items-center justify-center w-full px-5 py-9">
        <div className={`tw-auth-form-shell ${exitClass || enterClass} my-auto rounded-3xl px-6 sm:px-[44px] pt-10 pb-9 w-full max-w-[460px] shadow-[0_24px_80px_rgba(0,0,0,0.22)] backdrop-blur-[16px] border border-solid bg-auth-card dark:bg-auth-card-dark border-auth-border dark:border-auth-border-dark`}>
          <div className="mb-7 text-center">
            <h1 className="m-[0_0_8px] text-[28px] font-black tracking-[-0.5px] text-auth-text dark:text-auth-text-dark">{isAdminLogin ? "Admin Login" : "Welcome back"}</h1>
            <p className="m-0 text-[13px] leading-[1.6] text-auth-muted dark:text-auth-muted-dark">
              {isAdminLogin
                ? "Sign in to access your institution's admin dashboard."
                : "Teacher login only. Sign in to your ThinkWAVE account."}
            </p>
          </div>

          <form onSubmit={submit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-semibold text-auth-text dark:text-auth-text-dark">Email address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="px-4 py-3 rounded-xl text-sm w-full box-border border bg-auth-input! dark:bg-auth-input-dark! border-auth-input-border! dark:border-auth-input-border-dark! text-auth-text! dark:text-auth-text-dark!"
                />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-semibold text-auth-text dark:text-auth-text-dark">Password</label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="px-4 py-3 pr-12 rounded-xl text-sm w-full box-border border bg-auth-input! dark:bg-auth-input-dark! border-auth-input-border! dark:border-auth-input-border-dark! text-auth-text! dark:text-auth-text-dark!"
                />
                <button type="button" className="absolute right-[14px] top-1/2 -translate-y-1/2 border-0 bg-transparent! text-brand! dark:text-brand-dark! text-[13px] font-bold cursor-pointer p-0" onClick={() => setShowPw((v) => !v)}>
                  <TwIcon name={showPw ? "eyeOff" : "eye"} size={19}/>
                </button>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <label className="inline-flex items-center gap-[7px] leading-none text-[13px] whitespace-nowrap text-auth-muted dark:text-auth-muted-dark">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="m-0 w-[15px] h-[15px] flex-[0_0_auto] accent-brand dark:accent-brand-dark"
                />
                Remember me
              </label>
              <button
                type="button"
                className="border-0 bg-transparent! text-brand! dark:text-brand-dark! text-[13px] font-bold cursor-pointer p-0"
                onClick={() => nav("/forgot-password")}
              >
                Forgot password?
              </button>
            </div>

            {error && (
              <div className={notFound
                ? "rounded-xl p-3 px-[14px] border border-solid shadow-[0_10px_24px_rgba(15,23,42,0.06)] bg-auth-error-bg dark:bg-auth-error-bg-dark border-auth-error-border dark:border-auth-error-border-dark"
                : "rounded-xl p-3 px-[14px] border border-solid shadow-[0_10px_24px_rgba(15,23,42,0.06)] bg-auth-warn-bg dark:bg-auth-warn-bg-dark border-auth-warn-border dark:border-auth-warn-border-dark"}>
                <div className="flex justify-between items-start">
                  <span className={notFound
                    ? "text-sm font-extrabold text-auth-error-title dark:text-auth-error-title-dark"
                    : "text-sm font-extrabold text-auth-warn-title dark:text-auth-warn-title-dark"}>{notFound ? "Account not found" : "Need help?"}</span>
                  <button type="button" className={notFound
                    ? "bg-none border-0 text-[18px] font-bold cursor-pointer p-0 leading-none text-auth-error-title dark:text-auth-error-title-dark"
                    : "bg-none border-0 text-[18px] font-bold cursor-pointer p-0 leading-none text-auth-warn-title dark:text-auth-warn-title-dark"} onClick={() => { setError(""); setNotFound(false); }}>×</button>
                </div>
                <p className={notFound
                  ? "m-[6px_0_0] text-[13px] leading-[1.5] text-auth-error-body dark:text-auth-error-body-dark"
                  : "m-[6px_0_0] text-[13px] leading-[1.5] text-auth-warn-body dark:text-auth-warn-body-dark"}>
                  {notFound
                    ? `No ${isAdminLogin ? "admin " : "teacher "}account was found with that email. Please sign up first.`
                    : error}
                </p>
                {notFound && !isAdminLogin && (
                  <button type="button" onClick={() => moveAuth("/register", "left")} className="inline-block mt-[10px] px-4 py-2 rounded-lg bg-brand dark:bg-brand-dark text-white text-[13px] font-bold no-underline border-0 cursor-pointer">Create account</button>
                )}
                {notFound && isAdminLogin && (
                  <button type="button" className="inline-block mt-[10px] px-4 py-2 rounded-lg bg-brand dark:bg-brand-dark text-white text-[13px] font-bold no-underline border-0 cursor-pointer" onClick={() => nav("/plan")}>
                    View Institution Plan
                  </button>
                )}
              </div>
            )}

            <button type="submit" disabled={loading} className="tw-auth-primary p-[14px] rounded-[14px] border-[3px] border-brand dark:border-brand-dark bg-brand dark:bg-brand-dark text-white text-base font-extrabold cursor-pointer shadow-[0_10px_24px_rgba(43,108,255,0.25)] disabled:opacity-70">
              {loading ? "Logging in…" : isAdminLogin ? "Login as Admin" : "Login as Teacher"}
            </button>
          </form>

          <p className="text-center text-[13px] m-[20px_0_0] text-auth-muted dark:text-auth-muted-dark">
            {isAdminLogin ? (
              <>
                Need a teacher account? <button type="button" onClick={() => moveAuth("/login", "right")} className="text-brand! dark:text-brand-dark! font-bold underline border-0 bg-transparent! cursor-pointer p-0">Go to normal login</button>
              </>
            ) : (
              <>
                Need admin access? <button type="button" onClick={() => moveAuth("/login?role=admin", "left")} className="text-brand! dark:text-brand-dark! font-bold underline border-0 bg-transparent! cursor-pointer p-0">Use admin login</button>
              </>
            )}
          </p>
        </div>
      </main>
      <ThemeIconButton dark={dark} onClick={toggleTheme} className="tw-landing-fixed-theme" size={22} />
    </div>
  );
}
