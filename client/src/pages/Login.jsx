/* FILE GUIDE:
 * client/src/pages/Login.jsx
 * Purpose: Shared login screen for teacher/admin variants.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import React, { useState } from "react";
import PublicHeader from "../components/PublicHeader";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { api, setAuthToken } from "../lib/api";
import { setRole, setToken } from "../lib/auth";
import { useColors, useTheme } from "../context/ThemeContext";
import { IconBubble, TwIcon } from "../components/TwUI";

export default function Login({ onLoginSuccess }) {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const isAdminLogin = sp.get("role") === "admin";
  const { dark, toggleTheme } = useTheme();
  const c = useColors();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);

  const errorTone = notFound
    ? { bg: dark ? "rgba(239,68,68,0.12)" : c.redBg, border: dark ? "rgba(248,113,113,0.35)" : c.redBorder, title: dark ? "#fca5a5" : "#b91c1c", body: dark ? "#fecaca" : "#7f1d1d" }
    : { bg: dark ? "rgba(245,158,11,0.12)" : "#fff9eb", border: dark ? "rgba(245,158,11,0.35)" : "#f4d28a", title: dark ? "#fcd34d" : "#92400e", body: dark ? "#fde68a" : "#78350f" };

  async function submit(e) {
    e.preventDefault();
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
      if (onLoginSuccess) onLoginSuccess(data.token, data.role, data);
      if (data.role === "ADMIN") nav("/admin");
      else nav("/teacher");
    } catch (err) {
      const msg = err?.response?.data?.message || "Login failed.";
      if (msg.toLowerCase().includes("invalid credentials")) {
        setNotFound(true);
      }
      setError(msg);
    }
  }

  return (
    <div style={s.page(c)}>
      <div style={s.glow} />
      <PublicHeader compact />

      <main style={s.main}>
        <section style={s.visualPanel(c)} aria-hidden="true">
          <IconBubble name={isAdminLogin ? "classes" : "teacher"} c={c} size={58} iconSize={30} />
          <div>
            <div style={s.visualKicker(c)}>{isAdminLogin ? "Institution Control" : "Teacher Workspace"}</div>
            <h2 style={s.visualTitle(c)}>Plan, host, and review learning activities in one calm dashboard.</h2>
          </div>
          <div className="tw-dashboard-visual">
            <div className="tw-mini-chart" style={{ background: c.cardBg2, border: `1px solid ${c.border}` }}>
              <span style={{ height: "38%" }} /><span style={{ height: "68%" }} /><span style={{ height: "48%" }} /><span style={{ height: "82%" }} />
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {["Live quiz ready", "Reports organized", "Class folders synced"].map((item) => (
                <div key={item} style={{ display: "flex", gap: 8, alignItems: "center", padding: "9px 10px", borderRadius: 14, background: c.cardBg2, border: `1px solid ${c.border}`, color: c.textMuted, fontSize: 12, fontWeight: 800 }}>
                  <TwIcon name="check" size={15} /> {item}
                </div>
              ))}
            </div>
          </div>
        </section>
        <div style={s.card(c)}>
          <div style={s.cardTop}>
            <h1 style={s.title(c)}>{isAdminLogin ? "Admin Login" : "Welcome back"}</h1>
            <p style={s.subtitle(c)}>
              {isAdminLogin
                ? "Sign in to access your institution's admin dashboard."
                : "Teacher login only. Sign in to your ThinkWAVE account."}
            </p>
          </div>

          <form onSubmit={submit} style={s.form}>
            <div style={s.field}>
              <label style={s.label(c)}>Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                style={s.input(c)}
              />
            </div>

            <div style={s.field}>
              <label style={s.label(c)}>Password</label>
              <div style={s.passwordWrap}>
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  style={{ ...s.input(c), paddingRight: 64 }}
                />
                <button type="button" style={s.showBtn} onClick={() => setShowPw((v) => !v)}>
                  {showPw ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <div style={s.rememberRow}>
              <label style={s.rememberLabel(c)}>
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  style={{ margin: 0, width: 15, height: 15, flex: "0 0 auto", accentColor: "#2b6cff" }}
                />
                Remember me
              </label>
              <button
                type="button"
                style={s.forgotBtn}
                onClick={() => nav("/forgot-password")}
              >
                Forgot password?
              </button>
            </div>

            {error && (
              <div style={{ ...s.errorBox(errorTone), ...(notFound ? {} : s.warnBox) }}>
                <div style={s.errorHeader}>
                  <span style={s.errorTitle(errorTone)}>{notFound ? "Account not found" : "Need help?"}</span>
                  <button type="button" style={s.errorClose(errorTone)} onClick={() => { setError(""); setNotFound(false); }}>×</button>
                </div>
                <p style={s.errorMsg(errorTone)}>
                  {notFound
                    ? `No ${isAdminLogin ? "admin " : "teacher "}account was found with that email. Please sign up first.`
                    : error}
                </p>
                {notFound && (
                  <Link to={isAdminLogin ? "/register?role=admin" : "/register"} style={s.inlineCta}>
                    Create account
                  </Link>
                )}
              </div>
            )}

            <button type="submit" style={s.submitBtn}>
              {isAdminLogin ? "Login as Admin" : "Login as Teacher"}
            </button>
          </form>

          <p style={s.footText(c)}>
            {isAdminLogin ? (
              <>
                Need a teacher account? <Link to="/login" style={s.link}>Go to normal login</Link>
              </>
            ) : (
              <>
                Need admin access? <Link to="/login?role=admin" style={s.link}>Use admin login</Link>
              </>
            )}
          </p>
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
  headerRight: { display: "flex", alignItems: "center", gap: 10 },
  themeBtn: (c) => ({ padding: "8px 14px", borderRadius: 20, border: `1px solid ${c.inputBorder}`, background: "transparent", color: c.textMuted, fontSize: 13, fontWeight: 700, cursor: "pointer" }),
  headerBtn: (c) => ({ padding: "8px 20px", borderRadius: 20, border: `1px solid ${c.inputBorder}`, color: c.text, fontSize: 13, fontWeight: 700, textDecoration: "none" }),
  main: { flex: 1, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 460px))", alignItems: "center", justifyContent: "center", gap: 28, padding: "36px 20px", zIndex: 1 },
  visualPanel: (c) => ({ display: "grid", gap: 18, background: c.cardBg, border: `1px solid ${c.border}`, borderRadius: 28, padding: 28, boxShadow: "0 24px 80px rgba(43,108,255,0.14)", backdropFilter: "blur(16px)" }),
  visualKicker: (c) => ({ color: c.accent, textTransform: "uppercase", letterSpacing: "0.12em", fontSize: 12, fontWeight: 950, marginBottom: 8 }),
  visualTitle: (c) => ({ color: c.text, margin: 0, fontSize: 30, lineHeight: 1.12, letterSpacing: "-0.05em" }),
  card: (c) => ({ background: c.cardBg3, border: `1px solid ${c.border}`, borderRadius: 24, padding: "40px 44px 36px", width: "min(100%, 460px)", boxShadow: "0 24px 80px rgba(0,0,0,0.22)", backdropFilter: "blur(16px)" }),
  cardTop: { marginBottom: 28, textAlign: "center" },
  title: (c) => ({ margin: "0 0 8px", fontSize: 28, fontWeight: 900, letterSpacing: "-0.5px", color: c.text }),
  subtitle: (c) => ({ margin: 0, fontSize: 13, color: c.textMuted, lineHeight: 1.6 }),
  form: { display: "flex", flexDirection: "column", gap: 16 },
  field: { display: "flex", flexDirection: "column", gap: 6 },
  label: (c) => ({ fontSize: 13, fontWeight: 600, color: c.text }),
  input: (c) => ({ padding: "12px 16px", borderRadius: 12, border: `1px solid ${c.inputBorder}`, background: c.inputBg, color: c.text, fontSize: 14, width: "100%", boxSizing: "border-box" }),
  passwordWrap: { position: "relative" },
  showBtn: { position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#2b6cff", fontSize: 13, fontWeight: 700, cursor: "pointer", padding: 0 },
  rememberRow: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  rememberLabel: (c) => ({ display: "inline-flex", alignItems: "center", gap: 7, lineHeight: 1, fontSize: 13, color: c.textMuted, whiteSpace: "nowrap" }),
  forgotBtn: { background: "none", border: "none", color: "#2b6cff", fontSize: 13, fontWeight: 700, cursor: "pointer", padding: 0 },
  errorBox: (tone) => ({ background: tone.bg, border: `1px solid ${tone.border}`, borderRadius: 12, padding: "12px 14px", boxShadow: "0 10px 24px rgba(15,23,42,0.06)" }),
  warnBox: {},
  errorHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  errorTitle: (tone) => ({ fontSize: 14, fontWeight: 800, color: tone.title }),
  errorClose: (tone) => ({ background: "none", border: "none", color: tone.title, fontSize: 18, fontWeight: 700, cursor: "pointer", padding: 0, lineHeight: 1 }),
  errorMsg: (tone) => ({ margin: "6px 0 0", fontSize: 13, color: tone.body, lineHeight: 1.5 }),
  inlineCta: { display: "inline-block", marginTop: 10, padding: "8px 16px", borderRadius: 8, background: "#2b6cff", color: "#fff", fontSize: 13, fontWeight: 700, textDecoration: "none" },
  submitBtn: { padding: "14px", borderRadius: 14, border: "none", background: "#2b6cff", color: "#fff", fontSize: 16, fontWeight: 800, cursor: "pointer", boxShadow: "0 4px 20px rgba(43,108,255,0.35)" },
  footText: (c) => ({ textAlign: "center", fontSize: 13, color: c.textMuted, margin: "20px 0 0" }),
  link: { color: "#2b6cff", fontWeight: 700, textDecoration: "underline" },
};
