/* FILE GUIDE:
 * client/src/pages/SuperadminRegister.jsx
 * Purpose: Project source file. Read the file name and exports first, then follow the imported helpers to understand the flow.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import { useMemo, useState } from "react";
import PublicHeader from "../components/PublicHeader";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useColors, useTheme } from "../context/ThemeContext";
import { TwIcon } from "../components/TwUI";
import ThemeIconButton from "../components/ThemeIconButton";

function passwordChecks(p) {
  return {
    length: p.length >= 8,
    upper: /[A-Z]/.test(p),
    lower: /[a-z]/.test(p),
    number: /[0-9]/.test(p),
    special: /[^A-Za-z0-9]/.test(p),
  };
}

const REQ_LABELS = {
  length: "At least 8 characters",
  upper: "At least 1 uppercase letter",
  lower: "At least 1 lowercase letter",
  number: "At least 1 number",
  special: "At least 1 special character",
};

export default function SuperadminRegister() {
  const nav = useNavigate();
  const { dark, toggleTheme } = useTheme();
  const c = useColors();
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", password: "", confirmPassword: "", bootstrapSecret: "" });
  const [showSecret, setShowSecret] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showConfPw, setShowConfPw] = useState(false);
  const [msg, setMsg] = useState("");

  const checks = useMemo(() => passwordChecks(form.password), [form.password]);
  const isStrong = Object.values(checks).every(Boolean);
  const matches = form.password && form.password === form.confirmPassword;
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  async function submit(e) {
    e.preventDefault();
    setMsg("");
    if (!isStrong) return setMsg("Please use a stronger password.");
    if (!matches) return setMsg("Passwords do not match.");
    try {
      const { data } = await api.post("/auth/register", {
        email: form.email,
        password: form.password,
        firstName: form.firstName,
        lastName: form.lastName,
        bootstrapSecret: form.bootstrapSecret,
      });
      const otpNote = data.emailSent ? "OTP sent to your email." : `OTP email was not sent. ${data.devOtp ? `Use dev OTP: ${data.devOtp}` : (data.deliveryWarning || "Check server email settings.")}`;
      setMsg(`Account created! ${otpNote} Redirecting…`);
      setTimeout(() => nav("/verify?mode=superadmin", { state: { email: form.email, loginMode: "superadmin" } }), data.emailSent ? 900 : 2600);
    } catch (err) {
      setMsg(err?.response?.data?.message || "Registration failed.");
    }
  }

  return (
    <div className="tw-starry-page tw-auth-page min-h-screen flex flex-col" style={s.page(c)}>
      <PublicHeader compact setupComplete={false} hideTheme />

      <main className="tw-auth-main flex-1 flex items-center justify-center w-full px-5 py-9">
        <div className="tw-auth-form-shell my-auto rounded-[20px] px-[44px] pt-10 pb-9 w-[min(100%,760px)] shadow-[0_24px_80px_rgba(0,0,0,0.35)]" style={s.card(c)}>
          <div className="mb-7 text-center">
            <h1 className="m-[0_0_8px] text-[26px] font-black tracking-[-0.5px]" style={s.title(c)}>Welcome to ThinkWAVE!</h1>
            <p className="m-0 text-sm leading-[1.6]" style={s.subtitle(c)}>
              This account will be set as the <span className="text-brand font-bold">Super Administrator</span>.
            </p>
          </div>

          <div className="tw-auth-columns flex gap-8 items-start">
            <form onSubmit={submit} className="flex-[1.2] flex flex-col gap-4">
              <div className="flex gap-3">
                <div className="flex flex-col gap-[5px] flex-1">
                  <label className="text-[13px] font-semibold" style={s.label(c)}>First name</label>
                  <input className="px-[13px] py-[10px] rounded-[11px] text-sm w-full box-border outline-none" style={s.input(c)} value={form.firstName} onChange={(e) => set({ firstName: e.target.value })} placeholder="Juan" required />
                </div>
                <div className="flex flex-col gap-[5px] flex-1">
                  <label className="text-[13px] font-semibold" style={s.label(c)}>Last name</label>
                  <input className="px-[13px] py-[10px] rounded-[11px] text-sm w-full box-border outline-none" style={s.input(c)} value={form.lastName} onChange={(e) => set({ lastName: e.target.value })} placeholder="Dela Cruz" required />
                </div>
              </div>

              <div className="flex flex-col gap-[5px] flex-1">
                <label className="text-[13px] font-semibold" style={s.label(c)}>Email address</label>
                <input type="email" className="px-[13px] py-[10px] rounded-[11px] text-sm w-full box-border outline-none" style={s.input(c)} value={form.email} onChange={(e) => set({ email: e.target.value })} placeholder="you@example.com" required />
              </div>

              <div className="flex flex-col gap-[5px] flex-1">
                <label className="text-[13px] font-semibold" style={s.label(c)}>Secret Password</label>
                <div className="relative">
                  <input type={showSecret ? "text" : "password"} className="px-[13px] py-[10px] rounded-[11px] text-sm w-full box-border outline-none" style={{ ...s.input(c), paddingRight: 48 }} value={form.bootstrapSecret} onChange={(e) => set({ bootstrapSecret: e.target.value })} placeholder="Enter secret password" required />
                  <button type="button" className="absolute right-[14px] top-1/2 -translate-y-1/2 border-0 bg-transparent! text-brand! dark:text-brand-dark! text-[13px] font-bold cursor-pointer p-0" onClick={() => setShowSecret((v) => !v)}><TwIcon name={showSecret ? "eyeOff" : "eye"} size={19}/></button>
                </div>
              </div>

              <div className="flex flex-col gap-[5px] flex-1">
                <label className="text-[13px] font-semibold" style={s.label(c)}>Password</label>
                <div className="relative">
                  <input type={showPw ? "text" : "password"} className="px-[13px] py-[10px] rounded-[11px] text-sm w-full box-border outline-none" style={{ ...s.input(c), paddingRight: 48 }} value={form.password} onChange={(e) => set({ password: e.target.value })} placeholder="••••••••" required />
                  <button type="button" className="absolute right-[14px] top-1/2 -translate-y-1/2 border-0 bg-transparent! text-brand! dark:text-brand-dark! text-[13px] font-bold cursor-pointer p-0" onClick={() => setShowPw((v) => !v)}><TwIcon name={showPw ? "eyeOff" : "eye"} size={19}/></button>
                </div>
              </div>

              <div className="flex flex-col gap-[5px] flex-1">
                <label className="text-[13px] font-semibold" style={s.label(c)}>Confirm password</label>
                <div className="relative">
                  <input type={showConfPw ? "text" : "password"} className="px-[13px] py-[10px] rounded-[11px] text-sm w-full box-border outline-none" style={{ ...s.input(c), paddingRight: 48 }} value={form.confirmPassword} onChange={(e) => set({ confirmPassword: e.target.value })} placeholder="••••••••" required />
                  <button type="button" className="absolute right-[14px] top-1/2 -translate-y-1/2 border-0 bg-transparent! text-brand! dark:text-brand-dark! text-[13px] font-bold cursor-pointer p-0" onClick={() => setShowConfPw((v) => !v)}><TwIcon name={showConfPw ? "eyeOff" : "eye"} size={19}/></button>
                </div>
                {form.confirmPassword && (
                  <span className="text-xs mt-1" style={{ color: matches ? (dark ? "#86efac" : "#166534") : (dark ? "#fca5a5" : "#b91c1c") }}>
                    {matches ? "✓ Passwords match" : "✗ Passwords do not match"}
                  </span>
                )}
              </div>

              {msg && <p role="alert" className="text-[13px] font-[650] leading-[1.6] p-[10px_12px] m-0" style={s.msgBox(msg.startsWith("Account created!"), dark)}>{msg}</p>}

              <div className="flex justify-center mt-0.5">
                <button type="submit" className="px-7 py-[13px] rounded-full border-0 text-sm font-extrabold cursor-pointer shadow-[0_8px_22px_rgba(37,99,235,0.35)] bg-[linear-gradient(135deg,#1d4ed8,#2563eb)] text-white" style={s.submitBtn}>Create Superadmin Account</button>
              </div>

            </form>

            <div className="flex-1 min-w-[240px] rounded-2xl px-[18px] pt-[18px] pb-4 flex flex-col gap-3" style={s.reqPanel(c)}>
              <div className="text-sm font-extrabold" style={s.reqTitle(c)}>Password requirements</div>
              <div className="flex flex-col gap-2.5">
                {Object.entries(REQ_LABELS).map(([key, label]) => (
                  <div key={key} className="flex items-center gap-2.5">
                    <span className="w-[9px] h-[9px] rounded-full shrink-0" style={{ ...s.reqDot, background: checks[key] ? "#22c55e" : c.border }} />
                    <span className="text-[13px]" style={{ color: checks[key] ? (dark ? "#86efac" : "#166534") : c.textMuted }}>{label}</span>
                  </div>
                ))}
              </div>
              <div className="w-full h-2 rounded-full overflow-hidden mt-1" style={s.strengthBar(c)}>
                <div className="h-full rounded-full" style={{ ...s.strengthFill, width: `${(Object.values(checks).filter(Boolean).length / 5) * 100}%`, background: isStrong ? "#22c55e" : Object.values(checks).filter(Boolean).length >= 3 ? "#f59e0b" : "#ef4444" }} />
              </div>
              <div className="text-xs text-center" style={{ ...s.strengthText(c), color: isStrong ? "#22c55e" : Object.values(checks).filter(Boolean).length >= 3 ? "#f59e0b" : "#ef4444" }}>
                {isStrong ? "Strong ✓" : Object.values(checks).filter(Boolean).length >= 3 ? "Medium — keep going" : "Weak — add more variety"}
              </div>
            </div>
          </div>
        </div>
      </main>
      <ThemeIconButton dark={dark} onClick={toggleTheme} className="tw-landing-fixed-theme" size={22} />
    </div>
  );
}

const s = {
  page: (c) => ({ background: c.pageBg, fontFamily: "'Segoe UI', system-ui, sans-serif", color: c.text }),
  glow: { background: "radial-gradient(circle, rgba(43,108,255,0.12) 0%, transparent 70%)" },
  card: (c) => ({ background: c.cardBg3, border: `1px solid ${c.border}` }),
  title: (c) => ({ color: c.text }),
  subtitle: (c) => ({ color: c.textMuted }),
  label: (c) => ({ color: c.text }),
  input: (c) => ({ border: `1px solid ${c.inputBorder}`, background: c.inputBg, color: c.text }),
  msgBox: (success, dark) => ({
    background: success ? (dark ? "rgba(34,197,94,0.12)" : "#f0fdf4") : (dark ? "rgba(127,29,29,0.38)" : "#fef2f2"),
    border: `1px solid ${success ? (dark ? "rgba(74,222,128,0.45)" : "#86efac") : (dark ? "rgba(248,113,113,0.62)" : "#fca5a5")}`,
    color: success ? (dark ? "#bbf7d0" : "#166534") : (dark ? "#fecaca" : "#991b1b"),
  }),
  reqPanel: (c) => ({ background: c.cardBg2, border: `1px solid ${c.border}` }),
  reqTitle: (c) => ({ color: c.text }),
  reqDot: {},
  strengthBar: (c) => ({ background: c.border }),
  strengthFill: {},
  strengthText: (c) => ({ color: c.textMuted }),
};
