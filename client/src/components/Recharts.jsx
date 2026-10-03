import {
  ResponsiveContainer, LineChart as RLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, BarChart as RBarChart, Bar,
} from "recharts";
import { useColors } from "../context/ThemeContext";

// Recharts replacements for SimpleCharts.jsx (admin + superadmin dashboards).
// Same prop APIs, so call sites only change their import. Theme-aware via
// useColors: grids, ticks, and tooltips follow dark/light mode.

function tooltipStyle(c) {
  return {
    contentStyle: { background: c.cardBg, border: `1px solid ${c.border}`, borderRadius: 12, color: c.text },
    labelStyle: { color: c.text, fontWeight: 800 },
  };
}

export function LineChart({ values = [], labels = [], height = 190 }) {
  const c = useColors();
  const clean = (values.length ? values : [0]).map((v) => Number(v || 0));
  const data = clean.map((v, i) => ({ name: labels[i] ?? `#${i + 1}`, value: v }));
  return (
    <div style={{ minWidth: 0 }}>
      <ResponsiveContainer width="100%" height={height}>
        <RLineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -14 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={c.border} vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: c.textMuted }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 11, fill: c.textMuted }} width={36} />
          <Tooltip {...tooltipStyle(c)} />
          <Line type="monotone" dataKey="value" stroke={c.accent} strokeWidth={3} dot={{ r: 4, fill: c.cardBg, stroke: c.accent, strokeWidth: 3 }} activeDot={{ r: 5 }} />
        </RLineChart>
      </ResponsiveContainer>
      {!!labels.length && <div className="tw-chart-labels">{labels.map((label, i) => <span key={`${label}-${i}`}>{label}</span>)}</div>}
    </div>
  );
}

const DONUT_COLORS = ["#2b6cff", "#8b5cf6", "#14b8a6", "#f59e0b"];

export function DonutChart({ data = [], centerLabel = "Accounts" }) {
  const c = useColors();
  const rows = (Array.isArray(data) ? data : []).map((x) => ({ label: x.label, value: Number(x.value || 0) }));
  const total = Math.max(0, rows.reduce((s, x) => s + x.value, 0));
  const shown = rows.length ? rows : [{ label: "None", value: 1 }];
  return (
    <div className="tw-donut-layout">
      <div style={{ position: "relative", width: "100%", maxWidth: 220 }}>
        <ResponsiveContainer width="100%" height={180}>
          <PieChart>
            <Tooltip {...tooltipStyle(c)} />
            <Pie data={shown} dataKey="value" nameKey="label" innerRadius={52} outerRadius={78} paddingAngle={2} strokeWidth={0}>
              {shown.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none" }}>
          <div style={{ textAlign: "center" }}>
            <b style={{ display: "block", fontSize: 22, color: c.text }}>{total}</b>
            <span style={{ fontSize: 12, color: c.textMuted }}>{centerLabel}</span>
          </div>
        </div>
      </div>
      <div className="tw-donut-legend">
        {rows.map((item, i) => (
          <div key={item.label}>
            <span style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
            <b>{item.label}</b>
            <em>{Number(item.value || 0).toLocaleString()}</em>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BarChart({ data = [], height = 180 }) {
  const c = useColors();
  const rows = (Array.isArray(data) ? data : []).map((x) => ({ label: x.label, value: Number(x.value || 0) }));
  return (
    <div style={{ minWidth: 0 }}>
      <ResponsiveContainer width="100%" height={height}>
        <RBarChart data={rows} margin={{ top: 18, right: 8, bottom: 0, left: -14 }} barCategoryGap="28%">
          <CartesianGrid strokeDasharray="3 3" stroke={c.border} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: c.textMuted }} interval={0} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: c.textMuted }} width={36} />
          <Tooltip {...tooltipStyle(c)} cursor={{ fill: `${c.accent}14` }} />
          <Bar dataKey="value" radius={[6, 6, 0, 0]} label={{ position: "top", fontSize: 12, fontWeight: 800, fill: c.text }}>
            {rows.map((_, i) => <Cell key={i} fill={i % 2 ? "#8b5cf6" : c.accent} />)}
          </Bar>
        </RBarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DualLineChart({ seriesA = [], seriesB = [], labels = [], labelA = "Live", labelB = "Assigned", height = 190 }) {
  const c = useColors();
  const a = (seriesA.length ? seriesA : [0]).map((v) => Number(v || 0));
  const b = (seriesB.length ? seriesB : [0]).map((v) => Number(v || 0));
  const count = Math.max(a.length, b.length, 1);
  const data = Array.from({ length: count }, (_, i) => ({ name: labels[i] ?? `#${i + 1}`, a: a[i] || 0, b: b[i] || 0 }));
  return (
    <div style={{ minWidth: 0 }}>
      <ResponsiveContainer width="100%" height={height}>
        <RLineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -14 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={c.border} vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: c.textMuted }} interval="preserveStartEnd" />
          <YAxis allowDecimals={false} tick={false} axisLine={false} tickLine={false} width={36} />
          <Tooltip {...tooltipStyle(c)} />
          <Line type="monotone" dataKey="a" name={labelA} stroke={c.accent} strokeWidth={3} dot={{ r: 3.5, fill: c.cardBg, stroke: c.accent, strokeWidth: 2.5 }} />
          <Line type="monotone" dataKey="b" name={labelB} stroke="#8b5cf6" strokeWidth={3} dot={{ r: 3.5, fill: c.cardBg, stroke: "#8b5cf6", strokeWidth: 2.5 }} />
        </RLineChart>
      </ResponsiveContainer>
      {!!labels.length && <div className="tw-chart-labels">{labels.map((label, i) => <span key={`${label}-${i}`}>{label}</span>)}</div>}
      <div className="tw-dual-line-legend">
        <span><i style={{ background: c.accent }} />{labelA}</span>
        <span><i style={{ background: "#8b5cf6" }} />{labelB}</span>
      </div>
    </div>
  );
}
