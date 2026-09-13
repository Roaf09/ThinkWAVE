import { useEffect, useRef, useState } from "react";
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

  return <div className="tw-otp-page min-h-screen flex flex-col relative overflow-hidden" style={{ background: c.pageBg, color: c.text }}>
    <div className="fixed w-[520px] h-[520px] rounded-full -top-[180px] -left-[110px] pointer-events-none" style={{ background: `radial-gradient(circle,${c.accent}24 0%,transparent 70%)` }} />
    <div className="fixed w-[420px] h-[420px] rounded-full -bottom-[120px] -right-[110px] pointer-events-none bg-[radial-gradient(circle,rgba(139,92,246,0.14)_0%,transparent_70%)]" />
    <PublicHeader compact hideSuper hideTheme />
    <main className="tw-otp-main grid place-items-center flex-1 px-5 pt-[34px] pb-[50px] z-[1]">
      <section className={`tw-otp-card tw-forgot-modern-card${step === "password" ? " is-password" : ""} p-[38px_34px] rounded-[26px]`} style={{ width: step === "password" ? "min(100%,760px)" : "min(100%,470px)", background: c.cardBg3 || c.cardBg, border: `1px solid ${c.border}`, boxShadow: dark ? "0 28px 90px rgba(0,0,0,.45)" : "0 28px 80px rgba(43,108,255,.16)" }}>
        <div className="text-center">
          <div className="flex justify-center mb-[14px]"><IconBubble name={step === "password" ? "lock" : "invitation"} c={c} size={58} iconSize={28} /></div>
          <h1 className="text-[27px] font-[950] m-[0_0_10px]" style={{ color: c.text }}>{title}</h1>
          <p className="text-sm leading-[1.7] m-[0_0_26px]" style={{ color: c.textMuted }}>{intro}</p>
        </div>

        {notice && <div className="rounded-[11px] p-[10px_13px] text-[13px] font-extrabold mb-4" style={{ color: notice.type === "success" ? c.greenFg : c.redFg, background: notice.type === "success" ? c.greenBg : c.redBg, border: `1px solid ${notice.type === "success" ? c.greenBorder : c.redBorder}` }}>{notice.text}</div>}

        {step === "email" && <form onSubmit={send} className="grid gap-4">
          <label className="grid gap-[7px] text-xs font-extrabold" style={label(c)}>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="you@example.com" className="px-[14px] py-3 rounded-xl text-sm w-full box-border" style={input(c)} /></label>
          <button className="tw-auth-primary w-full min-h-[51px] rounded-[14px] border-[3px] border-brand bg-brand text-white text-[15px] font-[950] shadow-[0_10px_24px_rgba(43,108,255,0.25)]" type="submit" disabled={busy} style={primary(c, busy)}>{busy ? "Sending…" : "Send OTP"}</button>
        </form>}

        {step === "otp" && <form onSubmit={verify}>
          <div onPaste={pasteOtp} className="flex gap-[9px] justify-center mb-5">
            {digits.map((digit, index) => <input key={index} ref={(node) => { refs.current[index] = node; }} inputMode="numeric" maxLength={1} value={digit} onChange={(event) => setDigit(index, event.target.value)} onKeyDown={(event) => handleOtpKey(index, event)} className="w-[50px] h-[62px] box-border rounded-[14px] text-[27px] font-[950] text-center outline-none caret-transparent transition-[border-color,transform] duration-150 ease-[ease]" style={{ border: `2px solid ${digit ? c.accent : c.inputBorder || c.border}`, background: c.inputBg || c.cardBg2, color: c.text }} />)}
          </div>
          <button className="tw-auth-primary w-full min-h-[51px] rounded-[14px] border-[3px] border-brand bg-brand text-white text-[15px] font-[950] shadow-[0_10px_24px_rgba(43,108,255,0.25)]" type="submit" disabled={busy || digits.join("").length < BOX_COUNT} style={primary(c, busy || digits.join("").length < BOX_COUNT)}>{busy ? "Verifying…" : "Verify OTP"}</button>
          <button type="button" disabled={seconds > 0 || busy} onClick={resend} className="w-full mt-3 border-0 bg-transparent font-black cursor-pointer" style={{ color: c.accent, opacity: seconds > 0 || busy ? .58 : 1 }}>{seconds > 0 ? `Resend in ${seconds}s` : "Resend code"}</button>
        </form>}

        {step === "password" && <div className="tw-forgot-password-grid grid grid-cols-[minmax(0,1fr)_minmax(230px,0.8fr)] gap-6 items-start">
          <form onSubmit={reset} className="grid gap-[15px]">
            <label className="grid gap-[7px] text-xs font-extrabold" style={label(c)}>New password<div className="relative mt-[7px]"><input type={showPw ? "text" : "password"} value={pw} onChange={(event) => setPw(event.target.value)} required placeholder="Create a password" className="px-4 py-3 rounded-xl text-sm w-full box-border outline-none transition-[border-color] duration-150 ease-[ease]" style={{ ...input(c), paddingRight: 48 }} /><button type="button" aria-label="Show password" onClick={() => setShowPw((v) => !v)} className={EYE_BTN_CLASS}><TwIcon name={showPw ? "eyeOff" : "eye"} size={19} /></button></div></label>
            <label className="grid gap-[7px] text-xs font-extrabold" style={label(c)}>Confirm password<div className="relative mt-[7px]"><input type={showConfirm ? "text" : "password"} value={confirm} onChange={(event) => setConfirm(event.target.value)} required placeholder="Confirm your password" className="px-4 py-3 rounded-xl text-sm w-full box-border outline-none transition-[border-color] duration-150 ease-[ease]" style={{ ...input(c), paddingRight: 48, borderColor: confirm ? (matches ? "#22c55e" : "#ef4444") : c.inputBorder }} /><button type="button" aria-label="Show confirm password" onClick={() => setShowConfirm((v) => !v)} className={EYE_BTN_CLASS}><TwIcon name={showConfirm ? "eyeOff" : "eye"} size={19} /></button></div></label>
            <button className="tw-auth-primary w-full min-h-[51px] rounded-[14px] border-[3px] border-brand bg-brand text-white text-[15px] font-[950] shadow-[0_10px_24px_rgba(43,108,255,0.25)]" type="submit" disabled={busy} style={primary(c, busy)}>{busy ? "Changing…" : "Change Password"}</button>
          </form>
          <aside className="rounded-2xl p-[17px] border border-solid" style={{ borderColor: c.border, background: c.cardBg2 }}>
            <h3 className="m-[0_0_13px] text-sm" style={{ color: c.text }}>Password requirements</h3>
            <div className="grid gap-[9px]">{Object.entries(requirements).map(([key, text]) => <div key={key} className="flex gap-2 items-center text-[12.5px] font-[750]" style={{ color: pc[key] ? c.greenFg : c.textMuted }}><span>{pc[key] ? "●" : "○"}</span><span>{text}</span></div>)}</div>
            <div className="mt-[13px] pt-3 border-t border-solid text-[12.5px] font-extrabold" style={{ borderColor: c.border, color: matches ? c.greenFg : c.textMuted }}>{matches ? "● Passwords match" : "○ Passwords match"}</div>
          </aside>
        </div>}

        <p className="text-center m-[22px_0_0]"><Link to="/login" className="text-brand font-black no-underline" style={{ color: c.accent }}>Back to login</Link></p>
      </section>
    </main>
    <ThemeIconButton dark={dark} onClick={toggleTheme} className="tw-landing-fixed-theme" size={22} />
  </div>;
}

const label = (c) => ({ color: c.textMuted });
const input = (c) => ({ border: `1px solid ${c.inputBorder || c.border}`, background: c.inputBg || c.cardBg2, color: c.text });
const primary = (_c, disabled) => ({ color: "#fff", opacity: disabled ? .58 : 1 });
const EYE_BTN_CLASS = "absolute right-[9px] top-1/2 -translate-y-1/2 w-[34px] h-[34px] grid place-items-center border-0 bg-transparent cursor-pointer";
