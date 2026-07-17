/* FILE GUIDE:
 * client/src/pages/guest/GuestDashboard.jsx
 * Purpose: Project source file. Read the file name and exports first, then follow the imported helpers to understand the flow.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

// NEW FILE
//
// guest experience: completely client-side, no account, no login.
// quiz data is stored in memory only (lost on page refresh).
// uses the same QuizBuilder the teacher uses, but guest quizzes are
// created under a temporary guest token issued by the server.
//
// tabs: Create, Live Sessions, Session History
// no: Home, Classes, Question Bank, Invitation

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "../../context/ThemeContext";
import GuestCreateTab    from "./GuestCreateTab";
import GuestLiveTab      from "./GuestLiveTab";
import GuestHistoryTab   from "./GuestHistoryTab";
import ThemeIconButton from "../../components/ThemeIconButton";

const NAV = [
  { id:"create",  label:"Create",          icon:"＋" },
  { id:"live",    label:"Live Sessions",   icon:"▶" },
  { id:"history", label:"Session History", icon:"◷" },
];

// Shared modal
function ConfirmModal({ icon, title, message, children, onClose }) {
  return (
    <>
      <div style={ms.backdrop} onClick={onClose} />
      <div style={ms.wrap}>
        <div style={ms.card}>
          {icon    && <div style={{ fontSize:36, marginBottom:12 }}>{icon}</div>}
          {title   && <h3 style={{ margin:"0 0 8px", fontSize:20, fontWeight:900, color:"#e7e9ee" }}>{title}</h3>}
          {message && <p style={{ fontSize:14, opacity:0.7, margin:"0 0 22px", lineHeight:1.6, color:"#c7d2f0" }}>{message}</p>}
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>{children}</div>
        </div>
      </div>
    </>
  );
}
const ms = {
  backdrop: { position:"fixed", inset:0, backdropFilter:"blur(6px)", background:"rgba(0,0,0,0.65)", zIndex:200 },
  wrap:     { position:"fixed", inset:0, display:"flex", alignItems:"center", justifyContent:"center", zIndex:201, padding:20 },
  card:     { background:"#111e33", border:"1px solid #1a2d4a", borderRadius:20, padding:"36px 32px", width:"min(100%,380px)", textAlign:"center", boxShadow:"0 24px 80px rgba(0,0,0,0.6)" },
};

export default function GuestDashboard() {
  const [activeTab,  setActiveTab]  = useState("create");
  const [showExit,   setShowExit]   = useState(false);
  const navigate = useNavigate();
  const { dark, toggleTheme } = useTheme();

  function doExit() {
    sessionStorage.removeItem("guest_token");
    navigate("/");
  }

  const sidebarBg = dark ? "#0d1428" : "#1e2d55";
  const borderC   = dark ? "#1e2d55" : "#2a3b73";
  const navColor  = dark ? "#8a9bc4" : "#c7d2f0";
  const pageBg    = dark ? "#0b1020" : "#f0f4ff";

  function renderTab() {
    switch (activeTab) {
      case "create":  return <GuestCreateTab setActiveTab={setActiveTab} />;
      case "live":    return <GuestLiveTab   setActiveTab={setActiveTab} />;
      case "history": return <GuestHistoryTab />;
      default:        return <GuestCreateTab setActiveTab={setActiveTab} />;
    }
  }

  return (
    <div style={{ display:"flex", minHeight:"100vh", background:pageBg, transition:"background 0.3s" }}>

      <aside style={{
        width:220, minWidth:220, background:sidebarBg,
        borderRight:`1px solid ${borderC}`,
        display:"flex", flexDirection:"column", padding:"0 0 24px",
        position:"fixed", top:0, left:0, height:"100vh", overflowY:"auto", zIndex:100,
        transition:"background 0.3s, border-color 0.3s",
      }}>
        {/* Logo + badge */}
        <div style={{ padding:"22px 20px 14px", display:"flex", alignItems:"baseline", gap:4, borderBottom:`1px solid ${borderC}`, marginBottom:8 }}>
          <span style={{ fontSize:18, fontWeight:900, color:"#e7e9ee" }}>Think</span>
          <span style={{ fontSize:18, fontWeight:900, color:"#2b6cff" }}>WAVE</span>
          <span style={{ fontSize:10, fontWeight:900, letterSpacing:"0.08em", background:"#4c1d95", color:"#c4b5fd", padding:"2px 6px", borderRadius:4, marginLeft:4 }}>GUEST</span>
        </div>

        <div style={{ fontSize:11, opacity:0.45, padding:"0 18px 14px", lineHeight:1.5 }}>
          Temporary session — data is not saved permanently.
        </div>

        <nav style={{ display:"flex", flexDirection:"column", gap:4, padding:"0 12px", flex:1 }}>
          {NAV.map((item) => (
            <button key={item.id} style={{
              display:"flex", alignItems:"center", gap:10,
              padding:"10px 14px", borderRadius:10, border:"none",
              background: activeTab === item.id ? "#2b6cff" : "transparent",
              color:      activeTab === item.id ? "#fff" : navColor,
              fontSize:14, fontWeight:600, cursor:"pointer", textAlign:"left", width:"100%",
              transition:"background 0.2s, color 0.2s",
            }} onClick={() => setActiveTab(item.id)}>
              <span style={{ fontSize:16, width:20, textAlign:"center" }}>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Theme toggle */}
        <div style={{ padding:"0 12px", marginBottom:8 }}>
          <ThemeIconButton dark={dark} onClick={toggleTheme} style={{ width:"100%", color:navColor, borderColor:borderC, background:"transparent" }} />
        </div>

        {/* Exit Guest Mode */}
        <div style={{ padding:"0 12px" }}>
          <button onClick={() => setShowExit(true)} style={{
            display:"flex", alignItems:"center", gap:10, width:"100%",
            padding:"10px 14px", borderRadius:10, border:`1px solid #4c1d95`,
            background:"transparent", color:"#c4b5fd", fontSize:13, fontWeight:600, cursor:"pointer",
          }}>
            ✕ &nbsp;Exit Guest Mode
          </button>
        </div>
      </aside>

      <main style={{ marginLeft:220, flex:1, minHeight:"100vh", overflowY:"auto" }}>
        {renderTab()}
      </main>

      {showExit && (
        <ConfirmModal icon="✕" title="Exit Guest Mode?" message="Your session data will be lost. Are you sure you want to exit?" onClose={() => setShowExit(false)}>
          <button className="btn secondary" onClick={() => setShowExit(false)}>Stay</button>
          <button className="btn" style={{ background:"#4c1d95", color:"#c4b5fd" }} onClick={doExit}>Yes, Exit</button>
        </ConfirmModal>
      )}
    </div>
  );
}
