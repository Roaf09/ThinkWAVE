import { TwIcon } from "../../../components/TwUI";

export function BuilderSettingsSheet({ builderSettingsRows, ui, setSettingsOpen }) {
  return (
    <div className="tw-builder-sheet-backdrop" onClick={() => setSettingsOpen(false)}>
      <div className="tw-builder-bottom-sheet" role="dialog" aria-label="Quiz settings" onClick={(e) => e.stopPropagation()}>
        <div className="tw-builder-sheet-handle" />
        {builderSettingsRows.map((row) => (
          <button key={row.key} type="button" className="tw-builder-settings-row" onClick={row.onToggle}>
            <span className="tw-builder-settings-row-label">{row.label}</span>
            <span className="tw-builder-settings-toggle-track" style={ui.switchTrack(row.active)}><span style={ui.switchThumb(row.active)} /></span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function BuilderOverflowSheet({
  quiz,
  titleDraft,
  setTitleDraft,
  overflowTitleEditing,
  setOverflowTitleEditing,
  titleSaving,
  saveTitle,
  truncatedQuizTitle,
  fullQuizTitle,
  guestMode,
  setBankOpen,
  setOverflowOpen,
  requestSave,
  publish,
  isSaved,
  isSaving,
  publishDisabled,
  publishLatched,
  builderTutorialStage,
  setModal,
}) {
  const tutorialLock = builderTutorialStage === "save_menu" || builderTutorialStage === "publish_menu";
  return (
    <div className="tw-builder-sheet-backdrop" onClick={() => { setOverflowOpen(false); setOverflowTitleEditing(false); }}>
      <div className="tw-builder-bottom-sheet" role="dialog" aria-label="More actions" onClick={(e) => e.stopPropagation()}>
        <div className="tw-builder-sheet-handle" />
        {overflowTitleEditing ? (
          <div className="tw-builder-overflow-title-edit">
            <input
              autoFocus
              value={titleDraft}
              maxLength={255}
              onChange={(e) => setTitleDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { saveTitle(); setOverflowTitleEditing(false); }
                if (e.key === "Escape") { setTitleDraft(quiz.title || ""); setOverflowTitleEditing(false); }
              }}
              className="tw-builder-overflow-title-input"
              placeholder="Quiz title"
              aria-label="Quiz title"
              disabled={titleSaving}
            />
            <div className="tw-builder-overflow-title-edit-actions">
              <button type="button" className="tw-builder-overflow-edit-btn is-cancel" onClick={() => { setTitleDraft(quiz.title || ""); setOverflowTitleEditing(false); }}>Cancel</button>
              <button type="button" className="tw-builder-overflow-edit-btn is-save" disabled={titleSaving} onClick={async () => { await saveTitle(); setOverflowTitleEditing(false); }}>Save</button>
            </div>
          </div>
        ) : (
          <button type="button" className="tw-builder-overflow-title-row" disabled={tutorialLock} onClick={() => { setTitleDraft(quiz?.title || ""); setOverflowTitleEditing(true); }}>
            <span className="tw-builder-overflow-title-text" title={fullQuizTitle}>{truncatedQuizTitle}</span>
            <TwIcon name="identification" size={18} />
          </button>
        )}
        {!guestMode && <button type="button" className="tw-builder-overflow-row" disabled={tutorialLock} onClick={() => { setOverflowOpen(false); setOverflowTitleEditing(false); setBankOpen(true); }}><TwIcon name="bank" size={18} /><span>Add from bank</span></button>}
        <button type="button" data-tutorial="builder-overflow-save" className="tw-builder-overflow-row" disabled={isSaved || isSaving || builderTutorialStage === "publish_menu"} onClick={() => { if (builderTutorialStage !== "save_menu") setOverflowOpen(false); setOverflowTitleEditing(false); requestSave(); }}><TwIcon name="check" size={18} /><span>{isSaving ? "Saving…" : isSaved ? "Saved" : "Save"}</span></button>
        <button type="button" data-tutorial="builder-overflow-publish" className="tw-builder-overflow-row" disabled={publishDisabled || builderTutorialStage === "save_menu"} onClick={() => { setOverflowOpen(false); setOverflowTitleEditing(false); publish(); }}><TwIcon name="spark" size={18} /><span>{publishLatched ? "Published" : "Publish"}</span></button>
        <button type="button" className="tw-builder-overflow-row is-danger" disabled={tutorialLock} onClick={() => { setOverflowOpen(false); setOverflowTitleEditing(false); setModal("confirmDelete"); }}><TwIcon name="trash" size={18} /><span>Delete</span></button>
      </div>
    </div>
  );
}
