/* FILE GUIDE:
 * client/src/pages/VerifyOtp.jsx
 * Purpose: Shared OTP verification form for teacher, student, admin, and superadmin accounts.
 */

import React, { useRef, useState } from "react";
import PublicHeader from "../components/PublicHeader";
import { IconBubble, TwIcon } from "../components/TwUI";
import { useColors, useTheme } from "../context/ThemeContext";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";

const BOX_COUNT = 6;

export default function VerifyOtp() {
  const nav = useNavigate();
  const c = useColors();
  const { dark } = useTheme();
  const loc = useLocation();
  const [sp] = useSearchParams();
  const mode = loc.state?.loginMode || sp.get("mode") || (loc.state?.adminPending ? "admin" : "teacher");
  const [email, setEmail] = useState(loc.state?.email || sp.get("email") || "");
  const [digits, setDigits] = useState(Array(BOX_COUNT).fill(""));
  const [msg, setMsg] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const refs = useRef([]);

  function handleDigit(idx, val) {
    const clean = val.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[idx] = clean;
    setDigits(next);
    if (clean && idx < BOX_COUNT - 1) refs.current[idx + 1]?.focus();
  }

  function handleKeyDown(idx, event) {
    if (event.key === "Backspace" && !digits[idx] && idx > 0) refs.current[idx - 1]?.focus();
  }

  function handlePaste(event) {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, BOX_COUNT);
    if (!pasted) return;
    const next = [...digits];
    pasted.split("").forEach((ch, i) => { next[i] = ch; });
    setDigits(next);
    refs.current[Math.min(pasted.length, BOX_COUNT - 1)]?.focus();
  }

  async function submit(event) {
    event.preventDefault();
    const code = digits.join("");
    if (code.length < BOX_COUNT) return setMsg("Please enter all 6 digits.");
    setLoading(true);
    setMsg("");
    try {
      await api.post("/auth/verify-otp", { email, code });
      setSuccess(true);
      const nextLogin = mode === "admin" ? "/login?role=admin" : mode === "superadmin" ? "/superadmin-login" : mode === "student" ? "/student-login" : "/login";
      setTimeout(() => nav(nextLogin), 2000);
    } catch (error) {
      setMsg(error?.response?.data?.message || "Invalid or expired OTP.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: c.pageBg, color: c.text, display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "fixed", width: 520, height: 520, borderRadius: "50%", background: `radial-gradient(circle,${c.accent}24 0%,transparent 70%)`, top: -180, left: -110, pointerEvents: "none" }} />
      <div style={{ position: "fixed", width: 420, height: 420, borderRadius: "50%", background: "radial-gradient(circle,rgba(139,92,246,.14) 0%,transparent 70%)", bottom: -120, right: -110, pointerEvents: "none" }} />
      <PublicHeader compact />

      <div style={{ display: "grid", placeItems: "center", flex: 1, padding: "34px 20px 50px", zIndex: 1 }}>
        <div style={{ width: "min(100%,470px)", padding: "38px 34px", borderRadius: 26, textAlign: "center", background: c.cardBg3 || c.cardBg, border: `1px solid ${c.border}`, boxShadow: dark ? "0 28px 90px rgba(0,0,0,.45)" : "0 28px 80px rgba(43,108,255,.16)" }}>
          {success ? <SuccessContent mode={mode} c={c} /> : <>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}><IconBubble name="invitation" c={c} size={58} iconSize={28} /></div>
            <h2 style={{ fontSize: 27, fontWeight: 950, margin: "0 0 10px", color: c.text }}>Check your email</h2>
            <p style={{ fontSize: 14, color: c.textMuted, lineHeight: 1.7, margin: "0 0 28px" }}>We sent a 6-digit code to <b style={{ color: c.text }}>{email || "your email"}</b>.</p>

            {!email && <label style={{ display: "grid", gap: 7, textAlign: "left", color: c.textMuted, fontSize: 12, fontWeight: 800, marginBottom: 17 }}>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" style={input(c)} /></label>}

            <form onSubmit={submit}>
              <div onPaste={handlePaste} style={{ display: "flex", gap: 9, justifyContent: "center", marginBottom: 20 }}>
                {digits.map((digit, index) => <input key={index} ref={(element) => { refs.current[index] = element; }} type="text" inputMode="numeric" maxLength={1} value={digit} onChange={(event) => handleDigit(index, event.target.value)} onKeyDown={(event) => handleKeyDown(index, event)} autoFocus={index === 0} style={{ width: 50, height: 62, boxSizing: "border-box", borderRadius: 14, border: `2px solid ${digit ? c.accent : c.inputBorder || c.border}`, background: c.inputBg || c.cardBg2, color: c.text, fontSize: 27, fontWeight: 950, textAlign: "center", outline: "none", caretColor: "transparent", transition: "border-color .15s,transform .15s" }} />)}
              </div>
              {msg && <div style={{ color: c.redFg, background: c.redBg, border: `1px solid ${c.redBorder}`, borderRadius: 11, padding: "10px 13px", fontSize: 13, fontWeight: 800, marginBottom: 16 }}>{msg}</div>}
              <button type="submit" disabled={loading || digits.join("").length < BOX_COUNT} style={{ width: "100%", minHeight: 51, borderRadius: 14, border: 0, background: c.accent, color: "#fff", fontSize: 15, fontWeight: 950, cursor: "pointer", opacity: loading || digits.join("").length < BOX_COUNT ? .55 : 1, boxShadow: `0 13px 30px ${c.accent}35` }}>{loading ? "Verifying…" : "Verify"}</button>
            </form>
          </>}
        </div>
      </div>
    </div>
  );
}

function SuccessContent({ mode, c }) {
  const label = mode === "admin" ? "admin" : mode === "superadmin" ? "superadmin" : mode === "student" ? "student" : "teacher";
  return <><div style={{ display: "flex", justifyContent: "center", marginBottom: 15 }}><span style={{ width: 70, height: 70, borderRadius: 22, display: "grid", placeItems: "center", color: c.greenFg, background: c.greenBg, border: `2px solid ${c.greenBorder}` }}><TwIcon name="check" size={38} strokeWidth={3.2} /></span></div><h2 style={{ fontSize: 27, fontWeight: 950, margin: "0 0 10px", color: c.text }}>Verified!</h2><p style={{ color: c.textMuted, lineHeight: 1.7, margin: 0 }}>Your {label} account is verified. Redirecting you to login…</p></>;
}

function input(c) { return { width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 12, border: `1px solid ${c.inputBorder || c.border}`, background: c.inputBg || c.cardBg2, color: c.text, fontSize: 14 }; }
