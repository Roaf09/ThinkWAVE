/* FILE GUIDE:
 * client/src/pages/SuperadminLogin.jsx
 * Purpose: Project source file. Read the file name and exports first, then follow the imported helpers to understand the flow.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api, setAuthToken } from "../lib/api";
import { setRole, setToken } from "../lib/auth";
import { useColors, useTheme } from "../context/ThemeContext";

export default function SuperadminLogin({ onLoginSuccess }) {
  const nav = useNavigate();
  const { dark, toggleTheme } = useTheme();
  const c = useColors();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [msg, setMsg] = useState("");

  async function submit(e) {
    e.preventDefault();
    setMsg("");
    try {
      const { data } = await api.post("/auth/login", { email, password, loginPortal: "SUPERADMIN" });
      setToken(data.token);
      setRole(data.role);
      setAuthToken(data.token);
      if (onLoginSuccess) onLoginSuccess(data.token, data.role);
      nav("/superadmin");
    } catch (err) {
      setMsg(err?.response?.data?.message || "Login failed. Check your credentials.");
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
        <div style={s.headerRight}>
          <button onClick={toggleTheme} style={s.themeBtn(c)}>
            {dark ? "☀️ Light" : "🌙 Dark"}
          </button>
          <span style={s.portalBadge}>Super Admin</span>
        </div>
      </header>

      <main style={s.main}>
        <div style={s.card(c)}>
          <div style={s.cardTop}>
            <h1 style={s.title}>Super Admin Access</h1>
            <p style={s.subtitle(c)}>Restricted administrative login</p>
          </div>

          <form onSubmit={submit} style={s.form}>
            <div style={s.field}>
              <label style={s.label(c)}>Admin Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@thinkwave.local" required style={s.input(c)} />
            </div>

            <div style={s.field}>
              <label style={s.label(c)}>Secret Password</label>
              <div style={s.passwordWrap}>
                <input type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required style={{ ...s.input(c), paddingRight: 64 }} />
                <button type="button" style={s.showBtn} onClick={() => setShowPw((v) => !v)}>{showPw ? "Hide" : "Show"}</button>
              </div>
            </div>

            {msg && <p style={s.msgBox}>{msg}</p>}

            <div style={s.btnWrap}>
              <button type="submit" style={s.loginBtn}>Authorize and Enter</button>
            </div>
          </form>

          <p style={s.backPrompt(c)}>
            Not a super admin? <Link to="/login" style={s.link}>Standard Login</Link>
          </p>
        </div>
      </main>
    </div>
  );
}

const s = {
  page: (c) => ({ minHeight: "100vh", background: c.pageBg, display: "flex", flexDirection: "column", fontFamily: "'Segoe UI', system-ui, sans-serif", color: c.text, position: "relative", overflow: "hidden" }),
  glow: { position: "absolute", top: -200, left: "50%", transform: "translateX(-50%)", width: 600, height: 600, background: "radial-gradient(circle, rgba(239,68,68,0.08) 0%, transparent 70%)", pointerEvents: "none", zIndex: 0 },
  header: (c) => ({ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 40px", zIndex: 1, borderBottom: `1px solid ${c.border}` }),
  logo: { display: "flex", alignItems: "baseline", textDecoration: "none" },
  logoThink: (c) => ({ fontSize: 20, fontWeight: 900, color: c.text }),
  logoWave: { fontSize: 20, fontWeight: 900, color: "#2b6cff" },
  headerRight: { display: "flex", alignItems: "center", gap: 10 },
  themeBtn: (c) => ({ padding: "8px 14px", borderRadius: 20, border: `1px solid ${c.inputBorder}`, background: "transparent", color: c.textMuted, fontSize: 13, fontWeight: 700, cursor: "pointer" }),
  portalBadge: { padding: "4px 12px", borderRadius: 6, background: "#450a0a", color: "#f87171", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", border: "1px solid #7f1d1d" },
  main: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 20px", zIndex: 1 },
  card: (c) => ({ background: c.cardBg3, border: `1px solid ${c.border}`, borderRadius: 20, padding: "44px 44px 36px", width: "min(100%, 440px)", boxShadow: "0 24px 80px rgba(0,0,0,0.45)" }),
  cardTop: { marginBottom: 28, textAlign: "center" },
  title: { margin: "0 0 6px", fontSize: 28, fontWeight: 900, letterSpacing: "-0.5px", color: "#f87171" },
  subtitle: (c) => ({ margin: 0, fontSize: 14, color: c.textMuted }),
  form: { display: "flex", flexDirection: "column", gap: 18 },
  field: { display: "flex", flexDirection: "column", gap: 6 },
  label: (c) => ({ fontSize: 13, fontWeight: 600, color: c.text }),
  input: (c) => ({ padding: "11px 14px", borderRadius: 12, border: `1px solid ${c.inputBorder}`, background: c.inputBg, color: c.text, fontSize: 14, width: "100%", boxSizing: "border-box" }),
  passwordWrap: { position: "relative" },
  showBtn: { position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#2b6cff", fontSize: 13, fontWeight: 700, cursor: "pointer", padding: 0 },
  msgBox: { fontSize: 13, color: "#fecaca", background: "rgba(127,29,29,0.4)", borderRadius: 8, padding: "10px 14px", margin: 0 },
  btnWrap: { display: "flex", justifyContent: "center", marginTop: 4 },
  loginBtn: { width: "100%", padding: "13px", borderRadius: 12, border: "none", background: "#dc2626", color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer", boxShadow: "0 4px 20px rgba(220,38,38,0.25)" },
  backPrompt: (c) => ({ textAlign: "center", fontSize: 13, color: c.textMuted, marginTop: 24 }),
  link: { color: "#60a5fa", fontWeight: 700, textDecoration: "none" },
};
