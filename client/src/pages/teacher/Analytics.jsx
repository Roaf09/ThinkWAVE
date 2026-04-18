/* FILE GUIDE:
 * client/src/pages/teacher/Analytics.jsx
 * Purpose: Teacher analytics/result page outside the live host panel.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, API_BASE } from "../../lib/api";
import { useColors, useTheme } from "../../context/ThemeContext";

export default function Analytics() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const c = useColors();
  const { dark } = useTheme();
  const C = palette(c, dark);
  const [analytics, setAnalytics] = useState(null);
  const [tabMonitoring, setTabMonitoring] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [a, t] = await Promise.all([
          api.get(`/sessions/${sessionId}/full-analytics`),
          api.get(`/sessions/${sessionId}/tab-monitoring`),
        ]);
        if (!alive) return;
        setAnalytics(a.data || null);
        setTabMonitoring(t.data || []);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [sessionId]);

  const scores = useMemo(() => {
    const students = analytics?.students || [];
    if (analytics?.session?.join_mode === "GROUP") {
      const grouped = Object.values((students || []).reduce((acc, s) => {
        const key = s.group_name || `${s.first_name || ""} ${s.last_name || ""}`.trim() || `Group ${s.participant_id}`;
        if (!acc[key]) acc[key] = { key, label: key, total_points: 0 };
        acc[key].total_points = Math.max(acc[key].total_points, Number(s.total_points || 0));
        return acc;
      }, {}));
      return grouped.sort((a, b) => (b.total_points || 0) - (a.total_points || 0) || String(a.label).localeCompare(String(b.label)));
    }
    return [...students]
      .map((s) => ({
        key: s.participant_id,
        label: `${s.first_name || ""} ${s.last_name || ""}`.trim() || `Student ${s.participant_id}`,
        total_points: Number(s.total_points || 0),
      }))
      .sort((a, b) => (b.total_points || 0) - (a.total_points || 0) || String(a.label).localeCompare(String(b.label)));
  }, [analytics]);

  return (
    <div className="container">
      <div style={{ display: "grid", gap: 18 }}>
        <div style={card(C)}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div>
              <button onClick={() => navigate(-1)} style={secondaryBtn(C)}>← Back</button>
              <h2 style={{ margin: "12px 0 4px", color: C.text, fontWeight: 900 }}>Session Analytics</h2>
              <div style={{ color: C.muted, fontSize: 13, fontWeight: 700 }}>
                {analytics?.session?.quiz_title || `Session #${sessionId}`} · {analytics?.session?.join_mode === "GROUP" ? "Group mode" : "Solo mode"}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <a style={btnStyle(C, "ghost")} href={`${API_BASE}/api/analytics/sessions/${sessionId}/export/pdf`} target="_blank" rel="noreferrer">⬇ PDF</a>
              <a style={btnStyle(C, "ghost")} href={`${API_BASE}/api/analytics/sessions/${sessionId}/export/xlsx`} target="_blank" rel="noreferrer">⬇ Excel</a>
            </div>
          </div>
        </div>

        <div style={card(C)}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 10, flexWrap: "wrap" }}>
            <h3 style={{ margin: 0, color: C.text, fontWeight: 900 }}>🏆 Scores</h3>
            <StatusPill C={C} label={analytics?.session?.join_mode === "GROUP" ? `${scores.length} groups` : `${scores.length} students`} kind="blue" />
          </div>

          {loading ? (
            <div style={{ color: C.muted, textAlign: "center", padding: 32, fontWeight: 800 }}>Loading analytics…</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "minmax(300px,0.72fr) minmax(420px,1.28fr)", gap: 18, alignItems: "start" }}>
              <div>
                {scores.length === 0 ? <p style={{ color: C.muted, textAlign: "center", fontSize: 14 }}>No scores yet.</p> : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {scores.map((s, i) => (
                      <div key={s.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderRadius: 12, background: i === 0 ? "rgba(251,191,36,0.07)" : "transparent", border: `1px solid ${i === 0 ? "rgba(251,191,36,0.2)" : C.border}` }}>
                        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                          <span style={{ width: 24 }}>{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}</span>
                          <span style={{ color: C.text, fontWeight: 700 }}>{s.label}</span>
                        </div>
                        <span style={{ color: C.accent, fontWeight: 900 }}>{s.total_points} pts</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ alignSelf: "center" }}>
                <AnalyticsPanel C={C} analytics={analytics || {}} tabMonitoring={tabMonitoring} joinMode={analytics?.session?.join_mode || "SOLO"} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AnalyticsPanel({ C, analytics, tabMonitoring, joinMode }) {
  const summary = analytics.summary || {};
  const students = analytics.students || [];
  const questions = analytics.questions || [];
  const groupedAttendance = joinMode === "GROUP" ? Object.values(students.reduce((acc, student) => {
    const key = student.group_name || `${student.first_name} ${student.last_name}`.trim();
    if (!acc[key]) acc[key] = { name: key, members: [] };
    acc[key].members.push(student);
    return acc;
  }, {})) : [];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 12 }}>
        <MetricCard C={C} label="Average" value={summary.avg_score ?? 0} />
        <MetricCard C={C} label="Min" value={summary.min_score ?? 0} />
        <MetricCard C={C} label="Max" value={summary.max_score ?? 0} />
        <MetricCard C={C} label={joinMode === "GROUP" ? "Groups" : "Attendance"} value={summary.participant_count ?? students.length} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div style={{ ...card(C), boxShadow: "none", padding: 16, background: C.cardBg2 }}>
          <div style={{ color: C.text, fontWeight: 900, marginBottom: 10 }}>{joinMode === "GROUP" ? "Groups" : "Attendance"}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {joinMode === "GROUP" ? groupedAttendance.map((group) => (
              <details key={group.name} style={{ width: "100%", background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 14, padding: "10px 12px" }}>
                <summary style={{ cursor: "pointer", color: C.text, fontWeight: 800 }}>{group.name} <span style={{ color: C.muted, fontWeight: 700 }}>({group.members.length})</span></summary>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                  {group.members.map((member) => <StudentChip key={member.participant_id} name={`${member.first_name} ${member.last_name}`.trim()} connected C={C} />)}
                </div>
              </details>
            )) : students.map((student) => <StudentChip key={student.participant_id} name={`${student.first_name} ${student.last_name}`.trim()} connected C={C} />)}
            {students.length === 0 && <span style={{ color: C.muted }}>No joined students.</span>}
          </div>
        </div>
        <div style={{ ...card(C), boxShadow: "none", padding: 16, background: C.cardBg2 }}>
          <div style={{ color: C.text, fontWeight: 900, marginBottom: 10 }}>Tab Monitoring</div>
          <div style={{ display: "grid", gap: 8 }}>
            {tabMonitoring.map((row) => (
              <div key={row.participant_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", borderRadius: 12, background: C.cardBg, border: `1px solid ${C.border}` }}>
                <span style={{ color: C.text, fontWeight: 700 }}>{row.assigned_group_name || row.group_name || `${row.first_name} ${row.last_name}`}</span>
                <StatusPill C={C} label={`${row.tab_out_count || 0} tab out`} kind={(row.tab_out_count || 0) > 0 ? "red" : "green"} />
              </div>
            ))}
            {tabMonitoring.length === 0 && <span style={{ color: C.muted }}>No tab events recorded.</span>}
          </div>
        </div>
      </div>
      <div style={{ ...card(C), boxShadow: "none", padding: 16, background: C.cardBg2 }}>
        <div style={{ color: C.text, fontWeight: 900, marginBottom: 12 }}>Per-question Difficulty</div>
        <div style={{ display: "grid", gap: 10 }}>
          {questions.map((q, idx) => (
            <div key={q.question_id || idx} style={{ display: "grid", gridTemplateColumns: "72px 1fr 110px 120px", gap: 12, alignItems: "center", padding: "10px 12px", borderRadius: 14, background: C.cardBg, border: `1px solid ${C.border}` }}>
              <div style={{ color: C.muted, fontWeight: 800 }}>Q{Number(q.question_order || idx)}</div>
              <div style={{ color: C.text, fontWeight: 700 }}>{q.prompt}</div>
              <div style={{ color: C.text, fontWeight: 900 }}>{q.pct_correct ?? 0}%</div>
              <StatusPill C={C} label={q.difficulty} kind={q.difficulty === "Difficult" ? "red" : "green"} />
            </div>
          ))}
          {questions.length === 0 && <div style={{ color: C.muted, fontWeight: 700 }}>No question analytics recorded.</div>}
        </div>
      </div>
    </div>
  );
}

function palette(c, dark) {
  return {
    accent: c.accent,
    text: c.text,
    muted: c.textMuted,
    border: c.border,
    cardBg: c.cardBg,
    cardBg2: c.cardBg2,
    pageBg: c.pageBg,
    dark,
  };
}

function card(C) {
  return {
    background: C.cardBg,
    border: `1px solid ${C.border}`,
    borderRadius: 22,
    padding: 20,
    boxShadow: C.dark ? "0 20px 40px rgba(0,0,0,0.30)" : "0 20px 48px rgba(43,108,255,0.12)",
  };
}

function btnStyle(C, kind = "ghost") {
  if (kind === "ghost") {
    return {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      padding: "10px 15px",
      borderRadius: 999,
      border: `1px solid ${C.accent}`,
      background: `linear-gradient(135deg, ${C.accent}20, ${C.accent}10)`,
      color: C.accent,
      fontWeight: 900,
      cursor: "pointer",
      textDecoration: "none",
      boxShadow: `0 10px 24px ${C.accent}1a`,
      transition: "transform 180ms ease, box-shadow 180ms ease, background 180ms ease",
    };
  }
  return secondaryBtn(C);
}

function secondaryBtn(C) {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "10px 14px",
    borderRadius: 999,
    border: `1px solid ${C.border}`,
    background: C.cardBg2,
    color: C.text,
    fontWeight: 800,
    cursor: "pointer",
  };
}

function MetricCard({ C, label, value }) {
  return (
    <div style={{ ...card(C), boxShadow: "none", padding: 16, background: C.cardBg2 }}>
      <div style={{ color: C.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>{label}</div>
      <div style={{ color: C.text, fontSize: 28, fontWeight: 900, marginTop: 8 }}>{value}</div>
    </div>
  );
}

function StudentChip({ name, connected, C }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 999, background: C.cardBg, border: `1px solid ${C.border}` }}>
      <span style={{ width: 9, height: 9, borderRadius: 999, background: connected ? "#22c55e" : "#f59e0b", boxShadow: connected ? "0 0 0 4px rgba(34,197,94,0.12)" : "0 0 0 4px rgba(245,158,11,0.12)" }} />
      <span style={{ color: C.text, fontWeight: 700 }}>{name}</span>
    </div>
  );
}

function StatusPill({ C, label, kind = "blue" }) {
  const theme = {
    blue: { bg: C.dark ? "rgba(59,130,246,0.22)" : "rgba(59,130,246,0.12)", border: C.dark ? "rgba(96,165,250,0.34)" : "rgba(59,130,246,0.22)", fg: C.dark ? "#bfdbfe" : "#1d4ed8" },
    green: { bg: C.dark ? "rgba(34,197,94,0.22)" : "rgba(34,197,94,0.12)", border: C.dark ? "rgba(74,222,128,0.34)" : "rgba(34,197,94,0.22)", fg: C.dark ? "#bbf7d0" : "#166534" },
    red: { bg: C.dark ? "rgba(248,113,113,0.20)" : "rgba(248,113,113,0.12)", border: C.dark ? "rgba(252,165,165,0.34)" : "rgba(248,113,113,0.22)", fg: C.dark ? "#fecaca" : "#b91c1c" },
  }[kind] || { bg: C.cardBg2, border: C.border, fg: C.text };
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 10px", borderRadius: 999, background: theme.bg, color: theme.fg, border: `1px solid ${theme.border}`, fontWeight: 800, fontSize: 12 }}>{label}</span>;
}
