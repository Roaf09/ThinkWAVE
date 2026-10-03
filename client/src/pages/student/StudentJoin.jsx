/* FILE GUIDE:
 * client/src/pages/student/StudentJoin.jsx
 * Purpose: Student entry page that accepts join codes and handles rejoin setup.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";
import { useTheme } from "../../context/ThemeContext";
import ThemeIconButton from "../../components/ThemeIconButton";

// Same browser key the Guest dashboard uses, so one browser = one guest identity.
const GUEST_IDENTITY_KEY = "thinkwave_guest_identity_v1";
function getOrCreateGuestKey() {
  const current = localStorage.getItem(GUEST_IDENTITY_KEY) || "";
  if (/^[a-f0-9]{64}$/i.test(current)) return current;
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const next = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  localStorage.setItem(GUEST_IDENTITY_KEY, next);
  return next;
}

// Shown from a guest's 3rd live session of the same class. No seat exists
// yet, so the student decides before anything is created.
function GuestAccountPrompt({ prompt, dark, loading, onCreateAccount, onContinue }) {
  // Same 3D prompt-box language as the quiz-builder question area and the
  // host panel question prompt: 3px accent border + 6px solid slab + glow +
  // top highlight. Dark mode uses the builder's tinted-solid recipe.
  const accent = "#2b6cff";
  const cardBg = dark ? `color-mix(in srgb, ${accent} 18%, #172a46)` : `color-mix(in srgb, ${accent} 12%, #ffffff)`;
  const textC = dark ? "#e7e9ee" : "#0f172a";
  const mutedC = dark ? "#a9b8dd" : "#5a6a9a";
  const slabBase = `color-mix(in srgb, ${accent} 58%, #0f172a)`;
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[50] grid place-items-center px-5" style={{ background: "rgba(2,6,23,0.55)" }}>
      <div className="w-[min(100%,420px)]" style={{ background: cardBg, color: textC, border: `3px solid ${accent}`, borderRadius: 20, padding: "28px 26px", boxSizing: "border-box", boxShadow: `0 6px 0 ${slabBase}, 0 18px 34px ${accent}59, inset 0 2px 0 rgba(255,255,255,.8)` }}>
        <p className="font-black text-lg m-[0_0_8px]" style={{ textAlign: "center" }}>Keep your records?</p>
        <p className="text-[14px] leading-[1.6] m-[0_0_18px]" style={{ color: mutedC }}>
          You&apos;ve joined <b style={{ color: textC }}>{prompt.className}</b>&apos;s live sessions {prompt.visits} times as a guest.
          Guest results aren&apos;t saved to a student account, so they can be lost. You can create a student account and ask
          your teacher for the class code, or continue as a guest. It&apos;s your choice.
        </p>
        <div className="flex flex-col gap-2">
          <button type="button" onClick={onCreateAccount} className="tw-guest-join-primary p-[13px_16px] rounded-full border-0 bg-brand text-white font-extrabold cursor-pointer" style={{ boxShadow: "0 4px 0 color-mix(in srgb, #2b6cff 58%, #0f172a)" }}>Create a student account</button>
          <button type="button" onClick={onContinue} disabled={loading} className="p-[12px_16px] rounded-full font-bold cursor-pointer" style={{ background: "transparent", color: textC, border: `1px solid ${mutedC}`, opacity: loading ? 0.6 : 1 }}>{loading ? "Joining…" : "Continue as guest"}</button>
        </div>
      </div>
    </div>
  );
}

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
  const [accountPrompt, setAccountPrompt] = useState(null);

  useEffect(() => {
    if (!prefilled) nav("/?join=guest", { replace: true });
  }, [nav, prefilled]);

  if (!prefilled) return null;

  async function handleJoin(e, { continueAsGuest = false } = {}) {
    e?.preventDefault?.();
    setMsg("");
    setLoading(true);
    try {
      const storedKey = String(localStorage.getItem("qz_reconnectKey") || "");
      const { data } = await api.post("/sessions/join", {
        code: code.trim().toUpperCase(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        guestKey: getOrCreateGuestKey(),
        ...(continueAsGuest ? { continueAsGuest: true } : {}),
        // Same-browser seat recovery: proves an earlier seat is ours so the
        // server hands it back instead of minting a duplicate row.
        ...(storedKey.length >= 20 ? { reconnectKey: storedKey.slice(0, 64) } : {}),
      });
      localStorage.setItem("qz_reconnectKey", data.reconnectKey);
      localStorage.setItem("qz_participantId", String(data.participantId));
      localStorage.setItem("qz_sessionId", String(data.sessionId));
      localStorage.setItem("qz_joinMode", data.joinMode || "SOLO");
      nav(`/play/${data.sessionId}`);
    } catch (err) {
      const data = err?.response?.data || {};
      if (data.code === "GUEST_ACCOUNT_SUGGESTED") {
        setAccountPrompt({ visits: Number(data.visits || 3), className: data.className || "this class" });
        setLoading(false);
        return;
      }
      setAccountPrompt(null);
      setMsg(data.message || "Could not join. Check your code and try again.");
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
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden px-5 pt-5 pb-10" style={{ background: pageBg, transition: "background 0.3s", fontFamily: "Inter,'Segoe UI',system-ui,sans-serif" }}>
      <div className="fixed w-[500px] h-[500px] rounded-full -top-[150px] -left-[100px] pointer-events-none" style={s.blob1} />
      <div className="fixed w-[400px] h-[400px] rounded-full -bottom-[100px] -right-[100px] pointer-events-none" style={s.blob2} />

      <ThemeIconButton dark={dark} onClick={toggleTheme} className="tw-guest-join-theme" size={20} />

      <Link to="/" aria-label="Back to ThinkWAVE landing page" className="tw-guest-join-logo flex items-baseline no-underline cursor-pointer mb-7 z-[1]">
        <span className="text-[32px] font-black" style={{ color: textC }}>Think</span>
        <span className="text-[32px] font-black text-brand">WAVE</span>
      </Link>

      <div className="rounded-3xl p-[36px_32px] w-[min(100%,420px)] z-[1] shadow-[0_20px_60px_rgba(0,0,0,0.3)]" style={{ background: cardBg, border: `1px solid ${cardBor}` }}>
          <p className="text-center font-black text-xl m-[0_0_4px]" style={{ color: textC }}>What's your name?</p>
          <p className="text-[13px] m-[0_0_20px] text-center" style={{ color: mutedC }}>
            Code: <b className="tracking-[2px]" style={{ color: textC }}>{code}</b>
          </p>
          <form onSubmit={handleJoin} className="flex flex-col gap-3">
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" required autoFocus className="px-4 py-[14px] rounded-xl text-base w-full box-border outline-none" style={{ background: inputBg, border: `1px solid ${inputBor}`, color: textC }} />
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name (optional)" className="px-4 py-[14px] rounded-xl text-base w-full box-border outline-none" style={{ background: inputBg, border: `1px solid ${inputBor}`, color: textC }} />
            {msg && <p className="text-[13px] rounded-xl p-[10px_12px] m-0 border border-solid text-[#f87171] bg-[rgba(239,68,68,0.12)] border-[rgba(239,68,68,0.2)]" style={{ textAlign: "center" }}>{msg}</p>}
            <button type="submit" disabled={loading} className="tw-guest-join-primary mt-1 p-[14px_16px] rounded-full border-0 bg-brand text-white text-[15px] font-extrabold cursor-pointer shadow-[0_12px_30px_rgba(43,108,255,0.28)]" style={{ opacity: loading ? 0.7 : 1 }}>{loading ? "Joining…" : "Join Session"}</button>
            <button type="button" onClick={() => nav("/?join=guest")} className="bg-transparent border-0 text-[13px] cursor-pointer font-bold" style={{ color: mutedC }}>Change code</button>
          </form>
        </div>

      {accountPrompt && <GuestAccountPrompt prompt={accountPrompt} dark={dark} loading={loading} onCreateAccount={() => nav("/student-login?mode=register")} onContinue={() => handleJoin(null, { continueAsGuest: true })} />}

      <p className="text-xs mt-5 z-[1]" style={{ color: mutedC, fontSize: 12, marginTop: 20, zIndex: 1 }}>No account needed · Just your name and code</p>
    </div>
  );
}

const s = {
  blob1: { background: "radial-gradient(circle,rgba(43,108,255,0.12) 0%,transparent 70%)" },
  blob2: { background: "radial-gradient(circle,rgba(139,92,246,0.08) 0%,transparent 70%)" },
};
