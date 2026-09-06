/* FILE GUIDE:
 * client/src/components/MobileAppChrome.jsx
 * Purpose: Shared mobile-browser header (logo + hamburger drawer) and
 * bottom tab bar (capsule shaped, swipeable overflow) used by the teacher
 * and student dashboards. Only visible below the mobile breakpoint (CSS -
 * see .tw-mobile-header / .tw-mobile-tabbar in styles.css); on desktop these
 * components render but stay hidden, so no viewport-width JS is needed.
 */

import React, { useEffect, useRef, useState } from "react";
import { TwIcon } from "./TwUI";

export function MobileTopHeader({ c, name, email, avatarSrc, onSettings, onLogout }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function onDocClick(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <header className="tw-mobile-header" style={{ background: c.sidebarBg, borderBottom: `1px solid ${c.sidebarBorder}` }}>
      <div className="tw-mobile-header-logo"><span style={{ color: "#e7e9ee" }}>Think</span><span style={{ color: "#2b6cff" }}>WAVE</span></div>
      <div className="tw-mobile-header-menu-wrap" ref={rootRef}>
        <button type="button" className="tw-mobile-header-burger" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen((v) => !v)} style={{ color: c.navColor }}>
          <TwIcon name={open ? "close" : "menu"} size={22} />
        </button>
        <div className={`tw-mobile-drawer${open ? " is-open" : ""}`} style={{ background: c.cardBg3, borderColor: c.border, color: c.text }}>
          <div className="tw-mobile-drawer-identity">
            <div className="tw-mobile-drawer-avatar" style={{ borderColor: c.border, background: c.cardBg2 }}>
              {avatarSrc ? <img src={avatarSrc} alt="" /> : <TwIcon name="user" size={20} />}
            </div>
            <div className="tw-mobile-drawer-namebox">
              <div className="tw-mobile-drawer-name" style={{ color: c.text }}>{name || "Account"}</div>
              <div className="tw-mobile-drawer-email" style={{ color: c.textMuted }}>{email || ""}</div>
            </div>
          </div>
          <div className="tw-mobile-drawer-sep" style={{ background: c.border }} />
          <button type="button" className="tw-mobile-drawer-row" style={{ color: c.text }} onClick={() => { setOpen(false); onSettings?.(); }}>
            <TwIcon name="user" size={17} /><span>Settings</span>
          </button>
          <button type="button" className="tw-mobile-drawer-row is-danger" onClick={() => { setOpen(false); onLogout?.(); }}>
            <TwIcon name="logout" size={17} /><span>Log out</span>
          </button>
        </div>
      </div>
      {open && <div className="tw-mobile-drawer-scrim" onClick={() => setOpen(false)} />}
    </header>
  );
}

// items: primary tabs always visible. secondaryItems: optional overflow set
// revealed by swiping the bar left (swipe right to return). When
// secondaryItems is empty, the bar behaves like a plain static tab row.
export function MobileTabBar({ c, items, secondaryItems = [], activeId, onSelect }) {
  const [page, setPage] = useState(0);
  const [dragPct, setDragPct] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const touchRef = useRef(null);
  const trackWrapRef = useRef(null);
  const hasSecondary = secondaryItems.length > 0;

  useEffect(() => {
    if (!hasSecondary) return;
    // If navigation elsewhere activates a tab that lives in the "hidden"
    // page, bring that page into view automatically.
    const inPrimary = items.some((item) => item.id === activeId);
    setPage(inPrimary ? 0 : 1);
  }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  function onTouchStart(event) {
    touchRef.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    setIsDragging(true);
  }
  function onTouchMove(event) {
    const start = touchRef.current;
    if (!start || !hasSecondary) return;
    const dx = event.touches[0].clientX - start.x;
    const dy = event.touches[0].clientY - start.y;
    if (Math.abs(dy) > Math.abs(dx) * 1.4) return;
    const width = trackWrapRef.current?.offsetWidth || 1;
    let pct = (dx / width) * 100;
    // Rubber-band resistance past either end so the bar never drags
    // beyond its two pages.
    if (page === 0 && pct > 0) pct *= 0.35;
    if (page === 1 && pct < 0) pct *= 0.35;
    setDragPct(pct);
  }
  function onTouchEnd(event) {
    const start = touchRef.current;
    touchRef.current = null;
    setIsDragging(false);
    setDragPct(0);
    if (!start || !hasSecondary) return;
    const dx = event.changedTouches[0].clientX - start.x;
    const dy = event.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) < 42 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    if (dx < 0 && page === 0) setPage(1);
    else if (dx > 0 && page === 1) setPage(0);
  }

  return (
    <nav className="tw-mobile-tabbar-wrap">
      <div
        className="tw-mobile-tabbar"
        ref={trackWrapRef}
        style={{ background: c.sidebarBg, borderColor: c.sidebarBorder }}
        onTouchStart={hasSecondary ? onTouchStart : undefined}
        onTouchMove={hasSecondary ? onTouchMove : undefined}
        onTouchEnd={hasSecondary ? onTouchEnd : undefined}
      >
        <div
          className="tw-mobile-tabbar-track"
          style={{
            transform: `translateX(calc(-${page * 100}% + ${dragPct}%))`,
            transition: isDragging ? "none" : "transform .32s cubic-bezier(.22,1,.36,1)",
          }}
        >
          <div className="tw-mobile-tabbar-page">
            {items.map((item) => (
              <button key={item.id} type="button" className={`tw-mobile-tabbar-btn${activeId === item.id ? " is-active" : ""}`} style={{ color: activeId === item.id ? "#fff" : c.navColor }} onClick={() => onSelect(item.id)}>
                <TwIcon name={item.icon} size={19} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
          {hasSecondary && (
            <div className="tw-mobile-tabbar-page">
              {secondaryItems.map((item) => (
                <button key={item.id} type="button" className={`tw-mobile-tabbar-btn${activeId === item.id ? " is-active" : ""}`} style={{ color: activeId === item.id ? "#fff" : c.navColor }} onClick={() => onSelect(item.id)}>
                  <TwIcon name={item.icon} size={19} />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {hasSecondary && (
        <div className="tw-mobile-tabbar-dots">
          <button type="button" aria-label="Show main tabs" className={`tw-mobile-tabbar-dot${page === 0 ? " is-active" : ""}`} style={{ background: page === 0 ? c.accent : c.sidebarBorder }} onClick={() => setPage(0)} />
          <button type="button" aria-label="Show more tabs" className={`tw-mobile-tabbar-dot${page === 1 ? " is-active" : ""}`} style={{ background: page === 1 ? c.accent : c.sidebarBorder }} onClick={() => setPage(1)} />
        </div>
      )}
    </nav>
  );
}
