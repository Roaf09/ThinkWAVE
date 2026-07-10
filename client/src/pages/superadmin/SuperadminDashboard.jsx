/* FILE GUIDE:
 * client/src/pages/superadmin/SuperadminDashboard.jsx
 * Purpose: Superadmin dashboard for platform overview, institution oversight, notifications, and system health.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, setAuthToken } from "../../lib/api";
import { clearRole, clearToken } from "../../lib/auth";
import { ThemedModal, useColors, useTheme } from "../../context/ThemeContext";

const NAV = [
  { id: "overview", label: "Overview", icon: "◉" },
  { id: "institutions", label: "Institutions", icon: "🏫" },
  { id: "notifications", label: "Notifications", icon: "🔔" },
  { id: "health", label: "System Health", icon: "🩺" },
];

const sectionCard = (c, style = {}) => ({
  background: c.cardBg,
  border: `1px solid ${c.border}`,
  borderRadius: 18,
  padding: 18,
  boxShadow: "0 18px 40px rgba(15,23,42,0.08)",
  ...style,
});

const quietCard = (c, style = {}) => ({
  background: c.cardBg2,
  border: `1px solid ${c.border}`,
  borderRadius: 16,
  padding: 14,
  ...style,
});

function fmtDate(date) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

function fmtDateTime(date) {
  if (!date) return "—";
  return new Date(date).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
}

function badge(c, palette, label) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 11px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 800,
        border: `1px solid ${palette.border}`,
        background: palette.background,
        color: palette.color,
      }}
    >
      {label}
    </span>
  );
}

function semanticBadge(c, variant, label) {
  if (variant === "flagged") return badge(c, { background: c.redBg, color: c.redFg, border: c.redBorder }, label);
  if (variant === "warning") return badge(c, { background: c.yellowBg, color: c.yellowFg, border: c.yellowBorder }, label);
  if (variant === "success") return badge(c, { background: c.greenBg, color: c.greenFg, border: c.greenBorder }, label);
  return badge(c, { background: c.cardBg3 || c.cardBg2, color: c.text, border: c.border }, label);
}

function shellCard(c, style = {}) {
  return {
    background: c.cardBg,
    border: `1px solid ${c.border}`,
    borderRadius: 18,
    padding: 18,
    ...style,
  };
}

function PageShell({ activeTab, setActiveTab, dark, toggleTheme, onLogout, children }) {
  const c = useColors();
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: c.pageBg }}>
      <aside
        style={{
          width: 232,
          minWidth: 232,
          background: c.sidebarBg,
          borderRight: `1px solid ${c.sidebarBorder}`,
          display: "flex",
          flexDirection: "column",
          position: "fixed",
          inset: "0 auto 0 0",
          zIndex: 40,
        }}
      >
        <div style={{ padding: "22px 18px 16px", borderBottom: `1px solid ${c.sidebarBorder}` }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
            <span style={{ fontSize: 18, fontWeight: 900, color: "#eef4ff" }}>Think</span>
            <span style={{ fontSize: 18, fontWeight: 900, color: "#60a5fa" }}>WAVE</span>
            <span
              style={{
                marginLeft: 4,
                borderRadius: 6,
                padding: "2px 8px",
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: "0.08em",
                background: "#450a0a",
                color: "#fca5a5",
              }}
            >
              SUPER
            </span>
          </div>
          <div style={{ marginTop: 12, color: "#c7d2fe", fontSize: 12, lineHeight: 1.5 }}>
            <div style={{ opacity: 0.78 }}>Platform control center</div>
            <div style={{ fontWeight: 700, color: "#eff6ff" }}>Superadmin access</div>
          </div>
        </div>

        <nav style={{ padding: 12, display: "grid", gap: 6, flex: 1 }}>
          {NAV.map(item => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: 14,
                  border: active ? "1px solid rgba(252,165,165,0.22)" : "1px solid transparent",
                  background: active ? "linear-gradient(135deg, rgba(37,99,235,0.95), rgba(59,130,246,0.92))" : "transparent",
                  color: active ? "#fff" : "#c7d2fe",
                  fontWeight: 700,
                  fontSize: 14,
                  textAlign: "left",
                }}
              >
                <span style={{ width: 20, textAlign: "center" }}>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div style={{ padding: 12, display: "grid", gap: 8 }}>
          <button
            onClick={toggleTheme}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              width: "100%",
              padding: "11px 14px",
              borderRadius: 14,
              border: `1px solid ${c.sidebarBorder}`,
              background: "rgba(255,255,255,0.03)",
              color: "#dbeafe",
              fontWeight: 700,
            }}
          >
            <span>{dark ? "☀️" : "🌙"}</span>
            <span>{dark ? "Light Mode" : "Dark Mode"}</span>
          </button>
          <button
            onClick={onLogout}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              width: "100%",
              padding: "11px 14px",
              borderRadius: 14,
              border: `1px solid ${c.sidebarBorder}`,
              background: "rgba(255,255,255,0.03)",
              color: "#dbeafe",
              fontWeight: 700,
            }}
          >
            <span>⏻</span>
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <main
        style={{
          marginLeft: 232,
          width: "calc(100% - 232px)",
          minHeight: "100vh",
          padding: "24px 28px 28px",
        }}
      >
        <div key={activeTab} className="dashboard-tab-panel">
          {children}
        </div>
      </main>
    </div>
  );
}

function HeaderBlock({ title, subtitle, right }) {
  const c = useColors();
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 18, marginBottom: 22 }}>
      <div>
        <h2 style={{ margin: 0, color: c.text, fontSize: 28, lineHeight: 1.1 }}>{title}</h2>
        <p style={{ margin: "8px 0 0", color: c.textMuted, fontSize: 14 }}>{subtitle}</p>
      </div>
      {right}
    </div>
  );
}

function SummaryCard({ title, value, tone = "blue", helper }) {
  const c = useColors();
  const tones = {
    blue: { bg: "linear-gradient(135deg, rgba(43,108,255,0.18), rgba(14,165,233,0.12))", color: "#60a5fa" },
    green: { bg: "linear-gradient(135deg, rgba(16,185,129,0.16), rgba(74,222,128,0.10))", color: "#34d399" },
    yellow: { bg: "linear-gradient(135deg, rgba(251,191,36,0.18), rgba(250,204,21,0.12))", color: "#f59e0b" },
    red: { bg: "linear-gradient(135deg, rgba(248,113,113,0.18), rgba(244,63,94,0.12))", color: "#f87171" },
    violet: { bg: "linear-gradient(135deg, rgba(139,92,246,0.18), rgba(99,102,241,0.12))", color: "#a78bfa" },
  };
  const palette = tones[tone] || tones.blue;
  return (
    <div style={{ ...shellCard(c, { padding: 0, overflow: "hidden" }) }}>
      <div style={{ padding: 18, background: palette.bg }}>
        <div style={{ fontSize: 30, fontWeight: 900, color: palette.color }}>{value}</div>
        <div style={{ marginTop: 8, color: c.text, fontWeight: 700 }}>{title}</div>
        {helper && <div style={{ marginTop: 6, color: c.textMuted, fontSize: 12 }}>{helper}</div>}
      </div>
    </div>
  );
}

function InsightRow({ label, value }) {
  const c = useColors();
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 0", borderBottom: `1px solid ${c.border}` }}>
      <span style={{ color: c.textMuted, fontSize: 13 }}>{label}</span>
      <span style={{ color: c.text, fontSize: 13, fontWeight: 700, textAlign: "right" }}>{value || "—"}</span>
    </div>
  );
}

function SearchControls({ search, setSearch, status, setStatus, sort, setSort }) {
  const c = useColors();
  return (
    <div style={{ ...shellCard(c), display: "grid", gap: 12, gridTemplateColumns: "minmax(220px, 1.4fr) repeat(2, minmax(140px, 0.8fr))" }}>
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search institutions or admin"
        style={{
          width: "100%",
          padding: "12px 14px",
          borderRadius: 12,
          border: `1px solid ${c.inputBorder}`,
          background: c.inputBg,
          color: c.text,
          fontSize: 14,
        }}
      />
      <select
        value={status}
        onChange={e => setStatus(e.target.value)}
        style={{
          width: "100%",
          padding: "12px 14px",
          borderRadius: 12,
          border: `1px solid ${c.inputBorder}`,
          background: c.inputBg,
          color: c.text,
          fontSize: 14,
        }}
      >
        <option value="all">All statuses</option>
        <option value="active">Active only</option>
        <option value="inactive">Inactive only</option>
      </select>
      <select
        value={sort}
        onChange={e => setSort(e.target.value)}
        style={{
          width: "100%",
          padding: "12px 14px",
          borderRadius: 12,
          border: `1px solid ${c.inputBorder}`,
          background: c.inputBg,
          color: c.text,
          fontSize: 14,
        }}
      >
        <option value="name">Sort: Name</option>
        <option value="teachers">Sort: Teacher count</option>
        <option value="recent">Sort: Recent activity</option>
      </select>
    </div>
  );
}

function NotificationItem({ item }) {
  const c = useColors();
  const variant = item.type === "INSTITUTION_SETUP" ? "success" : "info";
  return (
    <div style={{ ...quietCard(c), display: "flex", gap: 12, alignItems: "flex-start" }}>
      <div style={{ fontSize: 22 }}>{item.type === "INSTITUTION_SETUP" ? "🏫" : "🔔"}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ color: c.text, fontWeight: 700 }}>{item.name}</div>
          {semanticBadge(c, variant, item.type === "INSTITUTION_SETUP" ? "Institution setup" : "Registration")}
        </div>
        <div style={{ color: c.textMuted, fontSize: 13, marginTop: 4 }}>
          {item.type === "INSTITUTION_SETUP"
            ? `${item.role || "Admin"} completed institution setup for ${item.institution_name || "their institution"}.`
            : `${item.role || "User"} registered with ${item.email || "no email details"}.`}
        </div>
        <div style={{ color: c.textSub, fontSize: 12, marginTop: 8 }}>{fmtDateTime(item.created_at)}</div>
      </div>
    </div>
  );
}

export default function SuperadminDashboard() {
  const navigate = useNavigate();
  const { dark, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState("overview");
  const [showLogout, setShowLogout] = useState(false);

  function doLogout() {
    clearToken();
    clearRole();
    setAuthToken("");
    navigate("/");
  }

  return (
    <>
      <PageShell activeTab={activeTab} setActiveTab={setActiveTab} dark={dark} toggleTheme={toggleTheme} onLogout={() => setShowLogout(true)}>
        {activeTab === "overview" && <OverviewTab />}
        {activeTab === "institutions" && <InstitutionsTab />}
        {activeTab === "notifications" && <NotificationsTab />}
        {activeTab === "health" && <HealthTab />}
      </PageShell>

      {showLogout && (
        <ThemedModal
          icon="⏻"
          title="Log out?"
          message="Are you sure you want to log out of the superadmin dashboard?"
          onClose={() => setShowLogout(false)}
        >
          <button className="btn secondary" onClick={() => setShowLogout(false)}>Cancel</button>
          <button className="btn" style={{ background: dark ? "#7f1d1d" : "#dc2626", color: dark ? "#fca5a5" : "#ffffff" }} onClick={doLogout}>
            Yes, Log Out
          </button>
        </ThemedModal>
      )}
    </>
  );
}

function OverviewTab() {
  const c = useColors();
  const [stats, setStats] = useState(null);
  const [institutions, setInstitutions] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [health, setHealth] = useState(null);

  useEffect(() => {
    Promise.all([
      api.get("/superadmin/stats"),
      api.get("/superadmin/accounts"),
      api.get("/superadmin/notifications"),
      api.get("/superadmin/health"),
    ])
      .then(([statsRes, institutionsRes, notificationsRes, healthRes]) => {
        setStats(statsRes.data);
        setInstitutions(institutionsRes.data || []);
        setNotifications((notificationsRes.data || []).slice(0, 6));
        setHealth(healthRes.data || null);
      })
      .catch(() => {});
  }, []);

  const insights = useMemo(() => {
    const rankedByTeachers = [...institutions].sort((a, b) => Number(b.teacherCount || 0) - Number(a.teacherCount || 0));
    const rankedBySessions = [...institutions].sort((a, b) => Number(b.recentSessions || 0) - Number(a.recentSessions || 0));
    const rankedByActivity = [...institutions].sort((a, b) => new Date(b.lastActivity || 0).getTime() - new Date(a.lastActivity || 0).getTime());

    return {
      busiestByTeachers: rankedByTeachers[0],
      busiestBySessions: rankedBySessions[0],
      mostRecent: rankedByActivity[0],
      averageTeachers: institutions.length
        ? (institutions.reduce((sum, row) => sum + Number(row.teacherCount || 0), 0) / institutions.length).toFixed(1)
        : "0.0",
    };
  }, [institutions]);

  const alerts = [
    health?.summary?.disconnectCount
      ? { level: "flagged", title: `${health.summary.disconnectCount} disconnect-led session${health.summary.disconnectCount === 1 ? "" : "s"}`, detail: "Review sessions that auto-ended because a host did not reconnect." }
      : null,
    health?.summary?.tabSwitchCount
      ? { level: "warning", title: `${health.summary.tabSwitchCount} tab-monitoring flag${health.summary.tabSwitchCount === 1 ? "" : "s"}`, detail: "Students leaving the active tab repeatedly may need review." }
      : null,
    health?.summary?.inactiveAccountCount
      ? { level: "info", title: `${health.summary.inactiveAccountCount} inactive account${health.summary.inactiveAccountCount === 1 ? "" : "s"}`, detail: "These users are currently deactivated platform-wide." }
      : null,
  ].filter(Boolean);

  return (
    <div className="container">
      <HeaderBlock
        title="Superadmin Overview"
        subtitle="Monitor platform-wide activity, institution usage, and system-level concerns."
      />

      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginBottom: 22 }}>
        <SummaryCard title="Total Institutions" value={stats?.totalInstitutions ?? "…"} tone="blue" helper="Institutions with an assigned admin" />
        <SummaryCard title="Total Admins" value={stats?.totalAdmins ?? "…"} tone="violet" helper="Admin accounts across the platform" />
        <SummaryCard title="Total Teachers" value={stats?.totalTeachers ?? "…"} tone="green" helper="Teacher accounts across all institutions" />
        <SummaryCard title="Sessions This Week" value={stats?.sessionsThisWeek ?? "…"} tone="yellow" helper="Sessions created or finished in the last 7 days" />
        <SummaryCard title="Flagged Incidents" value={stats?.flaggedIncidents ?? "…"} tone="red" helper="Disconnects and strong tab-switching patterns" />
      </div>

      <div style={{ display: "grid", gap: 18, gridTemplateColumns: "minmax(320px, 1.15fr) minmax(280px, 0.85fr)", alignItems: "start" }}>
        <div style={{ display: "grid", gap: 18 }}>
          <div style={shellCard(c)}>
            <div style={{ color: c.text, fontWeight: 800, fontSize: 18, marginBottom: 14 }}>Global Alerts</div>
            <div style={{ display: "grid", gap: 10 }}>
              {alerts.length ? alerts.map((item, idx) => (
                <div key={`${item.title}-${idx}`} style={{ ...quietCard(c), display: "grid", gap: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                    <div style={{ color: c.text, fontWeight: 700 }}>{item.title}</div>
                    {semanticBadge(c, item.level, item.level === "flagged" ? "Flagged" : item.level[0].toUpperCase() + item.level.slice(1))}
                  </div>
                  <div style={{ color: c.textMuted, fontSize: 13 }}>{item.detail}</div>
                </div>
              )) : <div style={{ ...quietCard(c), color: c.textMuted }}>No urgent platform alerts right now.</div>}
            </div>
          </div>

          <div style={shellCard(c)}>
            <div style={{ color: c.text, fontWeight: 800, fontSize: 18, marginBottom: 14 }}>Recent Platform Activity</div>
            <div style={{ display: "grid", gap: 10 }}>
              {notifications.length ? notifications.map(item => (
                <NotificationItem key={item.id} item={item} />
              )) : <div style={{ ...quietCard(c), color: c.textMuted }}>Recent platform activity will appear here.</div>}
            </div>
          </div>
        </div>

        <div style={shellCard(c)}>
          <div style={{ color: c.text, fontWeight: 800, fontSize: 18, marginBottom: 14 }}>Platform Insights</div>
          <InsightRow label="Most active institution this week" value={insights.busiestBySessions?.name || "—"} />
          <InsightRow label="Largest teacher population" value={insights.busiestByTeachers ? `${insights.busiestByTeachers.name} (${insights.busiestByTeachers.teacherCount})` : "—"} />
          <InsightRow label="Most recent platform activity" value={insights.mostRecent?.name || "—"} />
          <InsightRow label="Average teachers per institution" value={insights.averageTeachers} />
          <InsightRow label="Last notification" value={notifications[0] ? fmtDateTime(notifications[0].created_at) : "—"} />
        </div>
      </div>
    </div>
  );
}

function InstitutionsTab() {
  const c = useColors();
  const [institutions, setInstitutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedName, setSelectedName] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("name");
  const [confirm, setConfirm] = useState(null);

  const load = async () => {
    try {
      const { data } = await api.get("/superadmin/accounts");
      setInstitutions(data || []);
      if (!selectedName && data?.length) setSelectedName(data[0].name);
    } catch (_) {
      setInstitutions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  async function setAdminActive(id, active) {
    await api.post(`/superadmin/accounts/${id}/active`, { active });
    await load();
    setConfirm(null);
  }

  async function removeAdmin(id) {
    await api.delete(`/superadmin/accounts/${id}`);
    await load();
    setConfirm(null);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = [...institutions];
    if (q) {
      rows = rows.filter(row =>
        row.name.toLowerCase().includes(q) ||
        `${row.admin?.first_name || ""} ${row.admin?.last_name || ""}`.toLowerCase().includes(q) ||
        String(row.admin?.email || "").toLowerCase().includes(q)
      );
    }
    if (status !== "all") {
      rows = rows.filter(row => (status === "active" ? row.admin?.is_active : !row.admin?.is_active));
    }
    if (sort === "teachers") {
      rows.sort((a, b) => Number(b.teacherCount || 0) - Number(a.teacherCount || 0));
    } else if (sort === "recent") {
      rows.sort((a, b) => new Date(b.lastActivity || 0).getTime() - new Date(a.lastActivity || 0).getTime());
    } else {
      rows.sort((a, b) => a.name.localeCompare(b.name));
    }
    return rows;
  }, [institutions, search, status, sort]);

  const selected = filtered.find(row => row.name === selectedName) || filtered[0] || null;

  return (
    <div className="container">
      <HeaderBlock
        title="Institutions"
        subtitle="Review institution profiles, their assigned admin, and joined teachers."
      />

      <SearchControls search={search} setSearch={setSearch} status={status} setStatus={setStatus} sort={sort} setSort={setSort} />

      <div style={{ display: "grid", gap: 18, gridTemplateColumns: "minmax(0, 1.15fr) minmax(320px, 0.85fr)", marginTop: 18, alignItems: "start" }}>
        <div style={shellCard(c)}>
          <div style={{ display: "grid", gap: 10 }}>
            {loading && <div style={{ ...quietCard(c), color: c.textMuted }}>Loading institutions…</div>}
            {!loading && !filtered.length && <div style={{ ...quietCard(c), color: c.textMuted }}>No institutions match the current filters.</div>}
            {filtered.map(row => {
              const active = selected?.name === row.name;
              const adminName = row.admin ? `${row.admin.last_name}, ${row.admin.first_name}` : "No admin assigned";
              return (
                <div
                  key={row.name}
                  style={{
                    ...quietCard(c, {
                      border: `1px solid ${active ? c.accent : c.border}`,
                      boxShadow: active ? "0 0 0 1px rgba(43,108,255,0.15)" : "none",
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1fr) auto auto",
                      gap: 12,
                      alignItems: "center",
                    }),
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: c.text, fontWeight: 800 }}>{row.name}</div>
                    <div style={{ color: c.textMuted, fontSize: 13, marginTop: 4 }}>{adminName}</div>
                    <div style={{ color: c.textSub, fontSize: 12, marginTop: 6 }}>
                      {row.teacherCount} teacher{Number(row.teacherCount || 0) === 1 ? "" : "s"} · {row.recentSessions || 0} recent session{Number(row.recentSessions || 0) === 1 ? "" : "s"}
                    </div>
                  </div>
                  {row.admin?.is_active ? semanticBadge(c, "success", "Active") : semanticBadge(c, "info", "Inactive")}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn secondary" style={{ padding: "10px 14px", borderRadius: 12 }} onClick={() => setSelectedName(row.name)}>View</button>
                    {row.admin && (
                      <button
                        className="btn"
                        style={{
                          padding: "10px 14px",
                          borderRadius: 12,
                          background: row.admin.is_active ? c.yellowBg : c.greenBg,
                          color: row.admin.is_active ? c.yellowFg : c.greenFg,
                          border: `1px solid ${row.admin.is_active ? c.yellowBorder : c.greenBorder}`,
                        }}
                        onClick={() => setConfirm({ type: row.admin.is_active ? "deactivate" : "activate", row })}
                      >
                        {row.admin.is_active ? "Deactivate" : "Activate"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={shellCard(c)}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 14 }}>
            <div style={{ color: c.text, fontWeight: 800, fontSize: 18 }}>Institution Details</div>
            {selected?.admin?.is_active ? semanticBadge(c, "success", "Active") : semanticBadge(c, "info", "Inactive")}
          </div>
          {selected ? (
            <>
              <div style={{ ...quietCard(c, { marginBottom: 14 }) }}>
                <div style={{ color: c.text, fontWeight: 800, fontSize: 18 }}>{selected.name}</div>
                <div style={{ color: c.textMuted, marginTop: 4 }}>
                  {selected.admin ? `${selected.admin.first_name} ${selected.admin.last_name} · ${selected.admin.email}` : "No admin account found"}
                </div>
              </div>

              <div style={{ display: "grid", gap: 0, marginBottom: 16 }}>
                <InsightRow label="Teacher count" value={selected.teacherCount} />
                <InsightRow label="Recent sessions" value={selected.recentSessions} />
                <InsightRow label="Last activity" value={fmtDateTime(selected.lastActivity)} />
                <InsightRow label="Admin joined" value={fmtDate(selected.admin?.created_at)} />
              </div>

              <div style={{ color: c.text, fontWeight: 800, marginBottom: 10 }}>Joined Teachers</div>
              <div style={{ display: "grid", gap: 8, marginBottom: 16, maxHeight: 240, overflow: "auto" }}>
                {selected.teachers?.length ? selected.teachers.map(t => (
                  <div key={t.id} style={{ ...quietCard(c), display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 10, alignItems: "center" }}>
                    <div>
                      <div style={{ color: c.text, fontWeight: 700 }}>{t.last_name}, {t.first_name}</div>
                      <div style={{ color: c.textMuted, fontSize: 12, marginTop: 4 }}>{t.email}</div>
                    </div>
                    {t.is_active ? semanticBadge(c, "success", "Active") : semanticBadge(c, "info", "Inactive")}
                  </div>
                )) : <div style={{ ...quietCard(c), color: c.textMuted }}>No teachers linked to this institution.</div>}
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {selected.admin && (
                  <>
                    <button
                      className="btn"
                      style={{
                        background: selected.admin.is_active ? c.yellowBg : c.greenBg,
                        color: selected.admin.is_active ? c.yellowFg : c.greenFg,
                        border: `1px solid ${selected.admin.is_active ? c.yellowBorder : c.greenBorder}`,
                      }}
                      onClick={() => setConfirm({ type: selected.admin.is_active ? "deactivate" : "activate", row: selected })}
                    >
                      {selected.admin.is_active ? "Deactivate Admin" : "Activate Admin"}
                    </button>
                    <button
                      className="btn secondary"
                      style={{ borderColor: c.redBorder, color: c.redFg }}
                      onClick={() => setConfirm({ type: "remove", row: selected })}
                    >
                      Remove Admin
                    </button>
                  </>
                )}
              </div>
            </>
          ) : (
            <div style={{ ...quietCard(c), color: c.textMuted }}>Select an institution to view details.</div>
          )}
        </div>
      </div>

      {confirm && (
        <ThemedModal
          icon={confirm.type === "remove" ? "🗑️" : confirm.type === "deactivate" ? "⚠️" : "✓"}
          title={
            confirm.type === "remove"
              ? "Remove Admin?"
              : confirm.type === "deactivate"
                ? "Deactivate Admin?"
                : "Activate Admin?"
          }
          message={
            confirm.type === "remove"
              ? `Remove the admin account assigned to ${confirm.row.name}?`
              : `${confirm.type === "deactivate" ? "Deactivate" : "Activate"} the admin for ${confirm.row.name}?`
          }
          onClose={() => setConfirm(null)}
        >
          <button className="btn secondary" onClick={() => setConfirm(null)}>Cancel</button>
          <button
            className="btn"
            style={{ background: confirm.type === "remove" ? "#7f1d1d" : confirm.type === "deactivate" ? "#854d0e" : "#166534" }}
            onClick={() => {
              if (!confirm.row.admin) return setConfirm(null);
              if (confirm.type === "remove") return removeAdmin(confirm.row.admin.id);
              return setAdminActive(confirm.row.admin.id, confirm.type !== "deactivate");
            }}
          >
            Confirm
          </button>
        </ThemedModal>
      )}
    </div>
  );
}

function NotificationsTab() {
  const c = useColors();
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    api.get("/superadmin/notifications")
      .then(({ data }) => setNotifications(data || []))
      .catch(() => setNotifications([]));
  }, []);

  return (
    <div className="container">
      <HeaderBlock
        title="Notifications"
        subtitle="Recent platform-wide notices and account-related events."
      />
      <div style={{ ...shellCard(c), display: "grid", gap: 10 }}>
        {notifications.length ? notifications.map(item => <NotificationItem key={item.id} item={item} />) : (
          <div style={{ ...quietCard(c), color: c.textMuted }}>No notifications yet.</div>
        )}
      </div>
    </div>
  );
}

function HealthTab() {
  const c = useColors();
  const [health, setHealth] = useState(null);

  useEffect(() => {
    api.get("/superadmin/health")
      .then(({ data }) => setHealth(data))
      .catch(() => setHealth(null));
  }, []);

  return (
    <div className="container">
      <HeaderBlock
        title="System Health"
        subtitle="Review platform-wide disconnect trends, tab-monitoring spikes, and inactive accounts."
      />

      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", marginBottom: 22 }}>
        <SummaryCard title="Disconnect-led sessions" value={health?.summary?.disconnectCount ?? "…"} tone="red" helper="Sessions auto-ended after teacher disconnects" />
        <SummaryCard title="Tab monitoring flags" value={health?.summary?.tabSwitchCount ?? "…"} tone="yellow" helper="Participant sessions with repeated tab leaves" />
        <SummaryCard title="Inactive accounts" value={health?.summary?.inactiveAccountCount ?? "…"} tone="blue" helper="Currently deactivated platform accounts" />
      </div>

      <div style={{ display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", alignItems: "start" }}>
        <div style={shellCard(c)}>
          <div style={{ color: c.text, fontWeight: 800, fontSize: 18, marginBottom: 14 }}>Disconnect Incidents</div>
          <div style={{ display: "grid", gap: 10 }}>
            {(health?.disconnects || []).length ? health.disconnects.map(item => (
              <div key={`${item.id}-${item.event_at}`} style={{ ...quietCard(c), display: "grid", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ color: c.text, fontWeight: 700 }}>{item.quiz_title}</div>
                  {semanticBadge(c, "flagged", "Disconnected")}
                </div>
                <div style={{ color: c.textMuted, fontSize: 13 }}>{item.institution_name || "No institution"} · {item.teacher_name}</div>
                <div style={{ color: c.textSub, fontSize: 12 }}>{fmtDateTime(item.event_at)}</div>
              </div>
            )) : <div style={{ ...quietCard(c), color: c.textMuted }}>No recent disconnect-led sessions.</div>}
          </div>
        </div>

        <div style={shellCard(c)}>
          <div style={{ color: c.text, fontWeight: 800, fontSize: 18, marginBottom: 14 }}>Tab Monitoring Flags</div>
          <div style={{ display: "grid", gap: 10 }}>
            {(health?.tabSwitch || []).length ? health.tabSwitch.map(item => (
              <div key={`${item.session_id}-${item.participant_name}`} style={{ ...quietCard(c), display: "grid", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ color: c.text, fontWeight: 700 }}>{item.quiz_title}</div>
                  {semanticBadge(c, "warning", `${item.switch_count} switches`)}
                </div>
                <div style={{ color: c.textMuted, fontSize: 13 }}>{item.institution_name || "No institution"} · {item.participant_name}</div>
                <div style={{ color: c.textSub, fontSize: 12 }}>{fmtDateTime(item.event_at)}</div>
              </div>
            )) : <div style={{ ...quietCard(c), color: c.textMuted }}>No strong tab-switching spikes were detected.</div>}
          </div>
        </div>

        <div style={shellCard(c)}>
          <div style={{ color: c.text, fontWeight: 800, fontSize: 18, marginBottom: 14 }}>Inactive Accounts</div>
          <div style={{ display: "grid", gap: 10 }}>
            {(health?.inactiveAccounts || []).length ? health.inactiveAccounts.map(item => (
              <div key={item.id} style={{ ...quietCard(c), display: "grid", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ color: c.text, fontWeight: 700 }}>{item.name}</div>
                  {semanticBadge(c, "info", item.role)}
                </div>
                <div style={{ color: c.textMuted, fontSize: 13 }}>{item.email}</div>
                <div style={{ color: c.textSub, fontSize: 12 }}>{item.institution_name || "No institution"} · {fmtDateTime(item.event_at)}</div>
              </div>
            )) : <div style={{ ...quietCard(c), color: c.textMuted }}>No inactive accounts to review right now.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
