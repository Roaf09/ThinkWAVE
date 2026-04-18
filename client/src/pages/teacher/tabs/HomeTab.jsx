/* FILE GUIDE:
 * client/src/pages/teacher/tabs/HomeTab.jsx
 * Purpose: Teacher dashboard home/command center.
 * Tip: This page now mixes quick stats, attention items, continue cards, and recent session insights.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../../lib/api";
import { useColors } from "../../../context/ThemeContext";

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
  fontWeight: 700,
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
  const [loading, setLoading] = useState(true);
  const c = useColors();
  const navigate = useNavigate();

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const [sessionRes, quizRes, folderRes] = await Promise.all([
          api.get("/sessions/history"),
          api.get("/quizzes"),
          api.get("/classes"),
        ]);
        if (ignore) return;
        const sessionRows = sessionRes.data || [];
        const quizRows = quizRes.data || [];
        const folderRows = folderRes.data || [];
        setSessions(sessionRows);
        setQuizzes(quizRows);
        setFolders(folderRows);

        const topIds = sessionRows.slice(0, 3).map((row) => row.id);
        const analyticsEntries = await Promise.all(
          topIds.map(async (id) => {
            try {
              const { data } = await api.get(`/sessions/${id}/full-analytics`);
              return [id, data];
            } catch {
              return [id, null];
            }
          })
        );
        if (!ignore) setAnalyticsMap(Object.fromEntries(analyticsEntries));
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
  const attentionItems = useMemo(() => {
    const items = [];
    if (draftQuizzes.length) items.push(`${draftQuizzes.length} quiz${draftQuizzes.length === 1 ? "" : "zes"} still look like drafts and may need publishing.`);
    if (!folders.length) items.push("No folders created yet. Create one in Classes so finished reports have a clear destination.");
    if (!sessions.length) items.push("No completed sessions yet. Host your first live activity to start collecting analytics.");
    if (sessions.filter((s) => s.join_mode === "GROUP").length > 0) items.push("You have recent group sessions. Review analytics to check which groups struggled the most.");
    return items.slice(0, 4);
  }, [draftQuizzes.length, folders.length, sessions]);

  const lastEditedQuiz = quizzes[0] || null;
  const latestReport = recentSessions[0] || null;
  const lastBankedQuiz = banked[0] || null;

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
    <div className="container" style={{ display: "grid", gap: 18 }}>
      <section>
        <h2 style={{ marginBottom: 4, color: c.text }}>Home</h2>
        <p style={{ color: c.textMuted, marginTop: 0, fontSize: 14 }}>A quick teaching overview so you can decide what to open next.</p>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
        <SummaryCard c={c} label="Ready to Host" value={readyToHost.length} hint="Published or already active quizzes" accent={c.accent} />
        <SummaryCard c={c} label="Recent Sessions" value={recentSessions.length} hint="Your 5 most recent completed sessions" accent={c.greenFg} />
        <SummaryCard c={c} label="Quiz Bank" value={banked.length} hint="Reusable full quizzes saved for later" accent={c.yellowFg} />
        <SummaryCard c={c} label="Attention Needed" value={attentionItems.length} hint="Drafts, missing folders, or no recent sessions" accent={c.redFg} />
      </section>

      <section style={shellCard(c)}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 17, color: c.text }}>Continue where you left off</div>
            <div style={{ fontSize: 13, color: c.textMuted, marginTop: 4 }}>Shortcuts to the pages teachers usually reopen during busy class days.</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          <ContinueCard
            c={c}
            title={lastEditedQuiz?.title || "No quiz edits yet"}
            subtitle={lastEditedQuiz ? `${lastEditedQuiz.template_type} · ${lastEditedQuiz.category}` : "Create a quiz to keep working here later."}
            buttonLabel={lastEditedQuiz ? "Continue to Quiz Builder" : "Open Create"}
            onClick={() => lastEditedQuiz ? navigate(`/teacher/quizzes/${lastEditedQuiz.id}/builder`) : setActiveTab?.("create")}
          />
          <ContinueCard
            c={c}
            title={latestReport?.quiz_title || "No analytics opened yet"}
            subtitle={latestReport ? `Latest finished ${latestReport.join_mode === "GROUP" ? "group" : "solo"} session` : "Host a live session to start collecting reports."}
            buttonLabel={latestReport ? "Open Analytics" : "Open Live Sessions"}
            onClick={() => latestReport ? navigate(`/teacher/analytics/${latestReport.id}`) : setActiveTab?.("live")}
          />
          <ContinueCard
            c={c}
            title={lastBankedQuiz?.title || "No quiz bank item yet"}
            subtitle={lastBankedQuiz ? "Return to Quiz Bank and reuse this content later." : "Bank a finished quiz so it is ready for reuse."}
            buttonLabel={lastBankedQuiz ? "Open Quiz Bank" : "Open Live Sessions"}
            onClick={() => setActiveTab?.(lastBankedQuiz ? "bank" : "live")}
          />
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.3fr) minmax(280px, 0.9fr)", gap: 16 }}>
        <div style={shellCard(c)}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: 17, color: c.text }}>Recent sessions snapshot</div>
              <div style={{ fontSize: 13, color: c.textMuted, marginTop: 4 }}>Open a report quickly without digging through the history tab.</div>
            </div>
            <button style={actionBtn(c)} onClick={() => setActiveTab?.("history")}>Open Session History</button>
          </div>
          {recentSessions.length === 0 ? (
            <div style={{ color: c.textMuted, fontSize: 14 }}>No completed sessions yet. Your next finished session will appear here.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {recentSessions.map((session) => {
                const analytics = analyticsMap[session.id];
                return (
                  <div key={session.id} style={{ padding: 14, borderRadius: 14, border: `1px solid ${c.border}`, background: c.cardBg2, display: "grid", gap: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                      <div>
                        <div style={{ fontWeight: 800, color: c.text }}>{session.quiz_title}</div>
                        <div style={{ fontSize: 12, color: c.textMuted, marginTop: 4 }}>{new Date(session.ended_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}</div>
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <span style={pill(c)}>{session.join_mode === "GROUP" ? "Group" : "Solo"}</span>
                        <span style={pill(c)}>{session.participant_count} {session.join_mode === "GROUP" ? "groups" : "students"}</span>
                        {analytics && <span style={pill(c, { borderColor: c.greenBorder, background: c.greenBg, color: c.greenFg })}>Avg {analytics.summary?.avg_score ?? 0}</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                      <div style={{ color: c.textMuted, fontSize: 13 }}>
                        {session.question_count} questions · {analytics?.questions?.length ? `${Math.round(Number(analytics.questions[0]?.pct_correct || 0))}% correct on the first tracked item` : "Analytics ready to open"}
                      </div>
                      <button style={actionBtn(c, true)} onClick={() => navigate(`/teacher/analytics/${session.id}`)}>Open Analytics</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          <div style={shellCard(c)}>
            <div style={{ fontWeight: 900, fontSize: 17, color: c.text, marginBottom: 10 }}>Attention needed</div>
            {attentionItems.length === 0 ? (
              <div style={{ color: c.greenFg, fontWeight: 700, fontSize: 14 }}>Everything looks settled right now.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {attentionItems.map((item, idx) => (
                  <div key={idx} style={{ padding: "12px 13px", borderRadius: 13, background: c.cardBg2, border: `1px solid ${c.border}`, color: c.textMuted, fontSize: 13, lineHeight: 1.6 }}>{item}</div>
                ))}
              </div>
            )}
          </div>

          <div style={shellCard(c)}>
            <div style={{ fontWeight: 900, fontSize: 17, color: c.text, marginBottom: 10 }}>Performance highlights</div>
            {performanceHighlights.length === 0 ? (
              <div style={{ color: c.textMuted, fontSize: 14 }}>Recent analytics will surface smart highlights here after more completed sessions.</div>
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
        </div>
      </section>
    </div>
  );
}

function SummaryCard({ c, label, value, hint, accent }) {
  return (
    <div style={shellCard(c, { padding: 16 })}>
      <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: c.textSub, fontWeight: 800 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 900, color: accent || c.text, marginTop: 8 }}>{value}</div>
      <div style={{ fontSize: 12, color: c.textMuted, marginTop: 8, lineHeight: 1.5 }}>{hint}</div>
    </div>
  );
}

function ContinueCard({ c, title, subtitle, buttonLabel, onClick }) {
  return (
    <div style={{ padding: 16, borderRadius: 16, border: `1px solid ${c.border}`, background: c.cardBg2, display: "grid", gap: 12 }}>
      <div>
        <div style={{ fontWeight: 800, color: c.text, fontSize: 15 }}>{title}</div>
        <div style={{ color: c.textMuted, fontSize: 13, marginTop: 6, lineHeight: 1.55 }}>{subtitle}</div>
      </div>
      <button style={actionBtn(c, true)} onClick={onClick}>{buttonLabel}</button>
    </div>
  );
}
