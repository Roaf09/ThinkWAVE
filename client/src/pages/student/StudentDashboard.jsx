/* FILE GUIDE:
 * client/src/pages/student/StudentDashboard.jsx
 */

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, setAuthToken } from "../../lib/api";
import { clearRole, clearToken } from "../../lib/auth";
import { clearLastRoute } from "../../lib/lastRoute";
import { useColors, useTheme } from "../../context/ThemeContext";
import { TwIcon } from "../../components/TwUI";
import { sidebarStyle as sidebar, dashboardNavButtonStyle as navBtn } from "../../components/DashboardShell";
import ThemeIconButton from "../../components/ThemeIconButton";
import { templateLabel, templateTone, templateCardChrome } from "../../lib/templatePalette";
import { TeacherActionModal, TeacherPressButton, ThinkBotEmptyState } from "../teacher/TeacherUI";
import { MobileTopHeader, MobileTabBar } from "../../components/MobileAppChrome";
import { manilaDateTime, manilaDate } from "../../lib/dateFormat";


export default function StudentDashboard() {
  const c = useColors();
  const { dark, toggleTheme } = useTheme();
  const nav = useNavigate();
  const fileRef = useRef(null);
  const [activeTab, setActiveTab] = useState("home");
  const [data, setData] = useState({ assignments: [], classes: [], recentAssigned: [], recentLive: [], openLiveSessions: [], profile: null, weekStats: {}, achievementStats: {}, removalNotices: [] });
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
  const [progressModalOpen, setProgressModalOpen] = useState(false);
  const [achievementToast, setAchievementToast] = useState(null);
  const [removalNotices, setRemovalNotices] = useState([]);
  const [accountEmail, setAccountEmail] = useState("");
  const [accountName, setAccountName] = useState({ firstName: "", lastName: "" });

  useEffect(() => { api.get("/auth/me").then(({ data }) => { setAccountEmail(data?.email || ""); setAccountName({ firstName: data?.first_name || "", lastName: data?.last_name || "" }); }).catch(() => {}); }, []);

  // Carry the name typed at sign-up into the student profile the first time
  // they see it (joining a class or opening Settings), without overwriting
  // anything they've already customized or saved.
  useEffect(() => {
    if (!accountName.firstName && !accountName.lastName) return;
    setProfile((current) => ({ ...current, firstName: current.firstName || accountName.firstName, lastName: current.lastName || accountName.lastName }));
  }, [accountName]);

  async function load({ silent = false } = {}) {
    try {
      const response = await api.get("/student/dashboard");
      const next = response.data || {};
      setData(next);
      setRemovalNotices((current) => {
        const byId = new Map(current.map((notice) => [Number(notice.enrollment_id), notice]));
        for (const notice of next.removalNotices || []) byId.set(Number(notice.enrollment_id), notice);
        return [...byId.values()].sort((a, b) => new Date(a.removed_at || 0) - new Date(b.removed_at || 0));
      });
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
    const stats=data.achievementStats||{};
    if(!Object.keys(stats).length) return;
    const achieved=buildAchievements(stats).filter((item)=>item.completed).map((item)=>item.id);
    const storageKey=`tw_achievement_mastered_${data.profile?.user_id||"student"}`;
    let previous=null;
    try{previous=JSON.parse(localStorage.getItem(storageKey)||"null");}catch{previous=null;}
    if(Array.isArray(previous)){
      const fresh=buildAchievements(stats).find((item)=>item.completed&&!previous.includes(item.id));
      if(fresh){setAchievementToast(fresh);window.setTimeout(()=>setAchievementToast(null),3600);}
    }
    localStorage.setItem(storageKey,JSON.stringify(achieved));
  },[data.achievementStats,data.profile?.user_id]);

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

  async function acknowledgeRemoval(notice) {
    if (!notice) return;
    try {
      await api.post(`/student/class-removals/${notice.enrollment_id}/ack`);
    } catch {
      // The notice is still dismissed locally; a later dashboard refresh can retry if needed.
    }
    setRemovalNotices((current) => current.filter((item) => Number(item.enrollment_id) !== Number(notice.enrollment_id)));
  }

  function doLogout() {
    clearToken();
    clearRole();
    setAuthToken("");
    clearLastRoute();
    nav("/");
  }

  const navItems = [
    { id: "home", label: "Home", icon: "home" },
    { id: "classes", label: "Class", icon: "classes" },
  ];

  return (
    <div className="tw-responsive-dashboard" style={{ display: "flex", minHeight: "100vh", background: c.pageBg, transition: "background .3s" }}>
      <MobileTopHeader
        c={c}
        name={`${profile.firstName} ${profile.lastName}`.trim() || "Student"}
        email={accountEmail}
        avatarSrc={profile.profileImage}
        dark={dark}
        toggleTheme={toggleTheme}
        onSettings={() => setProfileOpen(true)}
        onLogout={() => setShowLogout(true)}
      />
      <aside data-sidebar="true" className="tw-responsive-sidebar" style={sidebar(c)}>
        <div className="flex items-center justify-between pt-[26px] pr-[18px] pb-[22px] pl-[24px] mb-[12px]" style={{ borderBottom: `1px solid ${c.sidebarBorder}` }}>
          <div><span className="text-[20px] font-black text-[#e7e9ee]">Think</span><span className="text-[20px] font-black text-brand">WAVE</span></div>
          <div className="flex items-center gap-[5px]">{(data.gamification?.favorites||[]).slice(0,3).map((id)=><span key={id} title={ACHIEVEMENT_DEFINITIONS.find((item)=>item.id===id)?.title||"Favorite achievement"} className="inline-flex text-[#fbbf24]"><TwIcon name="trophy" size={12}/></span>)}<button onClick={() => setProfileOpen(true)} title="Student Info" style={profileGearBtn(c)}>{profile.profileImage ? <img src={profile.profileImage} alt="Student profile" className="w-full h-full object-cover" /> : <TwIcon name="user" size={20} />}</button></div>
        </div>

        <nav className="flex flex-col gap-[4px] px-[12px] py-0 flex-1">
          {navItems.map((item) => <button key={item.id} className="tw-side-nav-btn" onClick={() => setActiveTab(item.id)} style={navBtn(c, activeTab === item.id)}><span className="w-[20px] inline-flex justify-center"><TwIcon name={item.icon} size={18} /></span><span>{item.label}</span></button>)}
        </nav>

        <div className="flex gap-[8px] items-center px-[12px] py-0">
          <ThemeIconButton dark={dark} onClick={toggleTheme} style={{ color: c.navColor, borderColor: c.sidebarBorder, background: "transparent", flex: "0 0 auto" }} size={17} />
          <button onClick={() => setShowLogout(true)} style={{ ...sideAction(c), flex: 1, justifyContent: "center" }}><TwIcon name="logout" size={17} /><span>Logout</span></button>
        </div>
      </aside>

      <main className="tw-responsive-dashboard-main" style={{ marginLeft: 220, width: "calc(100% - 220px)", flex: 1, minHeight: "100vh", overflowY: "scroll", overflowX: "hidden", scrollbarGutter: "stable both-edges", boxSizing: "border-box" }}>
        {msg && <div className="container" style={{ paddingBottom: 0 }}><div style={notice(c, "error")}>{msg}</div></div>}
        {activeTab === "home" ? (
          <HomePanel c={c} dark={dark} data={data} nav={nav} onJoinLive={joinLiveSession} joiningSession={joiningSession} onAnalytics={setAnalyticsTarget} onOpenAchievements={() => setAchievementsOpen(true)} onOpenProgressModal={() => setProgressModalOpen(true)} />
        ) : (
          <ClassesPanel c={c} dark={dark} data={data} nav={nav} onJoinClass={() => setJoinOpen(true)} onAnalytics={setAnalyticsTarget} onJoinLive={joinLiveSession} joiningSession={joiningSession} />
        )}
      </main>

      <MobileTabBar c={c} items={navItems} activeId={activeTab} onSelect={setActiveTab} iconsOnly />

      {joinOpen && <JoinClassModal c={c} classCode={classCode} setClassCode={setClassCode} profile={profile} setProfile={setProfile} profileStep={joinProfileStep} countdown={countdown} onSubmit={joinClass} onClose={() => { setJoinOpen(false); setJoinProfileStep(false); setClassCode(""); }} />}
      {profileOpen && <ProfileModal c={c} profile={profile} setProfile={setProfile} message={profileMsg} onSubmit={saveProfile} onClose={() => { setProfileOpen(false); setProfileMsg(""); }} onUpload={() => fileRef.current?.click()} onDelete={deleteProfileImage} onBirth={() => setBirthPickerOpen(true)} />}
      <input ref={fileRef} type="file" accept="image/*" onChange={uploadProfile} className="hidden" />
      {birthPickerOpen && <BirthDateModal c={c} value={profile.birthDate} onSelect={(birthDate) => { setProfile((current) => ({ ...current, birthDate })); setBirthPickerOpen(false); }} onClose={() => setBirthPickerOpen(false)} />}
      {analyticsTarget && <StudentAnalyticsModal c={c} target={analyticsTarget} onClose={() => setAnalyticsTarget(null)} />}
      {achievementsOpen && <AchievementModal c={c} dark={dark} achievements={buildAchievements(data.achievementStats || {})} onClose={() => setAchievementsOpen(false)} />}
      {progressModalOpen && <MobileProgressModal c={c} dark={dark} data={data} onClose={() => setProgressModalOpen(false)} />}
      {profileSaved && <ProfileSavedOverlay />}
      {showLogout && <TeacherActionModal c={c} icon="logout" title="Logout" message="Are you sure you want to log out of the student dashboard?" tone="red" confirmLabel="Yes, Logout" hideCancel onClose={() => setShowLogout(false)} onConfirm={doLogout} />}
      {removalNotices[0] && <ClassRemovalModal c={c} notice={removalNotices[0]} onClose={() => acknowledgeRemoval(removalNotices[0])} />}
      {achievementToast&&<div className="tw-achievement-unlock-toast"><TwIcon name="trophy" size={22}/><div><small>Achievement Mastered</small><strong>{achievementToast.title}</strong></div></div>}
    </div>
  );
}

const ACHIEVEMENT_DEFINITIONS = [
  { id:"top5-1",title:"First Top 5",metric:"top5Count",target:1,unit:"Top 5 finishes",tone:"yellow",tier:"Bronze" },
  { id:"top5-10",title:"Top 5 Regular",metric:"top5Count",target:10,unit:"Top 5 finishes",tone:"yellow",tier:"Silver" },
  { id:"top5-50",title:"Top 5 Veteran",metric:"top5Count",target:50,unit:"Top 5 finishes",tone:"yellow",tier:"Gold" },
  { id:"first-1",title:"Number One",metric:"firstPlaceCount",target:1,unit:"1st-place finishes",tone:"yellow" },
  { id:"top3-5",title:"Podium Regular",metric:"top3Count",target:5,unit:"Top 3 finishes",tone:"orange" },
  { id:"overtake-1",title:"First Overtake",metric:"overtakes",target:1,unit:"players overtaken",tone:"teal",tier:"Bronze" },
  { id:"overtake-25",title:"Rank Climber",metric:"overtakes",target:25,unit:"players overtaken",tone:"teal",tier:"Silver" },
  { id:"overtake-100",title:"Leaderboard Surfer",metric:"overtakes",target:100,unit:"players overtaken",tone:"teal",tier:"Gold" },
  { id:"comp-10k",title:"Competitive Starter",metric:"competitivePoints",target:10000,unit:"competitive points",tone:"blue",tier:"Bronze" },
  { id:"comp-50k",title:"Point Chaser",metric:"competitivePoints",target:50000,unit:"competitive points",tone:"blue",tier:"Silver" },
  { id:"comp-100k",title:"Wave Champion",metric:"competitivePoints",target:100000,unit:"competitive points",tone:"blue",tier:"Gold" },
  { id:"fast-flawless",title:"Fast and Flawless",metric:"fastFlawless",target:5,unit:"fast correct answers",tone:"purple" },
  { id:"perfect-pace",title:"Perfect Pace",metric:"perfectPace",target:1,unit:"5-answer fast streaks",tone:"purple" },
  { id:"clutch-5",title:"Clutch Answer",metric:"clutchCorrect",target:5,unit:"late correct answers",tone:"orange" },
  { id:"streak-5",title:"On a Roll",metric:"correctStreak",target:5,unit:"best correct streak",tone:"green",tier:"Bronze" },
  { id:"streak-10",title:"Unstoppable",metric:"correctStreak",target:10,unit:"best correct streak",tone:"green",tier:"Silver" },
  { id:"streak-20",title:"Perfect Wave",metric:"correctStreak",target:20,unit:"best correct streak",tone:"green",tier:"Gold" },
  { id:"answer-100",title:"Century Solver",metric:"questionsAnswered",target:100,unit:"questions answered",tone:"teal" },
  { id:"correct-100",title:"Master Mind",metric:"questionsCorrect",target:100,unit:"correct answers",tone:"green" },
  { id:"assigned-5",title:"Assignment Regular",metric:"assignedCompleted",target:5,unit:"assignments completed",tone:"pink" },
  { id:"live-5",title:"Live Session Fan",metric:"liveCompleted",target:5,unit:"live sessions completed",tone:"teal" },
  { id:"class-3",title:"Community Learner",metric:"classesJoined",target:3,unit:"classes joined",tone:"yellow" },
];

function buildAchievements(stats) {
  return ACHIEVEMENT_DEFINITIONS.map((definition) => {
    const value=Math.max(0,Number(stats?.[definition.metric]||0));
    const completed=value>=definition.target;
    const progress=Math.min(1,value/Math.max(1,definition.target));
    return { ...definition,value,completed,state:completed?"Completed":value>0?"In Progress":"Locked",progress };
  });
}

function studentDisplayName(data){
  const p=data?.profile||{};
  const fallback=data?.classes?.[0]||{};
  return [p.first_name||fallback.first_name,p.last_name||fallback.last_name].filter(Boolean).join(" ")||"Student";
}

function GoalCard({c,dark,goal}){
  const pct=Math.min(100,Math.round(Number(goal.value||0)/Math.max(1,Number(goal.target||1))*100));
  const completeBg=dark?"#126532":"#9ee6b6";
  const paleBg=dark?"#17233d":"#eef1f6";
  const ink=goal.completed?(dark?"#fff":"#101827"):c.text;
  return <article className={`tw-student-goal-card tw-achievement-gloss${goal.completed?" is-complete":""}`} style={{background:goal.completed?completeBg:paleBg,borderColor:goal.completed?completeBg:c.border,color:ink}}>
    <div className="flex justify-between gap-[10px] items-start"><strong>{goal.title}</strong><span className="tw-goal-reward">+{Number(goal.reward||0).toLocaleString()} XP</span></div>
    <div className="text-[12px] mt-[7px]" style={{color:goal.completed?(dark?"rgba(255,255,255,.82)":"rgba(16,24,39,.68)"):c.textMuted}}>{Math.min(Number(goal.value||0),Number(goal.target||0)).toLocaleString()} / {Number(goal.target||0).toLocaleString()}</div>
    <div className="tw-achievement-track"><span style={{width:`${pct}%`}} /></div>
    {goal.completed&&<small className="font-black" style={{color:dark?"#eafff1":"#0f5132"}}>Completed</small>}
  </article>;
}

function HomePanel({ c, dark, data, nav, onJoinLive, joiningSession, onAnalytics, onOpenAchievements, onOpenProgressModal }) {
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

  return <div className="container grid gap-[18px]">
    <section><h2 style={{ color: c.text, marginBottom: 4 }}>Student Home</h2></section>

    <section className="tw-student-home-surface" style={card(c)}>
      <StudentProgressShowcase c={c} dark={dark} data={data} achievements={achievements} onOpenAchievements={onOpenAchievements} onOpenProgressModal={onOpenProgressModal} />
      <div className="tw-student-overview-grid">
        <div className="tw-student-work-grid">
          <LiveSessionsCard c={c} dark={dark} sessions={openLive} onJoin={onJoinLive} joiningSession={joiningSession} />
          <WorkCard c={c} dark={dark} title="Ready to answer" icon="check" items={openAssigned} empty="No assigned works are open right now." variant="ready" render={(item) => <WorkItem key={item.quiz_id} c={c} item={item} variant="ready" action={<TeacherPressButton tone="blue" className="tw-student-live-action" aria-label="Answer" title="Answer" onClick={() => nav(`/student/async/${item.quiz_id}`)}><TwIcon name="answerCheck" size={18}/></TeacherPressButton>} />} />
          <WorkCard c={c} dark={dark} title="Upcoming works" icon="calendar" items={upcoming} empty="No scheduled works are waiting to open." variant="upcoming" render={(item) => <WorkItem key={item.quiz_id} c={c} item={item} />} />
          <WorkCard c={c} dark={dark} title="Nearing deadline" icon="alert" items={nearing} empty="No works are due within the next 2 hours." variant="deadline" render={(item) => <WorkItem key={item.quiz_id} c={c} item={item} variant="deadline" action={<TeacherPressButton tone="blue" aria-label="Answer" title="Answer" onClick={() => nav(`/student/async/${item.quiz_id}`)}><TwIcon name="answerCheck" size={18}/></TeacherPressButton>} />} />
        </div>
        <div className="tw-student-progress-panel grid gap-[16px] content-start p-[18px] rounded-[18px]" style={{ background: c.cardBg2, border: `3px solid ${dark ? "#39527f" : "#9a8f7a"}`, boxShadow: dark ? "0 18px 34px rgba(0,0,0,.28)" : "0 18px 34px rgba(91,72,40,.16)" }}>
          <div className="font-[950]" style={{ color: c.text }}>Weekly Progress</div>
          <ProgressLine c={c} label="Answered assigned work" value={answeredThisWeek} total={weekAssignments.length} accent="#22c55e" />
          <ProgressLine c={c} label="Unanswered assigned work" value={unansweredThisWeek} total={weekAssignments.length} accent="#f97316" />
          <ProgressLine c={c} label="Attended live sessions" value={Number(weekStats.liveAttended || 0)} total={liveTotal} accent="#2b6cff" />
          <ProgressLine c={c} label="Unattended live sessions" value={Number(weekStats.liveUnattended || 0)} total={liveTotal} accent="#ef4444" />
        </div>
      </div>
    </section>

    <section className="tw-student-home-surface" style={card(c)}>
      <h3 style={{ marginTop: 0, color: c.text }}>Recent Sessions</h3>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(290px,1fr))] gap-[22px]">
        <CompletedColumn c={c} title="Live Session Results" items={recentLiveTop} type="LIVE" onAnalytics={onAnalytics} />
        <CompletedColumn c={c} title="Assignment Results" items={recentAssignedTop} type="ASSIGNED" onAnalytics={onAnalytics} />
      </div>
    </section>
  </div>;
}

function StudentProgressShowcase({c,dark,data,achievements,onOpenAchievements,onOpenProgressModal}){
  const [mode,setMode]=useState("daily");
  const gam=data.gamification||{};
  const xpPct=Math.min(100,Math.round(Number(gam.currentXp||0)/Math.max(1,Number(gam.xpNeeded||1))*100));
  const favorites=new Set(gam.favorites||[]);
  const favoriteItems=achievements.filter((item)=>favorites.has(item.id));
  const cycleLabel=mode==="daily"?"Daily Goals":mode==="weekly"?"Weekly Goals":"Achievements";
  const nextMode=()=>setMode((current)=>current==="daily"?"weekly":current==="weekly"?"achievements":"daily");
  return <div className="tw-student-progression-shell">
    <div className="tw-student-level-head">
      <div><h3 style={{margin:0,color:c.text}}>{studentDisplayName(data)}</h3></div>
      <div className="tw-student-progress-actions"><TeacherPressButton className="tw-mobile-trophy-trigger" tone="blue" onClick={onOpenProgressModal} aria-label="Open goals and achievements"><TwIcon name="trophy" size={18}/></TeacherPressButton><div className="tw-desktop-progress-actions"><TeacherPressButton tone="blue" onClick={onOpenAchievements} aria-label="View achievements"><TwIcon name="trophy" size={18}/></TeacherPressButton><TeacherPressButton tone="blue" onClick={nextMode}>{cycleLabel}</TeacherPressButton></div></div>
    </div>
    <div className="tw-level-row">
      <div className="tw-level-orb tw-level-orb-silver" style={{borderColor:dark?"#8b93a3":"#c3c9d4",color:c.text}}><strong>{Number(gam.level||1)}</strong></div>
      <div className="tw-level-track tw-level-track-compact" style={{background:c.cardBg2,borderColor:c.border}}><span style={{width:`${xpPct}%`}}/><b>{Number(gam.currentXp||0).toLocaleString()} / {Number(gam.xpNeeded||0).toLocaleString()} XP</b></div>
    </div>
    {favoriteItems.length>0&&<div className="tw-favorite-achievements">{favoriteItems.map((item)=><span key={item.id}><TwIcon name="trophy" size={14}/>{item.title}</span>)}</div>}
        {mode==="weekly"&&<><div className="tw-goal-reset">4 Weekly Goals · refresh Monday at 6:00 AM</div><div className="tw-goal-grid">{(gam.weeklyGoals||[]).map((goal)=><GoalCard key={goal.key} c={c} dark={dark} goal={goal}/>)}</div></>}
    {mode==="achievements"&&<AchievementCarousel c={c} dark={dark} achievements={achievements}/>} 
  </div>;
}

function MobileProgressModal({ c, dark, data, onClose }) {
  const [mode, setMode] = useState("daily");
  const [direction, setDirection] = useState("next");
  const touchRef = useRef(null);
  useEffect(() => { const previous = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = previous; }; }, []);
  const gam = data.gamification || {};
  const achievements = buildAchievements(data.achievementStats || {});
  const modes = ["daily", "weekly", "achievements"];
  const index = modes.indexOf(mode);
  const move = (delta) => { setDirection(delta < 0 ? "prev" : "next"); setMode(modes[(index + delta + modes.length) % modes.length]); };
  const title = mode === "daily" ? "Daily Goals" : mode === "weekly" ? "Weekly Goals" : "Achievements";
  function onTouchStart(e) {
    const t = e.touches?.[0];
    if (t) touchRef.current = { x: t.clientX, y: t.clientY };
  }
  function onTouchEnd(e) {
    const start = touchRef.current;
    touchRef.current = null;
    if (!start) return;
    const t = e.changedTouches?.[0];
    if (!t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 48 || Math.abs(dx) <= Math.abs(dy) * 1.2) return;
    move(dx < 0 ? 1 : -1);
  }
  return <div className="tw-mobile-progress-modal-backdrop" onClick={onClose}>
    <section className="tw-mobile-progress-modal" style={{background:c.cardBg,borderColor:c.border,color:c.text, touchAction: "pan-y"}} onClick={(e)=>e.stopPropagation()} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="tw-mobile-progress-title"><button onClick={()=>move(-1)} aria-label="Previous"><TwIcon name="arrow" size={20} style={{transform:"rotate(180deg)"}}/></button><h3>{title}</h3><button onClick={()=>move(1)} aria-label="Next"><TwIcon name="arrow" size={20}/></button></div>
      <div key={mode} className={`tw-mobile-progress-slide is-${direction}`}>
      {mode === "daily" && <div className="tw-goal-grid">{(gam.dailyGoals||[]).map((goal)=><GoalCard key={goal.key} c={c} dark={dark} goal={goal}/>)}</div>}
      {mode === "weekly" && <div className="tw-goal-grid">{(gam.weeklyGoals||[]).map((goal)=><GoalCard key={goal.key} c={c} dark={dark} goal={goal}/>)}</div>}
      {mode === "achievements" && <div className="tw-achievement-modal-scroll">{achievements.map((item)=><div key={item.id} className="tw-achievement-picker"><AchievementCard c={c} dark={dark} item={item} onShowcase={()=>{}} /></div>)}</div>}
      </div>
    </section>
  </div>;
}

function AchievementCarousel({ c, dark, achievements }) {
  const [startIndex, setStartIndex] = useState(0);
  const [direction, setDirection] = useState("next");
  const carouselRef = useRef(null);
  const wheelLockRef = useRef(0);
  const startIndexRef = useRef(0);
  const maxStart = Math.max(0, achievements.length - 4);
  const visible = achievements.slice(startIndex, startIndex + 4);
  function move(delta) {
    setDirection(delta < 0 ? "prev" : "next");
    setStartIndex((current) => Math.min(maxStart, Math.max(0, current + delta)));
  }
  useEffect(() => { startIndexRef.current = startIndex; }, [startIndex]);
  useEffect(() => {
    const node = carouselRef.current;
    if (!node) return undefined;
    const onWheel = (event) => {
      if (Math.abs(event.deltaY) < Math.abs(event.deltaX) || Math.abs(event.deltaY) < 8) return;
      const delta = event.deltaY > 0 ? 1 : -1;
      // Keep wheel input inside the achievement carousel so browsing achievements
      // never nudges the dashboard's main scrollbar, including at either end.
      event.preventDefault();
      event.stopPropagation();
      const current = startIndexRef.current;
      const next = Math.min(maxStart, Math.max(0, current + delta));
      if (next === current) return;
      const now = Date.now();
      if (now - wheelLockRef.current < 180) return;
      wheelLockRef.current = now;
      move(delta);
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [maxStart]);
  return <div ref={carouselRef} className="tw-achievement-carousel" title="Scroll to browse achievements">
    <button type="button" aria-label="Previous achievement" disabled={startIndex === 0} onClick={() => move(-1)} className="tw-achievement-arrow is-left" style={{ color: c.text, borderColor: c.border, background: c.cardBg2 }}><TwIcon name="arrow" size={21} /></button>
    <div key={`${startIndex}-${direction}`} className={`tw-achievement-page is-${direction}`}>{visible.map((item) => <AchievementCard key={item.id} c={c} dark={dark} item={item} />)}</div>
    <button type="button" aria-label="Next achievement" disabled={startIndex >= maxStart} onClick={() => move(1)} className="tw-achievement-arrow" style={{ color: c.text, borderColor: c.border, background: c.cardBg2 }}><TwIcon name="arrow" size={21} /></button>
  </div>;
}

function AchievementCard({ c, dark, item, onShowcase }) {
  const palettes = {
    blue: ["#a9c3ff", "#204aa8"], green: ["#9ee6b6", "#126532"], orange: ["#ffd08a", "#944807"],
    purple: ["#c8b5ff", "#5b239f"], pink: ["#f8b4d9", "#8f245b"], teal: ["#91e2da", "#0c625b"], yellow: ["#ffe38e", "#8a6200"],
  };
  const [lightBg, darkBg] = palettes[item.tone] || palettes.blue;
  const completeBg = dark ? darkBg : lightBg;
  const paleBg = dark ? "#17233d" : "#eef1f6";
  const ink = item.completed ? (dark ? "#fff" : "#101827") : c.textMuted;
  const progress = Math.min(item.target, item.value);
  return <article className={`tw-achievement-card tw-achievement-gloss is-${item.state.toLowerCase().replace(" ","-")}${item.completed ? " is-complete" : ""}`} style={{ background: item.completed ? completeBg : paleBg, color: ink, borderColor: item.completed ? completeBg : c.border }}><button type="button" className="tw-achievement-card-trophy" disabled={!item.completed} onClick={() => onShowcase?.(item)} title={item.completed ? "Showcase achievement" : "Complete achievement first"}><TwIcon name="trophy" size={13}/></button>
    <div className="tw-achievement-state">{item.state}</div>
    <div className="tw-achievement-card-title">{item.title}</div>
    <div className="tw-achievement-progress">{progress.toLocaleString()} / {item.target.toLocaleString()} {item.unit}</div>
    <div className="tw-achievement-track"><span style={{ width: `${Math.min(100, item.progress*100)}%` }} /></div>
  </article>;
}

function AchievementModal({ c, dark, achievements, onClose }) {
  const [favorites,setFavorites]=useState(()=>[]);
  const [,setSaving]=useState(false);
  useEffect(()=>{ api.get("/student/dashboard").then(({data})=>setFavorites(data?.gamification?.favorites||[])).catch(()=>{}); },[]);
  async function toggleFavorite(item){
    if(!item.completed) return;
    const next=favorites.includes(item.id)?favorites.filter((id)=>id!==item.id):[...favorites,item.id].slice(-3);
    setFavorites(next);setSaving(true);
    try{await api.post("/student/achievements/favorites",{achievementIds:next});}finally{setSaving(false);}
  }
  return <div style={modalBackdrop} onClick={onClose}><section onClick={(event) => event.stopPropagation()} className="w-[min(94vw,1040px)] max-h-[88vh] overflow-y-auto relative" style={card(c)}>
    
    <h2 style={{ marginTop: 0, color: c.text }}>Achievements</h2>
    <div className="tw-achievement-modal-grid">{achievements.map((item) => <div key={item.id} className="tw-achievement-picker"><AchievementCard c={c} dark={dark} item={item} onShowcase={toggleFavorite}/></div>)}</div>
  </section></div>;
}

function ClassesPanel({ c, dark, data, nav, onJoinClass, onAnalytics, onJoinLive, joiningSession }) {
  const classes = data.classes || [];
  const assigned = data.recentAssigned || data.recentCompleted || [];
  const allAssignments = data.assignments || [];
  const live = data.recentLive || [];
  const openLive = data.openLiveSessions || [];
  const [expandedId, setExpandedId] = useState(null);
  return <div className="container grid gap-[18px]">
    <section style={sectionHeader(c)}><div><h2 style={{ marginBottom: 4 }}>Class</h2></div>{classes.length > 0 && <TeacherPressButton tone="blue" onClick={onJoinClass}>Join a Class</TeacherPressButton>}</section>
    {!classes.length ? <ThinkBotEmptyState c={c} title="It seems you have yet to join a class." actionLabel="Join a Class" onAction={onJoinClass} /> : <section className="tw-student-class-surface" style={{...card(c),background:dark?"#1d2c49":c.cardBg}}>
      <h3 style={{ marginTop: 0 }}>Joined Classes</h3>
      <div className="grid gap-[16px]">{classes.map((item) => <div key={item.enrollment_id} className={`tw-student-class-card-slot${expandedId&&expandedId!==item.enrollment_id?" is-faded":""}`}>
        <JoinedClassCard c={c} dark={dark} nav={nav} item={item}
          live={live.filter((session) => Number(session.class_id) === Number(item.class_id))}
          assigned={assigned.filter((session) => Number(session.class_id) === Number(item.class_id))}
          allAssignments={allAssignments.filter((session) => Number(session.class_id) === Number(item.class_id))}
          openLive={openLive.filter((session) => Number(session.class_id) === Number(item.class_id))}
          onAnalytics={onAnalytics} onJoinLive={onJoinLive} joiningSession={joiningSession}
          expanded={expandedId===item.enrollment_id}
          onToggle={()=>setExpandedId((current)=>current===item.enrollment_id?null:item.enrollment_id)} />
      </div>)}</div>
    </section>}
  </div>;
}

function JoinedClassCard({ c, dark, nav, item, live, assigned, allAssignments, openLive, onAnalytics, onJoinLive, joiningSession, expanded, onToggle }) {
  const subjectName=item.parent_name||item.class_name||"Subject";
  const sectionName=item.class_name||"Section";
  const unfinished=(allAssignments||[]).filter((row)=>!row.submission_id).length;
  const completed=live.length+(allAssignments||[]).filter((row)=>row.submission_id).length;
  const totalKnown=Math.max(live.length+(allAssignments||[]).length,1);
  const latest=[...live,...assigned].sort((a,b)=>completedTimestamp(b)-completedTimestamp(a))[0];
  const nextActivity=(allAssignments||[]).filter((row)=>!row.submission_id&&row.available_from&&new Date(row.available_from)>new Date()).sort((a,b)=>new Date(a.available_from)-new Date(b.available_from))[0];
  const now=Date.now();
  const openAssigned=(allAssignments||[]).filter((row)=>!row.submission_id&&isAssignmentOpen(row,now));
  const classUpcoming=(allAssignments||[]).filter((row)=>!row.submission_id&&assignmentStart(row)>now);
  const classNearing=openAssigned.filter((row)=>assignmentEnd(row)-now<=2*60*60*1000);
  const classReady=openAssigned.filter((row)=>assignmentEnd(row)-now>2*60*60*1000);
  return <article className="tw-student-class-card p-0 overflow-hidden" style={{...card(c),background:dark?"#243654":c.cardBg2,border:`3px solid ${dark?"#5271a5":"#a49882"}`}}>
    <button type="button" onClick={onToggle} aria-expanded={expanded} className={`tw-student-class-card-head${expanded?" is-expanded":""}`} style={{color:c.text}}>
      <div className="tw-student-class-head-text min-w-0 grid gap-[5px]">
        <div className="tw-student-class-subject">{subjectName}</div>
        <div className="tw-student-class-head-fade text-[12px]" style={{color:c.textMuted}}>
          <div>Section: {sectionName}</div>
          <div>Teacher: {item.teacher_first_name} {item.teacher_last_name}</div>
        </div>
      </div>
      <div className="tw-class-card-summary"><span>{unfinished} unfinished</span><span>{completed} completed</span>{latest&&<span>Latest: {Number(latest.score||0)} pts</span>}</div>
      
    </button>
    {expanded&&<div className="tw-student-class-detail" style={{borderTop:`1px solid ${c.border}`}}>
      <div className="tw-student-class-header-grid"><div><small>Section</small><strong>{sectionName}</strong></div><div><small>Teacher</small><strong>{item.teacher_first_name} {item.teacher_last_name}</strong></div><div><small>Progress</small><strong>{Math.round(completed/totalKnown*100)}%</strong></div><div><small>Completed Activities</small><strong>{completed}</strong></div><div><small>Next Activity</small><strong>{nextActivity?new Date(nextActivity.available_from).toLocaleString():"No scheduled activity"}</strong></div></div>
      <div className="tw-student-class-progress"><ProgressLine c={c} label="Completed activities" value={completed} total={totalKnown} accent="#22c55e"/><ProgressLine c={c} label="Unfinished assignments" value={unfinished} total={totalKnown} accent="#f97316"/><ProgressLine c={c} label="Live sessions attended" value={live.length} total={Math.max(live.length,1)} accent="#2b6cff"/></div>
      <div className="mt-[18px] text-[12px] uppercase tracking-[.1em] font-[950]" style={{color:c.textSub}}>This Class's Work</div>
      <div className="tw-student-work-grid mt-[10px]">
        <LiveSessionsCard c={c} dark={dark} sessions={openLive} onJoin={onJoinLive} joiningSession={joiningSession} />
        <WorkCard c={c} dark={dark} title="Ready to answer" icon="check" items={classReady} empty="No assigned works are open right now." variant="ready" render={(row) => <WorkItem key={row.quiz_id} c={c} item={row} variant="ready" action={<TeacherPressButton tone="blue" className="tw-student-live-action" aria-label="Answer" title="Answer" onClick={() => nav(`/student/async/${row.quiz_id}`)}><TwIcon name="answerCheck" size={18}/></TeacherPressButton>} />} />
        <WorkCard c={c} dark={dark} title="Upcoming works" icon="calendar" items={classUpcoming} empty="No scheduled works are waiting to open." variant="upcoming" render={(row) => <WorkItem key={row.quiz_id} c={c} item={row} />} />
        <WorkCard c={c} dark={dark} title="Nearing deadline" icon="alert" items={classNearing} empty="No works are due within the next 2 hours." variant="deadline" render={(row) => <WorkItem key={row.quiz_id} c={c} item={row} variant="deadline" action={<TeacherPressButton tone="blue" aria-label="Answer" title="Answer" onClick={() => nav(`/student/async/${row.quiz_id}`)}><TwIcon name="answerCheck" size={18}/></TeacherPressButton>} />} />
      </div>
      <div className="mt-[16px] text-[12px] uppercase tracking-[.1em] font-[950]" style={{color:c.textSub}}>Analytics</div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-[18px] mt-[10px]"><CompletedColumn c={c} title="Live Sessions" items={live} type="LIVE" onAnalytics={onAnalytics} compact/><CompletedColumn c={c} title="Assigned Sessions" items={assigned} type="ASSIGNED" onAnalytics={onAnalytics} compact/></div>
    </div>}
  </article>;
}

function CompletedColumn({ c, title, items, type, onAnalytics, compact = false }) {
  const shouldScroll = compact && items.length >= 5;
  return <div className="grid content-start gap-[10px]">
    <div className="font-[950]" style={{ color: c.text }}>{title}</div>
    {!items.length ? <div style={{ ...empty(c), padding: compact ? 14 : 22 }}>No completed {type === "LIVE" ? "live" : "assigned"} sessions yet.</div> : <div className={`tw-student-class-analytics-list${shouldScroll ? " is-scrollable" : ""}`}>{items.map((item) => <CompletedSessionCard key={`${type}-${item.session_id || item.quiz_id || item.id}`} c={c} item={item} type={type} onClick={() => onAnalytics({ type, id: type === "LIVE" ? item.session_id : item.quiz_id, title: item.quiz_title || item.title })} />)}</div>}
  </div>;
}

function ReportPill({ c, tone, children }) {
  return <span className="inline-flex items-center gap-[6px] px-[10px] py-[5px] rounded-[999px] text-[12px] font-[850]" style={{ border: `1px solid ${tone?.border || c.border}`, background: tone?.softBg || c.cardBg2, color: tone?.accent || c.textMuted }}>{children}</span>;
}

function CompletedSessionCard({ c, item, type, onClick }) {
  const tone = templateTone(item.template_type, c, false);
  const assigned = type === "ASSIGNED";
  return <div className="tw-session-card tw-class-home-session-card" style={{ ...templateCardChrome(item.template_type, c, false, { padding: 14, borderRadius: 14, display: "grid", gap: 10, borderWidth: 4, transition: "transform 220ms ease", cursor: "pointer" }) }} role="button" tabIndex={0} onClick={onClick} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onClick(); } }}>
    <div className="flex justify-between gap-[12px] flex-wrap items-center">
      <div><div className="font-black" style={{ color: c.text }}>{item.quiz_title || item.title || "Completed session"}</div><div className="text-[12px] mt-[4px]" style={{ color: c.textMuted }}>{item.class_name || "Class"}</div></div>
      <div className="flex gap-[8px] flex-wrap">
        <ReportPill c={c} tone={tone}>{templateLabel(item.template_type)}</ReportPill>
        <ReportPill c={c}>{Number(item.score || 0)}{assigned ? ` / ${Number(item.max_score || 0)}` : " pts"}</ReportPill>
      </div>
    </div>
    <div className="flex justify-between gap-[12px] items-center flex-wrap">
      <div className="text-[13px]" style={{ color: c.textMuted }}>{assigned ? "Assignment" : "Live session"} results are ready to review.</div>
      <button type="button" className="tw-analytics-text-link" onClick={(event) => { event.stopPropagation(); onClick(); }}>Open Analytics</button>
    </div>
  </div>;
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

function GridCardOpenModal({ c, title, icon, tone, items, onClose, renderItem }) {
  return <div style={modalBackdrop} onClick={onClose}><section onClick={(event) => event.stopPropagation()} className="w-[min(94vw,640px)] max-h-[82vh] overflow-y-auto relative" style={{ ...card(c), background: tone.bg, border: `4px solid ${tone.border}` }}>
    <button onClick={onClose} className="absolute top-[14px] right-[14px]" style={iconBtn(c)}><TwIcon name="close" size={18} /></button>
    <div style={{ ...workTitle(c), color: tone.fg, marginBottom: 14, paddingRight: 40 }}><TwIcon name={icon} size={20} />{title}<span className="font-bold text-[13px]" style={{ color: c.textMuted }}>({items.length})</span></div>
    <div className="grid gap-[12px]">{items.map(renderItem)}</div>
  </section></div>;
}

function LiveSessionsCard({ c, dark, sessions, onJoin, joiningSession }) {
  const tone = studentWorkTone(dark, "live");
  const [open, setOpen] = useState(false);
  function renderSession(session) {
    const status = session.status === "LOBBY" ? "Waiting in lobby" : session.status === "PAUSED" ? "Paused" : "Session started";
    return <div key={session.session_id} className="p-[12px] rounded-[14px]" style={{ background: c.cardBg, border: `2px solid ${tone.border}` }}><div className="flex justify-between gap-[8px] items-center"><span className="text-[11px] font-[950]" style={{ color: tone.accent }}>{templateLabel(session.template_type)}</span><span className="tw-student-live-status px-[10px] py-[5px] rounded-[999px] border-2 border-solid border-[#f59e0b] text-[11px] font-[950]" style={{ background: dark ? "#6f4c00" : "#fff0ad", color: dark ? "#ffe8a3" : "#7a4b00" }}>{status}</span></div><div className="font-[950] mt-[5px]" style={{ color: c.text }}>{session.quiz_title}</div><div className="text-[12px] mt-[5px] mb-[10px]" style={{ color: c.textMuted }}>{session.class_name}</div><TeacherPressButton tone="blue" className="tw-student-live-action" disabled={joiningSession === session.session_id} onClick={() => onJoin(session)}>{joiningSession === session.session_id ? "Joining…" : <TwIcon name="play" size={18}/>}</TeacherPressButton></div>;
  }
  return <div style={{ ...workCard(c), background: tone.bg, border: `4px solid ${tone.border}`, color: tone.fg }}>
    <div style={{ ...workTitle(c), color: tone.fg }}><TwIcon name="spark" size={18} /> Join live session</div>
    {!sessions.length ? <div className="text-[13px]" style={{ color: tone.fg }}>No live sessions are open right now.</div> : <>
      {renderSession(sessions[0])}
      {sessions.length > 1 && <button type="button" className="tw-grid-card-open-btn" style={{ color: tone.fg, borderColor: tone.border }} onClick={() => setOpen(true)}>Open ({sessions.length})</button>}
    </>}
    {open && <GridCardOpenModal c={c} title="Join live session" icon="spark" tone={tone} items={sessions} onClose={() => setOpen(false)} renderItem={renderSession} />}
  </div>;
}

function WorkCard({ c, dark, title, icon, items, empty: emptyText, render, variant = "upcoming" }) {
  const tone = studentWorkTone(dark, variant);
  const [open, setOpen] = useState(false);
  return <div style={{ ...workCard(c), background: tone.bg, border: `4px solid ${tone.border}`, color: tone.fg }}>
    <div style={{ ...workTitle(c), color: tone.fg }}><TwIcon name={icon} size={18} />{title}</div>
    {!items.length ? <div className="text-[13px] leading-[1.5]" style={{ color: tone.fg }}>{emptyText}</div> : <>
      {render(items[0])}
      {items.length > 1 && <button type="button" className="tw-grid-card-open-btn" style={{ color: tone.fg, borderColor: tone.border }} onClick={() => setOpen(true)}>Open ({items.length})</button>}
    </>}
    {open && <GridCardOpenModal c={c} title={title} icon={icon} tone={tone} items={items} onClose={() => setOpen(false)} renderItem={render} />}
  </div>;
}

function WorkItem({ c, item, action }) {
  const template = templateTone(item.template_type, c);
  return <div className="p-[12px] rounded-[14px]" style={{ background: c.cardBg, border: `2px solid ${template.border}` }}><div className="text-[11px] font-[950]" style={{ color: template.accent }}>{templateLabel(item.template_type)}</div><div className="font-[950] mt-[5px]" style={{ color: c.text }}>{item.title}</div><div className="text-[12px] leading-[1.5] mt-[5px] mb-[9px]" style={{ color: c.textMuted }}>{item.class_name} · {formatAssignmentWindow(item)}</div>{action}</div>;
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
  return <div style={modalBackdrop}><div className="w-[min(94vw,680px)] max-h-[88vh] overflow-y-auto relative" style={card(c)}><button onClick={onClose} className="absolute top-[14px] right-[14px]" style={iconBtn(c)}><TwIcon name="close" size={18} /></button><div className="font-[950] uppercase text-[12px]" style={{ color: tone.accent }}>{templateLabel(payload?.session?.template_type)}</div><h3 className="pr-[45px]" style={{ color: c.text }}>{payload?.session?.title || target.title || "Session Analytics"}</h3>{error ? <div style={notice(c, "error")}>{error}</div> : !payload ? <div className="p-[30px] text-center" style={{ color: c.textMuted }}>Loading analytics…</div> : !question ? <div style={empty(c)}>No question details are available.</div> : <div><div className="p-[18px] rounded-[18px]" style={{ border: `2px solid ${tone.border}`, background: tone.softBg }}><div className="font-[950] mb-[10px]" style={{ color: tone.accent }}>Question {question.number || index + 1}</div><div className="text-[18px] font-[950] leading-[1.55]" style={{ color: c.text }}>{question.prompt || "Untitled question"}</div></div><div className="flex items-center gap-[12px] mt-[18px] p-[15px] rounded-[16px]" style={{ background: question.isCorrect ? c.greenBg : c.redBg, color: question.isCorrect ? c.greenFg : c.redFg, border: `1px solid ${question.isCorrect ? c.greenBorder : c.redBorder}` }}><span className="text-[25px] font-[950]">{question.isCorrect ? "✓" : "✕"}</span><div><div className="font-[950]">{question.isCorrect ? "You answered right" : "You answered wrong"}</div>{question.isCorrect && <div className="mt-[5px] text-[13px]">Answer: {formatAnswer(question.correctAnswer ?? question.answer)}</div>}</div></div><div className="flex justify-between gap-[12px] mt-[20px]">{index > 0 ? <button onClick={() => setIndex((value) => value - 1)} style={secondary(c)}>← Previous</button> : <span />}{index < questions.length - 1 && <button onClick={() => setIndex((value) => value + 1)} style={primary(c)}>Next →</button>}</div></div>}</div></div>;
}

function ClassRemovalModal({ c, notice, onClose }) {
  return <div style={modalBackdrop} onClick={onClose}>
    <section onClick={(event) => event.stopPropagation()} className="w-[min(92vw,560px)] text-center py-[34px] px-[30px]" style={card(c)}>
      <div className="w-[64px] h-[64px] mx-auto mb-[18px] mt-0 grid place-items-center rounded-[18px]" style={{ background: c.redBg, color: c.redFg, border: `2px solid ${c.redBorder}` }}><TwIcon name="alert" size={34} /></div>
      <h2 style={{ color: c.text, margin: "0 0 12px" }}>Class membership updated</h2>
      <p className="text-[16px] leading-[1.65] m-[0_0_24px]" style={{ color: c.textMuted }}>You have been removed from the class <b style={{ color: c.text }}>{notice.class_name}</b>.</p>
      <TeacherPressButton tone="blue" onClick={onClose}>Okay</TeacherPressButton>
    </section>
  </div>;
}

function ProfileModal({ c, profile, setProfile, message, onSubmit, onClose, onUpload, onDelete, onBirth }) {
  return <div style={modalBackdrop}><form onSubmit={onSubmit} className="w-[min(94vw,600px)] max-h-[90vh] overflow-y-auto relative" style={card(c)}>
    <button type="button" onClick={onClose} className="absolute top-[14px] right-[14px]" style={iconBtn(c)}><TwIcon name="close" size={18} /></button>
    <h3 style={{ marginTop: 0, color: c.text }}>Student Info</h3>
    <div className="grid place-items-center mb-[22px]">
      <div className="relative">
        <button type="button" onClick={onUpload} aria-label="Upload profile picture" title="Upload profile picture" className="w-[105px] h-[105px] p-0 rounded-[50%] grid place-items-center overflow-hidden cursor-pointer" style={{ border: `3px solid ${c.accent}`, background: c.cardBg2, color: c.text, transition: "transform .2s ease, box-shadow .2s ease" }}>
          {profile.profileImage ? <img src={profile.profileImage} alt="Student profile" className="w-full h-full object-cover" /> : <TwIcon name="user" size={48} />}
        </button>
        {profile.profileImage && <button type="button" onClick={onDelete} aria-label="Remove profile picture" title="Remove profile picture" className="absolute top-0 right-0 w-[29px] h-[29px] p-0 rounded-[50%] grid place-items-center cursor-pointer shadow-[0_6px_18px_rgba(0,0,0,0.22)]" style={{ transform: "translate(28%,-28%)", border: `1px solid ${c.redBorder}`, background: c.cardBg3, color: c.redFg }}><TwIcon name="close" size={15} strokeWidth={3} /></button>}
      </div>
    </div>
    <h4 className="mb-[12px]" style={{ color: c.text }}>Student Details</h4>
    <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-[12px]">
      <Field c={c} label="First name *"><input required value={profile.firstName} onChange={(e) => setProfile({ ...profile, firstName: e.target.value })} style={input(c)} /></Field>
      <Field c={c} label="Last name *"><input required value={profile.lastName} onChange={(e) => setProfile({ ...profile, lastName: e.target.value })} style={input(c)} /></Field>
      <Field c={c} label="Birth date"><button type="button" onClick={onBirth} className="text-left cursor-pointer" style={input(c)}>{profile.birthDate ? formatDateOnly(profile.birthDate) : "Select birth date"}</button></Field>
      <Field c={c} label="Student ID *"><input required value={profile.studentId} onChange={(e) => setProfile({ ...profile, studentId: e.target.value })} style={input(c)} /></Field>
    </div>
    {message && <div className="mt-[14px]" style={notice(c, "error")}>{message}</div>}
    <div className="flex justify-end mt-[20px]"><button style={primary(c)}>Save</button></div>
  </form></div>;
}

function ProfileSavedOverlay() { return <div className="tw-profile-success-backdrop"><div className="tw-profile-success-box"><TwIcon name="check" size={58} strokeWidth={3.4} /></div></div>; }

function JoinClassModal({ c, classCode, setClassCode, profile, setProfile, profileStep, countdown, onSubmit, onClose }) {
  return <div style={modalBackdrop} onClick={onClose}><form onSubmit={onSubmit} onClick={(event) => event.stopPropagation()} className="w-[min(94vw,620px)]" style={{ ...card(c), padding: 28 }}>
    <h2 style={{ marginTop: 0, color: c.text }}>Join a Class</h2>
    <p className="mt-[-4px]" style={{ color: c.textMuted }}>Enter the class code provided by your teacher.</p>
    <Field c={c} label="Class code"><input value={classCode} onChange={(e) => setClassCode(e.target.value.toUpperCase())} placeholder="Enter class code" required style={input(c)} /></Field>
    {profileStep && <div className="grid gap-[10px] mt-[16px] p-[16px] rounded-[16px]" style={{ background: c.cardBg2, border: `1px solid ${c.border}` }}><p className="text-[13px] m-0" style={{ color: c.textMuted }}>Complete your student details before joining your first class.</p><div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-[10px]"><input required value={profile.firstName} onChange={(e) => setProfile({ ...profile, firstName: e.target.value })} placeholder="First name" style={input(c)} /><input required value={profile.lastName} onChange={(e) => setProfile({ ...profile, lastName: e.target.value })} placeholder="Last name" style={input(c)} /></div><input value={profile.middleInitial} onChange={(e) => setProfile({ ...profile, middleInitial: e.target.value })} placeholder="Middle initial (optional)" style={input(c)} /><input required value={profile.studentId} onChange={(e) => setProfile({ ...profile, studentId: e.target.value })} placeholder="Student ID" style={input(c)} /><div className="text-[12px]" style={{ color: c.textMuted }}>Join unlocks in {Math.max(0, countdown - 5)}s.</div></div>}
    <div className="flex justify-end items-center gap-[16px] mt-[22px]"><button type="button" onClick={onClose} className="tw-teacher-text-cancel">Cancel</button><TeacherPressButton type="submit" tone="blue" disabled={profileStep && countdown > 5}>{profileStep && countdown > 5 ? "Please wait…" : "Join"}</TeacherPressButton></div>
  </form></div>;
}

function BirthDateModal({ c, value, onSelect, onClose }) {
  const initial = value ? new Date(`${value}T12:00:00`) : new Date(2010, 0, 1);
  const [view, setView] = useState(new Date(initial.getFullYear(), initial.getMonth(), 1));
  const [selected, setSelected] = useState(initial);
  const days = calendarDays(view);
  return <div style={{ ...modalBackdrop, zIndex: 4000 }}><div className="w-[min(94vw,430px)]" style={card(c)}><div style={sectionHeader(c)}><h3 style={{ margin: 0 }}>Select Birth Date</h3><button onClick={onClose} style={iconBtn(c)}><TwIcon name="close" size={18} /></button></div><div className="flex justify-between items-center mt-[18px] mb-[12px]"><button onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))} style={secondary(c)}>‹</button><b>{view.toLocaleString("en-PH", { month: "long", year: "numeric" })}</b><button onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))} style={secondary(c)}>›</button></div><div className="grid grid-cols-[repeat(7,1fr)] text-center gap-[5px]">{["Su","Mo","Tu","We","Th","Fr","Sa"].map((day) => <div key={day} className="text-[11px] font-[950]" style={{ color: c.textMuted }}>{day}</div>)}{days.map((day, index) => day ? <button key={index} onClick={() => setSelected(new Date(view.getFullYear(), view.getMonth(), day, 12))} style={{ border: `1px solid ${sameDay(selected, view, day) ? c.accent : "transparent"}`, background: sameDay(selected, view, day) ? c.accent : c.cardBg2, color: sameDay(selected, view, day) ? "#fff" : c.text }} className="h-[40px] rounded-[9px] cursor-pointer font-[inherit] font-black">{day}</button> : <span key={index} />)}</div><button onClick={() => onSelect(toDateValue(selected))} className="w-full mt-[18px]" style={primary(c)}>Use This Date</button></div></div>;
}

function Field({ c, label, children }) { return <label className="grid gap-[6px] text-[12px] font-black" style={{ color: c.textMuted }}>{label}{children}</label>; }
function ProgressLine({ c, label, value, total, accent }) { const pct = total > 0 ? Math.min(100, Math.round(value / total * 100)) : 0; return <div><div className="flex justify-between font-[950] text-[12px] mb-[7px]" style={{ color: c.text }}><span>{label}</span><span style={{ color: c.textMuted }}>{value}/{total || 0}</span></div><div className="h-[18px] rounded-[5px] p-[2px] overflow-hidden shadow-[inset_0_2px_4px_rgba(0,0,0,0.18)]" style={{ background: c.cardBg2, border: `2px solid ${c.border}` }}><div style={{ width: `${pct}%`, height: "100%", borderRadius: 2, background: `repeating-linear-gradient(90deg, ${accent} 0 12px, ${accent}cc 12px 15px)`, boxShadow: `0 0 12px ${accent}88`, transition: "width .35s ease" }} /></div></div>; }

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
function formatAssignmentWindow(item) { const start = item.available_from ? manilaDateTime(item.available_from, { dateStyle: "medium", timeStyle: "short" }) : "No start"; const end = item.available_until ? manilaDateTime(item.available_until, { dateStyle: "medium", timeStyle: "short" }) : "No deadline"; return `${start} → ${end}`; }
function isThisWeek(value) { if (!value) return false; const date = new Date(value); const now = new Date(); const start = new Date(now); const day = (now.getDay() + 6) % 7; start.setDate(now.getDate() - day); start.setHours(0,0,0,0); const end = new Date(start); end.setDate(start.getDate() + 7); return date >= start && date < end; }
function calendarDays(view) { const first = new Date(view.getFullYear(), view.getMonth(), 1).getDay(); const count = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate(); return [...Array(first).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)]; }
function sameDay(selected, view, day) { return selected.getFullYear() === view.getFullYear() && selected.getMonth() === view.getMonth() && selected.getDate() === day; }
function toDateValue(date) { const pad = (n) => String(n).padStart(2, "0"); return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`; }
// Anchor the noon-buffer instant to Manila explicitly (+08:00) instead of the
// browser's own local zone, then read it back in Manila too - otherwise a
// browser far enough from Manila could still push the displayed date a day
// off in either direction.
function formatDateOnly(value) { return manilaDate(`${String(value).slice(0,10)}T12:00:00+08:00`, { dateStyle: "long" }); }

const modalBackdrop = { position: "fixed", inset: 0, background: "rgba(3,7,18,.62)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", display: "grid", placeItems: "center", padding: 20, zIndex: 3000 };
function card(c) { return { background: c.cardBg, border: `1px solid ${c.border}`, borderRadius: 18, padding: 18, color: c.text, boxShadow: c.pageBg === "#eef2ff" ? "0 16px 34px rgba(43,108,255,.08)" : "0 16px 34px rgba(0,0,0,.14)" }; }
function workCard(c) { return { ...card(c), display: "grid", gap: 11, alignContent: "start", minHeight: 170 }; }
function workTitle(c) { return { display: "flex", alignItems: "center", gap: 9, color: c.text, fontWeight: 950, marginBottom: 3 }; }
function input(c) { return { width: "100%", boxSizing: "border-box", padding: "12px 13px", borderRadius: 11, border: `1px solid ${c.inputBorder || c.border}`, background: c.inputBg || c.cardBg2, color: c.text, fontFamily: "inherit" }; }
function primary() { return { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "10px 14px", borderRadius: 11, border: 0, background: "#2b6cff", color: "#fff", fontFamily: "inherit", fontWeight: 950, cursor: "pointer" }; }
function secondary(c) { return { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "10px 14px", borderRadius: 11, border: `1px solid ${c.border}`, background: c.cardBg2, color: c.text, fontFamily: "inherit", fontWeight: 950, cursor: "pointer" }; }
function sideAction(c) { return { ...secondary(c), justifyContent: "flex-start", width: "100%", background: "transparent", borderColor: c.sidebarBorder, color: c.navColor, fontSize: 13, fontWeight: 600 }; }
function iconBtn(c) { return { width: 38, height: 38, display: "grid", placeItems: "center", borderRadius: 11, border: `1px solid ${c.border}`, background: c.cardBg2, color: c.text, cursor: "pointer" }; }
function profileGearBtn(c) { return { width: 38, height: 38, padding: 0, overflow: "hidden", display: "grid", placeItems: "center", borderRadius: "50%", border: 0, background: "rgba(255,255,255,.08)", color: c.navColor, cursor: "pointer" }; }
function sectionHeader(c) { return { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", color: c.text }; }
function empty(c) { return { padding: 20, borderRadius: 14, border: `1px dashed ${c.border}`, color: c.textMuted, textAlign: "center" }; }
function notice(c, kind) { return { padding: 12, borderRadius: 12, background: kind === "success" ? c.greenBg : c.redBg, color: kind === "success" ? c.greenFg : c.redFg, border: `1px solid ${kind === "success" ? c.greenBorder : c.redBorder}`, fontWeight: 900 }; }
