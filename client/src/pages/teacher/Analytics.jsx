/* Revision 10.4: restores the two-column advanced analytics layout, smooth student/question
 * transitions, and synchronized percentage/student-count toggles. */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { makeSocket } from "../../lib/socket";
import { useColors, useTheme } from "../../context/ThemeContext";
import { templateLabel, templateTone } from "../../lib/templatePalette";
import { isInstitutionPlan } from "../../lib/planLimits";
import { normalizeTemplateType } from "../../lib/templateTypes";
import { TwIcon } from "../../components/TwUI";
import ThemeIconButton from "../../components/ThemeIconButton";
import { TeacherPressButton } from "./TeacherUI";
import ThinkBotTutorial from "../../components/ThinkBotTutorial";
import { useIsMobileViewport } from "./tabs/teacherTabShared";
import { TwLogoLoader } from "../../components/TwLogoLoader";
import { BOT_SKILLS, sampleBotAnswer, scoreBotAnswer } from "../../lib/tutorialBots";
import { readTutorialState, writeTutorialState } from "../../lib/tutorialState";
import { getSessionBackground } from "../../lib/sessionBackgrounds";
import { manilaDateTime } from "../../lib/dateFormat";

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
  const [mobileResultsView, setMobileResultsView] = useState("students");
  const [tutorialUserId, setTutorialUserId] = useState(null);
  const [analyticsTutorialStage, setAnalyticsTutorialStage] = useState(null);
  const [tutorialStudentOpened, setTutorialStudentOpened] = useState(false);
  const [tutorialStudentNextReady, setTutorialStudentNextReady] = useState(false);
  const [liveRefreshTick, setLiveRefreshTick] = useState(0);
  const isMobile = useIsMobileViewport();

  // Assigned analytics stay live: each new submission broadcasts to the
  // assignment room, so refetch the report instead of freezing at open time.
  useEffect(() => {
    if (!assigned || !quizId) return undefined;
    const socket = makeSocket();
    socket.emit("assignment:join-leaderboard", { quizId: Number(quizId) });
    socket.on("assignment:leaderboard-update", (payload) => {
      if (Number(payload?.quizId) !== Number(quizId)) return;
      setLiveRefreshTick((value) => value + 1);
    });
    return () => {
      socket.emit("assignment:leave-leaderboard", { quizId: Number(quizId) });
      socket.disconnect();
    };
  }, [assigned, quizId]);

  function handleMobileResultsToggle() {
    setMobileResultsView((view) => (view === "students" ? "questions" : "students"));
    if (analyticsTutorialStage === "students") {
      setExpandedStudentId(null);
      setAnalyticsTutorialStage("questions");
    }
  }

  // Mobile tutorial: bring the results toggle into view before pointing at it.
  useEffect(() => {
    if (analyticsTutorialStage !== "students" || !isMobile) return undefined;
    const timer = window.setTimeout(() => {
      document.querySelector('[data-tutorial="analytics-mobile-toggle"]')?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [analyticsTutorialStage, isMobile]);
  const [, setTutorialDemoAnalytics] = useState(false);
  const hasLoadedOnceRef = useRef(false);

  useEffect(() => {
    let alive = true;
    // Live submission updates refetch silently; only the first load shows
    // the loading state so the report doesn't flash on every arrival.
    if (!hasLoadedOnceRef.current) setLoading(true);
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
          // No group-mode bot tutorials: demo bots stay solo-style only.
          const isTutorialDemo = !guestMode
            && Number(tutorialState?.tutorialDemoSessionId) === Number(sessionId)
            && String(analyticsResponse.data?.session?.join_mode || "SOLO").toUpperCase() !== "GROUP";
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
            tabs = buildTutorialDemoTabs(analyticsResponse.data?.tabMonitoring);
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
        hasLoadedOnceRef.current = true;
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [assigned, classId, quizId, sessionId, guestMode, liveRefreshTick]);

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
  const exportAllowed = advancedPlan && !guestMode;
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
    <div className="grid gap-[18px]">
      <section className="tw-analytics-card overflow-hidden relative" style={{ ...card(C) }}>
        <div className="absolute inset-[0_0_auto_0] h-[5px]" style={{ background: tone.accent }} />
        <div className="tw-analytics-title-row">
          <h2 className="tw-analytics-quiz-title" style={{ color: C.text }}>{session.quiz_title || (assigned ? `Assigned Quiz #${quizId}` : `Session #${sessionId}`)}</h2>
          <TeacherPressButton tone="blue" className="tw-analytics-back-press" onClick={() => navigate(-1)}>Back</TeacherPressButton>
        </div>
        <div className="flex justify-between items-end gap-[14px] flex-wrap mt-[10px]">
          <div className="min-w-0">
            <div className="tw-analytics-badges-row flex items-center gap-[10px] flex-wrap">
              <span style={{ ...pill(C), color: tone.accent, borderColor: tone.border, background: tone.softBg }}>{templateLabel(session.template_type)}</span>
              <span style={pill(C)}>{assigned ? "Assigned session" : session.join_mode === "GROUP" ? "Group live session" : "Solo live session"}</span>
            </div>
            <div className="mt-[8px] text-[13px] font-[750] leading-[1.6]" style={{ color: C.muted }}>{guestMode ? formatDate(sessionDisplayTimestamp(session)) : <>{assigned ? "Assigned Session Analytics" : "Session Analytics"} · {session.folder_name || session.class_name || "Unassigned"} · {formatDate(sessionDisplayTimestamp(session))}</>}</div>
          </div>
          {exportAllowed && <div className="tw-analytics-export-row flex gap-[8px] flex-wrap">
            {advancedPlan && (classId || session.class_id) && <TeacherPressButton type="button" tone="blue" icon="classes" className="tw-class-analytics-btn tw-analytics-back-press" onClick={openClassAnalytics}>Class Analytics</TeacherPressButton>}
            <button type="button" className="tw-analytics-export-plain tw-export-pdf" aria-label="Export PDF" title="Export PDF" disabled={!!exporting} onClick={() => downloadExport("pdf")}><TwIcon name="pdf" size={24} /><span>{exporting === "pdf" ? "Exporting…" : "PDF"}</span></button>
            <button type="button" className="tw-analytics-export-plain tw-export-xlsx" aria-label="Export Excel" title="Export Excel" disabled={!!exporting} onClick={() => downloadExport("xlsx")}><TwIcon name="xlsx" size={24} /><span>{exporting === "xlsx" ? "Exporting…" : "XLSX"}</span></button>
          </div>}
        </div>
      </section>

      {error && <div className="font-[800]" style={{ ...card(C), borderColor: C.redBorder, color: C.redFg, background: C.redBg }}>{error}</div>}

      <section className="tw-analytics-card" data-tutorial="analytics-performance" style={card(C)}>
        <div className="flex justify-between items-center mb-[16px] gap-[10px] flex-wrap">
          <h3 className="m-0 font-[950] flex items-center gap-[9px]" style={{ color: C.text }}><TwIcon name="trophy" size={21} /> Performance Overview</h3>
          <ParticipantBadges analytics={analytics} assigned={assigned} guestMode={guestMode} C={C} tone={tone} />
        </div>
        {loading ? <TwLogoLoader minHeight="24vh" /> : showAdvanced ? (
          <div className="tw-analytics-advanced-layout">
            <div className={`tw-analytics-panel-wrap${mobileResultsView === "students" ? " is-mobile-visible" : ""}`}>
              <Scoreboard C={C} scores={scores} tone={tone} analytics={analytics || {}} tabMonitoring={tabMonitoring} expandedStudentId={expandedStudentId} setExpandedStudentId={setExpandedStudentId} />
            </div>
            <AdvancedAnalyticsPanel C={C} analytics={analytics || {}} assigned={assigned} tone={tone} mobileView={mobileResultsView} onToggleMobileView={handleMobileResultsToggle} isDesktop={!isMobile} />
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
    {analyticsTutorialStage === "students" && (isMobile ? (
      <ThinkBotTutorial accentColor={tone.accent} target='[data-tutorial="analytics-mobile-toggle"]' placement="above" square highlightMode="target"><p>{session.join_mode === "GROUP" ? "Groups are listed here in order of highest to lowest." : "Students are listed here in order of highest to lowest."}</p><p>Select {session.join_mode === "GROUP" ? "a group" : "a student"} whenever you want to look more closely at their performance.</p></ThinkBotTutorial>
    ) : (
      <ThinkBotTutorial accentColor={tone.accent} target='[data-tutorial="analytics-students"]' placement="right" square clickAnywhere={tutorialStudentNextReady} onClickAnywhere={() => { setExpandedStudentId(null); setAnalyticsTutorialStage("questions"); }}><p>{session.join_mode === "GROUP" ? "Groups are listed here in order of highest to lowest." : "Students are listed here in order of highest to lowest."}</p><p>Select {session.join_mode === "GROUP" ? "a group" : "a student"} whenever you want to look more closely at their performance.</p></ThinkBotTutorial>
    ))}
    {analyticsTutorialStage === "questions" && (
      <ThinkBotTutorial accentColor={tone.accent} target='[data-tutorial="analytics-question-results"]' placement="screen-left" square dialogWidth={390} highlightMode="target" clickAnywhere onClickAnywhere={finishAnalyticsTutorial}>
        <p>Expanding a question shows the complete question, its answer choices, and how the class responded.</p>
      </ThinkBotTutorial>
    )}

    <ThemeIconButton dark={dark} onClick={toggleTheme} className="tw-landing-fixed-theme tw-analytics-theme" size={22} />
  </div></div>;
}

function ParticipantBadges({ analytics, assigned, guestMode, C, tone }) {
  const summary = analytics?.summary || {};
  const isGroup = analytics?.session?.join_mode === "GROUP" && Array.isArray(analytics?.groups);
  const groupCount = Number(summary.group_count ?? analytics?.groups?.length ?? 0);
  const total = Number(summary.participant_count ?? analytics?.students?.length ?? 0);
  const guests = Number(summary.guest_count || 0);
  const students = Number(summary.student_count || Math.max(0, total - guests));
  if (guestMode) return <span style={{ ...pill(C), color: tone.accent, borderColor: tone.border, background: tone.softBg }}>{total} participants</span>;
  if (assigned) return null;
  return <div className="flex gap-[7px] flex-wrap">
    <span style={{ ...pill(C), color: tone.accent, borderColor: tone.border, background: tone.softBg }}>{students} students</span>
    {guests > 0 && <span style={pill(C)}>{guests} guests</span>}
    {isGroup && <span style={pill(C)}>{groupCount} groups</span>}
  </div>;
}

function Scoreboard({ C, scores, tone, analytics, tabMonitoring = [], expandedStudentId, setExpandedStudentId, basic = false }) {
  if (!scores.length) return <div style={emptyCard(C)}>No scores have been submitted yet.</div>;
  const isGroup = analytics?.session?.join_mode === "GROUP" && Array.isArray(analytics?.groups);
  const sameKey = (a, b) => String(a) === String(b);
  const visibleScores = !basic && expandedStudentId !== null
    ? scores.map((score, index) => ({ score, index })).filter(({ score }) => sameKey(score.key, expandedStudentId))
    : scores.map((score, index) => ({ score, index }));
  const statusColor = (label) => label === "Online" ? "#22c55e" : label === "Kicked" ? "#ef4444" : label === "Offline" ? "#f59e0b" : "#94a3b8";
  return <div className={`tw-analytics-scoreboard${!basic && expandedStudentId !== null ? " has-expanded-student" : ""}`} data-tutorial="analytics-students" style={{ display: "grid", gap: 10 }}>
    {visibleScores.map(({ score, index }) => {
      const expanded = !basic && sameKey(expandedStudentId, score.key);
      const group = isGroup ? (analytics.groups || []).find((row) => String(row.group_key) === String(score.key)) : null;
      const student = !isGroup ? (analytics.students || []).find((row) => Number(row.participant_id) === Number(score.participant_id)) : null;
      const memberIds = group ? (group.member_ids || []).map(Number) : [];
      const tabOutCount = isGroup
        ? (tabMonitoring || []).filter((row) => memberIds.includes(Number(row.participant_id))).reduce((sum, row) => sum + Number(row.tab_out_count || 0), 0)
        : Number(((tabMonitoring || []).find((row) => Number(row.participant_id) === Number(score.participant_id))?.tab_out_count) ?? student?.tab_out_count ?? 0);
      const presenceLabel = isGroup ? group?.presence_status : presenceStatus(student).label;
      const presenceColor = isGroup ? statusColor(presenceLabel) : presenceStatus(student).color;
      const detailStudent = isGroup ? { responses: group?.responses || [] } : student;
      return <article key={score.key} className={`tw-analytics-student-card${expanded ? " is-expanded" : ""}`} style={{ borderColor: index === 0 ? tone.border : C.border, background: index === 0 ? tone.softBg : C.cardBg2, color: C.text }}>
        <button type="button" className="tw-analytics-student-button" disabled={basic} onClick={() => !basic && setExpandedStudentId(expanded ? null : score.key)} aria-expanded={expanded}>
          <span className="tw-analytics-student-identity"><RankIcon rank={index + 1} /><span className="tw-analytics-student-name">{score.label}</span>{isGroup ? <span style={{ ...pill(C), padding: "3px 7px", fontSize: 10 }}>{score.member_count} member{Number(score.member_count) === 1 ? "" : "s"}</span> : student?.participant_type === "GUEST" && <span style={{ ...pill(C), padding: "3px 7px", fontSize: 10 }}>Guest</span>}{(() => { return presenceLabel !== "Online" ? <span title={presenceLabel} style={{ ...pill(C), padding: "3px 7px", fontSize: 10, color: presenceColor, borderColor: presenceColor }}>{presenceLabel}</span> : null; })()}</span>
          <span className="tw-analytics-tab-out-badge" style={{ ...pill(C), color: tabOutCount > 0 ? C.redFg : C.muted, borderColor: tabOutCount > 0 ? C.redBorder : C.border, background: tabOutCount > 0 ? C.redBg : C.cardBg }}>{tabOutCount} tab out</span>
          <span className="tw-analytics-student-points" style={{ color: tone.accent, display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}><span>{score.total_points} pts</span> {!basic && <TwIcon name={expanded ? "chevronUp" : "chevronDown"} size={16} />}</span>
        </button>
        {!basic && detailStudent && <div className={`tw-student-analytics-collapse${expanded ? " is-open" : ""}`} aria-hidden={!expanded}><div>{isGroup && group?.members?.length ? <div className="flex flex-wrap gap-[8px]" style={{ marginBottom: 10 }}>{group.members.map((m) => <span key={m.participant_id} style={{ ...pill(C), padding: "8px 11px" }} title={m.presence_status}><span className="w-[8px] h-[8px] rounded-[99px]" style={{ background: statusColor(m.presence_status), boxShadow: `0 0 0 4px ${statusColor(m.presence_status)}1f` }} />{`${m.first_name || ""} ${m.last_name || ""}`.trim() || "Member"}</span>)}</div> : null}<StudentQuestionAnalytics C={C} tone={tone} templateType={analytics?.session?.template_type} student={detailStudent} questions={analytics.questions || []} /></div></div>}
      </article>;
    })}
  </div>;
}

function RankIcon({ rank }) {
  if (rank > 3) return <span className="w-[28px] text-center font-[950]">#{rank}</span>;
  const colors = { 1: "#d4a500", 2: "#9ca3af", 3: "#b87333" };
  return <span title={`Top ${rank}`} className="w-[28px] inline-grid place-items-center" style={{ color: colors[rank] }}><TwIcon name="trophy" size={23} strokeWidth={2.6} /></span>;
}

function BasicAnalyticsPanel({ C, analytics, assigned, tone }) {
  const summary = analytics.summary || {};
  const students = analytics.students || [];
  const questions = analytics.questions || [];
  const joinMode = analytics?.session?.join_mode || "SOLO";
  const [expandedMetric, setExpandedMetric] = useState(null);
  const highestNames = getScoreNames(analytics, "highest");
  const lowestNames = getScoreNames(analytics, "lowest");
  const toggleMetric = (key) => setExpandedMetric((cur) => (cur === key ? null : key));
  return <div className="grid gap-[16px]">
    <div data-tutorial="analytics-summary" className={`tw-analytics-metrics-grid${expandedMetric ? ` has-expanded-${expandedMetric}` : ""}`}>
      <MetricCard C={C} tone={tone} label="Average" value={summary.avg_score ?? 0} /><MetricCard C={C} tone={tone} label={assigned ? "Submitted" : joinMode === "GROUP" ? "Groups" : "Submitted"} value={joinMode === "GROUP" ? (summary.group_count ?? summary.participant_count ?? students.length) : (summary.participant_count ?? students.length)} /><ExpandableScoreCard C={C} tone={tone} metricKey="highest" label="Highest" value={summary.max_score ?? 0} names={highestNames} expanded={expandedMetric === "highest"} shrunk={expandedMetric === "lowest"} onToggle={() => toggleMetric("highest")} /><ExpandableScoreCard C={C} tone={tone} metricKey="lowest" label="Lowest" value={summary.min_score ?? 0} names={lowestNames} expanded={expandedMetric === "lowest"} shrunk={expandedMetric === "highest"} onToggle={() => toggleMetric("lowest")} />
    </div>
    <div style={subCard(C)}><div style={sectionTitle(C)}>Attendance</div><div className="flex flex-wrap gap-[8px]">{students.map((student) => <StudentChip key={student.participant_id} name={`${student.first_name || ""} ${student.last_name || ""}`.trim()} C={C} student={student} />)}{!students.length && <span style={{ color: C.muted }}>No submitted students yet.</span>}</div></div>
    <div data-tutorial="analytics-question-results" style={subCard(C)}><div style={sectionTitle(C)}>Per-question Results</div><LegacyQuestionRows C={C} tone={tone} questions={questions} /></div>
  </div>;
}

function AdvancedAnalyticsPanel({ C, analytics, assigned, tone, mobileView, onToggleMobileView, isDesktop = false }) {
  const summary = analytics.summary || {};
  const questions = analytics.questions || [];
  const isGroup = analytics?.session?.join_mode === "GROUP";
  const groupCount = summary.group_count ?? analytics?.groups?.length ?? 0;
  const tt = normalizeTemplateType(analytics?.session?.template_type);
  const batchMode = tt === "MATCHING" || tt === "CROSSWORD";
  const [expandedMetric, setExpandedMetric] = useState(null);
  const highestNames = getScoreNames(analytics, "highest");
  const lowestNames = getScoreNames(analytics, "lowest");
  const toggleMetric = (key) => setExpandedMetric((cur) => (cur === key ? null : key));
  return <div className="tw-analytics-detail-column" style={{ display: "grid", gap: 16 }}>
    <div className={`tw-analytics-metrics-grid${expandedMetric ? ` has-expanded-${expandedMetric}` : ""}`} data-tutorial="analytics-summary">
      <MetricCard C={C} tone={tone} label="Average" value={summary.avg_score ?? 0} /><MetricCard C={C} tone={tone} label={assigned ? "Submissions" : isGroup ? "Groups" : "Participants"} value={isGroup ? groupCount : (summary.participant_count ?? 0)} /><ExpandableScoreCard C={C} tone={tone} metricKey="highest" label="Highest" value={summary.max_score ?? 0} names={highestNames} expanded={expandedMetric === "highest"} shrunk={expandedMetric === "lowest"} onToggle={() => toggleMetric("highest")} /><ExpandableScoreCard C={C} tone={tone} metricKey="lowest" label="Lowest" value={summary.min_score ?? 0} names={lowestNames} expanded={expandedMetric === "lowest"} shrunk={expandedMetric === "highest"} onToggle={() => toggleMetric("lowest")} />
    </div>
    {isDesktop ? (
      <div className="tw-analytics-results-label" aria-hidden="true">{batchMode ? "Per-batch results" : "Per-question results"}</div>
    ) : (
      <TeacherPressButton type="button" data-tutorial="analytics-mobile-toggle" tone="blue" className="tw-analytics-mobile-toggle-btn tw-analytics-back-press" onClick={onToggleMobileView}><span>{mobileView === "students" ? (isGroup ? "Per-group results" : "Per-student results") : batchMode ? "Per-batch results" : "Per-question results"}</span><TwIcon name="swap" size={15} /></TeacherPressButton>
    )}
    <div className={`tw-analytics-panel-wrap${mobileView === "questions" ? " is-mobile-visible" : ""}${isDesktop ? " is-desktop-visible" : ""}`}>
      <QuestionAnalytics C={C} tone={tone} templateType={tt} questions={questions} alwaysExpanded={isDesktop} isGroup={isGroup} />
    </div>
  </div>;
}

function LegacyQuestionRows({ C, tone, questions }) {
  return <div className="grid gap-[10px]">{questions.map((question, index) => <div key={question.question_id || index} className="grid gap-[10px] items-center p-[11px_12px] rounded-[14px] grid-cols-[minmax(46px,auto)_minmax(150px,1fr)_repeat(2,minmax(92px,auto))]" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}><span className="font-[950]" style={{ color: tone.accent }}>Q{index + 1}</span><span className="font-[750] overflow-hidden text-ellipsis whitespace-nowrap" style={{ color: C.text }}>{question.prompt || "Untitled question"}</span><ResultBadge C={C} kind="correct" pct={question.pct_correct} count={question.correct_answers} /><ResultBadge C={C} kind="wrong" pct={question.pct_incorrect} count={question.incorrect_answers} /></div>)}{!questions.length && <div style={emptyCard(C)}>No question-level results are available yet.</div>}</div>;
}

function QuestionAnalytics({ C, tone, templateType, questions, alwaysExpanded = false, isGroup = false }) {
  const tt = normalizeTemplateType(templateType);
  const [expandedIndex, setExpandedIndex] = useState(null);
  const [batchIndex, setBatchIndex] = useState(0);
  const [batchExpanded, setBatchExpanded] = useState(false);
  const [showCounts, setShowCounts] = useState(false);
  const batchMode = tt === "MATCHING" || tt === "CROSSWORD";
  const toggleCounts = (event) => { event?.stopPropagation?.(); setShowCounts((value) => !value); };
  if (!questions.length) return <div className="tw-analytics-results-card" data-tutorial="analytics-question-results" style={subCard(C)}><div style={sectionTitle(C)}>{batchMode ? "Per-batch Results" : "Per-question Results"}</div><div style={emptyCard(C)}>No question-level results are available yet.</div></div>;

  if (alwaysExpanded) {
    if (batchMode) {
      const index = Math.min(batchIndex, questions.length - 1);
      const question = questions[index];
      return <div className="tw-analytics-results-card tw-analytics-batch-results" data-tutorial="analytics-question-results" style={subCard(C)}>
        <div className="flex justify-end items-center" style={{ marginBottom: 10 }}>
          <span className="flex gap-[7px]"><ArrowButton C={C} direction="left" disabled={index <= 0} onClick={() => { setBatchExpanded(false); setBatchIndex((v) => Math.max(0, v - 1)); }} /><ArrowButton C={C} direction="right" disabled={index >= questions.length - 1} onClick={() => { setBatchExpanded(false); setBatchIndex((v) => Math.min(questions.length - 1, v + 1)); }} /></span>
        </div>
        <div className={`tw-analytics-question-card tw-analytics-batch-card${batchExpanded ? " is-expanded" : ""}`} style={{ background: C.cardBg, borderColor: C.border, color: C.text }}>
          <div role="button" tabIndex={0} className="tw-analytics-question-toggle" aria-expanded={batchExpanded} onClick={() => setBatchExpanded((value) => !value)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setBatchExpanded((value) => !value); } }}>
            <span className="font-[950]" style={{ color: tone.accent }}>B{index + 1}</span>
            <span className="tw-analytics-question-prompt">{question.prompt || "Untitled batch"}</span>
            <span className="tw-analytics-summary-badges"><ResultBadge C={C} kind="correct" pct={question.pct_correct} count={question.correct_answers} toggle showCount={showCounts} onToggle={toggleCounts} countUnit={isGroup ? "groups" : ""} /><ResultBadge C={C} kind="wrong" pct={question.pct_incorrect} count={question.incorrect_answers} toggle showCount={showCounts} onToggle={toggleCounts} countUnit={isGroup ? "groups" : ""} /></span>
            <TwIcon name={batchExpanded ? "chevronUp" : "chevronDown"} size={18} />
          </div>
          <div className={`tw-analytics-question-collapse${batchExpanded ? " is-open" : ""}`} aria-hidden={!batchExpanded}><div><BatchDetail C={C} tone={tone} tt={tt} question={question} index={index} showCounts={showCounts} onToggleCounts={toggleCounts} isGroup={isGroup} /></div></div>
        </div>
      </div>;
    }
    return <div className="tw-analytics-results-card tw-analytics-desktop-expanded" data-tutorial="analytics-question-results" style={subCard(C)}>
      <div className={`tw-analytics-question-list${expandedIndex !== null ? " has-expanded" : ""}`}>{questions.map((question, index) => {
        const expanded = expandedIndex === index;
        const hidden = expandedIndex !== null && !expanded;
        return <div key={question.question_id || index} data-tutorial={index === 0 ? "analytics-question-card" : undefined} aria-hidden={hidden ? "true" : undefined} className={`tw-analytics-question-card${expanded ? " is-expanded" : ""}${hidden ? " is-hidden" : ""}`} style={{ background: C.cardBg, borderColor: C.border, color: C.text }}>
          <div role="button" className="tw-analytics-question-toggle" aria-expanded={expanded} tabIndex={hidden ? -1 : 0} onClick={() => !hidden && setExpandedIndex(expanded ? null : index)} onKeyDown={(event) => { if (!hidden && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); setExpandedIndex(expanded ? null : index); } }}>
            <span className="font-[950]" style={{ color: tone.accent }}>Q{index + 1}</span>
            <span className="tw-analytics-question-prompt">{question.prompt || "Untitled question"}</span>
            <span className="tw-analytics-summary-badges"><ResultBadge C={C} kind="correct" pct={question.pct_correct} count={question.correct_answers} toggle showCount={showCounts} onToggle={toggleCounts} countUnit={isGroup ? "groups" : ""} /><ResultBadge C={C} kind="wrong" pct={question.pct_incorrect} count={question.incorrect_answers} toggle showCount={showCounts} onToggle={toggleCounts} countUnit={isGroup ? "groups" : ""} /></span>
            <TwIcon name={expanded ? "chevronUp" : "chevronDown"} size={18} />
          </div>
          <div className={`tw-analytics-question-collapse${expanded ? " is-open" : ""}`} aria-hidden={!expanded}><div><ExpandedQuestionDetail C={C} tone={tone} tt={tt} question={question} index={index} showCounts={showCounts} onToggleCounts={toggleCounts} isGroup={isGroup} /></div></div>
        </div>;
      })}</div>
    </div>;
  }

  if (batchMode) {
    const index = Math.min(batchIndex, questions.length - 1);
    const question = questions[index];
    return <div className="tw-analytics-results-card tw-analytics-batch-results" data-tutorial="analytics-question-results" style={subCard(C)}>
      <div className="flex justify-between items-center" style={{ ...sectionTitle(C) }}>
        <span>Per-batch Results</span>
        <span className="flex gap-[7px]"><ArrowButton C={C} direction="left" disabled={index <= 0} onClick={() => { setBatchExpanded(false); setBatchIndex((v) => Math.max(0, v - 1)); }} /><ArrowButton C={C} direction="right" disabled={index >= questions.length - 1} onClick={() => { setBatchExpanded(false); setBatchIndex((v) => Math.min(questions.length - 1, v + 1)); }} /></span>
      </div>
      <div className={`tw-analytics-question-card tw-analytics-batch-card${batchExpanded ? " is-expanded" : ""}`} style={{ background: C.cardBg, borderColor: C.border, color: C.text }}>
        <div role="button" tabIndex={0} className="tw-analytics-question-toggle" aria-expanded={batchExpanded} onClick={() => setBatchExpanded((value) => !value)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setBatchExpanded((value) => !value); } }}>
          <span className="font-[950]" style={{ color: tone.accent }}>B{index + 1}</span>
          <span className="tw-analytics-question-prompt">{question.prompt || "Untitled batch"}</span>
          <span className="tw-analytics-summary-badges"><ResultBadge C={C} kind="correct" pct={question.pct_correct} count={question.correct_answers} toggle showCount={showCounts} onToggle={toggleCounts} countUnit={isGroup ? "groups" : ""} /><ResultBadge C={C} kind="wrong" pct={question.pct_incorrect} count={question.incorrect_answers} toggle showCount={showCounts} onToggle={toggleCounts} countUnit={isGroup ? "groups" : ""} /></span>
          <TwIcon name={batchExpanded ? "chevronUp" : "chevronDown"} size={18} />
        </div>
        <div className={`tw-analytics-question-collapse${batchExpanded ? " is-open" : ""}`} aria-hidden={!batchExpanded}><div><BatchDetail C={C} tone={tone} tt={tt} question={question} index={index} showCounts={showCounts} onToggleCounts={toggleCounts} isGroup={isGroup} /></div></div>
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
          <span className="font-[950]" style={{ color: tone.accent }}>Q{index + 1}</span>
          <span className="tw-analytics-question-prompt">{question.prompt || "Untitled question"}</span>
          <span className="tw-analytics-summary-badges"><ResultBadge C={C} kind="correct" pct={question.pct_correct} count={question.correct_answers} toggle showCount={showCounts} onToggle={toggleCounts} countUnit={isGroup ? "groups" : ""} /><ResultBadge C={C} kind="wrong" pct={question.pct_incorrect} count={question.incorrect_answers} toggle showCount={showCounts} onToggle={toggleCounts} countUnit={isGroup ? "groups" : ""} /></span>
          <TwIcon name={expanded ? "chevronUp" : "chevronDown"} size={18} />
        </div>
        <div className={`tw-analytics-question-collapse${expanded ? " is-open" : ""}`} aria-hidden={!expanded}><div><ExpandedQuestionDetail C={C} tone={tone} tt={tt} question={question} index={index} showCounts={showCounts} onToggleCounts={toggleCounts} isGroup={isGroup} /></div></div>
      </div>;
    })}</div>
  </div>;
}

function ExpandedQuestionDetail({ C, tt, question, showCounts, onToggleCounts, isGroup = false }) {
  return <div className="tw-analytics-expanded-detail"><div className="tw-analytics-full-prompt">{question.prompt || "Untitled question"}</div>
    {tt === "MCQ" && <AggregateChoices C={C} question={question} showLetters imageOnly={String(question.config_json?.mcqMode || "").toUpperCase() === "MODIFIED"} showCounts={showCounts} onToggleCounts={onToggleCounts} isGroup={isGroup} />}
    {tt === "TRUE_FALSE" && <AggregateChoices C={C} question={question} showCounts={showCounts} onToggleCounts={onToggleCounts} isGroup={isGroup} />}
    {tt === "TYPE_ANSWER" && <AnswerOnly C={C} text={question.correct_json?.text || question.config_json?.answer || "No answer set"} />}
    {tt === "GUESS_WORD_4PICS" && <><AnalyticsImages images={question.config_json?.images || []} /><AnswerOnly C={C} text={question.correct_json?.text || question.config_json?.target || "No answer set"} /></>}
  </div>;
}

function AggregateChoices({ question, showLetters = false, imageOnly = false, showCounts = false, onToggleCounts, isGroup = false }) {
  return <div className="tw-analytics-choice-grid">{(question.choice_stats || []).map((choice, index) => <div key={choice.id || index} className={`tw-analytics-choice-row ${choice.is_correct ? "is-correct" : "is-wrong"}${showLetters ? "" : " no-letter"}`}>{showLetters && <span className="tw-analytics-choice-letter">{String.fromCharCode(65 + index)}</span>}<span className="tw-analytics-choice-content">{choice.image && <img src={choice.image} alt="" loading="lazy" decoding="async" />}{!imageOnly && choice.text && <b>{choice.text}</b>}{!choice.image && !choice.text && <b>Choice {index + 1}</b>}</span><ChoiceStatToggle choice={choice} showCount={showCounts} onToggle={onToggleCounts} unit={isGroup ? "groups" : "students"} /></div>)}</div>;
}

function ChoiceStatToggle({ choice, showCount, onToggle, unit = "students" }) {
  return <button type="button" className="tw-analytics-choice-stat" onClick={(event) => { event.stopPropagation(); onToggle?.(event); }}>{showCount ? `${choice.selected_count || 0} ${unit}` : `${choice.selected_pct || 0}%`}</button>;
}

function BatchDetail({ C, tone, tt, question, index, showCounts, onToggleCounts, isGroup = false }) {
  const unit = isGroup ? "groups" : "";
  return <div className="tw-analytics-batch-detail"><div className="tw-analytics-expanded-head"><span className="font-[950]" style={{ color: tone.accent }}>B{index + 1}</span></div><div className="tw-analytics-full-prompt">{question.prompt || "Untitled batch"}</div>{tt === "MATCHING" ? <div className="tw-analytics-pair-list"><div className="tw-analytics-pair-head"><span>Column A</span><span>Column B</span><span>Results</span></div>{(question.pair_stats || []).map((pair, pairIndex) => <div key={pairIndex} className="tw-analytics-pair-row"><AnalyticsMedia item={pair.a} fallback={`Item ${pairIndex + 1}`} /><AnalyticsMedia item={pair.b} fallback={`Choice ${pairIndex + 1}`} /><span className="tw-analytics-result-pair"><ResultBadge C={C} kind="correct" pct={pair.pct_correct} count={pair.correct_count} toggle showCount={showCounts} onToggle={onToggleCounts} countUnit={unit} /><ResultBadge C={C} kind="wrong" pct={pair.pct_incorrect} count={pair.incorrect_count} toggle showCount={showCounts} onToggle={onToggleCounts} countUnit={unit} /></span></div>)}</div> : <div className="tw-analytics-word-list">{(question.word_stats || []).map((word, wordIndex) => <div key={word.word || wordIndex} className="tw-analytics-word-row"><b>{word.word}</b><span><ResultBadge C={C} kind="correct" pct={word.pct_correct} count={word.correct_count} toggle showCount={showCounts} onToggle={onToggleCounts} countUnit={unit} /><ResultBadge C={C} kind="wrong" pct={word.pct_incorrect} count={word.incorrect_count} toggle showCount={showCounts} onToggle={onToggleCounts} countUnit={unit} /></span></div>)}</div>}</div>;
}

function StudentQuestionAnalytics({ C, tone, templateType, student, questions }) {
  const [index, setIndex] = useState(0);
  const tt = normalizeTemplateType(templateType);
  const question = questions[index];
  const response = (student.responses || []).find((row) => Number(row.question_id) === Number(question?.question_id));
  if (!question) return <div className="p-[16px]" style={{ color: C.muted }}>No question responses are available.</div>;
  return <div className="tw-student-analytics-detail"><div className="tw-student-analytics-nav"><ArrowButton C={C} direction="left" disabled={index <= 0} onClick={() => setIndex((v) => Math.max(0, v - 1))} /><b style={{ color: tone.accent }}>{["MATCHING", "CROSSWORD"].includes(tt) ? `B${index + 1}` : `Q${index + 1}`} of {questions.length}</b><ArrowButton C={C} direction="right" disabled={index >= questions.length - 1} onClick={() => setIndex((v) => Math.min(questions.length - 1, v + 1))} /></div><div className="tw-analytics-full-prompt">{question.prompt || "Untitled question"}</div><StudentTemplateAnswer C={C} tt={tt} question={question} response={response} /></div>;
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
  if (tt === "CROSSWORD") {
    const found = foundWordSet(answer);
    const words = Array.isArray(question.correct_json?.answers) && question.correct_json.answers.length ? question.correct_json.answers : question.config_json?.answers || [];
    return <div className="tw-analytics-word-list">{words.map((word) => <div key={word} className={`tw-analytics-word-row ${found.has(normalizeWord(word)) ? "is-correct" : "is-wrong"}`}><b>{word}</b><span>{found.has(normalizeWord(word)) ? "Found" : "Not found"}</span></div>)}</div>;
  }
  return <StudentTypedAnswer C={C} text={answer.text || "No answer submitted"} correct={!!response?.is_correct} />;
}

function ResultBadge({ C, kind, pct = 0, count = 0, toggle = false, showCount, onToggle, countUnit = "" }) {
  const [localShowCount, setLocalShowCount] = useState(false);
  const controlled = typeof showCount === "boolean";
  const visibleCount = controlled ? showCount : localShowCount;
  const good = kind === "correct";
  const Component = toggle ? "button" : "span";
  const handleClick = toggle ? (event) => { event.stopPropagation(); if (controlled) onToggle?.(event); else setLocalShowCount((value) => !value); } : undefined;
  return <Component className={`tw-analytics-result-badge${toggle ? " tw-analytics-stat-toggle" : ""}`} type={toggle ? "button" : undefined} onClick={handleClick} style={{ ...pill(C), color: good ? C.greenFg : C.redFg, borderColor: good ? C.greenBorder : C.redBorder, background: good ? C.greenBg : C.redBg, cursor: toggle ? "pointer" : "default" }}>{good ? "✓" : "✕"} {visibleCount ? (countUnit ? `${count} ${countUnit}` : count) : `${pct ?? 0}%`}</Component>;
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
  const realBaseQuestions = Array.isArray(base?.questions) ? base.questions : [];
  const realQuestionsById = new Map(realBaseQuestions.map((q) => [Number(q?.question_id ?? q?.id), q]));
  // Each bot samples a student-like answer at its skill level, scored by the
  // REAL scorer — no hardcoded bot0-full / bot1-half / bot2-zero split.
  const basePointsDefault = Number(session.points_per_question ?? 1);
  const botPlays = BOT_SKILLS.map((bot) => rawQuestions.map((source) => {
    const config = parseMaybeJson(source?.config_json) || {};
    const correct = parseMaybeJson(source?.correct_json) || {};
    const timeLimitMs = Math.max(1, Number(config?.timeLimitSec ?? session.time_limit_sec ?? 30)) * 1000;
    const elapsedMs = timeLimitMs * (0.15 + Math.random() * 0.7);
    const { answer, selectedIndexes } = sampleBotAnswer({ templateType: session.template_type, config, correct, skill: bot?.hitRate ?? 0.6 });
    const result = scoreBotAnswer({ templateType: session.template_type, config, correct, answer, basePoints: Number(config?.points ?? basePointsDefault), elapsedMs, timeLimitMs });
    const earned = result.timeExpired ? 0 : Number(result.pointsAwarded || 0);
    return { answer, selectedIndexes, result, elapsedMs, earned, competitive: Number(result.competitivePoints || 0) };
  }));
  const questions = rawQuestions.map((source, index) => {
    const config = parseMaybeJson(source?.config_json) || {};
    const correct = parseMaybeJson(source?.correct_json) || {};
    const plays = botPlays.map((bot) => bot[index]);
    const correctCount = plays.filter((play) => play.result.isCorrect).length;
    const incorrectCount = plays.length - correctCount;
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
      const correctIds = (() => {
        const values = tt === "TRUE_FALSE"
          ? [String(correct?.choice ?? "true").toLowerCase() === "false" ? "false" : "true"]
          : (Array.isArray(correct?.choices) && correct.choices.length ? correct.choices : [correct?.choice].filter((value) => value !== undefined && value !== null && value !== ""));
        const normValue = (value) => String(value ?? "").trim().toLowerCase();
        const ids = values.map((value) => {
          const hit = options.find((option) => normValue(option.id) === normValue(value) || normValue(option.text) === normValue(value));
          return hit ? hit.id : null;
        }).filter(Boolean);
        return ids.length ? Array.from(new Set(ids)) : [options[0]?.id].filter(Boolean);
      })();
      detail.choice_stats = options.map((option, optionIndex) => {
        const selectedCount = plays.filter((play) => (play.selectedIndexes || []).includes(optionIndex)).length;
        return {
          index: optionIndex,
          ...normalizeDemoOption(option, optionIndex),
          is_correct: correctIds.includes(option.id),
          selected_count: selectedCount,
          selected_pct: Number(((selectedCount / Math.max(1, plays.length)) * 100).toFixed(2)),
        };
      });
    }
    if (tt === "MATCHING") {
      const expectedPairs = Array.isArray(correct.pairs) ? correct.pairs : [];
      detail.pair_stats = expectedPairs.map((pair, pairIndex) => {
        const correctCount = plays.filter((play) => {
          const submitted = (play.answer?.pairs || []).find((candidate) => Number(candidate?.aIndex) === Number(pair.aIndex));
          return submitted && Number(submitted.bIndex) === Number(pair.bIndex);
        }).length;
        const totalPair = plays.length;
        return {
          index: pairIndex,
          aIndex: Number(pair.aIndex),
          bIndex: Number(pair.bIndex),
          a: (config.colA || [])[Number(pair.aIndex)] ?? null,
          b: (config.colB || [])[Number(pair.bIndex)] ?? null,
          correct_count: correctCount,
          incorrect_count: totalPair - correctCount,
          pct_correct: totalPair ? Number(((correctCount / totalPair) * 100).toFixed(2)) : 0,
          pct_incorrect: totalPair ? Number((((totalPair - correctCount) / totalPair) * 100).toFixed(2)) : 0,
        };
      });
    }
    if (tt === "CROSSWORD") {
      const words = Array.isArray(correct.answers) && correct.answers.length ? correct.answers : (Array.isArray(config.answers) ? config.answers : []);
      detail.word_stats = words.map((word, wordIndex) => {
        const key = String(word || "").trim().toLowerCase();
        const correctCount = plays.filter((play) => ((play.result.words || []).map((found) => String(found || "").trim().toLowerCase()).includes(key))).length;
        const totalWord = plays.length;
        return { index: wordIndex, word, correct_count: correctCount, incorrect_count: totalWord - correctCount, pct_correct: totalWord ? Number(((correctCount / totalWord) * 100).toFixed(2)) : 0, pct_incorrect: totalWord ? Number((((totalWord - correctCount) / totalWord) * 100).toFixed(2)) : 0 };
      });
    }

    // Blend in any real (guest/student) responses to this question instead of
    // showing bot-only numbers - a teacher who lets real people join the
    // tutorial session should see them reflected here, not just the bots.
    const realQuestion = realQuestionsById.get(detail.question_id) || realBaseQuestions[index] || null;
    const realTotal = Number(realQuestion?.total_answers || 0);
    if (realQuestion && realTotal > 0) {
      const realCorrect = Number(realQuestion.correct_answers || 0);
      detail.total_answers += realTotal;
      detail.correct_answers += realCorrect;
      detail.incorrect_answers = Math.max(0, detail.total_answers - detail.correct_answers);
      detail.pct_correct = Number(((detail.correct_answers / detail.total_answers) * 100).toFixed(2));
      detail.pct_incorrect = Number((100 - detail.pct_correct).toFixed(2));
      if (Array.isArray(detail.choice_stats) && Array.isArray(realQuestion.choice_stats)) {
        detail.choice_stats = detail.choice_stats.map((option) => {
          const realOption = realQuestion.choice_stats.find((row) => String(row.id) === String(option.id)) || realQuestion.choice_stats[option.index];
          const selected_count = option.selected_count + Number(realOption?.selected_count || 0);
          return { ...option, selected_count, selected_pct: Number(((selected_count / detail.total_answers) * 100).toFixed(2)) };
        });
      }
      if (Array.isArray(detail.pair_stats) && Array.isArray(realQuestion.pair_stats)) {
        detail.pair_stats = detail.pair_stats.map((pair) => {
          const realPair = realQuestion.pair_stats[pair.index];
          const correct_count = pair.correct_count + Number(realPair?.correct_count || 0);
          const incorrect_count = pair.incorrect_count + Number(realPair?.incorrect_count || 0);
          const totalPair = correct_count + incorrect_count;
          return { ...pair, correct_count, incorrect_count, pct_correct: totalPair ? Number(((correct_count / totalPair) * 100).toFixed(2)) : 0, pct_incorrect: totalPair ? Number(((incorrect_count / totalPair) * 100).toFixed(2)) : 0 };
        });
      }
      if (Array.isArray(detail.word_stats) && Array.isArray(realQuestion.word_stats)) {
        detail.word_stats = detail.word_stats.map((wordStat) => {
          const realWord = realQuestion.word_stats[wordStat.index];
          const correct_count = wordStat.correct_count + Number(realWord?.correct_count || 0);
          const incorrect_count = wordStat.incorrect_count + Number(realWord?.incorrect_count || 0);
          const totalWord = correct_count + incorrect_count;
          return { ...wordStat, correct_count, incorrect_count, pct_correct: totalWord ? Number(((correct_count / totalWord) * 100).toFixed(2)) : 0, pct_incorrect: totalWord ? Number(((incorrect_count / totalWord) * 100).toFixed(2)) : 0 };
        });
      }
    }
    return detail;
  });

  const botStudents = BOT_SKILLS.map((bot, botIndex) => {
    const responses = questions.map((question, questionIndex) => {
      const play = botPlays[botIndex][questionIndex];
      return {
        question_id: question.question_id,
        answer: play.answer,
        is_correct: !!play.result.isCorrect,
        points_awarded: Math.max(0, Number(play.earned || 0)),
        answered_at: session.display_date || new Date().toISOString(),
      };
    });
    return {
      participant_id: -101 - botIndex,
      first_name: "ThinkBOT",
      last_name: String(botIndex + 1),
      participant_type: "STUDENT",
      joined_at: session.display_date || new Date().toISOString(),
      total_points: Math.max(0, responses.reduce((sum, response) => sum + Number(response.points_awarded || 0), 0)),
      completion_ms: 25000 + botIndex * 9000,
      responses,
    };
  });
  // Real participants (guests included) sit alongside the bots rather than
  // being replaced by them.
  const realStudents = Array.isArray(base?.students) ? base.students : [];
  const students = [...realStudents, ...botStudents];
  const values = students.map((student) => Number(student.total_points || 0));
  const realGuestCount = Number(base?.summary?.guest_count || 0);
  const realStudentCount = Number(base?.summary?.student_count ?? realStudents.length);
  return {
    ...(base || {}),
    session,
    questions,
    students,
    summary: {
      ...(base?.summary || {}),
      participant_count: realStudentCount + realGuestCount + 3,
      student_count: realStudentCount + 3,
      guest_count: realGuestCount,
      avg_score: values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1)) : 0,
      min_score: values.length ? Math.min(...values) : 0,
      max_score: values.length ? Math.max(...values) : 0,
    },
  };
}
function buildTutorialDemoTabs(realTabMonitoring) {
  const botRows = [1, 2, 3].map((number) => ({ participant_id: -100 - number, first_name: "ThinkBOT", last_name: String(number), tab_out_count: 0 }));
  const realRows = Array.isArray(realTabMonitoring) ? realTabMonitoring : [];
  return [...realRows, ...botRows];
}
function parseMaybeJson(value) { if (!value) return {}; if (typeof value === "object") return value; try { return JSON.parse(value); } catch { return {}; } }
function normalizeDemoOption(option, index) { if (option && typeof option === "object") return { id: String(option.id || `option-${index + 1}`), text: String(option.text ?? option.label ?? ""), image: String(option.image ?? "") }; return { id: `option-${index + 1}`, text: String(option ?? ""), image: "" }; }

function buildScores(analytics, advancedPlan = false) {
  const isGroup = analytics?.session?.join_mode === "GROUP" && Array.isArray(analytics?.groups);
  if (isGroup) return (analytics.groups || []).map((group) => ({ key: group.group_key, group_key: group.group_key, label: group.display_name, total_points: Number(group.total_points || 0), competitive_points: Number(group.competitive_points || 0), completion_ms: group.completion_ms, member_count: group.member_count })).sort(sortScore);
  const students = analytics?.students || [];
  return students.map((student) => ({ key: student.participant_id, participant_id: student.participant_id, label: `${student.first_name || ""} ${student.last_name || ""}`.trim() || `Student ${student.participant_id}`, total_points: Number(student.total_points || 0), competitive_points: Number(student.competitive_points || 0), completion_ms: student.completion_ms })).sort(sortScore);
}
function sortScore(a, b) { return Number(b.total_points || 0) - Number(a.total_points || 0) || Number(a.completion_ms ?? Number.MAX_SAFE_INTEGER) - Number(b.completion_ms ?? Number.MAX_SAFE_INTEGER) || String(a.label).localeCompare(String(b.label)); }
function formatDate(value) { if (!value) return "No date"; const formatted = manilaDateTime(value, { dateStyle: "medium", timeStyle: "short" }); return formatted || String(value); }
// session.display_date is a string the server already formatted for the PDF/Excel
// exports (which can't do their own client-side Intl formatting) - re-parsing an
// already human-formatted string here would depend on the *viewer's* browser
// timezone to interpret it, reintroducing the exact bug this file is fixing. The
// raw ended_at/started_at/created_at fields are plain ISO timestamps and are
// always present on the same session object; prefer those for on-screen display.
function sessionDisplayTimestamp(session) { return session?.ended_at || session?.started_at || session?.created_at || session?.display_date; }
function palette(c, dark) { return { text: c.text, muted: c.textMuted || c.textSub, border: c.border, cardBg: c.cardBg, cardBg2: c.cardBg2, accent: c.accent, redFg: c.redFg || "#b91c1c", redBg: c.redBg || (dark ? "rgba(239,68,68,.12)" : "#fef2f2"), redBorder: c.redBorder || "rgba(239,68,68,.35)", greenFg: c.greenFg || "#15803d", greenBg: c.greenBg || (dark ? "rgba(34,197,94,.12)" : "#f0fdf4"), greenBorder: c.greenBorder || "rgba(34,197,94,.35)" }; }
function card(C) { return { background: C.cardBg, border: `3px solid ${C.border}`, borderRadius: 20, padding: 18, boxShadow: "0 16px 38px rgba(15,23,42,.08)", transition: "transform .22s ease, box-shadow .22s ease, border-color .22s ease" }; }
function subCard(C) { return { background: C.cardBg2, border: `3px solid ${C.border}`, borderRadius: 17, padding: 15, transition: "transform .22s ease, box-shadow .22s ease" }; }
function emptyCard(C) { return { color: C.muted, textAlign: "center", padding: 24, borderRadius: 15, border: `1px dashed ${C.border}`, background: C.cardBg2, fontWeight: 750 }; }
function sectionTitle(C) { return { color: C.text, fontWeight: 950, marginBottom: 11 }; }
function pill(C) { return { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "5px 9px", borderRadius: 999, border: `1px solid ${C.border}`, background: C.cardBg2, color: C.text, fontSize: 12, fontWeight: 850, whiteSpace: "nowrap" }; }

function MetricCard({ C, tone, label, value }) { return <div className="tw-metric-card" style={{ ...subCard(C), background: tone.softBg, borderColor: tone.border }}><div className="tw-metric-label text-[11px] uppercase tracking-[.08em] font-[900]" style={{ color: tone.accent }}>{label}</div><div className="tw-metric-value text-[27px] font-[950] mt-[7px]" style={{ color: C.text }}>{value}</div></div>; }
function getScoreNames(analytics, kind) {
  if (analytics?.session?.join_mode === "GROUP" && Array.isArray(analytics?.groups) && analytics.groups.length) {
    const scores = analytics.groups.map((g) => Number(g.total_points || 0));
    const target = kind === "highest" ? Math.max(...scores) : Math.min(...scores);
    return analytics.groups
      .filter((g) => Number(g.total_points || 0) === target)
      .map((g) => g.display_name)
      .sort((a, b) => a.localeCompare(b));
  }
  const students = analytics?.students || [];
  if (!students.length) return [];
  const scores = students.map((s) => Number(s.total_points || 0));
  const target = kind === "highest" ? Math.max(...scores) : Math.min(...scores);
  return students
    .filter((s) => Number(s.total_points || 0) === target)
    .map((s) => `${s.first_name || ""} ${s.last_name || ""}`.trim() || `Student ${s.participant_id}`)
    .sort((a, b) => a.localeCompare(b));
}
function ExpandableScoreCard({ C, tone, label, value, names, expanded, shrunk, onToggle }) {
  return <button type="button" onClick={onToggle} aria-expanded={expanded} title={expanded ? `Collapse ${label}` : `Expand ${label} top scorers`} className={`tw-metric-card tw-metric-expandable${expanded ? " is-expanded" : ""}${shrunk ? " is-shrunk" : ""}`} style={{ ...subCard(C), background: tone.softBg, borderColor: tone.border, cursor: "pointer", textAlign: "left", width: "100%" }}>
    <div className="tw-metric-label text-[11px] uppercase tracking-[.08em] font-[900]" style={{ color: tone.accent }}>{label}</div>
    <div className="tw-metric-value-wrap">
      <div className="tw-metric-value text-[27px] font-[950] mt-[7px]" style={{ color: C.text }}>{value}</div>
      <div className="tw-metric-names" aria-hidden={!expanded} style={{ color: C.text }}>{names.length ? names.map((n) => <span key={n} className="tw-metric-name" style={{ color: C.text }}>{n}</span>) : <span className="tw-metric-name is-empty" style={{ color: C.text }}>No scores yet</span>}</div>
    </div>
  </button>;
}
function presenceStatus(student = {}) {
  if (student?.kicked_at) return { label: "Kicked", color: "#ef4444" };
  if (Number(student?.response_count || 0) === 0) return { label: "Never answered", color: "#94a3b8" };
  if (Number(student?.connected) === 1) return { label: "Online", color: "#22c55e" };
  return { label: "Offline", color: "#f59e0b" };
}
function StudentChip({ name, C, student }) {
  const status = presenceStatus(student);
  return <span style={{ ...pill(C), padding: "8px 11px" }} title={status.label}><span className="w-[8px] h-[8px] rounded-[99px]" style={{ background: status.color, boxShadow: `0 0 0 4px ${status.color}1f` }} />{name || "Student"}</span>;
}
