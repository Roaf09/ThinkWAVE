/* FILE GUIDE:
 * client/src/context/ThemeContext.jsx
 * Purpose: Global light/dark theme state shared across pages.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */



import React, { createContext, useContext, useEffect, useRef, useState } from "react";

const ThemeContext = createContext({ dark: false, toggleTheme: () => {} });

// Provides the global light/dark theme flag so every page can stay visually consistent.
export function ThemeProvider({ children }) {
  const firstThemeRun = useRef(true);
  const [dark, setDark] = useState(() => {
    try {
      const saved = localStorage.getItem("tw_theme");
      return saved ? saved === "dark" : false; // ← light by default
    } catch { return false; }
  });

  useEffect(() => {
    if (!firstThemeRun.current) {
      document.documentElement.classList.add("tw-theme-switching");
      window.clearTimeout(window.__twThemeTimer);
      window.__twThemeTimer = window.setTimeout(() => document.documentElement.classList.remove("tw-theme-switching"), 210);
    }
    firstThemeRun.current = false;
    try { localStorage.setItem("tw_theme", dark ? "dark" : "light"); } catch {}
    document.body.classList.toggle("light-mode", !dark);
    document.body.classList.toggle("dark-mode", dark);
    document.body.dataset.theme = dark ? "dark" : "light";
    document.body.style.transition = "background 145ms ease, color 145ms ease";
    document.body.style.background = dark
      ? "radial-gradient(circle at 12% 8%, rgba(54,92,180,0.22), transparent 30%), radial-gradient(circle at 86% 14%, rgba(44,126,205,0.12), transparent 28%), linear-gradient(180deg, #030b1c 0%, #07142b 48%, #0a1832 100%)"
      : "radial-gradient(circle at 10% 8%, rgba(210,170,90,0.14), transparent 30%), radial-gradient(circle at 86% 12%, rgba(255,224,170,0.30), transparent 28%), linear-gradient(180deg, #fffaf0 0%, #fbf1dd 52%, #f7ead2 100%)";
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
  pageBg:       "radial-gradient(circle at 12% 8%, rgba(54,92,180,0.22), transparent 30%), radial-gradient(circle at 86% 14%, rgba(44,126,205,0.12), transparent 28%), linear-gradient(180deg, #030b1c 0%, #07142b 48%, #0a1832 100%)",
  cardBg:       "rgba(7, 20, 43, 0.90)",
  cardBg2:      "rgba(10, 28, 58, 0.86)",
  cardBg3:      "rgba(5, 17, 38, 0.94)",
  border:       "rgba(132, 167, 255, 0.20)",
  sidebarBg:    "linear-gradient(180deg, #030b1c 0%, #081a38 100%)",
  sidebarBorder:"rgba(132, 167, 255, 0.16)",
  navColor:     "#a8b8e8",
  text:         "#eef4ff",
  textMuted:    "#9aacd8",
  textSub:      "#7f91c4",
  inputBg:      "rgba(8, 18, 35, 0.88)",
  inputBorder:  "rgba(132, 167, 255, 0.28)",
  accent:       "#3b82f6",
  accent2:      "#38bdf8",
  violet:       "#8b5cf6",
  greenBg:      "rgba(20,83,45,0.30)",
  greenFg:      "#86efac",
  greenBorder:  "rgba(134,239,172,0.28)",
  redBg:        "rgba(127,29,29,0.30)",
  redFg:        "#fca5a5",
  redBorder:    "rgba(252,165,165,0.30)",
  yellowBg:     "rgba(120,53,15,0.32)",
  yellowFg:     "#fcd34d",
  yellowBorder: "rgba(252,211,77,0.30)",
  modalBg:      "#111e33",
  modalBorder:  "rgba(132,167,255,0.18)",
};

export const LIGHT = {
  pageBg:       "radial-gradient(circle at 10% 8%, rgba(210,170,90,0.14), transparent 30%), radial-gradient(circle at 86% 12%, rgba(255,224,170,0.30), transparent 28%), linear-gradient(180deg, #fffaf0 0%, #fbf1dd 52%, #f7ead2 100%)",
  cardBg:       "rgba(255,252,244,0.88)",
  cardBg2:      "rgba(250,242,224,0.90)",
  cardBg3:      "rgba(255,250,239,0.95)",
  border:       "rgba(154, 116, 54, 0.22)",
  sidebarBg:    "linear-gradient(180deg, #1e2d55 0%, #22386e 100%)",
  sidebarBorder:"rgba(199,210,240,0.20)",
  navColor:     "#d7e2ff",
  text:         "#0f172a",
  textMuted:    "#475985",
  textSub:      "#64749e",
  inputBg:      "rgba(255,252,245,0.98)",
  inputBorder:  "rgba(154,116,54,0.30)",
  accent:       "#2b6cff",
  accent2:      "#0284c7",
  violet:       "#7c3aed",
  greenBg:      "#dcfce7",
  greenFg:      "#166534",
  greenBorder:  "#86efac",
  redBg:        "#fee2e2",
  redFg:        "#b91c1c",
  redBorder:    "#fca5a5",
  yellowBg:     "#fef3c7",
  yellowFg:     "#92400e",
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
        background: dark ? "rgba(0,0,0,0.65)" : "rgba(30,45,85,0.28)",
        zIndex: 200, transition: "background 0.3s",
      }} />
      <div style={{
        position: "fixed", inset: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 201, padding: 20,
      }}>
        <div style={{
          background: dark ? "#111e33" : "#f8fbff", border: dark ? "1px solid #1a2d4a" : "1px solid #c8d5f4",
          borderRadius: 20, padding: "36px 32px",
          width: "min(100%, 380px)", textAlign: "center",
          boxShadow: dark ? "0 24px 80px rgba(0,0,0,0.65)" : "0 24px 80px rgba(30,45,85,0.18)",
        }}>
          {icon    && <div style={{ fontSize: 36, marginBottom: 12, color: dark ? "#e7e9ee" : "#0f172a", background: dark ? "transparent" : "#eaf1ff", border: dark ? "none" : "1px solid #c8d5f4", width: 58, height: 58, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "50%" }}>{icon}</div>}
          {title   && <h3 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 900, color: dark ? "#e7e9ee" : "#0f172a" }}>{title}</h3>}
          {message && <p  style={{ fontSize: 14, opacity: 0.8, margin: "0 0 22px", lineHeight: 1.6, color: dark ? "#c7d2f0" : "#3a4a7a" }}>{message}</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
        </div>
      </div>
    </>
  );
}
