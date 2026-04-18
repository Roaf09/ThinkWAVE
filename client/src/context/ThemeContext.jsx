/* FILE GUIDE:
 * client/src/context/ThemeContext.jsx
 * Purpose: Global light/dark theme state shared across pages.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */



import React, { createContext, useContext, useEffect, useState } from "react";

const ThemeContext = createContext({ dark: false, toggleTheme: () => {} });

// Provides the global light/dark theme flag so every page can stay visually consistent.
export function ThemeProvider({ children }) {
  const [dark, setDark] = useState(() => {
    try {
      const saved = localStorage.getItem("tw_theme");
      return saved ? saved === "dark" : false; // ← light by default
    } catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem("tw_theme", dark ? "dark" : "light"); } catch {}
    document.body.classList.toggle("light-mode", !dark);
    document.body.classList.toggle("dark-mode", dark);
    document.body.dataset.theme = dark ? "dark" : "light";
    document.body.style.transition = "background 420ms cubic-bezier(0.22, 1, 0.36, 1), color 420ms cubic-bezier(0.22, 1, 0.36, 1)";
    document.body.style.background = dark
      ? "radial-gradient(circle at top left, rgba(43,108,255,0.18), transparent 32%), radial-gradient(circle at bottom right, rgba(34,197,94,0.10), transparent 26%), linear-gradient(180deg, #07111f 0%, #0b1530 46%, #0e1733 100%)"
      : "radial-gradient(circle at top left, rgba(43,108,255,0.15), transparent 34%), radial-gradient(circle at bottom right, rgba(56,189,248,0.12), transparent 28%), linear-gradient(180deg, #f8fbff 0%, #edf4ff 48%, #e6eeff 100%)";
    document.body.style.color = dark ? "#e7e9ee" : "#0f172a";
  }, [dark]);

  return (
    <ThemeContext.Provider value={{ dark, toggleTheme: () => setDark(d => !d) }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() { return useContext(ThemeContext); }

export function useColors() {
  const { dark } = useTheme();
  return dark ? DARK : LIGHT;
}

export const DARK = {
  pageBg:       "radial-gradient(circle at top left, rgba(43,108,255,0.18), transparent 32%), radial-gradient(circle at bottom right, rgba(34,197,94,0.10), transparent 26%), linear-gradient(180deg, #07111f 0%, #0b1530 46%, #0e1733 100%)",
  cardBg:       "rgba(12, 23, 45, 0.92)",
  cardBg2:      "rgba(9, 19, 37, 0.9)",
  cardBg3:      "rgba(13, 26, 48, 0.9)",
  border:       "#203154",
  sidebarBg:    "#0d1428",
  sidebarBorder:"#1e2d55",
  navColor:     "#8a9bc4",
  text:         "#e7e9ee",
  textMuted:    "#8a9bc4",
  textSub:      "#6b7db3",
  inputBg:      "#0d1b2e",
  inputBorder:  "#2a3b73",
  accent:       "#2b6cff",
  greenBg:      "#0f2a1a",
  greenFg:      "#86efac",
  greenBorder:  "#14532d",
  redBg:        "#2a0f0f",
  redFg:        "#f87171",
  redBorder:    "#7f1d1d",
  yellowBg:     "#2a2010",
  yellowFg:     "#fcd34d",
  yellowBorder: "#78350f",
  modalBg:      "#111e33",
  modalBorder:  "#1a2d4a",
};

export const LIGHT = {
  pageBg:       "radial-gradient(circle at top left, rgba(43,108,255,0.15), transparent 34%), radial-gradient(circle at bottom right, rgba(56,189,248,0.12), transparent 28%), linear-gradient(180deg, #f8fbff 0%, #edf4ff 48%, #e6eeff 100%)",
  cardBg:       "rgba(255,255,255,0.88)",
  cardBg2:      "rgba(241,246,255,0.92)",
  cardBg3:      "rgba(233,240,255,0.92)",
  border:       "#c8d5f4",
  sidebarBg:    "#1e2d55",
  sidebarBorder:"#2a3b73",
  navColor:     "#c7d2f0",
  text:         "#0f172a",
  textMuted:    "#3a4a7a",
  textSub:      "#5a6a9a",
  inputBg:      "#f0f4ff",
  inputBorder:  "#a5b8f5",
  accent:       "#2b6cff",
  greenBg:      "#dcfce7",
  greenFg:      "#166534",
  greenBorder:  "#86efac",
  redBg:        "#fee2e2",
  redFg:        "#dc2626",
  redBorder:    "#fca5a5",
  yellowBg:     "#fef9c3",
  yellowFg:     "#854d0e",
  yellowBorder: "#fcd34d",
  modalBg:      "#111e33",
  modalBorder:  "#1a2d4a",
};

// Shared modal — always dark (login style), used by all dashboards
export function ThemedModal({ icon, title, message, onClose, children }) {
  const { dark } = useTheme();
  return (
    <>
      <div onClick={onClose} style={{
        position: "fixed", inset: 0,
        backdropFilter: "blur(6px)",
        background: dark ? "rgba(0,0,0,0.65)" : "rgba(30,45,85,0.55)",
        zIndex: 200, transition: "background 0.3s",
      }} />
      <div style={{
        position: "fixed", inset: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 201, padding: 20,
      }}>
        <div style={{
          background: "#111e33", border: "1px solid #1a2d4a",
          borderRadius: 20, padding: "36px 32px",
          width: "min(100%, 380px)", textAlign: "center",
          boxShadow: "0 24px 80px rgba(0,0,0,0.65)",
        }}>
          {icon    && <div style={{ fontSize: 36, marginBottom: 12 }}>{icon}</div>}
          {title   && <h3 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 900, color: "#e7e9ee" }}>{title}</h3>}
          {message && <p  style={{ fontSize: 14, opacity: 0.7, margin: "0 0 22px", lineHeight: 1.6, color: "#c7d2f0" }}>{message}</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
        </div>
      </div>
    </>
  );
}