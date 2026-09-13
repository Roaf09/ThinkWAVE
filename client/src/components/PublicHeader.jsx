import { useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useColors, useTheme } from "../context/ThemeContext";
import ThemeIconButton from "./ThemeIconButton";
import { IconBubble, TwIcon } from "./TwUI";

export default function PublicHeader({ onSection, compact = false, setupComplete = true, concealSuper = false, hideSuper = false, hideTheme = false, hideAuth = false }) {
  const c = useColors();
  const { dark, toggleTheme } = useTheme();
  const nav = useNavigate();
  const loc = useLocation();
  const onLanding = loc.pathname === "/";
  const [signupOpen, setSignupOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const goHome = (event) => { event.preventDefault(); sessionStorage.setItem("tw_public_from", "left"); nav("/"); };
  const goSection = (id) => {
    if (onLanding) onSection?.(id);
    else nav(`/#${id}`);
  };
  function chooseSignup(role) {
    setSignupOpen(false);
    if (role === "student") nav("/student-login", { state: { authFrom: "right", mode: "register" } });
    else nav("/register", { state: { authFrom: "right" } });
  }
  function chooseLogin(role) {
    setLoginOpen(false);
    if (role === "student") nav("/student-login", { state: { authFrom: "right", mode: "login" } });
    else nav("/login", { state: { authFrom: "right" } });
  }
  return (
    <header className="tw-public-header flex-none" style={{ background:c.cardBg3, borderBottom:`1px solid ${c.border}` }}>
      <Link to="/" onClick={goHome} className="tw-public-logo"><span style={{ color:c.text }}>Think</span><span>WAVE</span></Link>
      {!compact && <nav className="tw-public-nav">
        <button onClick={() => goSection("home")} style={{ color:c.textMuted }}>Home</button>
        <button onClick={() => goSection("templates")} style={{ color:c.textMuted }}>Templates</button>
        <button onClick={() => goSection("analytics")} style={{ color:c.textMuted }}>Analytics</button>
        <button onClick={() => goSection("plans")} style={{ color:c.textMuted }}>Plans</button>
      </nav>}
      <div className="tw-public-actions flex items-center gap-[9px]">
        {setupComplete && !hideSuper && <Link
          to="/superadmin-login"
          aria-label="Superadmin login"
          title="Superadmin login"
          className="tw-public-ghost tw-super-dot inline-flex items-center justify-center gap-[7px] px-[14px] py-[9px] rounded-full text-[13px] font-extrabold no-underline whitespace-nowrap border border-solid bg-transparent cursor-pointer"
          style={{ color:c.text, borderColor:c.border, opacity: concealSuper ? 0 : 1 }}
        ><span aria-hidden="true">S</span></Link>}
        {!hideTheme && <ThemeIconButton dark={dark} onClick={toggleTheme} className="px-[14px]! py-[9px]! rounded-full! text-[13px] font-[850]" style={{ color:c.text, borderColor:c.border }} size={16} />}
        {setupComplete && !hideAuth && <button type="button" onClick={() => setLoginOpen(true)} className="tw-public-ghost tw-header-login inline-flex items-center justify-center gap-[7px] px-[14px] py-[9px] rounded-full text-[13px] font-extrabold no-underline whitespace-nowrap border border-solid bg-transparent cursor-pointer" style={{ color:c.text, borderColor:c.border, cursor:"pointer" }}>Login</button>}
        {setupComplete && !hideAuth && <button type="button" onClick={() => setSignupOpen(true)} className="tw-public-signup tw-header-signup inline-flex items-center justify-center gap-[7px] px-[14px] py-[9px] rounded-full text-[13px] font-extrabold no-underline whitespace-nowrap border border-solid bg-brand text-white border-brand shadow-[0_9px_26px_rgba(43,108,255,0.24)]" style={{ cursor:"pointer" }}>Sign Up</button>}
      </div>

      {signupOpen && createPortal(
        <>
          <div className="tw-modal-backdrop" onClick={() => setSignupOpen(false)} />
          <div className="tw-start-modal" style={{ background:c.cardBg3, borderColor:c.border, color:c.text }}>
            <button className="tw-modal-x" onClick={() => setSignupOpen(false)}><TwIcon name="close" /></button>
            <h2>Sign Up</h2>
            <p style={{ color:c.textMuted }}>Choose how you want to Sign up to enter ThinkWAVE.</p>
            <div className="tw-modal-options">
              <button className="tw-role-option tw-role-option-red" onClick={() => chooseSignup("student")}>
                <IconBubble name="student" c={c} tone="red" />
                <b>Student Sign Up</b>
                <small>Enter as a student</small>
              </button>
              <button className="tw-role-option tw-role-option-blue" onClick={() => chooseSignup("teacher")}>
                <IconBubble name="teacher" c={c} tone="blue" />
                <b>Teacher Sign Up</b>
                <small>Enter as a teacher</small>
              </button>
            </div>
          </div>
        </>,
        document.body
      )}

      {loginOpen && createPortal(
        <>
          <div className="tw-modal-backdrop" onClick={() => setLoginOpen(false)} />
          <div className="tw-start-modal" style={{ background:c.cardBg3, borderColor:c.border, color:c.text }}>
            <button className="tw-modal-x" onClick={() => setLoginOpen(false)}><TwIcon name="close" /></button>
            <h2>Log in</h2>
            <p style={{ color:c.textMuted }}>Choose how you want to Log in to enter ThinkWAVE.</p>
            <div className="tw-modal-options">
              <button className="tw-role-option tw-role-option-red" onClick={() => chooseLogin("student")}>
                <IconBubble name="student" c={c} tone="red" />
                <b>Student Log in</b>
                <small>Enter as a student</small>
              </button>
              <button className="tw-role-option tw-role-option-blue" onClick={() => chooseLogin("teacher")}>
                <IconBubble name="teacher" c={c} tone="blue" />
                <b>Teacher Log in</b>
                <small>Enter as a teacher</small>
              </button>
            </div>
          </div>
        </>,
        document.body
      )}
    </header>
  );
}
