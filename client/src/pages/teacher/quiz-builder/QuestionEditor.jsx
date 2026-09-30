import { TwIcon } from "../../../components/TwUI";
import { VoiceRecorderButton } from "../../../components/AudioControls";
import { normalizeTemplateType } from "../../../lib/templateTypes";
import { TemplateEditor } from "./QuizBuilderParts";
import { ImageUploadTile } from "./builderMedia";
import { clampQuestionPoints, fitCappedLines } from "./quizBuilderUtils";

function formatTimeLimit(seconds) {
  if (seconds === 30) return "30 sec";
  const mins = seconds / 60;
  return `${Number.isInteger(mins) ? mins : mins.toFixed(1)} min`;
}

export { formatTimeLimit };

// Whole-minute options (30 sec kept); the current value is appended when a
// legacy question carries a half-minute limit so the select never blanks.
export function buildTimeOptions(current) {
  const options = [30, ...Array.from({ length: 10 }, (_, i) => (i + 1) * 60)];
  const value = Number(current ?? 30);
  if (!options.includes(value)) options.push(value);
  return options.sort((a, b) => a - b);
}

// Builder prompt field: full size through 3 lines; longer text shrinks
// toward the floor instead of growing a 4th line. Height hugs content so
// the flex column keeps it centered vertically.
const PROMPT_MAX_FONT = 24;
const PROMPT_MIN_FONT = 13;
const PROMPT_MAX_HEIGHT = 108;

export function fitPromptFont(el) {
  if (!el) return;
  fitCappedLines(el, { maxSize: PROMPT_MAX_FONT, minSize: PROMPT_MIN_FONT, maxLines: 3, maxHeight: PROMPT_MAX_HEIGHT });
}

export function QuestionEditor({ ui, c, quiz, currentQ, updateQ, isMobile, toolbar = null }) {
  const accent = ui.templateAccent || "#2b6cff";
  const boxFill = `color-mix(in srgb, ${accent} 12%, #ffffff)`;
  const boxBase = `color-mix(in srgb, ${accent} 58%, #0f172a)`;
  // Same inline question recording for every template: the record chip shares
  // the row with the question image tile, just like MCQ.
  const questionVoice = !!currentQ.config?.voiceRecord;
  const holdToRecord = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)")?.matches;
  return (
    <>
      {currentQ?.config?.locked && <div className="tw-builder-locked-banner"><TwIcon name="lock" size={14} /> This question is locked. Unlock it to make changes.</div>}
      <div className={currentQ?.config?.locked ? "tw-builder-lockable is-locked" : "tw-builder-lockable"}>
      {/* Time limit + points live in the desktop header; the cards below only render on mobile. */}
      {isMobile && (
      <div data-tutorial="builder-meta-grid" style={{ ...ui.metaGrid, gridTemplateColumns: "1fr 1fr" }} className="tw-builder-meta-sidebyside">
        <div className="tw-builder-meta-card-3d" style={ui.metaCard}>
          <div style={ui.metaLabel}>⏱ Time limit</div>
          <div style={ui.metaRow}>
            <select value={currentQ.timeLimitSec ?? 30} onChange={(e) => updateQ({ timeLimitSec: Number(e.target.value) })} style={{ ...ui.metaInput, width: 125 }}>
              {buildTimeOptions(currentQ.timeLimitSec).map((seconds) => <option key={seconds} value={seconds}>{formatTimeLimit(seconds)}</option>)}
            </select>
          </div>
        </div>
        <div className="tw-builder-meta-card-3d" style={ui.metaCard}>
          <div style={ui.metaLabel}>⭐ Points</div>
          <div style={ui.metaRow}>
            <select value={clampQuestionPoints(currentQ.points)} onChange={(e) => updateQ({ points: Number(e.target.value) })} style={{ ...ui.metaInput, width: 125 }}>
              {[1, 2, 3].map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
            <span style={ui.metaSuffix}>{normalizeTemplateType(quiz.template_type) === "CROSSWORD" ? "per word" : normalizeTemplateType(quiz.template_type) === "MATCHING" ? "per pair" : "per question"}</span>
          </div>
        </div>
      </div>
      )}

      <div>
        <style>{`.qn-builder-prompt::placeholder{color:rgba(15,23,42,.5)}`}</style>
        <div data-tutorial="builder-question">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
            <label style={{ ...ui.fieldLabel, marginBottom: 0 }}>
              Question
              <span className="text-[11px] opacity-[0.55] ml-2">{(currentQ.prompt || "").length}/255</span>
            </label>
            {toolbar}
          </div>
          {/* Builder question area follows the template color like the header and form. */}
          <div className="tw-builder-prompt-box" style={{ background: boxFill, borderRadius: 8, padding: "20px 24px", minHeight: 130, marginBottom: 0, border: `3px solid ${accent}`, boxShadow: `0 6px 0 ${boxBase}, 0 18px 34px ${accent}59, inset 0 2px 0 rgba(255,255,255,.8)`, boxSizing: "border-box", display: "flex", flexDirection: "column", alignItems: "stretch", justifyContent: "center" }}>
            <textarea
              rows={1}
              maxLength={255}
              value={currentQ.prompt}
              onChange={(e) => updateQ({ prompt: e.target.value })}
              onInput={(e) => fitPromptFont(e.currentTarget)}
              ref={(el) => { if (el) fitPromptFont(el); }}
              placeholder="Type your question here"
              aria-label="Question"
              className="qn-builder-prompt"
              style={{
                background: "transparent",
                border: "none",
                outline: "none",
                resize: "none",
                overflow: "hidden",
                width: "100%",
                boxSizing: "border-box",
                fontSize: 20,
                fontWeight: 800,
                color: "#0f172a",
                textAlign: "center",
                fontFamily: "inherit",
                whiteSpace: "pre-wrap",
                padding: 0,
                margin: 0,
                lineHeight: 1.5,
              }}
            />
            {(questionVoice || currentQ.config?.showPromptImage) && (
              <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap", alignItems: "stretch", justifyContent: "center" }}>
                {currentQ.config?.showPromptImage && (
                  <div style={{ flex: "1 1 240px", minWidth: 0, maxWidth: 320 }}>
                    <ImageUploadTile compact value={currentQ.config?.promptImage || ""} label="Drop or upload question image" onChange={(value) => updateQ({ config: { ...(currentQ.config || {}), promptImage: value } })} c={c} accent={accent} />
                  </div>
                )}
                {questionVoice && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 800, color: "#0f172a", background: "#ffffff", border: `3px solid ${accent}`, borderRadius: 14, boxShadow: `inset 0 4px 0 rgba(15,23,42,.10), inset 0 10px 20px color-mix(in srgb, ${accent} 16%, transparent)`, padding: "10px 14px" }}>
                    <VoiceRecorderButton holdToRecord={holdToRecord} value={currentQ.config?.voicePrompt || ""} onChange={(value) => updateQ({ config: { ...(currentQ.config || {}), voicePrompt: value } })} />
                    Record question
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <TemplateEditor templateType={quiz.template_type} category={quiz.category} q={currentQ} onChange={updateQ} ui={ui} c={c} isMobile={isMobile} />
      </div>
    </>
  );
}
