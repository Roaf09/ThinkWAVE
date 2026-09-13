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
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden px-5 pt-5 pb-10" style={{ background: pageBg, transition: "background 0.3s", fontFamily: "'Segoe UI',system-ui,sans-serif" }}>
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
            {msg && <p className="text-[13px] rounded-xl p-[10px_12px] m-0 border border-solid text-[#f87171] bg-[rgba(239,68,68,0.12)] border-[rgba(239,68,68,0.2)]">{msg}</p>}
            <button type="submit" disabled={loading} className="tw-guest-join-primary mt-1 p-[14px_16px] rounded-full border-0 bg-brand text-white text-[15px] font-extrabold cursor-pointer shadow-[0_12px_30px_rgba(43,108,255,0.28)]" style={{ opacity: loading ? 0.7 : 1 }}>{loading ? "Joining…" : "Join Session"}</button>
            <button type="button" onClick={() => nav("/?join=guest")} className="bg-transparent border-0 text-[13px] cursor-pointer font-bold" style={{ color: mutedC }}>Change code</button>
          </form>
        </div>

      <p className="text-xs mt-5 z-[1]" style={{ color: mutedC, fontSize: 12, marginTop: 20, zIndex: 1 }}>No account needed · Just your name and code</p>
    </div>
  );
}

const s = {
  blob1: { background: "radial-gradient(circle,rgba(43,108,255,0.12) 0%,transparent 70%)" },
  blob2: { background: "radial-gradient(circle,rgba(139,92,246,0.08) 0%,transparent 70%)" },
};
