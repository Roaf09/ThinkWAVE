/* FILE GUIDE:
 * client/src/pages/teacher/TeacherDashboard.jsx
 * Purpose: Teacher dashboard shell and tab container.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { clearToken, clearRole } from "../../lib/auth";
import { setAuthToken } from "../../lib/api";
import { useTheme, useColors, ThemedModal } from "../../context/ThemeContext";

import HomeTab           from "./tabs/HomeTab";
import CreateTab         from "./tabs/CreateTab";
import QuestionBankTab   from "./tabs/QuestionBankTab";
import LiveSessionsTab   from "./tabs/LiveSessionsTab";
import ClassesTab        from "./tabs/ClassesTab";
import SessionHistoryTab from "./tabs/SessionHistoryTab";
import InvitationTab     from "./tabs/InvitationTab";

export default function TeacherDashboard() {
  const [activeTab, setActiveTab] = useState("home");
  const [showLogout, setShowLogout] = useState(false);
  const [bankLabel, setBankLabel] = useState("Quiz Bank");
  const navigate = useNavigate();
  const { dark, toggleTheme } = useTheme();
  const c = useColors();

  function doLogout() {
    clearToken();
    clearRole();
    setAuthToken("");
    navigate("/");
  }

  const navItems = [
    { id: "home", label: "Home", icon: "⌂" },
    { id: "create", label: "Create", icon: "＋" },
    { id: "bank", label: bankLabel, icon: "◈" },
    { id: "live", label: "Live Sessions", icon: "▶" },
    { id: "classes", label: "Classes", icon: "⊞" },
    { id: "history", label: "Session History", icon: "◷" },
    { id: "invitation", label: "Invitation", icon: "✉" },
  ];

  function renderTab() {
    switch (activeTab) {
      case "home":
        return <HomeTab setActiveTab={setActiveTab} />;
      case "create":
        return <CreateTab setActiveTab={setActiveTab} />;
      case "bank":
        return <QuestionBankTab setBankLabel={setBankLabel} setActiveTab={setActiveTab} />;
      case "live":
        return <LiveSessionsTab setActiveTab={setActiveTab} />;
      case "classes":
        return <ClassesTab setActiveTab={setActiveTab} />;
      case "history":
        return <SessionHistoryTab setActiveTab={setActiveTab} />;
      case "invitation":
        return <InvitationTab setActiveTab={setActiveTab} />;
      default:
        return <HomeTab setActiveTab={setActiveTab} />;
    }
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: c.pageBg, transition: "background 0.3s" }}>
      <aside
        style={{
          width: 220,
          minWidth: 220,
          background: c.sidebarBg,
          borderRight: `1px solid ${c.sidebarBorder}`,
          display: "flex",
          flexDirection: "column",
          padding: "0 0 24px",
          position: "fixed",
          top: 0,
          left: 0,
          height: "100vh",
          overflowY: "auto",
          zIndex: 100,
          transition: "background 0.3s, border-color 0.3s",
        }}
      >
        <div style={{ padding: "26px 24px 22px", display: "flex", alignItems: "baseline", borderBottom: `1px solid ${c.sidebarBorder}`, marginBottom: 12 }}>
          <span style={{ fontSize: 20, fontWeight: 900, color: "#e7e9ee" }}>Think</span>
          <span style={{ fontSize: 20, fontWeight: 900, color: "#2b6cff" }}>WAVE</span>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 4, padding: "0 12px", flex: 1 }}>
          {navItems.map((item) => (
            <button
              key={item.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 14px",
                borderRadius: 10,
                border: "none",
                background: activeTab === item.id ? "#2b6cff" : "transparent",
                color: activeTab === item.id ? "#fff" : c.navColor,
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                textAlign: "left",
                width: "100%",
                transition: "background 0.2s, color 0.2s",
              }}
              onClick={() => setActiveTab(item.id)}
            >
              <span style={{ fontSize: 16, width: 20, textAlign: "center" }}>{item.icon}</span>
              <span key={item.id === "bank" ? item.label : `${item.id}-${item.label}`} className={item.id === "bank" ? "sidebar-bank-label" : undefined}>{item.label}</span>
            </button>
          ))}
        </nav>

        <div style={{ padding: "0 12px", marginBottom: 8 }}>
          <button
            onClick={toggleTheme}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              width: "100%",
              padding: "10px 14px",
              borderRadius: 10,
              border: `1px solid ${c.sidebarBorder}`,
              background: "transparent",
              color: c.navColor,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              transition: "color 0.2s, border-color 0.2s",
            }}
          >
            <span>{dark ? "☀️" : "🌙"}</span>
            <span>{dark ? "Light Mode" : "Dark Mode"}</span>
          </button>
        </div>

        <div style={{ padding: "0 12px" }}>
          <button
            onClick={() => setShowLogout(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              width: "100%",
              padding: "10px 14px",
              borderRadius: 10,
              border: `1px solid ${c.sidebarBorder}`,
              background: "transparent",
              color: c.navColor,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              transition: "color 0.2s, border-color 0.2s",
            }}
          >
            ⏻ &nbsp;Logout
          </button>
        </div>
      </aside>

      <main style={{ marginLeft: 220, width: "calc(100% - 220px)", flex: 1, minHeight: "100vh", overflowY: "scroll", overflowX: "hidden", scrollbarGutter: "stable both-edges", boxSizing: "border-box" }}>
        <div key={activeTab} className="dashboard-tab-panel">
          {renderTab()}
        </div>
      </main>

      {showLogout && (
        <ThemedModal icon="⏻" title="Log out?" message="Are you sure you want to log out?" onClose={() => setShowLogout(false)}>
          <button className="btn secondary" onClick={() => setShowLogout(false)}>Cancel</button>
          <button className="btn" style={{ background: "#7f1d1d", color: "#fca5a5" }} onClick={doLogout}>Yes, Log Out</button>
        </ThemedModal>
      )}
    </div>
  );
}
