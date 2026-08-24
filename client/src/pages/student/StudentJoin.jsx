/* FILE GUIDE:
 * client/src/pages/student/StudentJoin.jsx
 * Purpose: Student entry page that accepts join codes and handles rejoin setup.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";
import { useTheme } from "../../context/ThemeContext";
import ThemeIconButton from "../../components/ThemeIconButton";

// StudentJoin handles the code-entry flow before the live player screen opens.
export default function StudentJoin() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const { dark, toggleTheme } = useTheme();

  const prefilled = sp.get("code") || "";
  const code = prefilled;
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!prefilled) nav("/?join=guest", { replace: true });
  }, [nav, prefilled]);

  if (!prefilled) return null;

  async function handleJoin(e) {
    e.preventDefault();
    setMsg("");
    setLoading(true);
    try {
      const { data } = await api.post("/sessions/join", {
        code: code.trim().toUpperCase(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      localStorage.setItem("qz_reconnectKey", data.reconnectKey);
      localStorage.setItem("qz_participantId", String(data.participantId));
      localStorage.setItem("qz_sessionId", String(data.sessionId));
      localStorage.setItem("qz_joinMode", data.joinMode || "SOLO");
      const isGuestHostVisitor = localStorage.getItem("qz_guest_mode") === "1";
      if (isGuestHostVisitor) {
        const key = `tw_guest_join_count_${code.trim().toUpperCase()}`;
        const count = Number(localStorage.getItem(key) || 0) + 1;
        localStorage.setItem(key, String(count));
        if (count === 2) {
          const create = window.confirm("We noticed that you have joined this teacher's class twice. Would you like to create a student account?");
          if (create) { nav("/student-login?mode=register"); return; }
        }
      }
      nav(`/play/${data.sessionId}`);
    } catch (err) {
      setMsg(err?.response?.data?.message || "Could not join. Check your code and try again.");
      setLoading(false);
    }
  }

  const pageBg = dark ? "#080e1f" : "#f0f4ff";
  const cardBg = dark ? "#0e1733" : "#ffffff";
  const cardBor = dark ? "#1e2d55" : "#c7d7ff";
  const textC = dark ? "#e7e9ee" : "#0f172a";
  const mutedC = dark ? "#8a9bc4" : "#5a6a9a";
  const inputBg = dark ? "#0d1b2e" : "#eef2ff";
  const inputBor = dark ? "#2a3b73" : "#a5b8f5";

  return (
    <div style={{ ...s.page, background: pageBg, transition: "background 0.3s" }}>
      <div style={s.blob1} />
      <div style={s.blob2} />

      <ThemeIconButton dark={dark} onClick={toggleTheme} className="tw-guest-join-theme" size={20} />

      <Link to="/" aria-label="Back to ThinkWAVE landing page" className="tw-guest-join-logo" style={s.logo}>
        <span style={{ ...s.logoThink, color: textC }}>Think</span>
        <span style={s.logoWave}>WAVE</span>
      </Link>

      <div style={{ ...s.card, background: cardBg, border: `1px solid ${cardBor}` }}>
          <p style={{ ...s.cardLabel, color: textC }}>What's your name?</p>
          <p style={{ fontSize: 13, color: mutedC, margin: "0 0 20px", textAlign: "center" }}>
            Code: <b style={{ color: textC, letterSpacing: 2 }}>{code}</b>
          </p>
          <form onSubmit={handleJoin} style={s.form}>
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" required autoFocus style={{ ...s.nameInput, background: inputBg, border: `1px solid ${inputBor}`, color: textC }} />
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name (optional)" style={{ ...s.nameInput, background: inputBg, border: `1px solid ${inputBor}`, color: textC }} />
            {msg && <p style={s.errMsg}>{msg}</p>}
            <button type="submit" disabled={loading} className="tw-guest-join-primary" style={{ ...s.joinBtn, opacity: loading ? 0.7 : 1 }}>{loading ? "Joining…" : "Join Session"}</button>
            <button type="button" onClick={() => nav("/?join=guest")} style={{ ...s.backLink, color: mutedC }}>Change code</button>
          </form>
        </div>

      <p style={{ color: mutedC, fontSize: 12, marginTop: 20, zIndex: 1 }}>No account needed · Just your name and code</p>
    </div>
  );
}

const s = {
  page: { minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI',system-ui,sans-serif", position: "relative", overflow: "hidden", padding: "20px 20px 40px" },
  blob1: { position: "fixed", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle,rgba(43,108,255,0.12) 0%,transparent 70%)", top: -150, left: -100, pointerEvents: "none" },
  blob2: { position: "fixed", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle,rgba(139,92,246,0.08) 0%,transparent 70%)", bottom: -100, right: -100, pointerEvents: "none" },
  topBar: { position: "fixed", top: 16, left: 16, right: 16, display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 10 },
  topLink: { border: "1px solid", borderRadius: 20, padding: "8px 14px", textDecoration: "none", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  logo: { display: "flex", alignItems: "baseline", marginBottom: 28, zIndex: 1, textDecoration: "none", cursor: "pointer" },
  logoThink: { fontSize: 32, fontWeight: 900 },
  logoWave: { fontSize: 32, fontWeight: 900, color: "#2b6cff" },
  card: { borderRadius: 24, padding: "36px 32px", width: "min(100%,420px)", zIndex: 1, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" },
  cardLabel: { textAlign: "center", fontWeight: 900, fontSize: 20, margin: "0 0 4px" },
  form: { display: "flex", flexDirection: "column", gap: 12 },
  codeInput: { padding: "16px", borderRadius: 14, fontSize: 28, fontWeight: 900, textAlign: "center", letterSpacing: "0.2em", width: "100%", boxSizing: "border-box", outline: "none" },
  nameInput: { padding: "14px 16px", borderRadius: 12, fontSize: 16, width: "100%", boxSizing: "border-box", outline: "none" },
  errMsg: { fontSize: 13, color: "#f87171", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.2)", padding: "10px 12px", borderRadius: 12, margin: 0 },
  joinBtn: { marginTop: 4, padding: "14px 16px", borderRadius: 999, border: "none", background: "#2b6cff", color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer", boxShadow: "0 12px 30px rgba(43,108,255,0.28)" },
  backLink: { background: "transparent", border: "none", fontSize: 13, cursor: "pointer", fontWeight: 700 },
};
