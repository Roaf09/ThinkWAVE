/* FILE GUIDE:
 * client/src/pages/teacher/TeacherDashboard.jsx
 * Purpose: Teacher dashboard shell, profile settings, and tab container.
 */

import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { clearToken, clearRole } from "../../lib/auth";
import { clearLastRoute } from "../../lib/lastRoute";
import { api, setAuthToken } from "../../lib/api";
import { useTheme, useColors } from "../../context/ThemeContext";
import { TwIcon } from "../../components/TwUI";
import { sidebarStyle as sidebar, dashboardNavButtonStyle as navButton } from "../../components/DashboardShell";
import ThemeIconButton from "../../components/ThemeIconButton";
import { TeacherActionModal } from "./TeacherUI";
import ThinkBotTutorial from "../../components/ThinkBotTutorial";
import { MobileTopHeader, MobileTabBar } from "../../components/MobileAppChrome";
import { useIsMobileViewport } from "./tabs/teacherTabShared";
import { readTutorialState, writeTutorialState, markMainStage, resetTutorialState } from "../../lib/tutorialState";
import { TEMPLATE_TYPES } from "../../lib/templateTypes";

import HomeTab           from "./tabs/HomeTab";
import CreateTab         from "./tabs/CreateTab";
import QuestionBankTab   from "./tabs/QuestionBankTab";
import LiveSessionsTab   from "./tabs/LiveSessionsTab";
import ClassesTab        from "./tabs/ClassesTab";
import SessionHistoryTab from "./tabs/SessionHistoryTab";

const blankProfile = { firstName: "", lastName: "", contactNumber: "", email: "", institutionName: "", profileImage: "" };

// Resuming a tour after an interruption must land on a stage that can actually
// render: folder-name modals don't survive a reload, so modal-gated waits fall
// back to the stable prompt that reopens them.
const TRANSIENT_TUTORIAL_FALLBACK = {
  classes_wait_subject: "classes_intro",
  classes_wait_section: "classes_create_section",
};

function tutorialTabForStage(stage) {
  if (!stage) return null;
  if (stage.startsWith("classes_")) return "classes";
  if (stage.startsWith("create_") || stage.startsWith("builder_")) return "create";
  if (stage.startsWith("sessions_") || stage.startsWith("host_") || stage.startsWith("assign_")) return "live";
  return "home";
}

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
  const isMobileViewport = useIsMobileViewport();
  const profileFileRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { dark, toggleTheme } = useTheme();
  const c = useColors();

  useEffect(() => {
    api.get("/auth/me").then(async ({ data }) => {
      setProfile(profileFromUser(data));
      if (!data?.id) return;
      setTutorialUserId(data.id);
      let saved = readTutorialState(data.id);
      // A recreated database restarts AUTO_INCREMENT, so a brand-new account
      // can reuse an id whose tour is already marked complete in this
      // browser. The account creation timestamp tells the two apart: on a
      // mismatch, drop the stale tour and treat this as a fresh account.
      const accountCreated = data.created_at ? String(data.created_at) : null;
      if (accountCreated && saved.tutorialAccountCreated && saved.tutorialAccountCreated !== accountCreated) {
        saved = resetTutorialState(data.id);
      }
      if (accountCreated && !saved.tutorialAccountCreated) {
        saved = writeTutorialState(data.id, { tutorialAccountCreated: accountCreated });
      }
      let firstLoginPending = false;
      try { firstLoginPending = sessionStorage.getItem("tw_teacher_first_login") === "1"; } catch {}
      if (!saved.mainComplete && (firstLoginPending || saved.mainStarted)) {
        let stage = saved.mainStage || "home_welcome";
        let next = saved.mainStarted ? saved : writeTutorialState(data.id, { ...saved, mainStarted: true, mainStage: stage });
        const fallback = TRANSIENT_TUTORIAL_FALLBACK[stage];
        if (fallback) {
          stage = fallback;
          next = writeTutorialState(data.id, { ...next, mainStage: fallback });
        }
        const tab = tutorialTabForStage(stage);
        if (tab) setActiveTab(tab);
        setTutorialState(next);
      } else if (!saved.mainComplete && !saved.mainStarted) {
        // Fallback: the one-shot first-login flag may have been burned without
        // the dashboard ever mounting (e.g. a stale resume redirect sent the
        // true first login straight into the quiz builder). An account with no
        // tour state and no content yet is un-onboarded — start the tour.
        try {
          const [foldersRes, quizzesRes] = await Promise.all([
            api.get("/classes"),
            api.get("/quizzes"),
          ]);
          const hasContent = (foldersRes.data || []).length > 0 || (quizzesRes.data || []).length > 0;
          if (!hasContent) {
            setTutorialState(writeTutorialState(data.id, { mainStarted: true, mainStage: "home_welcome" }));
          } else {
            setTutorialState(saved);
          }
        } catch {
          setTutorialState(saved);
        }
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

  // A burned one-shot used to need console surgery (localStorage key +
  // session flag) to recover. Replaying restarts only the main tour from the
  // welcome dialog; per-template / host-panel / analytics seen-flags are left
  // alone so those don't nag again.
  function replayMainTutorial() {
    if (!tutorialUserId) return;
    const next = writeTutorialState(tutorialUserId, {
      mainStarted: true,
      mainComplete: false,
      mainStage: "home_welcome",
    });
    setTutorialState(next);
    setActiveTab("home");
    setProfileOpen(false);
  }

  function doLogout() {
    clearToken();
    clearRole();
    setAuthToken("");
    clearLastRoute();
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
  const mobilePrimaryNav = navItems.slice(0, 4);
  const mobileSecondaryNav = navItems.slice(4);

  function handleNavSelect(id) {
    setActiveTab(id);
    if (tutorial.stage === "nav_classes" && id === "classes") setTutorialStage("classes_intro_delay");
    if (tutorial.stage === "nav_create" && id === "create") setTutorialStage("create_intro_delay");
    if (tutorial.stage === "nav_sessions" && id === "live") setTutorialStage("sessions_intro");
  }

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
      <MobileTopHeader
        c={c}
        name={`${profile.firstName} ${profile.lastName}`.trim() || "Teacher"}
        email={profile.email}
        avatarSrc={profile.profileImage}
        dark={dark}
        toggleTheme={toggleTheme}
        onSettings={() => setProfileOpen(true)}
        onLogout={() => setShowLogout(true)}
      />
      <aside data-sidebar="true" className="tw-responsive-sidebar" style={sidebar(c)}>
        <div style={{ padding: "26px 18px 22px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${c.sidebarBorder}`, marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline" }}><span style={{ fontSize: 20, fontWeight: 900, color: "#e7e9ee" }}>Think</span><span style={{ fontSize: 20, fontWeight: 900, color: "#2b6cff" }}>WAVE</span></div>
          <button onClick={() => setProfileOpen(true)} title="Profile settings" style={avatarButton(c)}>
            {profile.profileImage ? <img src={profile.profileImage} alt="Teacher profile" style={avatarImage} /> : <TwIcon name="user" size={20} />}
          </button>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 4, padding: "0 12px", flex: 1 }}>
          {navItems.map((item) => (
            <button key={item.id} data-tutorial={`nav-${item.id}`} className="tw-side-nav-btn" style={navButton(c, activeTab === item.id)} onClick={() => handleNavSelect(item.id)}>
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

      <MobileTabBar c={c} items={mobilePrimaryNav} secondaryItems={mobileSecondaryNav} activeId={activeTab} onSelect={handleNavSelect} iconsOnly />

      {tutorial.stage === "home_welcome" && <ThinkBotTutorial className="tw-tutorial-plain-secondary" actionLabel="Okay!" actionDelay={2000} onAction={() => setTutorialStage("home_build")} secondaryLabel="Skip" onSecondary={skipMainTutorial}><div><p><strong>Welcome to ThinkWAVE!</strong></p><p>I’m ThinkBot. I’ll help you set up your workspace and get your first activity ready for your students.</p></div></ThinkBotTutorial>}
      {tutorial.stage === "home_build" && <ThinkBotTutorial className="tw-tutorial-home-build" clickAnywhere onClickAnywhere={() => setTutorialStage("nav_classes")}><p>We’ll build things as we go, so you won’t have to memorize everything at once.</p></ThinkBotTutorial>}
      {tutorial.stage === "nav_classes" && (isMobileViewport ? (
        <ThinkBotTutorial target='[data-tutorial="mobile-nav-classes"]' placement="above" square className="tw-tutorial-mobile-nav-prompt" highlight highlightMode="target"><p>Next, let’s go to <strong>Class</strong>.</p></ThinkBotTutorial>
      ) : (
        <ThinkBotTutorial target='[data-tutorial="nav-classes"]' placement="right" dialogWidth={270} className="tw-tutorial-nav-lower tw-tutorial-nav-flow" highlight highlightMode="target"><p>Next, let’s go to <strong>Class</strong>.</p></ThinkBotTutorial>
      ))}
      {tutorial.stage === "nav_create" && (isMobileViewport ? (
        <ThinkBotTutorial target='[data-tutorial="mobile-nav-create"]' placement="above" square className="tw-tutorial-mobile-nav-prompt" highlight highlightMode="target"><p>Next, let’s go to <strong>Create</strong>.</p></ThinkBotTutorial>
      ) : (
        <ThinkBotTutorial target='[data-tutorial="nav-create"]' placement="right" dialogWidth={270} className="tw-tutorial-nav-lower tw-tutorial-nav-flow" highlight highlightMode="target"><p>Next, let’s go to <strong>Create</strong>.</p></ThinkBotTutorial>
      ))}
      {tutorial.stage === "nav_sessions" && (isMobileViewport ? (
        <ThinkBotTutorial target='[data-tutorial="mobile-nav-live"]' placement="above" square className="tw-tutorial-mobile-nav-prompt" highlight highlightMode="target"><p>Next, let’s go to <strong>Sessions</strong>.</p></ThinkBotTutorial>
      ) : (
        <ThinkBotTutorial target='[data-tutorial="nav-live"]' placement="right" dialogWidth={285} className="tw-tutorial-nav-flow" highlight highlightMode="target"><p>Next, let’s go to <strong>Sessions</strong>.</p></ThinkBotTutorial>
      ))}

      {profileOpen && <TeacherProfileModal c={c} profile={profile} setProfile={setProfile} error={profileError} onSubmit={saveProfile} onReplayTutorial={replayMainTutorial} onClose={() => { setProfileOpen(false); setProfileError(""); }} onUpload={() => profileFileRef.current?.click()} />}
      <input ref={profileFileRef} type="file" accept="image/*" hidden onChange={(event) => { handleProfileImage(event.target.files?.[0]); event.target.value = ""; }} />
      {profileSaved && <ProfileSavedOverlay />}
      {showLogout && <TeacherActionModal c={c} icon="logout" title="Logout" message="Are you sure you want to log out of the teacher dashboard?" tone="red" confirmLabel="Yes, Logout" hideCancel onClose={() => setShowLogout(false)} onConfirm={doLogout} />}
    </div>
  );
}

function TeacherProfileModal({ c, profile, setProfile, error, onSubmit, onClose, onUpload, onReplayTutorial }) {
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
    <div style={{ display: "flex", justifyContent: "flex-start", marginTop: 14 }}><button type="button" onClick={onReplayTutorial} style={{ ...sideAction(c), width: "auto" }}><TwIcon name="spark" size={16} /><span>Replay onboarding tour</span></button></div>
    {error && <div style={{ marginTop: 14, padding: 12, borderRadius: 12, color: c.redFg, background: c.redBg, border: `1px solid ${c.redBorder}`, fontWeight: 850 }}>{error}</div>}
    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}><button style={primary(c)}>Save</button></div>
  </form></div>;
}

function ProfileSavedOverlay() { return <div className="tw-profile-success-backdrop"><div className="tw-profile-success-box"><TwIcon name="check" size={58} strokeWidth={3.4} /></div></div>; }
function Field({ label, c, children }) { return <label style={{ display: "grid", gap: 7, color: c.textMuted, fontSize: 12, fontWeight: 850 }}>{label}{children}</label>; }
function profileFromUser(user = {}) { return { firstName: user.first_name || "", lastName: user.last_name || "", contactNumber: user.contact_number || "", email: user.email || "", institutionName: user.institution_name || "", profileImage: user.profile_image || "" }; }

const avatarImage = { width: "100%", height: "100%", objectFit: "cover" };
const modalBackdrop = { position: "fixed", inset: 0, zIndex: 3000, display: "grid", placeItems: "center", padding: 20, background: "rgba(3,7,18,.62)", backdropFilter: "blur(10px)" };
function sideAction(c) { return { display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 14px", borderRadius: 10, border: `1px solid ${c.sidebarBorder}`, background: "transparent", color: c.navColor, fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "color .2s,border-color .2s" }; }
function avatarButton(c) { return { width: 38, height: 38, padding: 0, overflow: "hidden", display: "grid", placeItems: "center", borderRadius: "50%", border: 0, background: "rgba(255,255,255,.08)", color: c.navColor, cursor: "pointer" }; }
function modalCard(c) { return { background: c.cardBg, color: c.text, border: `1px solid ${c.border}`, borderRadius: 20, padding: 20, boxShadow: "0 28px 80px rgba(0,0,0,.28)" }; }
function iconButton(c) { return { width: 38, height: 38, display: "grid", placeItems: "center", borderRadius: 11, border: `1px solid ${c.border}`, background: c.cardBg2, color: c.text, cursor: "pointer" }; }
function input(c) { return { width: "100%", boxSizing: "border-box", padding: "12px 13px", borderRadius: 11, border: `1px solid ${c.inputBorder || c.border}`, background: c.inputBg || c.cardBg2, color: c.text, fontFamily: "inherit" }; }
function primary() { return { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "10px 14px", borderRadius: 11, border: 0, background: "#2b6cff", color: "#fff", fontFamily: "inherit", fontWeight: 950, cursor: "pointer" }; }
