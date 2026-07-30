/* FILE GUIDE:
 * client/src/pages/student/StudentDashboard.jsx
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, setAuthToken } from "../../lib/api";
import { clearRole, clearToken } from "../../lib/auth";
import { useColors, useTheme } from "../../context/ThemeContext";
import { TwIcon } from "../../components/TwUI";
import ThemeIconButton from "../../components/ThemeIconButton";
import { templateLabel, templateTone } from "../../lib/templatePalette";
import { TeacherActionModal, TeacherPressButton, ThinkBotEmptyState } from "../teacher/TeacherUI";


export default function StudentDashboard() {
  const c = useColors();
  const { dark, toggleTheme } = useTheme();
  const nav = useNavigate();
  const fileRef = useRef(null);
  const [activeTab, setActiveTab] = useState("home");
  const [data, setData] = useState({ assignments: [], classes: [], recentAssigned: [], recentLive: [], openLiveSessions: [], profile: null, weekStats: {}, achievementStats: {} });
  const [joinOpen, setJoinOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [showLogout, setShowLogout] = useState(false);
  const [classCode, setClassCode] = useState("");
  const [joinProfileStep, setJoinProfileStep] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const [msg, setMsg] = useState("");
  const [profileMsg, setProfileMsg] = useState("");
  const [profileSaved, setProfileSaved] = useState(false);
  const [joiningSession, setJoiningSession] = useState(null);
  const [analyticsTarget, setAnalyticsTarget] = useState(null);
  const [profile, setProfile] = useState(emptyProfile());
  const [birthPickerOpen, setBirthPickerOpen] = useState(false);
  const [achievementsOpen, setAchievementsOpen] = useState(false);

  async function load({ silent = false } = {}) {
    try {
      const response = await api.get("/student/dashboard");
      const next = response.data || {};
      setData(next);
      setProfile((current) => profileFromData(next, current));
    } catch (error) {
      if (!silent) setMsg(error?.response?.data?.message || "Unable to load your dashboard.");
    }
  }

  useEffect(() => {
    load();
    const timer = setInterval(() => load({ silent: true }), 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!joinProfileStep) return;
    setCountdown(10);
    const timer = setInterval(() => setCountdown((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [joinProfileStep]);

  async function joinClass(event) {
    event.preventDefault();
    setMsg("");
    try {
      const payload = { classCode: classCode.trim().toUpperCase() };
      if (joinProfileStep) {
        payload.profile = {
          firstName: String(profile.firstName || "").trim(),
          lastName: String(profile.lastName || "").trim(),
          middleInitial: String(profile.middleInitial || "").trim() || undefined,
          studentId: String(profile.studentId || "").trim(),
        };
      }
      await api.post("/student/classes/join", payload);
      setJoinOpen(false);
      setJoinProfileStep(false);
      setClassCode("");
      await load();
    } catch (error) {
      if (error?.response?.data?.message === "PROFILE_REQUIRED") setJoinProfileStep(true);
      else setMsg(error?.response?.data?.message || "Could not join class.");
    }
  }

  async function saveProfile(event) {
    event.preventDefault();
    setProfileMsg("");
    try {
      await api.post("/student/profile", profile);
      await load({ silent: true });
      setProfileOpen(false);
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2000);
    } catch (error) {
      setProfileMsg(error?.response?.data?.message || "Unable to save Student Info.");
    }
  }

  function uploadProfile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return setProfileMsg("Please choose an image file.");
    if (file.size > 2_000_000) return setProfileMsg("Please choose an image smaller than 2 MB.");
    const reader = new FileReader();
    reader.onload = () => setProfile((current) => ({ ...current, profileImage: String(reader.result || "") }));
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  async function deleteProfileImage() {
    setProfile((current) => ({ ...current, profileImage: "" }));
    try {
      await api.delete("/student/profile/image");
      await load({ silent: true });
    } catch (error) {
      setProfileMsg(error?.response?.data?.message || "Unable to delete the profile image.");
    }
  }

  async function joinLiveSession(session) {
    setJoiningSession(session.session_id);
    setMsg("");
    try {
      const { data: joined } = await api.post(`/student/live-sessions/${session.session_id}/join`);
      localStorage.setItem("qz_reconnectKey", joined.reconnectKey);
      localStorage.setItem("qz_participantId", String(joined.participantId));
      localStorage.setItem("qz_sessionId", String(joined.sessionId));
      localStorage.setItem("qz_joinMode", joined.joinMode || "SOLO");
      nav(`/play/${joined.sessionId}`);
    } catch (error) {
      setMsg(error?.response?.data?.message || "Unable to join this live session.");
      setJoiningSession(null);
    }
  }

  function doLogout() {
    clearToken();
    clearRole();
    setAuthToken("");
    nav("/");
  }

  const navItems = [
    { id: "home", label: "Home", icon: "home" },
    { id: "classes", label: "Class", icon: "classes" },
  ];

  return (
    <div className="tw-responsive-dashboard" style={{ display: "flex", minHeight: "100vh", background: c.pageBg, transition: "background .3s" }}>
      <aside data-sidebar="true" className="tw-responsive-sidebar" style={sidebar(c)}>
        <div style={{ padding: "26px 18px 22px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${c.sidebarBorder}`, marginBottom: 12 }}>
          <div><span style={{ fontSize: 20, fontWeight: 900, color: "#e7e9ee" }}>Think</span><span style={{ fontSize: 20, fontWeight: 900, color: "#2b6cff" }}>WAVE</span></div>
          <button onClick={() => setProfileOpen(true)} title="Student Info" style={profileGearBtn(c)}>{profile.profileImage ? <img src={profile.profileImage} alt="Student profile" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <TwIcon name="user" size={20} />}</button>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 4, padding: "0 12px", flex: 1 }}>
          {navItems.map((item) => <button key={item.id} onClick={() => setActiveTab(item.id)} style={navBtn(c, activeTab === item.id)}><span style={{ width: 20, display: "inline-flex", justifyContent: "center" }}><TwIcon name={item.icon} size={18} /></span><span>{item.label}</span></button>)}
        </nav>

        <div style={{ padding: "0 12px", display: "flex", gap: 8, alignItems: "center" }}>
          <ThemeIconButton dark={dark} onClick={toggleTheme} style={{ color: c.navColor, borderColor: c.sidebarBorder, background: "transparent", flex: "0 0 auto" }} size={17} />
          <button onClick={() => setShowLogout(true)} style={{ ...sideAction(c), flex: 1, justifyContent: "center" }}><TwIcon name="logout" size={17} /><span>Logout</span></button>
        </div>
      </aside>

      <main className="tw-responsive-dashboard-main" style={{ marginLeft: 220, width: "calc(100% - 220px)", flex: 1, minHeight: "100vh", overflowY: "scroll", overflowX: "hidden", scrollbarGutter: "stable both-edges", boxSizing: "border-box" }}>
        {msg && <div className="container" style={{ paddingBottom: 0 }}><div style={notice(c, "error")}>{msg}</div></div>}
        {activeTab === "home" ? (
          <HomePanel c={c} dark={dark} data={data} nav={nav} onJoinLive={joinLiveSession} joiningSession={joiningSession} onAnalytics={setAnalyticsTarget} onOpenAchievements={() => setAchievementsOpen(true)} />
        ) : (
          <ClassesPanel c={c} data={data} onJoinClass={() => setJoinOpen(true)} onAnalytics={setAnalyticsTarget} />
        )}
      </main>

      {joinOpen && <JoinClassModal c={c} classCode={classCode} setClassCode={setClassCode} profile={profile} setProfile={setProfile} profileStep={joinProfileStep} countdown={countdown} onSubmit={joinClass} onClose={() => { setJoinOpen(false); setJoinProfileStep(false); setClassCode(""); }} />}
      {profileOpen && <ProfileModal c={c} profile={profile} setProfile={setProfile} message={profileMsg} onSubmit={saveProfile} onClose={() => { setProfileOpen(false); setProfileMsg(""); }} onUpload={() => fileRef.current?.click()} onDelete={deleteProfileImage} onBirth={() => setBirthPickerOpen(true)} />}
      <input ref={fileRef} type="file" accept="image/*" onChange={uploadProfile} style={{ display: "none" }} />
      {birthPickerOpen && <BirthDateModal c={c} value={profile.birthDate} onSelect={(birthDate) => { setProfile((current) => ({ ...current, birthDate })); setBirthPickerOpen(false); }} onClose={() => setBirthPickerOpen(false)} />}
      {analyticsTarget && <StudentAnalyticsModal c={c} target={analyticsTarget} onClose={() => setAnalyticsTarget(null)} />}
      {achievementsOpen && <AchievementModal c={c} dark={dark} achievements={buildAchievements(data.achievementStats || {})} onClose={() => setAchievementsOpen(false)} />}
      {profileSaved && <ProfileSavedOverlay />}
      {showLogout && <TeacherActionModal c={c} icon="logout" title="Logout" message="Are you sure you want to log out of the student dashboard?" tone="red" confirmLabel="Yes, Logout" hideCancel onClose={() => setShowLogout(false)} onConfirm={doLogout} />}
    </div>
  );
}

const ACHIEVEMENT_DEFINITIONS = [
  { id: "answer-1", title: "First Answer", metric: "questionsAnswered", target: 1, unit: "questions answered", tone: "blue" },
  { id: "answer-10", title: "Getting Started", metric: "questionsAnswered", target: 10, unit: "questions answered", tone: "blue" },
  { id: "answer-30", title: "Curious Mind", metric: "questionsAnswered", target: 30, unit: "questions answered", tone: "blue" },
  { id: "answer-50", title: "Question Explorer", metric: "questionsAnswered", target: 50, unit: "questions answered", tone: "blue" },
  { id: "answer-100", title: "Century Solver", metric: "questionsAnswered", target: 100, unit: "questions answered", tone: "blue" },
  { id: "correct-1", title: "Correct Start", metric: "questionsCorrect", target: 1, unit: "correct answers", tone: "green" },
  { id: "correct-10", title: "Accuracy Apprentice", metric: "questionsCorrect", target: 10, unit: "correct answers", tone: "green" },
  { id: "correct-30", title: "Sharp Thinker", metric: "questionsCorrect", target: 30, unit: "correct answers", tone: "green" },
  { id: "correct-50", title: "Accuracy Expert", metric: "questionsCorrect", target: 50, unit: "correct answers", tone: "green" },
  { id: "correct-100", title: "Master Mind", metric: "questionsCorrect", target: 100, unit: "correct answers", tone: "green" },
  { id: "wrong-5", title: "Learning From Mistakes", metric: "questionsIncorrect", target: 5, unit: "incorrect answers reviewed", tone: "orange" },
  { id: "wrong-20", title: "Keep Trying", metric: "questionsIncorrect", target: 20, unit: "incorrect answers reviewed", tone: "orange" },
  { id: "quick-1", title: "Quick Starter", metric: "quickCorrect", target: 1, unit: "quick correct answers", tone: "purple" },
  { id: "quick-10", title: "Lightning Mind", metric: "quickCorrect", target: 10, unit: "quick correct answers", tone: "purple" },
  { id: "assigned-1", title: "First Assignment", metric: "assignedCompleted", target: 1, unit: "assigned sessions completed", tone: "pink" },
  { id: "assigned-5", title: "Assignment Regular", metric: "assignedCompleted", target: 5, unit: "assigned sessions completed", tone: "pink" },
  { id: "live-1", title: "Live Learner", metric: "liveCompleted", target: 1, unit: "live sessions completed", tone: "teal" },
  { id: "live-5", title: "Live Session Fan", metric: "liveCompleted", target: 5, unit: "live sessions completed", tone: "teal" },
  { id: "class-1", title: "Classroom Member", metric: "classesJoined", target: 1, unit: "classes joined", tone: "yellow" },
  { id: "class-3", title: "Community Learner", metric: "classesJoined", target: 3, unit: "classes joined", tone: "yellow" },
];

function buildAchievements(stats) {
  return ACHIEVEMENT_DEFINITIONS.map((definition) => {
    const value = Math.max(0, Number(stats?.[definition.metric] || 0));
    return { ...definition, value, completed: value >= definition.target };
  });
}

function HomePanel({ c, dark, data, nav, onJoinLive, joiningSession, onAnalytics, onOpenAchievements }) {
  const assignments = data.assignments || [];
  const recentAssigned = data.recentAssigned || data.recentCompleted || [];
  const recentLive = data.recentLive || [];
  const openLive = data.openLiveSessions || [];
  const weekStats = data.weekStats || {};
  const now = Date.now();
  const allOpenAssigned = assignments.filter((item) => !item.submission_id && isAssignmentOpen(item, now));
  const upcoming = assignments.filter((item) => !item.submission_id && assignmentStart(item) > now);
  const nearing = allOpenAssigned.filter((item) => assignmentEnd(item) - now <= 2 * 60 * 60 * 1000);
  const openAssigned = allOpenAssigned.filter((item) => assignmentEnd(item) - now > 2 * 60 * 60 * 1000);
  const weekAssignments = assignments.filter((item) => isThisWeek(item.available_from || item.submitted_at));
  const answeredThisWeek = weekAssignments.filter((item) => item.submission_id).length;
  const unansweredThisWeek = Math.max(0, weekAssignments.length - answeredThisWeek);
  const liveTotal = Number(weekStats.liveThisWeek || 0);
  const achievements = buildAchievements(data.achievementStats || {});
  const recentLiveTop = [...recentLive].sort((a, b) => completedTimestamp(b) - completedTimestamp(a)).slice(0, 1);
  const recentAssignedTop = [...recentAssigned].sort((a, b) => completedTimestamp(b) - completedTimestamp(a)).slice(0, 1);

  return <div className="container" style={{ display: "grid", gap: 18 }}>
    <section><h2 style={{ color: c.text, marginBottom: 4 }}>Student Home</h2></section>

    <section style={card(c)}>
      <div style={sectionHeader(c)}><div><h3 style={{ margin: 0 }}>Achievements</h3><div style={{ color: c.textMuted, fontSize: 13, marginTop: 5 }}>Complete activities to bring each achievement card to life.</div></div><TeacherPressButton tone="blue" onClick={onOpenAchievements}>View Achievements</TeacherPressButton></div>
      <AchievementCarousel c={c} dark={dark} achievements={achievements} />
      <div className="tw-student-overview-grid">
        <div className="tw-student-work-grid">
          <LiveSessionsCard c={c} dark={dark} sessions={openLive} onJoin={onJoinLive} joiningSession={joiningSession} />
          <WorkCard c={c} dark={dark} title="Ready to answer" icon="check" items={openAssigned} empty="No assigned works are open right now." variant="ready" render={(item) => <WorkItem key={item.quiz_id} c={c} item={item} variant="ready" action={<TeacherPressButton tone="blue" className="tw-student-live-action" onClick={() => nav(`/student/async/${item.quiz_id}`)}>Answer Now</TeacherPressButton>} />} />
          <WorkCard c={c} dark={dark} title="Upcoming works" icon="calendar" items={upcoming} empty="No scheduled works are waiting to open." variant="upcoming" render={(item) => <WorkItem key={item.quiz_id} c={c} item={item} />} />
          <WorkCard c={c} dark={dark} title="Nearing deadline" icon="alert" items={nearing} empty="No works are due within the next 2 hours." variant="deadline" render={(item) => <WorkItem key={item.quiz_id} c={c} item={item} variant="deadline" action={<TeacherPressButton tone="blue" className="tw-student-live-action" onClick={() => nav(`/student/async/${item.quiz_id}`)}>Answer Now</TeacherPressButton>} />} />
        </div>
        <div className="tw-student-progress-panel" style={{ display: "grid", gap: 16, alignContent: "start", padding: 18, borderRadius: 18, background: c.cardBg2, border: `1px solid ${c.border}` }}>
          <div style={{ color: c.text, fontWeight: 950 }}>Weekly Progress</div>
          <ProgressLine c={c} label="Answered assigned work" value={answeredThisWeek} total={weekAssignments.length} accent="#22c55e" />
          <ProgressLine c={c} label="Unanswered assigned work" value={unansweredThisWeek} total={weekAssignments.length} accent="#f97316" />
          <ProgressLine c={c} label="Attended live sessions" value={Number(weekStats.liveAttended || 0)} total={liveTotal} accent="#2b6cff" />
          <ProgressLine c={c} label="Unattended live sessions" value={Number(weekStats.liveUnattended || 0)} total={liveTotal} accent="#ef4444" />
        </div>
      </div>
    </section>

    <section style={card(c)}>
      <h3 style={{ marginTop: 0, color: c.text }}>Most Recent Completed Sessions</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(290px,1fr))", gap: 22 }}>
        <CompletedColumn c={c} title="Live Session" items={recentLiveTop} type="LIVE" onAnalytics={onAnalytics} />
        <CompletedColumn c={c} title="Assigned Session" items={recentAssignedTop} type="ASSIGNED" onAnalytics={onAnalytics} />
      </div>
    </section>
  </div>;
}

function AchievementCarousel({ c, dark, achievements }) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(achievements.length / 4));
  const visible = achievements.slice(page * 4, page * 4 + 4);
  function move(delta) { setPage((current) => Math.min(pageCount - 1, Math.max(0, current + delta))); }
  return <div className="tw-achievement-carousel">
    <button type="button" aria-label="Previous achievements" disabled={page === 0} onClick={() => move(-1)} className="tw-achievement-arrow is-left" style={{ color: c.text, borderColor: c.border, background: c.cardBg2 }}><TwIcon name="arrow" size={21} /></button>
    <div key={page} className="tw-achievement-page">{visible.map((item) => <AchievementCard key={item.id} c={c} dark={dark} item={item} />)}</div>
    <button type="button" aria-label="Next achievements" disabled={page >= pageCount - 1} onClick={() => move(1)} className="tw-achievement-arrow" style={{ color: c.text, borderColor: c.border, background: c.cardBg2 }}><TwIcon name="arrow" size={21} /></button>
  </div>;
}

function AchievementCard({ c, dark, item }) {
  const palettes = {
    blue: ["#a9c3ff", "#204aa8"], green: ["#9ee6b6", "#126532"], orange: ["#ffd08a", "#944807"],
    purple: ["#c8b5ff", "#5b239f"], pink: ["#f8b4d9", "#8f245b"], teal: ["#91e2da", "#0c625b"], yellow: ["#ffe38e", "#8a6200"],
  };
  const [lightBg, darkBg] = palettes[item.tone] || palettes.blue;
  const completeBg = dark ? darkBg : lightBg;
  const paleBg = dark ? "#17233d" : "#eef1f6";
  const ink = item.completed ? (dark ? "#fff" : "#101827") : c.textMuted;
  const progress = Math.min(item.target, item.value);
  return <article className={`tw-achievement-card${item.completed ? " is-complete" : ""}`} style={{ background: item.completed ? completeBg : paleBg, color: ink, borderColor: item.completed ? completeBg : c.border }}>
    <div className="tw-achievement-card-title">{item.title}</div>
    <div className="tw-achievement-progress">{progress} / {item.target} {item.unit}</div>
    <div className="tw-achievement-track"><span style={{ width: `${Math.min(100, item.value / item.target * 100)}%` }} /></div>
  </article>;
}

function AchievementModal({ c, dark, achievements, onClose }) {
  return <div style={modalBackdrop} onClick={onClose}><section onClick={(event) => event.stopPropagation()} style={{ ...card(c), width: "min(94vw,1040px)", maxHeight: "88vh", overflowY: "auto", position: "relative" }}>
    <button onClick={onClose} style={{ ...iconBtn(c), position: "absolute", top: 14, right: 14 }}><TwIcon name="close" size={18} /></button>
    <h2 style={{ marginTop: 0, color: c.text }}>Achievements</h2>
    <p style={{ color: c.textMuted, marginTop: -4 }}>All 20 starter achievements and your current progress.</p>
    <div className="tw-achievement-modal-grid">{achievements.map((item) => <AchievementCard key={item.id} c={c} dark={dark} item={item} />)}</div>
  </section></div>;
}

function ClassesPanel({ c, data, onJoinClass, onAnalytics }) {
  const classes = data.classes || [];
  const assigned = data.recentAssigned || data.recentCompleted || [];
  const live = data.recentLive || [];
  return <div className="container" style={{ display: "grid", gap: 18 }}>
    <section style={sectionHeader(c)}><div><h2 style={{ marginBottom: 4 }}>Class</h2></div>{classes.length > 0 && <TeacherPressButton tone="blue" onClick={onJoinClass}>Join a Class</TeacherPressButton>}</section>
    {!classes.length ? <ThinkBotEmptyState c={c} title="It seems you have yet to join a class." actionLabel="Join a Class" onAction={onJoinClass} /> : <section style={card(c)}>
      <h3 style={{ marginTop: 0 }}>Joined Classes</h3>
      <div style={{ display: "grid", gap: 16 }}>{classes.map((item) => <JoinedClassCard key={item.enrollment_id} c={c} item={item} live={live.filter((session) => Number(session.class_id) === Number(item.class_id))} assigned={assigned.filter((session) => Number(session.class_id) === Number(item.class_id))} onAnalytics={onAnalytics} />)}</div>
    </section>}
  </div>;
}

function JoinedClassCard({ c, item, live, assigned, onAnalytics }) {
  const [expanded, setExpanded] = useState(false);
  const subjectName = item.parent_name || item.class_name || "Subject";
  return <article style={{ ...card(c), padding: 0, background: c.cardBg2, overflow: "hidden" }}>
    <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} style={{ width: "100%", border: 0, background: "transparent", color: c.text, padding: 16, cursor: "pointer", fontFamily: "inherit", textAlign: "left", display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center" }}>
      <div style={{ minWidth: 0, display: "grid", gap: 5 }}>
        <div style={{ color: c.text, fontWeight: 950, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{subjectName}</div>
        <div style={{ color: c.textMuted, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Class/Section: {item.class_name}</div>
        <div style={{ color: c.textMuted, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Teacher: {item.teacher_first_name} {item.teacher_last_name}</div>
      </div>
      <span style={{ color: c.accent, flexShrink: 0, transform: expanded ? "rotate(-90deg)" : "rotate(90deg)", transition: "transform .2s ease" }}><TwIcon name="arrow" size={21} /></span>
    </button>
    {expanded && <div style={{ padding: "0 16px 16px", borderTop: `1px solid ${c.border}` }}>
      <div style={{ marginTop: 14, color: c.textMuted, fontSize: 12 }}>Student ID: {item.student_id}</div>
      <div style={{ marginTop: 14, fontSize: 12, textTransform: "uppercase", letterSpacing: ".1em", color: c.textSub, fontWeight: 950 }}>Analytics</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 18, marginTop: 10 }}>
        <CompletedColumn c={c} title="Live Sessions" items={live} type="LIVE" onAnalytics={onAnalytics} compact />
        <CompletedColumn c={c} title="Assigned Sessions" items={assigned} type="ASSIGNED" onAnalytics={onAnalytics} compact />
      </div>
    </div>}
  </article>;
}

function CompletedColumn({ c, title, items, type, onAnalytics, compact = false }) {
  return <div style={{ display: "grid", alignContent: "start", gap: 10 }}><div style={{ color: c.text, fontWeight: 950 }}>{title}</div>{!items.length ? <div style={{ ...empty(c), padding: compact ? 14 : 22 }}>No completed {type === "LIVE" ? "live" : "assigned"} sessions yet.</div> : items.map((item) => <CompletedSessionCard key={`${type}-${item.session_id || item.quiz_id || item.id}`} c={c} item={item} type={type} onClick={() => onAnalytics({ type, id: type === "LIVE" ? item.session_id : item.quiz_id, title: item.quiz_title || item.title })} />)}</div>;
}

function CompletedSessionCard({ c, item, type, onClick }) {
  const tone = templateTone(item.template_type, c);
  return <button onClick={onClick} style={{ textAlign: "left", padding: 13, borderRadius: 15, border: `1.5px solid ${tone.border}`, background: tone.cardBg, color: c.text, cursor: "pointer", fontFamily: "inherit", transition: "transform .18s ease, box-shadow .18s ease" }} onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = tone.shadow; }} onMouseLeave={(e) => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; }}>
    <div style={{ color: tone.accent, fontSize: 11, fontWeight: 950, textTransform: "uppercase", letterSpacing: ".08em" }}>{templateLabel(item.template_type)}</div>
    <div style={{ fontWeight: 950, marginTop: 6 }}>{item.quiz_title || item.title || "Completed session"}</div>
    <div style={{ color: c.textMuted, fontSize: 12, marginTop: 5 }}>{item.class_name || "Class"}</div>
    <div style={{ color: tone.accent, fontWeight: 950, marginTop: 9 }}>{Number(item.score || 0)}{type === "ASSIGNED" ? ` / ${Number(item.max_score || 0)}` : " pts"}</div>
  </button>;
}

function studentWorkTone(dark, variant) {
  const palettes = {
    live: dark ? { bg: "#14532d", border: "#22c55e", fg: "#ffffff", accent: "#86efac" } : { bg: "#a7f3d0", border: "#16a34a", fg: "#0f172a", accent: "#15803d" },
    ready: dark ? { bg: "#0f766e", border: "#2dd4bf", fg: "#ffffff", accent: "#99f6e4" } : { bg: "#99f6e4", border: "#0f766e", fg: "#0f172a", accent: "#0f766e" },
    upcoming: dark ? { bg: "#1e3a8a", border: "#60a5fa", fg: "#ffffff", accent: "#bfdbfe" } : { bg: "#bfdbfe", border: "#2563eb", fg: "#0f172a", accent: "#1d4ed8" },
    deadline: dark ? { bg: "#9a3412", border: "#fb923c", fg: "#ffffff", accent: "#fed7aa" } : { bg: "#fed7aa", border: "#ea580c", fg: "#0f172a", accent: "#c2410c" },
  };
  return palettes[variant] || palettes.upcoming;
}

function LiveSessionsCard({ c, dark, sessions, onJoin, joiningSession }) {
  const tone = studentWorkTone(dark, "live");
  return <div style={{ ...workCard(c), background: tone.bg, border: `4px solid ${tone.border}`, color: tone.fg }}><div style={{ ...workTitle(c), color: tone.fg }}><TwIcon name="spark" size={18} /> Join live session</div>{!sessions.length ? <div style={{ color: tone.fg, fontSize: 13 }}>No live sessions are open right now.</div> : sessions.map((session) => {
    const status = session.status === "LOBBY" ? "Waiting in lobby" : session.status === "PAUSED" ? "Paused" : "Session started";
    return <div key={session.session_id} style={{ padding: 12, borderRadius: 14, background: c.cardBg, border: `2px solid ${tone.border}` }}><div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}><span style={{ color: tone.accent, fontSize: 11, fontWeight: 950 }}>{templateLabel(session.template_type)}</span><span className="tw-student-live-status" style={{ padding: "5px 10px", borderRadius: 999, background: dark ? "#6f4c00" : "#fff0ad", border: "2px solid #f59e0b", color: dark ? "#ffe8a3" : "#7a4b00", fontSize: 11, fontWeight: 950 }}>{status}</span></div><div style={{ color: c.text, fontWeight: 950, marginTop: 5 }}>{session.quiz_title}</div><div style={{ color: c.textMuted, fontSize: 12, margin: "5px 0 10px" }}>{session.class_name}</div><TeacherPressButton tone="blue" className="tw-student-live-action" disabled={joiningSession === session.session_id} onClick={() => onJoin(session)}>{joiningSession === session.session_id ? "Joining…" : session.status === "LOBBY" ? "Join Lobby" : "Join Current Question"}</TeacherPressButton></div>;
  })}</div>;
}

function WorkCard({ c, dark, title, icon, items, empty: emptyText, render, variant = "upcoming" }) {
  const tone = studentWorkTone(dark, variant);
  return <div style={{ ...workCard(c), background: tone.bg, border: `4px solid ${tone.border}`, color: tone.fg }}><div style={{ ...workTitle(c), color: tone.fg }}><TwIcon name={icon} size={18} />{title}</div>{!items.length ? <div style={{ color: tone.fg, fontSize: 13, lineHeight: 1.5 }}>{emptyText}</div> : items.map(render)}</div>;
}

function WorkItem({ c, item, action }) {
  const template = templateTone(item.template_type, c);
  return <div style={{ padding: 12, borderRadius: 14, background: c.cardBg, border: `2px solid ${template.border}` }}><div style={{ color: template.accent, fontSize: 11, fontWeight: 950 }}>{templateLabel(item.template_type)}</div><div style={{ color: c.text, fontWeight: 950, marginTop: 5 }}>{item.title}</div><div style={{ color: c.textMuted, fontSize: 12, lineHeight: 1.5, margin: "5px 0 9px" }}>{item.class_name} · {formatAssignmentWindow(item)}</div>{action}</div>;
}

function StudentAnalyticsModal({ c, target, onClose }) {
  const [payload, setPayload] = useState(null);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    const route = target.type === "LIVE" ? `/student/analytics/live/${target.id}` : `/student/analytics/assigned/${target.id}`;
    api.get(route).then(({ data }) => { if (alive) { setPayload(data); setIndex(0); } }).catch((err) => { if (alive) setError(err?.response?.data?.message || "Unable to load analytics."); });
    return () => { alive = false; };
  }, [target]);
  const questions = payload?.questions || [];
  const question = questions[index];
  const tone = templateTone(payload?.session?.template_type, c);
  return <div style={modalBackdrop}><div style={{ ...card(c), width: "min(94vw,680px)", maxHeight: "88vh", overflowY: "auto", position: "relative" }}><button onClick={onClose} style={{ ...iconBtn(c), position: "absolute", top: 14, right: 14 }}><TwIcon name="close" size={18} /></button><div style={{ color: tone.accent, fontWeight: 950, textTransform: "uppercase", fontSize: 12 }}>{templateLabel(payload?.session?.template_type)}</div><h3 style={{ color: c.text, paddingRight: 45 }}>{payload?.session?.title || target.title || "Session Analytics"}</h3>{error ? <div style={notice(c, "error")}>{error}</div> : !payload ? <div style={{ color: c.textMuted, padding: 30, textAlign: "center" }}>Loading analytics…</div> : !question ? <div style={empty(c)}>No question details are available.</div> : <div><div style={{ padding: 18, borderRadius: 18, border: `2px solid ${tone.border}`, background: tone.softBg }}><div style={{ color: tone.accent, fontWeight: 950, marginBottom: 10 }}>Question {question.number || index + 1}</div><div style={{ color: c.text, fontSize: 18, fontWeight: 950, lineHeight: 1.55 }}>{question.prompt || "Untitled question"}</div></div><div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 18, padding: 15, borderRadius: 16, background: question.isCorrect ? c.greenBg : c.redBg, color: question.isCorrect ? c.greenFg : c.redFg, border: `1px solid ${question.isCorrect ? c.greenBorder : c.redBorder}` }}><span style={{ fontSize: 25, fontWeight: 950 }}>{question.isCorrect ? "✓" : "✕"}</span><div><div style={{ fontWeight: 950 }}>{question.isCorrect ? "You answered right" : "You answered wrong"}</div>{question.isCorrect && <div style={{ marginTop: 5, fontSize: 13 }}>Answer: {formatAnswer(question.correctAnswer ?? question.answer)}</div>}</div></div><div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 20 }}>{index > 0 ? <button onClick={() => setIndex((value) => value - 1)} style={secondary(c)}>← Previous</button> : <span />}{index < questions.length - 1 && <button onClick={() => setIndex((value) => value + 1)} style={primary(c)}>Next →</button>}</div></div>}</div></div>;
}

function ProfileModal({ c, profile, setProfile, message, onSubmit, onClose, onUpload, onDelete, onBirth }) {
  return <div style={modalBackdrop}><form onSubmit={onSubmit} style={{ ...card(c), width: "min(94vw,600px)", maxHeight: "90vh", overflowY: "auto", position: "relative" }}>
    <button type="button" onClick={onClose} style={{ ...iconBtn(c), position: "absolute", top: 14, right: 14 }}><TwIcon name="close" size={18} /></button>
    <h3 style={{ marginTop: 0, color: c.text }}>Student Info</h3>
    <div style={{ display: "grid", placeItems: "center", marginBottom: 22 }}>
      <div style={{ position: "relative" }}>
        <button type="button" onClick={onUpload} aria-label="Upload profile picture" title="Upload profile picture" style={{ width: 105, height: 105, padding: 0, borderRadius: "50%", display: "grid", placeItems: "center", overflow: "hidden", border: `3px solid ${c.accent}`, background: c.cardBg2, color: c.text, cursor: "pointer", transition: "transform .2s ease, box-shadow .2s ease" }}>
          {profile.profileImage ? <img src={profile.profileImage} alt="Student profile" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <TwIcon name="user" size={48} />}
        </button>
        {profile.profileImage && <button type="button" onClick={onDelete} aria-label="Remove profile picture" title="Remove profile picture" style={{ position: "absolute", top: 0, right: 0, transform: "translate(28%,-28%)", width: 29, height: 29, padding: 0, borderRadius: "50%", display: "grid", placeItems: "center", border: `1px solid ${c.redBorder}`, background: c.cardBg3, color: c.redFg, cursor: "pointer", boxShadow: "0 6px 18px rgba(0,0,0,.22)" }}><TwIcon name="close" size={15} strokeWidth={3} /></button>}
      </div>
    </div>
    <h4 style={{ color: c.text, marginBottom: 12 }}>Student Details</h4>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 12 }}>
      <Field c={c} label="First name *"><input required value={profile.firstName} onChange={(e) => setProfile({ ...profile, firstName: e.target.value })} style={input(c)} /></Field>
      <Field c={c} label="Last name *"><input required value={profile.lastName} onChange={(e) => setProfile({ ...profile, lastName: e.target.value })} style={input(c)} /></Field>
      <Field c={c} label="Birth date"><button type="button" onClick={onBirth} style={{ ...input(c), textAlign: "left", cursor: "pointer" }}>{profile.birthDate ? formatDateOnly(profile.birthDate) : "Select birth date"}</button></Field>
      <Field c={c} label="Student ID *"><input required value={profile.studentId} onChange={(e) => setProfile({ ...profile, studentId: e.target.value })} style={input(c)} /></Field>
    </div>
    {message && <div style={{ ...notice(c, "error"), marginTop: 14 }}>{message}</div>}
    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}><button style={primary(c)}>Save</button></div>
  </form></div>;
}

function ProfileSavedOverlay() { return <div className="tw-profile-success-backdrop"><div className="tw-profile-success-box"><TwIcon name="check" size={58} strokeWidth={3.4} /></div></div>; }

function JoinClassModal({ c, classCode, setClassCode, profile, setProfile, profileStep, countdown, onSubmit, onClose }) {
  return <div style={modalBackdrop} onClick={onClose}><form onSubmit={onSubmit} onClick={(event) => event.stopPropagation()} style={{ ...card(c), width: "min(94vw,620px)", padding: 28 }}>
    <h2 style={{ marginTop: 0, color: c.text }}>Join a Class</h2>
    <p style={{ color: c.textMuted, marginTop: -4 }}>Enter the class code provided by your teacher.</p>
    <Field c={c} label="Class code"><input value={classCode} onChange={(e) => setClassCode(e.target.value.toUpperCase())} placeholder="Enter class code" required style={input(c)} /></Field>
    {profileStep && <div style={{ display: "grid", gap: 10, marginTop: 16, padding: 16, borderRadius: 16, background: c.cardBg2, border: `1px solid ${c.border}` }}><p style={{ color: c.textMuted, fontSize: 13, margin: 0 }}>Complete your student details before joining your first class.</p><div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10 }}><input required value={profile.firstName} onChange={(e) => setProfile({ ...profile, firstName: e.target.value })} placeholder="First name" style={input(c)} /><input required value={profile.lastName} onChange={(e) => setProfile({ ...profile, lastName: e.target.value })} placeholder="Last name" style={input(c)} /></div><input value={profile.middleInitial} onChange={(e) => setProfile({ ...profile, middleInitial: e.target.value })} placeholder="Middle initial (optional)" style={input(c)} /><input required value={profile.studentId} onChange={(e) => setProfile({ ...profile, studentId: e.target.value })} placeholder="Student ID" style={input(c)} /><div style={{ color: c.textMuted, fontSize: 12 }}>Join unlocks in {Math.max(0, countdown - 5)}s.</div></div>}
    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 16, marginTop: 22 }}><button type="button" onClick={onClose} className="tw-teacher-text-cancel">Cancel</button><TeacherPressButton type="submit" tone="blue" disabled={profileStep && countdown > 5}>{profileStep && countdown > 5 ? "Please wait…" : "Join"}</TeacherPressButton></div>
  </form></div>;
}

function BirthDateModal({ c, value, onSelect, onClose }) {
  const initial = value ? new Date(`${value}T12:00:00`) : new Date(2010, 0, 1);
  const [view, setView] = useState(new Date(initial.getFullYear(), initial.getMonth(), 1));
  const [selected, setSelected] = useState(initial);
  const days = calendarDays(view);
  return <div style={{ ...modalBackdrop, zIndex: 4000 }}><div style={{ ...card(c), width: "min(94vw,430px)" }}><div style={sectionHeader(c)}><h3 style={{ margin: 0 }}>Select Birth Date</h3><button onClick={onClose} style={iconBtn(c)}><TwIcon name="close" size={18} /></button></div><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "18px 0 12px" }}><button onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))} style={secondary(c)}>‹</button><b>{view.toLocaleString("en-PH", { month: "long", year: "numeric" })}</b><button onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))} style={secondary(c)}>›</button></div><div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", textAlign: "center", gap: 5 }}>{["Su","Mo","Tu","We","Th","Fr","Sa"].map((day) => <div key={day} style={{ color: c.textMuted, fontSize: 11, fontWeight: 950 }}>{day}</div>)}{days.map((day, index) => day ? <button key={index} onClick={() => setSelected(new Date(view.getFullYear(), view.getMonth(), day, 12))} style={{ height: 40, borderRadius: 9, border: `1px solid ${sameDay(selected, view, day) ? c.accent : "transparent"}`, background: sameDay(selected, view, day) ? c.accent : c.cardBg2, color: sameDay(selected, view, day) ? "#fff" : c.text, cursor: "pointer", fontFamily: "inherit", fontWeight: 900 }}>{day}</button> : <span key={index} />)}</div><button onClick={() => onSelect(toDateValue(selected))} style={{ ...primary(c), width: "100%", marginTop: 18 }}>Use This Date</button></div></div>;
}

function Field({ c, label, children }) { return <label style={{ display: "grid", gap: 6, color: c.textMuted, fontSize: 12, fontWeight: 900 }}>{label}{children}</label>; }
function MiniMetric({ c, icon, label, value }) { return <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 14, borderRadius: 16, background: c.cardBg2, border: `1px solid ${c.border}` }}><span style={{ width: 42, height: 42, display: "grid", placeItems: "center", borderRadius: 12, background: `${c.accent}18`, color: c.accent }}><TwIcon name={icon} size={21} /></span><div><div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em", color: c.textSub, fontWeight: 950 }}>{label}</div><div style={{ fontSize: 25, fontWeight: 950, color: c.text, marginTop: 4 }}>{value}</div></div></div>; }
function ProgressLine({ c, label, value, total, accent }) { const pct = total > 0 ? Math.min(100, Math.round(value / total * 100)) : 0; return <div><div style={{ display: "flex", justifyContent: "space-between", color: c.text, fontWeight: 950, fontSize: 12, marginBottom: 7 }}><span>{label}</span><span style={{ color: c.textMuted }}>{value}/{total || 0}</span></div><div style={{ height: 18, borderRadius: 5, background: c.cardBg2, border: `2px solid ${c.border}`, padding: 2, overflow: "hidden", boxShadow: "inset 0 2px 4px rgba(0,0,0,.18)" }}><div style={{ width: `${pct}%`, height: "100%", borderRadius: 2, background: `repeating-linear-gradient(90deg, ${accent} 0 12px, ${accent}cc 12px 15px)`, boxShadow: `0 0 12px ${accent}88`, transition: "width .35s ease" }} /></div></div>; }

function emptyProfile() { return { firstName: "", lastName: "", middleInitial: "", studentId: "", birthDate: "", profileImage: "" }; }
function profileFromData(data, current) { const p = data.profile || {}; const firstClass = data.classes?.[0] || {}; return { firstName: p.first_name || firstClass.first_name || current.firstName || "", lastName: p.last_name || firstClass.last_name || current.lastName || "", middleInitial: p.middle_initial || firstClass.middle_initial || current.middleInitial || "", studentId: p.student_id || firstClass.student_id || current.studentId || "", birthDate: p.birth_date ? String(p.birth_date).slice(0, 10) : current.birthDate || "", profileImage: p.profile_image || current.profileImage || "" }; }
function formatAnswer(value) {
  if (value == null || value === "") return "No answer";
  if (Array.isArray(value)) return value.map(formatAnswer).join(", ");
  if (typeof value === "object") {
    if (value.text != null) return formatAnswer(value.text);
    if (value.answer != null) return formatAnswer(value.answer);
    if (value.choice != null) return formatAnswer(value.choice);
    if (value.target != null) return formatAnswer(value.target);
    return Object.values(value).map(formatAnswer).filter(Boolean).join(" · ");
  }
  return String(value);
}
function completedTimestamp(item) { return new Date(item.ended_at || item.submitted_at || item.available_until || item.started_at || item.created_at || 0).getTime() || 0; }
function assignmentStart(item) { return item.available_from ? new Date(item.available_from).getTime() : 0; }
function assignmentEnd(item) { return item.available_until ? new Date(item.available_until).getTime() : Number.MAX_SAFE_INTEGER; }
function isAssignmentOpen(item, now = Date.now()) { return now >= assignmentStart(item) && now <= assignmentEnd(item); }
function formatAssignmentWindow(item) { const start = item.available_from ? new Date(item.available_from).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }) : "No start"; const end = item.available_until ? new Date(item.available_until).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }) : "No deadline"; return `${start} → ${end}`; }
function isThisWeek(value) { if (!value) return false; const date = new Date(value); const now = new Date(); const start = new Date(now); const day = (now.getDay() + 6) % 7; start.setDate(now.getDate() - day); start.setHours(0,0,0,0); const end = new Date(start); end.setDate(start.getDate() + 7); return date >= start && date < end; }
function calendarDays(view) { const first = new Date(view.getFullYear(), view.getMonth(), 1).getDay(); const count = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate(); return [...Array(first).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)]; }
function sameDay(selected, view, day) { return selected.getFullYear() === view.getFullYear() && selected.getMonth() === view.getMonth() && selected.getDate() === day; }
function toDateValue(date) { const pad = (n) => String(n).padStart(2, "0"); return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`; }
function formatDateOnly(value) { const date = new Date(`${String(value).slice(0,10)}T12:00:00`); return date.toLocaleDateString("en-PH", { dateStyle: "long" }); }

const metricGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 12, marginTop: 16 };
const modalBackdrop = { position: "fixed", inset: 0, background: "rgba(3,7,18,.62)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", display: "grid", placeItems: "center", padding: 20, zIndex: 3000 };
function sidebar(c) { return { width: 220, minWidth: 220, background: c.sidebarBg, borderRight: `1px solid ${c.sidebarBorder}`, display: "flex", flexDirection: "column", padding: "0 0 24px", position: "fixed", top: 0, left: 0, height: "100vh", overflowY: "auto", zIndex: 100, transition: "background .3s,border-color .3s" }; }
function navBtn(c, active) { return { display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderRadius: 12, border: "none", background: active ? "linear-gradient(135deg,#2b6cff,#5b7cff)" : "transparent", boxShadow: active ? "0 5px 0 rgba(18,54,145,.5),0 10px 20px rgba(43,108,255,.18)" : "none", transform: active ? "translateY(-1px)" : "none", color: active ? "#fff" : c.navColor, fontFamily: "inherit", fontSize: 14, fontWeight: 700, cursor: "pointer", textAlign: "left", width: "100%", transition: "transform .18s ease,background .2s,color .2s,box-shadow .18s ease" }; }
function card(c) { return { background: c.cardBg, border: `1px solid ${c.border}`, borderRadius: 18, padding: 18, color: c.text, boxShadow: c.pageBg === "#eef2ff" ? "0 16px 34px rgba(43,108,255,.08)" : "0 16px 34px rgba(0,0,0,.14)" }; }
function workCard(c) { return { ...card(c), display: "grid", gap: 11, alignContent: "start", minHeight: 170 }; }
function workTitle(c) { return { display: "flex", alignItems: "center", gap: 9, color: c.text, fontWeight: 950, marginBottom: 3 }; }
function input(c) { return { width: "100%", boxSizing: "border-box", padding: "12px 13px", borderRadius: 11, border: `1px solid ${c.inputBorder || c.border}`, background: c.inputBg || c.cardBg2, color: c.text, fontFamily: "inherit" }; }
function primary(c) { return { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "10px 14px", borderRadius: 11, border: 0, background: "#2b6cff", color: "#fff", fontFamily: "inherit", fontWeight: 950, cursor: "pointer" }; }
function secondary(c) { return { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "10px 14px", borderRadius: 11, border: `1px solid ${c.border}`, background: c.cardBg2, color: c.text, fontFamily: "inherit", fontWeight: 950, cursor: "pointer" }; }
function sideAction(c) { return { ...secondary(c), justifyContent: "flex-start", width: "100%", background: "transparent", borderColor: c.sidebarBorder, color: c.navColor, fontSize: 13, fontWeight: 600 }; }
function iconBtn(c) { return { width: 38, height: 38, display: "grid", placeItems: "center", borderRadius: 11, border: `1px solid ${c.border}`, background: c.cardBg2, color: c.text, cursor: "pointer" }; }
function profileGearBtn(c) { return { width: 38, height: 38, padding: 0, overflow: "hidden", display: "grid", placeItems: "center", borderRadius: "50%", border: 0, background: "rgba(255,255,255,.08)", color: c.navColor, cursor: "pointer" }; }
function sectionHeader(c) { return { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", color: c.text }; }
function empty(c) { return { padding: 20, borderRadius: 14, border: `1px dashed ${c.border}`, color: c.textMuted, textAlign: "center" }; }
function notice(c, kind) { return { padding: 12, borderRadius: 12, background: kind === "success" ? c.greenBg : c.redBg, color: kind === "success" ? c.greenFg : c.redFg, border: `1px solid ${kind === "success" ? c.greenBorder : c.redBorder}`, fontWeight: 900 }; }
