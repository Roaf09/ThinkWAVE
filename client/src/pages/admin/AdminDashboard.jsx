/* FILE GUIDE:
 * client/src/pages/admin/AdminDashboard.jsx
 * Purpose: Admin dashboard shell.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { clearToken, clearRole } from "../../lib/auth";
import { setAuthToken } from "../../lib/api";
import { useTheme, useColors, ThemedModal } from "../../context/ThemeContext";

const NAV = [
  { id: "overview",   label: "Overview",   icon: "◉"  },
  { id: "teachers",   label: "Teachers",   icon: "👥" },
  { id: "invitation", label: "Invitation", icon: "✉"  },
];

const card = (c, override = {}) => ({
  background: c.cardBg, border: `1px solid ${c.border}`,
  borderRadius: 14, padding: 16,
  transition: "background 0.3s, border-color 0.3s",
  ...override,
});

function Badge({ label, c, green = false, inactive = false }) {
  return (
    <span style={{
      padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600,
      border: `1px solid ${green ? c.greenBorder : c.border}`,
      background: green ? c.greenBg : c.cardBg2,
      color: green ? c.greenFg : c.text,
      transition: "background 0.3s, color 0.3s",
    }}>{label}</span>
  );
}

export default function AdminDashboard() {
  const [activeTab,  setActiveTab]  = useState("overview");
  const [setupDone,  setSetupDone]  = useState(true);
  const [instName,   setInstName]   = useState("");
  const [instCtrl,   setInstCtrl]   = useState("");
  const [setupMsg,   setSetupMsg]   = useState("");
  const [showLogout, setShowLogout] = useState(false);
  const navigate = useNavigate();
  const { dark, toggleTheme } = useTheme();
  const c = useColors();

  useEffect(() => {
    api.get("/admin-dashboard/setup-status")
      .then(({ data }) => { setSetupDone(data.setupDone ?? true); setInstName(data.institutionName ?? ""); })
      .catch(() => {});
  }, []);

  async function doSetup() {
    if (!instCtrl.trim()) return;
    try {
      await api.post("/admin-dashboard/setup-institution", { institutionName: instCtrl.trim() });
      setSetupDone(true); setInstName(instCtrl.trim());
    } catch (e) { setSetupMsg(e?.response?.data?.message || "Failed."); }
  }

  function doLogout() { clearToken(); clearRole(); setAuthToken(""); navigate("/"); }

  // First-login setup screen
  if (!setupDone) {
    return (
      <div style={{ minHeight: "100vh", background: c.pageBg, display: "flex", alignItems: "center", justifyContent: "center", padding: 28, transition: "background 0.3s" }}>
        <div style={{ ...card(c), maxWidth: 420, width: "100%", padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🏫</div>
          <h2 style={{ margin: "0 0 8px", color: c.text }}>Welcome!</h2>
          <p style={{ color: c.textMuted, fontSize: 14, marginBottom: 28, lineHeight: 1.6 }}>
            Enter your school or institution name to set up your account.
          </p>
          <input value={instCtrl} onChange={e => setInstCtrl(e.target.value)}
            placeholder="e.g. Mapúa University"
            style={{ width: "100%", boxSizing: "border-box", padding: "13px 16px", borderRadius: 12, border: `1px solid ${c.inputBorder}`, background: c.inputBg, color: c.text, fontSize: 15, marginBottom: 10 }} />
          {setupMsg && <p style={{ color: c.redFg, fontSize: 13, marginBottom: 10 }}>{setupMsg}</p>}
          <button onClick={doSetup} style={{ width: "100%", padding: "14px", borderRadius: 50, border: "none", background: c.accent, color: "#fff", fontWeight: 800, fontSize: 16, cursor: "pointer" }}>
            Save &amp; Continue
          </button>
        </div>
      </div>
    );
  }

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
          <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.08em", background: "#164e63", color: "#67e8f9", padding: "2px 6px", borderRadius: 4, marginLeft: 4 }}>ADMIN</span>
        </div>
        {instName && (
          <div style={{ padding: "0 16px 14px", fontSize: 12, color: c.navColor, borderBottom: `1px solid ${c.sidebarBorder}`, marginBottom: 10 }}>
            🏫 {instName}
          </div>
        )}

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
            transition: "color 0.2s",
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
          {activeTab === "overview"   && <AdminOverview c={c} />}
          {activeTab === "teachers"   && <AdminTeachers c={c} />}
          {activeTab === "invitation" && <AdminInvitation c={c} />}
        </div>
      </main>

      {showLogout && (
        <ThemedModal icon="⏻" title="Log out?" message="Are you sure you want to log out of the Admin dashboard?" onClose={() => setShowLogout(false)}>
          <button className="btn secondary" onClick={() => setShowLogout(false)}>Cancel</button>
          <button className="btn" style={{ background: "#7f1d1d", color: "#fca5a5" }} onClick={doLogout}>Yes, Log Out</button>
        </ThemedModal>
      )}
    </div>
  );
}

function AdminOverview({ c }) {
  const [stats, setStats] = useState(null);
  useEffect(() => { api.get("/admin-dashboard/stats").then(({ data }) => setStats(data)).catch(() => {}); }, []);
  return (
    <div className="container">
      <h2 style={{ marginBottom: 4, color: c.text }}>Overview</h2>
      <p style={{ color: c.textMuted, marginTop: 0, marginBottom: 24, fontSize: 14 }}>Institution snapshot.</p>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {[
          { label: "Total Teachers", value: stats?.totalTeachers    ?? "…", color: "#34d399" },
          { label: "Active Now",     value: stats?.currentlyOnline  ?? "…", color: "#fbbf24" },
          { label: "Live Sessions",  value: stats?.liveSessionCount ?? "…", color: "#f87171" },
        ].map(s => (
          <div key={s.label} style={{ ...card(c), flex: 1, minWidth: 150, textAlign: "center", padding: 24 }}>
            <div style={{ fontSize: 36, fontWeight: 900, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 13, color: c.textMuted, marginTop: 6 }}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminTeachers({ c }) {
  const [teachers, setTeachers] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [confirm,  setConfirm]  = useState(null);

  async function load() {
    try { const { data } = await api.get("/admin-dashboard/teachers"); setTeachers(data || []); }
    catch {} finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function toggleActive(id, active) {
    await api.post(`/admin-dashboard/teachers/${id}/active`, { active });
    setConfirm(null); load();
  }

  if (loading) return <div className="container"><div style={card(c)}>Loading…</div></div>;

  return (
    <div className="container">
      <h2 style={{ marginBottom: 4, color: c.text }}>Teachers</h2>
      <p style={{ color: c.textMuted, marginTop: 0, marginBottom: 20, fontSize: 14 }}>Manage teacher accounts in your institution.</p>

      {teachers.length === 0 && (
        <div style={{ ...card(c), color: c.textMuted, textAlign: "center", padding: "40px 24px" }}>
          No teachers yet. Share your invitation code to add teachers.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {teachers.map(t => (
          <div key={t.id} style={{ ...card(c), display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: c.text }}>{t.last_name}, {t.first_name}</div>
              <div style={{ fontSize: 13, color: c.textMuted }}>{t.email}</div>
            </div>
            {/* Status badge — always readable */}
            <span style={{
              padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600,
              background: t.is_active ? c.greenBg : c.cardBg2,
              color: t.is_active ? c.greenFg : c.textMuted,
              border: `1px solid ${t.is_active ? c.greenBorder : c.border}`,
            }}>
              {t.is_active ? "Active" : "Inactive"}
            </span>
            <button onClick={() => setConfirm({ user: t, action: t.is_active ? "deactivate" : "activate" })}
              style={{ padding: "7px 14px", borderRadius: 10, border: `1px solid ${c.border}`, background: c.cardBg2, color: c.text, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              {t.is_active ? "Deactivate" : "Activate"}
            </button>
          </div>
        ))}
      </div>

      {confirm && (
        <ThemedModal
          icon={confirm.action === "deactivate" ? "⚠️" : "✓"}
          title={confirm.action === "deactivate" ? "Deactivate Teacher?" : "Activate Teacher?"}
          message={`${confirm.action === "deactivate" ? "Deactivate" : "Activate"} ${confirm.user.first_name} ${confirm.user.last_name}?`}
          onClose={() => setConfirm(null)}>
          <button className="btn secondary" onClick={() => setConfirm(null)}>Cancel</button>
          <button className="btn"
            style={{ background: confirm.action === "deactivate" ? "#854d0e" : "#166534" }}
            onClick={() => toggleActive(confirm.user.id, confirm.action !== "deactivate")}>
            Confirm
          </button>
        </ThemedModal>
      )}
    </div>
  );
}

function AdminInvitation({ c }) {
  const [invite,  setInvite]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg,     setMsg]     = useState("");

  async function load() {
    try { const { data } = await api.get("/admin-dashboard/invitation"); setInvite(data); }
    catch {} finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function generate() {
    try { const { data } = await api.post("/admin-dashboard/invitation", {}); setInvite(data); setMsg("New code generated!"); }
    catch (e) { setMsg(e?.response?.data?.message || "Failed."); }
  }
  async function revoke() {
    if (!invite) return;
    try { await api.delete(`/admin-dashboard/invitation/${invite.id}`); setInvite(null); setMsg("Code revoked."); }
    catch (e) { setMsg(e?.response?.data?.message || "Failed."); }
  }

  if (loading) return <div className="container"><div style={card(c)}>Loading…</div></div>;

  return (
    <div className="container">
      <h2 style={{ marginBottom: 4, color: c.text }}>Teacher Invitation</h2>
      <p style={{ color: c.textMuted, marginTop: 0, marginBottom: 20, fontSize: 14 }}>
        Share this code with teachers to link them to your institution.
      </p>
      {msg && <p style={{ fontSize: 13, color: c.greenFg }}><small>{msg}</small></p>}

      {invite ? (
        <div style={{ ...card(c), textAlign: "center" }}>
          <div style={{ fontSize: 12, color: c.textMuted, marginBottom: 8 }}>Invitation Code</div>
          <div style={{ fontSize: 40, fontWeight: 900, color: c.accent, letterSpacing: 6, marginBottom: 16 }}>
            {invite.invite_code}
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button onClick={generate} style={{ padding: "8px 20px", borderRadius: 10, border: `1px solid ${c.border}`, background: c.cardBg2, color: c.text, fontWeight: 600, cursor: "pointer" }}>↺ Regenerate</button>
            <button onClick={revoke} style={{ padding: "8px 20px", borderRadius: 10, border: `1px solid ${c.redBorder}`, background: c.redBg, color: c.redFg, fontWeight: 600, cursor: "pointer" }}>✕ Revoke</button>
          </div>
        </div>
      ) : (
        <div style={{ ...card(c), textAlign: "center", padding: 40 }}>
          <p style={{ color: c.textMuted, marginBottom: 20 }}>No active invitation code.</p>
          <button onClick={generate} style={{ padding: "12px 32px", borderRadius: 50, border: "none", background: c.accent, color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>Generate Code</button>
        </div>
      )}
    </div>
  );
}
