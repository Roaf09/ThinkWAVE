/* FILE GUIDE:
 * client/src/pages/student/StudentDashboard.jsx
 * Purpose: Revision 8 student dashboard shell aligned with the teacher dashboard UI.
 */

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { clearRole, clearToken } from "../../lib/auth";
import { setAuthToken } from "../../lib/api";
import { ThemedModal, useColors, useTheme } from "../../context/ThemeContext";
import { EmptyState, IconBubble, TwIcon } from "../../components/TwUI";

export default function StudentDashboard() {
  const c = useColors();
  const { dark, toggleTheme } = useTheme();
  const nav = useNavigate();
  const [activeTab, setActiveTab] = useState("home");
  const [data, setData] = useState({ assignments: [], classes: [], recentCompleted: [], profile: null });
  const [joinOpen, setJoinOpen] = useState(false);
  const [showLogout, setShowLogout] = useState(false);
  const [classCode, setClassCode] = useState("");
  const [liveCode, setLiveCode] = useState("");
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveMsg, setLiveMsg] = useState("");
  const [profile, setProfile] = useState({ lastName: "", firstName: "", middleInitial: "", studentId: "" });
  const [profileStep, setProfileStep] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const [msg, setMsg] = useState("");

  async function load() {
    const { data } = await api.get("/student/dashboard");
    setData(data || {});
  }

  useEffect(() => { load().catch(() => {}); }, []);
  useEffect(() => {
    if (!profileStep) return;
    setCountdown(10);
    const t = setInterval(() => setCountdown((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(t);
  }, [profileStep]);

  async function joinClass(e) {
    e.preventDefault();
    setMsg("");
    try {
      // Revision 8: send profile only after the profile step to prevent validation errors.
      const payload = { classCode: classCode.trim().toUpperCase() };
      if (profileStep) payload.profile = profile;
      await api.post("/student/classes/join", payload);
      setJoinOpen(false);
      setProfileStep(false);
      setClassCode("");
      await load();
    } catch (err) {
      if (err?.response?.data?.message === "PROFILE_REQUIRED") setProfileStep(true);
      else setMsg(err?.response?.data?.message || "Could not join class.");
    }
  }

  async function joinLiveSession(e) {
    e.preventDefault();
    setLiveMsg("");
    const code = liveCode.trim().toUpperCase();
    if (code.length < 4) { setLiveMsg("Please enter a valid session code."); return; }
    setLiveLoading(true);
    try {
      // Revision 9: logged-in students can join synchronous sessions from the dashboard.
      const profileData = data.profile || {};
      const classProfile = (data.classes || [])[0] || {};
      const firstName = profileData.first_name || classProfile.first_name || "Student";
      const lastName = profileData.last_name || classProfile.last_name || "";
      const { data: joined } = await api.post("/sessions/join", { code, firstName, lastName });
      localStorage.setItem("qz_reconnectKey", joined.reconnectKey);
      localStorage.setItem("qz_participantId", String(joined.participantId));
      localStorage.setItem("qz_sessionId", String(joined.sessionId));
      localStorage.setItem("qz_joinMode", joined.joinMode || "SOLO");
      nav(`/play/${joined.sessionId}`);
    } catch (err) {
      setLiveMsg(err?.response?.data?.message || "Could not join. Check the session code.");
      setLiveLoading(false);
    }
  }

  function doLogout() {
    clearToken();
    clearRole();
    setAuthToken("");
    nav("/");
  }

  const assignments = data.assignments || [];
  const openAssignments = assignments.filter((a) => !a.submission_id);
  const completedAssignments = assignments.filter((a) => a.submission_id);

  function renderTab() {
    if (activeTab === "classes") {
      return <ClassesPanel c={c} data={data} setJoinOpen={setJoinOpen} completedAssignments={completedAssignments} />;
    }
    return <HomePanel c={c} data={data} assignments={assignments} nav={nav} setActiveTab={setActiveTab} liveCode={liveCode} setLiveCode={setLiveCode} liveMsg={liveMsg} liveLoading={liveLoading} joinLiveSession={joinLiveSession} />;
  }

  const navItems = [
    { id: "home", label: "Home", icon: "home" },
    { id: "classes", label: "Classes", icon: "classes" },
  ];

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: c.pageBg, transition: "background 0.3s" }}>
      <aside
        data-sidebar="true"
        style={{
          width: 220,
          minWidth: 220,
          background: c.sidebarBg,
          borderRight: `1px solid ${c.sidebarBorder}`,
          display: "flex",
          flexDirection: "column",
          padding: "0 0 24px",
          position: "fixed",
          top: 0,
          left: 0,
          height: "100vh",
          overflowY: "auto",
          zIndex: 100,
          transition: "background 0.3s, border-color 0.3s",
        }}
      >
        <div style={{ padding: "26px 24px 22px", display: "flex", alignItems: "baseline", borderBottom: `1px solid ${c.sidebarBorder}`, marginBottom: 12 }}>
          <span style={{ fontSize: 20, fontWeight: 900, color: "#e7e9ee" }}>Think</span>
          <span style={{ fontSize: 20, fontWeight: 900, color: "#2b6cff" }}>WAVE</span>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 4, padding: "0 12px", flex: 1 }}>
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 14px",
                borderRadius: 10,
                border: "none",
                background: activeTab === item.id ? "#2b6cff" : "transparent",
                color: activeTab === item.id ? "#fff" : c.navColor,
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                textAlign: "left",
                width: "100%",
                transition: "background 0.2s, color 0.2s",
              }}
            >
              <span style={{ width: 20, display: "inline-flex", justifyContent: "center" }}><TwIcon name={item.icon} size={18} /></span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div style={{ padding: "0 12px", marginBottom: 8 }}>
          <button onClick={toggleTheme} style={sideAction(c)}>
            <TwIcon name={dark ? "sun" : "moon"} size={17} />
            <span>{dark ? "Light Mode" : "Dark Mode"}</span>
          </button>
        </div>

        <div style={{ padding: "0 12px" }}>
          <button onClick={() => setShowLogout(true)} style={sideAction(c)}>
            <TwIcon name="logout" size={17} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <main style={{ marginLeft: 220, width: "calc(100% - 220px)", flex: 1, minHeight: "100vh", overflowY: "scroll", overflowX: "hidden", scrollbarGutter: "stable both-edges", boxSizing: "border-box" }}>
        <div key={activeTab} className="dashboard-tab-panel">
          {msg && <div className="container" style={{ paddingBottom: 0 }}><div style={{ padding: 12, borderRadius: 12, background: c.redBg, color: c.redFg, border: `1px solid ${c.redBorder}` }}>{msg}</div></div>}
          {renderTab()}
        </div>
      </main>

      {joinOpen && <div style={modalBackdrop}>
        <form onSubmit={joinClass} style={{ ...card(c), width: "min(100%,430px)", background: c.cardBg }}>
          <h3 style={{ marginTop: 0 }}>Join Class</h3>
          <input value={classCode} onChange={(e) => setClassCode(e.target.value.toUpperCase())} placeholder="Class code" required style={{ ...input(c), width: "100%" }} />
          {profileStep && <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
            <p style={{ color: c.textMuted, fontSize: 13 }}>Make sure everything is correct before confirming.</p>
            <input value={profile.lastName} onChange={(e) => setProfile({ ...profile, lastName: e.target.value })} placeholder="Last name" required style={input(c)} />
            <input value={profile.firstName} onChange={(e) => setProfile({ ...profile, firstName: e.target.value })} placeholder="First name" required style={input(c)} />
            <input value={profile.middleInitial} onChange={(e) => setProfile({ ...profile, middleInitial: e.target.value })} placeholder="Middle initial (optional)" style={input(c)} />
            <input value={profile.studentId} onChange={(e) => setProfile({ ...profile, studentId: e.target.value })} placeholder="Student ID" required style={input(c)} />
            <div style={{ color: c.textMuted, fontSize: 13 }}>Confirm unlocks in {Math.max(0, countdown - 5)}s.</div>
          </div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
            <button type="button" onClick={() => { setJoinOpen(false); setProfileStep(false); }} style={secondary(c)}>Cancel</button>
            <button disabled={profileStep && countdown > 5} style={{ ...primary(c), opacity: profileStep && countdown > 5 ? .5 : 1 }}>Confirm</button>
          </div>
        </form>
      </div>}

      {showLogout && (
        <ThemedModal icon={<TwIcon name="logout" size={30} />} title="Log out?" message="Are you sure you want to log out?" onClose={() => setShowLogout(false)}>
          <button className="btn secondary" onClick={() => setShowLogout(false)}>Cancel</button>
          <button className="btn" style={{ background: dark ? "#7f1d1d" : "#dc2626", color: dark ? "#fca5a5" : "#ffffff" }} onClick={doLogout}>Yes, Log Out</button>
        </ThemedModal>
      )}
    </div>
  );
}

function HomePanel({ c, data, assignments, nav, setActiveTab, liveCode, setLiveCode, liveMsg, liveLoading, joinLiveSession }) {
  const recent = data.recentCompleted || [];
  const allAssignments = assignments || [];
  const answered = allAssignments.filter((a) => a.submission_id);
  const unanswered = allAssignments.filter((a) => !a.submission_id);
  const now = Date.now();
  const twoHours = 2 * 60 * 60 * 1000;
  const availableNow = unanswered.filter((q) => isAssignmentOpen(q, now));
  const upcoming = unanswered
    .filter((q) => assignmentStart(q) > now)
    .sort((a, b) => assignmentStart(a) - assignmentStart(b))
    .slice(0, 4);
  const nearing = unanswered
    .filter((q) => {
      const end = assignmentEnd(q);
      return end > now && end - now <= twoHours;
    })
    .sort((a, b) => assignmentEnd(a) - assignmentEnd(b))
    .slice(0, 4);
  const totalAssigned = allAssignments.length;

  return (
    <div className="container" style={{ display: "grid", gap: 18 }}>
      <section>
        <h2 style={{ marginBottom: 4, color: c.text }}>Home</h2>
      </section>

      <section style={card(c)}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div>
            <h3 style={{ margin: 0, color: c.text }}>Academic overview</h3>
          </div>
          <IconBubble name="chart" c={c} size={48} iconSize={24} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(240px, .8fr) minmax(280px, 1.2fr)", gap: 16, marginTop: 16 }}>
          <div style={{ display: "grid", gap: 10 }}>
            <MiniMetric c={c} icon="classes" label="Joined classes" value={(data.classes || []).length} />
            <MiniMetric c={c} icon="clock" label="Total assigned quizzes" value={totalAssigned} />
            <MiniMetric c={c} icon="check" label="Recent completed work" value={recent.length} />
          </div>

          <div style={{ display: "grid", gap: 14 }}>
            <ProgressLine c={c} label="Answered assigned quizzes" value={answered.length} total={totalAssigned} accent={c.greenFg} />
            <ProgressLine c={c} label="Unanswered assigned quizzes" value={unanswered.length} total={totalAssigned} accent={c.accent} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
              <QuizGroupCard c={c} title="Ready to answer" icon="clock" items={availableNow.slice(0, 4)} empty="No quizzes are open right now." nav={nav} actionMode="join" />
              <QuizGroupCard c={c} title="Upcoming quizzes" icon="calendar" items={upcoming} empty="No scheduled quizzes are waiting to open." nav={nav} />
              <QuizGroupCard c={c} title="Nearing deadline" icon="alert" items={nearing} empty="No quizzes are due within the next 2 hours." nav={nav} highlight />
            </div>
          </div>
        </div>
      </section>

      <section style={card(c)}>
        <h3 style={{ marginTop: 0, color: c.text }}>Join live session</h3>
        <p style={{ color: c.textMuted, marginTop: 0, fontSize: 14 }}>Enter the synchronous session code provided by your teacher.</p>
        <form onSubmit={joinLiveSession} style={{ display: "grid", gridTemplateColumns: "minmax(180px, 1fr) auto", gap: 10, alignItems: "start" }}>
          <div>
            <input value={liveCode} onChange={(e) => setLiveCode(e.target.value.toUpperCase())} placeholder="Session code" maxLength={12} style={input(c)} />
            {liveMsg && <div style={{ marginTop: 8, color: c.redFg, background: c.redBg, border: `1px solid ${c.redBorder}`, borderRadius: 10, padding: "8px 10px", fontSize: 13 }}>{liveMsg}</div>}
          </div>
          <button disabled={liveLoading} style={{ ...primary(c), opacity: liveLoading ? .65 : 1 }}>{liveLoading ? "Joining…" : "Join Session"}</button>
        </form>
      </section>

      <section style={card(c)}>
        <h3 style={{ marginTop: 0, color: c.text }}>Most recent completed session</h3>
        {recent.length === 0 ? <EmptyState c={c} icon="check" title="No completed work yet" message="Your latest submitted quiz score will appear here." compact /> : recent.map((r) => <div key={r.id} style={row(c)}><span>{r.class_name} · {r.quiz_title}</span><b>{r.score}/{r.max_score}</b></div>)}
      </section>
    </div>
  );
}

function ClassesPanel({ c, data, setJoinOpen, completedAssignments }) {
  const classes = data.classes || [];
  return (
    <div className="container" style={{ display: "grid", gap: 18 }}>
      <section>
        <h2 style={{ marginBottom: 4, color: c.text }}>Classes</h2>
      </section>

      <section style={card(c)}>
        <h3 style={{ marginTop: 0, color: c.text }}>Joined classes</h3>
        <div style={{ display: "grid", gap: 12 }}>
          {classes.length === 0 ? (
            <EmptyState c={c} icon="classes" title="No joined classes yet" message="Use your class code to join your teacher's class folder." action={<button onClick={() => setJoinOpen(true)} style={primary(c)}>Join Class</button>} />
          ) : classes.map((cl) => {
            const scores = (completedAssignments || []).filter((a) => Number(a.class_id) === Number(cl.class_id));
            return <JoinedClassCard key={cl.enrollment_id} c={c} cl={cl} scores={scores} />;
          })}
        </div>
      </section>
    </div>
  );
}

function MiniMetric({ c, icon, label, value }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 13, borderRadius: 16, background: c.cardBg2, border: `1px solid ${c.border}` }}>
      <IconBubble name={icon} c={c} size={38} iconSize={19} />
      <div>
        <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".08em", color: c.textSub, fontWeight: 900 }}>{label}</div>
        <div style={{ fontSize: 24, fontWeight: 950, color: c.text, marginTop: 3 }}>{value}</div>
      </div>
    </div>
  );
}

function ProgressLine({ c, label, value, total, accent }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, color: c.text, fontWeight: 900, fontSize: 13, marginBottom: 7 }}>
        <span>{label}</span>
        <span style={{ color: c.textMuted }}>{value}/{total || 0}</span>
      </div>
      <div style={{ height: 12, borderRadius: 999, background: c.cardBg2, border: `1px solid ${c.border}`, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", borderRadius: 999, background: accent, boxShadow: `0 0 18px ${accent}66`, transition: "width 350ms ease" }} />
      </div>
    </div>
  );
}

function QuizGroupCard({ c, title, icon, items, empty, nav, actionMode, highlight }) {
  return (
    <div style={{ padding: 14, borderRadius: 16, background: highlight ? c.yellowBg : c.cardBg2, border: `1px solid ${highlight ? c.yellowBorder : c.border}`, display: "grid", gap: 10, alignContent: "start" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, color: highlight ? c.yellowFg : c.text, fontWeight: 950 }}><TwIcon name={icon} size={18} /> {title}</div>
      {items.length === 0 ? <div style={{ color: highlight ? c.yellowFg : c.textMuted, fontSize: 13, lineHeight: 1.5 }}>{empty}</div> : items.map((q) => (
        <div key={q.quiz_id} style={{ display: "grid", gap: 7, padding: 11, borderRadius: 13, background: c.cardBg, border: `1px solid ${c.border}` }}>
          <div style={{ fontWeight: 900, color: c.text, fontSize: 13 }}>{q.title}</div>
          <div style={{ color: c.textMuted, fontSize: 12, lineHeight: 1.45 }}>{q.class_name} · {formatAssignmentWindow(q)}</div>
          {actionMode === "join" && <button onClick={() => nav(`/student/async/${q.quiz_id}`)} style={{ ...primary(c), padding: "8px 10px", fontSize: 12 }}>Answer Quiz</button>}
        </div>
      ))}
    </div>
  );
}

function JoinedClassCard({ c, cl, scores }) {
  return (
    <div style={{ padding: 16, borderRadius: 17, background: c.cardBg2, border: `1px solid ${c.border}`, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <span style={{ color: c.text, fontWeight: 950 }}>{cl.parent_name ? `${cl.parent_name} / ` : ""}{cl.class_name}<br/><small style={{ color: c.textMuted, fontWeight: 700 }}>Teacher: {cl.teacher_first_name} {cl.teacher_last_name} · ID: {cl.student_id}</small></span>
        <IconBubble name="classes" c={c} size={38} iconSize={19} />
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".08em", color: c.textSub, fontWeight: 900 }}>Scores</div>
        {scores.length === 0 ? <div style={{ color: c.textMuted, fontSize: 13 }}>No scores recorded yet for this class.</div> : scores.map((a) => (
          <div key={a.quiz_id} style={row(c)}><span>{a.title}</span><b>{a.score}/{a.max_score}</b></div>
        ))}
      </div>
    </div>
  );
}

function assignmentStart(q) { return q.available_from ? new Date(q.available_from).getTime() : 0; }
function assignmentEnd(q) { return q.available_until ? new Date(q.available_until).getTime() : Number.MAX_SAFE_INTEGER; }
function isAssignmentOpen(q, now = Date.now()) { return now >= assignmentStart(q) && now <= assignmentEnd(q); }
function formatAssignmentWindow(q) {
  const start = q.available_from ? new Date(q.available_from).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }) : "No start";
  const end = q.available_until ? new Date(q.available_until).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }) : "No deadline";
  return `${start} → ${end}`;
}

function AssignmentCard({ q, c, nav }) {
  const now = Date.now();
  const start = q.available_from ? new Date(q.available_from).getTime() : 0;
  const end = q.available_until ? new Date(q.available_until).getTime() : Number.MAX_SAFE_INTEGER;
  const open = now >= start && now <= end;
  return <div style={row(c)}><span><b>{q.title}</b><br/><small style={{ color: c.textMuted }}>{q.class_name} · {new Date(q.available_from).toLocaleString()} - {new Date(q.available_until).toLocaleString()}</small></span><button disabled={!open} onClick={() => nav(`/student/async/${q.quiz_id}`)} style={{ ...primary(c), opacity: open ? 1 : .5 }}>{open ? "Join" : "Locked"}</button></div>;
}

function SummaryCard({ c, label, value, hint, accent }) {
  return <div style={card(c)}><div style={{ textTransform: "uppercase", letterSpacing: 1.4, color: c.textMuted, fontWeight: 900, fontSize: 12 }}>{label}</div><div style={{ color: accent, fontSize: 30, fontWeight: 900, marginTop: 12 }}>{value}</div><div style={{ color: c.textMuted, fontSize: 13, marginTop: 8 }}>{hint}</div></div>;
}

function overviewRow(c) { return { display: "flex", alignItems: "center", gap: 9, padding: "10px 12px", borderRadius: 14, background: c.cardBg2, border: `1px solid ${c.border}`, color: c.textMuted, fontSize: 13, fontWeight: 800 }; }
function sideAction(c) { return { display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 14px", borderRadius: 10, border: `1px solid ${c.sidebarBorder}`, background: "transparent", color: c.navColor, fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "color 0.2s, border-color 0.2s" }; }
function card(c) { return { background: c.cardBg, border: `1px solid ${c.border}`, borderRadius: 18, padding: 18, boxShadow: c.pageBg === "#eef2ff" ? "0 16px 34px rgba(43,108,255,0.08)" : "0 16px 34px rgba(0,0,0,0.14)", transition: "background 0.3s, border-color 0.3s, transform 0.25s, box-shadow 0.3s" }; }
function input(c) { return { padding: "12px 14px", borderRadius: 12, border: `1px solid ${c.inputBorder}`, background: c.inputBg, color: c.text, boxSizing: "border-box" }; }
function primary(c) { return { padding: "10px 14px", borderRadius: 12, border: 0, background: "#2b6cff", color: "#fff", fontWeight: 900, cursor: "pointer" }; }
function secondary(c) { return { padding: "10px 14px", borderRadius: 12, border: `1px solid ${c.border}`, background: c.cardBg2, color: c.text, fontWeight: 900, cursor: "pointer" }; }
function row(c) { return { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, background: c.cardBg2, border: `1px solid ${c.border}`, flexWrap: "wrap" }; }
const modalBackdrop = { position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", display: "grid", placeItems: "center", padding: 20, zIndex: 2000 };
