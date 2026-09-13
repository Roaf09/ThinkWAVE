/* FILE GUIDE:
 * client/src/pages/teacher/QuizBuilder.jsx
 * Purpose: Teacher quiz builder orchestration for all templates.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { LIGHT } from "../../context/ThemeContext";
import { getUi } from "./quiz-builder/QuizBuilderParts";
import { useBuilderTitleLimit, useIsMobileViewport } from "./quiz-builder/useBuilderViewport";
import { useBuilderHistory } from "./quiz-builder/useBuilderHistory";
import { useQuestionStrip } from "./quiz-builder/useQuestionStrip";
import { useBuilderTutorial } from "./quiz-builder/useBuilderTutorial";
import { useBuilderQuestions } from "./quiz-builder/useBuilderQuestions";
import { useBuilderPersistence } from "./quiz-builder/useBuilderPersistence";
import { BuilderWorkspace } from "./quiz-builder/BuilderWorkspace";
import { BuilderHeader } from "./quiz-builder/BuilderHeader";
import { BuilderTutorials } from "./quiz-builder/BuilderTutorials";
import { BuilderModals } from "./quiz-builder/BuilderModals";
import { getBuilderDisplay } from "./quiz-builder/builderDisplay";

export default function QuizBuilder({ guestMode = false }) {
  const { id } = useParams();
  const navigate = useNavigate();
  // Quiz Builder always renders in light mode, regardless of the app-wide
  // theme toggle (its own light/dark button has been removed).
  const dark = false;
  const c = LIGHT;
  const isMobile = useIsMobileViewport();
  const builderTitleLimit = useBuilderTitleLimit();
  const [quiz, setQuiz] = useState(null);
  const ui = useMemo(() => getUi(c, dark, quiz?.template_type), [c, dark, quiz?.template_type]);

  // While Quiz Builder is mounted, make sure body.dark-mode-scoped CSS
  // doesn't leak dark styling into it, even if the rest of the app is set
  // to dark. Restored on unmount.
  useEffect(() => {
    const hadDark = document.body.classList.contains("dark-mode");
    document.body.classList.remove("dark-mode");
    document.body.classList.add("light-mode");
    return () => {
      document.body.classList.toggle("dark-mode", hadDark);
      document.body.classList.toggle("light-mode", !hadDark);
    };
  }, []);
  const [questions, setQuestions] = useState([]);
  const [qIndex, setQIndex] = useState(0);
  const [settings, setSettings] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modal, setModal] = useState(null);
  const [bankOpen, setBankOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [dupeList, setDupeList] = useState([]);
  const [invalidList, setInvalidList] = useState([]);
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const editVersionRef = useRef(0);
  const savePromiseRef = useRef(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleSaving, setTitleSaving] = useState(false);
  const [navDir, setNavDir] = useState("next");
  const [navTick, setNavTick] = useState(0);
  const [publishFlow, setPublishFlow] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [bankSavedOrders, setBankSavedOrders] = useState(() => new Set());
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [overflowTitleEditing, setOverflowTitleEditing] = useState(false);
  const [qMenuOpen, setQMenuOpen] = useState(false);
  const touchStartXRef = useRef(null);
  const touchStartYRef = useRef(null);

  function markUnsaved(updater) {
    editVersionRef.current += 1;
    setQuestions((qs) => (typeof updater === "function" ? updater(qs) : updater));
    setIsSaved(false);
  }

  function inheritedGlobalConfig(sourceQuestions = questions) {
    const first = sourceQuestions?.[0]?.config || {};
    return {
      showPromptImage: !!first.showPromptImage,
      voiceRecord: !!first.voiceRecord,
      textToSpeech: !!first.textToSpeech,
    };
  }

  function applyConfigToAllQuestions(patch) {
    markUnsaved((qs) => qs.map((question) => ({
      ...question,
      config: {
        ...(question.config || {}),
        ...patch,
        voicePrompt: question.config?.voicePrompt || "",
        voiceAnswers: Array.isArray(question.config?.voiceAnswers) ? question.config.voiceAnswers : [],
      },
    })));
  }

  const {
    tutorialUserId,
    setTutorialUserId,
    builderTutorialStage,
    setBuilderTutorialStage,
    followupTemplateTutorial,
    modifiedTutorialOpen,
    setModifiedTutorialOpen,
    mcqTipVisible,
    finishFollowupTemplateTutorial,
    skipFollowupTemplateTutorial,
    startFollowupTemplateTutorial,
  } = useBuilderTutorial({ guestMode, quiz, questions, qIndex, isSaved });

  const {
    addQuestion,
    deleteCurrentQuestion,
    performDeleteCurrentQuestion,
    updateQ,
    duplicateCurrentQuestion,
    moveQuestion,
    toggleLock,
    goPrev,
    goNext,
    lockSaveRequestRef,
  } = useBuilderQuestions({
    quiz,
    setQuiz,
    questions,
    qIndex,
    setQIndex,
    markUnsaved,
    builderTutorialStage,
    setBuilderTutorialStage,
    setModal,
    setNavDir,
    setNavTick,
    editVersionRef,
    setQuestions,
    setIsSaved,
    inheritedGlobalConfig,
  });

  const {
    load,
    saveSettings,
    saveTitle,
    _doSave,
    requestSave,
    save,
    publish,
    confirmPublish,
    deleteQuiz,
    doSaveToBank,
    addFromBank,
  } = useBuilderPersistence({
    id,
    guestMode,
    navigate,
    quiz,
    setQuiz,
    questions,
    qIndex,
    settings,
    setSettings,
    setModal,
    setMsg,
    setDupeList,
    setInvalidList,
    isSaved,
    setIsSaved,
    setIsSaving,
    tutorialUserId,
    setTutorialUserId,
    builderTutorialStage,
    setBuilderTutorialStage,
    setPublishFlow,
    titleDraft,
    setTitleDraft,
    setTitleEditing,
    setTitleSaving,
    markUnsaved,
    inheritedGlobalConfig,
    setQuestions,
    setQIndex,
    setNavDir,
    setNavTick,
    setBankOpen,
    setBankSavedOrders,
    setLoadError,
    editVersionRef,
    savePromiseRef,
  });

  const {
    questionStripOpen,
    questionStripClosing,
    stripDrag,
    setStripDrag,
    stripSettleIndex,
    stripTouchRef,
    closeQuestionStrip,
    toggleQuestionStrip,
    moveQuestionFromStrip,
  } = useQuestionStrip({
    questions,
    qIndex,
    setQIndex,
    markUnsaved,
    onOpen: () => {
      setSettingsOpen(false);
      setOverflowOpen(false);
      setOverflowTitleEditing(false);
      setQMenuOpen(false);
    },
  });

  // Mobile pager modal must not move the background: lock background scroll
  // while the strip is open so touch reordering only affects the strip list.
  useEffect(() => {
    if (!questionStripOpen || !isMobile) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [questionStripOpen, isMobile]);
    useEffect(() => { setQMenuOpen(false); }, [qIndex]);
    // Header ⋯ sheet mirrors the question ⋯ menu for the tutorial: closing it
    // abandons the save/publish row step, and opening it advances there.
    useEffect(() => {
      if (!overflowOpen && builderTutorialStage === "save_menu") setBuilderTutorialStage("save");
      else if (overflowOpen && builderTutorialStage === "save") setBuilderTutorialStage("save_menu");
      else if (!overflowOpen && builderTutorialStage === "publish_menu") setBuilderTutorialStage("publish");
      else if (overflowOpen && builderTutorialStage === "publish") setBuilderTutorialStage("publish_menu");
    }, [overflowOpen, builderTutorialStage, setBuilderTutorialStage]);
    // Closing the ⋯ menu abandons the save-to-bank step, so fall back to
    // highlighting the toggle again instead of pointing at a closed menu.
    // (And if the menu is already open when the step arrives, advance
    // straight to the row — otherwise the dialog renders nothing.)
    useEffect(() => {
      if (!qMenuOpen && builderTutorialStage === "bank_menu") setBuilderTutorialStage("bank");
      else if (qMenuOpen && builderTutorialStage === "bank") setBuilderTutorialStage("bank_menu");
    }, [qMenuOpen, builderTutorialStage, setBuilderTutorialStage]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (lockSaveRequestRef.current) {
      lockSaveRequestRef.current = false;
      _doSave({ showModal: false });
    }
  }, [questions]);

  const { undo, redo, canUndo, canRedo } = useBuilderHistory({ questions, setQuestions, setQIndex, setIsSaved, editVersionRef });

  if (loadError) {
    return <div className="container" style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <div className="card" style={{ maxWidth: 520, textAlign: "center", display: "grid", gap: 14 }}>
        <b>Quiz Builder could not open</b>
        <span>{loadError}</span>
        <button className="btn" onClick={load}>Try Again</button>
        <button className="btn secondary" onClick={() => navigate(guestMode ? "/guest" : "/teacher", { state: { tab: "create" } })}>Back to Create</button>
      </div>
    </div>;
  }

  if (!quiz || !settings) {
    return <div className="container"><div className="card">Loading Quiz Builder…</div></div>;
  }

  const {
    currentQ,
    totalQ,
    isFirst,
    isLast,
    publishLatched,
    publishDisabled,
    isBatchTemplate,
    tutorialHighlightColor,
    builderTemplateAccent,
    builderTemplateDragClass,
    builderActionFace,
    builderActionBase,
    builderActionBorder,
    builderDialogActionStyle,
    builderQuestionSolid,
    truncatedQuizTitle,
    fullQuizTitle,
    builderSettingsRows,
    openSettings,
    openOverflow,
  } = getBuilderDisplay({
    quiz,
    questions,
    qIndex,
    settings,
    isSaving,
    isSaved,
    isMobile,
    builderTitleLimit,
    dark,
    guestMode,
    saveSettings,
    applyConfigToAllQuestions,
    updateQ,
    questionStripOpen,
    closeQuestionStrip,
    setSettingsOpen,
    setOverflowOpen,
    setOverflowTitleEditing,
    setQMenuOpen,
    setTitleDraft,
  });

  return (
    <>
      <style>{`
        @keyframes twSlideLeftIn {
          from { opacity: 0; transform: translateX(32px) scale(0.985); }
          to { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes twSlideRightIn {
          from { opacity: 0; transform: translateX(-32px) scale(0.985); }
          to { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes twGridFill { from { opacity: .45; transform: scale(.985); } to { opacity: 1; transform: scale(1); } }
        @keyframes twTilePop { from { opacity: 0; transform: scale(.72) rotate(-4deg); } to { opacity: 1; transform: scale(1) rotate(0); } }
      `}</style>

      {!guestMode && bankOpen && <div style={ui.blurOverlay} />}

      <div className={`tw-quiz-builder-page${isMobile ? " is-mobile" : ""}`} style={{ ...ui.page, "--tw-template-tutorial-highlight": tutorialHighlightColor, "--tw-template-accent": builderTemplateAccent, "--tw-builder-action-face": builderActionFace, "--tw-builder-action-base": builderActionBase, "--tw-builder-action-border": builderActionBorder, "--tw-builder-question-solid": builderQuestionSolid }}>
        <BuilderHeader
          isMobile={isMobile}
          ui={ui}
          quiz={quiz}
          titleDraft={titleDraft}
          setTitleDraft={setTitleDraft}
          titleEditing={titleEditing}
          setTitleEditing={setTitleEditing}
          titleSaving={titleSaving}
          saveTitle={saveTitle}
          truncatedQuizTitle={truncatedQuizTitle}
          fullQuizTitle={fullQuizTitle}
          guestMode={guestMode}
          navigate={navigate}
          settingsOpen={settingsOpen}
          setSettingsOpen={setSettingsOpen}
          openSettings={openSettings}
          overflowOpen={overflowOpen}
          openOverflow={openOverflow}
          setOverflowOpen={setOverflowOpen}
          builderTutorialStage={builderTutorialStage}
          setBuilderTutorialStage={setBuilderTutorialStage}
          setOverflowTitleEditing={setOverflowTitleEditing}
          setQMenuOpen={setQMenuOpen}
          questionStripOpen={questionStripOpen}
          closeQuestionStrip={closeQuestionStrip}
          builderSettingsRows={builderSettingsRows}
          isBatchTemplate={isBatchTemplate}
          setModal={setModal}
          setBankOpen={setBankOpen}
          addQuestion={addQuestion}
          requestSave={requestSave}
          publish={publish}
          isSaved={isSaved}
          isSaving={isSaving}
          publishLatched={publishLatched}
          publishDisabled={publishDisabled}
          overflowTitleEditing={overflowTitleEditing}
          toggleQuestionStrip={toggleQuestionStrip}
          qIndex={qIndex}
          navTick={navTick}
          totalQ={totalQ}
          navDir={navDir}
          goPrev={goPrev}
          goNext={goNext}
          isFirst={isFirst}
          isLast={isLast}
          builderActionBorder={builderActionBorder}
          builderActionFace={builderActionFace}
          builderTemplateAccent={builderTemplateAccent}
        />

        <BuilderWorkspace
          isMobile={isMobile}
          ui={ui}
          c={c}
          quiz={quiz}
          questions={questions}
          currentQ={currentQ}
          qIndex={qIndex}
          setQIndex={setQIndex}
          navTick={navTick}
          setNavTick={setNavTick}
          navDir={navDir}
          setNavDir={setNavDir}
          builderTemplateDragClass={builderTemplateDragClass}
          questionStripOpen={questionStripOpen}
          questionStripClosing={questionStripClosing}
          stripDrag={stripDrag}
          setStripDrag={setStripDrag}
          stripSettleIndex={stripSettleIndex}
          stripTouchRef={stripTouchRef}
          closeQuestionStrip={closeQuestionStrip}
          moveQuestionFromStrip={moveQuestionFromStrip}
          isBatchTemplate={isBatchTemplate}
          isFirst={isFirst}
          isLast={isLast}
          moveQuestion={moveQuestion}
          addQuestion={addQuestion}
          deleteCurrentQuestion={deleteCurrentQuestion}
          updateQ={updateQ}
          qMenuOpen={qMenuOpen}
          setQMenuOpen={setQMenuOpen}
          toggleLock={toggleLock}
          redo={redo}
          canRedo={canRedo}
          undo={undo}
          canUndo={canUndo}
          duplicateCurrentQuestion={duplicateCurrentQuestion}
          guestMode={guestMode}
          bankSavedOrders={bankSavedOrders}
          builderTutorialStage={builderTutorialStage}
          setBuilderTutorialStage={setBuilderTutorialStage}
          setModal={setModal}
          touchStartXRef={touchStartXRef}
          touchStartYRef={touchStartYRef}
          goPrev={goPrev}
          goNext={goNext}
        />
      </div>

      <BuilderTutorials
        guestMode={guestMode}
        modifiedTutorialOpen={modifiedTutorialOpen}
        setModifiedTutorialOpen={setModifiedTutorialOpen}
        builderTutorialStage={builderTutorialStage}
        setBuilderTutorialStage={setBuilderTutorialStage}
        quiz={quiz}
        questions={questions}
        qIndex={qIndex}
        followupTemplateTutorial={followupTemplateTutorial}
        finishFollowupTemplateTutorial={finishFollowupTemplateTutorial}
        skipFollowupTemplateTutorial={skipFollowupTemplateTutorial}
        startFollowupTemplateTutorial={startFollowupTemplateTutorial}
        mcqTipVisible={mcqTipVisible}
        isBatchTemplate={isBatchTemplate}
        modal={modal}
        isMobile={isMobile}
        qMenuOpen={qMenuOpen}
        overflowOpen={overflowOpen}
      />

      <BuilderModals
        modal={modal}
        setModal={setModal}
        quiz={quiz}
        questions={questions}
        qIndex={qIndex}
        currentQ={currentQ}
        dupeList={dupeList}
        invalidList={invalidList}
        msg={msg}
        setMsg={setMsg}
        isBatchTemplate={isBatchTemplate}
        builderTutorialStage={builderTutorialStage}
        setBuilderTutorialStage={setBuilderTutorialStage}
        publishFlow={publishFlow}
        ui={ui}
        c={c}
        builderDialogActionStyle={builderDialogActionStyle}
        guestMode={guestMode}
        bankOpen={bankOpen}
        setBankOpen={setBankOpen}
        addFromBank={addFromBank}
        deleteQuiz={deleteQuiz}
        performDeleteCurrentQuestion={performDeleteCurrentQuestion}
        save={save}
        confirmPublish={confirmPublish}
        doSaveToBank={doSaveToBank}
        _doSave={_doSave}
      />
    </>
  );
}
