/* FILE GUIDE:
 * client/src/pages/SuperadminRegister.jsx
 * Purpose: Project source file. Read the file name and exports first, then follow the imported helpers to understand the flow.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import React, { useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
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

export default function SuperadminRegister() {
  const nav = useNavigate();
  const { dark, toggleTheme } = useTheme();
  const c = useColors();
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", password: "", confirmPassword: "" });
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
      });
      const otpNote = data.emailSent ? "OTP sent to your email." : `OTP email was not sent. ${data.devOtp ? `Use dev OTP: ${data.devOtp}` : (data.deliveryWarning || "Check server email settings.")}`;
      setMsg(`Account created! ${otpNote} Redirecting…`);
      setTimeout(() => nav("/verify?mode=superadmin", { state: { email: form.email, loginMode: "superadmin" } }), data.emailSent ? 900 : 2600);
    } catch (err) {
      setMsg(err?.response?.data?.message || "Registration failed.");
    }
  }

  return (
    <div style={s.page(c)}>
      <div style={s.glow} />

      <header style={s.header(c)}>
        <Link to="/" style={s.logo}>
          <span style={s.logoThink(c)}>Think</span>
          <span style={s.logoWave}>WAVE</span>
        </Link>
        <button onClick={toggleTheme} style={s.themeBtn(c)}>
          {dark ? "☀️ Light" : "🌙 Dark"}
        </button>
      </header>

      <main style={s.main}>
        <div style={s.card(c)}>
          <div style={s.cardTop}>
            <h1 style={s.title(c)}>Welcome to ThinkWAVE!</h1>
            <p style={s.subtitle(c)}>
              The first account created will become the <span style={{ color: "#60a5fa", fontWeight: 700 }}>Super Administrator</span>.
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
                  <input type={showConfPw ? "text" : "password"} style={{ ...s.input(c), paddingRight: 64 }} value={form.confirmPassword} onChange={(e) => set({ confirmPassword: e.target.value })} placeholder="••••••••" required />
                  <button type="button" style={s.showBtn} onClick={() => setShowConfPw((v) => !v)}>{showConfPw ? "Hide" : "Show"}</button>
                </div>
                {form.confirmPassword && (
                  <span style={{ fontSize: 12, marginTop: 4, color: matches ? "#22c55e" : "#f87171" }}>
                    {matches ? "✓ Passwords match" : "✗ Passwords do not match"}
                  </span>
                )}
              </div>

              {msg && <p style={s.msgBox(msg.startsWith("Account created!"))}>{msg}</p>}

              <div style={s.btnWrap}>
                <button type="submit" style={s.submitBtn}>Create Superadmin Account</button>
              </div>

              <p style={s.loginPrompt(c)}>
                Already have an account? <Link to="/superadmin-login" style={s.link}>Log in here</Link>
              </p>
            </form>

            <div style={s.reqPanel(c)}>
              <div style={s.reqTitle(c)}>Password requirements</div>
              <div style={s.reqList}>
                {Object.entries(REQ_LABELS).map(([key, label]) => (
                  <div key={key} style={s.reqItem}>
                    <span style={{ ...s.reqDot, background: checks[key] ? "#22c55e" : c.border }} />
                    <span style={{ fontSize: 13, color: checks[key] ? "#86efac" : c.textMuted }}>{label}</span>
                  </div>
                ))}
              </div>
              <div style={s.strengthBar(c)}>
                <div style={{ ...s.strengthFill, width: `${(Object.values(checks).filter(Boolean).length / 5) * 100}%`, background: isStrong ? "#22c55e" : Object.values(checks).filter(Boolean).length >= 3 ? "#f59e0b" : "#ef4444" }} />
              </div>
              <div style={s.strengthText(c)}>
                {isStrong ? "Strong ✓" : Object.values(checks).filter(Boolean).length >= 3 ? "Medium — keep going" : "Weak — add more variety"}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

const s = {
  page: (c) => ({ minHeight: "100vh", background: c.pageBg, display: "flex", flexDirection: "column", fontFamily: "'Segoe UI', system-ui, sans-serif", color: c.text, position: "relative", overflow: "hidden" }),
  glow: { position: "absolute", top: -200, left: "50%", transform: "translateX(-50%)", width: 600, height: 600, background: "radial-gradient(circle, rgba(43,108,255,0.12) 0%, transparent 70%)", pointerEvents: "none", zIndex: 0 },
  header: (c) => ({ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 40px", zIndex: 1, borderBottom: `1px solid ${c.border}` }),
  logo: { display: "flex", alignItems: "baseline", textDecoration: "none" },
  logoThink: (c) => ({ fontSize: 20, fontWeight: 900, color: c.text }),
  logoWave: { fontSize: 20, fontWeight: 900, color: "#2b6cff" },
  themeBtn: (c) => ({ padding: "8px 14px", borderRadius: 20, border: `1px solid ${c.inputBorder}`, background: "transparent", color: c.textMuted, fontSize: 13, fontWeight: 700, cursor: "pointer" }),
  main: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "36px 20px", zIndex: 1 },
  card: (c) => ({ background: c.cardBg3, border: `1px solid ${c.border}`, borderRadius: 20, padding: "40px 44px 36px", width: "min(100%, 760px)", boxShadow: "0 24px 80px rgba(0,0,0,0.35)" }),
  cardTop: { marginBottom: 28, textAlign: "center" },
  title: (c) => ({ margin: "0 0 8px", fontSize: 26, fontWeight: 900, letterSpacing: "-0.5px", color: c.text }),
  subtitle: (c) => ({ margin: 0, fontSize: 14, color: c.textMuted, lineHeight: 1.6 }),
  columns: { display: "flex", gap: 32, alignItems: "flex-start" },
  form: { flex: 1.2, display: "flex", flexDirection: "column", gap: 16 },
  row: { display: "flex", gap: 12 },
  field: { display: "flex", flexDirection: "column", gap: 5, flex: 1 },
  label: (c) => ({ fontSize: 13, fontWeight: 600, color: c.text }),
  input: (c) => ({ padding: "10px 13px", borderRadius: 11, border: `1px solid ${c.inputBorder}`, background: c.inputBg, color: c.text, fontSize: 14, width: "100%", boxSizing: "border-box", outline: "none" }),
  passwordWrap: { position: "relative" },
  showBtn: { position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#2b6cff", fontSize: 13, fontWeight: 700, cursor: "pointer", padding: 0 },
  msgBox: (success) => ({ background: success ? "rgba(34,197,94,0.12)" : "rgba(30,64,175,0.22)", border: `1px solid ${success ? "rgba(34,197,94,0.35)" : "rgba(96,165,250,0.4)"}`, color: success ? "#bbf7d0" : "#bfdbfe", fontSize: 13, lineHeight: 1.6, padding: "10px 12px", borderRadius: 12, margin: 0 }),
  btnWrap: { display: "flex", justifyContent: "center", marginTop: 2 },
  submitBtn: { padding: "13px 28px", borderRadius: 999, background: "linear-gradient(135deg,#1d4ed8,#2563eb)", color: "white", border: "none", fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: "0 8px 22px rgba(37,99,235,0.35)" },
  loginPrompt: (c) => ({ textAlign: "center", fontSize: 13, color: c.textMuted, margin: "4px 0 0" }),
  link: { color: "#60a5fa", textDecoration: "underline", fontWeight: 700 },
  reqPanel: (c) => ({ flex: 1, minWidth: 240, background: c.cardBg2, border: `1px solid ${c.border}`, borderRadius: 16, padding: "18px 18px 16px", display: "flex", flexDirection: "column", gap: 12 }),
  reqTitle: (c) => ({ fontSize: 14, fontWeight: 800, color: c.text }),
  reqList: { display: "flex", flexDirection: "column", gap: 10 },
  reqItem: { display: "flex", alignItems: "center", gap: 10 },
  reqDot: { width: 9, height: 9, borderRadius: "50%", flexShrink: 0 },
  strengthBar: (c) => ({ width: "100%", height: 8, background: c.border, borderRadius: 999, overflow: "hidden", marginTop: 4 }),
  strengthFill: { height: "100%", borderRadius: 999 },
  strengthText: (c) => ({ fontSize: 12, color: c.textMuted, textAlign: "center" }),
};
