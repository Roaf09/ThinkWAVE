import { templateCardChrome, templateLabel, templateTone } from "../../../../lib/templatePalette";
import { TwIcon } from "../../../../components/TwUI";
import { manilaDateTime } from "../../../../lib/dateFormat";
import { tabCard as card, solidModalBg } from "../teacherTabShared";

// Extracted verbatim from ClassesTab.jsx (no behavior change).
// iconBtn + modalBackdrop stay local (Classes-specific styling).
export function ReportPill({ c, tone, children }) {
  return <span className="inline-flex items-center gap-[6px] px-[10px] py-[5px] rounded-[999px] text-[12px] font-[850]" style={{ border: `1px solid ${tone?.border || c.border}`, background: tone?.softBg || c.cardBg2, color: tone?.accent || c.textMuted }}>{children}</span>;
}

export function reportDate(value) {
  if (!value) return "Report ready";
  const formatted = manilaDateTime(value, { dateStyle: "medium", timeStyle: "short" });
  return formatted || "Report ready";
}

export function AssignmentResultRow({ r, c, onAnalytics }) {
  const tone = templateTone(r.template_type, c, false);
  return <div className="tw-session-card tw-class-home-session-card grid gap-[10px] cursor-pointer" role="button" tabIndex={0} onClick={onAnalytics} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onAnalytics(); } }} style={{ ...templateCardChrome(r.template_type, c, false, { padding: 14, borderRadius: 14, borderWidth: 4, transition: "transform 220ms ease" }) }}>
    <div className="flex items-center justify-between gap-[12px] flex-wrap">
      <div><div className="font-[900]" style={{ color: c.text }}>{r.quiz_title}</div><div className="mt-[4px] text-[12px]" style={{ color: c.textMuted }}>{reportDate(r.available_until || r.available_from || r.created_at)}</div></div>
      <div className="flex gap-[8px] flex-wrap"><ReportPill c={c} tone={tone}>{templateLabel(r.template_type)}</ReportPill><ReportPill c={c}>Assignment</ReportPill><ReportPill c={c}>{r.submitted_count || 0} submitted</ReportPill></div>
    </div>
    <div className="flex items-center justify-between gap-[12px] flex-wrap">
      <div className="text-[13px]" style={{ color: c.textMuted }}>Assignment analytics and submissions are ready to review.</div>
      <button type="button" className="tw-analytics-text-link" onClick={(event) => { event.stopPropagation(); onAnalytics(); }}>Open Analytics</button>
    </div>
  </div>;
}

export function ClassReportCard({ session, c, onOpenLive, onOpenAssigned }) {
  const assigned = session.session_type === "ASSIGNED" || session.join_mode === "ASSIGNED";
  const tone = templateTone(session.template_type, c, false);
  const openReport = assigned ? onOpenAssigned : onOpenLive;
  return <div className="tw-session-card tw-class-home-session-card grid gap-[10px] cursor-pointer" role="button" tabIndex={0} onClick={openReport} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openReport(); } }} style={{ ...templateCardChrome(session.template_type, c, false, { padding: 14, borderRadius: 14, borderWidth: 4, transition: "transform 220ms ease" }) }}>
    <div className="flex items-center justify-between gap-[12px] flex-wrap">
      <div><div className="font-[900]" style={{ color: c.text }}>{session.quiz_title}</div><div className="mt-[4px] text-[12px]" style={{ color: c.textMuted }}>{reportDate(session.ended_at || session.available_until || session.started_at)}</div></div>
      <div className="flex gap-[8px] flex-wrap"><ReportPill c={c} tone={tone}>{templateLabel(session.template_type)}</ReportPill><ReportPill c={c}>{assigned ? "Assignment" : "Live session"}</ReportPill><ReportPill c={c}>{session.participant_count || 0} {assigned ? "submitted" : "participants"}</ReportPill></div>
    </div>
    <div className="flex items-center justify-between gap-[12px] flex-wrap">
      <div className="text-[13px]" style={{ color: c.textMuted }}>{session.question_count || 0} questions · Analytics ready to open</div>
      <button type="button" className="tw-analytics-text-link" onClick={(event) => { event.stopPropagation(); openReport(); }}>Open Analytics</button>
    </div>
  </div>;
}

export function ClassAnalyticsModal({ c, data, loading, mode, setMode, onClose }) {
  const stats = data?.stats || {};
  const trends = (data?.trends || []).filter((row) => row.mode === mode);
  return <div className="fixed inset-0 grid place-items-center p-[20px] bg-[rgba(0,0,0,.55)]" style={modalBackdrop} onMouseDown={onClose}>
    <div onMouseDown={(event) => event.stopPropagation()} className="tw-class-analytics-modal w-[min(96vw,1040px)] max-h-[92dvh] overflow-hidden" style={{ ...card(c, { background: solidModalBg(c), padding: 0, borderWidth: 3 }) }}>
      <div className="tw-class-modal-title tw-class-modal-sticky-head px-[22px] pt-[20px] pb-[14px]" style={{ marginBottom: 0, background: solidModalBg(c), borderBottom: `3px solid ${c.border}` }}><div><h3 className="m-0" style={{ color: c.text }}>Class Analytics</h3><p className="m-[4px_0_0]" style={{ color: c.textMuted }}>{data?.class?.name || "Selected class"}</p></div><button type="button" onClick={onClose} className="h-[34px] w-[34px] cursor-pointer rounded-[10px] border-0 bg-transparent font-[900]" style={iconBtn(c)}><TwIcon name="close" size={20}/></button></div>
      <div className="tw-class-analytics-scroll p-[22px]">
        {loading ? <div className="p-[24px]" style={{ color: c.textMuted }}>Loading analytics…</div> : <>
          <div className="tw-class-analytics-stats"><ClassStat c={c} label="Average participation" value={`${stats.average_participation || 0}%`} tone="blue" /><ClassStat c={c} label="Average completion" value={`${stats.average_completion || 0}%`} tone="green" /><ClassStat c={c} label="Students" value={stats.student_count || 0} tone="yellow" /></div>
          <div className="tw-class-analytics-filter"><button className={mode === "LIVE" ? "is-active" : ""} onClick={() => setMode("LIVE")}>Live</button><button className={mode === "ASSIGNED" ? "is-active" : ""} onClick={() => setMode("ASSIGNED")}>Assigned</button></div>
          <div className="mb-[8px] font-[900]" style={{ color: c.text }}>Performance trend</div>
          <div className="tw-class-trend-scroll" onWheel={(event) => { if (Math.abs(event.deltaY) > Math.abs(event.deltaX) && event.currentTarget.scrollWidth > event.currentTarget.clientWidth) { event.currentTarget.scrollLeft += event.deltaY; event.preventDefault(); } }} style={{ borderColor: c.border, background: c.cardBg2 }}>
            {trends.length ? <div className="tw-class-trend-chart">{trends.map((row) => <div className="tw-class-trend-item" key={`${row.mode}-${row.id}`}><div className="tw-class-trend-bar-zone"><span className="tw-class-trend-value">{Math.round(Number(row.performance || 0))}%</span><div className="tw-class-trend-bar" style={{ height: `${Math.max(3, Math.min(100, Number(row.performance || 0)))}%`, background: c.accent }} /></div><b title={row.title}>{row.title}</b><small>{row.mode === "LIVE" ? `${Math.round(Number(row.participation_rate || 0))}% participation` : `${Math.round(Number(row.completion_rate || 0))}% completion`}</small></div>)}</div> : <div className="p-[24px]" style={{ color: c.textMuted }}>No {mode === "LIVE" ? "live" : "assigned"} session data yet.</div>}
          </div>
        </>}
      </div>
    </div>
  </div>;
}

export function ClassStat({ c, label, value, tone = "blue" }) {
  const tones = {
    blue: { fg: c.accent, bg: `${c.accent}18`, border: c.accent },
    green: { fg: c.greenFg, bg: c.greenBg, border: c.greenBorder },
    yellow: { fg: c.yellowFg, bg: c.yellowBg, border: c.yellowBorder },
    red: { fg: c.redFg, bg: c.redBg, border: c.redBorder },
  };
  const t = tones[tone] || tones.blue;
  return <div className={`tw-class-stat-card is-${tone}`} style={{ border: `3px solid ${t.border}`, background: t.bg, color: c.text }}><span style={{ color: t.fg }}>{label}</span><b>{value}</b></div>;
}

export function StudentAnalyticsModal({ c, data, loading, onClose }) {
  const student = data?.student || {};
  const stats = data?.stats || {};
  const name = `${student.first_name || ""} ${student.last_name || ""}`.trim() || "Student";
  return <div className="fixed inset-0 grid place-items-center p-[20px] bg-[rgba(0,0,0,.55)]" style={modalBackdrop} onMouseDown={onClose}>
    <div onMouseDown={(event) => event.stopPropagation()} className="tw-class-student-analytics-modal w-[min(97vw,1080px)] max-h-[92dvh] overflow-hidden" style={{ ...card(c, { background: solidModalBg(c), padding: 0, borderWidth: 3 }) }}>
      <div className="tw-class-modal-title tw-class-modal-sticky-head px-[24px] pt-[20px] pb-[14px]" style={{ marginBottom: 0, background: solidModalBg(c), borderBottom: `3px solid ${c.border}` }}><div><h3 className="m-0" style={{ color: c.text }}>{name}</h3><p className="m-[4px_0_0]" style={{ color: c.textMuted }}>Student Analytics</p></div><button type="button" onClick={onClose} className="h-[34px] w-[34px] cursor-pointer rounded-[10px] border-0 bg-transparent font-[900]" style={iconBtn(c)}><TwIcon name="close" size={20}/></button></div>
      <div className="tw-class-analytics-scroll tw-student-analytics-scroll p-[24px]">
        {loading ? <div className="p-[24px]" style={{ color: c.textMuted }}>Loading student analytics…</div> : <>
          <div className="tw-student-stat-grid"><ClassStat c={c} label="Overall participation" value={`${stats.overall_participation || 0}%`} tone="blue" /><ClassStat c={c} label="Average score" value={`${stats.average_score || 0}%`} tone="green" /><ClassStat c={c} label="Live participation" value={`${stats.live_participation || 0}%`} tone="yellow" /><ClassStat c={c} label="Assignment completion" value={`${stats.assignment_completion || 0}%`} tone="blue" /><ClassStat c={c} label="Average answer time" value={`${stats.average_answer_time || 0}s`} tone="green" /><ClassStat c={c} label="Questions timed out" value={stats.questions_timed_out || 0} tone="red" /></div>
          <div className="tw-student-progress-list"><StudentProgress c={c} label="Overall participation" value={stats.overall_participation} /><StudentProgress c={c} label="Live participation" value={stats.live_participation} /><StudentProgress c={c} label="Assignment completion" value={stats.assignment_completion} /></div>
        </>}
      </div>
    </div>
  </div>;
}

export function StudentProgress({ c, label, value }) { const pct = Math.max(0, Math.min(100, Number(value || 0))); return <div><div className="tw-student-progress-label" style={{ color: c.text }}><b>{label}</b><span>{Math.round(pct)}%</span></div><div className="tw-student-progress-track" style={{ background: c.border }}><span style={{ width: `${pct}%`, background: c.accent }} /></div></div>; }

function iconBtn(c) { return { color: c.text }; }
const modalBackdrop = { zIndex: 2000 };
