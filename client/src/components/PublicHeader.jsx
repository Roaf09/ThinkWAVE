import { Link, useLocation, useNavigate } from "react-router-dom";
import { useColors, useTheme } from "../context/ThemeContext";
import ThemeIconButton from "./ThemeIconButton";

export default function PublicHeader({ onSection, compact = false, setupComplete = true, concealSuper = false, hideSuper = false, hideTheme = false, hideAuth = false, minimal = false }) {
  const c = useColors();
  const { dark, toggleTheme } = useTheme();
  const nav = useNavigate();
  const loc = useLocation();
  const onLanding = loc.pathname === "/";
  const goHome = (event) => { event.preventDefault(); sessionStorage.setItem("tw_public_from", "left"); nav("/"); };
  const goSection = (id) => {
    if (onLanding) onSection?.(id);
    else nav(`/#${id}`);
  };
  return (
    <header className={`tw-public-header flex-none${minimal ? " is-minimal" : ""}`} style={{ background:c.cardBg3, borderBottom:`1px solid ${c.border}` }}>
      <Link to="/" onClick={goHome} className="tw-public-logo"><img src="/logo.png" alt="ThinkWAVE" className="tw-public-logoimg" /><span style={{ color:c.text }}>Think</span><span>WAVE</span></Link>
      {!compact && !minimal && <nav className="tw-public-nav">
        <button onClick={() => goSection("home")} style={{ color:c.textMuted }}>Home</button>
        <button onClick={() => goSection("templates")} style={{ color:c.textMuted }}>Templates</button>
        <button onClick={() => goSection("analytics")} style={{ color:c.textMuted }}>Analytics</button>
        <button onClick={() => goSection("plans")} style={{ color:c.textMuted }}>Plans</button>
      </nav>}
      <div className="tw-public-actions flex items-center gap-[9px]">
        {minimal ? (
          <>
            <Link
              to="/superadmin-login"
              aria-label="Superadmin login"
              title="Superadmin login"
              className="tw-public-ghost tw-super-dot tw-super-stealth inline-flex items-center justify-center text-[13px] font-extrabold no-underline whitespace-nowrap border-0 bg-transparent cursor-pointer"
              style={{ color: "transparent", opacity: 0 }}
            ><span aria-hidden="true">S</span></Link>
            <button type="button" onClick={() => nav("/enter?mode=code")} className="tw-public-ghost tw-header-joincode inline-flex items-center justify-center gap-[7px] px-[14px] py-[9px] rounded-full text-[13px] font-extrabold no-underline whitespace-nowrap border border-solid bg-transparent cursor-pointer" style={{ color:c.text, borderColor:c.border, cursor:"pointer" }}>Join Code</button>
            <button type="button" onClick={() => nav("/enter?mode=login")} className="tw-public-ghost tw-header-login inline-flex items-center justify-center gap-[7px] px-[14px] py-[9px] rounded-full text-[13px] font-extrabold no-underline whitespace-nowrap border border-solid bg-transparent cursor-pointer" style={{ color:c.text, borderColor:c.border, cursor:"pointer" }}>Login</button>
            <button type="button" onClick={() => nav("/enter?mode=signup")} className="tw-public-signup tw-header-signup inline-flex items-center justify-center gap-[7px] px-[14px] py-[9px] rounded-full text-[13px] font-extrabold no-underline whitespace-nowrap border border-solid bg-brand text-white border-brand shadow-[0_9px_26px_rgba(43,108,255,0.24)]" style={{ cursor:"pointer", borderRadius:8 }}>Sign Up</button>
          </>
        ) : (
          <>
        {setupComplete && !hideSuper && <Link
          to="/superadmin-login"
          aria-label="Superadmin login"
          title="Superadmin login"
          className="tw-public-ghost tw-super-dot inline-flex items-center justify-center gap-[7px] px-[14px] py-[9px] rounded-full text-[13px] font-extrabold no-underline whitespace-nowrap border border-solid bg-transparent cursor-pointer"
          style={{ color:c.text, borderColor:c.border, opacity: concealSuper ? 0 : 1 }}
        ><span aria-hidden="true">S</span></Link>}
        {!hideTheme && <ThemeIconButton dark={dark} onClick={toggleTheme} className="px-[14px]! py-[9px]! rounded-full! text-[13px] font-[850]" style={{ color:c.text, borderColor:c.border }} size={16} />}
        {setupComplete && !hideAuth && <button type="button" onClick={() => nav("/enter?mode=code")} className="tw-public-ghost tw-header-joincode inline-flex items-center justify-center gap-[7px] px-[14px] py-[9px] rounded-full text-[13px] font-extrabold no-underline whitespace-nowrap border border-solid bg-transparent cursor-pointer" style={{ color:c.text, borderColor:c.border, cursor:"pointer" }}>Join Code</button>}
        {setupComplete && !hideAuth && <button type="button" onClick={() => nav("/enter?mode=login")} className="tw-public-ghost tw-header-login inline-flex items-center justify-center gap-[7px] px-[14px] py-[9px] rounded-full text-[13px] font-extrabold no-underline whitespace-nowrap border border-solid bg-transparent cursor-pointer" style={{ color:c.text, borderColor:c.border, cursor:"pointer" }}>Login</button>}
        {setupComplete && !hideAuth && <button type="button" onClick={() => nav("/enter?mode=signup")} className="tw-public-signup tw-header-signup inline-flex items-center justify-center gap-[7px] px-[14px] py-[9px] rounded-full text-[13px] font-extrabold no-underline whitespace-nowrap border border-solid bg-brand text-white border-brand shadow-[0_9px_26px_rgba(43,108,255,0.24)]" style={{ cursor:"pointer" }}>Sign Up</button>}
          </>
        )}
      </div>

    </header>
  );
}
