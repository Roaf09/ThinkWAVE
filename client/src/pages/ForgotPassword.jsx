/* FILE GUIDE:
 * client/src/pages/ForgotPassword.jsx
 * Purpose: Revision 1 password reset page using OTP verification only.
 */

import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useColors, useTheme } from "../context/ThemeContext";

function passwordChecks(p) {
  return {
    len: p.length >= 8,
    upper: /[A-Z]/.test(p),
    lower: /[a-z]/.test(p),
    num: /[0-9]/.test(p),
    sym: /[^A-Za-z0-9]/.test(p),
  };
}

export default function ForgotPassword() {
  const nav = useNavigate();
  const { dark, toggleTheme } = useTheme();
  const c = useColors();
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const checks = passwordChecks(newPassword);
  const strong = Object.values(checks).every(Boolean);
  const matches = newPassword && newPassword === confirmPassword;

  async function requestOtp(e) {
    e.preventDefault();
    setErr(""); setMsg("");
    try {
      await api.post("/auth/password/request-reset", { email });
      // Revision 1: password reset requires OTP verification before applying the new password.
      setMsg("An OTP has been sent. Verify it first before your password is changed.");
      setStep("otp");
    } catch (error) {
      setErr(error?.response?.data?.message || "Could not send OTP.");
    }
  }

  async function confirmReset(e) {
    e.preventDefault();
    setErr(""); setMsg("");
    if (!strong) return setErr("Please use a stronger password.");
    if (!matches) return setErr("Passwords do not match.");
    try {
      await api.post("/auth/password/confirm-reset", { email, code, newPassword });
      setMsg("Password changed successfully. You can now log in.");
      setTimeout(() => nav("/login"), 900);
    } catch (error) {
      setErr(error?.response?.data?.message || "Password reset failed.");
    }
  }

  return (
    <div style={s.page(c)}>
      <div style={s.glow} />
      <header style={s.header(c)}>
        <Link to="/" style={s.logo}>
          <span style={s.logoThink(c)}>Think</span><span style={s.logoWave}>WAVE</span>
        </Link>
        <button onClick={toggleTheme} style={s.themeBtn(c)}>{dark ? "☀️ Light" : "🌙 Dark"}</button>
      </header>
      <main style={s.main}>
        <div style={s.card(c)}>
          <h1 style={s.title(c)}>Reset Password</h1>
          <p style={s.subtitle(c)}>Enter your email and verify the OTP before changing your password.</p>
          {msg && <p style={s.success(c)}>{msg}</p>}
          {err && <p style={s.error(c)}>{err}</p>}
          {step === "email" ? (
            <form onSubmit={requestOtp} style={s.form}>
              <label style={s.label(c)}>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={s.input(c)} placeholder="user@example.com" />
              <button type="submit" style={s.submitBtn}>Send OTP</button>
            </form>
          ) : (
            <form onSubmit={confirmReset} style={s.form}>
              <label style={s.label(c)}>OTP Code</label>
              <input value={code} onChange={(e) => setCode(e.target.value)} required maxLength={10} style={s.input(c)} placeholder="6-digit code" />
              <label style={s.label(c)}>New Password</label>
              <div style={s.passwordWrap}>
                <input type={showPw ? "text" : "password"} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required style={{ ...s.input(c), paddingRight: 64 }} placeholder="••••••••" />
                <button type="button" style={s.showBtn} onClick={() => setShowPw((v) => !v)}>{showPw ? "Hide" : "Show"}</button>
              </div>
              <label style={s.label(c)}>Confirm Password</label>
              <input type={showPw ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required style={s.input(c)} placeholder="••••••••" />
              <div style={s.checks(c)}>
                <span>{checks.len ? "✓" : "•"} 8+ characters</span>
                <span>{checks.upper ? "✓" : "•"} Uppercase</span>
                <span>{checks.lower ? "✓" : "•"} Lowercase</span>
                <span>{checks.num ? "✓" : "•"} Number</span>
                <span>{checks.sym ? "✓" : "•"} Symbol</span>
              </div>
              <button type="submit" style={s.submitBtn}>Change Password</button>
            </form>
          )}
          <p style={s.back(c)}><Link to="/login" style={s.link}>Back to login</Link></p>
        </div>
      </main>
    </div>
  );
}

const s = {
  page: (c) => ({ minHeight: "100vh", background: c.pageBg, display: "flex", flexDirection: "column", fontFamily: "'Segoe UI', system-ui, sans-serif", color: c.text, position: "relative", overflow: "hidden" }),
  glow: { position: "absolute", top: -200, left: "50%", transform: "translateX(-50%)", width: 600, height: 600, background: "radial-gradient(circle, rgba(43,108,255,0.12) 0%, transparent 70%)", pointerEvents: "none", zIndex: 0 },
  header: (c) => ({ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 40px", zIndex: 1, borderBottom: `1px solid ${c.border}` }),
  logo: { display: "flex", alignItems: "baseline", textDecoration: "none" },
  logoThink: (c) => ({ fontSize: 20, fontWeight: 900, color: c.text }),
  logoWave: { fontSize: 20, fontWeight: 900, color: "#2b6cff" },
  themeBtn: (c) => ({ padding: "8px 14px", borderRadius: 20, border: `1px solid ${c.inputBorder}`, background: "transparent", color: c.textMuted, fontSize: 13, fontWeight: 700, cursor: "pointer" }),
  main: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 20px", zIndex: 1 },
  card: (c) => ({ background: c.cardBg3, border: `1px solid ${c.border}`, borderRadius: 20, padding: "40px", width: "min(100%, 440px)", boxShadow: "0 24px 80px rgba(0,0,0,0.35)" }),
  title: (c) => ({ margin: "0 0 6px", fontSize: 28, fontWeight: 900, color: c.text }),
  subtitle: (c) => ({ margin: "0 0 22px", fontSize: 14, color: c.textMuted, lineHeight: 1.5 }),
  form: { display: "flex", flexDirection: "column", gap: 12 },
  label: (c) => ({ fontSize: 13, fontWeight: 700, color: c.text }),
  input: (c) => ({ padding: "11px 14px", borderRadius: 12, border: `1px solid ${c.inputBorder}`, background: c.inputBg, color: c.text, fontSize: 14, width: "100%", boxSizing: "border-box" }),
  passwordWrap: { position: "relative" },
  showBtn: { position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#2b6cff", fontSize: 13, fontWeight: 700, cursor: "pointer", padding: 0 },
  submitBtn: { marginTop: 6, width: "100%", padding: "13px", borderRadius: 12, border: "none", background: "#2b6cff", color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer" },
  success: (c) => ({ margin: "0 0 14px", padding: "10px 12px", borderRadius: 10, background: c.greenBg, border: `1px solid ${c.greenBorder}`, color: c.greenFg, fontSize: 13 }),
  error: (c) => ({ margin: "0 0 14px", padding: "10px 12px", borderRadius: 10, background: c.redBg, border: `1px solid ${c.redBorder}`, color: c.redFg, fontSize: 13 }),
  checks: (c) => ({ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 12, color: c.textMuted, marginTop: 2 }),
  back: (c) => ({ margin: "20px 0 0", textAlign: "center", color: c.textMuted, fontSize: 13 }),
  link: { color: "#2b6cff", fontWeight: 800, textDecoration: "none" },
};
