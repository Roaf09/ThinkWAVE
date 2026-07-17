/* FILE GUIDE:
 * client/src/pages/teacher/Analytics.jsx
 * Purpose: Shared current-design analytics page for live and assigned sessions.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, API_BASE } from "../../lib/api";
import { useColors, useTheme } from "../../context/ThemeContext";
import { templateLabel, templateTone } from "../../lib/templatePalette";
import { isInstitutionPlan } from "../../lib/planLimits";
import { TwIcon } from "../../components/TwUI";
import ThemeIconButton from "../../components/ThemeIconButton";

export default function Analytics() {
  const { sessionId, classId, quizId } = useParams();
  const assigned = Boolean(classId && quizId);
  const navigate = useNavigate();
  const colors = useColors();
  const { dark, toggleTheme } = useTheme();
  const C = palette(colors, dark);
  const [analytics, setAnalytics] = useState(null);
  const [tabMonitoring, setTabMonitoring] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [institutionPlan, setInstitutionPlan] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    (async () => {
      try {
        const meResponse = await api.get("/auth/me");
        const hasInstitutionPlan = isInstitutionPlan(meResponse.data);
        if (!alive) return;
        setInstitutionPlan(hasInstitutionPlan);

        if (assigned) {
          const { data } = await api.get(`/classes/${classId}/async-results/${quizId}/analytics`);
          if (!alive) return;
          setAnalytics(data || null);
          setTabMonitoring([]);
        } else {
          const analyticsResponse = await api.get(`/sessions/${sessionId}/full-analytics`);
          let tabs = [];
          if (hasInstitutionPlan) {
            const tabsResponse = await api.get(`/sessions/${sessionId}/tab-monitoring`);
            tabs = tabsResponse.data || [];
          }
          if (!alive) return;
          setAnalytics(analyticsResponse.data || null);
          setTabMonitoring(tabs);
        }
      } catch (err) {
        if (alive) setError(err?.response?.data?.message || "Unable to load analytics.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [assigned, classId, quizId, sessionId]);

  const session = analytics?.session || {};
  const tone = templateTone(session.template_type, colors, dark);
  const scores = useMemo(() => buildScores(analytics), [analytics]);
  const exportBase = assigned
    ? `${API_BASE}/api/classes/${classId}/async-results/${quizId}/export`
    : `${API_BASE}/api/analytics/sessions/${sessionId}/export`;

  return (
    <div className="tw-analytics-page" style={{ minHeight: "100vh", background: colors.pageBg, paddingBottom: 40 }}><div className="container">
      <div style={{ display: "grid", gap: 18 }}>
        <section className="tw-analytics-card" style={{ ...card(C), overflow: "hidden", position: "relative" }}>
          <div style={{ position: "absolute", inset: "0 0 auto 0", height: 5, background: tone.accent }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <button onClick={() => navigate(-1)} style={secondaryBtn(C)}>← Back</button>
            <ThemeIconButton dark={dark} onClick={toggleTheme} style={secondaryBtn(C)} size={17} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 14, flexWrap: "wrap", marginTop: 14 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ ...pill(C), color: tone.accent, borderColor: tone.border, background: tone.softBg }}>{templateLabel(session.template_type)}</span>
                <span style={pill(C)}>{assigned ? "Assigned session" : session.join_mode === "GROUP" ? "Group live session" : "Solo live session"}</span>
              </div>
              <h2 style={{ margin: "12px 0 5px", color: C.text, fontWeight: 950, overflow: "hidden", textOverflow: "ellipsis" }}>
                {session.quiz_title || (assigned ? `Assigned Quiz #${quizId}` : `Session #${sessionId}`)}
              </h2>
              <div style={{ color: C.muted, fontSize: 13, fontWeight: 750, lineHeight: 1.6 }}>
                {assigned ? "Assigned Session Analytics" : "Session Analytics"} · {session.folder_name || session.class_name || "Unassigned"} · {formatDate(session.display_date)}
              </div>
            </div>
            {institutionPlan && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <a style={downloadBtn(C)} href={`${exportBase}/pdf`} target="_blank" rel="noreferrer">PDF</a>
              <a style={downloadBtn(C)} href={`${exportBase}/xlsx`} target="_blank" rel="noreferrer">Excel</a>
            </div>}
          </div>
        </section>

        {error && <div style={{ ...card(C), borderColor: C.redBorder, color: C.redFg, background: C.redBg, fontWeight: 800 }}>{error}</div>}

        <section className="tw-analytics-card" style={card(C)}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 10, flexWrap: "wrap" }}>
            <h3 style={{ margin: 0, color: C.text, fontWeight: 950, display: "flex", alignItems: "center", gap: 9 }}><TwIcon name="trophy" size={21} /> Performance Overview</h3>
            <span style={{ ...pill(C), color: tone.accent, borderColor: tone.border, background: tone.softBg }}>
              {scores.length} {session.join_mode === "GROUP" ? "groups" : "students"}
            </span>
          </div>

          {loading ? (
            <div style={{ color: C.muted, textAlign: "center", padding: 42, fontWeight: 850 }}>Loading analytics…</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: institutionPlan ? "repeat(auto-fit, minmax(300px, 1fr))" : "1fr", gap: 18, alignItems: "start" }}>
              {institutionPlan && <Scoreboard C={C} scores={scores} tone={tone} />}
              <AnalyticsPanel C={C} analytics={analytics || {}} tabMonitoring={tabMonitoring} assigned={assigned} tone={tone} institutionPlan={institutionPlan} />
            </div>
          )}
        </section>
      </div>
    </div></div>
  );
}

function Scoreboard({ C, scores, tone }) {
  if (!scores.length) return <div style={emptyCard(C)}>No scores have been submitted yet.</div>;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {scores.map((score, index) => (
        <div key={score.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "11px 13px", borderRadius: 15, background: index === 0 ? tone.softBg : C.cardBg2, border: `1px solid ${index === 0 ? tone.border : C.border}` }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
            <span style={{ width: 28, flex: "0 0 auto", textAlign: "center", fontWeight: 900 }}>{index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `#${index + 1}`}</span>
            <span style={{ color: C.text, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{score.label}</span>
          </div>
          <span style={{ color: tone.accent, fontWeight: 950, whiteSpace: "nowrap" }}>{score.total_points} pts</span>
        </div>
      ))}
    </div>
  );
}

function AnalyticsPanel({ C, analytics, tabMonitoring, assigned, tone, institutionPlan }) {
  const summary = analytics.summary || {};
  const students = [...(analytics.students || [])].sort((a,b) => `${a.last_name || ""} ${a.first_name || ""}`.localeCompare(`${b.last_name || ""} ${b.first_name || ""}`));
  const questions = analytics.questions || [];
  const joinMode = analytics?.session?.join_mode || "SOLO";
  const groupedAttendance = joinMode === "GROUP" ? Object.values(students.reduce((acc, student) => {
    const key = student.group_name || `${student.first_name || ""} ${student.last_name || ""}`.trim() || "Unnamed group";
    if (!acc[key]) acc[key] = { name: key, members: [] };
    acc[key].members.push(student);
    return acc;
  }, {})) : [];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))", gap: 10 }}>
        <MetricCard C={C} tone={tone} label="Average" value={summary.avg_score ?? 0} />
        <MetricCard C={C} tone={tone} label="Lowest" value={summary.min_score ?? 0} />
        <MetricCard C={C} tone={tone} label="Highest" value={summary.max_score ?? 0} />
        <MetricCard C={C} tone={tone} label={joinMode === "GROUP" ? "Groups" : "Submitted"} value={summary.participant_count ?? students.length} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: assigned ? "1fr" : "repeat(auto-fit, minmax(250px, 1fr))", gap: 12 }}>
        <div style={subCard(C)}>
          <div style={sectionTitle(C)}>Attendance</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {joinMode === "GROUP" ? groupedAttendance.map((group) => (
              <details key={group.name} style={{ width: "100%", background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 14, padding: "10px 12px" }}>
                <summary style={{ cursor: "pointer", color: C.text, fontWeight: 850 }}>{group.name} <span style={{ color: C.muted }}>({group.members.length})</span></summary>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>{group.members.map((member) => <StudentChip key={member.participant_id} name={`${member.first_name || ""} ${member.last_name || ""}`.trim()} C={C} />)}</div>
              </details>
            )) : students.map((student) => <StudentChip key={student.participant_id} name={`${student.first_name || ""} ${student.last_name || ""}`.trim()} C={C} />)}
            {!students.length && <span style={{ color: C.muted }}>No submitted students yet.</span>}
          </div>
        </div>

        {institutionPlan && !assigned && (
          <div style={subCard(C)}>
            <div style={sectionTitle(C)}>Tab Monitoring</div>
            <div style={{ display: "grid", gap: 8 }}>
              {tabMonitoring.map((row) => (
                <div key={row.participant_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 12, background: C.cardBg, border: `1px solid ${C.border}` }}>
                  <span style={{ color: C.text, fontWeight: 750 }}>{row.assigned_group_name || row.group_name || `${row.first_name || ""} ${row.last_name || ""}`.trim()}</span>
                  <span style={{ ...pill(C), color: Number(row.tab_out_count || 0) ? C.redFg : C.greenFg, borderColor: Number(row.tab_out_count || 0) ? C.redBorder : C.greenBorder, background: Number(row.tab_out_count || 0) ? C.redBg : C.greenBg }}>{row.tab_out_count || 0} tab out</span>
                </div>
              ))}
              {!tabMonitoring.length && <span style={{ color: C.muted }}>No tab events recorded.</span>}
            </div>
          </div>
        )}
      </div>

      <div style={subCard(C)}>
        <div style={sectionTitle(C)}>Per-question Results</div>
        <div style={{ display: "grid", gap: 10 }}>
          {questions.map((question, index) => (
            <div key={question.question_id || index} style={{ display: "grid", gridTemplateColumns: "minmax(46px, auto) minmax(150px, 1fr) repeat(2, minmax(92px, auto))", gap: 10, alignItems: "center", padding: "11px 12px", borderRadius: 14, background: C.cardBg, border: `1px solid ${C.border}` }}>
              <span style={{ color: tone.accent, fontWeight: 950 }}>Q{index + 1}</span>
              <span style={{ color: C.text, fontWeight: 750, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{question.prompt || "Untitled question"}</span>
              <span style={{ ...pill(C), color: C.greenFg, borderColor: C.greenBorder, background: C.greenBg }}>✓ {question.pct_correct ?? 0}%</span>
              <span style={{ ...pill(C), color: C.redFg, borderColor: C.redBorder, background: C.redBg }}>✕ {question.pct_incorrect ?? 0}%</span>
            </div>
          ))}
          {!questions.length && <div style={emptyCard(C)}>No question-level results are available yet.</div>}
        </div>
      </div>
    </div>
  );
}

function buildScores(analytics) {
  const students = analytics?.students || [];
  if (analytics?.session?.join_mode === "GROUP") {
    return Object.values(students.reduce((acc, student) => {
      const key = student.group_name || `${student.first_name || ""} ${student.last_name || ""}`.trim() || `Group ${student.participant_id}`;
      if (!acc[key]) acc[key] = { key, label: key, total_points: 0 };
      acc[key].total_points = Math.max(acc[key].total_points, Number(student.total_points || 0));
      return acc;
    }, {})).sort(sortScore);
  }
  return students.map((student) => ({
    key: student.participant_id,
    label: `${student.first_name || ""} ${student.last_name || ""}`.trim() || `Student ${student.participant_id}`,
    total_points: Number(student.total_points || 0),
  })).sort(sortScore);
}

function sortScore(a, b) {
  return Number(b.total_points || 0) - Number(a.total_points || 0) || String(a.label).localeCompare(String(b.label));
}

function formatDate(value) {
  if (!value) return "No date";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
}

function palette(c, dark) {
  return {
    text: c.text,
    muted: c.textMuted || c.textSub,
    border: c.border,
    cardBg: c.cardBg,
    cardBg2: c.cardBg2,
    accent: c.accent,
    redFg: c.redFg || "#b91c1c",
    redBg: c.redBg || (dark ? "rgba(239,68,68,.12)" : "#fef2f2"),
    redBorder: c.redBorder || "rgba(239,68,68,.35)",
    greenFg: c.greenFg || "#15803d",
    greenBg: c.greenBg || (dark ? "rgba(34,197,94,.12)" : "#f0fdf4"),
    greenBorder: c.greenBorder || "rgba(34,197,94,.35)",
  };
}

function card(C) {
  return { background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 20, padding: 18, boxShadow: "0 16px 38px rgba(15,23,42,.08)", transition: "transform .22s ease, box-shadow .22s ease, border-color .22s ease" };
}
function subCard(C) { return { background: C.cardBg2, border: `1px solid ${C.border}`, borderRadius: 17, padding: 15, transition: "transform .22s ease, box-shadow .22s ease" }; }
function emptyCard(C) { return { color: C.muted, textAlign: "center", padding: 24, borderRadius: 15, border: `1px dashed ${C.border}`, background: C.cardBg2, fontWeight: 750 }; }
function sectionTitle(C) { return { color: C.text, fontWeight: 950, marginBottom: 11 }; }
function pill(C) { return { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "5px 9px", borderRadius: 999, border: `1px solid ${C.border}`, background: C.cardBg2, color: C.text, fontSize: 12, fontWeight: 850, whiteSpace: "nowrap" }; }
function secondaryBtn(C) { return { padding: "9px 13px", borderRadius: 999, border: `1px solid ${C.border}`, background: C.cardBg2, color: C.text, fontWeight: 850, cursor: "pointer" }; }
function downloadBtn(C) { return { ...secondaryBtn(C), display: "inline-flex", textDecoration: "none", alignItems: "center", justifyContent: "center" }; }
function MetricCard({ C, tone, label, value }) { return <div style={{ ...subCard(C), background: tone.softBg, borderColor: tone.border }}><div style={{ color: tone.accent, fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 900 }}>{label}</div><div style={{ color: C.text, fontSize: 27, fontWeight: 950, marginTop: 7 }}>{value}</div></div>; }
function StudentChip({ name, C }) { return <span style={{ ...pill(C), padding: "8px 11px" }}><span style={{ width: 8, height: 8, borderRadius: 99, background: "#22c55e", boxShadow: "0 0 0 4px rgba(34,197,94,.12)" }} />{name || "Student"}</span>; }
