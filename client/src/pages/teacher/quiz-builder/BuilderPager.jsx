
export function BuilderPager({
  isMobile,
  ui,
  questionStripOpen,
  toggleQuestionStrip,
  qIndex,
  navTick,
  totalQ,
  navDir,
  isBatchTemplate,
  goPrev,
  goNext,
  isFirst,
  isLast,
  builderActionBorder,
  builderActionFace,
  builderTemplateAccent,
}) {
  if (isMobile) {
    return (
      <div className={`tw-builder-mobile-pager${questionStripOpen ? " has-question-strip" : ""}`}>
        <button type="button" className="tw-builder-pill-badge" onClick={toggleQuestionStrip} aria-label="Open question list">
          <span key={`${qIndex}-${navTick}-${totalQ}`} className="tw-builder-pill-badge-text" style={{ animation: `${navDir === "next" ? "twSlideLeftIn" : "twSlideRightIn"} 220ms cubic-bezier(0.22, 1, 0.36, 1)` }}>{`${isBatchTemplate ? "Batch" : "Question"} ${qIndex + 1} of ${totalQ}`}</span>
        </button>
      </div>
    );
  }
  return (
    <div style={ui.pagerBar} className={`tw-builder-pager-bar${questionStripOpen ? " has-question-strip" : ""}`}>
      <button className="tw-builder-press tw-builder-template-nav" style={{ ...ui.pagerBtn, borderColor: builderActionBorder, background: builderActionFace, color: "#fff" }} onClick={goPrev} disabled={isFirst}>‹ Previous</button>
      <button key={`${qIndex}-${navTick}-${totalQ}`} type="button" className="tw-builder-pill-badge tw-builder-question-count tw-builder-question-count-animated tw-builder-desktop-pill" style={{ animation: `${navDir === "next" ? "twSlideLeftIn" : "twSlideRightIn"} 220ms cubic-bezier(0.22, 1, 0.36, 1)`, borderColor: `${builderTemplateAccent}55`, color: builderTemplateAccent }} onClick={toggleQuestionStrip} title="Open question list">{`${isBatchTemplate ? "Batch" : "Question"} ${qIndex + 1} of ${totalQ}`}</button>
      <button className="tw-builder-press tw-builder-template-nav" style={{ ...ui.pagerBtn, borderColor: builderActionBorder, background: builderActionFace, color: "#fff" }} onClick={goNext} disabled={isLast}>Next ›</button>
    </div>
  );
}
