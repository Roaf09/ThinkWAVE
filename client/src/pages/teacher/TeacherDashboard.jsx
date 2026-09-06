/* FILE GUIDE:
 * client/src/pages/teacher/TeacherDashboard.jsx
 * Purpose: Teacher dashboard shell, profile settings, and tab container.
 */

import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { clearToken, clearRole } from "../../lib/auth";
import { api, setAuthToken } from "../../lib/api";
import { useTheme, useColors, ThemedModal } from "../../context/ThemeContext";
import { TwIcon } from "../../components/TwUI";
import ThemeIconButton from "../../components/ThemeIconButton";
import { TeacherActionModal } from "./TeacherUI";
import ThinkBotTutorial from "../../components/ThinkBotTutorial";
import { readTutorialState, writeTutorialState, markMainStage } from "../../lib/tutorialState";
import { TEMPLATE_TYPES } from "../../lib/templateTypes";

import HomeTab           from "./tabs/HomeTab";
import CreateTab         from "./tabs/CreateTab";
import QuestionBankTab   from "./tabs/QuestionBankTab";
import LiveSessionsTab   from "./tabs/LiveSessionsTab";
import ClassesTab        from "./tabs/ClassesTab";
import SessionHistoryTab from "./tabs/SessionHistoryTab";

const blankProfile = { firstName: "", lastName: "", contactNumber: "", email: "", institutionName: "", profileImage: "" };

export default function TeacherDashboard() {
  const [activeTab, setActiveTab] = useState("home");
  const [showLogout, setShowLogout] = useState(false);
  const [bankLabel, setBankLabel] = useState("Quiz Bank");
  const [profileOpen, setProfileOpen] = useState(false);
  const [profile, setProfile] = useState(blankProfile);
  const [profileError, setProfileError] = useState("");
  const [profileSaved, setProfileSaved] = useState(false);
  const [tutorialUserId, setTutorialUserId] = useState(null);
  const [tutorialState, setTutorialState] = useState({});
  const profileFileRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { dark, toggleTheme } = useTheme();
  const c = useColors();

  useEffect(() => {
    api.get("/auth/me").then(({ data }) => {
      setProfile(profileFromUser(data));
      if (!data?.id) return;
      setTutorialUserId(data.id);
      const saved = readTutorialState(data.id);
      let firstLoginPending = false;
      try { firstLoginPending = sessionStorage.getItem("tw_teacher_first_login") === "1"; } catch {}
      if (!saved.mainComplete && (firstLoginPending || saved.mainStarted)) {
        const stage = saved.mainStage || "home_welcome";
        const next = saved.mainStarted ? saved : writeTutorialState(data.id, { ...saved, mainStarted: true, mainStage: stage });
        setTutorialState(next);
      } else {
        setTutorialState(saved);
      }
      try { sessionStorage.removeItem("tw_teacher_first_login"); } catch {}
    }).catch(() => {});
  }, []);

  useEffect(() => { if (location.state?.tab) setActiveTab(location.state.tab); }, [location.state]);


  function setTutorialStage(stage, extra = {}) {
    if (!tutorialUserId) return;
    const next = markMainStage(tutorialUserId, stage, extra);
    setTutorialState(next);
  }

  function patchTutorial(patch) {
    if (!tutorialUserId) return;
    const next = writeTutorialState(tutorialUserId, patch);
    setTutorialState(next);
  }

  // Skipping from the very first dialog needs to suppress every leg of the
  // guided tour, not just the Classes/Create/Sessions nav prompts - otherwise
  // a teacher who skips still gets ambushed by the Quiz Builder, Host Panel,
  // or Analytics walkthroughs the first time they reach those screens.
  function skipMainTutorial() {
    if (!tutorialUserId) return;
    const alreadySeenTemplates = readTutorialState(tutorialUserId)?.templateSeen || {};
    const allTemplatesSeen = Object.keys(TEMPLATE_TYPES).reduce(
      (acc, templateType) => ({ ...acc, [templateType]: true }),
      { ...alreadySeenTemplates }
    );
    const next = writeTutorialState(tutorialUserId, {
      mainStarted: true,
      mainComplete: true,
      mainStage: "complete",
      templateSeen: allTemplatesSeen,
      hostPanelSeen: true,
      hostSetupSeen: true,
      assignmentSetupSeen: true,
      analyticsTutorialSeen: true,
    });
    setTutorialState(next);
  }

  const tutorial = {
    userId: tutorialUserId,
    state: tutorialState,
    stage: tutorialState?.mainComplete ? "complete" : tutorialState?.mainStage,
    setStage: setTutorialStage,
    patch: patchTutorial,
  };

  function doLogout() {
    clearToken();
    clearRole();
    setAuthToken("");
    navigate("/");
  }

  async function saveProfile(event) {
    event.preventDefault();
    setProfileError("");
    try {
      const { data } = await api.patch("/auth/me", {
        firstName: profile.firstName,
        lastName: profile.lastName,
        contactNumber: profile.contactNumber || null,
        profileImage: profile.profileImage || null,
      });
      setProfile(profileFromUser(data));
      setProfileOpen(false);
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2000);
    } catch (error) {
      setProfileError(error?.response?.data?.message || "Unable to save profile settings.");
    }
  }

  function handleProfileImage(file) {
    if (!file) return;
    if (!String(file.type || "").startsWith("image/")) return setProfileError("Please choose an image file.");
    if (file.size > 2_500_000) return setProfileError("Profile image must be 2.5 MB or smaller.");
    const reader = new FileReader();
    reader.onload = () => setProfile((current) => ({ ...current, profileImage: String(reader.result || "") }));
    reader.readAsDataURL(file);
  }

  const navItems = [
    { id: "home", label: "Home", icon: "home" },
    { id: "classes", label: "Class", icon: "classes" },
    { id: "create", label: "Create", icon: "create" },
    { id: "live", label: "Sessions", icon: "live" },
    { id: "bank", label: bankLabel, icon: "bank" },
    { id: "history", label: "History", icon: "history" },
  ];

  function renderTab() {
    switch (activeTab) {
      case "home": return <HomeTab setActiveTab={setActiveTab} tutorial={tutorial} />;
      case "create": return <CreateTab setActiveTab={setActiveTab} tutorial={tutorial} />;
      case "bank": return <QuestionBankTab setBankLabel={setBankLabel} setActiveTab={setActiveTab} tutorial={tutorial} />;
      case "live": return <LiveSessionsTab setActiveTab={setActiveTab} tutorial={tutorial} />;
      case "classes": return <ClassesTab setActiveTab={setActiveTab} tutorial={tutorial} />;
      case "history": return <SessionHistoryTab setActiveTab={setActiveTab} tutorial={tutorial} />;
      default: return <HomeTab setActiveTab={setActiveTab} tutorial={tutorial} />;
    }
  }

  return (
    <div className={`tw-responsive-dashboard${activeTab === "live" ? " tw-sessions-dashboard" : ""}`} style={{ display: "flex", minHeight: "100vh", background: c.pageBg, transition: "background 0.3s" }}>
      <aside data-sidebar="true" className="tw-responsive-sidebar" style={sidebar(c)}>
        <div style={{ padding: "26px 18px 22px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${c.sidebarBorder}`, marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline" }}><span style={{ fontSize: 20, fontWeight: 900, color: "#e7e9ee" }}>Think</span><span style={{ fontSize: 20, fontWeight: 900, color: "#2b6cff" }}>WAVE</span></div>
          <button onClick={() => setProfileOpen(true)} title="Profile settings" style={avatarButton(c)}>
            {profile.profileImage ? <img src={profile.profileImage} alt="Teacher profile" style={avatarImage} /> : <TwIcon name="user" size={20} />}
          </button>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 4, padding: "0 12px", flex: 1 }}>
          {navItems.map((item) => (
            <button key={item.id} data-tutorial={`nav-${item.id}`} style={navButton(c, activeTab === item.id)} onClick={() => {
              setActiveTab(item.id);
              if (tutorial.stage === "nav_classes" && item.id === "classes") setTutorialStage("classes_intro_delay");
              if (tutorial.stage === "nav_create" && item.id === "create") setTutorialStage("create_intro_delay");
              if (tutorial.stage === "nav_sessions" && item.id === "live") setTutorialStage("sessions_intro");
            }}>
              <span style={{ width: 20, display: "inline-flex", justifyContent: "center" }}><TwIcon name={item.icon} size={18} /></span>
              <span key={item.id === "bank" ? item.label : `${item.id}-${item.label}`} className={item.id === "bank" ? "sidebar-bank-label" : undefined}>{item.label}</span>
            </button>
          ))}
        </nav>

        <div style={{ padding: "0 12px", display: "flex", gap: 8, alignItems: "center" }}>
          <ThemeIconButton dark={dark} onClick={toggleTheme} style={{ color: c.navColor, borderColor: c.sidebarBorder, background: "transparent", flex: "0 0 auto" }} size={17} />
          <button onClick={() => setShowLogout(true)} style={{ ...sideAction(c), flex: 1, justifyContent: "center" }}><TwIcon name="logout" size={17} /><span>Logout</span></button>
        </div>
      </aside>

      <main className={`tw-responsive-dashboard-main${activeTab === "live" ? " tw-sessions-main" : ""}`} style={{ marginLeft: 220, width: "calc(100% - 220px)", flex: 1, minHeight: "100vh", overflowY: "visible", overflowX: "hidden", boxSizing: "border-box" }}>
        <div key={activeTab} className="dashboard-tab-panel">{renderTab()}</div>
      </main>

      {tutorial.stage === "home_welcome" && <ThinkBotTutorial transparent actionLabel="Okay!" actionDelay={2000} onAction={() => setTutorialStage("home_build")} secondaryLabel="Skip" onSecondary={skipMainTutorial}><p><strong>Welcome to ThinkWAVE!</strong></p><p>I’m ThinkBot. I’ll help you set up your workspace and get your first activity ready for your students.</p></ThinkBotTutorial>}
      {tutorial.stage === "home_build" && <ThinkBotTutorial className="tw-tutorial-home-build" actionLabel="Let's Go" actionDelay={2000} onAction={() => setTutorialStage("nav_classes")}><p>We’ll build things as we go, so you won’t have to memorize everything at once.</p></ThinkBotTutorial>}
      {tutorial.stage === "nav_classes" && <ThinkBotTutorial target='[data-tutorial="nav-classes"]' placement="right" dialogWidth={270} className="tw-tutorial-nav-lower tw-tutorial-nav-flow" highlight highlightMode="target"><p>Next, let’s go to <strong>Class</strong>.</p></ThinkBotTutorial>}
      {tutorial.stage === "nav_create" && <ThinkBotTutorial target='[data-tutorial="nav-create"]' placement="right" dialogWidth={270} className="tw-tutorial-nav-lower tw-tutorial-nav-flow" highlight highlightMode="target"><p>Next, let’s go to <strong>Create</strong>.</p></ThinkBotTutorial>}
      {tutorial.stage === "nav_sessions" && <ThinkBotTutorial target='[data-tutorial="nav-live"]' placement="right" dialogWidth={285} className="tw-tutorial-nav-flow" highlight highlightMode="target"><p>Next, let’s go to <strong>Sessions</strong>.</p></ThinkBotTutorial>}

      {profileOpen && <TeacherProfileModal c={c} profile={profile} setProfile={setProfile} error={profileError} onSubmit={saveProfile} onClose={() => { setProfileOpen(false); setProfileError(""); }} onUpload={() => profileFileRef.current?.click()} />}
      <input ref={profileFileRef} type="file" accept="image/*" hidden onChange={(event) => { handleProfileImage(event.target.files?.[0]); event.target.value = ""; }} />
      {profileSaved && <ProfileSavedOverlay />}
      {showLogout && <TeacherActionModal c={c} icon="logout" title="Logout" message="Are you sure you want to log out of the teacher dashboard?" tone="red" confirmLabel="Yes, Logout" hideCancel onClose={() => setShowLogout(false)} onConfirm={doLogout} />}
    </div>
  );
}

function TeacherProfileModal({ c, profile, setProfile, error, onSubmit, onClose, onUpload }) {
  return <div style={modalBackdrop}><form onSubmit={onSubmit} style={{ ...modalCard(c), width: "min(94vw,600px)", position: "relative" }}>
    <button type="button" onClick={onClose} style={{ ...iconButton(c), position: "absolute", right: 14, top: 14 }}><TwIcon name="close" size={18} /></button>
    <h3 style={{ marginTop: 0, color: c.text }}>Teacher Info</h3>
    <div style={{ display: "grid", placeItems: "center", marginBottom: 22 }}>
      <div style={{ position: "relative" }}>
        <button type="button" onClick={onUpload} aria-label="Upload profile picture" title="Upload profile picture" style={{ width: 105, height: 105, padding: 0, borderRadius: "50%", display: "grid", placeItems: "center", overflow: "hidden", border: `3px solid ${c.accent}`, background: c.cardBg2, color: c.text, cursor: "pointer", transition: "transform .2s ease, box-shadow .2s ease" }}>{profile.profileImage ? <img src={profile.profileImage} alt="Teacher profile" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <TwIcon name="user" size={48} />}</button>
        {profile.profileImage && <button type="button" onClick={() => setProfile({ ...profile, profileImage: "" })} aria-label="Remove profile picture" title="Remove profile picture" style={{ position: "absolute", top: 0, right: 0, transform: "translate(28%,-28%)", width: 29, height: 29, padding: 0, borderRadius: "50%", display: "grid", placeItems: "center", border: `1px solid ${c.redBorder}`, background: c.cardBg3, color: c.redFg, cursor: "pointer", boxShadow: "0 6px 18px rgba(0,0,0,.22)" }}><TwIcon name="close" size={15} strokeWidth={3} /></button>}
      </div>
    </div>
    <h4 style={{ color: c.text, marginBottom: 12 }}>Teacher Details</h4>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 12 }}>
      <Field label="First name *" c={c}><input required value={profile.firstName} onChange={(e) => setProfile({ ...profile, firstName: e.target.value })} style={input(c)} /></Field>
      <Field label="Last name *" c={c}><input required value={profile.lastName} onChange={(e) => setProfile({ ...profile, lastName: e.target.value })} style={input(c)} /></Field>
      <Field label="Email" c={c}><input disabled value={profile.email} style={{ ...input(c), opacity: .72 }} /></Field>
      <Field label="Contact number" c={c}><input value={profile.contactNumber} onChange={(e) => setProfile({ ...profile, contactNumber: e.target.value })} style={input(c)} /></Field>
      <Field label="Institution" c={c}><input disabled value={profile.institutionName || "Basic plan"} style={{ ...input(c), opacity: .72 }} /></Field>
    </div>
    {error && <div style={{ marginTop: 14, padding: 12, borderRadius: 12, color: c.redFg, background: c.redBg, border: `1px solid ${c.redBorder}`, fontWeight: 850 }}>{error}</div>}
    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}><button style={primary(c)}>Save</button></div>
  </form></div>;
}

function ProfileSavedOverlay() { return <div className="tw-profile-success-backdrop"><div className="tw-profile-success-box"><TwIcon name="check" size={58} strokeWidth={3.4} /></div></div>; }
function Field({ label, c, children }) { return <label style={{ display: "grid", gap: 7, color: c.textMuted, fontSize: 12, fontWeight: 850 }}>{label}{children}</label>; }
function profileFromUser(user = {}) { return { firstName: user.first_name || "", lastName: user.last_name || "", contactNumber: user.contact_number || "", email: user.email || "", institutionName: user.institution_name || "", profileImage: user.profile_image || "" }; }

const avatarImage = { width: "100%", height: "100%", objectFit: "cover" };
const modalBackdrop = { position: "fixed", inset: 0, zIndex: 3000, display: "grid", placeItems: "center", padding: 20, background: "rgba(3,7,18,.62)", backdropFilter: "blur(10px)" };
function sidebar(c) { return { width: 220, minWidth: 220, background: c.sidebarBg, borderRight: `1px solid ${c.sidebarBorder}`, display: "flex", flexDirection: "column", padding: "0 0 24px", position: "fixed", top: 0, left: 0, height: "100vh", overflowY: "auto", zIndex: 100, transition: "background .3s,border-color .3s" }; }
function navButton(c, active) { return { display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderRadius: 12, border: "none", background: active ? "linear-gradient(135deg,#2b6cff,#5b7cff)" : "transparent", boxShadow: active ? "0 5px 0 rgba(18,54,145,.5),0 10px 20px rgba(43,108,255,.18)" : "none", transform: active ? "translateY(-1px)" : "none", color: active ? "#fff" : c.navColor, fontFamily: "inherit", fontSize: 14, fontWeight: 700, cursor: "pointer", textAlign: "left", width: "100%", transition: "transform .18s ease,background .2s,color .2s,box-shadow .18s ease" }; }
function sideAction(c) { return { display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 14px", borderRadius: 10, border: `1px solid ${c.sidebarBorder}`, background: "transparent", color: c.navColor, fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "color .2s,border-color .2s" }; }
function avatarButton(c) { return { width: 38, height: 38, padding: 0, overflow: "hidden", display: "grid", placeItems: "center", borderRadius: "50%", border: 0, background: "rgba(255,255,255,.08)", color: c.navColor, cursor: "pointer" }; }
function modalCard(c) { return { background: c.cardBg, color: c.text, border: `1px solid ${c.border}`, borderRadius: 20, padding: 20, boxShadow: "0 28px 80px rgba(0,0,0,.28)" }; }
function iconButton(c) { return { width: 38, height: 38, display: "grid", placeItems: "center", borderRadius: 11, border: `1px solid ${c.border}`, background: c.cardBg2, color: c.text, cursor: "pointer" }; }
function input(c) { return { width: "100%", boxSizing: "border-box", padding: "12px 13px", borderRadius: 11, border: `1px solid ${c.inputBorder || c.border}`, background: c.inputBg || c.cardBg2, color: c.text, fontFamily: "inherit" }; }
function primary(c) { return { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "10px 14px", borderRadius: 11, border: 0, background: "#2b6cff", color: "#fff", fontFamily: "inherit", fontWeight: 950, cursor: "pointer" }; }
function secondary(c) { return { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "10px 14px", borderRadius: 11, border: `1px solid ${c.border}`, background: c.cardBg2, color: c.text, fontFamily: "inherit", fontWeight: 950, cursor: "pointer" }; }
