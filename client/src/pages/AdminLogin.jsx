/* FILE GUIDE:
 * client/src/pages/AdminLogin.jsx
 * Purpose: Project source file. Read the file name and exports first, then follow the imported helpers to understand the flow.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

// AdminLogin.jsx — Separate login page for admin accounts.
// Previously, admins shared /login with teachers, which caused
// admins to land on the teacher dashboard instead of the admin dashboard.
// Now admins have their own route: /admin-login

import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api, setAuthToken } from "../lib/api";
import { setRole, setToken } from "../lib/auth";

const INPUT_BG = "#0d1b2e";
const BORDER_C = "#1e3050";
const CARD_BG  = "#111e33";
const PAGE_BG  = "#080e1f";

export default function AdminLogin({ onLoginSuccess }) {
  const nav = useNavigate();
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [showPw,   setShowPw]   = useState(false);
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { email, password });
      // Only allow ADMIN role on this login page
      if (data.role !== "ADMIN") {
        setError("This login is for admin accounts only. Please use the correct login page.");
        setLoading(false);
        return;
      }
      setToken(data.token);
      setRole(data.role);
      setAuthToken(data.token);
      if (onLoginSuccess) onLoginSuccess(data.token, data.role, data);
      nav("/admin");
    } catch (err) {
      setError(err?.response?.data?.message || "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={s.page}>
      <div style={s.glow} />
      <header style={s.header}>
        <Link to="/" style={s.logo}>
          <span style={s.think}>Think</span><span style={s.wave}>WAVE</span>
          <span style={s.adminTag}>ADMIN</span>
        </Link>
        <Link to="/admin-register" style={s.headerBtn}>Register</Link>
      </header>

      <main style={s.main}>
        <div style={s.card}>
          <div style={s.cardTop}>
            <h1 style={s.title}>Admin Login</h1>
            <p style={s.subtitle}>Sign in to access your institution's admin dashboard.</p>
          </div>

          <form onSubmit={submit} style={s.form}>
            <div style={s.field}>
              <label style={s.label}>Email address</label>
              <input type="email" style={s.input} value={email}
                onChange={e => setEmail(e.target.value)} placeholder="admin@school.edu" required />
            </div>

            <div style={s.field}>
              <label style={s.label}>Password</label>
              <div style={s.pwWrap}>
                <input type={showPw ? "text" : "password"}
                  style={{ ...s.input, paddingRight: 64 }}
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" required />
                <button type="button" style={s.showBtn} onClick={() => setShowPw(v => !v)}>
                  {showPw ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {error && (
              <div style={s.errBox}>
                <p style={s.errMsg}>{error}</p>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "center", marginTop: 4 }}>
              <button type="submit" disabled={loading} style={s.submitBtn}>
                {loading ? "Signing in…" : "Sign In"}
              </button>
            </div>

            <p style={{ textAlign: "center", fontSize: 13, opacity: 0.6, margin: 0 }}>
              Don't have an account?{" "}
              <Link to="/admin-register" style={{ color: "#2b6cff", fontWeight: 700, textDecoration: "underline" }}>
                Register here
              </Link>
            </p>

            <p style={{ textAlign: "center", fontSize: 12, opacity: 0.45, margin: 0 }}>
              Are you a teacher?{" "}
              <Link to="/login" style={{ color: "#8a9bc4" }}>Teacher login →</Link>
            </p>
          </form>
        </div>
      </main>
    </div>
  );
}

const s = {
  page:      { minHeight: "100vh", background: PAGE_BG, display: "flex", flexDirection: "column", fontFamily: "'Segoe UI',system-ui,sans-serif", color: "#e7e9ee", position: "relative", overflow: "hidden" },
  glow:      { position: "absolute", top: -200, left: "50%", transform: "translateX(-50%)", width: 600, height: 600, background: "radial-gradient(circle,rgba(22,78,99,0.2) 0%,transparent 70%)", pointerEvents: "none", zIndex: 0 },
  header:    { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 40px", zIndex: 1, borderBottom: "1px solid #1a2540" },
  logo:      { display: "flex", alignItems: "baseline", gap: 4, textDecoration: "none" },
  think:     { fontSize: 20, fontWeight: 900, color: "#e7e9ee" },
  wave:      { fontSize: 20, fontWeight: 900, color: "#2b6cff" },
  adminTag:  { fontSize: 10, fontWeight: 900, letterSpacing: "0.08em", background: "#164e63", color: "#67e8f9", padding: "2px 6px", borderRadius: 4, marginLeft: 4 },
  headerBtn: { padding: "8px 20px", borderRadius: 20, border: "1px solid #2a3b73", color: "#e7e9ee", fontSize: 13, fontWeight: 700, textDecoration: "none" },
  main:      { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "36px 20px", zIndex: 1 },
  card:      { background: CARD_BG, border: "1px solid #1a2d4a", borderRadius: 20, padding: "40px 44px 36px", width: "min(100%, 460px)", boxShadow: "0 24px 80px rgba(0,0,0,0.45)" },
  cardTop:   { marginBottom: 28, textAlign: "center" },
  title:     { margin: "0 0 8px", fontSize: 24, fontWeight: 900, letterSpacing: "-0.5px" },
  subtitle:  { margin: 0, fontSize: 13, opacity: 0.55, lineHeight: 1.6 },
  form:      { display: "flex", flexDirection: "column", gap: 16 },
  field:     { display: "flex", flexDirection: "column", gap: 6 },
  label:     { fontSize: 13, fontWeight: 600, opacity: 0.85 },
  input:     { padding: "12px 16px", borderRadius: 12, border: `1px solid ${BORDER_C}`, background: INPUT_BG, color: "#e7e9ee", fontSize: 14, width: "100%", boxSizing: "border-box" },
  pwWrap:    { position: "relative" },
  showBtn:   { position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#2b6cff", fontSize: 13, fontWeight: 700, cursor: "pointer", padding: 0 },
  errBox:    { background: "rgba(220,38,38,0.12)", border: "1px solid rgba(220,38,38,0.4)", borderRadius: 10, padding: "12px 14px" },
  errMsg:    { margin: 0, fontSize: 13, color: "#fca5a5", lineHeight: 1.5 },
  submitBtn: { padding: "14px 56px", borderRadius: 50, border: "none", background: "#164e63", color: "#67e8f9", fontSize: 16, fontWeight: 800, cursor: "pointer" },
};