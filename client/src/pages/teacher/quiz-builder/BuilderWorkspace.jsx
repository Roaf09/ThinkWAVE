import { BuilderToolbar } from "./BuilderToolbar";
import { QuestionEditor } from "./QuestionEditor";
import { QuestionStrip, BuilderMobileDots } from "./QuestionStrip";
import { validateQuestion } from "./quizBuilderUtils";

export function BuilderWorkspace({
  isMobile,
  ui,
  c,
  quiz,
  questions,
  currentQ,
  qIndex,
  setQIndex,
  navTick,
  setNavTick,
  navDir,
  setNavDir,
  builderTemplateDragClass,
  questionStripOpen,
  questionStripClosing,
  stripDrag,
  setStripDrag,
  stripSettleIndex,
  stripTouchRef,
  closeQuestionStrip,
  moveQuestionFromStrip,
  isBatchTemplate,
  isFirst,
  isLast,
  moveQuestion,
  addQuestion,
  deleteCurrentQuestion,
  updateQ,
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
  setModal,
  touchStartXRef,
  touchStartYRef,
  goPrev,
  goNext,
}) {
  return (
    <div
      className={`tw-builder-content-region${questionStripOpen ? " has-question-strip" : ""}${isMobile ? " is-mobile" : ""}`}
      onTouchStart={isMobile ? (e) => { const t = e.touches?.[0]; if (t) { touchStartXRef.current = t.clientX; touchStartYRef.current = t.clientY; } } : undefined}
      onTouchEnd={isMobile ? (e) => {
        const startX = touchStartXRef.current;
        const startY = touchStartYRef.current;
        touchStartXRef.current = null;
        touchStartYRef.current = null;
        if (startX === null || startX === undefined) return;
        const t = e.changedTouches?.[0];
        if (!t) return;
        const dx = t.clientX - startX;
        const dy = t.clientY - (startY ?? t.clientY);
        if (Math.abs(dx) < 55 || Math.abs(dx) <= Math.abs(dy)) return;
        if (dx < 0) goNext();
        else goPrev();
      } : undefined}
    >
      <div className={`tw-builder-workspace${questionStripOpen ? " has-question-strip" : ""}${isMobile ? " is-mobile" : ""}`}>
        <div style={isMobile ? { ...ui.editorArea, maxWidth: "100%", padding: "16px 14px 90px" } : ui.editorArea} data-tutorial="builder-editor-shell" className={isMobile ? "tw-builder-mobile-shell" : undefined}>
          {currentQ && (
            <div key={`${qIndex}-${navTick}`} style={{ animation: `${navDir === "next" ? "twSlideLeftIn" : "twSlideRightIn"} 220ms cubic-bezier(0.22, 1, 0.36, 1)` }}>
              <div style={isMobile ? undefined : ui.questionCard} className={isMobile ? `tw-builder-mobile-question ${builderTemplateDragClass}` : `tw-builder-question-form ${builderTemplateDragClass}`}>
                <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", marginBottom: 16, gap: 10, flexWrap: "wrap" }}>
                  <BuilderToolbar
                    isMobile={isMobile}
                    ui={ui}
                    currentQ={currentQ}
                    qIndex={qIndex}
                    quiz={quiz}
                    isBatchTemplate={isBatchTemplate}
                    isFirst={isFirst}
                    isLast={isLast}
                    moveQuestion={moveQuestion}
                    addQuestion={addQuestion}
                    deleteCurrentQuestion={deleteCurrentQuestion}
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
                    validateQuestion={validateQuestion}
                    setModal={setModal}
                  />
                </div>

                <QuestionEditor ui={ui} c={c} quiz={quiz} currentQ={currentQ} updateQ={updateQ} isMobile={isMobile} />
              </div>
            </div>
          )}
        </div>
      </div>
      <QuestionStrip
        open={questionStripOpen}
        closing={questionStripClosing}
        questions={questions}
        qIndex={qIndex}
        setQIndex={setQIndex}
        setNavDir={setNavDir}
        setNavTick={setNavTick}
        templateType={quiz?.template_type}
        stripDrag={stripDrag}
        setStripDrag={setStripDrag}
        stripSettleIndex={stripSettleIndex}
        stripTouchRef={stripTouchRef}
        closeQuestionStrip={closeQuestionStrip}
        moveQuestionFromStrip={moveQuestionFromStrip}
      />
      {isMobile && (
        <BuilderMobileDots
          questions={questions}
          qIndex={qIndex}
          setQIndex={setQIndex}
          setNavDir={setNavDir}
          setNavTick={setNavTick}
          isBatchTemplate={isBatchTemplate}
        />
      )}
    </div>
  );
}
