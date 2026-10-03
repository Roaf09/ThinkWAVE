import { useMemo, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  BarChart, Bar, ReferenceDot, Cell,
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
const GRAY = "#94a3b8";

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

function truncTitle(t, n = 16) {
  const s = String(t || "");
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function SummaryCard({ c, label, value, sub, valueColor }) {
  return (
    <div style={{ background: c.cardBg, border: `1px solid ${c.border}`, borderRadius: 16, padding: "14px 16px", minWidth: 0 }}>
      <div style={{ fontSize: 13, color: c.textMuted, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 900, color: valueColor || c.text, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 12.5, color: c.textMuted, marginTop: 2 }}>{sub}</div>}
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

function StatusPill({ c, status }) {
  const map = {
    "On time": [c.greenBg, c.greenFg], Submitted: [c.greenBg, c.greenFg],
    "Joined late": [c.yellowBg, c.yellowFg], "Last hour": [c.yellowBg, c.yellowFg],
    Missed: [c.redBg, c.redFg],
  };
  const [bg, fg] = map[status] || [c.cardBg2, c.textMuted];
  return <span style={{ background: bg, color: fg, borderRadius: 999, padding: "5px 12px", fontSize: 12.5, fontWeight: 800, whiteSpace: "nowrap" }}>{status}</span>;
}

// ---------------- Performance ----------------
function PerformanceTab({ c, perf }) {
  const t = chartTheme(c);
  const lineData = useMemo(() => (perf.series || []).map((s) => ({
    name: truncTitle(s.activity), fullTitle: s.activity,
    student: s.score, classAvg: s.classAverage, missed: s.score == null,
  })), [perf]);
  const trend = perf.trendDetail;
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
        <SummaryCard c={c} label="Average score" value={`${perf.average}%`} sub={`${perf.completed} of ${perf.total} activities`} />
        <SummaryCard c={c} label="Trend" value={trend ? `↑ +${perf.trend} pts` : "—"} valueColor={trend ? GREEN : undefined} sub={trend ? `last 3 vs earlier (${trend.last}% vs ${trend.earlier}%)` : "needs more activities"} />
        <SummaryCard c={c} label="Best score" value={perf.best ? `${perf.best.score}%` : "—"} sub={perf.best ? `${perf.best.activity} · ${new Date(perf.best.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""} />
        <SummaryCard c={c} label="Podium finishes" value={perf.podiums ?? 0} sub="top 3 in live sessions" />
      </div>

      <Section c={c} title="Student vs class average"
        right={<span style={{ display: "flex", gap: 12, fontSize: 12, color: c.textMuted }}>
          <span><i style={{ display: "inline-block", width: 18, height: 4, borderRadius: 2, background: BLUE, marginRight: 5, verticalAlign: "middle" }} />Student</span>
          <span><i style={{ display: "inline-block", width: 18, height: 4, borderRadius: 2, background: GRAY, marginRight: 5, verticalAlign: "middle" }} />Class average</span>
        </span>}>
        {lineData.length ? (
          <InnerScroll axis="x" style={{ overflowX: "auto" }}>
            <div style={{ minWidth: Math.max(560, lineData.length * 72) }}>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={lineData} margin={{ top: 16, right: 10, bottom: 0, left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={t.grid} vertical={false} />
                  <XAxis dataKey="name" tick={t.tick} interval={0} />
                  <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={t.tick} width={44} />
                  <Tooltip formatter={(v) => (v == null ? "missed" : `${v}%`)} labelFormatter={(v) => lineData.find((d) => d.name === v)?.fullTitle || v} {...t.tooltip} />
                  <Line type="monotone" dataKey="student" stroke={BLUE} strokeWidth={3} dot={{ r: 4, fill: BLUE }} connectNulls={false} />
                  <Line type="monotone" dataKey="classAvg" stroke={GRAY} strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls />
                  {lineData.filter((d) => d.missed).map((d, i) => (
                    <ReferenceDot key={i} x={d.name} y={50} r={9} fill={RED} stroke="#fff" strokeWidth={2} label={{ value: "✕", fill: "#fff", fontSize: 11, fontWeight: 900, position: "center" }} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
              <div style={{ fontSize: 12, color: c.textMuted, marginTop: 4 }}>Red ✕ marks a missed activity.</div>
            </div>
          </InnerScroll>
        ) : <div style={{ color: c.textMuted }}>No completed activities yet.</div>}
      </Section>

      <Section c={c} title="Activity timeline" sub="Most recent first">
        {(perf.timeline || []).length ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, color: c.text }}>
              <thead>
                <tr style={{ background: c.cardBg2, color: c.textMuted, textAlign: "left" }}>
                  <th style={{ padding: "10px 12px", borderRadius: "10px 0 0 10px" }}>Date</th>
                  <th style={{ padding: "10px 12px" }}>Activity</th>
                  <th style={{ padding: "10px 12px" }}>Mode</th>
                  <th style={{ padding: "10px 12px" }}>Score</th>
                  <th style={{ padding: "10px 12px" }}>Placement</th>
                  <th style={{ padding: "10px 12px", borderRadius: "0 10px 10px 0" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {[...(perf.timeline || [])].reverse().map((row) => (
                  <tr key={row.key} style={{ borderBottom: `1px solid ${c.border}` }}>
                    <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>{row.date ? new Date(row.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}</td>
                    <td style={{ padding: "10px 12px", fontWeight: 700 }}>{row.activity}</td>
                    <td style={{ padding: "10px 12px" }}>{row.mode}</td>
                    <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                      {row.score == null ? "—" : (<>
                        <b style={{ color: row.score >= 90 ? GREEN : row.score >= 50 ? BLUE : AMBER }}>{row.score}%</b>
                        <span style={{ display: "inline-block", width: 64, height: 8, borderRadius: 999, background: c.border, marginLeft: 8, verticalAlign: "middle", overflow: "hidden" }}>
                          <span style={{ display: "block", height: "100%", width: `${row.score}%`, background: row.score >= 90 ? GREEN : row.score >= 50 ? BLUE : AMBER, borderRadius: 999 }} />
                        </span>
                      </>)}
                    </td>
                    <td style={{ padding: "10px 12px" }}>{row.placement || "—"}</td>
                    <td style={{ padding: "10px 12px" }}><StatusPill c={c} status={row.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div style={{ color: c.textMuted }}>No activities yet.</div>}
      </Section>
    </div>
  );
}

// ---------------- Learning ----------------
function LearningTab({ c, learning }) {
  const t = chartTheme(c);
  const accData = useMemo(() => (learning.accuracyByType || []).map((r) => ({ ...r, label: typeShort(r.type) })), [learning]);
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="tw-student-learn-grid">
        <SummaryCard c={c} label="Avg time · correct" value={learning.correctMs != null ? `${learning.correctMs} s` : "—"} sub="on questions answered right" />
        <SummaryCard c={c} label="Avg time · wrong" value={learning.wrongMs != null ? `${learning.wrongMs} s` : "—"} valueColor={learning.wrongMs != null && learning.correctMs != null && learning.wrongMs < learning.correctMs / 2 ? AMBER : undefined} sub="much faster — possible guessing" />
        <SummaryCard c={c} label="Avg answer time" value={`${learning.averageMs ?? 0} s`} sub="existing · now uses real timings" />
        <SummaryCard c={c} label="Quick wrong answers" value={learning.quickWrong ?? 0} valueColor={RED} sub="wrong in under 3 seconds" />
        <SummaryCard c={c} label="Timeouts" value={learning.timeouts ?? 0} sub="existing · now counts live sessions" />
        <SummaryCard c={c} label="Almost answers" value={learning.almost ?? 0} sub="partial credit (Matching, 2-answer MCQ)" />
      </div>

      <Section c={c} title="Accuracy by question type · student vs class"
        right={<span style={{ display: "flex", gap: 12, fontSize: 12, color: c.textMuted }}>
          <span><i style={{ display: "inline-block", width: 12, height: 12, borderRadius: 4, background: BLUE, marginRight: 4 }} />Student</span>
          <span><i style={{ display: "inline-block", width: 12, height: 12, borderRadius: 4, background: GRAY, marginRight: 4 }} />Class average</span>
        </span>}>
        {accData.length ? (
          <ResponsiveContainer width="100%" height={Math.max(220, accData.length * 52)}>
            <BarChart data={accData} margin={{ top: 16, right: 10, bottom: 0, left: -18 }} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke={t.grid} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: c.textMuted }} interval={0} />
              <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={t.tick} />
              <Tooltip formatter={(v) => `${v}%`} {...t.tooltip} />
              <Legend formatter={t.legend} />
              <Bar dataKey="accuracy" name="Student" fill={BLUE} radius={[6, 6, 0, 0]}
                label={{ position: "top", fontSize: 12, fontWeight: 900, formatter: (v) => `${v}%`, fill: c.text }}>
                {accData.map((r, i) => <Cell key={i} fill={r.classAccuracy != null && r.accuracy < r.classAccuracy ? RED : BLUE} />)}
              </Bar>
              <Bar dataKey="classAccuracy" name="Class average" fill={GRAY} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : <div style={{ color: c.textMuted }}>No answers yet.</div>}
      </Section>

      <Section c={c} title="Most-missed questions" sub="Prompt, the student's answer and how long they took">
        {(learning.mostMissed || []).length ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, color: c.text }}>
              <thead>
                <tr style={{ background: c.cardBg2, color: c.textMuted, textAlign: "left" }}>
                  <th style={{ padding: "10px 12px", borderRadius: "10px 0 0 10px" }}>Question</th>
                  <th style={{ padding: "10px 12px" }}>Activity</th>
                  <th style={{ padding: "10px 12px" }}>Student's answer</th>
                  <th style={{ padding: "10px 12px", borderRadius: "0 10px 10px 0" }}>Time</th>
                </tr>
              </thead>
              <tbody>
                {(learning.mostMissed || []).map((m, i) => {
                  const secs = m.ms != null ? m.ms / 1000 : null;
                  const rushed = secs != null && secs < 3;
                  const prompt = String(m.prompt || "");
                  return (
                    <tr key={i} style={{ borderBottom: `1px solid ${c.border}` }}>
                      <td title={prompt} style={{ padding: "10px 12px", fontWeight: 700, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{prompt.length > 33 ? `${prompt.slice(0, 30)}...` : prompt}</td>
                      <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>{m.activity}</td>
                      <td style={{ padding: "10px 12px" }}>{m.answer || "—"}</td>
                      <td style={{ padding: "10px 12px", fontWeight: 800, color: rushed ? RED : c.text }}>{secs != null ? `${Number(secs.toFixed(1))} s` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <div style={{ color: c.textMuted }}>No missed questions — clean sheet.</div>}
      </Section>
    </div>
  );
}

// ---------------- Participation ----------------
function ParticipationTab({ c, part }) {
  const strip = part.strip || [];
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
        <SummaryCard c={c} label="Overall participation" value={`${part.overall ?? 0}%`} sub="of all activities" />
        <SummaryCard c={c} label="Live participation" value={`${part.live ?? 0}%`} sub={`of ${part.totals?.live ?? 0} sessions`} />
        <SummaryCard c={c} label="Assignment completion" value={`${part.assigned ?? 0}%`} sub={`of ${part.totals?.assigned ?? 0} submitted`} />
        <SummaryCard c={c} label="Joined late" value={part.late ?? 0} valueColor={AMBER} sub={(part.lateList || []).join(" · ") || "always on time"} />
      </div>

      <Section c={c} title="Attendance strip"
        right={<span style={{ display: "flex", gap: 12, fontSize: 12, color: c.textMuted }}>
          <span><i style={{ display: "inline-block", width: 12, height: 12, borderRadius: 999, background: GREEN, marginRight: 4 }} />Attended / submitted</span>
          <span><i style={{ display: "inline-block", width: 12, height: 12, borderRadius: 999, background: AMBER, marginRight: 4 }} />Joined late / last hour</span>
          <span><i style={{ display: "inline-block", width: 12, height: 12, borderRadius: 999, background: RED, marginRight: 4 }} />Missed</span>
        </span>}>
        {strip.length ? (
          <InnerScroll axis="x" style={{ overflowX: "auto" }}>
            <div style={{ minWidth: Math.max(560, strip.length * 88), position: "relative", padding: "6px 4px 0" }}>
              <div style={{ position: "absolute", left: 28, right: 28, top: 26, height: 3, background: c.border, borderRadius: 2 }} />
              <div style={{ display: "flex", justifyContent: "space-between", position: "relative" }}>
                {strip.map((s) => (
                  <div key={s.key} title={`${s.activity} · ${s.status}`} style={{ display: "grid", justifyItems: "center", gap: 6, minWidth: 72 }}>
                    <span style={{ width: 34, height: 34, borderRadius: 999, background: s.status === "attended" ? GREEN : s.status === "late" ? AMBER : RED, boxShadow: "0 0 0 4px rgba(255,255,255,.4)" }} />
                    <b style={{ fontSize: 12, color: c.text, textAlign: "center" }}>{truncTitle(s.activity, 12)}</b>
                    <span style={{ fontSize: 11, color: c.textMuted }}>{s.date ? new Date(s.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}</span>
                  </div>
                ))}
              </div>
            </div>
          </InnerScroll>
        ) : <div style={{ color: c.textMuted }}>No activities yet.</div>}
      </Section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 14 }}>
        <Section c={c} title="Integrity signals by activity">
          {(part.integrity || []).length ? (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, color: c.text }}>
                <thead>
                  <tr style={{ background: c.cardBg2, color: c.textMuted, textAlign: "left" }}>
                    <th style={{ padding: "10px 12px", borderRadius: "10px 0 0 10px" }}>Activity</th>
                    <th style={{ padding: "10px 12px" }}>Tab-outs</th>
                    <th style={{ padding: "10px 12px" }}>Capture keys</th>
                    <th style={{ padding: "10px 12px", borderRadius: "0 10px 10px 0" }}>Kicked</th>
                  </tr>
                </thead>
                <tbody>
                  {(part.integrity || []).map((r, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${c.border}` }}>
                      <td style={{ padding: "10px 12px", fontWeight: 700 }}>{r.activity} · {r.date ? new Date(r.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}</td>
                      <td style={{ padding: "10px 12px", fontWeight: 800, color: r.tabOuts ? AMBER : c.text }}>{r.tabOuts}</td>
                      <td style={{ padding: "10px 12px", fontWeight: 800, color: r.captures ? "#0284c7" : c.text }}>{r.captures}</td>
                      <td style={{ padding: "10px 12px" }}>{r.kicked}</td>
                    </tr>
                  ))}
                  <tr style={{ fontWeight: 900 }}>
                    <td style={{ padding: "10px 12px" }}>Total</td>
                    <td style={{ padding: "10px 12px" }}>{part.integrityTotals?.tabOuts ?? 0}</td>
                    <td style={{ padding: "10px 12px" }}>{part.integrityTotals?.captures ?? 0}</td>
                    <td style={{ padding: "10px 12px" }}>{part.integrityTotals?.kicked ?? 0}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div><span style={{ background: c.greenBg, color: c.greenFg, borderRadius: 999, padding: "6px 14px", fontSize: 12.5, fontWeight: 800 }}>No flags</span></div>
          )}
        </Section>
        <Section c={c} title="Group contribution" sub={(part.group?.sessionTitles || []).length ? `${part.group.sessions} group sessions (${part.group.sessionTitles.join(", ")})` : "No group sessions yet"}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "6px 0" }}>
            <span style={{ color: c.textMuted, fontSize: 13 }}>Proposals made</span>
            <b style={{ fontSize: 24, color: c.text }}>{part.group?.proposals ?? 0}</b>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "6px 0" }}>
            <span style={{ color: c.textMuted, fontSize: 13 }}>Approved by group</span>
            <b style={{ fontSize: 24, color: c.text }}>{part.group?.approved ?? 0}</b>
          </div>
          <div style={{ height: 10, borderRadius: 999, background: c.border, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${part.group?.approvalPct ?? 0}%`, background: GREEN, borderRadius: 999 }} />
          </div>
          <div style={{ fontSize: 12.5, color: GREEN, fontWeight: 700, marginTop: 4 }}>{part.group?.approvalPct ?? 0}% of proposals were accepted</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "12px 0 0" }}>
            <span style={{ color: c.textMuted, fontSize: 13 }}>Votes cast</span>
            <b style={{ fontSize: 24, color: c.text }}>{part.group?.votes ?? 0}</b>
          </div>
        </Section>
      </div>
    </div>
  );
}

// ---------------- Shell ----------------
const TABS = [
  { key: "performance", label: "Performance" },
  { key: "learning", label: "Learning" },
  { key: "participation", label: "Participation" },
];

export function StudentAnalyticsTabs({ c, data, classId }) {
  const [tab, setTab] = useState("performance");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const st = data?.student || {};
  const name = `${st.first_name || ""} ${st.last_name || ""}`.trim() || "Student";
  const initials = `${String(st.first_name || "").trim().charAt(0)}${String(st.last_name || "").trim().charAt(0)}`.toUpperCase();
  async function downloadPdf() {
    if (exporting) return;
    setExporting(true);
    setExportError("");
    try {
      const resp = await api.get(`/classes/${Number(classId || 0)}/students/${Number(st.id || 0)}/analytics/export/pdf`, { responseType: "blob" });
      const slug = `${st.first_name || ""}-${st.last_name || ""}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "student";
      const url = URL.createObjectURL(new Blob([resp.data], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `student-${slug}-${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) {
      setExportError(err?.response?.data?.message || "Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  }
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{ width: 52, height: 52, borderRadius: 999, background: c.accent, color: "#fff", display: "grid", placeItems: "center", fontWeight: 900, fontSize: 18, flex: "none" }}>{initials || "?"}</span>
          <div>
            <h3 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: c.text }}>{name}</h3>
            <div style={{ fontSize: 13, color: c.textMuted, marginTop: 2 }}>
              Student ID {st.student_id || "—"}{data?.className ? ` · ${data.className}` : ""}{st.joined_at ? ` · enrolled ${new Date(st.joined_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}
            </div>
          </div>
        </div>
        <div className="tw-analytics-export-row" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="tw-analytics-export-plain tw-export-pdf" disabled={exporting} title={exporting ? "Preparing export…" : "Export PDF"} onClick={downloadPdf}><TwIcon name="pdf" size={24} /><span>{exporting ? "Exporting…" : "PDF"}</span></button>
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

export function StudentAnalyticsModal3Tab({ c, data, loading, onClose, classId }) {
  return (
    <div className="tw-host-launch-backdrop" style={{ zIndex: 9000 }} onMouseDown={onClose}>
      <div onMouseDown={(e) => e.stopPropagation()} className="tw-class-student-analytics-modal tw-host-launch-modal w-[min(calc(96vw-260px),1100px)] max-h-[92dvh] overflow-hidden" style={{ ...card(c, { background: solidModalBg(c), padding: 0, borderWidth: 3 }) }}>
        <div className="tw-class-modal-title tw-class-modal-sticky-head px-[22px] pt-[20px] pb-[14px]" style={{ marginBottom: 0, background: solidModalBg(c), borderBottom: `3px solid ${c.border}`, display: "flex", justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} className="h-[34px] w-[34px] cursor-pointer rounded-[10px] border-0 bg-transparent font-[900]" style={{ color: c.text }}><TwIcon name="close" size={20} /></button>
        </div>
        <div className="tw-class-analytics-scroll p-[22px]" style={{ background: c.cardBg2, borderRadius: 18 }}>
          {loading || !data?.performance ? <TwLogoLoader minHeight="20vh" /> : <StudentAnalyticsTabs c={c} data={data} classId={classId} />}
        </div>
      </div>
    </div>
  );
}
