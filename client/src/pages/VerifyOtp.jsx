/* FILE GUIDE:
 * client/src/pages/VerifyOtp.jsx
 * Purpose: Shared OTP verification form for teacher, student, admin, and superadmin accounts.
 */

import { useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import PublicHeader from "../components/PublicHeader";
import { IconBubble, TwIcon } from "../components/TwUI";
import { useColors, useTheme } from "../context/ThemeContext";
import { api } from "../lib/api";

const BOX_COUNT = 6;

// Common-provider typo hint (e.g. gamil.com -> gmail.com). Warn only, never block:
// every typo domain is still syntactically valid and could theoretically exist.
const COMMON_DOMAINS = ["gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "outlook.com", "hotmail.com", "live.com", "msn.com", "icloud.com", "aol.com", "proton.me", "protonmail.com"];
const TYPO_MAP = {
  "gamil.com": "gmail.com", "gmial.com": "gmail.com", "gmaill.com": "gmail.com", "gmali.com": "gmail.com",
  "gmal.com": "gmail.com", "gmail.con": "gmail.com", "gmail.co": "gmail.com", "gnail.com": "gmail.com",
  "yaho.com": "yahoo.com", "yahooo.com": "yahoo.com", "yahhoo.com": "yahoo.com",
  "outllok.com": "outlook.com", "outlok.com": "outlook.com", "hotmial.com": "hotmail.com", "hotmil.com": "hotmail.com",
  "iclod.com": "icloud.com", "protonn.me": "proton.me",
};

function editDistance(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function suggestEmail(value) {
  const clean = String(value || "").trim().toLowerCase();
  const parts = clean.split("@");
  if (parts.length !== 2 || !parts[0] || !parts[1] || clean.includes(" ")) return "";
  const [local, domain] = parts;
  if (COMMON_DOMAINS.includes(domain)) return "";
  if (TYPO_MAP[domain]) return `${local}@${TYPO_MAP[domain]}`;
  let best = "", bestDist = Infinity;
  for (const known of COMMON_DOMAINS) {
    const dist = editDistance(domain, known);
    if (dist < bestDist) { bestDist = dist; best = known; }
  }
  return best && bestDist >= 1 && bestDist <= 2 ? `${local}@${best}` : "";
}

export default function VerifyOtp() {
  const nav = useNavigate();
  const c = useColors();
  const { dark } = useTheme();
  const loc = useLocation();
  const [sp, setSp] = useSearchParams();
  const mode = loc.state?.loginMode || sp.get("mode") || (loc.state?.adminPending ? "admin" : "teacher");
  const [email, setEmail] = useState(loc.state?.email || sp.get("email") || "");
  const [digits, setDigits] = useState(Array(BOX_COUNT).fill(""));
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState("error");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [draftEmail, setDraftEmail] = useState("");
  const [draftPassword, setDraftPassword] = useState("");
  const [showDraftPw, setShowDraftPw] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const refs = useRef([]);
  // Admin addresses are pinned to their invitation, so they cannot be moved here.
  const canChangeEmail = mode !== "admin";
  const emailSuggestion = suggestEmail(email);
  const draftSuggestion = suggestEmail(draftEmail);

  function flash(text, type = "error") { setMsg(text); setMsgType(type); }

  function startEditingEmail() {
    setDraftEmail(email);
    setDraftPassword("");
    setIsEditingEmail(true);
    setMsg("");
  }

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
    if (!email) return flash("Enter your email address first.");
    setResending(true); setMsg("");
    try {
      const { data } = await api.post("/auth/resend-otp", { email });
      setDigits(Array(BOX_COUNT).fill(""));
      flash(data.emailSent ? "A new code was sent to your email." : "A new code was generated. Check the server terminal for the test OTP.", "success");
      refs.current[0]?.focus();
    } catch (error) { flash(error?.response?.data?.message || "Could not resend the code."); }
    finally { setResending(false); }
  }

  async function saveEmail(event) {
    event?.preventDefault();
    const newAddress = String(draftEmail || "").trim();
    if (!/^\S+@\S+\.\S+$/.test(newAddress)) return flash("Enter a valid new email address.");
    if (newAddress.toLowerCase() === String(email || "").trim().toLowerCase()) return flash("The new email address is the same as the current one.");
    if (!draftPassword) return flash("Enter your password to confirm this change.");
    setSavingEmail(true); setMsg("");
    try {
      const { data } = await api.post("/auth/change-email", { currentEmail: email, newEmail: newAddress, password: draftPassword });
      const updated = data.email || newAddress;
      setEmail(updated);
      try {
        const next = new URLSearchParams(sp);
        next.set("email", updated);
        if (mode) next.set("mode", mode);
        setSp(next, { replace: true });
      } catch {}
      setIsEditingEmail(false);
      setDraftPassword("");
      setDigits(Array(BOX_COUNT).fill(""));
      flash(data.emailSent === false ? "Email updated. A new code was generated, but email delivery needs server setup." : "Email updated. A new code was sent.", "success");
      refs.current[0]?.focus();
    } catch (error) { flash(error?.response?.data?.message || "Could not update the email address."); }
    finally { setSavingEmail(false); }
  }

  async function submit(event) {
    event.preventDefault();
    const code = digits.join("");
    if (code.length < BOX_COUNT) return flash("Please enter all 6 digits.");
    setLoading(true);
    setMsg("");
    try {
      await api.post("/auth/verify-otp", { email, code });
      setSuccess(true);
      const nextLogin = mode === "admin" ? "/login?role=admin" : mode === "superadmin" ? "/superadmin-login" : mode === "student" ? "/student-login" : "/login";
      setTimeout(() => nav(nextLogin), 2000);
    } catch (error) {
      flash(error?.response?.data?.message || "Invalid or expired OTP.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="tw-otp-page tw-enter-otp-page min-h-screen flex flex-col relative overflow-hidden" style={{ background: "#fff", color: c.text }}>
      <PublicHeader compact hideSuper hideTheme />

      <div className="tw-otp-main grid place-items-center flex-1 min-h-0 overflow-hidden px-5 py-[20px] z-[1]">
        <div className="tw-otp-card w-[min(100%,470px)] p-[38px_34px] rounded-[26px] text-center" style={{ background: c.cardBg3 || c.cardBg, border: `1px solid ${c.border}`, boxShadow: dark ? "0 28px 90px rgba(0,0,0,.45)" : "0 28px 80px rgba(43,108,255,.16)" }}>
          {success ? <SuccessContent mode={mode} c={c} /> : <>
            <div className="tw-otp-icon-wrap flex justify-center mb-[14px]"><IconBubble name="invitation" c={c} size={58} iconSize={28} /></div>
            <h2 className="text-[27px] font-[950] m-[0_0_10px]" style={{ color: c.text }}>Check your email</h2>
            {!isEditingEmail && <p className="tw-otp-intro text-sm leading-[1.7] m-[0_0_8px]" style={{ color: c.textMuted }}>We sent a 6-digit code to <b style={{ color: c.text }}>{email || "your email"}</b>.</p>}

            {!isEditingEmail && email && canChangeEmail && <p className="m-[0_0_18px] text-[13px]" style={{ color: c.textMuted }}>Wrong address? <button type="button" onClick={startEditingEmail} className="border-0 bg-transparent font-black cursor-pointer p-0 underline underline-offset-2" style={{ color: c.accent }}>Change email</button></p>}
            {!isEditingEmail && email && !canChangeEmail && <p className="m-[0_0_18px] text-xs leading-[1.6]" style={{ color: c.textMuted }}>This address is tied to your admin invitation. Contact your institution if it needs correction.</p>}
            {!isEditingEmail && emailSuggestion && canChangeEmail && <p className="m-[0_0_18px] text-[13px] font-bold">Did you mean <button type="button" onClick={() => { setDraftEmail(emailSuggestion); setDraftPassword(""); setIsEditingEmail(true); setMsg(""); }} className="border-0 bg-transparent font-black cursor-pointer p-0 underline underline-offset-2" style={{ color: c.accent }}>{emailSuggestion}</button>?</p>}

            {!email && !isEditingEmail && <label className="grid gap-[7px] text-left text-xs font-extrabold mb-[17px]" style={{ color: c.textMuted }}>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" className="px-[14px] py-3 rounded-xl text-sm w-full box-border" style={input(c)} /></label>}

            {isEditingEmail ? (
              <form onSubmit={saveEmail} className="grid gap-3 text-left">
                <label className="grid gap-[7px] text-xs font-extrabold" style={{ color: c.textMuted }}>New email address
                  <input type="email" value={draftEmail} onChange={(event) => setDraftEmail(event.target.value)} placeholder="you@gmail.com" required className="px-[14px] py-3 rounded-xl text-sm w-full box-border font-normal" style={input(c)} />
                </label>
                {draftSuggestion && draftSuggestion.toLowerCase() !== String(draftEmail || "").trim().toLowerCase() && <p className="m-0 text-[13px] font-bold" style={{ color: c.textMuted }}>Did you mean <button type="button" onClick={() => setDraftEmail(draftSuggestion)} className="border-0 bg-transparent font-black cursor-pointer p-0 underline underline-offset-2" style={{ color: c.accent }}>{draftSuggestion}</button>?</p>}
                <label className="grid gap-[7px] text-xs font-extrabold" style={{ color: c.textMuted }}>Current password
                  <span className="relative block">
                    <input type={showDraftPw ? "text" : "password"} value={draftPassword} onChange={(event) => setDraftPassword(event.target.value)} placeholder="Confirm it's you" required autoComplete="current-password" className="px-[14px] py-3 rounded-xl text-sm w-full box-border font-normal" style={{ ...input(c), paddingRight: 64 }} />
                    <button type="button" onClick={() => setShowDraftPw((v) => !v)} className="absolute right-[10px] top-1/2 -translate-y-1/2 border-0 bg-transparent text-[12px] font-black cursor-pointer p-1" style={{ color: c.accent }}>{showDraftPw ? "Hide" : "Show"}</button>
                  </span>
                </label>
                <p className="m-0 text-xs leading-[1.6]" style={{ color: c.textMuted }}>We&apos;ll move your pending account to the new address and send a fresh code. Old codes stop working.</p>
                {msg && <div className="rounded-[11px] p-[10px_13px] text-[13px] font-extrabold m-0" style={msgType === "success" ? { color: c.greenFg, background: c.greenBg, border: `1px solid ${c.greenBorder}` } : { color: c.redFg, background: c.redBg, border: `1px solid ${c.redBorder}` }}>{msg}</div>}
                <button type="submit" disabled={savingEmail} className="tw-auth-primary w-full p-[14px] rounded-[8px] border-[3px] border-brand bg-brand text-white text-base font-extrabold cursor-pointer shadow-[0_10px_24px_rgba(43,108,255,0.25)] disabled:opacity-70">{savingEmail ? "Updating…" : "Save and resend code"}</button>
                <button type="button" onClick={() => { setIsEditingEmail(false); setMsg(""); }} disabled={savingEmail} className="border-0 bg-transparent font-black cursor-pointer" style={{ color: c.textMuted }}>Cancel</button>
              </form>
            ) : (
            <form onSubmit={submit}>
              <div className="tw-otp-digits flex gap-[9px] justify-center mb-5" onPaste={handlePaste}>
                {digits.map((digit, index) => <input key={index} ref={(element) => { refs.current[index] = element; }} type="text" inputMode="numeric" maxLength={1} value={digit} onChange={(event) => handleDigit(index, event.target.value)} onKeyDown={(event) => handleKeyDown(index, event)} autoFocus={index === 0} className="w-[50px] h-[62px] box-border rounded-[14px] text-[27px] font-[950] text-center outline-none caret-transparent transition-[border-color,transform] duration-150 ease-[ease]" style={{ border: `2px solid ${digit ? c.accent : c.inputBorder || c.border}`, background: c.inputBg || c.cardBg2, color: c.text }} />)}
              </div>
              {msg && <div className="rounded-[11px] p-[10px_13px] text-[13px] font-extrabold mb-4" style={msgType === "success" ? { color: c.greenFg, background: c.greenBg, border: `1px solid ${c.greenBorder}` } : { color: c.redFg, background: c.redBg, border: `1px solid ${c.redBorder}` }}>{msg}</div>}
              <button type="submit" disabled={loading || digits.join("").length < BOX_COUNT} className="tw-auth-primary w-full p-[14px] rounded-[8px] border-[3px] border-brand bg-brand text-white text-base font-extrabold cursor-pointer shadow-[0_10px_24px_rgba(43,108,255,0.25)] disabled:opacity-70">{loading ? "Verifying…" : "Verify"}</button>
              <button type="button" onClick={resend} disabled={resending} className="tw-enter-link" style={{ justifySelf: "center", marginTop: 12, opacity: resending ? .6 : 1 }}>{resending?"Sending new code…":"Resend code"}</button>
            </form>
            )}
          </>}
        </div>
      </div>
    </div>
  );
}

function SuccessContent({ mode, c }) {
  const label = mode === "admin" ? "admin" : mode === "superadmin" ? "superadmin" : mode === "student" ? "student" : "teacher";
  return <><div className="flex justify-center mb-[15px]"><span className="w-[70px] h-[70px] rounded-[22px] grid place-items-center" style={{ color: c.greenFg, background: c.greenBg, border: `2px solid ${c.greenBorder}` }}><TwIcon name="check" size={38} strokeWidth={3.2} /></span></div><h2 className="text-[27px] font-[950] m-[0_0_10px]" style={{ color: c.text }}>Verified!</h2><p className="leading-[1.7] m-0" style={{ color: c.textMuted }}>Your {label} account is verified. Redirecting you to login…</p></>;
}

function input(c) { return { border: `1px solid ${c.inputBorder || c.border}`, background: c.inputBg || c.cardBg2, color: c.text }; }
