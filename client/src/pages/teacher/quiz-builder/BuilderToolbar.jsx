import { TwIcon } from "../../../components/TwUI";

export function BuilderToolbar({
  isMobile,
  ui,
  currentQ,
  qIndex,
  quiz,
  isBatchTemplate,
  isFirst,
  isLast,
  moveQuestion,
  addQuestion,
  deleteCurrentQuestion,
  qMenuOpen,
  setQMenuOpen,
  toggleLock,
  redo,
  canRedo,
  undo,
  canUndo,
  duplicateCurrentQuestion,
  guestMode,
  bankSavedOrders,
  builderTutorialStage,
  setBuilderTutorialStage,
  validateQuestion,
  setModal,
}) {
  // Save stays clickable so the confirm window can tell the teacher exactly
  // what is still missing (a silently grey button never explains itself).
  const alreadySaved = bankSavedOrders.has(Number(currentQ?.order ?? qIndex));
  const bankIssues = validateQuestion(currentQ, quiz.template_type);
  const bankHint = alreadySaved ? "Saved to bank" : bankIssues.length ? `Complete this ${isBatchTemplate ? "batch" : "question"} first: ${bankIssues[0]}.` : "Save to bank";
  if (isMobile) {
    return (
      <div className="tw-builder-mobile-qactions">
        <button type="button" className="tw-builder-flat-icon-btn no-hover-bg" title="Move to previous position" aria-label="Move to previous position" onClick={() => { setQMenuOpen(false); moveQuestion(-1); }} disabled={isFirst}><TwIcon name="arrowLeft" size={20} /></button>
        <button type="button" className="tw-builder-flat-icon-btn no-hover-bg" title="Move to next position" aria-label="Move to next position" onClick={() => { setQMenuOpen(false); moveQuestion(1); }} disabled={isLast}><TwIcon name="arrowRight" size={20} /></button>
        <button type="button" data-tutorial="builder-add-question" className="tw-builder-flat-icon-btn no-hover-bg" title={builderTutorialStage && builderTutorialStage !== "add" ? "Finish the current tutorial step first" : (isBatchTemplate ? "Add Batch" : "Add Question")} aria-label={isBatchTemplate ? "Add Batch" : "Add Question"} onClick={() => { setQMenuOpen(false); addQuestion(); }} disabled={!!builderTutorialStage && builderTutorialStage !== "add"}><TwIcon name="plus" size={20} /></button>
        <button type="button" className="tw-builder-flat-icon-btn is-danger no-hover-bg" title={isBatchTemplate ? "Delete batch" : "Delete question"} aria-label={isBatchTemplate ? "Delete batch" : "Delete question"} onClick={() => { setQMenuOpen(false); deleteCurrentQuestion(); }}><TwIcon name="trash" size={20} /></button>
        <div className="tw-builder-qmenu-anchor">
          <button type="button" data-tutorial="builder-qmenu-toggle" className={`tw-builder-flat-icon-btn no-hover-bg${qMenuOpen ? " is-active" : ""}`} title="More question actions" aria-label="More question actions" onClick={() => { if (builderTutorialStage === "bank") setBuilderTutorialStage?.("bank_menu"); setQMenuOpen((v) => !v); }}><span className="tw-builder-ellipsis is-small" aria-hidden="true">⋯</span></button>
          {qMenuOpen && (
            <>
              <div className="tw-builder-qmenu-catcher" onClick={() => setQMenuOpen(false)} />
              <div className="tw-builder-qmenu-popup" role="menu" aria-label="More question actions">
                <button type="button" className="tw-builder-qmenu-row" disabled={builderTutorialStage === "bank_menu"} onClick={() => { setQMenuOpen(false); toggleLock(); }}><TwIcon name={currentQ?.config?.locked ? "lock" : "unlock"} size={17} /><span>{currentQ?.config?.locked ? "Unlock" : "Lock"}</span></button>
                <button type="button" className="tw-builder-qmenu-row" onClick={() => { setQMenuOpen(false); redo(); }} disabled={!canRedo || builderTutorialStage === "bank_menu"}><TwIcon name="redo" size={17} /><span>Redo</span></button>
                <button type="button" className="tw-builder-qmenu-row" onClick={() => { setQMenuOpen(false); undo(); }} disabled={!canUndo || builderTutorialStage === "bank_menu"}><TwIcon name="undo" size={17} /><span>Undo</span></button>
                <button type="button" className="tw-builder-qmenu-row" disabled={builderTutorialStage === "bank_menu"} onClick={() => { setQMenuOpen(false); duplicateCurrentQuestion(); }}><TwIcon name="duplicate" size={17} /><span>Duplicate</span></button>
                {!guestMode && <button type="button" data-tutorial="builder-save-bank" className="tw-builder-qmenu-row" title={bankHint} disabled={alreadySaved} onClick={() => { setQMenuOpen(false); setModal("confirmBank"); }}><TwIcon name="bank" size={17} /><span>{alreadySaved ? "Saved to bank" : "Save to bank"}</span></button>}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="tw-builder-toolbar-icons tw-builder-toolbar-template">
      <button type="button" className="tw-builder-flat-icon-btn tw-mini-template" title="Move to previous position" aria-label="Move to previous position" onClick={() => moveQuestion(-1)} disabled={isFirst} style={{ color: ui.templateAccent }}><TwIcon name="arrowLeft" size={18} /></button>
      <button type="button" className="tw-builder-flat-icon-btn tw-mini-template" title="Move to next position" aria-label="Move to next position" onClick={() => moveQuestion(1)} disabled={isLast} style={{ color: ui.templateAccent }}><TwIcon name="arrowRight" size={18} /></button>
      <button type="button" className="tw-builder-flat-icon-btn tw-mini-template" title="Undo" aria-label="Undo" onClick={undo} disabled={!canUndo} style={{ color: ui.templateAccent }}><TwIcon name="undo" size={18} /></button>
      <button type="button" className="tw-builder-flat-icon-btn tw-mini-template" title="Redo" aria-label="Redo" onClick={redo} disabled={!canRedo} style={{ color: ui.templateAccent }}><TwIcon name="redo" size={18} /></button>
      <button type="button" className="tw-builder-flat-icon-btn tw-mini-template" title="Duplicate question" aria-label="Duplicate question" onClick={duplicateCurrentQuestion} style={{ color: ui.templateAccent }}><TwIcon name="duplicate" size={18} /></button>
      <button type="button" className="tw-builder-flat-icon-btn tw-mini-template" title={currentQ?.config?.locked ? "Unlock question" : "Lock question"} aria-label={currentQ?.config?.locked ? "Unlock question" : "Lock question"} onClick={toggleLock} style={{ color: ui.templateAccent }}><TwIcon name={currentQ?.config?.locked ? "lock" : "unlock"} size={18} /></button>
      {!guestMode && <button type="button" data-tutorial="builder-save-bank" className="tw-builder-flat-icon-btn tw-mini-template" title={bankHint} aria-label="Save to bank" disabled={alreadySaved} onClick={() => setModal("confirmBank")} style={{ color: ui.templateAccent }}><TwIcon name="bank" size={18} /></button>}
      <button type="button" className="tw-builder-flat-icon-btn tw-mini-template" title={isBatchTemplate ? "Delete batch" : "Delete question"} aria-label={isBatchTemplate ? "Delete batch" : "Delete question"} onClick={deleteCurrentQuestion} style={{ color: ui.templateAccent }}><TwIcon name="trash" size={18} /></button>
    </div>
  );
}
