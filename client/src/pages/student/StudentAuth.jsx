/* FILE GUIDE:
 * client/src/pages/student/StudentAuth.jsx
 * Purpose: Revision 8 student register/login page matching the teacher login/register UI.
 */

import React, { useMemo, useState } from "react";
import PublicHeader from "../../components/PublicHeader";
import { Link, useNavigate } from "react-router-dom";
import { api, setAuthToken } from "../../lib/api";
import { setRole, setToken } from "../../lib/auth";
import { useColors, useTheme } from "../../context/ThemeContext";

const REQ_LABELS = {
  length: "At least 8 characters",
  upper: "One uppercase letter",
  lower: "One lowercase letter",
  number: "One number",
  special: "One special character",
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
  const c = useColors();
  const { dark, toggleTheme } = useTheme();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", password: "", confirmPassword: "" });
  const [showPw, setShowPw] = useState(false);
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
        setMsg(`✓ Registered as Student. ${otpNote}`);
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
      nav("/student");
    } catch (err) {
      const text = err?.response?.data?.message || "Student access failed.";
      if (text.toLowerCase().includes("invalid credentials")) setNotFound(true);
      setMsg(text);
    }
  }

  return (
    <div style={s.page(c)}>
      <div style={s.glow} />
      <PublicHeader compact />

      <main style={s.main}>
        <div style={mode === "login" ? s.card(c) : s.registerCard(c)}>
          <div style={s.cardTop}>
            <h1 style={s.title(c)}>{mode === "login" ? "Welcome back" : "Create your student account"}</h1>
            <p style={s.subtitle(c)}>{mode === "login" ? "Student login only. Sign in to your ThinkWAVE account." : "Register a student account for ThinkWAVE."}</p>
          </div>

          {mode === "login" ? (
            <>
              <form onSubmit={submit} style={s.form}>
                <div style={s.field}>
                  <label style={s.label(c)}>Email address</label>
                  <input type="email" value={form.email} onChange={(e) => patch({ email: e.target.value })} placeholder="student@gmail.com" required style={s.input(c)} />
                </div>

                <div style={s.field}>
                  <label style={s.label(c)}>Password</label>
                  <div style={s.passwordWrap}>
                    <input type={showPw ? "text" : "password"} value={form.password} onChange={(e) => patch({ password: e.target.value })} placeholder="••••••••" required style={{ ...s.input(c), paddingRight: 64 }} />
                    <button type="button" style={s.showBtn} onClick={() => setShowPw((v) => !v)}>{showPw ? "Hide" : "Show"}</button>
                  </div>
                </div>

                <div style={s.rememberRow}>
                  <label style={s.rememberLabel(c)}><input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} style={{ margin: 0, width: 15, height: 15, flex: "0 0 auto", accentColor: "#2b6cff" }} />Remember me</label>
                  <button type="button" style={s.forgotBtn} onClick={() => nav("/forgot-password")}>Forgot password?</button>
                </div>

                {msg && <FeedbackBox tone={errorTone} notFound={notFound} mode={mode} clear={() => { setMsg(""); setNotFound(false); }} />}
                <button type="submit" style={s.submitBtn}>Login as Student</button>
              </form>

              <p style={s.footText(c)}>Need a student account? <button type="button" onClick={() => setMode("register")} style={s.inlineButton}>Register here</button></p>
            </>
          ) : (
            <div style={s.columns}>
              <form onSubmit={submit} style={s.formWide}>
                <div style={s.row}>
                  <div style={s.field}><label style={s.label(c)}>First name</label><input style={s.input(c)} value={form.firstName} onChange={(e) => patch({ firstName: e.target.value })} placeholder="Juan" required /></div>
                  <div style={s.field}><label style={s.label(c)}>Last name</label><input style={s.input(c)} value={form.lastName} onChange={(e) => patch({ lastName: e.target.value })} placeholder="Dela Cruz" required /></div>
                </div>
                <div style={s.field}><label style={s.label(c)}>Email address</label><input type="email" style={s.input(c)} value={form.email} onChange={(e) => patch({ email: e.target.value })} placeholder="you@example.com" required /></div>
                <div style={s.field}><label style={s.label(c)}>Password</label><div style={s.passwordWrap}><input type={showPw ? "text" : "password"} style={{ ...s.input(c), paddingRight: 64 }} value={form.password} onChange={(e) => patch({ password: e.target.value })} placeholder="••••••••" required /><button type="button" style={s.showBtn} onClick={() => setShowPw((v) => !v)}>{showPw ? "Hide" : "Show"}</button></div></div>
                <div style={s.field}><label style={s.label(c)}>Confirm password</label><div style={s.passwordWrap}><input type={showConfPw ? "text" : "password"} style={{ ...s.input(c), paddingRight: 64, borderColor: form.confirmPassword ? (matches ? "#22c55e" : "#ef4444") : c.inputBorder }} value={form.confirmPassword} onChange={(e) => patch({ confirmPassword: e.target.value })} placeholder="••••••••" required /><button type="button" style={s.showBtn} onClick={() => setShowConfPw((v) => !v)}>{showConfPw ? "Hide" : "Show"}</button></div>{form.confirmPassword && <span style={{ fontSize: 12, marginTop: 4, color: matches ? "#22c55e" : "#f87171" }}>{matches ? "✓ Passwords match" : "✗ Passwords do not match"}</span>}</div>
                {msg && <FeedbackBox tone={errorTone} notFound={notFound} mode={mode} clear={() => { setMsg(""); setNotFound(false); }} />}
                <button type="submit" style={s.submitBtn}>Create Student Account</button>
                <p style={s.footText(c)}>Already have an account? <button type="button" onClick={() => setMode("login")} style={s.inlineButton}>Log in here</button></p>
              </form>
              <div style={s.reqPanel(c)}>
                <div style={s.reqTitle(c)}>Password requirements</div>
                <div style={s.reqList}>
                  {Object.entries(REQ_LABELS).map(([key, label]) => <div key={key} style={s.reqItem}><span style={{ ...s.reqDot, background: checks[key] ? okDot : c.border, boxShadow: checks[key] ? "0 0 6px rgba(34,197,94,0.35)" : "none" }} /><span style={{ fontSize: 13, color: checks[key] ? okText : c.textMuted }}>{label}</span></div>)}
                </div>
                <div style={s.strengthBar(c)}><div style={{ ...s.strengthFill, width: `${(strengthCount / 5) * 100}%`, background: isStrong ? "#22c55e" : strengthCount >= 3 ? "#f59e0b" : "#ef4444" }} /></div>
                <div style={s.strengthText(c)}>{isStrong ? "Strong ✓" : strengthCount >= 3 ? "Medium — keep going" : "Weak — add more variety"}</div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );

  function FeedbackBox({ tone, notFound, clear }) {
    return <div style={s.errorBox(tone)}><div style={s.errorHeader}><span style={s.errorTitle(tone)}>{isSuccess ? "Success!" : notFound ? "Account not found" : "Need help?"}</span>{!isSuccess && <button type="button" style={s.errorClose(tone)} onClick={clear}>×</button>}</div><p style={s.errorMsg(tone)}>{notFound ? "No student account was found with that email. Please sign up first." : msg}</p>{notFound && <button type="button" onClick={() => setMode("register")} style={s.inlineCta}>Create account</button>}</div>;
  }
}

const s = {
  page: (c) => ({ minHeight: "100vh", background: c.pageBg, display: "flex", flexDirection: "column", fontFamily: "'Segoe UI', system-ui, sans-serif", color: c.text, position: "relative", overflow: "hidden" }),
  glow: { position: "absolute", top: -200, left: "50%", transform: "translateX(-50%)", width: 600, height: 600, background: "radial-gradient(circle, rgba(43,108,255,0.12) 0%, transparent 70%)", pointerEvents: "none", zIndex: 0 },
  header: (c) => ({ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 40px", zIndex: 1, borderBottom: `1px solid ${c.border}` }),
  logo: { display: "flex", alignItems: "baseline", textDecoration: "none" },
  logoThink: (c) => ({ fontSize: 20, fontWeight: 900, color: c.text }),
  logoWave: { fontSize: 20, fontWeight: 900, color: "#2b6cff" },
  headerRight: { display: "flex", alignItems: "center", gap: 10 },
  themeBtn: (c) => ({ padding: "8px 14px", borderRadius: 20, border: `1px solid ${c.inputBorder}`, background: "transparent", color: c.textMuted, fontSize: 13, fontWeight: 700, cursor: "pointer" }),
  headerBtn: (c) => ({ padding: "8px 20px", borderRadius: 20, border: `1px solid ${c.inputBorder}`, background: "transparent", color: c.text, fontSize: 13, fontWeight: 700, textDecoration: "none", cursor: "pointer" }),
  main: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "36px 20px", zIndex: 1 },
  card: (c) => ({ background: c.cardBg3, border: `1px solid ${c.border}`, borderRadius: 20, padding: "40px 44px 36px", width: "min(100%, 460px)", boxShadow: "0 24px 80px rgba(0,0,0,0.28)" }),
  registerCard: (c) => ({ background: c.cardBg3, border: `1px solid ${c.border}`, borderRadius: 20, padding: "40px 44px 36px", width: "min(100%,800px)", boxShadow: "0 24px 80px rgba(0,0,0,0.32)" }),
  cardTop: { marginBottom: 28, textAlign: "center" },
  title: (c) => ({ margin: "0 0 8px", fontSize: 28, fontWeight: 900, letterSpacing: "-0.5px", color: c.text }),
  subtitle: (c) => ({ margin: 0, fontSize: 13, color: c.textMuted, lineHeight: 1.6 }),
  form: { display: "flex", flexDirection: "column", gap: 16 },
  formWide: { flex: 1.2, display: "flex", flexDirection: "column", gap: 18 },
  columns: { display: "flex", gap: 32, alignItems: "flex-start" },
  row: { display: "flex", gap: 12 },
  field: { display: "flex", flexDirection: "column", gap: 6, flex: 1 },
  label: (c) => ({ fontSize: 13, fontWeight: 600, color: c.text }),
  input: (c) => ({ padding: "12px 16px", borderRadius: 12, border: `1px solid ${c.inputBorder}`, background: c.inputBg, color: c.text, fontSize: 14, width: "100%", boxSizing: "border-box" }),
  passwordWrap: { position: "relative" },
  showBtn: { position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#2b6cff", fontSize: 13, fontWeight: 700, cursor: "pointer", padding: 0 },
  rememberRow: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  rememberLabel: (c) => ({ display: "inline-flex", alignItems: "center", gap: 7, lineHeight: 1, fontSize: 13, color: c.textMuted, whiteSpace: "nowrap" }),
  forgotBtn: { background: "none", border: "none", color: "#2b6cff", fontSize: 13, fontWeight: 700, cursor: "pointer", padding: 0 },
  errorBox: (tone) => ({ background: tone.bg, border: `1px solid ${tone.border}`, borderRadius: 12, padding: "12px 14px", boxShadow: "0 10px 24px rgba(15,23,42,0.06)" }),
  errorHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  errorTitle: (tone) => ({ fontSize: 14, fontWeight: 800, color: tone.title }),
  errorClose: (tone) => ({ background: "none", border: "none", color: tone.title, fontSize: 18, fontWeight: 700, cursor: "pointer", padding: 0, lineHeight: 1 }),
  errorMsg: (tone) => ({ margin: "6px 0 0", fontSize: 13, color: tone.body, lineHeight: 1.5 }),
  inlineCta: { display: "inline-block", marginTop: 10, padding: "8px 16px", borderRadius: 8, background: "#2b6cff", color: "#fff", fontSize: 13, fontWeight: 700, border: "none", cursor: "pointer" },
  submitBtn: { padding: "14px", borderRadius: 14, border: "none", background: "#2b6cff", color: "#fff", fontSize: 16, fontWeight: 800, cursor: "pointer", boxShadow: "0 4px 20px rgba(43,108,255,0.35)" },
  footText: (c) => ({ textAlign: "center", fontSize: 13, color: c.textMuted, margin: "20px 0 0" }),
  inlineButton: { background: "none", border: "none", color: "#2b6cff", fontWeight: 700, textDecoration: "underline", cursor: "pointer", padding: 0 },
  reqPanel: (c) => ({ flex: 0.9, background: c.cardBg2, border: `1px solid ${c.border}`, borderRadius: 16, padding: 20, minWidth: 230 }),
  reqTitle: (c) => ({ fontWeight: 800, color: c.text, marginBottom: 14 }),
  reqList: { display: "flex", flexDirection: "column", gap: 10 },
  reqItem: { display: "flex", alignItems: "center", gap: 10 },
  reqDot: { width: 8, height: 8, borderRadius: "50%" },
  strengthBar: (c) => ({ height: 8, borderRadius: 999, background: c.border, overflow: "hidden", marginTop: 18 }),
  strengthFill: { height: "100%", borderRadius: 999, transition: "width 0.2s, background 0.2s" },
  strengthText: (c) => ({ marginTop: 8, fontSize: 12, color: c.textMuted, fontWeight: 700 }),
};
