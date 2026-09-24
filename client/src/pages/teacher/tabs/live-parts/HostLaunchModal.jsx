import { useEffect, useState } from "react";
import { templateLabel, templateTone } from "../../../../lib/templatePalette";
import { TwIcon } from "../../../../components/TwUI";
import { TeacherPressButton } from "../../TeacherUI";
import ThinkBotTutorial from "../../../../components/ThinkBotTutorial";
import { normalizeBankTemplate as normalizeLiveTemplate, solidModalBg, useIsMobileViewport } from "../teacherTabShared";
import { BackgroundPicker } from "./HostBackgroundPicker";
import { ClassPicker } from "./ClassPicker";

const TEMPLATE_IMAGES = {
  MCQ: { landscape: "/media/templates/previews/mcq-landscape.webp", mobile: "/media/templates/previews/mcq-mobile.webp" },
  TRUE_FALSE: { landscape: "/media/templates/previews/tof-landscape.webp", mobile: "/media/templates/previews/tof-mobile.webp" },
  TYPE_ANSWER: { landscape: "/media/templates/previews/identification-landscape.webp", mobile: "/media/templates/previews/identification-mobile.webp" },
  MATCHING: { landscape: "/media/templates/previews/matching-landscape.webp", mobile: "/media/templates/previews/matching-mobile.webp" },
  GUESS_WORD_4PICS: { landscape: "/media/templates/previews/guess-word-landscape.webp", mobile: "/media/templates/previews/guess-word-mobile.webp" },
  THINK_SPELL: { landscape: "/media/templates/previews/think-spell-landscape.webp", mobile: "/media/templates/previews/think-spell-mobile.webp" },
};

// Extracted verbatim from LiveSessionsTab.jsx (no behavior change).
// normalizeLiveTemplate is now the shared normalizeBankTemplate (identical mapping).
export function HostLaunchModal({ quiz, folders, institutionPlan, guestMode = false, c, dark, onClose, onStart, tutorialStage, onTutorialStage, onTutorialFinish, launchError = "" }) {
  const [joinMode, setJoinMode] = useState("SOLO");
  const [classId, setClassId] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [backgroundKey, setBackgroundKey] = useState(null);
  const [zoomedPreview, setZoomedPreview] = useState(null);
  const isMobile = useIsMobileViewport();
  const template = normalizeLiveTemplate(quiz.template_type);
  const isCrossword = template === "THINK_SPELL";
  const groupLocked = !institutionPlan && !guestMode;
  const groupTitle = isCrossword
    ? "Group mode isn't available for Crossword quizzes."
    : groupLocked
      ? "Group mode is available on the Institution plan."
      : "Group — team play";
  const tone = templateTone(template, c, dark);
  const selected = folders.find((folder) => Number(folder.id) === Number(classId));

  // Mobile: hide the pill-shaped bottom tab bar while this setup modal is open + lock background scroll.
  useEffect(() => {
    document.body.classList.add("tw-mobile-modal-open");
    const prevOverflow = document.body.style.overflow;
    const prevOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    return () => {
      document.body.classList.remove("tw-mobile-modal-open");
      document.body.style.overflow = prevOverflow;
      document.body.style.overscrollBehavior = prevOverscroll;
    };
  }, []);

  return <div className="tw-host-launch-backdrop" onClick={() => { if (!tutorialStage) onClose?.(); }}>
    <section className="tw-host-launch-modal" onClick={(event) => event.stopPropagation()} style={{ background: dark ? "#102443" : solidModalBg(c), borderColor: c.border, color: c.text }}>
      {isMobile && <div className="tw-host-launch-toprow"><button type="button" aria-label="Close" onClick={() => { if (!tutorialStage) onClose?.(); }}><TwIcon name="close" size={20} /></button></div>}
      <div className="tw-host-preview-dual">
        <button type="button" className="tw-host-preview-desktop tw-host-preview-clickable" onClick={() => setZoomedPreview("desktop")}><img src={TEMPLATE_IMAGES[template]?.landscape} alt={`${templateLabel(template)} desktop gameplay preview`} /></button>
        <button type="button" className="tw-host-preview-mobile tw-host-preview-clickable" onClick={() => setZoomedPreview("mobile")}><img src={TEMPLATE_IMAGES[template]?.mobile} alt={`${templateLabel(template)} mobile gameplay preview`} /></button>
      </div>
      <div className="tw-host-launch-copy"><h2>{quiz.title}</h2><p style={{ color: c.textMuted }}>Bring friendly competition to ThinkWAVE. Learners climb the leaderboard by answering accurately and quickly, so every response can change the podium.</p></div>
      <div className="tw-host-mode-row tw-host-mode-simple">
        <TeacherPressButton type="button" tone="blue" className={`tw-host-mode-simple-btn${joinMode === "SOLO" ? " is-selected" : ""}`} disabled={joinMode === "SOLO"} title="Solo — individual play" aria-label="Solo — individual play" onClick={() => setJoinMode("SOLO")}><TwIcon name="user" size={22} /></TeacherPressButton>
        <TeacherPressButton type="button" tone="blue" className={`tw-host-mode-simple-btn${joinMode === "GROUP" ? " is-selected" : ""}`} disabled={joinMode === "GROUP" || groupLocked || isCrossword} title={groupTitle} aria-label={groupTitle} onClick={() => (!groupLocked && !isCrossword) && setJoinMode("GROUP")}><span className="tw-host-mode-trio" aria-hidden="true"><TwIcon name="user" size={18} /><TwIcon name="user" size={18} /><TwIcon name="user" size={18} /></span></TeacherPressButton>
      </div>
      {launchError && <div role="alert" className="tw-host-launch-error" style={{ background: c.redBg, color: c.redFg, border: `1px solid ${c.redBorder}`, borderRadius: 12, padding: "10px 14px", fontSize: 13, fontWeight: 800 }}>{launchError}</div>}
      <div className="tw-host-launch-controls" style={guestMode ? { gridTemplateColumns: "1fr auto" } : undefined}>
        {!guestMode && <button data-tutorial="host-class" type="button" className="tw-host-class-field" onClick={() => setPickerOpen(true)} style={{ background: c.inputBg, borderColor: c.inputBorder, color: selected ? c.text : c.textMuted, "--tw-template-accent": tone.accent, "--tw-template-soft": tone.softBg }}><TwIcon name="classes" size={20} /><span>{selected?.pathLabel || "Choose a class"}</span><TwIcon name="chevronDown" size={18} /></button>}
        <TeacherPressButton data-tutorial="host-start" tone="blue" disabled={!guestMode && !classId} onClick={() => { if (tutorialStage === "host_start") onTutorialFinish?.(); onStart(quiz, joinMode, guestMode ? null : classId, backgroundKey); }}>Start</TeacherPressButton>
      </div>
      <BackgroundPicker selectedKey={backgroundKey} onSelect={(key) => { setBackgroundKey(key); if (tutorialStage === "host_background") onTutorialStage?.("host_start"); }} c={c} category={quiz.category} />
    </section>
    {zoomedPreview && <div className="tw-host-preview-zoom-backdrop" onClick={(event) => { event.stopPropagation(); setZoomedPreview(null); }}>
      <div className={`tw-host-preview-zoom-card is-${zoomedPreview}`} onClick={(event) => event.stopPropagation()}>
        <img src={zoomedPreview === "mobile" ? TEMPLATE_IMAGES[template]?.mobile : TEMPLATE_IMAGES[template]?.landscape} alt={`${templateLabel(template)} ${zoomedPreview} gameplay preview enlarged`} />
      </div>
    </div>}
    {tutorialStage === "host_class" && !pickerOpen && <ThinkBotTutorial target='[data-tutorial="host-class"]' placement="left" square highlightMode="target"><p>First, choose the class that will join this session.</p></ThinkBotTutorial>}
    {tutorialStage === "host_background" && <ThinkBotTutorial target='[data-tutorial="session-backgrounds"]' placement={isMobile ? "above" : "left"} square><p>Browse through the available gameplay backgrounds and pick the one you want your students to see.</p></ThinkBotTutorial>}
    {tutorialStage === "host_start" && <ThinkBotTutorial target='[data-tutorial="host-start"]' placement="above" square className="tw-tutorial-host-ready-spaced tw-tutorial-bob-down" highlightMode="target"><p>When everything looks good, you’re ready to host.</p></ThinkBotTutorial>}
    {pickerOpen && <ClassPicker c={c} dark={dark} folders={folders} selectedId={classId} onClose={() => setPickerOpen(false)} onSelect={(id) => { setClassId(id); setPickerOpen(false); if (tutorialStage === "host_class") onTutorialStage?.("host_background"); }} />}
  </div>;
}
