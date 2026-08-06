import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useColors, useTheme } from "../context/ThemeContext";
import ThemeIconButton from "./ThemeIconButton";

export default function PublicHeader({ onSection, compact = false, setupComplete = true, concealSuper = false, hideSuper = false, hideTheme = false }) {
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
    <header className="tw-public-header" style={{ background:c.cardBg3, borderBottom:`1px solid ${c.border}` }}>
      <Link to="/" onClick={goHome} className="tw-public-logo"><span style={{ color:c.text }}>Think</span><span>WAVE</span></Link>
      {!compact && <nav className="tw-public-nav">
        <button onClick={() => goSection("home")} style={{ color:c.textMuted }}>Home</button>
        <button onClick={() => goSection("templates")} style={{ color:c.textMuted }}>Templates</button>
        <button onClick={() => goSection("analytics")} style={{ color:c.textMuted }}>Analytics</button>
        <button onClick={() => goSection("plans")} style={{ color:c.textMuted }}>Plans</button>
      </nav>}
      <div className="tw-public-actions">
        {setupComplete && !hideSuper && <Link
          to="/superadmin-login"
          aria-label="Superadmin login"
          title="Superadmin login"
          className="tw-public-ghost tw-super-dot"
          style={{ color:c.text, borderColor:c.border, opacity: concealSuper ? 0 : 1 }}
        ><span aria-hidden="true">S</span></Link>}
        {!hideTheme && <ThemeIconButton dark={dark} onClick={toggleTheme} className="tw-public-ghost" style={{ color:c.text, borderColor:c.border }} size={16} />}
        {setupComplete && <Link to="/login" state={{ authFrom: "left" }} className="tw-public-ghost tw-header-login" style={{ color:c.text, borderColor:c.border }}>Login</Link>}
        {setupComplete && <Link to="/register" state={{ authFrom: "right" }} className="tw-public-signup tw-header-signup">Sign Up</Link>}
      </div>
    </header>
  );
}
