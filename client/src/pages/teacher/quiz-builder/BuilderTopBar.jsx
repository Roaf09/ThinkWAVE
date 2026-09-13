import { TwIcon } from "../../../components/TwUI";
import { TeacherPressButton } from "../TeacherUI";

export function BuilderTopBar({
  isMobile,
  ui,
  quiz,
  titleDraft,
  setTitleDraft,
  titleEditing,
  setTitleEditing,
  titleSaving,
  saveTitle,
  truncatedQuizTitle,
  fullQuizTitle,
  guestMode,
  navigate,
  settingsOpen,
  setSettingsOpen,
  openSettings,
  overflowOpen,
  openOverflow,
  setOverflowOpen,
  builderTutorialStage,
  setBuilderTutorialStage,
  setOverflowTitleEditing,
  setQMenuOpen,
  questionStripOpen,
  closeQuestionStrip,
  builderSettingsRows,
  isBatchTemplate,
  setModal,
  setBankOpen,
  addQuestion,
  requestSave,
  publish,
  isSaved,
  isSaving,
  publishLatched,
  publishDisabled,
}) {
  return (
    <div style={isMobile ? { ...ui.topBar, flexWrap: "nowrap", gap: 8, padding: "10px 14px" } : ui.topBar} className={isMobile ? "tw-builder-mobile-topbar is-single-row" : undefined}>
      {isMobile ? (
      <>
        <div className="flex items-center gap-2 flex-1 min-w-0 flex-nowrap">
          <button type="button" className="tw-builder-settings-flat tw-builder-bare-icon" title="Back to dashboard" aria-label="Back to dashboard" onClick={() => navigate(guestMode ? "/guest" : "/teacher", { state: { tab: "live" } })}><TwIcon name="home" size={26} /></button>
          <div className="min-w-0 flex-1">
            <span className="tw-builder-title-button tw-builder-mobile-title" title={fullQuizTitle} style={{ color: "#fff" }}>
              {truncatedQuizTitle}
            </span>
          </div>
        </div>
        <div className="flex gap-0 items-center shrink-0 flex-nowrap">
          <button className={`tw-builder-settings-flat tw-builder-bare-icon${settingsOpen ? " is-active" : ""}`} title="Quiz settings" aria-label="Quiz settings" onClick={() => { if (settingsOpen) setSettingsOpen(false); else openSettings(); }}><TwIcon name="gear" size={26} /></button>
          <button type="button" data-tutorial="builder-overflow-toggle" className={`tw-builder-settings-flat tw-builder-bare-icon${overflowOpen ? " is-active" : ""}`} title="More actions" aria-label="More actions" disabled={overflowOpen && (builderTutorialStage === "save_menu" || builderTutorialStage === "publish_menu")} onClick={() => { if (builderTutorialStage === "save") setBuilderTutorialStage?.("save_menu"); else if (builderTutorialStage === "publish") setBuilderTutorialStage?.("publish_menu"); if (overflowOpen) setOverflowOpen(false); else openOverflow(); }}><span className="tw-builder-ellipsis" aria-hidden="true">⋯</span></button>
        </div>
      </>
      ) : (
      <>
      <div className="flex items-center gap-3 flex-wrap min-w-[280px] flex-1">
        <button type="button" className="tw-builder-settings-flat tw-builder-bare-icon" title="Back to dashboard" aria-label="Back to dashboard" onClick={() => navigate(guestMode ? "/guest" : "/teacher", { state: { tab: "live" } })}><TwIcon name="home" size={28} /></button>
        <div className="min-w-[220px] flex-[0_1_540px]">
          {titleEditing ? (
            <input
              autoFocus
              value={titleDraft}
              maxLength={255}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") {
                  setTitleDraft(quiz.title || "");
                  setTitleEditing(false);
                }
              }}
              className="tw-builder-title-input"
              style={{ ...ui.titleInput, color: "#fff", borderBottomColor: "#fff" }}
              placeholder="Quiz title"
              aria-label="Quiz title"
              disabled={titleSaving}
            />
          ) : (
            <button type="button" className="tw-builder-title-button" onClick={() => setTitleEditing(true)} title={fullQuizTitle} style={{ color: "#fff" }}>
              {truncatedQuizTitle}
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-1 items-center flex-wrap justify-end">
        <div className="tw-builder-settings-anchor">
          <button className={`tw-builder-settings-flat tw-builder-bare-icon no-hover-bg${settingsOpen ? " is-active" : ""}`} title="Quiz settings" aria-label="Quiz settings" onClick={() => { const opening = !settingsOpen; if (opening && questionStripOpen) closeQuestionStrip(); setOverflowOpen(false); setOverflowTitleEditing(false); setQMenuOpen(false); setSettingsOpen(opening); }}><TwIcon name="gear" size={28} /></button>
          {settingsOpen && (
            <>
              <div className="tw-builder-settings-catcher" onClick={() => setSettingsOpen(false)} />
              <div className="tw-builder-settings-popup" role="dialog" aria-label="Quiz settings">
                {builderSettingsRows.map((row) => (
                  <button key={row.key} type="button" className="tw-builder-settings-row" onClick={row.onToggle}>
                    <span className="tw-builder-settings-row-label">{row.label}</span>
                    <span className="tw-builder-settings-toggle-track" style={ui.switchTrack(row.active)}><span style={ui.switchThumb(row.active)} /></span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <button type="button" className="tw-builder-flat-btn is-bare is-icon-only tone-red no-hover-bg" data-tutorial="builder-delete-quiz" title="Delete quiz" aria-label="Delete quiz" onClick={() => setModal("confirmDelete")}><TwIcon name="trash" size={26} /></button>
        {!guestMode && <button type="button" className="tw-builder-flat-btn is-bare is-icon-only no-hover-bg" data-tutorial="builder-add-bank" title="Add from Bank" aria-label="Add from Bank" onClick={() => setBankOpen(true)}><TwIcon name="bank" size={26} /></button>}
        <button type="button" className="tw-builder-flat-btn is-bare is-icon-only no-hover-bg" data-tutorial="builder-add-question" title={isBatchTemplate ? "Add Batch" : "Add Question"} aria-label={isBatchTemplate ? "Add Batch" : "Add Question"} onClick={addQuestion}><TwIcon name="plus" size={26} /></button>
        <TeacherPressButton tone="blue" icon="check" data-tutorial="builder-save" className={`tw-builder-toolbar-action tw-builder-template-action${isSaved ? " is-latched" : ""}`} style={{ "--builder-action-icon": "#fff" }} onClick={requestSave} disabled={isSaved || isSaving}>{isSaving ? "Saving…" : isSaved ? "Saved" : "Save"}</TeacherPressButton>
        <TeacherPressButton tone="blue" icon="spark" data-tutorial="builder-publish" className={`tw-builder-toolbar-action tw-builder-template-action${publishLatched ? " is-latched" : ""}`} style={{ "--builder-action-icon": "#fff" }} onClick={publish} disabled={publishDisabled}>{publishLatched ? "Published" : "Publish"}</TeacherPressButton>
      </div>
      </>
      )}
    </div>
  );
}
