/* FILE GUIDE:
 * client/src/components/MobileAppChrome.jsx
 * Purpose: Shared mobile-browser header (logo + hamburger drawer) and
 * bottom tab bar (capsule shaped, swipeable overflow) used by the teacher
 * and student dashboards. Only visible below the mobile breakpoint (CSS -
 * see .tw-mobile-header / .tw-mobile-tabbar in styles.css); on desktop these
 * components render but stay hidden, so no viewport-width JS is needed.
 */

import { useEffect, useRef, useState } from "react";
import { TwIcon } from "./TwUI";

export function MobileTopHeader({ c, name, email, avatarSrc, dark, toggleTheme, onSettings, onLogout }) {
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
    <header className="tw-mobile-header flex items-center justify-between fixed top-0 left-0 right-0 h-14 px-4 z-[1300]" style={{ background: c.sidebarBg, borderBottom: `1px solid ${c.sidebarBorder}` }}>
      <div className="tw-mobile-header-logo text-[19px] font-black tracking-[-0.01em]"><span style={{ color: "#e7e9ee" }}>Think</span><span style={{ color: "#2b6cff" }}>WAVE</span></div>
      <div className="tw-mobile-header-menu-wrap relative" ref={rootRef}>
        <button type="button" className="tw-mobile-header-burger w-10 h-10 grid place-items-center border-0 bg-transparent rounded-[10px] cursor-pointer" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen((v) => !v)} style={{ color: c.navColor }}>
          <TwIcon name={open ? "close" : "menu"} size={22} />
        </button>
        <div className={`tw-mobile-drawer${open ? " is-open" : ""} absolute top-[calc(100%+10px)] right-0 w-[252px] rounded-2xl border border-solid p-[14px] z-[1301] shadow-[0_20px_50px_rgba(15,23,42,0.32)]`} style={{ background: c.cardBg3, borderColor: c.border, color: c.text }}>
          <div className="tw-mobile-drawer-identity flex items-center gap-2.5">
            <div className="tw-mobile-drawer-avatar w-10 h-10 rounded-full border border-solid overflow-hidden grid place-items-center flex-[0_0_auto]" style={{ borderColor: c.border, background: c.cardBg2 }}>
              {avatarSrc ? <img src={avatarSrc} alt="" className="w-full h-full object-cover" /> : <TwIcon name="user" size={20} />}
            </div>
            <div className="tw-mobile-drawer-namebox min-w-0">
              <div className="tw-mobile-drawer-name text-sm font-black whitespace-nowrap overflow-hidden text-ellipsis" style={{ color: c.text }}>{name || "Account"}</div>
              <div className="tw-mobile-drawer-email text-[11.5px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis mt-0.5" style={{ color: c.textMuted }}>{email || ""}</div>
            </div>
          </div>
          <div className="tw-mobile-drawer-sep h-px my-3" style={{ background: c.border }} />
          {onSettings && <button type="button" className="tw-mobile-drawer-row flex items-center gap-2.5 w-full px-2 py-2.5 border-0 bg-transparent rounded-[10px] text-[13.5px] font-extrabold cursor-pointer text-left" style={{ color: c.text }} onClick={() => { setOpen(false); onSettings?.(); }}>
            <TwIcon name="user" size={17} /><span>Settings</span>
          </button>}
          {toggleTheme && <button type="button" className="tw-mobile-drawer-row flex items-center gap-2.5 w-full px-2 py-2.5 border-0 bg-transparent rounded-[10px] text-[13.5px] font-extrabold cursor-pointer text-left" style={{ color: c.text }} onClick={() => toggleTheme()}>
            <span key={dark ? "sun" : "moon"} className="tw-theme-icon-swap"><TwIcon name={dark ? "sun" : "moon"} size={17} /></span><span>{dark ? "Light mode" : "Dark mode"}</span>
          </button>}
          <button type="button" className="tw-mobile-drawer-row is-danger flex items-center gap-2.5 w-full px-2 py-2.5 border-0 bg-transparent rounded-[10px] text-[13.5px] font-extrabold cursor-pointer text-left" onClick={() => { setOpen(false); onLogout?.(); }}>
            <TwIcon name="logout" size={17} /><span>Log out</span>
          </button>
        </div>
      </div>
      {open && <div className="tw-mobile-drawer-scrim fixed inset-0 z-[1290] bg-transparent" onClick={() => setOpen(false)} />}
    </header>
  );
}

// Single connected swipeable row: primary + secondary tabs live in one
// horizontally scrollable strip so users can freely swipe across all of them
// instead of paging between two separated groups.
export function MobileTabBar({ c, items, secondaryItems = [], activeId, onSelect, iconsOnly = false }) {
  const barRef = useRef(null);
  const dragRef = useRef(null);
  const allItems = [...(items || []), ...(secondaryItems || [])];

  // Keep the active tab visible when navigation changes it elsewhere.
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const activeBtn = bar.querySelector(".tw-mobile-tabbar-btn.is-active");
    if (activeBtn && activeBtn.scrollIntoView) {
      try { activeBtn.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" }); } catch { /* ignore */ }
    }
  }, [activeId]);

  function onPointerDown(event) {
    const bar = barRef.current;
    if (!bar) return;
    dragRef.current = { x: event.clientX, scrollLeft: bar.scrollLeft, moved: false };
  }
  function onPointerMove(event) {
    const start = dragRef.current;
    const bar = barRef.current;
    if (!start || !bar) return;
    const dx = event.clientX - start.x;
    if (Math.abs(dx) > 6) start.moved = true;
    if (start.moved) bar.scrollLeft = start.scrollLeft - dx;
  }
  function onPointerUp() {
    dragRef.current = null;
  }

  const centerFew = allItems.length <= 3;
  return (
    <nav className="tw-mobile-tabbar-wrap flex justify-center fixed left-0 right-0 px-[14px] bottom-[calc(14px+env(safe-area-inset-bottom,0px))] z-[1250]">
      <div
        className={`tw-mobile-tabbar tw-mobile-tabbar-single${centerFew ? " is-centered-few" : ""} w-auto max-w-full h-16 rounded-full border border-solid overflow-hidden shadow-[0_14px_34px_rgba(15,23,42,0.28)]`}
        ref={barRef}
        style={{ background: c.sidebarBg, borderColor: c.sidebarBorder, overflowX: centerFew ? "hidden" : "auto", touchAction: "pan-x pan-y", justifyContent: centerFew ? "center" : undefined }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="tw-mobile-tabbar-track tw-mobile-tabbar-track-single flex h-full" style={centerFew ? { width: "100%", justifyContent: "center" } : undefined}>
          <div className="tw-mobile-tabbar-page tw-mobile-tabbar-page-single flex flex-[0_0_100%] w-full h-full" style={centerFew ? { width: "100%", justifyContent: "center" } : undefined}>
            {allItems.map((item) => (
              <button
                key={item.id}
                type="button"
                data-tutorial={`mobile-nav-${item.id}`}
                aria-label={item.label}
                title={item.label}
                className={`tw-mobile-tabbar-btn${activeId === item.id ? " is-active" : ""}${iconsOnly ? " is-icon-only" : ""} flex-1 min-w-0 flex flex-col items-center justify-center gap-[3px] bg-transparent border-0 rounded-full m-[6px_3px] cursor-pointer text-[10.5px] font-extrabold`}
                style={{ color: activeId === item.id ? "#fff" : c.navColor }}
                onClick={(e) => {
                  if (dragRef.current?.moved) { e.preventDefault(); return; }
                  onSelect(item.id);
                }}
              >
                <TwIcon name={item.icon} size={iconsOnly ? 23 : 19} />
                {!iconsOnly && <span className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap">{item.label}</span>}
              </button>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
}
