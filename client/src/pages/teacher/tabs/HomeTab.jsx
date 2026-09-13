/* FILE GUIDE:
 * client/src/pages/teacher/tabs/HomeTab.jsx
 * Purpose: Teacher dashboard home/command center.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../../lib/api";
import { useColors, useTheme } from "../../../context/ThemeContext";
import { EmptyState, TwIcon } from "../../../components/TwUI";
import { TeacherMetricCard, TeacherPressButton } from "../TeacherUI";
import { templateCardChrome, templateLabel, templateTone } from "../../../lib/templatePalette";
import { manilaDateTime } from "../../../lib/dateFormat";

const shellCard = (c, extra = {}) => ({
  background: c.cardBg,
  border: `3px solid ${c.border}`,
  boxShadow: c.pageBg === "#eef2ff" ? "0 16px 34px rgba(43,108,255,0.08)" : "0 16px 34px rgba(0,0,0,0.14)",
  transition: "background 0.3s, border-color 0.3s, transform 0.25s, box-shadow 0.3s",
  ...extra,
});

const pill = (c, extra = {}) => ({
  background: c.cardBg2,
  border: `1px solid ${c.border}`,
  color: c.text,
  ...extra,
});

const actionBtn = (c, primary = false) => ({
  padding: primary ? "10px 14px" : "9px 13px",
  border: `1px solid ${primary ? c.accent : c.border}`,
  background: primary ? c.accent : c.cardBg2,
  color: primary ? "#fff" : c.text,
});

export default function HomeTab({ setActiveTab }) {
  const [sessions, setSessions] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [folders, setFolders] = useState([]);
  const [analyticsMap, setAnalyticsMap] = useState({});
  const [submissionStats, setSubmissionStats] = useState([]);
  const [me, setMe] = useState(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const c = useColors();
  const { dark } = useTheme();
  const navigate = useNavigate();

  async function loadDashboard() {
    const [sessionRes, quizRes, folderRes, meRes] = await Promise.all([
      api.get("/sessions/history"),
      api.get("/quizzes"),
      api.get("/classes"),
      api.get("/auth/me").catch(() => ({ data: null })),
    ]);
    const sessionRows = sessionRes.data || [];
    const quizRows = quizRes.data || [];
    const folderRows = folderRes.data || [];
    setSessions(sessionRows);
    setQuizzes(quizRows);
    setFolders(folderRows);
    setMe(meRes.data || null);

    const topLiveIds = sessionRows.filter((row) => row.session_type !== "ASSIGNED").slice(0, 3).map((row) => row.id);
    const analyticsEntries = await Promise.all(
      topLiveIds.map(async (id) => {
        try {
          const { data } = await api.get(`/sessions/${id}/full-analytics`);
          return [id, data];
        } catch {
          return [id, null];
        }
      })
    );
    setAnalyticsMap(Object.fromEntries(analyticsEntries));

    const statBatches = await Promise.all(
      folderRows.map(async (folder) => {
        try {
          const { data } = await api.get(`/classes/${folder.id}/async-results`);
          return (data || []).map((row) => ({ ...row, class_id: folder.id, class_name: folder.name }));
        } catch {
          return [];
        }
      })
    );
    setSubmissionStats(statBatches.flat().filter((row) => { const due=row.available_until?new Date(row.available_until).getTime():Infinity; return Number(row.submitted_count || 0) > 0 && due > Date.now()-86400000; }));
  }

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        await loadDashboard();
      } catch (e) {
        console.error(e);
      } finally {
        if (!ignore) setLoading(false);
      }
    })();
    return () => { ignore = true; };
  }, []);

  const recentSessions = sessions.slice(0, 2);
  const draftQuizzes = quizzes.filter((q) => q.status !== "BANKED" && q.status !== "PUBLISHED");
  // This mirrors the actual cards available on the Sessions tab.
  const readyToHost = quizzes.filter((q) => q.status === "PUBLISHED" && q.delivery_mode !== "ASYNCHRONOUS");
  // Count section folders only and deduplicate sections with the same class name
  // when they appear under more than one subject folder.
  const classesHandled = new Set(
    folders
      .filter((folder) => Number(folder.parent_id || 0) > 0)
      .map((folder) => String(folder.name || "").trim().toLowerCase())
      .filter(Boolean)
  ).size;
  const sentAssignments = quizzes.filter((q) => q.delivery_mode === "ASYNCHRONOUS").length;
  const warningCount = quizzes.filter((q) => q.status !== "PUBLISHED" || !q.class_id).length;
  const banked = quizzes.filter((q) => q.status === "BANKED");
  const teacherInstitution = me?.institution_name || me?.institutionName || "";
  const scrollStats = submissionStats.length > 3;

  const performanceHighlights = useMemo(() => {
    const values = Object.values(analyticsMap).filter(Boolean);
    if (!values.length) return [];
    const latest = values[0];
    const hardestQuestion = values
      .flatMap((entry) => entry?.questions || [])
      .sort((a, b) => Number(a.pct_correct ?? 100) - Number(b.pct_correct ?? 100))[0];
    const strongestSession = values
      .map((entry) => ({ title: entry?.session?.quiz_title || "Recent session", avg: Number(entry?.summary?.avg_score || 0) }))
      .sort((a, b) => b.avg - a.avg)[0];
    return [
      { label: "Latest average", value: `${latest?.summary?.avg_score ?? 0}`, hint: latest?.session?.quiz_title || "Most recent session" },
      { label: "Most difficult item", value: hardestQuestion ? `Q${Number(hardestQuestion.question_order || 0) + 1}` : "—", hint: hardestQuestion?.prompt || "No question insight yet" },
      { label: "Best recent result", value: strongestSession ? `${strongestSession.avg}` : "—", hint: strongestSession?.title || "No recent session" },
    ];
  }, [analyticsMap]);

  if (loading) {
    return <div className="container"><div className="tw-home-performance-shell rounded-[18px] p-[18px]" style={shellCard(c)}>Loading your dashboard…</div></div>;
  }

  return (
    <>
      <div className="container grid gap-[18px]">
        <section>
          <h2 className="mb-[4px]" style={{ color: c.text }}>Home</h2>
        </section>

        <section className="tw-home-top-grid grid gap-[16px] items-stretch grid-cols-[minmax(180px,250px)_minmax(300px,1fr)]">
          <div className="tw-home-quick-metrics grid gap-[14px]">
            <TeacherMetricCard icon="live" label="Ready to Host" value={readyToHost.length} hint="Quizzes currently available in Sessions" tone="blue" onClick={() => setActiveTab?.("live")} />
            <TeacherMetricCard icon="warning" label="Warnings" value={warningCount} hint="Draft quizzes or items needing setup" tone="orange" />
          </div>

          <div className="tw-home-overview-shell rounded-[18px] p-[18px] grid gap-[16px]" style={shellCard(c)}>
            <div className="flex items-start justify-between gap-[14px] flex-wrap">
              <div>
                <div className="font-[950] text-[19px]" style={{ color: c.text }}>Teacher overview</div>
                {teacherInstitution ? (
                  <div className="mt-[8px] text-[18px] flex items-center gap-[10px]" style={{ color: c.textMuted }}><span className="inline-flex" style={{ color: dark ? "#ffffff" : "#000000", transition: "color .16s ease" }}><TwIcon name="classes" size={29}/></span><b className="text-[21px]" style={{ color: c.text }}>{teacherInstitution}</b></div>
                ) : (
                  <div className="mt-[6px] text-[14px]" style={{ color: c.textMuted }}>You are not part of any institution yet. <button onClick={() => setInviteOpen(true)} className="border-0 bg-transparent font-[950] cursor-pointer p-0" style={{ color: c.accent }}>Join.</button></div>
                )}
              </div>
            </div>

            <div className="tw-mini-info-grid grid gap-[10px] grid-cols-[repeat(auto-fit,minmax(155px,1fr))]">
              <MiniInfo c={c} label="Class Handled" value={classesHandled} tone="red" onClick={() => setActiveTab?.("classes")} />
              <MiniInfo c={c} label="Sent Assignments" value={sentAssignments} tone="blue" onClick={() => setActiveTab?.("live")} />
              <MiniInfo c={c} label="Draft quizzes" value={draftQuizzes.length} tone="green" onClick={() => setActiveTab?.("live")} />
              <MiniInfo c={c} label="Banked quizzes" value={banked.length} tone="yellow" onClick={() => setActiveTab?.("bank")} />
            </div>

            <div>
              <div className="text-[12px] uppercase tracking-[.08em] font-[900] mb-[10px]" style={{ color: c.textSub }}>Assigned work submissions</div>
              {submissionStats.length === 0 ? (
                <EmptyState c={c} icon="chart" title="No assigned submissions yet" message="Submission updates from assigned quizzes will appear here." compact />
              ) : (
                <div className="tw-submission-scroll grid gap-[9px]" style={{ maxHeight: scrollStats ? 222 : "none", overflowY: scrollStats ? "auto" : "visible", paddingRight: scrollStats ? 6 : 0 }}>
                  {submissionStats.map((row) => {
                    const rowTone = templateTone(row.template_type, c, false);
                    return <div key={`${row.class_id}-${row.quiz_id}`} className="px-[15px] py-[18px] min-h-[68px] flex items-center rounded-[14px] text-[13px] leading-[1.5] font-[850]" style={{ border: `3px solid ${rowTone.border}`, background: rowTone.softBg, color: rowTone.accent }}>
                      {Number(row.submitted_count || 0)} {Number(row.submitted_count || 0) === 1 ? "student" : "students"} from {row.class_name} have submitted their answers on {row.quiz_title}
                    </div>;
                  })}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="tw-home-mid-grid grid gap-[16px] grid-cols-[minmax(0,1.3fr)_minmax(280px,0.9fr)]">
          <div className="rounded-[18px] p-[18px]" style={shellCard(c)}>
            <div className="flex items-center justify-between gap-[12px] flex-wrap mb-[12px]">
              <div>
                <div className="font-[900] text-[17px]" style={{ color: c.text }}>Recent Sessions</div>
              </div>
              <TeacherPressButton tone="blue" onClick={() => setActiveTab?.("history")}>Open History</TeacherPressButton>
            </div>
            {recentSessions.length === 0 ? (
              <EmptyState c={c} icon="history" title="No completed sessions yet" message="Your next finished live or assigned session will appear here with a quick report shortcut." />
            ) : (
              <div className="tw-session-card-grid grid gap-[10px]">
                {recentSessions.map((session) => <SessionCard key={`${session.session_type || "LIVE"}-${session.id}`} session={session} analytics={analyticsMap[session.id]} c={c} navigate={navigate} />)}
              </div>
            )}
          </div>

          <div className="tw-home-performance rounded-[18px] p-[18px]" style={shellCard(c)}>
            <div className="font-[900] text-[17px] mb-[10px]" style={{ color: c.text }}>Performance highlights</div>
            {performanceHighlights.length === 0 ? (
              <EmptyState c={c} icon="chart" title="No highlights yet" message="Recent analytics will surface smart highlights here after more completed live sessions." compact />
            ) : (
              <div className="grid gap-[10px]">
                {performanceHighlights.map((item) => (
                  <div key={item.label} className="p-[12px] rounded-[14px]" style={{ border: `3px solid ${c.border}`, background: c.cardBg2 }}>
                    <div className="text-[12px] uppercase tracking-[0.08em] font-[800]" style={{ color: c.textSub }}>{item.label}</div>
                    <div className="text-[24px] font-[900] mt-[6px]" style={{ color: c.text }}>{item.value}</div>
                    <div className="text-[12px] mt-[6px] leading-[1.5]" style={{ color: c.textMuted }}>{item.hint}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {inviteOpen && <InvitationModal c={c} onClose={() => setInviteOpen(false)} onJoined={async () => { await loadDashboard(); setInviteOpen(false); }} />}
    </>
  );
}

function SessionCard({ session, analytics, c, navigate }) {
  const tone = templateTone(session.template_type, c, false);
  const assigned = session.session_type === "ASSIGNED" || session.join_mode === "ASSIGNED";
  const goToAnalytics = () => navigate(assigned ? `/teacher/async-analytics/${session.class_id}/${session.quiz_id}` : `/teacher/analytics/${session.id}`);
  return (
    <div
      className="tw-session-card grid gap-[10px] p-[14px] rounded-[14px] cursor-pointer"
      role="button"
      tabIndex={0}
      onClick={goToAnalytics}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); goToAnalytics(); } }}
      style={{ ...templateCardChrome(session.template_type, c, false, { borderWidth: 4, transition: "transform 220ms ease" }) }}
    >
      {/* Desktop layout - hidden on mobile, replaced by the compact square below */}
      <div className="tw-session-card-desktop-row flex items-center justify-between gap-[12px] flex-wrap">
        <div>
          <div className="font-[900]" style={{ color: c.text }}>{session.quiz_title}</div>
          <div className="text-[12px] mt-[4px]" style={{ color: c.textMuted }}>{manilaDateTime(session.ended_at || session.available_until || session.started_at, { dateStyle: "medium", timeStyle: "short" })}</div>
        </div>
        <div className="flex gap-[8px] flex-wrap">
          <span className="inline-flex items-center gap-[6px] px-[10px] py-[5px] rounded-[999px] text-[12px] font-[800]" style={pill(c, { borderColor: tone.border, background: tone.softBg, color: tone.accent })}>{templateLabel(session.template_type)}</span>
          <span className="inline-flex items-center gap-[6px] px-[10px] py-[5px] rounded-[999px] text-[12px] font-[800]" style={pill(c)}>{assigned ? "Assigned session" : "Live session"}</span>
          <span className="inline-flex items-center gap-[6px] px-[10px] py-[5px] rounded-[999px] text-[12px] font-[800]" style={pill(c)}>{session.participant_count} {assigned ? "submitted" : session.join_mode === "GROUP" ? "groups" : "students"}</span>
          {analytics && <span className="inline-flex items-center gap-[6px] px-[10px] py-[5px] rounded-[999px] text-[12px] font-[800]" style={pill(c, { borderColor: c.greenBorder, background: c.greenBg, color: c.greenFg })}>Avg {analytics.summary?.avg_score ?? 0}</span>}
        </div>
      </div>
      <div className="tw-session-card-desktop-row flex items-center justify-between gap-[12px] flex-wrap">
        <div className="text-[13px]" style={{ color: c.textMuted }}>
          {session.question_count || 0} questions · {assigned ? `${session.avg_score ?? 0} average score` : analytics?.questions?.length ? `${Math.round(Number(analytics.questions[0]?.pct_correct || 0))}% correct on the first tracked item` : "Analytics ready to open"}
        </div>
        <button type="button" className="tw-analytics-text-link" onClick={(event) => { event.stopPropagation(); goToAnalytics(); }}>Open Analytics</button>
      </div>

      {/* Mobile layout - compact square card, title + question count + participants only */}
      <div className="tw-session-card-mobile-square">
        <div className="tw-session-card-mobile-title" style={{ color: c.text }}>{session.quiz_title}</div>
        <div className="tw-session-card-mobile-meta" style={{ color: c.textMuted }}><TwIcon name="chart" size={13} /> {session.question_count || 0} questions</div>
        <div className="tw-session-card-mobile-meta" style={{ color: c.textMuted }}><TwIcon name="student" size={13} /> {session.participant_count || 0} {assigned ? "submitted" : "participants"}</div>
      </div>
    </div>
  );
}

function MiniInfo({ c, label, value, tone = "blue", onClick }) {
  const tones = {
    red: { fg: c.redFg || "#dc2626", bg: c.redBg || "rgba(239,68,68,.12)", border: c.redBorder || "rgba(239,68,68,.5)" },
    blue: { fg: c.accent || "#2b6cff", bg: `${c.accent || "#2b6cff"}18`, border: `${c.accent || "#2b6cff"}88` },
    green: { fg: c.greenFg || "#16a34a", bg: c.greenBg || "rgba(34,197,94,.12)", border: c.greenBorder || "rgba(34,197,94,.5)" },
    yellow: { fg: c.yellowFg || "#ca8a04", bg: c.yellowBg || "rgba(234,179,8,.14)", border: c.yellowBorder || "rgba(234,179,8,.55)" },
  };
  const t = tones[tone] || tones.blue;
  const clickable = typeof onClick === "function";
  return (
    <div
      className={`tw-mini-info-card is-${tone}${clickable ? " is-clickable" : ""} p-[12px] rounded-[14px]`}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? onClick : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      style={{ background: t.bg, border: `3px solid ${t.border}`, cursor: clickable ? "pointer" : "default" }}
    >
      <div className="text-[11px] uppercase tracking-[.08em] font-[900]" style={{ color: t.fg }}>{label}</div>
      <div className="font-[950] text-[22px] mt-[5px]" style={{ color: c.text }}>{value}</div>
    </div>
  );
}


function InvitationModal({ c, onClose, onJoined }) {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("idle");
  const [msg, setMsg] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg("");
    setStatus("loading");
    try {
      await api.post("/admin-dashboard/join-institution", { code: code.trim().toUpperCase() });
      setStatus("success");
      await onJoined?.();
    } catch (err) {
      setMsg(err?.response?.data?.message || "Invalid or expired code.");
      setStatus("error");
    }
  }

  return (
    <div className="fixed inset-0 grid place-items-center p-[20px] bg-[rgba(0,0,0,.55)]" style={modalBackdrop}>
      <section className="rounded-[18px] p-[18px] w-[min(94vw,520px)] relative" style={shellCard(c, { background: c.cardBg })}>
        <button type="button" onClick={onClose} className="absolute right-[14px] top-[14px] rounded-[12px] text-[13px] font-[800] cursor-pointer" style={{ ...actionBtn(c) }}>×</button>
        <form onSubmit={handleSubmit} className="grid gap-[14px]">
          <div>
            <div className="font-[900] text-[18px] mb-[6px]" style={{ color: c.text }}>Enter Invitation Code</div>
            <div className="text-[13px] leading-[1.6]" style={{ color: c.textMuted }}>Once accepted, your teacher account will be linked to the institution that owns the code.</div>
          </div>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="e.g. ABCD1234"
            maxLength={12}
            className="w-full box-border px-[16px] py-[14px] rounded-[14px] text-[22px] font-[800] text-center tracking-[0.15em]"
            style={{ border: `1px solid ${c.inputBorder}`, background: c.inputBg, color: c.text }}
          />
          {msg && <div className="px-[12px] py-[10px] rounded-[12px] text-[13px]" style={{ background: c.redBg, border: `1px solid ${c.redBorder}`, color: c.redFg }}>{msg}</div>}
          <button type="submit" disabled={status === "loading" || !code.trim()} className="px-[16px] py-[13px] rounded-[14px] border-0 font-[900] text-white" style={{ background: c.accent, cursor: status === "loading" ? "wait" : "pointer", opacity: !code.trim() ? 0.7 : 1 }}>
            {status === "loading" ? "Joining…" : "Join Institution"}
          </button>
        </form>
      </section>
    </div>
  );
}

const modalBackdrop = { zIndex: 2000, backdropFilter: "blur(6px)" };
