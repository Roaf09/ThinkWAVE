/* FILE GUIDE:
 * client/src/pages/superadmin/SuperadminDashboard.jsx
 * Purpose: Superadmin dashboard shell and management screens.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { clearToken, clearRole } from "../../lib/auth";
import { setAuthToken } from "../../lib/api";
import { useTheme, useColors, ThemedModal } from "../../context/ThemeContext";

const NAV = [
  { id: "overview",      label: "Overview",           icon: "◉"  },
  { id: "accounts",      label: "Account Management", icon: "👥" },
  { id: "notifications", label: "Notifications",      icon: "🔔" },
];

// Shared helpers
const card = (c, override = {}) => ({
  background: c.cardBg, border: `1px solid ${c.border}`,
  borderRadius: 14, padding: 16,
  transition: "background 0.3s, border-color 0.3s",
  ...override,
});

function Badge({ label, c, green = false, style = {} }) {
  return (
    <span style={{
      padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600,
      border: `1px solid ${green ? c.greenBorder : c.border}`,
      background: green ? c.greenBg : c.cardBg2,
      color: green ? c.greenFg : c.text,   // ← always readable text
      transition: "background 0.3s, color 0.3s",
      ...style,
    }}>{label}</span>
  );
}

export default function SuperadminDashboard() {
  const [activeTab,  setActiveTab]  = useState("overview");
  const [showLogout, setShowLogout] = useState(false);
  const navigate = useNavigate();
  const { dark, toggleTheme } = useTheme();
  const c = useColors();

  function doLogout() { clearToken(); clearRole(); setAuthToken(""); navigate("/"); }

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: c.pageBg, transition: "background 0.3s" }}>
      <aside style={{
        width: 220, minWidth: 220, background: c.sidebarBg,
        borderRight: `1px solid ${c.sidebarBorder}`,
        display: "flex", flexDirection: "column", padding: "0 0 24px",
        position: "fixed", top: 0, left: 0, height: "100vh", overflowY: "auto", zIndex: 100,
        transition: "background 0.3s, border-color 0.3s",
      }}>
        <div style={{ padding: "22px 20px 18px", display: "flex", alignItems: "baseline", gap: 4, borderBottom: `1px solid ${c.sidebarBorder}`, marginBottom: 12 }}>
          <span style={{ fontSize: 18, fontWeight: 900, color: "#e7e9ee" }}>Think</span>
          <span style={{ fontSize: 18, fontWeight: 900, color: "#2b6cff" }}>WAVE</span>
          <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.08em", background: "#450a0a", color: "#f87171", padding: "2px 6px", borderRadius: 4, marginLeft: 4 }}>SUPER</span>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 4, padding: "0 12px", flex: 1 }}>
          {NAV.map(item => (
            <button key={item.id} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 14px", borderRadius: 10, border: "none",
              background: activeTab === item.id ? "#2b6cff" : "transparent",
              color: activeTab === item.id ? "#fff" : c.navColor,
              fontSize: 14, fontWeight: 600, cursor: "pointer", textAlign: "left", width: "100%",
              transition: "background 0.2s, color 0.2s",
            }} onClick={() => setActiveTab(item.id)}>
              <span style={{ fontSize: 16, width: 20, textAlign: "center" }}>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div style={{ padding: "0 12px", marginBottom: 8 }}>
          <button onClick={toggleTheme} style={{
            display: "flex", alignItems: "center", gap: 10, width: "100%",
            padding: "10px 14px", borderRadius: 10, border: `1px solid ${c.sidebarBorder}`,
            background: "transparent", color: c.navColor, fontSize: 13, fontWeight: 600, cursor: "pointer",
            transition: "color 0.2s, border-color 0.2s",
          }}>
            <span>{dark ? "☀️" : "🌙"}</span>
            <span>{dark ? "Light Mode" : "Dark Mode"}</span>
          </button>
        </div>

        <div style={{ padding: "0 12px" }}>
          <button onClick={() => setShowLogout(true)} style={{
            display: "flex", alignItems: "center", gap: 10, width: "100%",
            padding: "10px 14px", borderRadius: 10, border: `1px solid ${c.sidebarBorder}`,
            background: "transparent", color: c.navColor, fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>⏻ &nbsp;Logout</button>
        </div>
      </aside>

      <main style={{ marginLeft: 220, width: "calc(100% - 220px)", flex: 1, minHeight: "100vh", overflowY: "scroll", overflowX: "hidden", scrollbarGutter: "stable both-edges", boxSizing: "border-box" }}>
        <div key={activeTab} className="dashboard-tab-panel">
          {activeTab === "overview"      && <OverviewTab />}
          {activeTab === "accounts"      && <AccountManagementTab />}
          {activeTab === "notifications" && <NotificationsTab />}
        </div>
      </main>

      {showLogout && (
        <ThemedModal icon="⏻" title="Log out?" message="Are you sure you want to log out of the Superadmin dashboard?" onClose={() => setShowLogout(false)}>
          <button className="btn secondary" onClick={() => setShowLogout(false)}>Cancel</button>
          <button className="btn" style={{ background: "#7f1d1d", color: "#fca5a5" }} onClick={doLogout}>Yes, Log Out</button>
        </ThemedModal>
      )}
    </div>
  );
}

function OverviewTab() {
  const [stats, setStats] = useState(null);
  const c = useColors();
  useEffect(() => { api.get("/superadmin/stats").then(({ data }) => setStats(data)).catch(console.error); }, []);
  return (
    <div className="container">
      <h2 style={{ marginBottom: 4, color: c.text }}>Overview</h2>
      <p style={{ color: c.textMuted, marginTop: 0, marginBottom: 24, fontSize: 14 }}>System-wide snapshot.</p>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {[
          { label: "Total Admins",      value: stats?.totalAdmins      ?? "…", color: "#60a5fa" },
          { label: "Total Teachers",    value: stats?.totalTeachers    ?? "…", color: "#34d399" },
          { label: "Currently Online",  value: stats?.currentlyOnline  ?? "…", color: "#fbbf24" },
          { label: "Live Sessions Now", value: stats?.liveSessionCount ?? "…", color: "#f87171" },
        ].map(s => (
          <div key={s.label} style={{ ...card(c), flex: 1, minWidth: 180, textAlign: "center", padding: 24 }}>
            <div style={{ fontSize: 40, fontWeight: 900, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 13, color: c.textMuted, marginTop: 6 }}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AccountManagementTab() {
  const [institutions, setInstitutions] = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [editModal,    setEditModal]    = useState(null);
  const [confirmModal, setConfirmModal] = useState(null);
  const c = useColors();

  const load = useCallback(async () => {
    try { const { data } = await api.get("/superadmin/accounts"); setInstitutions(data || []); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function setActive(id, active) { await api.post(`/superadmin/accounts/${id}/active`, { active }); setConfirmModal(null); setEditModal(null); load(); }
  async function del(id)               { await api.delete(`/superadmin/accounts/${id}`); setConfirmModal(null); setEditModal(null); load(); }

  if (loading) return <div className="container"><div style={card(c)}>Loading…</div></div>;

  return (
    <div className="container">
      <h2 style={{ marginBottom: 4, color: c.text }}>Account Management</h2>
      <p style={{ color: c.textMuted, marginTop: 0, marginBottom: 20, fontSize: 14 }}>Schools / institutions, their admins, and teachers.</p>

      {institutions.length === 0 && (
        <div style={{ ...card(c), textAlign: "center", padding: "48px 24px", color: c.textMuted }}>No accounts created yet.</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {institutions.map(inst => (
          <InstitutionBlock key={inst.name} inst={inst} onEdit={u => setEditModal({ user: u })} c={c} />
        ))}
      </div>

      {editModal && !confirmModal && (
        <ThemedModal icon="✏️" title={`${editModal.user.last_name}, ${editModal.user.first_name}`} message={editModal.user.email} onClose={() => setEditModal(null)}>
          <button className="btn" style={{ background: editModal.user.is_active ? "#854d0e" : "#166534" }}
            onClick={() => setConfirmModal({ type: editModal.user.is_active ? "deactivate" : "reactivate", user: editModal.user })}>
            {editModal.user.is_active ? "Deactivate Account" : "Reactivate Account"}
          </button>
          <button className="btn" style={{ background: "#7f1d1d" }} onClick={() => setConfirmModal({ type: "delete", user: editModal.user })}>Delete Account</button>
          <button className="btn secondary" onClick={() => setEditModal(null)}>Cancel</button>
        </ThemedModal>
      )}

      {confirmModal && (
        <ThemedModal
          icon={confirmModal.type === "delete" ? "🗑" : confirmModal.type === "deactivate" ? "⚠️" : "✓"}
          title={confirmModal.type === "delete" ? "Delete Account?" : confirmModal.type === "deactivate" ? "Deactivate Account?" : "Reactivate Account?"}
          message={`${confirmModal.type === "delete" ? "Delete" : confirmModal.type === "deactivate" ? "Deactivate" : "Reactivate"} ${confirmModal.user.first_name} ${confirmModal.user.last_name}?`}
          onClose={() => setConfirmModal(null)}>
          <button className="btn secondary" onClick={() => setConfirmModal(null)}>Cancel</button>
          <button className="btn"
            style={{ background: confirmModal.type === "delete" ? "#7f1d1d" : confirmModal.type === "deactivate" ? "#854d0e" : "#166534" }}
            onClick={() => {
              if (confirmModal.type === "delete") del(confirmModal.user.id);
              else setActive(confirmModal.user.id, confirmModal.type !== "deactivate");
            }}>Confirm</button>
        </ThemedModal>
      )}
    </div>
  );
}

function InstitutionBlock({ inst, onEdit, c }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={card(c)}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 800, fontSize: 17, color: c.text }}>🏫 {inst.name}</div>
        <button onClick={() => setOpen(v => !v)} style={{ padding: "5px 12px", borderRadius: 8, border: `1px solid ${c.border}`, background: c.cardBg2, color: c.text, fontSize: 12, cursor: "pointer" }}>
          {open ? "▲" : "▼"}
        </button>
      </div>
      <div className={`collapsible-content ${open ? "open" : ""}`} style={{ marginTop: open ? 14 : 0 }}>
        <div className="collapsible-inner">
          {inst.admins?.map(admin => (
            <div key={admin.id}>
              <UserRow user={admin} roleLabel="Admin" onEdit={onEdit} c={c} />
              {admin.teachers?.map(t => <UserRow key={t.id} user={t} roleLabel="Teacher" indent onEdit={onEdit} c={c} />)}
            </div>
          ))}
          {inst.orphanTeachers?.map(t => <UserRow key={t.id} user={t} roleLabel="Teacher" indent onEdit={onEdit} c={c} />)}
        </div>
      </div>
    </div>
  );
}

function UserRow({ user, roleLabel, indent, onEdit, c }) {
  const fmtDate = d => d ? new Date(d).toLocaleDateString("en-PH") : "—";
  const isOnline = user.last_active_at && (Date.now() - new Date(user.last_active_at).getTime()) < 30 * 60 * 1000;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
      padding: "8px 12px", marginTop: 6, borderRadius: 10,
      background: indent ? c.cardBg2 : c.cardBg,
      border: `1px solid ${c.border}`,
      marginLeft: indent ? 24 : 0,
      transition: "background 0.3s",
    }}>
      {/* Role badge — always readable */}
      <span style={{
        padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700,
        background: c.accent + "22", border: `1px solid ${c.accent}55`,
        color: c.accent,   // accent blue is readable in both modes
      }}>{roleLabel}</span>

      <span style={{ fontWeight: 600, fontSize: 14, flex: 1, minWidth: 140, color: c.text }}>{user.last_name}, {user.first_name}</span>
      <span style={{ fontSize: 12, color: c.textMuted, flex: 1 }}>{user.email}</span>
      <span style={{ fontSize: 12, color: c.textMuted }}>Joined {fmtDate(user.created_at)}</span>

      <span style={{
        padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600,
        background: isOnline ? c.greenBg : c.cardBg2,
        color: isOnline ? c.greenFg : c.textMuted,
        border: `1px solid ${isOnline ? c.greenBorder : c.border}`,
      }}>
        {user.is_active ? (isOnline ? "● Online" : "Active") : "Inactive"}
      </span>

      <button onClick={() => onEdit(user)} style={{
        background: "none", border: `1px solid ${c.border}`, borderRadius: 8,
        padding: "4px 8px", color: c.textMuted, cursor: "pointer", fontSize: 14, flexShrink: 0,
        transition: "border-color 0.2s",
      }}>✏</button>
    </div>
  );
}

function NotificationsTab() {
  const [logs, setLogs]       = useState([]);
  const [loading, setLoading] = useState(true);
  const c = useColors();

  useEffect(() => {
    api.get("/superadmin/notifications")
      .then(({ data }) => setLogs(data || []))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, []);

  const fmtTime = d => d ? new Date(d).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }) : "—";

  function logMsg(log) {
    if (log.type === "INSTITUTION_SETUP")
      return <><b style={{ color: c.text }}>{log.name}</b><span style={{ color: c.textMuted }}> (Admin) set up institution as </span><b style={{ color: c.text }}>{log.institution_name}</b>.</>;
    const roleLabel =
      log.role === "SUPERADMIN" ? "Super Admin"
      : log.role === "ADMIN" ? "Administrator"
      : "Teacher";
    return <><b style={{ color: c.text }}>{log.name}</b><span style={{ color: c.textMuted }}> registered as </span><b style={{ color: c.text }}>{roleLabel}</b>{log.email && <span style={{ color: c.textMuted }}> ({log.email})</span>}.</>;
  }

  return (
    <div className="container">
      <h2 style={{ marginBottom: 4, color: c.text }}>Notifications</h2>
      <p style={{ color: c.textMuted, marginTop: 0, marginBottom: 20, fontSize: 14 }}>Recent registrations and institution setup activity.</p>

      {loading && <div style={card(c)}>Loading…</div>}

      {!loading && logs.length === 0 && (
        <div style={{ ...card(c), textAlign: "center", padding: "48px 24px", color: c.textMuted }}>No notifications yet.</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {logs.map(log => (
          <div key={log.id} style={{ ...card(c), display: "flex", gap: 14, alignItems: "flex-start" }}>
            <div style={{ fontSize: 24, flexShrink: 0 }}>{log.type === "INSTITUTION_SETUP" ? "🏫" : "👤"}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, lineHeight: 1.6 }}>{logMsg(log)}</div>
              <div style={{ fontSize: 12, color: c.textMuted, marginTop: 4 }}>{fmtTime(log.created_at)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
