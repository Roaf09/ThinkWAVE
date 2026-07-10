/* FILE GUIDE:
 * client/src/pages/teacher/tabs/SessionHistoryTab.jsx
 * Purpose: Chronological archive of completed teacher sessions.
 * Tip: This page is now filterable and grouped by recency so history feels more useful than a plain list.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../../lib/api";
import { useColors } from "../../../context/ThemeContext";
import { templateCardChrome, templateLabel, templateTone } from "../../../lib/templatePalette";

const card = (c, extra = {}) => ({
  background: c.cardBg,
  border: `1px solid ${c.border}`,
  borderRadius: 18,
  padding: 16,
  boxShadow: c.pageBg === "#eef2ff" ? "0 16px 34px rgba(43,108,255,0.08)" : "0 16px 34px rgba(0,0,0,0.14)",
  transition: "background 0.3s, border-color 0.3s, transform 0.25s",
  ...extra,
});

const badge = (c, extra = {}) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "5px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
  border: `1px solid ${c.border}`,
  background: c.cardBg2,
  color: c.text,
  ...extra,
});

const btn = (c, primary = false) => ({
  padding: "9px 13px",
  borderRadius: 12,
  border: `1px solid ${primary ? c.accent : c.border}`,
  background: primary ? c.accent : c.cardBg2,
  color: primary ? "#fff" : c.text,
  fontWeight: 800,
  fontSize: 13,
  cursor: "pointer",
});

export default function SessionHistoryTab({ setActiveTab }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [modeFilter, setModeFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState("recent");
  const [exporting, setExporting] = useState("");
  const c = useColors();
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/sessions/history");
        setSessions(data || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = [...sessions].filter((session) => {
      const sessionType = isAssignedSession(session) ? "ASSIGNED" : "LIVE";
      if (modeFilter !== "ALL" && sessionType !== modeFilter) return false;
      if (!q) return true;
      return [session.quiz_title, session.template_type, session.category].some((value) => String(value || "").toLowerCase().includes(q));
    });
    rows.sort((a, b) => {
      if (sortBy === "title") return String(a.quiz_title || "").localeCompare(String(b.quiz_title || ""));
      if (sortBy === "score") return Number(b.avg_score || 0) - Number(a.avg_score || 0);
      return new Date(b.ended_at || 0).getTime() - new Date(a.ended_at || 0).getTime();
    });
    return rows;
  }, [sessions, query, modeFilter, sortBy]);

  const grouped = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfWeek = startOfToday - 6 * 24 * 60 * 60 * 1000;
    return filtered.reduce((acc, session) => {
      const ts = new Date(session.ended_at || 0).getTime();
      const key = ts >= startOfToday ? "Today" : ts >= startOfWeek ? "This Week" : "Earlier";
      (acc[key] ||= []).push(session);
      return acc;
    }, {});
  }, [filtered]);

  async function download(session, format) {
    setExporting(`${session.id}:${format}`);
    try {
      const assigned = isAssignedSession(session);
      const urlPath = assigned ? `/classes/${session.class_id}/async-results/${session.quiz_id}/export/${format}` : `/analytics/sessions/${session.id}/export/${format}`;
      const resp = await api.get(urlPath, { responseType: "blob" });
      const mime = format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      const url = URL.createObjectURL(new Blob([resp.data], { type: mime }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${isAssignedSession(session) ? "assigned" : "session"}-${session.quiz_id || session.id}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert("Export failed. Please try again.");
    } finally {
      setExporting("");
    }
  }

  if (loading) return <div className="container"><div style={card(c)}>Loading session history…</div></div>;

  return (
    <div className="container" style={{ display: "grid", gap: 18 }}>
      <section>
        <h2 style={{ marginBottom: 4, color: c.text }}>Session History</h2>
      </section>

      <section style={{ ...card(c), display: "grid", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1.3fr) repeat(2, minmax(140px, 0.7fr))", gap: 12 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by quiz title, template, or category"
            style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 12, border: `1px solid ${c.inputBorder}`, background: c.inputBg, color: c.text }}
          />
          <select value={modeFilter} onChange={(e) => setModeFilter(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 12, border: `1px solid ${c.inputBorder}`, background: c.inputBg, color: c.text }}>
            <option value="ALL">All sessions</option>
            <option value="LIVE">Live session</option>
            <option value="ASSIGNED">Assigned session</option>
          </select>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 12, border: `1px solid ${c.inputBorder}`, background: c.inputBg, color: c.text }}>
            <option value="recent">Newest first</option>
            <option value="score">Highest average</option>
            <option value="title">Title A–Z</option>
          </select>
        </div>
      </section>

      {filtered.length === 0 ? (
        <div style={card(c)}>No session history matches your current filters yet.</div>
      ) : (
        Object.entries(grouped).map(([group, rows]) => (
          <section key={group} style={{ display: "grid", gap: 12 }}>
            <div style={{ fontWeight: 900, color: c.text, fontSize: 16 }}>{group}</div>
            {rows.map((session) => {
              const insight = buildInsight(session);
              return (
                <div key={`${session.session_type || "LIVE"}-${session.id}`} style={{ ...card(c), ...templateCardChrome(session.template_type, c, false) }}>
                  <div style={{ display: "grid", gap: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontWeight: 900, fontSize: 16, color: c.text }}>{session.quiz_title}</div>
                        <div style={{ color: c.textMuted, fontSize: 13, marginTop: 6 }}>{new Date(session.ended_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}</div>
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <span style={badge(c, { borderColor: templateTone(session.template_type, c, false).border, background: templateTone(session.template_type, c, false).softBg, color: templateTone(session.template_type, c, false).accent })}>{templateLabel(session.template_type)}</span>
                        <span style={badge(c)}>{isAssignedSession(session) ? "Assigned session" : "Live session"}</span>
                        <span style={badge(c)}>{session.participant_count} {isAssignedSession(session) ? "submitted" : session.join_mode === "GROUP" ? "groups" : "students"}</span>
                        <span style={badge(c)}>{session.avg_score ?? 0} avg</span>
                        <span style={badge(c)}>{session.top_score ?? 0} top</span>
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
                      <MiniInfo label="Template" value={templateLabel(session.template_type)} c={c} />
                      <MiniInfo label="Category" value={session.category} c={c} />
                      <MiniInfo label="Questions" value={session.question_count} c={c} />
                      <MiniInfo label={isAssignedSession(session) ? "Submitted" : session.join_mode === "GROUP" ? "Groups" : "Students"} value={session.participant_count} c={c} />
                    </div>

                    <div style={{ padding: "12px 13px", borderRadius: 14, background: c.cardBg2, border: `1px solid ${c.border}`, color: c.textMuted, fontSize: 13, lineHeight: 1.6 }}>
                      <strong style={{ color: c.text }}>Session insight:</strong> {insight}
                    </div>

                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      {!isAssignedSession(session) && <button style={btn(c, true)} onClick={() => navigate(`/teacher/analytics/${session.id}`)}>Open Analytics</button>}
                      <button style={btn(c)} onClick={() => setActiveTab?.("bank")}>Reuse</button>
                      <button style={btn(c)} disabled={exporting === `${session.id}:pdf`} onClick={() => download(session, "pdf")}>{exporting === `${session.id}:pdf` ? "Exporting…" : "PDF"}</button>
                      <button style={btn(c)} disabled={exporting === `${session.id}:xlsx`} onClick={() => download(session, "xlsx")}>{exporting === `${session.id}:xlsx` ? "Exporting…" : "XLSX"}</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </section>
        ))
      )}
    </div>
  );
}

function MiniInfo({ label, value, c }) {
  return (
    <div style={{ padding: "11px 12px", borderRadius: 14, background: c.cardBg2, border: `1px solid ${c.border}` }}>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800, color: c.textSub }}>{label}</div>
      <div style={{ marginTop: 6, fontWeight: 800, color: c.text }}>{value}</div>
    </div>
  );
}

function isAssignedSession(session) {
  return session?.session_type === "ASSIGNED" || session?.join_mode === "ASSIGNED";
}

function buildInsight(session) {
  const modeText = isAssignedSession(session) ? "assigned quiz" : session.join_mode === "GROUP" ? "group activity" : "individual session";
  if (Number(session.avg_score || 0) < 40) return `This ${modeText} may need a reteach or review activity because the average score stayed low.`;
  if (Number(session.avg_score || 0) >= 80) return `This ${modeText} performed strongly overall. It may be a good candidate for reuse or a faster follow-up lesson.`;
  return `This ${modeText} landed in the middle range, so the analytics may be useful for spotting which questions slowed students down.`;
}
