/* FILE GUIDE:
 * client/src/pages/student/StudentAuth.jsx
 */

import { useEffect, useMemo, useRef, useState } from "react";
import PublicHeader from "../../components/PublicHeader";
import { useNavigate, useLocation } from "react-router-dom";
import { api, setAuthToken } from "../../lib/api";
import { setRole, setToken } from "../../lib/auth";
import { consumeLastRoute } from "../../lib/lastRoute";
import { useColors, useTheme } from "../../context/ThemeContext";
import { TwIcon } from "../../components/TwUI";
import ThemeIconButton from "../../components/ThemeIconButton";

const REQ_LABELS = {
  length: "At least 8 characters",
  upper: "At least 1 uppercase letter",
  lower: "At least 1 lowercase letter",
  number: "At least 1 number",
  special: "At least 1 special character",
};

function passwordChecks(pw) {
  return {
    length: String(pw || "").length >= 8,
    upper: /[A-Z]/.test(pw || ""),
    lower: /[a-z]/.test(pw || ""),
    number: /[0-9]/.test(pw || ""),
    special: /[^A-Za-z0-9]/.test(pw || ""),
  };
}

export default function StudentAuth({ onLoginSuccess }) {
  const nav = useNavigate();
  const loc = useLocation();
  const c = useColors();
  const { dark, toggleTheme } = useTheme();
  // Arriving from the header's "Student Sign Up" option should land directly
  // on the register form instead of the default login view.
  const [mode, setMode] = useState(loc.state?.mode === "register" ? "register" : "login");
  const [authMotion, setAuthMotion] = useState(loc.state?.authFrom === "right" ? "from-right" : "from-left");
  // The header's Student Sign Up / Log in options navigate to this same route
  // with a new state — useState above only reads the FIRST state, so without
  // this the view would never switch when already on the page.
  const handledNav = useRef(null);
  useEffect(() => {
    if (!loc.state || handledNav.current === loc.key) return;
    handledNav.current = loc.key;
    const incoming = loc.state.mode;
    if (incoming === "register" || incoming === "login") {
      setMode(incoming);
      setAuthMotion(loc.state.authFrom === "right" ? "from-right" : "from-left");
      setMsg("");
      setNotFound(false);
    }
  }, [loc]);
  function switchMode(next) {
    if (next === mode) return;
    setAuthMotion(next === "register" ? "exit-left" : "exit-right");
    window.setTimeout(() => {
      setMode(next);
      setAuthMotion(next === "register" ? "from-right" : "from-left");
      setMsg("");
      setNotFound(false);
    }, 210);
  }
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", password: "", confirmPassword: "" });
  const [showPw, setShowPw] = useState(false);
  const [showPwHelp, setShowPwHelp] = useState(false);
  const [showConfPw, setShowConfPw] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [msg, setMsg] = useState("");
  const [notFound, setNotFound] = useState(false);

  const checks = useMemo(() => passwordChecks(form.password), [form.password]);
  const isStrong = Object.values(checks).every(Boolean);
  const matches = form.password && form.password === form.confirmPassword;
  const strengthCount = Object.values(checks).filter(Boolean).length;
  const okDot = dark ? "#22c55e" : "#16a34a";
  const okText = dark ? "#86efac" : "#166534";
  const isSuccess = msg.startsWith("✓");

  const patch = (next) => setForm((prev) => ({ ...prev, ...next }));
  const errorTone = notFound
    ? { bg: dark ? "rgba(239,68,68,0.12)" : c.redBg, border: dark ? "rgba(248,113,113,0.35)" : c.redBorder, title: dark ? "#fca5a5" : "#b91c1c", body: dark ? "#fecaca" : "#7f1d1d" }
    : isSuccess
      ? { bg: dark ? "rgba(34,197,94,0.10)" : c.greenBg, border: dark ? "rgba(34,197,94,0.35)" : c.greenBorder, title: dark ? "#86efac" : "#166534", body: dark ? "#bbf7d0" : "#166534" }
      : { bg: dark ? "rgba(245,158,11,0.12)" : "#fff9eb", border: dark ? "rgba(245,158,11,0.35)" : "#f4d28a", title: dark ? "#fcd34d" : "#92400e", body: dark ? "#fde68a" : "#78350f" };

  async function submit(e) {
    e.preventDefault();
    setMsg("");
    setNotFound(false);
    try {
      if (mode === "register") {
        if (!isStrong) return setMsg("Please use a stronger password.");
        if (!matches) return setMsg("Passwords do not match.");
        const { data } = await api.post("/auth/register", { firstName: form.firstName, lastName: form.lastName, email: form.email, password: form.password, role: "STUDENT" });
        const otpNote = data.emailSent ? "OTP sent to your email." : `OTP email was not sent. ${data.devOtp ? `Use dev OTP: ${data.devOtp}` : (data.deliveryWarning || "Check server email settings.")}`;
        setMsg(data.resumedVerification ? `✓ Verification resumed for Student. ${otpNote}` : `✓ Registered as Student. ${otpNote}`);
        setTimeout(() => nav(`/verify?mode=student`, { state: { email: form.email, loginMode: "student" } }), data.emailSent ? 850 : 2600);
        return;
      }
      const { data } = await api.post("/auth/login", { email: form.email, password: form.password, loginPortal: "STUDENT" });
      setToken(data.token);
      setRole(data.role);
      setAuthToken(data.token);
      if (rememberMe) {
        try { localStorage.setItem("tw_remember_email", form.email); } catch {}
      }
      onLoginSuccess?.(data.token, data.role, data);
      nav(consumeLastRoute(data.role) || "/student");
    } catch (err) {
      const response = err?.response?.data || {};
      if (response.requiresVerification) {
        nav(`/verify?mode=student`, { state: { email: form.email.trim(), loginMode: "student" } });
        return;
      }
      const text = response.message || "Student access failed.";
      // Same ambiguous "Invalid credentials" the server returns for both a
      // wrong password and an unregistered email, on purpose (see Login.jsx)
      // - do not claim the account doesn't exist from it.
      setMsg(text.toLowerCase().includes("invalid credentials") ? "Incorrect email or password. Please try again." : text);
    }
  }

  return (
    <div className="tw-starry-page tw-auth-page min-h-screen flex flex-col" style={s.page(c)}>
      <PublicHeader compact hideSuper hideTheme />

      <main className="tw-auth-main flex-1 flex items-start sm:items-center justify-center w-full px-5 py-9">
        <div key={mode} className={`tw-auth-form-shell ${mode !== "login" ? "tw-auth-register-shell max-w-[800px]" : "max-w-[460px]"} ${authMotion} rounded-[20px] px-[44px] pt-10 pb-9 w-full shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur-[16px] border border-solid`} style={mode === "login" ? s.card(c) : s.registerCard(c)}>
          <div className="mb-7 text-center">
            <h1 className="m-[0_0_8px] text-[28px] font-black tracking-[-0.5px]" style={s.title(c)}>{mode === "login" ? "Welcome back" : "Create your student account"}</h1>
            <p className="m-0 text-[13px] leading-[1.6]" style={s.subtitle(c)}>{mode === "login" ? "Student login only. Sign in to your ThinkWAVE account." : "Register a student account for ThinkWAVE."}</p>
          </div>

          {mode === "login" ? (
            <>
              <form onSubmit={submit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] font-semibold" style={s.label(c)}>Email address</label>
                  <input type="email" value={form.email} onChange={(e) => patch({ email: e.target.value })} placeholder="student@gmail.com" required className="px-4 py-3 rounded-xl text-sm w-full box-border" style={s.input(c)} />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] font-semibold" style={s.label(c)}>Password</label>
                  <div className="relative">
                    <input type={showPw ? "text" : "password"} value={form.password} onChange={(e) => patch({ password: e.target.value })} placeholder="••••••••" required className="px-4 py-3 rounded-xl text-sm w-full box-border" style={{ ...s.input(c), paddingRight: 48 }} />
                    <button type="button" className="absolute right-[14px] top-1/2 -translate-y-1/2 border-0 bg-transparent! text-brand! dark:text-brand-dark! text-[13px] font-bold cursor-pointer p-0" onClick={() => setShowPw((v) => !v)}><TwIcon name={showPw ? "eyeOff" : "eye"} size={19}/></button>
                  </div>
                </div>

                <div className="flex justify-between items-center">
                  <label className="inline-flex items-center gap-[7px] leading-none text-[13px] whitespace-nowrap" style={s.rememberLabel(c)}><input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="m-0 w-[15px] h-[15px] flex-[0_0_auto] accent-[#2b6cff]" />Remember me</label>
                  <button type="button" className="border-0 bg-transparent! text-brand! dark:text-brand-dark! text-[13px] font-bold cursor-pointer p-0" onClick={() => nav("/forgot-password")}>Forgot password?</button>
                </div>

                {msg && <FeedbackBox tone={errorTone} notFound={notFound} mode={mode} clear={() => { setMsg(""); setNotFound(false); }} />}
                <button type="submit" className="tw-auth-primary p-[14px] rounded-[14px] border-[3px] border-brand bg-brand text-white text-base font-extrabold cursor-pointer shadow-[0_10px_24px_rgba(43,108,255,0.25)]">Login as Student</button>
              </form>

              <p className="text-center text-[13px] m-[20px_0_0]" style={s.footText(c)}>Need a student account? <button type="button" onClick={() => switchMode("register")} className="border-0 bg-transparent! text-brand! dark:text-brand-dark! font-bold underline cursor-pointer p-0">Register here</button></p>
            </>
          ) : (
            <>
              <div className="tw-auth-columns flex gap-8 items-start">
              <form onSubmit={submit} className="flex-[1.2] flex flex-col gap-[18px]">
                <div className="flex gap-3">
                  <div className="flex flex-col gap-1.5 flex-1"><label className="text-[13px] font-semibold" style={s.label(c)}>First name</label><input className="px-4 py-3 rounded-xl text-sm w-full box-border" style={s.input(c)} value={form.firstName} onChange={(e) => patch({ firstName: e.target.value })} placeholder="Juan" required /></div>
                  <div className="flex flex-col gap-1.5 flex-1"><label className="text-[13px] font-semibold" style={s.label(c)}>Last name</label><input className="px-4 py-3 rounded-xl text-sm w-full box-border" style={s.input(c)} value={form.lastName} onChange={(e) => patch({ lastName: e.target.value })} placeholder="Dela Cruz" required /></div>
                </div>
                <div className="flex flex-col gap-1.5 flex-1"><label className="text-[13px] font-semibold" style={s.label(c)}>Email address</label><input type="email" className="px-4 py-3 rounded-xl text-sm w-full box-border" style={s.input(c)} value={form.email} onChange={(e) => patch({ email: e.target.value })} placeholder="you@example.com" required /></div>
                <div className="flex flex-col gap-1.5 flex-1">
                  <div className="flex items-center justify-between"><label className="text-[13px] font-semibold" style={s.label(c)}>Password</label><button type="button" className="tw-pw-help-btn" aria-label="Password requirements" onClick={() => setShowPwHelp(true)}><TwIcon name="help" size={16} /></button></div>
                  <div className="relative"><input type={showPw ? "text" : "password"} className="px-4 py-3 rounded-xl text-sm w-full box-border" style={{ ...s.input(c), paddingRight: isStrong ? 76 : 48 }} value={form.password} onChange={(e) => patch({ password: e.target.value })} placeholder="••••••••" required />{isStrong && <span className="tw-pw-strong-check" aria-label="Password meets all requirements"><TwIcon name="check" size={16} /></span>}<button type="button" className="absolute right-[14px] top-1/2 -translate-y-1/2 border-0 bg-transparent! text-brand! dark:text-brand-dark! text-[13px] font-bold cursor-pointer p-0" onClick={() => setShowPw((v) => !v)}><TwIcon name={showPw ? "eyeOff" : "eye"} size={19}/></button></div>
                </div>
                <div className="flex flex-col gap-1.5 flex-1"><label className="text-[13px] font-semibold" style={s.label(c)}>Confirm password</label><div className="relative"><input type={showConfPw ? "text" : "password"} className="px-4 py-3 rounded-xl text-sm w-full box-border" style={{ ...s.input(c), paddingRight: 48, borderColor: form.confirmPassword ? (matches ? "#22c55e" : "#ef4444") : c.inputBorder }} value={form.confirmPassword} onChange={(e) => patch({ confirmPassword: e.target.value })} placeholder="••••••••" required /><button type="button" className="absolute right-[14px] top-1/2 -translate-y-1/2 border-0 bg-transparent! text-brand! dark:text-brand-dark! text-[13px] font-bold cursor-pointer p-0" onClick={() => setShowConfPw((v) => !v)}><TwIcon name={showConfPw ? "eyeOff" : "eye"} size={19}/></button></div>{form.confirmPassword && <span className="text-xs mt-1" style={{ color: matches ? "#22c55e" : "#f87171" }}>{matches ? "✓ Passwords match" : "✗ Passwords do not match"}</span>}</div>
                {msg && <FeedbackBox tone={errorTone} notFound={notFound} mode={mode} clear={() => { setMsg(""); setNotFound(false); }} />}
                <button type="submit" className="tw-auth-primary p-[14px] rounded-[14px] border-[3px] border-brand bg-brand text-white text-base font-extrabold cursor-pointer shadow-[0_10px_24px_rgba(43,108,255,0.25)]">Create Student Account</button>
                <p className="text-center text-[13px] m-[20px_0_0]" style={s.footText(c)}>Already have an account? <button type="button" onClick={() => switchMode("login")} className="border-0 bg-transparent! text-brand! dark:text-brand-dark! font-bold underline cursor-pointer p-0">Log in here</button></p>
              </form>
              <div className="tw-password-requirements-panel flex-1 flex flex-col gap-3 self-stretch justify-center rounded-[14px] p-5 border border-solid" style={s.reqPanel(c)}>
                <div className="text-[13px] font-bold" style={s.reqTitle(c)}>Password requirements</div>
                <div className="flex flex-col gap-2.5">
                  {Object.entries(REQ_LABELS).map(([key, label]) => <div key={key} className="flex items-center gap-2.5"><span className="w-2.5 h-2.5 rounded-full shrink-0 transition-[background,box-shadow] duration-200 ease-[ease]" style={{ ...s.reqDot, background: checks[key] ? okDot : c.border, boxShadow: checks[key] ? "0 0 6px rgba(34,197,94,0.35)" : "none" }} /><span className="text-[13px]" style={{ color: checks[key] ? okText : c.textMuted }}>{label}</span></div>)}
                </div>
                <div className="h-[5px] rounded-full overflow-hidden mt-1.5" style={s.strengthBar(c)}><div className="h-full rounded-full transition-[width,background] duration-300 ease-[ease]" style={{ ...s.strengthFill, width: `${(strengthCount / 5) * 100}%`, background: isStrong ? "#22c55e" : strengthCount >= 3 ? "#f59e0b" : "#ef4444" }} /></div>
                <div className="text-xs text-center mt-1 font-bold" style={{ ...s.strengthText(c), color: isStrong ? "#22c55e" : strengthCount >= 3 ? "#f59e0b" : "#ef4444" }}>{isStrong ? "Strong ✓" : strengthCount >= 3 ? "Medium — keep going" : "Weak — add more variety"}</div>
              </div>
              </div>
              {showPwHelp && <div className="tw-pw-help-backdrop" onClick={() => setShowPwHelp(false)}>
                <div className="tw-pw-help-modal" style={{ background: c.cardBg3, border: `1px solid ${c.border}`, color: c.text }} onClick={(e) => e.stopPropagation()}>
                  <div className="text-[13px] font-bold" style={s.reqTitle(c)}>Password requirements</div>
                  <div className="flex flex-col gap-2.5">
                    {Object.entries(REQ_LABELS).map(([key, label]) => <div key={key} className="flex items-center gap-2.5"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ ...s.reqDot, background: checks[key] ? okDot : c.border, boxShadow: checks[key] ? "0 0 6px rgba(34,197,94,0.35)" : "none" }} /><span className="text-[13px]" style={{ color: checks[key] ? okText : c.textMuted }}>{label}</span></div>)}
                  </div>
                  <div className="h-[5px] rounded-full overflow-hidden mt-1.5" style={s.strengthBar(c)}><div className="h-full rounded-full" style={{ ...s.strengthFill, width: `${(strengthCount / 5) * 100}%`, background: isStrong ? "#22c55e" : strengthCount >= 3 ? "#f59e0b" : "#ef4444" }} /></div>
                  <div className="text-xs text-center mt-1 font-bold" style={{ ...s.strengthText(c), color: isStrong ? "#22c55e" : strengthCount >= 3 ? "#f59e0b" : "#ef4444" }}>{isStrong ? "Strong ✓" : strengthCount >= 3 ? "Medium — keep going" : "Weak — add more variety"}</div>
                </div>
              </div>}
            </>
          )}
        </div>
      </main>
      <ThemeIconButton dark={dark} onClick={toggleTheme} className="tw-landing-fixed-theme" size={22} />
    </div>
  );

  function FeedbackBox({ tone, notFound, clear }) {
    return <div className="rounded-xl p-3 px-[14px] border border-solid shadow-[0_10px_24px_rgba(15,23,42,0.06)]" style={s.errorBox(tone)}><div className="flex justify-between items-start"><span className="text-sm font-extrabold" style={s.errorTitle(tone)}>{isSuccess ? "Success!" : notFound ? "Account not found" : "Need help?"}</span>{!isSuccess && <button type="button" className="bg-none border-0 text-[18px] font-bold cursor-pointer p-0 leading-none" style={s.errorClose(tone)} onClick={clear}>×</button>}</div><p className="m-[6px_0_0] text-[13px] leading-[1.5]" style={s.errorMsg(tone)}>{notFound ? "No student account was found with that email. Please sign up first." : msg}</p>{notFound && <button type="button" onClick={() => switchMode("register")} className="inline-block mt-[10px] px-4 py-2 rounded-lg bg-brand text-white text-[13px] font-bold no-underline border-0 cursor-pointer">Create account</button>}</div>;
  }
}

const s = {
  page: (c) => ({ background: c.pageBg, fontFamily: "'Segoe UI', system-ui, sans-serif", color: c.text }),
  glow: { background: "radial-gradient(circle, rgba(43,108,255,0.12) 0%, transparent 70%)" },
  card: (c) => ({ background: c.cardBg3, border: `1px solid ${c.border}` }),
  registerCard: (c) => ({ background: c.cardBg3, border: `1px solid ${c.border}` }),
  title: (c) => ({ color: c.text }),
  subtitle: (c) => ({ color: c.textMuted }),
  label: (c) => ({ color: c.text }),
  input: (c) => ({ border: `1px solid ${c.inputBorder}`, background: c.inputBg, color: c.text }),
  rememberLabel: (c) => ({ color: c.textMuted }),
  errorBox: (tone) => ({ background: tone.bg, border: `1px solid ${tone.border}` }),
  errorTitle: (tone) => ({ color: tone.title }),
  errorClose: (tone) => ({ color: tone.title }),
  errorMsg: (tone) => ({ color: tone.body }),
  footText: (c) => ({ color: c.textMuted }),
  reqPanel: (c) => ({ background: c.cardBg2, border: `1px solid ${c.border}` }),
  reqTitle: (c) => ({ color: c.text }),
  reqDot: {},
  strengthBar: (c) => ({ background: c.border }),
  strengthFill: {},
  strengthText: (c) => ({ color: c.textMuted }),
};
