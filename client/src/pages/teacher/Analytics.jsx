/* Revision 10.4: restores the two-column advanced analytics layout, smooth student/question
 * transitions, and synchronized percentage/student-count toggles. */
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { useColors, useTheme } from "../../context/ThemeContext";
import { templateLabel, templateTone } from "../../lib/templatePalette";
import { isInstitutionPlan } from "../../lib/planLimits";
import { normalizeTemplateType } from "../../lib/templateTypes";
import { TwIcon } from "../../components/TwUI";
import ThemeIconButton from "../../components/ThemeIconButton";
import { TeacherPressButton } from "./TeacherUI";
import ThinkBotTutorial from "../../components/ThinkBotTutorial";
import { readTutorialState, writeTutorialState } from "../../lib/tutorialState";
import { getSessionBackground } from "../../lib/sessionBackgrounds";

export default function Analytics({ guestMode = false }) {
  const { sessionId, classId, quizId } = useParams();
  const assigned = Boolean(classId && quizId);
  const navigate = useNavigate();
  const colors = useColors();
  const { dark, toggleTheme } = useTheme();
  const C = useMemo(() => palette(colors, dark), [colors, dark]);
  const [analytics, setAnalytics] = useState(null);
  const [tabMonitoring, setTabMonitoring] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [advancedPlan, setAdvancedPlan] = useState(false);
  const [exporting, setExporting] = useState("");
  const [expandedStudentId, setExpandedStudentId] = useState(null);
  const [tutorialUserId, setTutorialUserId] = useState(null);
  const [analyticsTutorialStage, setAnalyticsTutorialStage] = useState(null);
  const [tutorialStudentOpened, setTutorialStudentOpened] = useState(false);
  const [tutorialStudentNextReady, setTutorialStudentNextReady] = useState(false);
  const [tutorialDemoAnalytics, setTutorialDemoAnalytics] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    (async () => {
      try {
        const meResponse = await api.get("/auth/me");
        const uid = meResponse?.data?.id || meResponse?.data?.user?.id || null;
        const hasAdvanced = isInstitutionPlan(meResponse.data) && !guestMode;
        if (!alive) return;
        setTutorialUserId(uid);
        setAdvancedPlan(hasAdvanced);
        if (assigned) {
          const { data } = await api.get(`/classes/${classId}/async-results/${quizId}/analytics`);
          if (!alive) return;
          setAnalytics(data || null);
          setTabMonitoring([]);
        } else {
          const analyticsResponse = await api.get(`/sessions/${sessionId}/full-analytics`);
          const tutorialState = uid ? readTutorialState(uid) : {};
          const isTutorialDemo = !guestMode && Number(tutorialState?.tutorialDemoSessionId) === Number(sessionId);
          let analyticsData = analyticsResponse.data || null;
          let tabs = [];
          if (isTutorialDemo) {
            let sourceQuestions = analyticsData?.questions || [];
            if (!sourceQuestions.some((question) => question?.config_json || question?.correct_json)) {
              try {
                const stateResponse = await api.get(`/sessions/${sessionId}/state`);
                sourceQuestions = stateResponse?.data?.questions || sourceQuestions;
              } catch { /* keep the analytics payload if session state is unavailable */ }
            }
            analyticsData = buildTutorialDemoAnalytics(analyticsData, sourceQuestions);
            tabs = buildTutorialDemoTabs();
          } else {
            tabs = Array.isArray(analyticsData?.tabMonitoring) ? analyticsData.tabMonitoring : [];
          }
          if (!alive) return;
          setTutorialDemoAnalytics(isTutorialDemo);
          setAnalytics(analyticsData);
          setTabMonitoring(tabs);
          if (!guestMode && uid && !tutorialState.analyticsTutorialSeen) setAnalyticsTutorialStage("intro");
        }
      } catch (err) {
        if (alive) setError(err?.response?.data?.message || "Unable to load analytics.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [assigned, classId, quizId, sessionId, guestMode]);

  useEffect(() => {
    if (analyticsTutorialStage !== "students" || expandedStudentId === null) return;
    setTutorialStudentOpened(true);
  }, [analyticsTutorialStage, expandedStudentId]);

  useEffect(() => {
    if (analyticsTutorialStage !== "students" || !tutorialStudentOpened) {
      setTutorialStudentNextReady(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setTutorialStudentNextReady(true), 5000);
    return () => window.clearTimeout(timer);
  }, [analyticsTutorialStage, tutorialStudentOpened]);

  useEffect(() => {
    if (analyticsTutorialStage !== "questions") return undefined;
    const timer = window.setTimeout(() => {
      document.querySelector('[data-tutorial="analytics-question-results"]')?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [analyticsTutorialStage]);

  function finishAnalyticsTutorial() {
    if (tutorialUserId) writeTutorialState(tutorialUserId, { analyticsTutorialSeen: true });
    setAnalyticsTutorialStage(null);
  }

  const session = analytics?.session || {};
  const tone = templateTone(session.template_type, colors, dark);
  const analyticsBackground = getSessionBackground(session.background_key);
  const analyticsPageStyle = analyticsBackground
    ? {
        minHeight: "100vh",
        paddingBottom: 40,
        backgroundColor: colors.pageBg,
        backgroundImage: `linear-gradient(${dark ? "rgba(4,12,32,.58)" : "rgba(238,242,255,.48)"}, ${dark ? "rgba(4,12,32,.58)" : "rgba(238,242,255,.48)"}), url("${analyticsBackground.src}")`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
      }
    : { minHeight: "100vh", background: colors.pageBg, paddingBottom: 40 };
  const showAdvanced = true;
  const scores = useMemo(() => buildScores(analytics, showAdvanced), [analytics, showAdvanced]);
  const exportAllowed = advancedPlan || guestMode;
  const exportBase = assigned ? `/classes/${classId}/async-results/${quizId}/export` : `/analytics/sessions/${sessionId}/export`;

  async function downloadExport(format) {
    setExporting(format);
    try {
      const response = await api.get(`${exportBase}/${format}`, { responseType: "blob" });
      const type = format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      const url = URL.createObjectURL(new Blob([response.data], { type }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${guestMode ? "guest-session" : assigned ? "assigned-session" : "session"}-${sessionId || quizId}.${format}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(downloadError?.response?.data?.message || "Unable to export analytics.");
    } finally { setExporting(""); }
  }

  function openClassAnalytics() {
    const targetClassId = Number(classId || session.class_id || 0) || null;
    navigate("/teacher", { state: { tab: "classes", classId: targetClassId, openClassAnalytics: !!targetClassId } });
  }

  return <div className="tw-analytics-page" style={analyticsPageStyle}><div className="container tw-analytics-container-wide">
    <div style={{ display: "grid", gap: 18 }}>
      <section className="tw-analytics-card" style={{ ...card(C), overflow: "hidden", position: "relative" }}>
        <div style={{ position: "absolute", inset: "0 0 auto 0", height: 5, background: tone.accent }} />
        <div className="tw-analytics-title-row">
          <h2 className="tw-analytics-quiz-title" style={{ color: C.text }}>{session.quiz_title || (assigned ? `Assigned Quiz #${quizId}` : `Session #${sessionId}`)}</h2>
          <TeacherPressButton tone="blue" className="tw-analytics-back-press" onClick={() => navigate(-1)}>Back</TeacherPressButton>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 14, flexWrap: "wrap", marginTop: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div className="tw-analytics-badges-row" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ ...pill(C), color: tone.accent, borderColor: tone.border, background: tone.softBg }}>{templateLabel(session.template_type)}</span>
              <span style={pill(C)}>{assigned ? "Assigned session" : session.join_mode === "GROUP" ? "Group live session" : "Solo live session"}</span>
            </div>
            <div style={{ marginTop: 8, color: C.muted, fontSize: 13, fontWeight: 750, lineHeight: 1.6 }}>{guestMode ? formatDate(session.display_date) : <>{assigned ? "Assigned Session Analytics" : "Session Analytics"} · {session.folder_name || session.class_name || "Unassigned"} · {formatDate(session.display_date)}</>}</div>
          </div>
          {exportAllowed && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {advancedPlan && (classId || session.class_id) && <TeacherPressButton type="button" tone="blue" icon="classes" onClick={openClassAnalytics}>Class Analytics</TeacherPressButton>}
            <TeacherPressButton type="button" tone="neutral" disabled={!!exporting} onClick={() => downloadExport("pdf")}>{exporting === "pdf" ? "Exporting…" : "PDF"}</TeacherPressButton>
            <TeacherPressButton type="button" tone="neutral" disabled={!!exporting} onClick={() => downloadExport("xlsx")}>{exporting === "xlsx" ? "Exporting…" : "Excel"}</TeacherPressButton>
          </div>}
        </div>
      </section>

      {error && <div style={{ ...card(C), borderColor: C.redBorder, color: C.redFg, background: C.redBg, fontWeight: 800 }}>{error}</div>}

      <section className="tw-analytics-card" data-tutorial="analytics-performance" style={card(C)}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 10, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, color: C.text, fontWeight: 950, display: "flex", alignItems: "center", gap: 9 }}><TwIcon name="trophy" size={21} /> Performance Overview</h3>
          <ParticipantBadges analytics={analytics} assigned={assigned} guestMode={guestMode} C={C} tone={tone} />
        </div>
        {loading ? <div style={{ color: C.muted, textAlign: "center", padding: 42, fontWeight: 850 }}>Loading analytics…</div> : showAdvanced ? (
          <div className="tw-analytics-advanced-layout">
            <Scoreboard C={C} scores={scores} tone={tone} analytics={analytics || {}} tabMonitoring={tabMonitoring} expandedStudentId={expandedStudentId} setExpandedStudentId={setExpandedStudentId} />
            <AdvancedAnalyticsPanel C={C} analytics={analytics || {}} assigned={assigned} tone={tone} />
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: guestMode ? "repeat(auto-fit, minmax(300px, 1fr))" : "1fr", gap: 18, alignItems: "start" }}>
            {guestMode && <Scoreboard C={C} scores={scores} tone={tone} analytics={analytics || {}} expandedStudentId={null} setExpandedStudentId={() => {}} basic />}
            <BasicAnalyticsPanel C={C} analytics={analytics || {}} assigned={assigned} tone={tone} />
          </div>
        )}
      </section>
    </div>
    {analyticsTutorialStage === "intro" && (
      <ThinkBotTutorial accentColor={tone.accent} placement="center" square clickAnywhere onClickAnywhere={() => setAnalyticsTutorialStage("overview")}>
        <p><strong>Session complete!</strong></p>
        <p>Now let’s see how your class did.</p>
      </ThinkBotTutorial>
    )}
    {analyticsTutorialStage === "overview" && (
      <ThinkBotTutorial accentColor={tone.accent} target='[data-tutorial="analytics-performance"]' placement="screen-left" square clickAnywhere allowTargetInteraction={false} onClickAnywhere={() => setAnalyticsTutorialStage("summary")}>
        <p>The <strong>Performance Overview</strong> gives you a quick picture of how the class performed overall.</p>
      </ThinkBotTutorial>
    )}
    {analyticsTutorialStage === "summary" && (
      <ThinkBotTutorial accentColor={tone.accent} target='[data-tutorial="analytics-summary"]' placement="left" square clickAnywhere allowTargetInteraction={false} onClickAnywhere={() => setAnalyticsTutorialStage(showAdvanced && scores.length ? "students" : "questions")}>
        <p>These cards summarize the most important results from the session.</p>
      </ThinkBotTutorial>
    )}
    {analyticsTutorialStage === "students" && <ThinkBotTutorial accentColor={tone.accent} target='[data-tutorial="analytics-students"]' placement="right" square actionLabel={tutorialStudentNextReady ? "Next" : undefined} onAction={() => { setExpandedStudentId(null); setAnalyticsTutorialStage("questions"); }}><p>Students are listed here in order of highest to lowest.</p><p>Select a student whenever you want to look more closely at their performance.</p></ThinkBotTutorial>}
    {analyticsTutorialStage === "questions" && (
      <ThinkBotTutorial accentColor={tone.accent} target='[data-tutorial="analytics-question-results"]' placement="screen-left" square dialogWidth={390} highlightMode="target" actionLabel="Finish" actionDelay={3000} onAction={finishAnalyticsTutorial}>
        <p>Expanding a question shows the complete question, its answer choices, and how the class responded.</p>
      </ThinkBotTutorial>
    )}

    <ThemeIconButton dark={dark} onClick={toggleTheme} className="tw-landing-fixed-theme tw-analytics-theme" size={22} />
  </div></div>;
}

function ParticipantBadges({ analytics, assigned, guestMode, C, tone }) {
  const summary = analytics?.summary || {};
  const total = Number(summary.participant_count ?? analytics?.students?.length ?? 0);
  const guests = Number(summary.guest_count || 0);
  const students = Number(summary.student_count || Math.max(0, total - guests));
  if (guestMode) return <span style={{ ...pill(C), color: tone.accent, borderColor: tone.border, background: tone.softBg }}>{total} participants</span>;
  if (assigned) return null;
  return <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
    <span style={{ ...pill(C), color: tone.accent, borderColor: tone.border, background: tone.softBg }}>{students} students</span>
    {guests > 0 && <span style={pill(C)}>{guests} guests</span>}
  </div>;
}

function Scoreboard({ C, scores, tone, analytics, tabMonitoring = [], expandedStudentId, setExpandedStudentId, basic = false }) {
  if (!scores.length) return <div style={emptyCard(C)}>No scores have been submitted yet.</div>;
  const visibleScores = !basic && expandedStudentId !== null
    ? scores.map((score, index) => ({ score, index })).filter(({ score }) => Number(score.participant_id) === Number(expandedStudentId))
    : scores.map((score, index) => ({ score, index }));
  return <div className={`tw-analytics-scoreboard${!basic && expandedStudentId !== null ? " has-expanded-student" : ""}`} data-tutorial="analytics-students" style={{ display: "grid", gap: 10 }}>
    {visibleScores.map(({ score, index }) => {
      const expanded = !basic && Number(expandedStudentId) === Number(score.participant_id);
      const student = (analytics.students || []).find((row) => Number(row.participant_id) === Number(score.participant_id));
      const tabRow = (tabMonitoring || []).find((row) => Number(row.participant_id) === Number(score.participant_id));
      const tabOutCount = Number(tabRow?.tab_out_count ?? student?.tab_out_count ?? 0);
      return <article key={score.key} className={`tw-analytics-student-card${expanded ? " is-expanded" : ""}`} style={{ borderColor: index === 0 ? tone.border : C.border, background: index === 0 ? tone.softBg : C.cardBg2, color: C.text }}>
        <button type="button" className="tw-analytics-student-button" disabled={basic} onClick={() => !basic && setExpandedStudentId(expanded ? null : score.participant_id)} aria-expanded={expanded}>
          <span className="tw-analytics-student-identity"><RankIcon rank={index + 1} /><span className="tw-analytics-student-name">{score.label}</span>{student?.participant_type === "GUEST" && <span style={{ ...pill(C), padding: "3px 7px", fontSize: 10 }}>Guest</span>}</span>
          <span className="tw-analytics-tab-out-badge" style={{ ...pill(C), color: tabOutCount > 0 ? C.redFg : C.muted, borderColor: tabOutCount > 0 ? C.redBorder : C.border, background: tabOutCount > 0 ? C.redBg : C.cardBg }}>{tabOutCount} tab out</span>
          <span className="tw-analytics-student-points" style={{ color: tone.accent }}>{score.total_points} pts {!basic && <TwIcon name={expanded ? "chevronUp" : "chevronDown"} size={16} />}</span>
        </button>
        {!basic && student && <div className={`tw-student-analytics-collapse${expanded ? " is-open" : ""}`} aria-hidden={!expanded}><div><StudentQuestionAnalytics C={C} tone={tone} templateType={analytics?.session?.template_type} student={student} questions={analytics.questions || []} /></div></div>}
      </article>;
    })}
  </div>;
}

function RankIcon({ rank }) {
  if (rank > 3) return <span style={{ width: 28, textAlign: "center", fontWeight: 950 }}>#{rank}</span>;
  const colors = { 1: "#d4a500", 2: "#9ca3af", 3: "#b87333" };
  return <span title={`Top ${rank}`} style={{ width: 28, display: "inline-grid", placeItems: "center", color: colors[rank] }}><TwIcon name="trophy" size={23} strokeWidth={2.6} /></span>;
}

function BasicAnalyticsPanel({ C, analytics, assigned, tone }) {
  const summary = analytics.summary || {};
  const students = analytics.students || [];
  const questions = analytics.questions || [];
  const joinMode = analytics?.session?.join_mode || "SOLO";
  return <div style={{ display: "grid", gap: 16 }}>
    <div data-tutorial="analytics-summary" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))", gap: 10 }}>
      <MetricCard C={C} tone={tone} label="Average" value={summary.avg_score ?? 0} /><MetricCard C={C} tone={tone} label="Lowest" value={summary.min_score ?? 0} /><MetricCard C={C} tone={tone} label="Highest" value={summary.max_score ?? 0} /><MetricCard C={C} tone={tone} label={assigned ? "Submitted" : joinMode === "GROUP" ? "Groups" : "Submitted"} value={summary.participant_count ?? students.length} />
    </div>
    <div style={subCard(C)}><div style={sectionTitle(C)}>Attendance</div><div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{students.map((student) => <StudentChip key={student.participant_id} name={`${student.first_name || ""} ${student.last_name || ""}`.trim()} C={C} />)}{!students.length && <span style={{ color: C.muted }}>No submitted students yet.</span>}</div></div>
    <div data-tutorial="analytics-question-results" style={subCard(C)}><div style={sectionTitle(C)}>Per-question Results</div><LegacyQuestionRows C={C} tone={tone} questions={questions} /></div>
  </div>;
}

function AdvancedAnalyticsPanel({ C, analytics, assigned, tone }) {
  const summary = analytics.summary || {};
  const questions = analytics.questions || [];
  const tt = normalizeTemplateType(analytics?.session?.template_type);
  return <div className="tw-analytics-detail-column" style={{ display: "grid", gap: 16 }}>
    <div className="tw-analytics-metrics-grid" data-tutorial="analytics-summary">
      <MetricCard C={C} tone={tone} label="Average" value={summary.avg_score ?? 0} /><MetricCard C={C} tone={tone} label="Lowest" value={summary.min_score ?? 0} /><MetricCard C={C} tone={tone} label="Highest" value={summary.max_score ?? 0} /><MetricCard C={C} tone={tone} label={assigned ? "Submissions" : "Participants"} value={summary.participant_count ?? 0} />
    </div>
    <QuestionAnalytics C={C} tone={tone} templateType={tt} questions={questions} />
  </div>;
}

function LegacyQuestionRows({ C, tone, questions }) {
  return <div style={{ display: "grid", gap: 10 }}>{questions.map((question, index) => <div key={question.question_id || index} style={{ display: "grid", gridTemplateColumns: "minmax(46px, auto) minmax(150px, 1fr) repeat(2, minmax(92px, auto))", gap: 10, alignItems: "center", padding: "11px 12px", borderRadius: 14, background: C.cardBg, border: `1px solid ${C.border}` }}><span style={{ color: tone.accent, fontWeight: 950 }}>Q{index + 1}</span><span style={{ color: C.text, fontWeight: 750, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{question.prompt || "Untitled question"}</span><ResultBadge C={C} kind="correct" pct={question.pct_correct} count={question.correct_answers} /><ResultBadge C={C} kind="wrong" pct={question.pct_incorrect} count={question.incorrect_answers} /></div>)}{!questions.length && <div style={emptyCard(C)}>No question-level results are available yet.</div>}</div>;
}

function QuestionAnalytics({ C, tone, templateType, questions }) {
  const tt = normalizeTemplateType(templateType);
  const [expandedIndex, setExpandedIndex] = useState(null);
  const [batchIndex, setBatchIndex] = useState(0);
  const [batchExpanded, setBatchExpanded] = useState(false);
  const [showCounts, setShowCounts] = useState(false);
  const batchMode = tt === "MATCHING" || tt === "THINK_SPELL";
  const toggleCounts = (event) => { event?.stopPropagation?.(); setShowCounts((value) => !value); };
  if (!questions.length) return <div className="tw-analytics-results-card" data-tutorial="analytics-question-results" style={subCard(C)}><div style={sectionTitle(C)}>{batchMode ? "Per-batch Results" : "Per-question Results"}</div><div style={emptyCard(C)}>No question-level results are available yet.</div></div>;

  if (batchMode) {
    const index = Math.min(batchIndex, questions.length - 1);
    const question = questions[index];
    return <div className="tw-analytics-results-card tw-analytics-batch-results" data-tutorial="analytics-question-results" style={subCard(C)}>
      <div style={{ ...sectionTitle(C), display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>Per-batch Results</span>
        <span style={{ display: "flex", gap: 7 }}><ArrowButton C={C} direction="left" disabled={index <= 0} onClick={() => { setBatchExpanded(false); setBatchIndex((v) => Math.max(0, v - 1)); }} /><ArrowButton C={C} direction="right" disabled={index >= questions.length - 1} onClick={() => { setBatchExpanded(false); setBatchIndex((v) => Math.min(questions.length - 1, v + 1)); }} /></span>
      </div>
      <div className={`tw-analytics-question-card tw-analytics-batch-card${batchExpanded ? " is-expanded" : ""}`} style={{ background: C.cardBg, borderColor: C.border, color: C.text }}>
        <div role="button" tabIndex={0} className="tw-analytics-question-toggle" aria-expanded={batchExpanded} onClick={() => setBatchExpanded((value) => !value)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setBatchExpanded((value) => !value); } }}>
          <span style={{ color: tone.accent, fontWeight: 950 }}>B{index + 1}</span>
          <span className="tw-analytics-question-prompt">{question.prompt || "Untitled batch"}</span>
          <span className="tw-analytics-summary-badges"><ResultBadge C={C} kind="correct" pct={question.pct_correct} count={question.correct_answers} toggle showCount={showCounts} onToggle={toggleCounts} /><ResultBadge C={C} kind="wrong" pct={question.pct_incorrect} count={question.incorrect_answers} toggle showCount={showCounts} onToggle={toggleCounts} /></span>
          <TwIcon name={batchExpanded ? "chevronUp" : "chevronDown"} size={18} />
        </div>
        <div className={`tw-analytics-question-collapse${batchExpanded ? " is-open" : ""}`} aria-hidden={!batchExpanded}><div><BatchDetail C={C} tone={tone} tt={tt} question={question} index={index} showCounts={showCounts} onToggleCounts={toggleCounts} /></div></div>
      </div>
    </div>;
  }

  return <div className="tw-analytics-results-card" data-tutorial="analytics-question-results" style={subCard(C)}>
    <div style={sectionTitle(C)}>Per-question Results</div>
    <div className={`tw-analytics-question-list${expandedIndex !== null ? " has-expanded" : ""}`}>{questions.map((question, index) => {
      const expanded = expandedIndex === index;
      const hidden = expandedIndex !== null && !expanded;
      return <div key={question.question_id || index} data-tutorial={index === 0 ? "analytics-question-card" : undefined} aria-hidden={hidden ? "true" : undefined} className={`tw-analytics-question-card${expanded ? " is-expanded" : ""}${hidden ? " is-hidden" : ""}`} style={{ background: C.cardBg, borderColor: C.border, color: C.text }}>
        <div role="button" className="tw-analytics-question-toggle" aria-expanded={expanded} tabIndex={hidden ? -1 : 0} onClick={() => !hidden && setExpandedIndex(expanded ? null : index)} onKeyDown={(event) => { if (!hidden && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); setExpandedIndex(expanded ? null : index); } }}>
          <span style={{ color: tone.accent, fontWeight: 950 }}>Q{index + 1}</span>
          <span className="tw-analytics-question-prompt">{question.prompt || "Untitled question"}</span>
          <span className="tw-analytics-summary-badges"><ResultBadge C={C} kind="correct" pct={question.pct_correct} count={question.correct_answers} toggle showCount={showCounts} onToggle={toggleCounts} /><ResultBadge C={C} kind="wrong" pct={question.pct_incorrect} count={question.incorrect_answers} toggle showCount={showCounts} onToggle={toggleCounts} /></span>
          <TwIcon name={expanded ? "chevronUp" : "chevronDown"} size={18} />
        </div>
        <div className={`tw-analytics-question-collapse${expanded ? " is-open" : ""}`} aria-hidden={!expanded}><div><ExpandedQuestionDetail C={C} tone={tone} tt={tt} question={question} index={index} showCounts={showCounts} onToggleCounts={toggleCounts} /></div></div>
      </div>;
    })}</div>
  </div>;
}

function ExpandedQuestionDetail({ C, tone, tt, question, showCounts, onToggleCounts }) {
  return <div className="tw-analytics-expanded-detail"><div className="tw-analytics-full-prompt">{question.prompt || "Untitled question"}</div>
    {tt === "MCQ" && <AggregateChoices C={C} question={question} showLetters imageOnly={String(question.config_json?.mcqMode || "").toUpperCase() === "MODIFIED"} showCounts={showCounts} onToggleCounts={onToggleCounts} />}
    {tt === "TRUE_FALSE" && <AggregateChoices C={C} question={question} showCounts={showCounts} onToggleCounts={onToggleCounts} />}
    {tt === "TYPE_ANSWER" && <AnswerOnly C={C} text={question.correct_json?.text || question.config_json?.answer || "No answer set"} />}
    {tt === "GUESS_WORD_4PICS" && <><AnalyticsImages images={question.config_json?.images || []} /><AnswerOnly C={C} text={question.correct_json?.text || question.config_json?.target || "No answer set"} /></>}
  </div>;
}

function AggregateChoices({ C, question, showLetters = false, imageOnly = false, showCounts = false, onToggleCounts }) {
  return <div className="tw-analytics-choice-grid">{(question.choice_stats || []).map((choice, index) => <div key={choice.id || index} className={`tw-analytics-choice-row ${choice.is_correct ? "is-correct" : "is-wrong"}${showLetters ? "" : " no-letter"}`}>{showLetters && <span className="tw-analytics-choice-letter">{String.fromCharCode(65 + index)}</span>}<span className="tw-analytics-choice-content">{choice.image && <img src={choice.image} alt="" loading="lazy" decoding="async" />}{!imageOnly && choice.text && <b>{choice.text}</b>}{!choice.image && !choice.text && <b>Choice {index + 1}</b>}</span><ChoiceStatToggle choice={choice} showCount={showCounts} onToggle={onToggleCounts} /></div>)}</div>;
}

function ChoiceStatToggle({ choice, showCount, onToggle }) {
  return <button type="button" className="tw-analytics-choice-stat" onClick={(event) => { event.stopPropagation(); onToggle?.(event); }}>{showCount ? `${choice.selected_count || 0} students` : `${choice.selected_pct || 0}%`}</button>;
}

function BatchDetail({ C, tone, tt, question, index, showCounts, onToggleCounts }) {
  return <div className="tw-analytics-batch-detail"><div className="tw-analytics-expanded-head"><span style={{ color: tone.accent, fontWeight: 950 }}>B{index + 1}</span></div><div className="tw-analytics-full-prompt">{question.prompt || "Untitled batch"}</div>{tt === "MATCHING" ? <div className="tw-analytics-pair-list"><div className="tw-analytics-pair-head"><span>Column A</span><span>Column B</span><span>Results</span></div>{(question.pair_stats || []).map((pair, pairIndex) => <div key={pairIndex} className="tw-analytics-pair-row"><AnalyticsMedia item={pair.a} fallback={`Item ${pairIndex + 1}`} /><AnalyticsMedia item={pair.b} fallback={`Choice ${pairIndex + 1}`} /><span className="tw-analytics-result-pair"><ResultBadge C={C} kind="correct" pct={pair.pct_correct} count={pair.correct_count} toggle showCount={showCounts} onToggle={onToggleCounts} /><ResultBadge C={C} kind="wrong" pct={pair.pct_incorrect} count={pair.incorrect_count} toggle showCount={showCounts} onToggle={onToggleCounts} /></span></div>)}</div> : <div className="tw-analytics-word-list">{(question.word_stats || []).map((word, wordIndex) => <div key={word.word || wordIndex} className="tw-analytics-word-row"><b>{word.word}</b><span><ResultBadge C={C} kind="correct" pct={word.pct_correct} count={word.correct_count} toggle showCount={showCounts} onToggle={onToggleCounts} /><ResultBadge C={C} kind="wrong" pct={word.pct_incorrect} count={word.incorrect_count} toggle showCount={showCounts} onToggle={onToggleCounts} /></span></div>)}</div>}</div>;
}

function StudentQuestionAnalytics({ C, tone, templateType, student, questions }) {
  const [index, setIndex] = useState(0);
  const tt = normalizeTemplateType(templateType);
  const question = questions[index];
  const response = (student.responses || []).find((row) => Number(row.question_id) === Number(question?.question_id));
  if (!question) return <div style={{ padding: 16, color: C.muted }}>No question responses are available.</div>;
  return <div className="tw-student-analytics-detail"><div className="tw-student-analytics-nav"><ArrowButton C={C} direction="left" disabled={index <= 0} onClick={() => setIndex((v) => Math.max(0, v - 1))} /><b style={{ color: tone.accent }}>{["MATCHING", "THINK_SPELL"].includes(tt) ? `B${index + 1}` : `Q${index + 1}`} of {questions.length}</b><ArrowButton C={C} direction="right" disabled={index >= questions.length - 1} onClick={() => setIndex((v) => Math.min(questions.length - 1, v + 1))} /></div><div className="tw-analytics-full-prompt">{question.prompt || "Untitled question"}</div><StudentTemplateAnswer C={C} tt={tt} question={question} response={response} /></div>;
}

function StudentTemplateAnswer({ C, tt, question, response }) {
  const answer = response?.answer || {};
  if (tt === "MCQ") {
    const selected = selectedChoiceIndexes(answer, question.config_json || {});
    const imageOnly = String(question.config_json?.mcqMode || "").toUpperCase() === "MODIFIED";
    return <div className="tw-analytics-choice-grid">{(question.choice_stats || []).map((choice, index) => {
      const chosen = selected.has(index); const cls = choice.is_correct ? "is-correct" : chosen ? "is-student-choice" : "is-wrong";
      return <div key={choice.id || index} className={`tw-analytics-choice-row ${cls}`}><span className="tw-analytics-choice-letter">{String.fromCharCode(65 + index)}</span><span className="tw-analytics-choice-content">{choice.image && <img src={choice.image} alt="" loading="lazy" decoding="async" />}{!imageOnly && choice.text && <b>{choice.text}</b>}</span>{chosen && <span className="tw-student-answer-tag">Chosen</span>}</div>;
    })}</div>;
  }
  if (tt === "TRUE_FALSE") {
    const selected = String(answer.choice || "").toLowerCase();
    return <div className="tw-analytics-choice-grid">{["True", "False"].map((value) => <div key={value} className={`tw-analytics-choice-row ${selected === value.toLowerCase() ? (response?.is_correct ? "is-correct" : "is-wrong") : "is-neutral"}`}><b>{value}</b>{selected === value.toLowerCase() && <span className="tw-student-answer-tag">Chosen</span>}</div>)}</div>;
  }
  if (tt === "TYPE_ANSWER") return <StudentTypedAnswer C={C} text={answer.text || "No answer submitted"} correct={!!response?.is_correct} />;
  if (tt === "GUESS_WORD_4PICS") return <><AnalyticsImages images={question.config_json?.images || []} /><StudentTypedAnswer C={C} text={answer.text || "No answer submitted"} correct={!!response?.is_correct} /></>;
  if (tt === "MATCHING") {
    const submitted = new Map((Array.isArray(answer.pairs) ? answer.pairs : []).map((pair) => [Number(pair.aIndex), Number(pair.bIndex)]));
    const expected = new Map((Array.isArray(question.correct_json?.pairs) ? question.correct_json.pairs : []).map((pair) => [Number(pair.aIndex), Number(pair.bIndex)]));
    const colA = question.config_json?.colA || []; const colB = question.config_json?.colB || [];
    return <div className="tw-analytics-pair-list">{Array.from(expected.entries()).map(([aIndex, correctB], rowIndex) => { const submittedB = submitted.get(aIndex); const ok = submittedB === correctB; return <div key={aIndex} className={`tw-analytics-pair-row tw-student-pair ${ok ? "is-correct" : "is-wrong"}`}><AnalyticsMedia item={colA[aIndex]} fallback={`Item ${rowIndex + 1}`} /><AnalyticsMedia item={colB[submittedB]} fallback={submittedB === undefined ? "No pair" : `Choice ${submittedB + 1}`} /><b>{ok ? "Correct" : "Incorrect"}</b></div>; })}</div>;
  }
  if (tt === "THINK_SPELL") {
    const found = foundWordSet(answer);
    const words = Array.isArray(question.correct_json?.answers) && question.correct_json.answers.length ? question.correct_json.answers : question.config_json?.answers || [];
    return <div className="tw-analytics-word-list">{words.map((word) => <div key={word} className={`tw-analytics-word-row ${found.has(normalizeWord(word)) ? "is-correct" : "is-wrong"}`}><b>{word}</b><span>{found.has(normalizeWord(word)) ? "Found" : "Not found"}</span></div>)}</div>;
  }
  return <StudentTypedAnswer C={C} text={answer.text || "No answer submitted"} correct={!!response?.is_correct} />;
}

function ResultBadge({ C, kind, pct = 0, count = 0, toggle = false, showCount, onToggle }) {
  const [localShowCount, setLocalShowCount] = useState(false);
  const controlled = typeof showCount === "boolean";
  const visibleCount = controlled ? showCount : localShowCount;
  const good = kind === "correct";
  const Component = toggle ? "button" : "span";
  const handleClick = toggle ? (event) => { event.stopPropagation(); if (controlled) onToggle?.(event); else setLocalShowCount((value) => !value); } : undefined;
  return <Component className={`tw-analytics-result-badge${toggle ? " tw-analytics-stat-toggle" : ""}`} type={toggle ? "button" : undefined} onClick={handleClick} style={{ ...pill(C), color: good ? C.greenFg : C.redFg, borderColor: good ? C.greenBorder : C.redBorder, background: good ? C.greenBg : C.redBg, cursor: toggle ? "pointer" : "default" }}>{good ? "✓" : "✕"} {visibleCount ? count : `${pct ?? 0}%`}</Component>;
}
function AnswerOnly({ C, text }) { return <div className="tw-analytics-answer-only" style={{ borderColor: C.greenBorder, background: C.greenBg, color: C.greenFg }}><b>Correct answer</b><span>{String(text || "")}</span></div>; }
function StudentTypedAnswer({ C, text, correct }) { return <div className="tw-analytics-answer-only" style={{ borderColor: correct ? C.greenBorder : C.redBorder, background: correct ? C.greenBg : C.redBg, color: correct ? C.greenFg : C.redFg }}><b>{correct ? "Correct" : "Incorrect"}</b><span>{String(text || "")}</span></div>; }
function AnalyticsImages({ images }) { return <div className="tw-analytics-image-strip">{images.filter(Boolean).slice(0, 4).map((src, index) => <img key={index} src={src} alt={`Clue ${index + 1}`} loading="lazy" decoding="async" />)}</div>; }
function AnalyticsMedia({ item, fallback }) { const value = item && typeof item === "object" ? item : { text: String(item || "") }; return <span className="tw-analytics-media">{value.text && <b>{value.text}</b>}{value.image && <img src={value.image} alt="" loading="lazy" decoding="async" />}{!value.text && !value.image && fallback}</span>; }
function ArrowButton({ C, direction, disabled, onClick }) { return <button type="button" disabled={disabled} onClick={onClick} className="tw-analytics-arrow" style={{ color: C.text, borderColor: C.border, background: C.cardBg }}><TwIcon name="arrowRight" size={18} style={direction === "left" ? { transform: "rotate(180deg)" } : undefined} /></button>; }

function selectedChoiceIndexes(answer, config) {
  const options = Array.isArray(config.options) ? config.options.map((option, index) => option && typeof option === "object" ? { id: String(option.id || `option-${index + 1}`), text: String(option.text || option.label || "") } : { id: `option-${index + 1}`, text: String(option || "") }) : [];
  const selected = Array.isArray(answer?.choices)
    ? answer.choices
    : Array.isArray(answer?.choice)
      ? answer.choice
      : [answer?.choice].filter((value) => value !== undefined && value !== null && value !== "");
  const set = new Set();
  selected.forEach((value) => {
    const actual = String(value ?? "").trim().toLowerCase();
    const index = options.findIndex((option, optionIndex) => [option.id, option.text, String(optionIndex), String(optionIndex + 1), String.fromCharCode(65 + optionIndex)].some((candidate) => String(candidate ?? "").trim().toLowerCase() === actual));
    if (index >= 0) set.add(index);
  });
  return set;
}
function normalizeWord(value) { return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, ""); }
function foundWordSet(answer) { const rows = Array.isArray(answer?.words) ? answer.words : Array.isArray(answer?.foundEntries) ? answer.foundEntries : []; return new Set(rows.map((row) => normalizeWord(typeof row === "string" ? row : row?.text || row?.word)).filter(Boolean)); }

function buildTutorialDemoAnalytics(base, sourceQuestions = []) {
  const session = { ...(base?.session || {}) };
  const tt = normalizeTemplateType(session.template_type);
  const rawQuestions = sourceQuestions.length ? sourceQuestions : (base?.questions || []);
  const questions = rawQuestions.map((source, index) => {
    const config = parseMaybeJson(source?.config_json) || {};
    const correct = parseMaybeJson(source?.correct_json) || {};
    const thinkBot2Correct = rawQuestions.length > 1 && index === 0;
    const correctCount = 1 + (thinkBot2Correct ? 1 : 0);
    const incorrectCount = 3 - correctCount;
    const detail = {
      ...source,
      question_id: Number(source?.question_id ?? source?.id ?? index + 1),
      question_order: Number(source?.question_order ?? index),
      prompt: source?.prompt || `Question ${index + 1}`,
      config_json: config,
      correct_json: correct,
      total_answers: 3,
      correct_answers: correctCount,
      incorrect_answers: incorrectCount,
      pct_correct: Number(((correctCount / 3) * 100).toFixed(2)),
      pct_incorrect: Number(((incorrectCount / 3) * 100).toFixed(2)),
    };
    if (tt === "MCQ" || tt === "TRUE_FALSE") {
      const options = tt === "TRUE_FALSE"
        ? [{ id: "true", text: "True", image: "" }, { id: "false", text: "False", image: "" }]
        : (Array.isArray(config.options) ? config.options : []).map((option, optionIndex) => normalizeDemoOption(option, optionIndex));
      const correctIndexes = demoCorrectChoiceIndexes(tt, correct, options);
      const correctIndex = correctIndexes[0] ?? 0;
      const twoAnswerMcq = tt === "MCQ" && (String(config.answerMode || "").toUpperCase() === "TWO" || correctIndexes.length > 1);
      const wrongIndex = options.findIndex((_, optionIndex) => !correctIndexes.includes(optionIndex));
      detail.choice_stats = options.map((option, optionIndex) => {
        let selectedCount = 0;
        if (twoAnswerMcq) {
          if (optionIndex === correctIndex) selectedCount = 3;
          else if (correctIndexes.includes(optionIndex)) selectedCount = correctCount;
          else if (optionIndex === wrongIndex) selectedCount = incorrectCount;
        } else if (optionIndex === correctIndex) selectedCount = correctCount;
        else if (optionIndex === wrongIndex) selectedCount = incorrectCount;
        return {
          index: optionIndex,
          ...normalizeDemoOption(option, optionIndex),
          is_correct: correctIndexes.includes(optionIndex),
          selected_count: selectedCount,
          selected_pct: Number(((selectedCount / 3) * 100).toFixed(2)),
        };
      });
    }
    if (tt === "MATCHING") {
      detail.pair_stats = (Array.isArray(correct.pairs) ? correct.pairs : []).map((pair, pairIndex) => ({
        index: pairIndex,
        aIndex: Number(pair.aIndex),
        bIndex: Number(pair.bIndex),
        a: (config.colA || [])[Number(pair.aIndex)] ?? null,
        b: (config.colB || [])[Number(pair.bIndex)] ?? null,
        correct_count: 2,
        incorrect_count: 1,
        pct_correct: 66.67,
        pct_incorrect: 33.33,
      }));
    }
    if (tt === "THINK_SPELL") {
      const words = Array.isArray(correct.answers) && correct.answers.length ? correct.answers : (Array.isArray(config.answers) ? config.answers : []);
      detail.word_stats = words.map((word, wordIndex) => ({ index: wordIndex, word, correct_count: 2, incorrect_count: 1, pct_correct: 66.67, pct_incorrect: 33.33 }));
    }
    return detail;
  });

  const students = [0, 1, 2].map((botIndex) => {
    const responses = questions.map((question, questionIndex) => {
      const maxPoints = tutorialQuestionMaxPoints(question, tt, session.points_per_question);
      const correctForBot = botIndex === 0 || (botIndex === 1 && questions.length > 1 && questionIndex === 0);
      const awarded = botIndex === 0
        ? maxPoints
        : botIndex === 1
          ? (questions.length > 1 ? (questionIndex === 0 ? maxPoints : 0) : Math.max(0, maxPoints - 1))
          : 0;
      return {
        question_id: question.question_id,
        answer: demoAnswerForQuestion(tt, question, correctForBot),
        is_correct: correctForBot,
        points_awarded: Math.max(0, Math.round(awarded)),
        answered_at: session.display_date || new Date().toISOString(),
      };
    });
    return {
      participant_id: -101 - botIndex,
      first_name: "ThinkBOT",
      last_name: String(botIndex + 1),
      participant_type: "STUDENT",
      joined_at: session.display_date || new Date().toISOString(),
      total_points: Math.max(0, Math.round(responses.reduce((sum, response) => sum + Number(response.points_awarded || 0), 0))),
      completion_ms: 25000 + botIndex * 9000,
      responses,
    };
  });
  const values = students.map((student) => Number(student.total_points || 0));
  return {
    ...(base || {}),
    session,
    questions,
    students,
    summary: {
      ...(base?.summary || {}),
      participant_count: 3,
      student_count: 3,
      guest_count: 0,
      avg_score: Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1)),
      min_score: Math.min(...values),
      max_score: Math.max(...values),
    },
  };
}
function tutorialQuestionMaxPoints(question, templateType, fallbackPoints = 1) {
  const perUnit = Math.max(1, Math.round(Number(question?.config_json?.points ?? fallbackPoints ?? 1)));
  if (templateType === "MATCHING") {
    const pairs = Array.isArray(question?.correct_json?.pairs) ? question.correct_json.pairs.length : 0;
    return Math.max(perUnit, perUnit * Math.max(1, pairs));
  }
  if (templateType === "THINK_SPELL") {
    const words = Array.isArray(question?.correct_json?.answers) && question.correct_json.answers.length
      ? question.correct_json.answers.length
      : (Array.isArray(question?.config_json?.answers) ? question.config_json.answers.length : 0);
    return Math.max(perUnit, perUnit * Math.max(1, words));
  }
  return perUnit;
}
function buildTutorialDemoTabs() {
  return [1, 2, 3].map((number) => ({ participant_id: -100 - number, first_name: "ThinkBOT", last_name: String(number), tab_out_count: 0 }));
}
function parseMaybeJson(value) { if (!value) return {}; if (typeof value === "object") return value; try { return JSON.parse(value); } catch { return {}; } }
function normalizeDemoOption(option, index) { if (option && typeof option === "object") return { id: String(option.id || `option-${index + 1}`), text: String(option.text ?? option.label ?? ""), image: String(option.image ?? "") }; return { id: `option-${index + 1}`, text: String(option ?? ""), image: "" }; }
function demoCorrectChoiceIndexes(templateType, correct, options) {
  if (templateType === "TRUE_FALSE") return [String(correct?.choice || "").toLowerCase() === "false" ? 1 : 0];
  const values = Array.isArray(correct?.choices) && correct.choices.length ? correct.choices : [correct?.choice].filter((value) => value !== undefined && value !== null && value !== "");
  const indexes = values.map((value) => options.findIndex((option, index) => [String(index), option.id, option.text].some((candidate) => String(candidate || "").trim().toLowerCase() === String(value || "").trim().toLowerCase()))).filter((index) => index >= 0);
  return indexes.length ? Array.from(new Set(indexes)) : [0];
}
function demoAnswerForQuestion(templateType, question, correct) {
  const cfg = question.config_json || {};
  const key = question.correct_json || {};
  if (templateType === "MCQ") {
    const options = (Array.isArray(cfg.options) ? cfg.options : []).map((option, index) => normalizeDemoOption(option, index));
    const correctIndexes = demoCorrectChoiceIndexes(templateType, key, options);
    const answerModeTwo = String(cfg.answerMode || "").toUpperCase() === "TWO" || correctIndexes.length > 1;
    if (answerModeTwo) {
      const correctSelections = correctIndexes.slice(0, 2).map((index) => options[index]?.id || options[index]?.text || String(index));
      if (correct) return { choices: correctSelections };
      const wrongIndex = Math.max(0, options.findIndex((_, index) => !correctIndexes.includes(index)));
      const firstCorrect = correctIndexes[0] ?? 0;
      return { choices: [options[firstCorrect]?.id || options[firstCorrect]?.text || String(firstCorrect), options[wrongIndex]?.id || options[wrongIndex]?.text || String(wrongIndex)] };
    }
    const correctIndex = correctIndexes[0] ?? 0;
    const selectedIndex = correct ? correctIndex : Math.max(0, options.findIndex((_, index) => index !== correctIndex));
    return { choice: options[selectedIndex]?.id || options[selectedIndex]?.text || String(selectedIndex) };
  }
  if (templateType === "TRUE_FALSE") {
    const expected = String(key.choice || "true").toLowerCase() === "false" ? "false" : "true";
    return { choice: correct ? expected : expected === "true" ? "false" : "true" };
  }
  if (templateType === "TYPE_ANSWER" || templateType === "GUESS_WORD_4PICS") return { text: correct ? String(key.text || cfg.answer || "Correct answer") : "Sample response" };
  if (templateType === "MATCHING") {
    const pairs = (Array.isArray(key.pairs) ? key.pairs : []).map((pair) => ({ aIndex: Number(pair.aIndex), bIndex: Number(pair.bIndex) }));
    if (correct || pairs.length < 2) return { pairs };
    const wrong = pairs.map((pair) => ({ ...pair }));
    wrong[0].bIndex = pairs[1].bIndex;
    return { pairs: wrong };
  }
  if (templateType === "THINK_SPELL") {
    const words = Array.isArray(key.answers) && key.answers.length ? key.answers : (Array.isArray(cfg.answers) ? cfg.answers : []);
    const selected = correct ? words : words.slice(0, Math.max(1, Math.floor(words.length / 2)));
    return { words: selected.map((word) => ({ text: word })) };
  }
  return { text: correct ? "Correct" : "Incorrect" };
}

function buildScores(analytics, advancedPlan = false) {
  const students = analytics?.students || [];
  if (!advancedPlan && analytics?.session?.join_mode === "GROUP") return Object.values(students.reduce((acc, student) => { const key = student.group_name || `${student.first_name || ""} ${student.last_name || ""}`.trim() || `Group ${student.participant_id}`; if (!acc[key]) acc[key] = { key, label: key, total_points: 0, participant_id: student.participant_id }; acc[key].total_points = Math.max(acc[key].total_points, Number(student.total_points || 0)); return acc; }, {})).sort(sortScore);
  return students.map((student) => ({ key: student.participant_id, participant_id: student.participant_id, label: `${student.first_name || ""} ${student.last_name || ""}`.trim() || `Student ${student.participant_id}`, total_points: Number(student.total_points || 0), completion_ms: student.completion_ms })).sort(sortScore);
}
function sortScore(a, b) { return Number(b.total_points || 0) - Number(a.total_points || 0) || Number(a.completion_ms ?? Number.MAX_SAFE_INTEGER) - Number(b.completion_ms ?? Number.MAX_SAFE_INTEGER) || String(a.label).localeCompare(String(b.label)); }
function formatDate(value) { if (!value) return "No date"; const date = new Date(value); return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }); }
function palette(c, dark) { return { text: c.text, muted: c.textMuted || c.textSub, border: c.border, cardBg: c.cardBg, cardBg2: c.cardBg2, accent: c.accent, redFg: c.redFg || "#b91c1c", redBg: c.redBg || (dark ? "rgba(239,68,68,.12)" : "#fef2f2"), redBorder: c.redBorder || "rgba(239,68,68,.35)", greenFg: c.greenFg || "#15803d", greenBg: c.greenBg || (dark ? "rgba(34,197,94,.12)" : "#f0fdf4"), greenBorder: c.greenBorder || "rgba(34,197,94,.35)" }; }
function card(C) { return { background: C.cardBg, border: `3px solid ${C.border}`, borderRadius: 20, padding: 18, boxShadow: "0 16px 38px rgba(15,23,42,.08)", transition: "transform .22s ease, box-shadow .22s ease, border-color .22s ease" }; }
function subCard(C) { return { background: C.cardBg2, border: `3px solid ${C.border}`, borderRadius: 17, padding: 15, transition: "transform .22s ease, box-shadow .22s ease" }; }
function emptyCard(C) { return { color: C.muted, textAlign: "center", padding: 24, borderRadius: 15, border: `1px dashed ${C.border}`, background: C.cardBg2, fontWeight: 750 }; }
function sectionTitle(C) { return { color: C.text, fontWeight: 950, marginBottom: 11 }; }
function pill(C) { return { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "5px 9px", borderRadius: 999, border: `1px solid ${C.border}`, background: C.cardBg2, color: C.text, fontSize: 12, fontWeight: 850, whiteSpace: "nowrap" }; }
function secondaryBtn(C) { return { padding: "9px 13px", borderRadius: 999, border: `1px solid ${C.border}`, background: C.cardBg2, color: C.text, fontWeight: 850, cursor: "pointer" }; }
function MetricCard({ C, tone, label, value }) { return <div style={{ ...subCard(C), background: tone.softBg, borderColor: tone.border }}><div style={{ color: tone.accent, fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 900 }}>{label}</div><div style={{ color: C.text, fontSize: 27, fontWeight: 950, marginTop: 7 }}>{value}</div></div>; }
function StudentChip({ name, C }) { return <span style={{ ...pill(C), padding: "8px 11px" }}><span style={{ width: 8, height: 8, borderRadius: 99, background: "#22c55e", boxShadow: "0 0 0 4px rgba(34,197,94,.12)" }} />{name || "Student"}</span>; }
