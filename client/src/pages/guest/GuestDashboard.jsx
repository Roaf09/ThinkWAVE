import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, API_BASE, setAuthToken } from "../../lib/api";
import { setRole, setToken, clearRole, clearToken } from "../../lib/auth";
import { useTheme, useColors, ThemedModal } from "../../context/ThemeContext";
import { TwIcon } from "../../components/TwUI";
import ThemeIconButton from "../../components/ThemeIconButton";
import GuestCreateTab from "./GuestCreateTab";
import LiveSessionsTab from "../teacher/tabs/LiveSessionsTab";
import SessionHistoryTab from "../teacher/tabs/SessionHistoryTab";

const NAV = [
  { id: "create", label: "Create", icon: "create" },
  { id: "live", label: "Sessions", icon: "live" },
  { id: "history", label: "History", icon: "history" },
];

export default function GuestDashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const { dark, toggleTheme } = useTheme();
  const c = useColors();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [showExit, setShowExit] = useState(false);
  const [activeTab, setActiveTabState] = useState(() => location.state?.tab || sessionStorage.getItem("guest_active_tab") || "create");

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        let token = sessionStorage.getItem("guest_token");
        if (!token) {
          const { data } = await api.post("/auth/guest-token");
          token = data.token;
          sessionStorage.setItem("guest_token", token);
        }
        setToken(token);
        setRole("TEACHER");
        localStorage.setItem("qz_guest_mode", "1");
        setAuthToken(token);
        if (!ignore) setReady(true);
      } catch (e) {
        if (!ignore) setError(e?.response?.data?.message || "Guest mode could not be started.");
      }
    })();
    return () => { ignore = true; };
  }, []);

  useEffect(() => {
    if (location.state?.tab) setActiveTab(location.state.tab);
  }, [location.state]);

  function setActiveTab(tab) {
    sessionStorage.setItem("guest_active_tab", tab);
    setActiveTabState(tab);
  }

  function exitGuest() {
    sessionStorage.removeItem("guest_token");
    sessionStorage.removeItem("guest_active_tab");
    localStorage.removeItem("qz_guest_mode");
    clearToken();
    clearRole();
    setAuthToken("");
    navigate("/");
  }

  function renderTab() {
    if (activeTab === "live") return <LiveSessionsTab setActiveTab={setActiveTab} guestMode />;
    if (activeTab === "history") return <SessionHistoryTab setActiveTab={setActiveTab} guestMode />;
    return <GuestCreateTab setActiveTab={setActiveTab} />;
  }

  if (!ready) {
    return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: c.pageBg, color: c.text }}>
      <div style={{ padding: 24, borderRadius: 18, background: c.cardBg, border: `1px solid ${c.border}`, fontWeight: 800 }}>{error || "Preparing Guest Host…"}</div>
    </div>;
  }

  return <div style={{ display: "flex", minHeight: "100vh", background: c.pageBg, transition: "background .3s ease" }}>
    <aside data-sidebar="true" style={sidebar(c)}>
      <div style={{ padding: "26px 18px 22px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${c.sidebarBorder}`, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "baseline" }}>
          <span style={{ fontSize: 20, fontWeight: 900, color: "#e7e9ee" }}>Think</span><span style={{ fontSize: 20, fontWeight: 900, color: "#2b6cff" }}>WAVE</span>
          <span style={{ marginLeft: 7, padding: "2px 7px", borderRadius: 999, fontSize: 9, fontWeight: 950, letterSpacing: ".08em", background: "rgba(139,92,246,.2)", color: "#c4b5fd", border: "1px solid rgba(196,181,253,.25)" }}>GUEST</span>
        </div>
      </div>
      <nav style={{ display: "flex", flexDirection: "column", gap: 4, padding: "0 12px", flex: 1 }}>
        {NAV.map((item) => <button key={item.id} onClick={() => setActiveTab(item.id)} style={navButton(c, activeTab === item.id)}>
          <span style={{ width: 20, display: "inline-flex", justifyContent: "center" }}><TwIcon name={item.icon} size={18} /></span><span>{item.label}</span>
        </button>)}
      </nav>
      <div style={{ padding: "0 12px", display: "flex", gap: 8, alignItems: "center" }}>
        <ThemeIconButton dark={dark} onClick={toggleTheme} style={{ color: c.navColor, borderColor: c.sidebarBorder, background: "transparent", flex: "0 0 auto" }} size={17} />
        <button onClick={() => setShowExit(true)} style={{ ...sideAction(c), flex: 1, justifyContent: "center" }}><TwIcon name="logout" size={17} /><span>Exit Guest</span></button>
      </div>
    </aside>
    <main style={{ marginLeft: 220, width: "calc(100% - 220px)", flex: 1, minHeight: "100vh", overflowY: "scroll", overflowX: "hidden", scrollbarGutter: "stable both-edges", boxSizing: "border-box" }}>
      <div key={activeTab} className="dashboard-tab-panel">{renderTab()}</div>
    </main>
    {showExit && <ThemedModal icon={<TwIcon name="logout" size={30} />} title="Exit Guest Host?" message="Your temporary Guest Host access will end." onClose={() => setShowExit(false)}><button className="btn secondary" onClick={() => setShowExit(false)}>Stay</button><button className="btn" onClick={exitGuest}>Exit</button></ThemedModal>}
  </div>;
}

function sidebar(c) { return { width: 220, minWidth: 220, background: c.sidebarBg, borderRight: `1px solid ${c.sidebarBorder}`, display: "flex", flexDirection: "column", padding: "0 0 24px", position: "fixed", top: 0, left: 0, height: "100vh", overflowY: "auto", zIndex: 100, boxSizing: "border-box", transition: "background .3s,border-color .3s" }; }
function navButton(c, active) { return { display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderRadius: 12, border: "none", background: active ? c.accent : "transparent", color: active ? "#fff" : c.navColor, fontSize: 14, fontWeight: 800, cursor: "pointer", textAlign: "left", width: "100%", transition: "transform .18s ease,background .2s,color .2s" }; }
function sideAction(c) { return { display: "flex", alignItems: "center", gap: 9, minHeight: 40, padding: "9px 12px", borderRadius: 12, border: `1px solid ${c.sidebarBorder}`, background: "transparent", color: c.navColor, fontWeight: 800, cursor: "pointer" }; }
