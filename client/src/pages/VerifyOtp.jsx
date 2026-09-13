/* FILE GUIDE:
 * client/src/pages/VerifyOtp.jsx
 * Purpose: Shared OTP verification form for teacher, student, admin, and superadmin accounts.
 */

import { useRef, useState } from "react";
import PublicHeader from "../components/PublicHeader";
import { IconBubble, TwIcon } from "../components/TwUI";
import { useColors, useTheme } from "../context/ThemeContext";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import ThemeIconButton from "../components/ThemeIconButton";

const BOX_COUNT = 6;

export default function VerifyOtp() {
  const nav = useNavigate();
  const c = useColors();
  const { dark, toggleTheme } = useTheme();
  const loc = useLocation();
  const [sp] = useSearchParams();
  const mode = loc.state?.loginMode || sp.get("mode") || (loc.state?.adminPending ? "admin" : "teacher");
  const [email, setEmail] = useState(loc.state?.email || sp.get("email") || "");
  const [digits, setDigits] = useState(Array(BOX_COUNT).fill(""));
  const [msg, setMsg] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
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

  async function resend() {
    if (!email) return setMsg("Enter your email address first.");
    setResending(true); setMsg("");
    try {
      const { data } = await api.post("/auth/resend-otp", { email });
      setDigits(Array(BOX_COUNT).fill(""));
      setMsg(data.emailSent ? "A new code was sent to your email." : "A new code was generated. Check the server terminal for the test OTP.");
      refs.current[0]?.focus();
    } catch (error) { setMsg(error?.response?.data?.message || "Could not resend the code."); }
    finally { setResending(false); }
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
    <div className="tw-otp-page min-h-screen flex flex-col relative overflow-hidden" style={{ background: c.pageBg, color: c.text }}>
      <div className="fixed w-[520px] h-[520px] rounded-full -top-[180px] -left-[110px] pointer-events-none" style={{ background: `radial-gradient(circle,${c.accent}24 0%,transparent 70%)` }} />
      <div className="fixed w-[420px] h-[420px] rounded-full -bottom-[120px] -right-[110px] pointer-events-none bg-[radial-gradient(circle,rgba(139,92,246,0.14)_0%,transparent_70%)]" />
      <PublicHeader compact hideSuper hideTheme />

      <div className="tw-otp-main grid place-items-center flex-1 px-5 pt-[34px] pb-[50px] z-[1]">
        <div className="tw-otp-card w-[min(100%,470px)] p-[38px_34px] rounded-[26px] text-center" style={{ background: c.cardBg3 || c.cardBg, border: `1px solid ${c.border}`, boxShadow: dark ? "0 28px 90px rgba(0,0,0,.45)" : "0 28px 80px rgba(43,108,255,.16)" }}>
          {success ? <SuccessContent mode={mode} c={c} /> : <>
            <div className="tw-otp-icon-wrap flex justify-center mb-[14px]"><IconBubble name="invitation" c={c} size={58} iconSize={28} /></div>
            <h2 className="text-[27px] font-[950] m-[0_0_10px]" style={{ color: c.text }}>Check your email</h2>
            <p className="tw-otp-intro text-sm leading-[1.7] m-[0_0_28px]" style={{ color: c.textMuted }}>We sent a 6-digit code to <b style={{ color: c.text }}>{email || "your email"}</b>.</p>

            {!email && <label className="grid gap-[7px] text-left text-xs font-extrabold mb-[17px]" style={{ color: c.textMuted }}>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" className="px-[14px] py-3 rounded-xl text-sm w-full box-border" style={input(c)} /></label>}

            <form onSubmit={submit}>
              <div className="tw-otp-digits flex gap-[9px] justify-center mb-5" onPaste={handlePaste}>
                {digits.map((digit, index) => <input key={index} ref={(element) => { refs.current[index] = element; }} type="text" inputMode="numeric" maxLength={1} value={digit} onChange={(event) => handleDigit(index, event.target.value)} onKeyDown={(event) => handleKeyDown(index, event)} autoFocus={index === 0} className="w-[50px] h-[62px] box-border rounded-[14px] text-[27px] font-[950] text-center outline-none caret-transparent transition-[border-color,transform] duration-150 ease-[ease]" style={{ border: `2px solid ${digit ? c.accent : c.inputBorder || c.border}`, background: c.inputBg || c.cardBg2, color: c.text }} />)}
              </div>
              {msg && <div className="rounded-[11px] p-[10px_13px] text-[13px] font-extrabold mb-4" style={{ color: c.redFg, background: c.redBg, border: `1px solid ${c.redBorder}` }}>{msg}</div>}
              <button type="submit" disabled={loading || digits.join("").length < BOX_COUNT} className="w-full min-h-[51px] rounded-[14px] border-0 text-white text-[15px] font-[950] cursor-pointer" style={{ background: c.accent, opacity: loading || digits.join("").length < BOX_COUNT ? .55 : 1, boxShadow: `0 13px 30px ${c.accent}35` }}>{loading ? "Verifying…" : "Verify"}</button>
              <button type="button" onClick={resend} disabled={resending} className="mt-3 border-0 bg-transparent font-black cursor-pointer" style={{color:c.accent,opacity:resending?.6:1}}>{resending?"Sending new code…":"Resend code"}</button>
            </form>
          </>}
        </div>
      </div>
      <ThemeIconButton dark={dark} onClick={toggleTheme} className="tw-landing-fixed-theme" size={22} />
    </div>
  );
}

function SuccessContent({ mode, c }) {
  const label = mode === "admin" ? "admin" : mode === "superadmin" ? "superadmin" : mode === "student" ? "student" : "teacher";
  return <><div className="flex justify-center mb-[15px]"><span className="w-[70px] h-[70px] rounded-[22px] grid place-items-center" style={{ color: c.greenFg, background: c.greenBg, border: `2px solid ${c.greenBorder}` }}><TwIcon name="check" size={38} strokeWidth={3.2} /></span></div><h2 className="text-[27px] font-[950] m-[0_0_10px]" style={{ color: c.text }}>Verified!</h2><p className="leading-[1.7] m-0" style={{ color: c.textMuted }}>Your {label} account is verified. Redirecting you to login…</p></>;
}

function input(c) { return { border: `1px solid ${c.inputBorder || c.border}`, background: c.inputBg || c.cardBg2, color: c.text }; }
