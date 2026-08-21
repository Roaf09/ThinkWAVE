import React, { useEffect, useRef, useState } from "react";
import PublicHeader from "../components/PublicHeader";
import ThemeIconButton from "../components/ThemeIconButton";
import { IconBubble, TwIcon } from "../components/TwUI";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useColors, useTheme } from "../context/ThemeContext";

const BOX_COUNT = 6;
const requirements = {
  len: "At least 8 characters",
  upper: "At least 1 uppercase letter",
  lower: "At least 1 lowercase letter",
  num: "At least 1 number",
  sym: "At least 1 special character",
};
const checks = (p) => ({ len: p.length >= 8, upper: /[A-Z]/.test(p), lower: /[a-z]/.test(p), num: /[0-9]/.test(p), sym: /[^A-Za-z0-9]/.test(p) });

export default function ForgotPassword() {
  const nav = useNavigate();
  const c = useColors();
  const { dark, toggleTheme } = useTheme();
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [digits, setDigits] = useState(Array(BOX_COUNT).fill(""));
  const [token, setToken] = useState("");
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const refs = useRef([]);
  const pc = checks(pw);
  const strong = Object.values(pc).every(Boolean);
  const matches = !!pw && pw === confirm;

  useEffect(() => {
    if (seconds <= 0) return undefined;
    const id = window.setInterval(() => setSeconds((v) => Math.max(0, v - 1)), 1000);
    return () => window.clearInterval(id);
  }, [seconds]);

  function flash(text, type = "error") { setNotice({ text, type }); }
  function setDigit(index, value) {
    const clean = value.replace(/\D/g, "").slice(-1);
    setDigits((current) => current.map((digit, i) => i === index ? clean : digit));
    if (clean && index < BOX_COUNT - 1) refs.current[index + 1]?.focus();
  }
  function handleOtpKey(index, event) {
    if (event.key === "Backspace" && !digits[index] && index > 0) refs.current[index - 1]?.focus();
  }
  function pasteOtp(event) {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, BOX_COUNT);
    if (!pasted) return;
    event.preventDefault();
    const next = Array(BOX_COUNT).fill("");
    pasted.split("").forEach((digit, index) => { next[index] = digit; });
    setDigits(next);
    refs.current[Math.min(pasted.length, BOX_COUNT - 1)]?.focus();
  }

  async function send(event) {
    event?.preventDefault();
    setNotice(null);
    if (!/^\S+@\S+\.\S+$/.test(email)) return flash("Enter a valid email address.");
    setBusy(true);
    try {
      const { data } = await api.post("/auth/password/request-reset", { email: email.trim() });
      setStep("otp");
      setSeconds(30);
      setDigits(Array(BOX_COUNT).fill(""));
      flash(data.emailSent ? "OTP sent to your email." : data.devOtp ? `Testing OTP: ${data.devOtp}` : (data.deliveryWarning || "OTP generated; check the server terminal."), "success");
      window.setTimeout(() => refs.current[0]?.focus(), 50);
    } catch (error) { flash(error?.response?.data?.message || "Could not send OTP."); }
    finally { setBusy(false); }
  }

  async function resend() {
    if (seconds > 0 || busy) return;
    await send();
  }

  async function verify(event) {
    event.preventDefault();
    setNotice(null);
    const code = digits.join("");
    if (!/^\d{6}$/.test(code)) return flash("Enter the six-digit OTP code.");
    setBusy(true);
    try {
      const { data } = await api.post("/auth/password/verify-reset", { email: email.trim(), code });
      setToken(data.resetToken);
      setStep("password");
      setNotice(null);
    } catch (error) { flash(error?.response?.data?.message || "Invalid or expired OTP."); }
    finally { setBusy(false); }
  }

  async function reset(event) {
    event.preventDefault();
    setNotice(null);
    if (!strong) return flash("Password must satisfy every requirement.");
    if (!matches) return flash("Passwords do not match.");
    setBusy(true);
    try {
      await api.post("/auth/password/confirm-reset", { resetToken: token, newPassword: pw });
      flash("Password changed successfully.", "success");
      window.setTimeout(() => nav("/login"), 1000);
    } catch (error) { flash(error?.response?.data?.message || "Password reset failed."); }
    finally { setBusy(false); }
  }

  const title = step === "email" ? "Reset your password" : step === "otp" ? "Check your email" : "Create a new password";
  const intro = step === "email" ? "Enter your account email and we’ll send a 6-digit reset code." : step === "otp" ? <>We sent a 6-digit code to <b style={{ color: c.text }}>{email}</b>.</> : "Choose a strong new password for your ThinkWAVE account.";

  return <div className="tw-otp-page" style={{ minHeight: "100vh", background: c.pageBg, color: c.text, display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
    <div style={{ position: "fixed", width: 520, height: 520, borderRadius: "50%", background: `radial-gradient(circle,${c.accent}24 0%,transparent 70%)`, top: -180, left: -110, pointerEvents: "none" }} />
    <div style={{ position: "fixed", width: 420, height: 420, borderRadius: "50%", background: "radial-gradient(circle,rgba(139,92,246,.14) 0%,transparent 70%)", bottom: -120, right: -110, pointerEvents: "none" }} />
    <PublicHeader compact hideSuper hideTheme />
    <main className="tw-otp-main" style={{ display: "grid", placeItems: "center", flex: 1, padding: "34px 20px 50px", zIndex: 1 }}>
      <section className={`tw-otp-card tw-forgot-modern-card${step === "password" ? " is-password" : ""}`} style={{ width: step === "password" ? "min(100%,760px)" : "min(100%,470px)", padding: "38px 34px", borderRadius: 26, background: c.cardBg3 || c.cardBg, border: `1px solid ${c.border}`, boxShadow: dark ? "0 28px 90px rgba(0,0,0,.45)" : "0 28px 80px rgba(43,108,255,.16)" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}><IconBubble name={step === "password" ? "lock" : "invitation"} c={c} size={58} iconSize={28} /></div>
          <h1 style={{ fontSize: 27, fontWeight: 950, margin: "0 0 10px", color: c.text }}>{title}</h1>
          <p style={{ fontSize: 14, color: c.textMuted, lineHeight: 1.7, margin: "0 0 26px" }}>{intro}</p>
        </div>

        {notice && <div style={{ color: notice.type === "success" ? c.greenFg : c.redFg, background: notice.type === "success" ? c.greenBg : c.redBg, border: `1px solid ${notice.type === "success" ? c.greenBorder : c.redBorder}`, borderRadius: 11, padding: "10px 13px", fontSize: 13, fontWeight: 800, marginBottom: 16 }}>{notice.text}</div>}

        {step === "email" && <form onSubmit={send} style={{ display: "grid", gap: 16 }}>
          <label style={label(c)}>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="you@example.com" style={input(c)} /></label>
          <button className="tw-auth-primary" type="submit" disabled={busy} style={primary(c, busy)}>{busy ? "Sending…" : "Send OTP"}</button>
        </form>}

        {step === "otp" && <form onSubmit={verify}>
          <div onPaste={pasteOtp} style={{ display: "flex", gap: 9, justifyContent: "center", marginBottom: 20 }}>
            {digits.map((digit, index) => <input key={index} ref={(node) => { refs.current[index] = node; }} inputMode="numeric" maxLength={1} value={digit} onChange={(event) => setDigit(index, event.target.value)} onKeyDown={(event) => handleOtpKey(index, event)} style={{ width: 50, height: 62, boxSizing: "border-box", borderRadius: 14, border: `2px solid ${digit ? c.accent : c.inputBorder || c.border}`, background: c.inputBg || c.cardBg2, color: c.text, fontSize: 27, fontWeight: 950, textAlign: "center", outline: "none", caretColor: "transparent" }} />)}
          </div>
          <button className="tw-auth-primary" type="submit" disabled={busy || digits.join("").length < BOX_COUNT} style={primary(c, busy || digits.join("").length < BOX_COUNT)}>{busy ? "Verifying…" : "Verify OTP"}</button>
          <button type="button" disabled={seconds > 0 || busy} onClick={resend} style={{ width: "100%", marginTop: 12, border: 0, background: "transparent", color: c.accent, fontWeight: 900, cursor: seconds > 0 || busy ? "default" : "pointer", opacity: seconds > 0 || busy ? .58 : 1 }}>{seconds > 0 ? `Resend in ${seconds}s` : "Resend code"}</button>
        </form>}

        {step === "password" && <div className="tw-forgot-password-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(230px,.8fr)", gap: 24, alignItems: "start" }}>
          <form onSubmit={reset} style={{ display: "grid", gap: 15 }}>
            <label style={label(c)}>New password<div style={{ position: "relative", marginTop: 7 }}><input type={showPw ? "text" : "password"} value={pw} onChange={(event) => setPw(event.target.value)} required placeholder="Create a password" style={{ ...input(c), paddingRight: 48 }} /><button type="button" aria-label="Show password" onClick={() => setShowPw((v) => !v)} style={eyeButton}><TwIcon name={showPw ? "eyeOff" : "eye"} size={19} /></button></div></label>
            <label style={label(c)}>Confirm password<div style={{ position: "relative", marginTop: 7 }}><input type={showConfirm ? "text" : "password"} value={confirm} onChange={(event) => setConfirm(event.target.value)} required placeholder="Confirm your password" style={{ ...input(c), paddingRight: 48, borderColor: confirm ? (matches ? c.greenBorder : c.redBorder) : c.inputBorder }} /><button type="button" aria-label="Show confirm password" onClick={() => setShowConfirm((v) => !v)} style={eyeButton}><TwIcon name={showConfirm ? "eyeOff" : "eye"} size={19} /></button></div></label>
            <button className="tw-auth-primary" type="submit" disabled={busy} style={primary(c, busy)}>{busy ? "Changing…" : "Change Password"}</button>
          </form>
          <aside style={{ border: `1px solid ${c.border}`, borderRadius: 16, background: c.cardBg2, padding: 17 }}>
            <h3 style={{ margin: "0 0 13px", fontSize: 14, color: c.text }}>Password requirements</h3>
            <div style={{ display: "grid", gap: 9 }}>{Object.entries(requirements).map(([key, text]) => <div key={key} style={{ display: "flex", gap: 8, alignItems: "center", color: pc[key] ? c.greenFg : c.textMuted, fontSize: 12.5, fontWeight: 750 }}><span>{pc[key] ? "●" : "○"}</span><span>{text}</span></div>)}</div>
            <div style={{ marginTop: 13, paddingTop: 12, borderTop: `1px solid ${c.border}`, color: matches ? c.greenFg : c.textMuted, fontSize: 12.5, fontWeight: 800 }}>{matches ? "● Passwords match" : "○ Passwords match"}</div>
          </aside>
        </div>}

        <p style={{ textAlign: "center", margin: "22px 0 0" }}><Link to="/login" style={{ color: c.accent, fontWeight: 900, textDecoration: "none" }}>Back to login</Link></p>
      </section>
    </main>
    <ThemeIconButton dark={dark} onClick={toggleTheme} className="tw-landing-fixed-theme" size={22} />
  </div>;
}

const label = (c) => ({ display: "grid", gap: 7, color: c.textMuted, fontSize: 12, fontWeight: 800 });
const input = (c) => ({ width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 12, border: `1px solid ${c.inputBorder || c.border}`, background: c.inputBg || c.cardBg2, color: c.text, fontSize: 14, outline: "none" });
const primary = (c, disabled) => ({ width: "100%", minHeight: 51, borderRadius: 14, border: 0, background: c.accent, color: "#fff", fontSize: 15, fontWeight: 950, cursor: disabled ? "default" : "pointer", opacity: disabled ? .58 : 1, boxShadow: `0 13px 30px ${c.accent}35` });
const eyeButton = { position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", width: 34, height: 34, display: "grid", placeItems: "center", border: 0, background: "transparent", cursor: "pointer" };
