/* FILE GUIDE:
 * client/src/pages/Register.jsx
 * Purpose: Shared registration screen for teacher/admin variants.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import React, { useMemo, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { api } from "../lib/api";
import { useColors, useTheme } from "../context/ThemeContext";

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

export default function Register() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const isAdminReg = sp.get("role") === "admin";
  const { dark, toggleTheme } = useTheme();
  const c = useColors();

  const [form, setForm] = useState({
    firstName: "", lastName: "",
    email: "", password: "", confirmPassword: "",
  });
  const [showPw, setShowPw] = useState(false);
  const [showConfPw, setShowConfPw] = useState(false);
  const [error, setError] = useState("");

  const checks = useMemo(() => passwordChecks(form.password), [form.password]);
  const okDot = dark ? "#22c55e" : "#16a34a";
  const okText = dark ? "#86efac" : "#166534";
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
      if (isAdminReg) payload.role = "ADMIN";

      const { data } = await api.post("/auth/register", payload);
      const label = data.role === "ADMIN" ? "Administrator" : "Teacher";
      const mode = data.role === "ADMIN" ? "admin" : "teacher";
      setError(`✓ Registered as ${label}. OTP sent to your email.`);
      setTimeout(() => nav(`/verify?mode=${mode}`, { state: { email: form.email, loginMode: mode } }), 850);
    } catch (err) {
      setError(err?.response?.data?.message || "Registration failed.");
    }
  }

  const strengthCount = Object.values(checks).filter(Boolean).length;
  const isSuccess = error.startsWith("✓");
  const feedbackTone = isSuccess
    ? { bg: dark ? "rgba(34,197,94,0.10)" : c.greenBg, border: dark ? "rgba(34,197,94,0.35)" : c.greenBorder, title: dark ? "#86efac" : "#166534", body: dark ? "#bbf7d0" : "#166534" }
    : { bg: dark ? "rgba(239,68,68,0.12)" : c.redBg, border: dark ? "rgba(248,113,113,0.35)" : c.redBorder, title: dark ? "#f87171" : "#b91c1c", body: dark ? "#fecaca" : "#7f1d1d" };

  return (
    <div style={s.page(c)}>
      <div style={s.glow} />

      <header style={s.header(c)}>
        <Link to="/" style={s.logo}>
          <span style={s.logoThink(c)}>Think</span>
          <span style={s.logoWave}>WAVE</span>
        </Link>
        <div style={s.headerRight}>
          <button onClick={toggleTheme} style={s.themeBtn(c)}>
            {dark ? "☀️ Light" : "🌙 Dark"}
          </button>
          <Link to={isAdminReg ? "/login?role=admin" : "/login"} style={s.headerBtn(c)}>Login</Link>
        </div>
      </header>

      <main style={s.main}>
        <div style={s.card(c)}>
          <div style={s.cardTop}>
            <h1 style={s.title(c)}>{isAdminReg ? "Create your admin account" : "Create your account"}</h1>
            <p style={s.subtitle(c)}>
              {isAdminReg ? "Register an admin account for your institution." : "Register a teacher account for ThinkWAVE."}
            </p>
          </div>

          <div style={s.columns}>
            <form onSubmit={submit} style={s.form}>
              <div style={s.row}>
                <div style={s.field}>
                  <label style={s.label(c)}>First name</label>
                  <input style={s.input(c)} value={form.firstName} onChange={(e) => set({ firstName: e.target.value })} placeholder="Juan" required />
                </div>
                <div style={s.field}>
                  <label style={s.label(c)}>Last name</label>
                  <input style={s.input(c)} value={form.lastName} onChange={(e) => set({ lastName: e.target.value })} placeholder="Dela Cruz" required />
                </div>
              </div>

              <div style={s.field}>
                <label style={s.label(c)}>Email address</label>
                <input type="email" style={s.input(c)} value={form.email} onChange={(e) => set({ email: e.target.value })} placeholder="you@example.com" required />
              </div>

              <div style={s.field}>
                <label style={s.label(c)}>Password</label>
                <div style={s.passwordWrap}>
                  <input type={showPw ? "text" : "password"} style={{ ...s.input(c), paddingRight: 64 }} value={form.password} onChange={(e) => set({ password: e.target.value })} placeholder="••••••••" required />
                  <button type="button" style={s.showBtn} onClick={() => setShowPw((v) => !v)}>{showPw ? "Hide" : "Show"}</button>
                </div>
              </div>

              <div style={s.field}>
                <label style={s.label(c)}>Confirm password</label>
                <div style={s.passwordWrap}>
                  <input
                    type={showConfPw ? "text" : "password"}
                    style={{ ...s.input(c), paddingRight: 64, borderColor: form.confirmPassword ? (matches ? "#22c55e" : "#ef4444") : c.inputBorder }}
                    value={form.confirmPassword}
                    onChange={(e) => set({ confirmPassword: e.target.value })}
                    placeholder="••••••••"
                    required
                  />
                  <button type="button" style={s.showBtn} onClick={() => setShowConfPw((v) => !v)}>{showConfPw ? "Hide" : "Show"}</button>
                </div>
                {form.confirmPassword && (
                  <span style={{ fontSize: 12, marginTop: 4, color: matches ? "#22c55e" : "#f87171" }}>
                    {matches ? "✓ Passwords match" : "✗ Passwords do not match"}
                  </span>
                )}
              </div>

              {error && (
                <div style={s.feedbackBox(feedbackTone)}>
                  <div style={s.errorHeader}>
                    <span style={s.errorTitle(feedbackTone)}>
                      {isSuccess ? "Success!" : "Need help?"}
                    </span>
                    {!isSuccess && <button type="button" style={s.errorClose(feedbackTone)} onClick={() => setError("")}>×</button>}
                  </div>
                  <p style={s.errorMsg(feedbackTone)}>{error}</p>
                </div>
              )}

              <div style={s.btnWrap}>
                <button type="submit" style={s.submitBtn}>{isAdminReg ? "Create Admin Account" : "Create Account"}</button>
              </div>

              <p style={s.loginPrompt(c)}>
                Already have an account? <Link to={isAdminReg ? "/login?role=admin" : "/login"} style={s.loginLink}>Log in here</Link>
              </p>
            </form>

            <div style={s.reqPanel(c)}>
              <div style={s.reqTitle(c)}>Password requirements</div>
              <div style={s.reqList}>
                {Object.entries(REQ_LABELS).map(([key, label]) => (
                  <div key={key} style={s.reqItem}>
                    <span style={{ ...s.reqDot, background: checks[key] ? okDot : c.border, boxShadow: checks[key] ? "0 0 6px rgba(34,197,94,0.35)" : "none" }} />
                    <span style={{ fontSize: 13, color: checks[key] ? okText : c.textMuted }}>{label}</span>
                  </div>
                ))}
              </div>
              <div style={s.strengthBar(c)}>
                <div style={{ ...s.strengthFill, width: `${(strengthCount / 5) * 100}%`, background: isStrong ? "#22c55e" : strengthCount >= 3 ? "#f59e0b" : "#ef4444" }} />
              </div>
              <div style={s.strengthText(c)}>
                {isStrong ? "Strong ✓" : strengthCount >= 3 ? "Medium — keep going" : "Weak — add more variety"}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

const s = {
  page: (c) => ({ minHeight: "100vh", background: c.pageBg, display: "flex", flexDirection: "column", fontFamily: "'Segoe UI',system-ui,sans-serif", color: c.text, position: "relative", overflow: "hidden" }),
  glow: { position: "absolute", top: -200, left: "50%", transform: "translateX(-50%)", width: 600, height: 600, background: "radial-gradient(circle,rgba(43,108,255,0.10) 0%,transparent 70%)", pointerEvents: "none", zIndex: 0 },
  header: (c) => ({ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 40px", zIndex: 1, borderBottom: `1px solid ${c.border}` }),
  logo: { display: "flex", alignItems: "baseline", textDecoration: "none" },
  logoThink: (c) => ({ fontSize: 20, fontWeight: 900, color: c.text }),
  logoWave: { fontSize: 20, fontWeight: 900, color: "#2b6cff" },
  headerRight: { display: "flex", alignItems: "center", gap: 10 },
  themeBtn: (c) => ({ padding: "8px 14px", borderRadius: 20, border: `1px solid ${c.inputBorder}`, background: "transparent", color: c.textMuted, fontSize: 13, fontWeight: 700, cursor: "pointer" }),
  headerBtn: (c) => ({ padding: "8px 20px", borderRadius: 20, border: `1px solid ${c.inputBorder}`, color: c.text, fontSize: 13, fontWeight: 700, textDecoration: "none" }),
  main: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "36px 20px", zIndex: 1 },
  card: (c) => ({ background: c.cardBg3, border: `1px solid ${c.border}`, borderRadius: 20, padding: "40px 44px 36px", width: "min(100%,800px)", boxShadow: "0 24px 80px rgba(0,0,0,0.32)" }),
  cardTop: { marginBottom: 28, textAlign: "center" },
  title: (c) => ({ margin: "0 0 8px", fontSize: 26, fontWeight: 900, letterSpacing: "-0.5px", color: c.text }),
  subtitle: (c) => ({ margin: 0, fontSize: 14, color: c.textMuted, lineHeight: 1.6 }),
  columns: { display: "flex", gap: 32, alignItems: "flex-start" },
  form: { flex: 1.2, display: "flex", flexDirection: "column", gap: 18 },
  row: { display: "flex", gap: 12 },
  field: { display: "flex", flexDirection: "column", gap: 6, flex: 1 },
  label: (c) => ({ fontSize: 13, fontWeight: 600, color: c.text }),
  input: (c) => ({ padding: "12px 16px", borderRadius: 12, border: `1px solid ${c.inputBorder}`, background: c.inputBg, color: c.text, fontSize: 14, width: "100%", boxSizing: "border-box", outline: "none", transition: "border-color 0.15s" }),
  passwordWrap: { position: "relative" },
  showBtn: { position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#2b6cff", fontSize: 13, fontWeight: 700, cursor: "pointer", padding: 0 },
  feedbackBox: (tone) => ({ background: tone.bg, border: `1px solid ${tone.border}`, borderRadius: 10, padding: "12px 14px", boxShadow: "0 10px 24px rgba(15,23,42,0.06)" }),
  errorHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  errorTitle: (tone) => ({ fontSize: 14, fontWeight: 800, color: tone.title }),
  errorClose: (tone) => ({ background: "none", border: "none", color: tone.title, fontSize: 18, fontWeight: 700, cursor: "pointer", padding: 0, lineHeight: 1 }),
  errorMsg: (tone) => ({ margin: "6px 0 0", fontSize: 13, lineHeight: 1.5, color: tone.body }),
  btnWrap: { display: "flex", justifyContent: "center", marginTop: 4 },
  submitBtn: { padding: "14px 56px", borderRadius: 12, border: "none", background: "#2b6cff", color: "#fff", fontSize: 16, fontWeight: 800, cursor: "pointer", boxShadow: "0 4px 20px rgba(43,108,255,0.40)" },
  loginPrompt: (c) => ({ textAlign: "center", fontSize: 13, color: c.textMuted, margin: 0 }),
  loginLink: { color: "#2b6cff", fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 2 },
  reqPanel: (c) => ({ flex: 1, background: c.cardBg2, border: `1px solid ${c.border}`, borderRadius: 14, padding: "20px", display: "flex", flexDirection: "column", gap: 12, alignSelf: "flex-start" }),
  reqTitle: (c) => ({ fontSize: 13, fontWeight: 700, color: c.text }),
  reqList: { display: "flex", flexDirection: "column", gap: 10 },
  reqItem: { display: "flex", alignItems: "center", gap: 10 },
  reqDot: { width: 10, height: 10, borderRadius: "50%", flexShrink: 0, transition: "background 0.2s, box-shadow 0.2s" },
  strengthBar: (c) => ({ height: 5, background: c.border, borderRadius: 99, overflow: "hidden", marginTop: 6 }),
  strengthFill: { height: "100%", borderRadius: 99, transition: "width 0.3s, background 0.3s" },
  strengthText: (c) => ({ fontSize: 12, color: c.textMuted, textAlign: "center", marginTop: 4 }),
};
