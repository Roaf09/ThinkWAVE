import { useState } from "react";
import { TwIcon } from "../../../components/TwUI";
import { TeacherPressButton } from "../TeacherUI";
import { clampQuestionPoints } from "./quizBuilderUtils";
import { buildTimeOptions, formatTimeLimit } from "./QuestionEditor";

const headerSelect = {
  background: "#fff",
  color: "#0f172a",
  border: "1px solid #fff",
  borderRadius: 8,
  padding: "10px 12px",
  fontSize: 14,
  fontWeight: 900,
  fontFamily: "inherit",
  cursor: "pointer",
};

function RandomizeHelp({ text }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  return (
    <span
      className={`tw-builder-randomize-help${open ? " is-open" : ""}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
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
  currentQ,
  updateQ,
}) {
  const timeValue = currentQ?.timeLimitSec ?? 30;
  const pointsValue = clampQuestionPoints(currentQ?.points);
  return (
    <div style={isMobile ? { ...ui.topBar, flexWrap: "nowrap", gap: 8, padding: "10px 14px" } : ui.topBar} className={isMobile ? "tw-builder-mobile-topbar is-single-row" : undefined}>
      {isMobile ? (
      <>
        <div className="flex items-center gap-2 flex-1 min-w-0 flex-nowrap">
          <button type="button" data-tutorial="builder-home" className="tw-builder-settings-flat tw-builder-bare-icon" title="Back to dashboard" aria-label="Back to dashboard" onClick={() => navigate(guestMode ? "/guest" : "/teacher", { state: { tab: "live" } })}><TwIcon name="home" size={26} /></button>
          <div className="min-w-0 flex-1">
            <button type="button" className="tw-builder-title-button tw-builder-mobile-title" title={fullQuizTitle} style={{ color: "#fff" }} onClick={() => { setTitleDraft(quiz?.title || ""); openOverflow(); setOverflowTitleEditing(true); }}>
              {truncatedQuizTitle}
            </button>
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
        <button type="button" data-tutorial="builder-home" className="tw-builder-settings-flat tw-builder-bare-icon" title="Back to dashboard" aria-label="Back to dashboard" onClick={() => navigate(guestMode ? "/guest" : "/teacher", { state: { tab: "live" } })}><TwIcon name="home" size={28} /></button>
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
        <div data-tutorial="builder-meta-grid" className="flex gap-2 items-center flex-wrap" style={{ marginRight: 4 }}>
          <label className="flex gap-1 items-center" title="Time limit for this question">
            <span style={{ display: "inline-flex", color: "#fff" }}><TwIcon name="clock" size={26} /></span>
            <select
              value={timeValue}
              disabled={!currentQ}
              onChange={(e) => updateQ?.({ timeLimitSec: Number(e.target.value) })}
              aria-label="Time limit"
              style={headerSelect}
            >
              {buildTimeOptions(currentQ?.timeLimitSec).map((seconds) => <option key={seconds} value={seconds} style={{ color: "#0f172a" }}>{formatTimeLimit(seconds)}</option>)}
            </select>
          </label>
          <label className="flex gap-1 items-center" title="Points for this question">
            <span style={{ display: "inline-flex", color: "#fff" }}><TwIcon name="spark" size={26} /></span>
            <select
              value={pointsValue}
              disabled={!currentQ}
              onChange={(e) => updateQ?.({ points: Number(e.target.value) })}
              aria-label="Question points"
              style={headerSelect}
            >
              {[1, 2, 3].map((value) => <option key={value} value={value} style={{ color: "#0f172a" }}>{value} pt{value === 1 ? "" : "s"}</option>)}
            </select>
          </label>
        </div>
        <div className="tw-builder-settings-anchor">
          <button className={`tw-builder-settings-flat tw-builder-bare-icon no-hover-bg${settingsOpen ? " is-active" : ""}`} title="Quiz settings" aria-label="Quiz settings" onClick={() => { const opening = !settingsOpen; if (opening && questionStripOpen) closeQuestionStrip(); setOverflowOpen(false); setOverflowTitleEditing(false); setQMenuOpen(false); setSettingsOpen(opening); }}><TwIcon name="gear" size={28} /></button>
          {settingsOpen && (
            <>
              <div className="tw-builder-settings-catcher" onClick={() => setSettingsOpen(false)} />
              <div className="tw-builder-settings-popup" role="dialog" aria-label="Quiz settings">
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
            </>
          )}
        </div>
        <button type="button" className="tw-builder-flat-btn is-bare is-icon-only tone-red no-hover-bg" data-tutorial="builder-delete-quiz" title="Delete quiz" aria-label="Delete quiz" onClick={() => setModal("confirmDelete")}><TwIcon name="trash" size={26} /></button>
        {!guestMode && <button type="button" className="tw-builder-flat-btn is-bare is-icon-only no-hover-bg" data-tutorial="builder-add-bank" title="Add from Bank" aria-label="Add from Bank" onClick={() => setBankOpen(true)}><TwIcon name="bank" size={26} /></button>}
        <button type="button" className="tw-builder-flat-btn is-bare is-icon-only no-hover-bg" data-tutorial="builder-add-question" title={builderTutorialStage && builderTutorialStage !== "add" ? "Finish the current tutorial step first" : (isBatchTemplate ? "Add Batch" : "Add Question")} aria-label={isBatchTemplate ? "Add Batch" : "Add Question"} onClick={addQuestion} disabled={!!builderTutorialStage && builderTutorialStage !== "add"}><TwIcon name="plus" size={26} /></button>
        <TeacherPressButton tone="blue" icon="check" data-tutorial="builder-save" className={`tw-builder-toolbar-action tw-builder-template-action is-white-action${isSaved ? " is-latched" : ""}`} style={{ "--builder-action-icon": "var(--tw-builder-action-face,#173f9b)" }} onClick={requestSave} disabled={isSaved || isSaving}>{isSaving ? "Saving…" : isSaved ? "Saved" : "Save"}</TeacherPressButton>
        <TeacherPressButton tone="blue" icon="spark" data-tutorial="builder-publish" className={`tw-builder-toolbar-action tw-builder-template-action is-white-action${publishLatched ? " is-latched" : ""}`} style={{ "--builder-action-icon": "var(--tw-builder-action-face,#173f9b)" }} onClick={publish} disabled={publishDisabled}>{publishLatched ? "Published" : "Publish"}</TeacherPressButton>
      </div>
      </>
      )}
    </div>
  );
}
