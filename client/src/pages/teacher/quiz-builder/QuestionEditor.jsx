import { TwIcon } from "../../../components/TwUI";
import { normalizeTemplateType } from "../../../lib/templateTypes";
import { MediaInput, TemplateEditor, VoiceRecordingPanel } from "./QuizBuilderParts";
import { clampQuestionPoints } from "./quizBuilderUtils";

export function QuestionEditor({ ui, c, quiz, currentQ, updateQ, isMobile }) {
  return (
    <>
      {currentQ?.config?.locked && <div className="tw-builder-locked-banner"><TwIcon name="lock" size={14} /> This question is locked. Unlock it to make changes.</div>}
      <div className={currentQ?.config?.locked ? "tw-builder-lockable is-locked" : "tw-builder-lockable"}>
      <div data-tutorial="builder-meta-grid" style={isMobile ? { ...ui.metaGrid, gridTemplateColumns: "1fr 1fr" } : ui.metaGrid} className={isMobile ? "tw-builder-meta-sidebyside" : undefined}>
        <div className="tw-builder-meta-card-3d" style={ui.metaCard}>
          <div style={ui.metaLabel}>⏱ Time limit</div>
          <div style={ui.metaRow}>
            <select value={currentQ.timeLimitSec ?? 30} onChange={(e) => updateQ({ timeLimitSec: Number(e.target.value) })} style={{ ...ui.metaInput, width: 125 }}>
              {Array.from({ length: Math.floor(600 / 30) }, (_, i) => (i + 1) * 30).map((seconds) => <option key={seconds} value={seconds}>{seconds}s</option>)}
            </select>
          </div>
        </div>
        <div className="tw-builder-meta-card-3d" style={ui.metaCard}>
          <div style={ui.metaLabel}>⭐ Points</div>
          <div style={ui.metaRow}>
            <div role="radiogroup" aria-label="Question points" style={{ display: "flex", gap: 6 }}>
              {[1, 2, 3].map((value) => {
                const active = clampQuestionPoints(currentQ.points) === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    title={`${value} point${value === 1 ? "" : "s"}`}
                    onClick={() => updateQ({ points: value })}
                    style={{ ...ui.metaInput, width: 40, textAlign: "center", cursor: "pointer", fontWeight: 900, borderWidth: active ? 3 : 1, opacity: active ? 1 : 0.65 }}
                  >
                    {value}
                  </button>
                );
              })}
            </div>
            <span style={ui.metaSuffix}>{normalizeTemplateType(quiz.template_type) === "CROSSWORD" ? "per word" : normalizeTemplateType(quiz.template_type) === "MATCHING" ? "per pair" : "per question"}</span>
          </div>
        </div>
      </div>

      <div className={quiz.template_type === "MCQ" && currentQ.config?.voiceRecord ? "tw-builder-question-voice-grid" : undefined}>
        <div data-tutorial="builder-question">
          <label style={ui.fieldLabel}>
            Question
            <span className="text-[11px] opacity-[0.55] ml-2">{(currentQ.prompt || "").length}/255</span>
          </label>
          <textarea rows={4} maxLength={255} value={currentQ.prompt} onChange={(e) => updateQ({ prompt: e.target.value })} style={ui.textarea} />
        </div>
        {quiz.template_type === "MCQ" && currentQ.config?.voiceRecord && <VoiceRecordingPanel question={currentQ} templateType={quiz.template_type} onChange={updateQ} ui={ui} c={c} compactQuestionOnly />}
      </div>
      {quiz.template_type !== "MCQ" && currentQ.config?.voiceRecord && <VoiceRecordingPanel question={currentQ} templateType={quiz.template_type} onChange={updateQ} ui={ui} c={c} />}
      {currentQ.config?.showPromptImage && <div className="mt-[10px] mb-4">
        <MediaInput
          label="Question image (optional)"
          value={currentQ.config?.promptImage || ""}
          placeholder="Image URL for this question"
          onChange={(value) => updateQ({ config: { ...(currentQ.config || {}), promptImage: value } })}
          ui={ui}
          c={c}
        />
      </div>}


      <TemplateEditor templateType={quiz.template_type} category={quiz.category} q={currentQ} onChange={updateQ} ui={ui} c={c} isMobile={isMobile} />
      </div>
    </>
  );
}
