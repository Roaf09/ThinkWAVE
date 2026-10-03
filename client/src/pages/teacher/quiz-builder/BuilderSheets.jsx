import { useRef, useState } from "react";
import { TwIcon } from "../../../components/TwUI";

function RandomizeHelp({ text }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  return (
    <span className={`tw-builder-randomize-help${open ? " is-open" : ""}`}>
      <span
        role="button"
        tabIndex={0}
        className="tw-builder-randomize-q"
        aria-label="What does randomize do?"
        title={text}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); } }}
      >
        ?
      </span>
      {open && <span className="tw-builder-randomize-tip" role="note">{text}</span>}
    </span>
  );
}

export function BuilderSettingsSheet({ builderSettingsRows, ui, setSettingsOpen }) {
  // Draggable like host participants/code sheet: drag handle down to dismiss.
  const sheetRef = useRef(null);
  const dragRef = useRef(null);
  function onHandlePointerDown(e) {
    const el = sheetRef.current;
    if (!el) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    el.classList.add("is-dragging");
    dragRef.current = { pointerId: e.pointerId, startY: e.clientY };
  }
  function onHandlePointerMove(e) {
    const drag = dragRef.current;
    const el = sheetRef.current;
    if (!drag || drag.pointerId !== e.pointerId || !el) return;
    const dy = Math.max(0, e.clientY - drag.startY);
    el.style.transform = `translateY(${Math.round(dy)}px)`;
  }
  function endHandleDrag(e) {
    const drag = dragRef.current;
    const el = sheetRef.current;
    dragRef.current = null;
    if (!drag || !el) return;
    if (e && e.pointerId !== undefined && e.pointerId !== drag.pointerId) return;
    el.classList.remove("is-dragging");
    const dy = (e?.clientY ?? drag.startY) - drag.startY;
    el.style.transform = "";
    if (dy > 80) setSettingsOpen(false);
  }
  return (
    <div className="tw-builder-sheet-backdrop" onClick={() => setSettingsOpen(false)}>
      <div ref={sheetRef} className="tw-builder-bottom-sheet" role="dialog" aria-label="Quiz settings" onClick={(e) => e.stopPropagation()}>
        <div
          className="tw-builder-sheet-handle"
          style={{ touchAction: "none", cursor: "grab" }}
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={endHandleDrag}
          onPointerCancel={endHandleDrag}
        />
        {builderSettingsRows.map((row) => (
          <button key={row.key} type="button" className="tw-builder-settings-row" onClick={row.onToggle}>
            <span className="tw-builder-settings-row-label">
              <span>{row.label}</span>
            </span>
            <span className="tw-builder-settings-right">
              {row.key === "randomize" && <RandomizeHelp text={row.help} />}
              <span className="tw-builder-settings-toggle-track" style={ui.switchTrack(row.active)}><span style={ui.switchThumb(row.active)} /></span>
            </span>
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
  const overflowSheetRef = useRef(null);
  const overflowDragRef = useRef(null);
  function onOverflowHandleDown(e) {
    const el = overflowSheetRef.current;
    if (!el) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    el.classList.add("is-dragging");
    overflowDragRef.current = { pointerId: e.pointerId, startY: e.clientY };
  }
  function onOverflowHandleMove(e) {
    const drag = overflowDragRef.current;
    const el = overflowSheetRef.current;
    if (!drag || drag.pointerId !== e.pointerId || !el) return;
    const dy = Math.max(0, e.clientY - drag.startY);
    el.style.transform = `translateY(${Math.round(dy)}px)`;
  }
  function endOverflowDrag(e) {
    const drag = overflowDragRef.current;
    const el = overflowSheetRef.current;
    overflowDragRef.current = null;
    if (!drag || !el) return;
    if (e && e.pointerId !== undefined && e.pointerId !== drag.pointerId) return;
    el.classList.remove("is-dragging");
    const dy = (e?.clientY ?? drag.startY) - drag.startY;
    el.style.transform = "";
    if (dy > 80) { setOverflowOpen(false); setOverflowTitleEditing(false); }
  }
  return (
    <div className="tw-builder-sheet-backdrop" onClick={() => { setOverflowOpen(false); setOverflowTitleEditing(false); }}>
      <div ref={overflowSheetRef} className="tw-builder-bottom-sheet" role="dialog" aria-label="More actions" onClick={(e) => e.stopPropagation()}>
        <div
          className="tw-builder-sheet-handle"
          style={{ touchAction: "none", cursor: "grab" }}
          onPointerDown={onOverflowHandleDown}
          onPointerMove={onOverflowHandleMove}
          onPointerUp={endOverflowDrag}
          onPointerCancel={endOverflowDrag}
        />
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
        <button type="button" data-tutorial="builder-overflow-save" className="tw-builder-overflow-row" disabled={isSaved || isSaving} onClick={() => { setOverflowTitleEditing(false); requestSave(); }}><TwIcon name="check" size={18} /><span>{isSaving ? "Saving…" : isSaved ? "Saved" : "Save"}</span></button>
        <button type="button" data-tutorial="builder-overflow-publish" className="tw-builder-overflow-row" disabled={publishDisabled || builderTutorialStage === "save_menu"} onClick={() => { setOverflowTitleEditing(false); publish(); }}><TwIcon name="spark" size={18} /><span>{publishLatched ? "Published" : "Publish"}</span></button>
        <button type="button" className="tw-builder-overflow-row is-danger" disabled={tutorialLock} onClick={() => { setOverflowOpen(false); setOverflowTitleEditing(false); setModal("confirmDelete"); }}><TwIcon name="trash" size={18} /><span>Delete</span></button>
      </div>
    </div>
  );
}
