/* FILE GUIDE:
 * client/src/pages/Register.jsx
 * Purpose: Shared registration screen for teacher/admin variants.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import { useEffect, useMemo, useState } from "react";
import PublicHeader from "../components/PublicHeader";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useTheme } from "../context/ThemeContext";
import { TwIcon } from "../components/TwUI";
import ThemeIconButton from "../components/ThemeIconButton";

// Auth pilot: colors via @theme tokens + `dark:` variant (see styles/tailwind.css).
// Legacy `tw-auth-*` / `tw-pw-*` hooks stay for layout/animations only.
// `useColors` is gone here — do not reintroduce `style={s.*(c)}`. Inputs use
// trailing `!` so utilities beat the unlayered `input` rule in styles/base.css.

function passwordChecks(p) {
  return {
    length: p.length >= 8,
    upper: /[A-Z]/.test(p),
    lower: /[a-z]/.test(p),
    number: /[0-9]/.test(p),
    special: /[^A-Za-z0-9]/.test(p),
  };
}

const onlyLetters = (value) => value.replace(/[^A-Za-zÀ-ÖØ-öø-ÿÑñ\s]/g, "");

const REQ_LABELS = {
  length: "At least 8 characters",
  upper: "At least 1 uppercase letter",
  lower: "At least 1 lowercase letter",
  number: "At least 1 number",
  special: "At least 1 special character",
};

const INPUT = "px-4 py-3 rounded-xl text-sm w-full box-border outline-none transition-[border-color] duration-150 ease-[ease] border bg-auth-input! dark:bg-auth-input-dark! border-auth-input-border! dark:border-auth-input-border-dark! text-auth-text! dark:text-auth-text-dark!";
const LABEL = "text-[13px] font-semibold text-auth-text dark:text-auth-text-dark";

export default function Register() {
  const nav = useNavigate();
  const loc = useLocation();
  const [searchParams] = useSearchParams();
  const adminInviteToken = searchParams.get("adminInvite") || "";
  const isAdminReg = !!adminInviteToken;
  const { dark, toggleTheme } = useTheme();

  const [form, setForm] = useState({
    firstName: "", lastName: "",
    email: "", password: "", confirmPassword: "",
  });
  const [showPw, setShowPw] = useState(false);
  const [showPwHelp, setShowPwHelp] = useState(false);
  const [showConfPw, setShowConfPw] = useState(false);
  const [error, setError] = useState("");
  const [inviteState, setInviteState] = useState(isAdminReg ? "checking" : "valid");
  const [exitClass, setExitClass] = useState("");
  const enterClass = (loc.state?.authFrom || sessionStorage.getItem("tw_auth_from")) === "right" ? "from-right" : "from-left";
  function moveToLogin() {
    setExitClass("exit-right");
    window.setTimeout(() => nav("/login", { state: { authFrom: "left" } }), 210);
  }

  useEffect(() => {
    if (!isAdminReg) return;
    api.get(`/auth/admin-invitation/${encodeURIComponent(adminInviteToken)}`)
      .then(({data}) => { setForm(f=>({...f,email:data.email||f.email})); setInviteState("valid"); })
      .catch((err) => {
        setInviteState("invalid");
        setError(err?.response?.data?.message || "This Admin invitation is invalid, already used, or expired.");
      });
  }, [adminInviteToken, isAdminReg]);

  const checks = useMemo(() => passwordChecks(form.password), [form.password]);
  const isStrong = Object.values(checks).every(Boolean);
  const matches = form.password && form.password === form.confirmPassword;
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!isStrong) return setError("Please use a stronger password.");
    if (!matches) return setError("Passwords do not match.");
    try {
      const payload = {
        email: form.email,
        password: form.password,
        firstName: form.firstName,
        lastName: form.lastName,
      };
      if (isAdminReg) payload.adminInviteToken = adminInviteToken;

      const { data } = await api.post("/auth/register", payload);
      const label = data.role === "ADMIN" ? "Administrator" : "Teacher";
      const mode = data.role === "ADMIN" ? "admin" : "teacher";
      const otpNote = data.emailSent ? "OTP sent to your email." : `OTP email was not sent. ${data.devOtp ? `Use dev OTP: ${data.devOtp}` : (data.deliveryWarning || "Check server email settings.")}`;
      setError(data.resumedVerification ? `✓ Verification resumed for ${label}. ${otpNote}` : `✓ Registered as ${label}. ${otpNote}`);
      setTimeout(() => nav(`/verify?mode=${mode}`, { state: { email: form.email, loginMode: mode } }), data.emailSent ? 850 : 2600);
    } catch (err) {
      setError(err?.response?.data?.message || "Registration failed.");
    }
  }

  const strengthCount = Object.values(checks).filter(Boolean).length;
  const isSuccess = error.startsWith("✓");

  if (isAdminReg && inviteState !== "valid") return (
    <div className="tw-starry-page tw-auth-page min-h-screen flex flex-col bg-auth-page dark:bg-auth-page-dark text-auth-text dark:text-auth-text-dark" style={{ fontFamily: "'Segoe UI',system-ui,sans-serif" }}><PublicHeader compact hideSuper hideTheme/><main className="tw-auth-main flex-1 flex items-start sm:items-center justify-center w-full px-5 py-9"><div className={`tw-auth-form-shell ${exitClass || enterClass} my-auto rounded-[20px] px-6 sm:px-[44px] pt-10 pb-9 w-full max-w-[800px] shadow-[0_24px_80px_rgba(0,0,0,0.32)] backdrop-blur-[16px] border border-solid bg-auth-card dark:bg-auth-card-dark border-auth-border dark:border-auth-border-dark`}><div className="mb-7 text-center"><h1 className="m-[0_0_8px] text-[26px] font-black tracking-[-0.5px] text-auth-text dark:text-auth-text-dark">{inviteState === "checking" ? "Checking invitation" : "Admin invitation unavailable"}</h1><p className="m-0 text-sm leading-[1.6] text-auth-muted dark:text-auth-muted-dark">{inviteState === "checking" ? "Please wait while ThinkWAVE validates this registration link." : error}</p></div></div></main><ThemeIconButton dark={dark} onClick={toggleTheme} className="tw-landing-fixed-theme" size={22} /></div>
  );

  return (
    <div className="tw-starry-page tw-auth-page min-h-screen flex flex-col bg-auth-page dark:bg-auth-page-dark text-auth-text dark:text-auth-text-dark" style={{ fontFamily: "'Segoe UI',system-ui,sans-serif" }}>
      <PublicHeader compact hideSuper hideTheme />

      <main className="tw-auth-main flex-1 flex items-start sm:items-center justify-center w-full px-5 py-9">
        <div className={`tw-auth-form-shell tw-auth-register-shell ${exitClass || enterClass} my-auto rounded-[20px] px-6 sm:px-[44px] pt-10 pb-9 w-full max-w-[800px] shadow-[0_24px_80px_rgba(0,0,0,0.32)] backdrop-blur-[16px] border border-solid bg-auth-card dark:bg-auth-card-dark border-auth-border dark:border-auth-border-dark`}>
          <div className="mb-7 text-center">
            <h1 className="m-[0_0_8px] text-[26px] font-black tracking-[-0.5px] text-auth-text dark:text-auth-text-dark">{isAdminReg ? "Create your admin account" : "Create your teacher account"}</h1>
            <p className="m-0 text-sm leading-[1.6] text-auth-muted dark:text-auth-muted-dark">
              {isAdminReg ? "Register an admin account for your institution." : "Register a teacher account for ThinkWAVE."}
            </p>
          </div>

          <div className="tw-auth-columns flex gap-8 items-start">
          <form onSubmit={submit} className="flex-[1.2] flex flex-col gap-[18px]">
            <div className="flex gap-3">
              <div className="flex flex-col gap-1.5 flex-1">
                <label className={LABEL}>First name</label>
                <input className={INPUT} value={form.firstName} onChange={(e) => set({ firstName: onlyLetters(e.target.value) })} placeholder="Juan" required />
              </div>
              <div className="flex flex-col gap-1.5 flex-1">
                <label className={LABEL}>Last name</label>
                <input className={INPUT} value={form.lastName} onChange={(e) => set({ lastName: onlyLetters(e.target.value) })} placeholder="Dela Cruz" required />
              </div>
            </div>

            <div className="flex flex-col gap-1.5 flex-1">
              <label className={LABEL}>Email address</label>
              <input type="email" className={`${INPUT} ${isAdminReg ? "opacity-80" : "opacity-100"}`} value={form.email} onChange={(e) => set({ email: e.target.value })} placeholder="you@example.com" readOnly={isAdminReg} required />
            </div>

            <div className="flex flex-col gap-1.5 flex-1">
              <div className="flex items-center justify-between">
                <label className={LABEL}>Password</label>
                <button type="button" className="tw-pw-help-btn" aria-label="Password requirements" onClick={() => setShowPwHelp(true)}><TwIcon name="help" size={16} /></button>
              </div>
              <div className="relative">
                <input type={showPw ? "text" : "password"} className={`${INPUT} ${isStrong ? "pr-[76px]" : "pr-12"}`} value={form.password} onChange={(e) => set({ password: e.target.value })} placeholder="••••••••" required />
                {isStrong && <span className="tw-pw-strong-check" aria-label="Password meets all requirements"><TwIcon name="check" size={16} /></span>}
                <button type="button" className="absolute right-[14px] top-1/2 -translate-y-1/2 border-0 bg-transparent! text-brand! dark:text-brand-dark! text-[13px] font-bold cursor-pointer p-0" onClick={() => setShowPw((v) => !v)}><TwIcon name={showPw ? "eyeOff" : "eye"} size={19}/></button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5 flex-1">
              <label className={LABEL}>Confirm password</label>
              <div className="relative">
                <input
                  type={showConfPw ? "text" : "password"}
                  className={`${INPUT} pr-12 ${!form.confirmPassword ? "" : matches ? "border-[#22c55e]! dark:border-[#22c55e]!" : "border-[#ef4444]! dark:border-[#ef4444]!"}`}
                  value={form.confirmPassword}
                  onChange={(e) => set({ confirmPassword: e.target.value })}
                  placeholder="••••••••"
                  required
                />
                <button type="button" className="absolute right-[14px] top-1/2 -translate-y-1/2 border-0 bg-transparent! text-brand! dark:text-brand-dark! text-[13px] font-bold cursor-pointer p-0" onClick={() => setShowConfPw((v) => !v)}><TwIcon name={showConfPw ? "eyeOff" : "eye"} size={19}/></button>
              </div>
              {form.confirmPassword && (
                <span className={`text-xs mt-1 ${matches ? "text-[#22c55e]" : "text-[#f87171]"}`}>
                  {matches ? "✓ Passwords match" : "✗ Passwords do not match"}
                </span>
              )}
            </div>

            {error && (
              <div className={isSuccess
                ? "rounded-[10px] p-3 px-[14px] border border-solid shadow-[0_10px_24px_rgba(15,23,42,0.06)] bg-auth-success-bg dark:bg-auth-success-bg-dark border-auth-success-border dark:border-auth-success-border-dark"
                : "rounded-[10px] p-3 px-[14px] border border-solid shadow-[0_10px_24px_rgba(15,23,42,0.06)] bg-auth-error-bg dark:bg-auth-error-bg-dark border-auth-error-border dark:border-auth-error-border-dark"}>
                <div className="flex justify-between items-start">
                  <span className={isSuccess
                    ? "text-sm font-extrabold text-auth-success-title dark:text-auth-success-title-dark"
                    : "text-sm font-extrabold text-auth-error-title dark:text-auth-error-title-dark"}>
                    {isSuccess ? "Success!" : "Need help?"}
                  </span>
                  {!isSuccess && <button type="button" className="bg-none border-0 text-[18px] font-bold cursor-pointer p-0 leading-none text-auth-error-title dark:text-auth-error-title-dark" onClick={() => setError("")}>×</button>}
                </div>
                <p className={isSuccess
                  ? "m-[6px_0_0] text-[13px] leading-[1.5] text-auth-success-body dark:text-auth-success-body-dark"
                  : "m-[6px_0_0] text-[13px] leading-[1.5] text-auth-error-body dark:text-auth-error-body-dark"}>{error}</p>
              </div>
            )}

            <div className="flex justify-center mt-1">
              <button type="submit" className="tw-auth-primary px-[56px] py-[14px] rounded-xl border-[3px] border-brand dark:border-brand-dark bg-brand dark:bg-brand-dark text-white text-base font-extrabold cursor-pointer shadow-[0_10px_24px_rgba(43,108,255,0.25)]">{isAdminReg ? "Create Admin Account" : "Create Teacher Account"}</button>
            </div>

            {!isAdminReg && <p className="text-center text-[13px] m-0 text-auth-muted dark:text-auth-muted-dark">
              Already have an account? <button type="button" onClick={moveToLogin} className="text-brand! dark:text-brand-dark! font-bold underline underline-offset-2 border-0 bg-transparent! cursor-pointer p-0">Log in here</button>
            </p>}
          </form>

          <div className="tw-password-requirements-panel flex-1 flex flex-col gap-3 self-stretch justify-center rounded-[14px] p-5 border border-solid bg-auth-panel dark:bg-auth-panel-dark border-auth-border dark:border-auth-border-dark">
            <div className="text-[13px] font-bold text-auth-text dark:text-auth-text-dark">Password requirements</div>
            <div className="flex flex-col gap-2.5">
              {Object.entries(REQ_LABELS).map(([key, label]) => (
                <div key={key} className="flex items-center gap-2.5">
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 transition-[background,box-shadow] duration-200 ease-[ease] ${checks[key] ? "bg-[#16a34a] dark:bg-[#22c55e] shadow-[0_0_6px_rgba(34,197,94,0.35)]" : "bg-auth-border dark:bg-auth-border-dark shadow-none"}`} />
                  <span className={`text-[13px] ${checks[key] ? "text-[#166534] dark:text-[#86efac]" : "text-auth-muted dark:text-auth-muted-dark"}`}>{label}</span>
                </div>
              ))}
            </div>
            <div className="h-[5px] rounded-full overflow-hidden mt-1.5 bg-auth-border dark:bg-auth-border-dark">
              <div className={`h-full rounded-full transition-[width,background] duration-300 ease-[ease] ${isStrong ? "bg-[#22c55e]" : strengthCount >= 3 ? "bg-[#f59e0b]" : "bg-[#ef4444]"}`} style={{ width: `${(strengthCount / 5) * 100}%` }} />
            </div>
            <div className={`text-xs text-center mt-1 ${isStrong ? "text-[#22c55e]" : strengthCount >= 3 ? "text-[#f59e0b]" : "text-[#ef4444]"}`}>
              {isStrong ? "Strong ✓" : strengthCount >= 3 ? "Medium — keep going" : "Weak — add more variety"}
            </div>
          </div>
          </div>

          {showPwHelp && <div className="tw-pw-help-backdrop" onClick={() => setShowPwHelp(false)}>
            <div className="tw-pw-help-modal bg-auth-card dark:bg-auth-card-dark border border-solid border-auth-border dark:border-auth-border-dark text-auth-text dark:text-auth-text-dark" onClick={(e) => e.stopPropagation()}>
            <div className="text-[13px] font-bold text-auth-text dark:text-auth-text-dark">Password requirements</div>
            <div className="flex flex-col gap-2.5">
              {Object.entries(REQ_LABELS).map(([key, label]) => (
                <div key={key} className="flex items-center gap-2.5">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${checks[key] ? "bg-[#16a34a] dark:bg-[#22c55e] shadow-[0_0_6px_rgba(34,197,94,0.35)]" : "bg-auth-border dark:bg-auth-border-dark shadow-none"}`} />
                    <span className={`text-[13px] ${checks[key] ? "text-[#166534] dark:text-[#86efac]" : "text-auth-muted dark:text-auth-muted-dark"}`}>{label}</span>
                  </div>
                ))}
              </div>
              <div className="h-[5px] rounded-full overflow-hidden mt-1.5 bg-auth-border dark:bg-auth-border-dark">
                <div className={`h-full rounded-full ${isStrong ? "bg-[#22c55e]" : strengthCount >= 3 ? "bg-[#f59e0b]" : "bg-[#ef4444]"}`} style={{ width: `${(strengthCount / 5) * 100}%` }} />
              </div>
              <div className={`text-xs text-center mt-1 ${isStrong ? "text-[#22c55e]" : strengthCount >= 3 ? "text-[#f59e0b]" : "text-[#ef4444]"}`}>
                {isStrong ? "Strong ✓" : strengthCount >= 3 ? "Medium — keep going" : "Weak — add more variety"}
              </div>
            </div>
          </div>}
        </div>
      </main>
      <ThemeIconButton dark={dark} onClick={toggleTheme} className="tw-landing-fixed-theme" size={22} />
    </div>
  );
}
