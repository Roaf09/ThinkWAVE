/* FILE GUIDE:
 * client/src/pages/teacher/tabs/HomeTab.jsx
 * Purpose: Teacher dashboard home/command center.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../../lib/api";
import { useColors } from "../../../context/ThemeContext";
import { EmptyState, IconBubble, StatCard, TwIcon } from "../../../components/TwUI";
import { templateCardChrome, templateLabel, templateTone } from "../../../lib/templatePalette";

const shellCard = (c, extra = {}) => ({
  background: c.cardBg,
  border: `1px solid ${c.border}`,
  borderRadius: 18,
  padding: 18,
  boxShadow: c.pageBg === "#eef2ff" ? "0 16px 34px rgba(43,108,255,0.08)" : "0 16px 34px rgba(0,0,0,0.14)",
  transition: "background 0.3s, border-color 0.3s, transform 0.25s, box-shadow 0.3s",
  ...extra,
});

const pill = (c, extra = {}) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "5px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 800,
  background: c.cardBg2,
  border: `1px solid ${c.border}`,
  color: c.text,
  ...extra,
});

const actionBtn = (c, primary = false) => ({
  padding: primary ? "10px 14px" : "9px 13px",
  borderRadius: 12,
  border: `1px solid ${primary ? c.accent : c.border}`,
  background: primary ? c.accent : c.cardBg2,
  color: primary ? "#fff" : c.text,
  fontWeight: 800,
  fontSize: 13,
  cursor: "pointer",
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
    setSubmissionStats(statBatches.flat().filter((row) => Number(row.submitted_count || 0) > 0));
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

  const recentSessions = sessions.slice(0, 5);
  const draftQuizzes = quizzes.filter((q) => q.status !== "BANKED" && q.status !== "PUBLISHED");
  const readyToHost = quizzes.filter((q) => q.status === "PUBLISHED" || q.status === "IN_SESSION");
  const banked = quizzes.filter((q) => q.status === "BANKED");
  const lastEditedQuiz = quizzes[0] || null;
  const latestReport = recentSessions.find((session) => session.session_type !== "ASSIGNED") || null;
  const lastBankedQuiz = banked[0] || null;
  const teacherInstitution = me?.institution_name || me?.institutionName || "";
  const scrollStats = submissionStats.length > 4;

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
    return <div className="container"><div style={shellCard(c)}>Loading your dashboard…</div></div>;
  }

  return (
    <>
      <div className="container" style={{ display: "grid", gap: 18 }}>
        <section>
          <h2 style={{ marginBottom: 4, color: c.text }}>Home</h2>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "minmax(180px, 250px) minmax(300px, 1fr)", gap: 16, alignItems: "stretch" }}>
          <div style={{ display: "grid", gap: 14 }}>
            <StatCard c={c} icon="live" label="Ready to Host" value={readyToHost.length} hint="Published or already active quizzes" tone="blue" accent={c.accent} />
            <StatCard c={c} icon="history" label="Recent Sessions" value={recentSessions.length} hint="Latest live and assigned records" tone="green" accent={c.greenFg} />
          </div>

          <div style={shellCard(c, { display: "grid", gap: 16 })}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontWeight: 950, fontSize: 19, color: c.text }}>Teacher overview</div>
                {teacherInstitution ? (
                  <div style={{ color: c.textMuted, marginTop: 6, fontSize: 14 }}>Institution: <b style={{ color: c.text }}>{teacherInstitution}</b></div>
                ) : (
                  <div style={{ color: c.textMuted, marginTop: 6, fontSize: 14 }}>You are not part of any institution yet. <button onClick={() => setInviteOpen(true)} style={{ border: 0, background: "transparent", color: c.accent, fontWeight: 950, cursor: "pointer", padding: 0 }}>Join.</button></div>
                )}
              </div>
              <IconBubble name={teacherInstitution ? "teacher" : "invitation"} c={c} size={48} iconSize={24} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))", gap: 10 }}>
              <MiniInfo c={c} label="Class folders" value={folders.length} />
              <MiniInfo c={c} label="Draft quizzes" value={draftQuizzes.length} />
              <MiniInfo c={c} label="Banked quizzes" value={banked.length} />
            </div>

            <div>
              <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".08em", color: c.textSub, fontWeight: 900, marginBottom: 10 }}>Assigned quiz submissions</div>
              {submissionStats.length === 0 ? (
                <EmptyState c={c} icon="chart" title="No assigned submissions yet" message="Submission updates from assigned quizzes will appear here." compact />
              ) : (
                <div style={{ display: "grid", gap: 9, maxHeight: scrollStats ? 238 : "none", overflowY: scrollStats ? "auto" : "visible", paddingRight: scrollStats ? 6 : 0 }}>
                  {submissionStats.map((row) => (
                    <div key={`${row.class_id}-${row.quiz_id}`} style={{ padding: "11px 12px", borderRadius: 14, border: `1px solid ${c.border}`, background: c.cardBg2, color: c.text, fontSize: 13, lineHeight: 1.5, fontWeight: 800 }}>
                      {Number(row.submitted_count || 0)} {Number(row.submitted_count || 0) === 1 ? "student" : "students"} from {row.class_name} have submitted their answers on {row.quiz_title}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        <section style={shellCard(c)}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: 17, color: c.text }}>Continue where you left off</div>
            </div>
            <IconBubble name="spark" c={c} size={44} iconSize={22} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            <ContinueCard
              c={c}
              title={lastEditedQuiz?.title || "No quiz edits yet"}
              subtitle={lastEditedQuiz ? `${templateLabel(lastEditedQuiz.template_type)} · ${lastEditedQuiz.category}` : "Create a quiz to keep working here later."}
              buttonLabel={lastEditedQuiz ? "Continue to Quiz Builder" : "Open Create"}
              onClick={() => lastEditedQuiz ? navigate(`/teacher/quizzes/${lastEditedQuiz.id}/builder`) : setActiveTab?.("create")}
              templateType={lastEditedQuiz?.template_type}
            />
            {latestReport && (
              <ContinueCard
                c={c}
                title={latestReport.quiz_title}
                subtitle={`Latest finished ${latestReport.join_mode === "GROUP" ? "group" : "solo"} session`}
                buttonLabel="Open Analytics"
                onClick={() => navigate(`/teacher/analytics/${latestReport.id}`)}
                templateType={latestReport.template_type}
              />
            )}
            <ContinueCard
              c={c}
              title={lastBankedQuiz?.title || "No quiz bank item yet"}
              subtitle={lastBankedQuiz ? "Return to Quiz Bank and reuse this content later." : "Bank a finished quiz so it is ready for reuse."}
              buttonLabel={lastBankedQuiz ? "Open Quiz Bank" : "Open Live Sessions"}
              onClick={() => setActiveTab?.(lastBankedQuiz ? "bank" : "live")}
              templateType={lastBankedQuiz?.template_type}
            />
          </div>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.3fr) minmax(280px, 0.9fr)", gap: 16 }}>
          <div style={shellCard(c)}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 17, color: c.text }}>Recent sessions snapshot</div>
              </div>
              <button style={actionBtn(c)} onClick={() => setActiveTab?.("history")}>Open Session History</button>
            </div>
            {recentSessions.length === 0 ? (
              <EmptyState c={c} icon="history" title="No completed sessions yet" message="Your next finished live or assigned session will appear here with a quick report shortcut." />
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {recentSessions.map((session) => <SessionCard key={`${session.session_type || "LIVE"}-${session.id}`} session={session} analytics={analyticsMap[session.id]} c={c} navigate={navigate} setActiveTab={setActiveTab} />)}
              </div>
            )}
          </div>

          <div style={shellCard(c)}>
            <div style={{ fontWeight: 900, fontSize: 17, color: c.text, marginBottom: 10 }}>Performance highlights</div>
            {performanceHighlights.length === 0 ? (
              <EmptyState c={c} icon="chart" title="No highlights yet" message="Recent analytics will surface smart highlights here after more completed live sessions." compact />
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {performanceHighlights.map((item) => (
                  <div key={item.label} style={{ padding: 12, borderRadius: 14, border: `1px solid ${c.border}`, background: c.cardBg2 }}>
                    <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: c.textSub, fontWeight: 800 }}>{item.label}</div>
                    <div style={{ fontSize: 24, fontWeight: 900, color: c.text, marginTop: 6 }}>{item.value}</div>
                    <div style={{ fontSize: 12, color: c.textMuted, marginTop: 6, lineHeight: 1.5 }}>{item.hint}</div>
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

function SessionCard({ session, analytics, c, navigate, setActiveTab }) {
  const tone = templateTone(session.template_type, c, false);
  const assigned = session.session_type === "ASSIGNED" || session.join_mode === "ASSIGNED";
  return (
    <div className="tw-session-card" style={{ ...templateCardChrome(session.template_type, c, false, { padding: 14, borderRadius: 14, display: "grid", gap: 10, transition: "transform 220ms ease" }) }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 900, color: c.text }}>{session.quiz_title}</div>
          <div style={{ fontSize: 12, color: c.textMuted, marginTop: 4 }}>{new Date(session.ended_at || session.available_until || session.started_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span style={pill(c, { borderColor: tone.border, background: tone.softBg, color: tone.accent })}>{templateLabel(session.template_type)}</span>
          <span style={pill(c)}>{assigned ? "Assigned session" : "Live session"}</span>
          <span style={pill(c)}>{session.participant_count} {assigned ? "submitted" : session.join_mode === "GROUP" ? "groups" : "students"}</span>
          {analytics && <span style={pill(c, { borderColor: c.greenBorder, background: c.greenBg, color: c.greenFg })}>Avg {analytics.summary?.avg_score ?? 0}</span>}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ color: c.textMuted, fontSize: 13 }}>
          {session.question_count || 0} questions · {assigned ? `${session.avg_score ?? 0} average score` : analytics?.questions?.length ? `${Math.round(Number(analytics.questions[0]?.pct_correct || 0))}% correct on the first tracked item` : "Analytics ready to open"}
        </div>
        <button style={actionBtn(c, true)} onClick={() => assigned ? setActiveTab?.("history") : navigate(`/teacher/analytics/${session.id}`)}>{assigned ? "Open History" : "Open Analytics"}</button>
      </div>
    </div>
  );
}

function MiniInfo({ c, label, value }) {
  return (
    <div style={{ padding: 12, borderRadius: 14, background: c.cardBg2, border: `1px solid ${c.border}` }}>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: c.textSub, fontWeight: 900 }}>{label}</div>
      <div style={{ color: c.text, fontWeight: 950, fontSize: 22, marginTop: 5 }}>{value}</div>
    </div>
  );
}

function ContinueCard({ c, title, subtitle, buttonLabel, onClick, templateType }) {
  const chrome = templateType ? templateCardChrome(templateType, c, false) : {};
  return (
    <div className="tw-continue-card" style={{ padding: 16, borderRadius: 16, border: `1px solid ${c.border}`, background: c.cardBg2, display: "grid", gap: 12, ...chrome }}>
      <div>
        <div style={{ fontWeight: 900, color: c.text, fontSize: 15 }}>{title}</div>
        <div style={{ color: c.textMuted, fontSize: 13, marginTop: 6, lineHeight: 1.55 }}>{subtitle}</div>
      </div>
      <button style={actionBtn(c, true)} onClick={onClick}>{buttonLabel}</button>
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
    <div style={modalBackdrop}>
      <section style={shellCard(c, { width: "min(94vw, 520px)", background: c.cardBg, position: "relative" })}>
        <button type="button" onClick={onClose} style={{ position: "absolute", right: 14, top: 14, ...actionBtn(c) }}>×</button>
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 18, color: c.text, marginBottom: 6 }}>Enter Invitation Code</div>
            <div style={{ color: c.textMuted, fontSize: 13, lineHeight: 1.6 }}>Once accepted, your teacher account will be linked to the institution that owns the code.</div>
          </div>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="e.g. ABCD1234"
            maxLength={12}
            style={{ width: "100%", boxSizing: "border-box", padding: "14px 16px", borderRadius: 14, border: `1px solid ${c.inputBorder}`, background: c.inputBg, color: c.text, fontSize: 22, fontWeight: 800, textAlign: "center", letterSpacing: "0.15em" }}
          />
          {msg && <div style={{ padding: "10px 12px", borderRadius: 12, background: c.redBg, border: `1px solid ${c.redBorder}`, color: c.redFg, fontSize: 13 }}>{msg}</div>}
          <button type="submit" disabled={status === "loading" || !code.trim()} style={{ padding: "13px 16px", borderRadius: 14, border: "none", background: c.accent, color: "#fff", fontWeight: 900, cursor: status === "loading" ? "wait" : "pointer", opacity: !code.trim() ? 0.7 : 1 }}>
            {status === "loading" ? "Joining…" : "Join Institution"}
          </button>
        </form>
      </section>
    </div>
  );
}

const modalBackdrop = { position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", display: "grid", placeItems: "center", padding: 20, zIndex: 2000, backdropFilter: "blur(6px)" };
