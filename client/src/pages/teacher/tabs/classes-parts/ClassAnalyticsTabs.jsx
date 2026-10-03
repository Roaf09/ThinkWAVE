import { useMemo, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  BarChart, Bar, ReferenceLine, Cell,
} from "recharts";
import { TwIcon } from "../../../../components/TwUI";
import { api } from "../../../../lib/api";
import { InnerScroll } from "../../../../lib/InnerScroll";
import { tabCard as card, solidModalBg } from "../teacherTabShared";
import { TwLogoLoader } from "../../../../components/TwLogoLoader";

const GREEN = "#22c55e";
const AMBER = "#f59e0b";
const RED = "#ef4444";
const BLUE = "#2b6cff";
const PURPLE = "#8b5cf6";
const SKY = "#38bdf8";
const LIGHT_BLUE = "#93c5fd";

const TYPE_SHORT = {
  MCQ: "MCQ", TRUE_FALSE: "True/False", TYPE_ANSWER: "Identification",
  MATCHING: "Matching", GUESS_WORD_4PICS: "Guess Word", CROSSWORD: "Crossword",
};
const typeShort = (t) => TYPE_SHORT[String(t || "MCQ")] || String(t || "");

function chartTheme(c) {
  return {
    grid: c.border,
    tick: { fontSize: 11, fill: c.textMuted },
    tooltip: {
      contentStyle: { background: c.cardBg, border: `1px solid ${c.border}`, borderRadius: 12, color: c.text },
      labelStyle: { color: c.text, fontWeight: 800 },
    },
    legend: (v) => <span style={{ color: c.textMuted, fontSize: 12 }}>{v}</span>,
  };
}

function SummaryCard({ c, label, value, sub, valueColor, children }) {
  return (
    <div style={{ background: c.cardBg, border: `1px solid ${c.border}`, borderRadius: 16, padding: "14px 16px", minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 13, color: c.textMuted, fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontSize: 30, fontWeight: 900, color: valueColor || c.text, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 12.5, color: c.textMuted, marginTop: 2 }}>{sub}</div>}
      {children}
    </div>
  );
}

function Section({ c, title, sub, right, children }) {
  return (
    <div style={{ background: c.cardBg, border: `1px solid ${c.border}`, borderRadius: 16, padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <h4 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: c.text }}>{title}</h4>
        <span style={{ display: "flex", gap: 8, alignItems: "center" }}>{right}</span>
      </div>
      {sub && <div style={{ fontSize: 12.5, color: c.textMuted, marginBottom: 12 }}>{sub}</div>}
      {children}
    </div>
  );
}

function initials(first, last) {
  return `${String(first || "").trim().charAt(0)}${String(last || "").trim().charAt(0)}`.toUpperCase() || "?";
}

// Activity titles (not Q1/A1 codes) label the charts; truncated where space
// is tight, full text in tooltips and table cells.
function truncTitle(t, n = 16) {
  const s = String(t || "");
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

// ---------------- Performance ----------------
function PerformanceTab({ c, perf }) {
  const t = chartTheme(c);
  const lineData = useMemo(() => (perf.activityAvg || []).map((a) => ({
    name: truncTitle(a.title, 16), fullTitle: a.title,
    Live: a.mode === "LIVE" ? a.average : null,
    Assigned: a.mode === "ASSIGNED" ? a.average : null,
  })), [perf]);
  const higher = perf.liveVsAssigned.assigned >= perf.liveVsAssigned.live ? "assignments score higher" : "live scores higher";
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
        <SummaryCard c={c} label="Class average" value={`${perf.classAverage}%`} sub={`across ${perf.activityAvg.length} activities`} />
        <SummaryCard c={c} label="Best activity" value={perf.best ? `${perf.best.average}%` : "—"} valueColor={GREEN} sub={perf.best ? `${perf.best.title} · ${perf.best.mode === "LIVE" ? "Live" : "Assigned"}` : ""} />
        <SummaryCard c={c} label="Weakest activity" value={perf.weakest ? `${perf.weakest.average}%` : "—"} valueColor={RED} sub={perf.weakest ? `${perf.weakest.title} · ${perf.weakest.mode === "LIVE" ? "Live" : "Assigned"}` : ""} />
        <SummaryCard c={c} label="Live vs assignment" value={`${perf.liveVsAssigned.live}% · ${perf.liveVsAssigned.assigned}%`} sub={higher} />
      </div>

      <Section c={c} title="Class average per activity"
        right={<span style={{ display: "flex", gap: 12, fontSize: 12, color: c.textMuted }}>
          <span><i style={{ display: "inline-block", width: 18, height: 4, borderRadius: 2, background: BLUE, marginRight: 5, verticalAlign: "middle" }} />Live</span>
          <span><i style={{ display: "inline-block", width: 18, height: 4, borderRadius: 2, background: PURPLE, marginRight: 5, verticalAlign: "middle" }} />Assignment</span>
        </span>}>
        {lineData.length ? (
          <InnerScroll axis="x" style={{ overflowX: "auto" }}>
            <div style={{ minWidth: Math.max(560, lineData.length * 72) }}>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={lineData} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={t.grid} vertical={false} />
                  <XAxis dataKey="name" tick={t.tick} interval={0} />
                  <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={t.tick} width={44} />
                  <Tooltip formatter={(v) => (v == null ? "—" : `${v}%`)} labelFormatter={(v) => lineData.find((d) => d.name === v)?.fullTitle || v} {...t.tooltip} />
                  <Line type="monotone" dataKey="Live" stroke={BLUE} strokeWidth={3} dot={{ r: 4, fill: BLUE }} connectNulls />
                  <Line type="monotone" dataKey="Assigned" stroke={PURPLE} strokeWidth={3} dot={{ r: 4, fill: PURPLE, strokeWidth: 2 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </InnerScroll>
        ) : <div style={{ color: c.textMuted }}>No completed activities yet.</div>}
      </Section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 14 }}>
        <Section c={c} title="Needs attention">
          {perf.needsAttention.length ? perf.needsAttention.map((s) => (
            <div key={s.enrollment_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${c.border}` }}>
              <span style={{ width: 32, height: 32, borderRadius: 999, background: c.cardBg2, color: c.accent, display: "grid", placeItems: "center", fontWeight: 900, fontSize: 12 }}>{initials(s.first_name, s.last_name)}</span>
              <b style={{ flex: 1, color: c.text }}>{s.first_name} {s.last_name}</b>
              <span style={{ color: String(s.reason).includes("avg") && Number(s.recentAvg) < 50 ? RED : AMBER, fontWeight: 800, fontSize: 13 }}>{s.reason}</span>
            </div>
          )) : <div style={{ color: c.textMuted }}>Nothing flagged — nice.</div>}
        </Section>
        <Section c={c} title="Most improved">
          {perf.mostImproved.length ? perf.mostImproved.map((s) => (
            <div key={s.enrollment_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${c.border}` }}>
              <span style={{ width: 32, height: 32, borderRadius: 999, background: c.cardBg2, color: c.accent, display: "grid", placeItems: "center", fontWeight: 900, fontSize: 12 }}>{initials(s.first_name, s.last_name)}</span>
              <b style={{ flex: 1, color: c.text }}>{s.first_name} {s.last_name}</b>
              <span style={{ color: GREEN, fontWeight: 900 }}>+{s.gain} pts</span>
            </div>
          )) : <div style={{ color: c.textMuted }}>Need at least 4 activities to measure growth.</div>}
        </Section>
      </div>
    </div>
  );
}

// ---------------- Learning ----------------
function LearningTab({ c, learning }) {
  const t = chartTheme(c);
  const accData = useMemo(() => (learning.accuracyByType || []).map((r) => ({ ...r, label: typeShort(r.type) })), [learning]);
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 14 }}>
        <Section c={c} title="Accuracy by question type" sub="Share of answers marked correct">
          {accData.length ? (
            <InnerScroll axis="y" style={{ maxHeight: 264, overflowY: "auto", overflowX: "hidden" }}>
              <ResponsiveContainer width="100%" height={Math.max(180, accData.length * 44)}>
                <BarChart data={accData} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={t.grid} horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} hide />
                  <YAxis type="category" dataKey="label" tick={{ fontSize: 12, fill: c.textMuted }} width={92} />
                  <Tooltip formatter={(v) => `${v}%`} {...t.tooltip} />
                  <Bar dataKey="accuracy" radius={[0, 6, 6, 0]} label={{ position: "right", formatter: (v) => `${v}%`, fontSize: 12, fontWeight: 900, fill: c.text }}>
                    {accData.map((r, i) => <Cell key={i} fill={r.accuracy < 65 ? AMBER : BLUE} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </InnerScroll>
          ) : <div style={{ color: c.textMuted }}>No answers yet.</div>}
        </Section>
        <Section c={c} title="Time used vs time limit" sub="Bar = average % of the time limit used · number inside = timeouts">
          {(learning.timeByActivity || []).length ? (
            <InnerScroll axis="x" style={{ overflowX: "auto" }}>
              <div style={{ minWidth: Math.max(420, learning.timeByActivity.length * 64) }}>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={(learning.timeByActivity || []).map((r) => ({ ...r, name: truncTitle(r.title, 14), fullTitle: r.title }))} margin={{ top: 10, right: 10, bottom: 0, left: -18 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={t.grid} vertical={false} />
                    <XAxis dataKey="name" tick={t.tick} interval={0} />
                    <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={t.tick} />
                    <Tooltip formatter={(v, name, p) => [`${v}% · ${p?.payload?.timeouts ?? 0} timeouts`, "Time used"]} labelFormatter={(v, payload) => payload?.[0]?.payload?.fullTitle || v} {...t.tooltip} />
                    <ReferenceLine y={75} stroke={AMBER} strokeDasharray="5 4" label={{ value: "limit may be tight", fontSize: 11, fill: "#b45309", position: "insideTopRight" }} />
                    <Bar dataKey="avgPct" radius={[6, 6, 0, 0]} label={{ position: "insideTop", fill: "#fff", fontSize: 12, fontWeight: 900, formatter: (v, e) => e?.payload?.timeouts ?? "" }}>
                      {(learning.timeByActivity || []).map((r, i) => <Cell key={i} fill={r.avgPct >= 75 ? AMBER : BLUE} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </InnerScroll>
          ) : <div style={{ color: c.textMuted }}>No timing data yet.</div>}
        </Section>
      </div>

      <Section c={c} title="Hardest questions across the class" sub="Lowest share of correct answers">
        {(learning.hardest || []).length ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, color: c.text }}>
              <thead>
                <tr style={{ background: c.cardBg2, color: c.textMuted, textAlign: "left" }}>
                  <th style={{ padding: "10px 12px", borderRadius: "10px 0 0 10px" }}>Question</th>
                  <th style={{ padding: "10px 12px" }}>Activity</th>
                  <th style={{ padding: "10px 12px" }}>Correct</th>
                  <th style={{ padding: "10px 12px" }}>Most-picked wrong answer</th>
                  <th style={{ padding: "10px 12px", borderRadius: "0 10px 10px 0" }}>Avg time</th>
                </tr>
              </thead>
              <tbody>
                {(learning.hardest || []).map((q) => {
                  const prompt = String(q.prompt || "");
                  const shortPrompt = prompt.length > 33 ? `${prompt.slice(0, 30)}...` : prompt;
                  return (
                    <tr key={q.question_id} style={{ borderBottom: `1px solid ${c.border}` }}>
                      <td title={prompt} style={{ padding: "10px 12px", fontWeight: 700, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{shortPrompt}</td>
                      <td title={q.activity} style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>{q.activity}</td>
                      <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                        <b style={{ color: q.accuracy < 50 ? RED : AMBER }}>{q.accuracy}%</b>
                        <span style={{ display: "inline-block", width: 64, height: 8, borderRadius: 999, background: c.border, marginLeft: 8, verticalAlign: "middle", overflow: "hidden" }}>
                          <span style={{ display: "block", height: "100%", width: `${q.accuracy}%`, background: q.accuracy < 50 ? RED : AMBER, borderRadius: 999 }} />
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px", color: q.accuracy < 50 ? RED : "#b45309" }}>{q.topWrong ? `${q.topWrong.label} · ${q.topWrong.pct}%` : "—"}</td>
                      <td style={{ padding: "10px 12px" }}>{q.avgSec != null ? `${q.avgSec} s` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <div style={{ color: c.textMuted }}>Not enough answers yet.</div>}
      </Section>
    </div>
  );
}

// ---------------- Participation ----------------
const CELL = { attended: GREEN, late: AMBER, missed: RED };
function ParticipationTab({ c, part, activities }) {
  const t = chartTheme(c);
  const acts = part.attendanceActivities?.length ? part.attendanceActivities : (activities || []);
  const [modeFilter, setModeFilter] = useState("ALL");
  const modeOf = useMemo(() => new Map(acts.map((a) => [a.key, a.mode])), [acts]);
  const integData = (part.integrityByActivity || [])
    .filter((r) => modeFilter === "ALL" || modeOf.get(r.key) === modeFilter)
    .map((r) => ({ ...r, name: truncTitle(r.title, 18), fullTitle: r.title }));
  const integHeight = Math.max(220, Math.min(integData.length, 10) * 56);
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
        <SummaryCard c={c} label="Live participation" value={`${part.liveParticipation}%`} sub={`average across ${acts.filter((a) => a.mode === "LIVE").length} sessions`} />
        <SummaryCard c={c} label="Assignment completion" value={`${part.assignmentCompletion}%`} sub={`average across ${acts.filter((a) => a.mode === "ASSIGNED").length} assignments`} />
        <SummaryCard c={c} label="Not submitted" value={part.notSubmittedCount} valueColor="#b45309" sub={part.notSubmittedByQuiz?.[0] ? `${part.notSubmittedByQuiz[0].title} · closes soon` : "all submitted"} />
        <SummaryCard c={c} label="Repeat guests" value={part.repeatGuests?.length || 0} sub="3+ visits as a guest" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 14 }}>
        <Section c={c} title="Attendance by activity"
          right={<span style={{ display: "flex", gap: 12, fontSize: 12, color: c.textMuted }}>
            <span><i style={{ display: "inline-block", width: 12, height: 12, borderRadius: 4, background: GREEN, marginRight: 4 }} />Attended / submitted</span>
            <span><i style={{ display: "inline-block", width: 12, height: 12, borderRadius: 4, background: AMBER, marginRight: 4 }} />Joined late / last hour</span>
            <span><i style={{ display: "inline-block", width: 12, height: 12, borderRadius: 4, background: RED, marginRight: 4 }} />Missed</span>
          </span>}>
          <div style={{ overflowX: "auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: `minmax(120px,1.2fr) repeat(${acts.length}, minmax(64px,1fr))`, gap: 6, minWidth: 640, alignItems: "center" }}>
              <span />
              {acts.map((a) => <b key={a.key} title={a.title} style={{ textAlign: "center", fontSize: 11, color: c.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{truncTitle(a.title, 12)}</b>)}
              {(part.attendanceGrid || []).slice(0, 9).map((row) => (
                <>
                  <span key={`n-${row.enrollment_id}`} style={{ fontSize: 13, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.first_name} {row.last_name}</span>
                  {row.cells.map((cl) => <span key={`${row.enrollment_id}-${cl.key}`} title={`${row.first_name} · ${cl.status}`} style={{ height: 26, borderRadius: 7, background: CELL[cl.status] || c.border }} />)}
                </>
              ))}
            </div>
            {(part.attendanceGrid || []).length > 9 && <div style={{ fontSize: 12.5, color: c.textMuted, fontStyle: "italic", marginTop: 8 }}>+ {part.attendanceGrid.length - 9} more students</div>}
          </div>
        </Section>
        <Section c={c} title="Integrity signals per activity"
          right={<span style={{ display: "flex", border: `1px solid ${c.border}`, borderRadius: 10, overflow: "hidden", background: c.cardBg }}>
            {[["ALL", "All"], ["LIVE", "Live"], ["ASSIGNED", "Assignment"]].map(([v, label], i) => (
              <button key={v} type="button" onClick={() => setModeFilter(v)}
                style={modeFilter === v
                  ? { background: c.cardBg2, color: c.text, border: "none", borderLeft: i > 0 ? `1px solid ${c.border}` : "none", padding: "6px 14px", fontWeight: 900, fontSize: 12, cursor: "default", boxShadow: "inset 0 2px 0 rgba(15,23,42,.12), inset 0 6px 12px rgba(15,23,42,.08)" }
                  : { background: "transparent", color: c.textMuted, border: "none", borderLeft: i > 0 ? `1px solid ${c.border}` : "none", padding: "6px 14px", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>
                {label}
              </button>
            ))}
          </span>}>
          {integData.length ? (
            <InnerScroll axis="y" style={{ maxHeight: 560, overflowY: "auto", overflowX: "hidden" }}>
              <ResponsiveContainer width="100%" height={integHeight}>
                <BarChart data={integData} layout="vertical" margin={{ top: 0, right: 30, bottom: 0, left: 10 }} barSize={30}>
                  <CartesianGrid strokeDasharray="3 3" stroke={t.grid} horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={t.tick} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 13, fill: c.textMuted }} width={110} />
                  <Tooltip labelFormatter={(v, payload) => payload?.[0]?.payload?.fullTitle || v} {...t.tooltip} />
                  <Legend formatter={t.legend} />
                  <Bar dataKey="tabOuts" stackId="s" name="Tab-outs" fill={AMBER} />
                  <Bar dataKey="captures" stackId="s" name="Capture keys" fill={SKY} />
                  <Bar dataKey="kicks" stackId="s" name="Kicks" fill={c.text} radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </InnerScroll>
          ) : <div style={{ color: c.textMuted }}>No activities in this view yet.</div>}
        </Section>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 14 }}>
        <Section c={c} title="Not submitted · last hour">
          {(part.notSubmittedByQuiz || []).length ? (part.notSubmittedByQuiz || []).map((q) => (
            <div key={q.quiz_id} style={{ marginBottom: 10 }}>
              <div style={{ color: RED, fontWeight: 800, fontSize: 13 }}>{q.title} — not submitted ({q.missing.length})</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                {q.missing.slice(0, 8).map((s) => <span key={s.enrollment_id} style={{ background: c.redBg, color: c.redFg, borderRadius: 999, padding: "5px 12px", fontSize: 12.5, fontWeight: 700 }}>{s.first_name} {s.last_name}</span>)}
              </div>
            </div>
          )) : <div style={{ color: c.textMuted }}>Everyone submitted.</div>}
          {(part.lastHourList || []).length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ color: c.yellowFg, fontWeight: 800, fontSize: 13 }}>Submitted in the final hour</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                {part.lastHourList.map((s, i) => <span key={i} style={{ background: c.yellowBg, color: c.yellowFg, borderRadius: 999, padding: "5px 12px", fontSize: 12.5, fontWeight: 700 }}>{s.first_name} {s.last_name}</span>)}
              </div>
            </div>
          )}
        </Section>
        <Section c={c} title="Repeat guests (3+ visits)">
          {(part.repeatGuests || []).length ? (part.repeatGuests || []).map((g, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${c.border}` }}>
              <span style={{ width: 32, height: 32, borderRadius: 999, background: c.cardBg2, color: c.accent, display: "grid", placeItems: "center", fontWeight: 900, fontSize: 12 }}>{String(g.name || "?").trim().charAt(0).toUpperCase()}</span>
              <b style={{ flex: 1, color: c.text }}>{g.name} (guest)</b>
              <span style={{ color: c.violet, fontWeight: 800, fontSize: 12.5 }}>{g.visits}{g.visits === 3 ? "rd" : g.visits === 4 ? "th" : "th"} visit</span>
            </div>
          )) : <div style={{ color: c.textMuted }}>No repeat guests.</div>}
        </Section>
      </div>
    </div>
  );
}

// ---------------- Modal shell ----------------
const TABS = [
  { key: "performance", label: "Performance" },
  { key: "learning", label: "Learning" },
  { key: "participation", label: "Participation" },
];

export function ClassAnalyticsTabs({ c, data }) {
  const [tab, setTab] = useState("performance");
  const [exporting, setExporting] = useState("");
  const [exportError, setExportError] = useState("");
  const meta = data?.meta || {};
  const range = meta.range?.from ? `${new Date(meta.range.from).toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${new Date(meta.range.to || meta.range.from).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : "";
  async function downloadExport(format) {
    if (exporting) return;
    setExporting(format);
    setExportError("");
    try {
      const classId = Number(data?.class?.id || 0);
      const resp = await api.get(`/classes/${classId}/analytics/export/${format}`, { responseType: "blob" });
      const mime = format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      const slug = String(data?.class?.name || `class-${classId}`).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || `class-${classId}`;
      const url = URL.createObjectURL(new Blob([resp.data], { type: mime }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `class-${slug}-${new Date().toISOString().slice(0, 10)}.${format}`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) {
      setExportError(err?.response?.data?.message || "Export failed. Please try again.");
    } finally {
      setExporting("");
    }
  }
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: c.text }}>Class Analytics · {data?.class?.name || ""}</h3>
          <div style={{ fontSize: 13, color: c.textMuted, marginTop: 2 }}>
            {meta.studentCount ?? 0} students · {meta.liveCount ?? 0} live sessions · {meta.assignmentCount ?? 0} assignments{range ? ` · ${range}` : ""}
          </div>
        </div>
        <div className="tw-analytics-export-row" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="tw-analytics-export-plain tw-export-pdf" disabled={!!exporting} title={exporting === "pdf" ? "Preparing export…" : "Export PDF"} onClick={() => downloadExport("pdf")}><TwIcon name="pdf" size={24} /><span>{exporting === "pdf" ? "Exporting…" : "PDF"}</span></button>
          <button type="button" className="tw-analytics-export-plain tw-export-xlsx" disabled={!!exporting} title={exporting === "xlsx" ? "Preparing export…" : "Export Excel"} onClick={() => downloadExport("xlsx")}><TwIcon name="xlsx" size={24} /><span>{exporting === "xlsx" ? "Exporting…" : "XLSX"}</span></button>
        </div>
      </div>

      {exportError && <div style={{ padding: "10px 14px", borderRadius: 12, background: c.redBg, border: `1px solid ${c.redBorder}`, color: c.redFg, fontSize: 13, fontWeight: 800 }}>{exportError}</div>}
      <div style={{ display: "flex", width: "fit-content", maxWidth: "100%", border: `1px solid ${c.border}`, borderRadius: 12, overflow: "hidden", background: c.cardBg }}>
        {TABS.map((t, i) => {
          const active = tab === t.key;
          return (
            <button key={t.key} type="button" onClick={() => setTab(t.key)}
              style={active
                ? { background: c.cardBg2, color: c.text, border: "none", borderLeft: i > 0 ? `1px solid ${c.border}` : "none", padding: "10px 22px", fontWeight: 900, fontSize: 14, cursor: "default", boxShadow: "inset 0 3px 0 rgba(15,23,42,.14), inset 0 8px 16px rgba(15,23,42,.10)" }
                : { background: "transparent", color: c.textMuted, border: "none", borderLeft: i > 0 ? `1px solid ${c.border}` : "none", padding: "10px 22px", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
              {t.label}
            </button>
          );
        })}
      </div>
      {tab === "performance" && <PerformanceTab c={c} perf={data.performance} />}
      {tab === "learning" && <LearningTab c={c} learning={data.learning} />}
      {tab === "participation" && <ParticipationTab c={c} part={data.participation} />}
    </div>
  );
}

export function ClassAnalyticsModal3Tab({ c, data, loading, onClose }) {
  return (
    <div className="tw-host-launch-backdrop" style={{ zIndex: 9000 }} onMouseDown={onClose}>
      <div onMouseDown={(e) => e.stopPropagation()} className="tw-class-analytics-modal tw-host-launch-modal w-[min(calc(96vw-260px),1100px)] max-h-[92dvh] overflow-hidden" style={{ ...card(c, { background: solidModalBg(c), padding: 0, borderWidth: 3 }) }}>
        <div className="tw-class-modal-title tw-class-modal-sticky-head px-[22px] pt-[20px] pb-[14px]" style={{ marginBottom: 0, background: solidModalBg(c), borderBottom: `3px solid ${c.border}`, display: "flex", justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} className="h-[34px] w-[34px] cursor-pointer rounded-[10px] border-0 bg-transparent font-[900]" style={{ color: c.text }}><TwIcon name="close" size={20} /></button>
        </div>
        <div className="tw-class-analytics-scroll p-[22px]" style={{ background: c.cardBg2, borderRadius: 18 }}>
          {loading || !data?.performance ? <TwLogoLoader minHeight="20vh" /> : <ClassAnalyticsTabs c={c} data={data} />}
        </div>
      </div>
    </div>
  );
}
