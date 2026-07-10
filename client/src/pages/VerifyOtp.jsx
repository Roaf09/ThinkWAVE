/* FILE GUIDE:
 * client/src/pages/VerifyOtp.jsx
 * Purpose: OTP verification flow shown after registration.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

// thinkwave/client/src/pages/VerifyOtp.jsx
// FULL FILE — aesthetic OTP entry, similar to student code entry

import React, { useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams, Link } from "react-router-dom";
import { api } from "../lib/api";

const BOX_COUNT = 6;

export default function VerifyOtp() {
  const nav = useNavigate();
  const loc = useLocation();
  const [sp] = useSearchParams();
  const mode = loc.state?.loginMode || sp.get("mode") || (loc.state?.adminPending ? "admin" : "teacher");
  const [email,   setEmail]   = useState(loc.state?.email || sp.get("email") || "");
  const [digits,  setDigits]  = useState(Array(BOX_COUNT).fill(""));
  const [msg,     setMsg]     = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const isAdminPending = mode === "admin";

  const refs = useRef([]);

  function handleDigit(idx, val) {
    const clean = val.replace(/\D/g, "").slice(-1);
    const next  = [...digits];
    next[idx]   = clean;
    setDigits(next);
    if (clean && idx < BOX_COUNT - 1) refs.current[idx + 1]?.focus();
  }

  function handleKeyDown(idx, e) {
    if (e.key === "Backspace" && !digits[idx] && idx > 0) {
      refs.current[idx - 1]?.focus();
    }
  }

  function handlePaste(e) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, BOX_COUNT);
    if (!pasted) return;
    const next = [...digits];
    pasted.split("").forEach((ch, i) => { next[i] = ch; });
    setDigits(next);
    refs.current[Math.min(pasted.length, BOX_COUNT - 1)]?.focus();
  }

  async function submit(e) {
    e.preventDefault();
    const code = digits.join("");
    if (code.length < BOX_COUNT) return setMsg("Please enter all 6 digits.");
    setLoading(true); setMsg("");
    try {
      await api.post("/auth/verify-otp", { email, code });
      setSuccess(true);
      const nextLogin = mode === "admin"
        ? "/login?role=admin"
        : mode === "superadmin"
        ? "/superadmin-login"
        : mode === "student"
        ? "/student-login"
        : "/login";
      setTimeout(() => nav(nextLogin), 2000);
    } catch (err) {
      setMsg(err?.response?.data?.message || "Invalid or expired OTP.");
    } finally { setLoading(false); }
  }

  return (
    <div style={s.page}>
      <div style={s.blob1} /> <div style={s.blob2} />

      <div style={s.logo}>
        <Link to="/" style={{ textDecoration:"none" }}>
          <span style={s.logoThink}>Think</span>
          <span style={s.logoWave}>WAVE</span>
        </Link>
      </div>

      <div style={s.center}>
        {success ? (
          <div style={s.card}>
            <div style={{ fontSize:52, marginBottom:14 }}>✅</div>
            <h2 style={s.cardTitle}>Verified!</h2>
            <p style={s.cardSub}>
              {mode === "admin" ? "Your admin account is verified! Redirecting you to admin login…" : mode === "superadmin" ? "Your superadmin account is verified! Redirecting you to login…" : mode === "student" ? "Your student account is verified! Redirecting you to student login…" : "Your account is verified! Redirecting you to login…"}
            </p>
          </div>
        ) : (
          <div style={s.card}>
            <div style={{ fontSize:44, marginBottom:10 }}>📧</div>
            <h2 style={s.cardTitle}>Check your email</h2>
            <p style={s.cardSub}>
              We sent a 6-digit code to <b style={{ color:"#e7e9ee" }}>{email || "your email"}</b>.
              {isAdminPending && <><br/><span style={{ color:"#22c55e", fontSize:12 }}>Admin account — you can log in right after verifying.</span></>}
            </p>

            {!email && (
              <div style={{ marginBottom:16 }}>
                <label style={s.miniLabel}>Email address</label>
                <input type="email" value={email} onChange={e=>setEmail(e.target.value)}
                  placeholder="you@example.com" style={s.emailInput} />
              </div>
            )}

            <form onSubmit={submit}>
              {/* 6 digit boxes */}
              <div style={s.boxRow} onPaste={handlePaste}>
                {digits.map((d, i) => (
                  <input
                    key={i}
                    ref={el => refs.current[i] = el}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={d}
                    onChange={e => handleDigit(i, e.target.value)}
                    onKeyDown={e => handleKeyDown(i, e)}
                    style={{
                      ...s.digitBox,
                      borderColor: d ? "#2b6cff" : "#2a3b73",
                      color: d ? "#e7e9ee" : "#4a5a8a",
                    }}
                    autoFocus={i === 0}
                  />
                ))}
              </div>

              {msg && (
                <p style={s.error}>{msg}</p>
              )}

              <button type="submit" disabled={loading || digits.join("").length < BOX_COUNT} style={{
                ...s.verifyBtn,
                opacity: (loading || digits.join("").length < BOX_COUNT) ? 0.6 : 1,
              }}>
                {loading ? "Verifying…" : "Verify"}
              </button>
            </form>

            <p style={s.hint}>
              If email isn't configured, check the server console for the OTP.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

const s = {
  page:      { minHeight:"100vh", background:"#080e1f", display:"flex", flexDirection:"column", alignItems:"center", fontFamily:"'Segoe UI',system-ui,sans-serif", color:"#e7e9ee", position:"relative", overflow:"hidden" },
  blob1:     { position:"fixed", width:500, height:500, borderRadius:"50%", background:"radial-gradient(circle,rgba(43,108,255,0.15) 0%,transparent 70%)", top:-150, left:-100, pointerEvents:"none" },
  blob2:     { position:"fixed", width:400, height:400, borderRadius:"50%", background:"radial-gradient(circle,rgba(139,92,246,0.10) 0%,transparent 70%)", bottom:-100, right:-100, pointerEvents:"none" },
  logo:      { padding:"24px 0 0", zIndex:1, marginBottom:32 },
  logoThink: { fontSize:28, fontWeight:900, color:"#e7e9ee" },
  logoWave:  { fontSize:28, fontWeight:900, color:"#2b6cff" },
  center:    { display:"flex", alignItems:"center", justifyContent:"center", flex:1, padding:"0 20px 40px", width:"100%", zIndex:1 },
  card:      { background:"#0e1733", border:"1px solid #1e2d55", borderRadius:24, padding:"40px 36px", width:"min(100%,440px)", textAlign:"center", boxShadow:"0 24px 80px rgba(0,0,0,0.5)" },
  cardTitle: { fontSize:26, fontWeight:900, margin:"0 0 10px", letterSpacing:"-0.5px" },
  cardSub:   { fontSize:14, color:"#8a9bc4", lineHeight:1.7, margin:"0 0 28px" },
  miniLabel: { display:"block", fontSize:12, color:"#8a9bc4", fontWeight:600, marginBottom:6, textAlign:"left" },
  emailInput:{ width:"100%", boxSizing:"border-box", padding:"12px 14px", borderRadius:12, border:"1px solid #2a3b73", background:"#0d1b2e", color:"#e7e9ee", fontSize:14, marginBottom:4 },
  boxRow:    { display:"flex", gap:10, justifyContent:"center", marginBottom:20 },
  digitBox:  {
    width:52, height:64, borderRadius:14,
    border:"2px solid #2a3b73", background:"#0d1b2e",
    fontSize:28, fontWeight:900, textAlign:"center",
    color:"#e7e9ee", outline:"none",
    transition:"border-color 0.15s",
    caretColor:"transparent",
  },
  error:     { fontSize:13, color:"#f87171", background:"#2a0f0f", borderRadius:10, padding:"10px 14px", margin:"0 0 16px" },
  verifyBtn: { width:"100%", padding:"15px", borderRadius:50, border:"none", background:"#2b6cff", color:"#fff", fontSize:16, fontWeight:800, cursor:"pointer", boxShadow:"0 4px 20px rgba(43,108,255,0.35)", transition:"opacity 0.15s", marginBottom:16 },
  hint:      { fontSize:12, color:"#4a5a8a", lineHeight:1.6, margin:0 },
};