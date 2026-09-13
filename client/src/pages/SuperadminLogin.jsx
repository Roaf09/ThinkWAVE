/* FILE GUIDE:
 * client/src/pages/SuperadminLogin.jsx
 * Purpose: Project source file. Read the file name and exports first, then follow the imported helpers to understand the flow.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import { useState } from "react";
import PublicHeader from "../components/PublicHeader";
import { useNavigate } from "react-router-dom";
import { api, setAuthToken } from "../lib/api";
import { setRole, setToken } from "../lib/auth";
import { consumeLastRoute } from "../lib/lastRoute";
import { useColors, useTheme } from "../context/ThemeContext";
import { TwIcon } from "../components/TwUI";
import ThemeIconButton from "../components/ThemeIconButton";

export default function SuperadminLogin({ onLoginSuccess }) {
  const nav = useNavigate();
  const c = useColors();
  const { dark, toggleTheme } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [msg, setMsg] = useState("");

  async function submit(e) {
    e.preventDefault();
    setMsg("");
    try {
      const { data } = await api.post("/auth/login", { email, password, loginPortal: "SUPERADMIN" });
      setToken(data.token);
      setRole(data.role);
      setAuthToken(data.token);
      if (onLoginSuccess) onLoginSuccess(data.token, data.role, data);
      nav(consumeLastRoute(data.role) || "/superadmin");
    } catch (err) {
      const response = err?.response?.data || {};
      if (response.requiresVerification) {
        nav(`/verify?mode=superadmin`, { state: { email: email.trim(), loginMode: "superadmin" } });
        return;
      }
      setMsg(response.message || "Login failed. Check your credentials.");
    }
  }

  return (
    <div className="tw-starry-page tw-auth-page min-h-screen flex flex-col" style={s.page(c)}>
      <PublicHeader compact hideSuper hideTheme />

      <main className="tw-auth-main flex-1 flex items-center justify-center w-full px-5 py-9">
        <div className="tw-auth-form-shell my-auto rounded-[20px] px-[44px] pt-[44px] pb-9 w-[min(100%,440px)] shadow-[0_24px_80px_rgba(0,0,0,0.45)]" style={s.card(c)}>
          <div className="mb-7 text-center">
            <h1 className="m-[0_0_6px] text-[28px] font-black tracking-[-0.5px] text-[#f87171]">Super Admin Access</h1>
            <p className="m-0 text-sm" style={s.subtitle(c)}>Restricted administrative login</p>
          </div>

          <form onSubmit={submit} className="flex flex-col gap-[18px]">
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-semibold" style={s.label(c)}>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@thinkwave.local" required className="px-[14px] py-[11px] rounded-xl text-sm w-full box-border" style={s.input(c)} />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-semibold" style={s.label(c)}>Password</label>
              <div className="relative">
                <input type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required className="px-[14px] py-[11px] rounded-xl text-sm w-full box-border" style={{ ...s.input(c), paddingRight: 48 }} />
                <button type="button" className="absolute right-[14px] top-1/2 -translate-y-1/2 border-0 bg-transparent! text-brand! dark:text-brand-dark! text-[13px] font-bold cursor-pointer p-0" onClick={() => setShowPw((v) => !v)}><TwIcon name={showPw ? "eyeOff" : "eye"} size={19}/></button>
              </div>
            </div>

            {msg && <p className="text-[13px] rounded-lg p-[10px_14px] m-0" style={s.msgBox}>{msg}</p>}

            <button type="button" className="self-end border-0 bg-transparent! text-brand! dark:text-brand-dark! text-[13px] font-bold cursor-pointer p-0" onClick={() => nav("/forgot-password")}>Forgot password?</button>

            <div className="flex justify-center mt-1">
              <button type="submit" className="tw-superadmin-primary w-full p-[13px] rounded-xl text-[15px] font-extrabold cursor-pointer" style={s.loginBtn}>Authorize and Enter</button>
            </div>
          </form>
        </div>
      </main>
      <ThemeIconButton dark={dark} onClick={toggleTheme} className="tw-landing-fixed-theme" size={22} />
    </div>
  );
}

const s = {
  page: (c) => ({ background: c.pageBg, fontFamily: "'Segoe UI', system-ui, sans-serif", color: c.text }),
  glow: { background: "radial-gradient(circle, rgba(239,68,68,0.08) 0%, transparent 70%)" },
  card: (c) => ({ background: c.cardBg3, border: `1px solid ${c.border}` }),
  subtitle: (c) => ({ color: c.textMuted }),
  label: (c) => ({ color: c.text }),
  input: (c) => ({ border: `1px solid ${c.inputBorder}`, background: c.inputBg, color: c.text }),
  showBtn: { color: "#ef4444" },
  forgotBtn: { color: "#60a5fa" },
  msgBox: { color: "#fecaca", background: "rgba(127,29,29,0.4)" },
  loginBtn: { background: "#dc2626", color: "#fff", boxShadow: "0 4px 20px rgba(220,38,38,0.25)" },
};
