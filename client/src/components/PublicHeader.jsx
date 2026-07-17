import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useColors, useTheme } from "../context/ThemeContext";
import ThemeIconButton from "./ThemeIconButton";

export default function PublicHeader({ onSection, compact = false, showSuper = false }) {
  const c = useColors();
  const { dark, toggleTheme } = useTheme();
  const nav = useNavigate();
  const loc = useLocation();
  const onLanding = loc.pathname === "/";
  const goSection = (id) => {
    if (onLanding) onSection?.(id);
    else nav(`/#${id}`);
  };
  return (
    <header className="tw-public-header" style={{ background:c.cardBg3, borderBottom:`1px solid ${c.border}` }}>
      <Link to="/" className="tw-public-logo"><span style={{ color:c.text }}>Think</span><span>WAVE</span></Link>
      {!compact && <nav className="tw-public-nav">
        <button onClick={() => goSection("home")} style={{ color:c.textMuted }}>Home</button>
        <button onClick={() => goSection("templates")} style={{ color:c.textMuted }}>Templates</button>
        <button onClick={() => goSection("analytics")} style={{ color:c.textMuted }}>Analytics</button>
        <button onClick={() => goSection("plans")} style={{ color:c.textMuted }}>Plans</button>
      </nav>}
      <div className="tw-public-actions">
        <ThemeIconButton dark={dark} onClick={toggleTheme} className="tw-public-ghost" style={{ color:c.text, borderColor:c.border }} size={16} />
        {showSuper && <Link to="/superadmin-login" className="tw-public-ghost" style={{ color:c.text, borderColor:c.border }}>SUPER</Link>}
        <Link to="/login" className="tw-public-ghost" style={{ color:c.text, borderColor:c.border }}>Login</Link>
        <Link to="/register" className="tw-public-signup">Sign Up</Link>
      </div>
    </header>
  );
}
