/* FILE GUIDE:
 * client/src/pages/admin/AdminDashboard.jsx
 * Purpose: Admin dashboard for institution overview, teacher management, institution details, and invitation codes.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, setAuthToken } from "../../lib/api";
import { clearRole, clearToken } from "../../lib/auth";
import { ThemedModal, useColors, useTheme } from "../../context/ThemeContext";

const NAV = [
  { id: "overview", label: "Overview", icon: "◉" },
  { id: "teachers", label: "Teachers", icon: "👥" },
  { id: "institution", label: "Institution", icon: "🏫" },
  { id: "invitation", label: "Invitation", icon: "✉" },
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

function levelBadge(c, level, label) {
  if (level === "critical") return badgeStyle(c, { background: c.redBg, color: c.redFg, border: c.redBorder }, label);
  if (level === "warning") return badgeStyle(c, { background: c.yellowBg, color: c.yellowFg, border: c.yellowBorder }, label);
  if (level === "success") return badgeStyle(c, { background: c.greenBg, color: c.greenFg, border: c.greenBorder }, label);
  return badgeStyle(c, { background: c.cardBg3 || c.cardBg2, color: c.text, border: c.border }, label);
}

function badgeStyle(c, palette, label) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 11px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        border: `1px solid ${palette.border}`,
        background: palette.background,
        color: palette.color,
      }}
    >
      {label}
    </span>
  );
}

function PageShell({ activeTab, setActiveTab, titleTag, instName, dark, toggleTheme, onLogout, children }) {
  const c = useColors();

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: c.pageBg }}>
      <aside
        style={{
          width: 228,
          minWidth: 228,
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
                background: titleTag === "ADMIN" ? "#164e63" : "#1f2937",
                color: titleTag === "ADMIN" ? "#a5f3fc" : "#fef3c7",
              }}
            >
              {titleTag}
            </span>
          </div>
          {instName && (
            <div style={{ marginTop: 12, color: "#c7d2fe", fontSize: 12, lineHeight: 1.5 }}>
              <div style={{ opacity: 0.78 }}>Current institution</div>
              <div style={{ fontWeight: 700, color: "#eff6ff" }}>{instName}</div>
            </div>
          )}
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
                  border: active ? "1px solid rgba(191,219,254,0.24)" : "1px solid transparent",
                  background: active ? "linear-gradient(135deg, rgba(43,108,255,0.95), rgba(30,64,175,0.92))" : "transparent",
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
          marginLeft: 228,
          width: "calc(100% - 228px)",
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
    <div style={{ ...sectionCard(c, { padding: 0, overflow: "hidden" }) }}>
      <div style={{ padding: 18, background: palette.bg }}>
        <div style={{ fontSize: 30, fontWeight: 900, color: palette.color }}>{value}</div>
        <div style={{ marginTop: 8, color: c.text, fontWeight: 700 }}>{title}</div>
        {helper && <div style={{ marginTop: 6, color: c.textMuted, fontSize: 12 }}>{helper}</div>}
      </div>
    </div>
  );
}

function InfoRow({ label, value }) {
  const c = useColors();
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 14, padding: "10px 0", borderBottom: `1px solid ${c.border}` }}>
      <span style={{ color: c.textMuted, fontSize: 13 }}>{label}</span>
      <span style={{ color: c.text, fontSize: 13, fontWeight: 700, textAlign: "right" }}>{value || "—"}</span>
    </div>
  );
}

function SearchControls({ search, setSearch, status, setStatus, sort, setSort, statusOptions = ["all", "active", "inactive"] }) {
  const c = useColors();
  return (
    <div style={{ ...sectionCard(c), display: "grid", gap: 12, gridTemplateColumns: "minmax(220px, 1.4fr) repeat(2, minmax(140px, 0.8fr))" }}>
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search by name or email"
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
        {statusOptions.map(option => (
          <option key={option} value={option}>{option[0].toUpperCase() + option.slice(1)}</option>
        ))}
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
        <option value="recent">Sort: Recent</option>
        <option value="sessions">Sort: Sessions</option>
      </select>
    </div>
  );
}

function ActivityItem({ item }) {
  const c = useColors();
  const iconMap = {
    SESSION_ENDED: "📊",
    TEACHER_ADDED: "👤",
  };
  return (
    <div style={{ ...quietCard(c), display: "flex", gap: 12, alignItems: "flex-start" }}>
      <div style={{ fontSize: 22 }}>{iconMap[item.kind] || "•"}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: c.text, fontWeight: 700 }}>{item.title}</div>
        {item.subtitle && <div style={{ color: c.textMuted, fontSize: 13, marginTop: 2 }}>{item.subtitle}</div>}
        {item.detail && <div style={{ color: c.textSub, fontSize: 12, marginTop: 6 }}>{item.detail}</div>}
        <div style={{ color: c.textMuted, fontSize: 12, marginTop: 8 }}>{fmtDateTime(item.event_at)}</div>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { dark, toggleTheme } = useTheme();
  const c = useColors();

  const [activeTab, setActiveTab] = useState("overview");
  const [setupDone, setSetupDone] = useState(true);
  const [instName, setInstName] = useState("");
  const [instCtrl, setInstCtrl] = useState("");
  const [setupMsg, setSetupMsg] = useState("");
  const [showLogout, setShowLogout] = useState(false);

  useEffect(() => {
    api
      .get("/admin-dashboard/setup-status")
      .then(({ data }) => {
        setSetupDone(data.setupDone ?? true);
        setInstName(data.institutionName ?? "");
      })
      .catch(() => {});
  }, []);

  async function doSetup() {
    if (!instCtrl.trim()) return;
    try {
      await api.post("/admin-dashboard/setup-institution", { institutionName: instCtrl.trim() });
      setSetupDone(true);
      setInstName(instCtrl.trim());
      setSetupMsg("");
    } catch (e) {
      setSetupMsg(e?.response?.data?.message || "Failed to save institution name.");
    }
  }

  function doLogout() {
    clearToken();
    clearRole();
    setAuthToken("");
    navigate("/");
  }

  if (!setupDone) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: c.pageBg, padding: 24 }}>
        <div style={{ ...sectionCard(c, { width: "min(100%, 470px)", padding: 34, textAlign: "center" }) }}>
          <div style={{ fontSize: 38, marginBottom: 12 }}>🏫</div>
          <h2 style={{ margin: 0, color: c.text }}>Complete your institution setup</h2>
          <p style={{ margin: "10px 0 22px", color: c.textMuted, lineHeight: 1.6 }}>
            Enter your school or institution name so the admin dashboard can organize teachers and activity under one institution profile.
          </p>
          <input
            value={instCtrl}
            onChange={e => setInstCtrl(e.target.value)}
            placeholder="e.g. Prenza National High School"
            style={{
              width: "100%",
              padding: "14px 16px",
              borderRadius: 14,
              border: `1px solid ${c.inputBorder}`,
              background: c.inputBg,
              color: c.text,
              fontSize: 15,
            }}
          />
          {setupMsg && <div style={{ marginTop: 10, color: c.redFg, fontSize: 13 }}>{setupMsg}</div>}
          <button
            onClick={doSetup}
            style={{
              marginTop: 18,
              width: "100%",
              padding: "14px 16px",
              borderRadius: 14,
              border: "none",
              background: "linear-gradient(135deg, #2b6cff, #1d4ed8)",
              color: "#fff",
              fontWeight: 800,
              fontSize: 15,
            }}
          >
            Save and Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <PageShell
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        titleTag="ADMIN"
        instName={instName}
        dark={dark}
        toggleTheme={toggleTheme}
        onLogout={() => setShowLogout(true)}
      >
        {activeTab === "overview" && <AdminOverview />}
        {activeTab === "teachers" && <AdminTeachers />}
        {activeTab === "institution" && <InstitutionTab />}
        {activeTab === "invitation" && <AdminInvitation />}
      </PageShell>

      {showLogout && (
        <ThemedModal
          icon="⏻"
          title="Log out?"
          message="Are you sure you want to log out of the admin dashboard?"
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

function AdminOverview() {
  const c = useColors();
  const [stats, setStats] = useState(null);
  const [activity, setActivity] = useState([]);
  const [institution, setInstitution] = useState(null);

  useEffect(() => {
    Promise.all([
      api.get("/admin-dashboard/stats"),
      api.get("/admin-dashboard/activity"),
      api.get("/admin-dashboard/institution"),
    ])
      .then(([statsRes, actRes, instRes]) => {
        setStats(statsRes.data);
        setActivity(actRes.data || []);
        setInstitution(instRes.data?.institution || null);
      })
      .catch(() => {});
  }, []);

  const summaries = [
    { title: "Active Teachers", value: stats?.activeTeachers ?? "…", tone: "green", helper: "Teacher accounts currently active" },
    { title: "Recent Sessions", value: stats?.recentSessionCount ?? "…", tone: "blue", helper: "Finished in the last 7 days" },
    { title: "Flagged Issues", value: stats?.flaggedIssues ?? "…", tone: "red", helper: "Disconnects or unusual tab switching" },
    { title: "Institution Members", value: stats?.institutionMembers ?? "…", tone: "violet", helper: "Admin + teacher accounts in this institution" },
    { title: "Recent Activity", value: stats?.recentActivityCount ?? activity.length ?? "…", tone: "yellow", helper: "Latest notable institution events" },
  ];

  return (
    <div className="container">
      <HeaderBlock
        title="Admin Overview"
        subtitle="Monitor institution activity, teacher accounts, and notable classroom issues."
      />

      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginBottom: 22 }}>
        {summaries.map(item => <SummaryCard key={item.title} {...item} />)}
      </div>

      <div style={{ display: "grid", gap: 18, gridTemplateColumns: "minmax(320px, 1.15fr) minmax(280px, 0.85fr)", alignItems: "start" }}>
        <div style={{ display: "grid", gap: 18 }}>
          <div style={sectionCard(c)}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div>
                <div style={{ color: c.text, fontWeight: 800, fontSize: 18 }}>Attention Needed</div>
                <div style={{ color: c.textMuted, fontSize: 13, marginTop: 4 }}>Items worth checking before your next review.</div>
              </div>
              {stats?.alerts?.length ? levelBadge(c, "warning", `${stats.alerts.length} item${stats.alerts.length === 1 ? "" : "s"}`) : null}
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {(stats?.alerts || []).length ? (
                stats.alerts.map((item, idx) => (
                  <div key={`${item.title}-${idx}`} style={{ ...quietCard(c), display: "grid", gap: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ color: c.text, fontWeight: 700 }}>{item.title}</div>
                      {levelBadge(c, item.level, item.level[0].toUpperCase() + item.level.slice(1))}
                    </div>
                    <div style={{ color: c.textMuted, fontSize: 13 }}>{item.detail}</div>
                  </div>
                ))
              ) : (
                <div style={{ ...quietCard(c), color: c.textMuted }}>No important alerts right now.</div>
              )}
            </div>
          </div>

          <div style={sectionCard(c)}>
            <div style={{ color: c.text, fontWeight: 800, fontSize: 18, marginBottom: 14 }}>Recent Activity</div>
            <div style={{ display: "grid", gap: 10 }}>
              {activity.length ? activity.slice(0, 5).map(item => <ActivityItem key={`${item.kind}-${item.event_at}-${item.title}`} item={item} />) : (
                <div style={{ ...quietCard(c), color: c.textMuted }}>Recent institution activity will appear here.</div>
              )}
            </div>
          </div>
        </div>

        <div style={sectionCard(c)}>
          <div style={{ color: c.text, fontWeight: 800, fontSize: 18, marginBottom: 14 }}>Institution Snapshot</div>
          <div style={{ display: "grid", gap: 0 }}>
            <InfoRow label="Institution" value={institution?.name} />
            <InfoRow label="Admin" value={institution?.adminName} />
            <InfoRow label="Teachers" value={institution?.totalTeachers} />
            <InfoRow label="Sessions this week" value={institution?.sessionsThisWeek} />
            <InfoRow label="Latest activity" value={fmtDateTime(institution?.lastActivity)} />
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminTeachers() {
  const c = useColors();
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("name");
  const [confirm, setConfirm] = useState(null);

  useEffect(() => {
    api.get("/admin-dashboard/teachers")
      .then(({ data }) => {
        setTeachers(data || []);
        if (data?.length) setSelectedId(data[0].id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function toggleActive(id, active) {
    await api.post(`/admin-dashboard/teachers/${id}/active`, { active });
    const { data } = await api.get("/admin-dashboard/teachers");
    setTeachers(data || []);
    setSelectedId(id);
    setConfirm(null);
  }

  const filteredTeachers = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = [...teachers];
    if (q) {
      list = list.filter(t =>
        `${t.first_name} ${t.last_name}`.toLowerCase().includes(q) ||
        `${t.last_name} ${t.first_name}`.toLowerCase().includes(q) ||
        String(t.email || "").toLowerCase().includes(q)
      );
    }
    if (status !== "all") {
      list = list.filter(t => (status === "active" ? !!t.is_active : !t.is_active));
    }
    if (sort === "recent") {
      list.sort((a, b) => new Date(b.last_active_at || b.created_at).getTime() - new Date(a.last_active_at || a.created_at).getTime());
    } else if (sort === "sessions") {
      list.sort((a, b) => Number(b.hosted_sessions_count || 0) - Number(a.hosted_sessions_count || 0));
    } else {
      list.sort((a, b) => `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`));
    }
    return list;
  }, [teachers, search, status, sort]);

  const selected = filteredTeachers.find(t => t.id === selectedId) || filteredTeachers[0] || null;

  return (
    <div className="container">
      <HeaderBlock
        title="Teachers"
        subtitle="View teacher profiles, monitor their recent activity, and activate or deactivate access when needed."
      />

      <SearchControls search={search} setSearch={setSearch} status={status} setStatus={setStatus} sort={sort} setSort={setSort} />

      <div style={{ display: "grid", gap: 18, gridTemplateColumns: "minmax(0, 1.2fr) minmax(300px, 0.8fr)", marginTop: 18, alignItems: "start" }}>
        <div style={sectionCard(c)}>
          <div style={{ display: "grid", gap: 10 }}>
            {loading && <div style={{ ...quietCard(c), color: c.textMuted }}>Loading teachers…</div>}
            {!loading && !filteredTeachers.length && (
              <div style={{ ...quietCard(c), color: c.textMuted }}>No teachers match the current filters.</div>
            )}
            {filteredTeachers.map(t => {
              const active = t.id === selected?.id;
              return (
                <div
                  key={t.id}
                  style={{
                    ...quietCard(c, {
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1fr) auto auto",
                      gap: 12,
                      alignItems: "center",
                      border: `1px solid ${active ? c.accent : c.border}`,
                      boxShadow: active ? "0 0 0 1px rgba(43,108,255,0.15)" : "none",
                    }),
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: c.text, fontWeight: 800 }}>{t.last_name}, {t.first_name}</div>
                    <div style={{ color: c.textMuted, fontSize: 13, marginTop: 4 }}>{t.email}</div>
                    <div style={{ color: c.textSub, fontSize: 12, marginTop: 6 }}>
                      Hosted {Number(t.hosted_sessions_count || 0)} session{Number(t.hosted_sessions_count || 0) === 1 ? "" : "s"}
                    </div>
                  </div>
                  {t.is_active ? levelBadge(c, "success", "Active") : levelBadge(c, "info", "Inactive")}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      className="btn secondary"
                      style={{ padding: "10px 14px", borderRadius: 12 }}
                      onClick={() => setSelectedId(t.id)}
                    >
                      View
                    </button>
                    <button
                      className="btn"
                      style={{
                        padding: "10px 14px",
                        borderRadius: 12,
                        background: t.is_active ? c.yellowBg : c.greenBg,
                        color: t.is_active ? c.yellowFg : c.greenFg,
                        border: `1px solid ${t.is_active ? c.yellowBorder : c.greenBorder}`,
                      }}
                      onClick={() => setConfirm({ teacher: t, action: t.is_active ? "deactivate" : "activate" })}
                    >
                      {t.is_active ? "Deactivate" : "Activate"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={sectionCard(c)}>
          <div style={{ color: c.text, fontWeight: 800, fontSize: 18, marginBottom: 14 }}>Teacher Details</div>
          {selected ? (
            <>
              <div style={{ ...quietCard(c, { marginBottom: 14 }) }}>
                <div style={{ color: c.text, fontWeight: 800, fontSize: 18 }}>{selected.first_name} {selected.last_name}</div>
                <div style={{ color: c.textMuted, marginTop: 4 }}>{selected.email}</div>
                <div style={{ marginTop: 12 }}>
                  {selected.is_active ? levelBadge(c, "success", "Active") : levelBadge(c, "info", "Inactive")}
                </div>
              </div>
              <div style={{ display: "grid", gap: 0 }}>
                <InfoRow label="Joined" value={fmtDate(selected.created_at)} />
                <InfoRow label="Last active" value={fmtDateTime(selected.last_active_at)} />
                <InfoRow label="Hosted sessions" value={selected.hosted_sessions_count} />
                <InfoRow label="Last hosted session" value={fmtDateTime(selected.last_session_at)} />
                <InfoRow label="Contact number" value={selected.contact_number || "Not provided"} />
              </div>
            </>
          ) : (
            <div style={{ ...quietCard(c), color: c.textMuted }}>Select a teacher to view profile details.</div>
          )}
        </div>
      </div>

      {confirm && (
        <ThemedModal
          icon={confirm.action === "deactivate" ? "⚠️" : "✓"}
          title={confirm.action === "deactivate" ? "Deactivate Teacher?" : "Activate Teacher?"}
          message={`${confirm.action === "deactivate" ? "Deactivate" : "Activate"} ${confirm.teacher.first_name} ${confirm.teacher.last_name}?`}
          onClose={() => setConfirm(null)}
        >
          <button className="btn secondary" onClick={() => setConfirm(null)}>Cancel</button>
          <button
            className="btn"
            style={{ background: confirm.action === "deactivate" ? "#854d0e" : "#166534" }}
            onClick={() => toggleActive(confirm.teacher.id, confirm.action !== "deactivate")}
          >
            Confirm
          </button>
        </ThemedModal>
      )}
    </div>
  );
}

function InstitutionTab() {
  const c = useColors();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/admin-dashboard/institution")
      .then(({ data }) => setData(data))
      .catch(() => {});
  }, []);

  return (
    <div className="container">
      <HeaderBlock
        title="Institution"
        subtitle="Review your school profile, joined teachers, and the most recent institution activity."
      />

      <div style={{ display: "grid", gap: 18, gridTemplateColumns: "minmax(260px, 0.9fr) minmax(0, 1.1fr)", alignItems: "start" }}>
        <div style={sectionCard(c)}>
          <div style={{ color: c.text, fontWeight: 800, fontSize: 18, marginBottom: 14 }}>Institution Overview</div>
          <div style={{ display: "grid", gap: 0 }}>
            <InfoRow label="Institution" value={data?.institution?.name} />
            <InfoRow label="Administrator" value={data?.institution?.adminName} />
            <InfoRow label="Admin email" value={data?.institution?.adminEmail} />
            <InfoRow label="Status" value={data?.institution?.status} />
            <InfoRow label="Total teachers" value={data?.institution?.totalTeachers} />
            <InfoRow label="Sessions this week" value={data?.institution?.sessionsThisWeek} />
            <InfoRow label="Created" value={fmtDate(data?.institution?.createdAt)} />
          </div>
        </div>

        <div style={{ display: "grid", gap: 18 }}>
          <div style={sectionCard(c)}>
            <div style={{ color: c.text, fontWeight: 800, fontSize: 18, marginBottom: 14 }}>Joined Teachers</div>
            <div style={{ display: "grid", gap: 10 }}>
              {(data?.teachers || []).length ? data.teachers.map(t => (
                <div key={t.id} style={{ ...quietCard(c), display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 12, alignItems: "center" }}>
                  <div>
                    <div style={{ color: c.text, fontWeight: 700 }}>{t.last_name}, {t.first_name}</div>
                    <div style={{ color: c.textMuted, fontSize: 13, marginTop: 4 }}>{t.email}</div>
                  </div>
                  {t.is_active ? levelBadge(c, "success", "Active") : levelBadge(c, "info", "Inactive")}
                </div>
              )) : <div style={{ ...quietCard(c), color: c.textMuted }}>No teachers joined this institution yet.</div>}
            </div>
          </div>

          <div style={sectionCard(c)}>
            <div style={{ color: c.text, fontWeight: 800, fontSize: 18, marginBottom: 14 }}>Recent Institution Activity</div>
            <div style={{ display: "grid", gap: 10 }}>
              {(data?.recentActivity || []).length ? data.recentActivity.map(item => (
                <ActivityItem key={`${item.kind}-${item.event_at}-${item.title}`} item={item} />
              )) : <div style={{ ...quietCard(c), color: c.textMuted }}>Recent institution activity will appear here.</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminInvitation() {
  const c = useColors();
  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  async function load() {
    try {
      const { data } = await api.get("/admin-dashboard/invitation");
      setInvite(data);
    } catch (_) {
      setInvite(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function generate() {
    try {
      const { data } = await api.post("/admin-dashboard/invitation", {});
      setInvite(data);
      setMsg("A fresh invitation code is now active.");
    } catch (e) {
      setMsg(e?.response?.data?.message || "Failed to generate invitation code.");
    }
  }

  async function revoke() {
    if (!invite) return;
    try {
      await api.delete(`/admin-dashboard/invitation/${invite.id}`);
      setInvite(null);
      setMsg("Invitation code revoked.");
    } catch (e) {
      setMsg(e?.response?.data?.message || "Failed to revoke invitation code.");
    }
  }

  return (
    <div className="container">
      <HeaderBlock
        title="Invitation"
        subtitle="Generate one teacher invitation code at a time and share it with teachers who should join your institution."
      />

      {loading ? (
        <div style={sectionCard(c)}>Loading invitation details…</div>
      ) : (
        <div style={{ display: "grid", gap: 18, gridTemplateColumns: "minmax(320px, 0.95fr) minmax(260px, 0.75fr)", alignItems: "start" }}>
          <div style={sectionCard(c)}>
            <div style={{ color: c.text, fontWeight: 800, fontSize: 18, marginBottom: 12 }}>Teacher Invitation Code</div>
            <div style={{ color: c.textMuted, fontSize: 13, marginBottom: 16 }}>
              Teachers will enter this code in their Invitation tab to link themselves to your institution.
            </div>
            {msg && (
              <div style={{ ...quietCard(c, { marginBottom: 16, color: c.greenFg, border: `1px solid ${c.greenBorder}` }) }}>
                {msg}
              </div>
            )}

            {invite ? (
              <>
                <div
                  style={{
                    ...quietCard(c, {
                      textAlign: "center",
                      padding: "24px 18px",
                      marginBottom: 16,
                      background: "linear-gradient(135deg, rgba(43,108,255,0.18), rgba(59,130,246,0.10))",
                    }),
                  }}
                >
                  <div style={{ color: c.textMuted, fontSize: 12, marginBottom: 10 }}>Active code</div>
                  <div style={{ color: c.accent, fontSize: 42, fontWeight: 900, letterSpacing: 8 }}>{invite.invite_code}</div>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button className="btn secondary" style={{ flex: 1, minWidth: 160 }} onClick={generate}>Regenerate</button>
                  <button
                    className="btn"
                    style={{ flex: 1, minWidth: 160, background: c.redBg, color: c.redFg, border: `1px solid ${c.redBorder}` }}
                    onClick={revoke}
                  >
                    Revoke
                  </button>
                </div>
              </>
            ) : (
              <div style={{ ...quietCard(c), textAlign: "center", padding: 34 }}>
                <div style={{ color: c.textMuted, marginBottom: 14 }}>No active invitation code yet.</div>
                <button className="btn" onClick={generate}>Generate Code</button>
              </div>
            )}
          </div>

          <div style={sectionCard(c)}>
            <div style={{ color: c.text, fontWeight: 800, fontSize: 18, marginBottom: 14 }}>Quick Notes</div>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={quietCard(c)}>Only one active code is kept at a time to reduce confusion for teachers.</div>
              <div style={quietCard(c)}>If you regenerate a code, the previous one becomes invalid automatically.</div>
              <div style={quietCard(c)}>Use this tab as your main invitation management screen.</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
