/* FILE GUIDE:
 * client/src/pages/teacher/tabs/SessionHistoryTab.jsx
 * Purpose: Chronological archive of completed teacher sessions.
 * Tip: This page is now filterable and grouped by recency so history feels more useful than a plain list.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../../lib/api";
import { useColors } from "../../../context/ThemeContext";
import { templateCardChrome, templateLabel, templateTone } from "../../../lib/templatePalette";
import { TeacherPressButton, ThinkBotEmptyState } from "../TeacherUI";
import ThinkBotTutorial from "../../../components/ThinkBotTutorial";
import { readTutorialState, writeTutorialState } from "../../../lib/tutorialState";
import { manilaDateTime } from "../../../lib/dateFormat";

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

export default function SessionHistoryTab({ guestMode = false, tutorial }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [modeFilter, setModeFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState("recent");
  const [exporting, setExporting] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [historyTutorialStage, setHistoryTutorialStage] = useState(null);
  const c = useColors();
  const navigate = useNavigate();
  const hasActiveHistoryFilters = modeFilter !== "ALL" || sortBy !== "recent";
  const tutorialSessionId = tutorial?.userId ? Number(readTutorialState(tutorial.userId)?.tutorialDemoSessionId || 0) : 0;

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/sessions/history");
        {
          const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
          setSessions((data || []).filter((session) => {
            const endedAt = new Date(session?.ended_at || 0).getTime();
            return Number.isFinite(endedAt) && endedAt >= cutoff;
          }));
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (loading || guestMode || !tutorial?.userId || !sessions.length || historyTutorialStage) return;
    if (readTutorialState(tutorial.userId).historyTutorialSeen) return;
    setHistoryTutorialStage("intro");
  }, [loading, guestMode, tutorial?.userId, sessions.length, historyTutorialStage]);


  function finishHistoryTutorial() {
    if (tutorial?.userId) writeTutorialState(tutorial.userId, { historyTutorialSeen: true });
    setHistoryTutorialStage(null);
  }

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
      return new Date(b.sort_at || b.ended_at || 0).getTime() - new Date(a.sort_at || a.ended_at || 0).getTime();
    });
    return rows;
  }, [sessions, query, modeFilter, sortBy]);

  const grouped = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfWeek = startOfToday - 6 * 24 * 60 * 60 * 1000;
    return filtered.reduce((acc, session) => {
      const ts = new Date(session.sort_at || session.ended_at || 0).getTime();
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

  if (guestMode) {
    return <GuestHistoryView c={c} sessions={filtered} query={query} setQuery={setQuery} sortBy={sortBy} setSortBy={setSortBy} navigate={navigate} />;
  }

  return (
    <div className="container grid gap-[18px]">
      <section>
        <h2 className="mb-[4px]" style={{ color: c.text }}>Session History</h2>
      </section>

      {sessions.length > 0 && <section className="tw-bank-search-shell" style={{ ...card(c), position: "relative", overflow: "visible" }}>
        <div className="tw-search-filter-row">
          <input
            className="tw-history-search-field tw-search-filter-input w-full box-border px-[14px] py-[12px] rounded-[12px]"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by quiz title, template, or category"
            style={{ border: `1px solid ${c.inputBorder}`, background: c.inputBg, color: c.text }}
          />
          <TeacherPressButton type="button" tone="neutral" icon="filter" className={`tw-filter-toggle-btn${filterOpen ? " is-selected" : ""}${hasActiveHistoryFilters ? " has-active-filters" : ""}`} onClick={() => setFilterOpen((v) => !v)}>Filter</TeacherPressButton>
        </div>
        {filterOpen && <div className="tw-filter-panel" style={{ ...card(c), position: "absolute", top: "calc(100% + 8px)", right: 12, left: 12, zIndex: 40, display: "grid", gap: 14 }}>
          <div className="tw-filter-panel-group">
            <label className="block text-[11px] font-[900] uppercase tracking-[0.06em] mb-[6px]" style={{ color: c.textMuted }}>Session type</label>
            <select value={modeFilter} onChange={(e) => setModeFilter(e.target.value)} className="w-full box-border px-[14px] py-[12px] rounded-[12px]" style={{ border: `1px solid ${c.inputBorder}`, background: c.inputBg, color: c.text }}>
              <option value="ALL">All sessions</option>
              <option value="LIVE">Live session</option>
              <option value="ASSIGNED">Assigned session</option>
            </select>
          </div>
          <div className="tw-filter-panel-group">
            <label className="block text-[11px] font-[900] uppercase tracking-[0.06em] mb-[6px]" style={{ color: c.textMuted }}>Sort by</label>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="w-full box-border px-[14px] py-[12px] rounded-[12px]" style={{ border: `1px solid ${c.inputBorder}`, background: c.inputBg, color: c.text }}>
              <option value="recent">Newest first</option>
              <option value="score">Highest average</option>
              <option value="title">Title A–Z</option>
            </select>
          </div>
        </div>}
      </section>}

      {sessions.length === 0 ? (
        <ThinkBotEmptyState c={c} title="You have not done any sessions yet." />
      ) : filtered.length === 0 ? (
        <div style={card(c)}>No session history matches your current filters.</div>
      ) : (
        Object.entries(grouped).map(([group, rows]) => (
          <section key={group} className="grid gap-[12px]">
            <div className="font-[900] text-[16px]" style={{ color: c.text }}>{group}</div>
            {rows.map((session) => {
              const insight = buildInsight(session);
              const displayParticipantCount = !isAssignedSession(session) && Number(session.id) === tutorialSessionId
                ? Math.max(3, Number(session.participant_count || 0))
                : Number(session.participant_count || 0);
              return (
                <div key={`${session.session_type || "LIVE"}-${session.id}`} data-tutorial="history-record" className="tw-history-session-card" style={{ ...card(c), ...templateCardChrome(session.template_type, c, false), borderWidth: 4 }}>
                  <div className="grid gap-[14px]">
                    <div className="flex justify-between items-start gap-[14px] flex-wrap">
                      <div>
                        <div className="font-[900] text-[16px]" style={{ color: c.text }}>{session.quiz_title}</div>
                        <div className="text-[13px] mt-[6px]" style={{ color: c.textMuted }}>{manilaDateTime(session.ended_at, { dateStyle: "medium", timeStyle: "short" })}</div>
                      </div>
                      <div className="flex gap-[8px] flex-wrap">
                        <span style={badge(c, { borderColor: templateTone(session.template_type, c, false).border, background: templateTone(session.template_type, c, false).softBg, color: templateTone(session.template_type, c, false).accent })}>{templateLabel(session.template_type)}</span>
                        <span style={badge(c)}>{isAssignedSession(session) ? "Assigned session" : "Live session"}</span>
                        <span style={badge(c)}>{displayParticipantCount} {isAssignedSession(session) ? "submitted" : session.join_mode === "GROUP" ? "groups" : "participants"}</span>
                        <span style={badge(c)}>{session.avg_score ?? 0} avg</span>
                        <span style={badge(c)}>{session.top_score ?? 0} top</span>
                      </div>
                    </div>

                    <div className="tw-history-mini-grid grid gap-[10px]" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
                      <MiniInfo label="Template" value={templateLabel(session.template_type)} c={c} />
                      <MiniInfo label="Category" value={session.category} c={c} />
                      <MiniInfo label="Questions" value={session.question_count} c={c} />
                      <MiniInfo label={isAssignedSession(session) ? "Submitted" : session.join_mode === "GROUP" ? "Groups" : "Participants"} value={displayParticipantCount} c={c} />
                    </div>

                    <div className="px-[13px] py-[12px] rounded-[14px] text-[13px] leading-[1.6]" style={{ background: c.cardBg2, border: `1px solid ${c.border}`, color: c.textMuted }}>
                      <strong style={{ color: c.text }}>Session insight:</strong> {insight}
                      {session.below_50_count !== undefined && <div className="tw-history-advanced-insights">
                        <span><b style={{ color: c.text }}>{session.below_50_count || 0}</b> participants scored below 50% in this session.</span>
                        {session.insight_question_no && session.insight_question_accuracy !== null && session.insight_question_accuracy !== undefined && <span><b style={{ color: c.text }}>Q{session.insight_question_no}</b> - {session.insight_question_accuracy}% accuracy</span>}
                      </div>}
                    </div>

                    <div className="tw-history-actions-row">
                      <TeacherPressButton
                        tone="blue"
                        onClick={() => navigate(isAssignedSession(session)
                          ? `/teacher/async-analytics/${session.class_id}/${session.quiz_id}`
                          : `/teacher/analytics/${session.id}`)}
                      >Open Analytics</TeacherPressButton>
                      <span className="tw-history-export-actions">
                        <span className="tw-history-export-text">
                          <TeacherPressButton tone="neutral" disabled={exporting === `${session.id}:pdf`} onClick={() => download(session, "pdf")}>{exporting === `${session.id}:pdf` ? "Exporting…" : "PDF"}</TeacherPressButton>
                          <TeacherPressButton tone="neutral" disabled={exporting === `${session.id}:xlsx`} onClick={() => download(session, "xlsx")}>{exporting === `${session.id}:xlsx` ? "Exporting…" : "XLSX"}</TeacherPressButton>
                        </span>
                        <span className="tw-history-export-icons">
                          <button type="button" className="tw-history-export-icon-btn" aria-label="Export PDF" title="Export PDF" disabled={exporting === `${session.id}:pdf`} onClick={() => download(session, "pdf")}>PDF</button>
                          <button type="button" className="tw-history-export-icon-btn" aria-label="Export Excel" title="Export Excel" disabled={exporting === `${session.id}:xlsx`} onClick={() => download(session, "xlsx")}>XLSX</button>
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </section>
        ))
      )}
      {historyTutorialStage === "intro" && <ThinkBotTutorial clickAnywhere onClickAnywhere={() => setHistoryTutorialStage("records")}><p>Every completed activity leaves a record here in <strong>History</strong>.</p></ThinkBotTutorial>}
      {historyTutorialStage === "records" && <ThinkBotTutorial target='[data-tutorial="history-record"]' clickAnywhere onClickAnywhere={() => finishHistoryTutorial()}><p>You can find your previous live sessions and assignments here without searching through your classes.</p></ThinkBotTutorial>}
    </div>
  );
}


function GuestHistoryView({ c, sessions, query, setQuery, sortBy, setSortBy, navigate }) {
  return <div className="container grid gap-[18px]">
    <section><h2 className="mb-[4px]" style={{ color: c.text }}>History</h2></section>
    {sessions.length > 0 && <section className="grid grid-cols-[minmax(220px,1.3fr)_minmax(150px,.7fr)] gap-[12px]" style={{ ...card(c) }}>
      <input className="tw-history-search-field w-full box-border px-[14px] py-[12px] rounded-[12px]" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search sessions" style={{ border: `1px solid ${c.inputBorder}`, background: c.inputBg, color: c.text }} />
      <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="w-full box-border px-[14px] py-[12px] rounded-[12px]" style={{ border: `1px solid ${c.inputBorder}`, background: c.inputBg, color: c.text }}><option value="recent">Newest first</option><option value="title">Title A–Z</option><option value="score">Highest average</option></select>
    </section>}
    {!sessions.length ? <ThinkBotEmptyState c={c} title="You have not done any sessions yet." /> : sessions.map((session) => {
      const tone = templateTone(session.template_type, c, false);
      async function reuseGuestQuiz() {
        try {
          await api.post(`/quizzes/${session.quiz_id}/reuse`, {});
          alert("Quiz sent back to Sessions.");
        } catch (e) {
          alert(e?.response?.data?.message || "Failed to reuse quiz.");
        }
      }
      return <div key={session.id} style={{ ...card(c), ...templateCardChrome(session.template_type, c, false) }}>
        <div className="flex justify-between items-start gap-[14px] flex-wrap">
          <div><div className="font-[900] text-[17px]" style={{ color: c.text }}>{session.quiz_title}</div><div className="text-[13px] mt-[6px]" style={{ color: c.textMuted }}>{manilaDateTime(session.ended_at, { dateStyle: "medium", timeStyle: "short" })}</div></div>
          <span style={badge(c, { borderColor: tone.border, background: tone.softBg, color: tone.accent })}>{templateLabel(session.template_type)}</span>
        </div>
        <div className="grid grid-cols-[repeat(2,minmax(150px,1fr))] gap-[10px] mt-[14px]"><MiniInfo label="Template" value={templateLabel(session.template_type)} c={c} /><MiniInfo label="Participants" value={session.participant_count || 0} c={c} /></div>
        <div className="mt-[14px] flex gap-[10px] flex-wrap"><TeacherPressButton tone="blue" onClick={() => navigate(`/guest/analytics/${session.id}`)}>Open Analytics</TeacherPressButton><TeacherPressButton tone="neutral" onClick={reuseGuestQuiz}>Reuse</TeacherPressButton></div>
      </div>;
    })}
  </div>;
}

function MiniInfo({ label, value, c }) {
  return (
    <div className="px-[12px] py-[11px] rounded-[14px]" style={{ background: c.cardBg2, border: `1px solid ${c.border}` }}>
      <div className="text-[11px] uppercase tracking-[0.08em] font-[800]" style={{ color: c.textSub }}>{label}</div>
      <div className="mt-[6px] font-[800]" style={{ color: c.text }}>{value}</div>
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
