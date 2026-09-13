import { normalizeTemplateType } from "../../../lib/templateTypes";
import { ThinkSpellEditor } from "./ThinkSpellEditor";
import { McqEditor } from "./McqEditor";
import { MatchingEditor } from "./MatchingEditor";
import { TrueFalseEditor, TypeAnswerEditor, GuessWordEditor } from "./SimpleEditors";

export { BuilderModal, BankModal } from "./builderDialogs";
export { MediaInput, ImageUploadTile } from "./builderMedia";
export { voiceAnswerRows, VoiceRecordingPanel, CorrectAnswerExplanation } from "./builderVoice";
export { ThinkSpellEditor } from "./ThinkSpellEditor";
export { McqEditor } from "./McqEditor";
export { MatchingEditor } from "./MatchingEditor";
export { TrueFalseEditor, TypeAnswerEditor, GuessWordEditor } from "./SimpleEditors";
export { getUi } from "./builderUi";
export function TemplateEditor({ templateType, category, q, onChange, ui, c, isMobile = false }) {
  const tt = normalizeTemplateType(templateType);
  const cfg = q.config || {};
  const cor = q.correct || {};

  if (tt === "MCQ") {
    return <McqEditor category={category} q={q} onChange={onChange} ui={ui} c={c} isMobile={isMobile} />;
  }
  if (tt === "TRUE_FALSE") {
    return <TrueFalseEditor q={q} onChange={onChange} ui={ui} c={c} />;
  }

  if (["TYPE_ANSWER", "DRAW_IT", "GRIP_GUESS"].includes(tt)) {
    return <TypeAnswerEditor templateType={tt} q={q} onChange={onChange} ui={ui} c={c} />;
  }

  if (tt === "GUESS_WORD_4PICS") {
    return <GuessWordEditor q={q} onChange={onChange} ui={ui} c={c} />;
  }

  if (tt === "MATCHING") {
    return <MatchingEditor q={q} onChange={onChange} ui={ui} c={c} isMobile={isMobile} />;
  }

  if (tt === "THINK_SPELL") {
    // key=q.order ensures ThinkSpellEditor remounts when the user switches batches,
    // resetting its local compact word-field draft to that batch's saved words.
    return (
      <ThinkSpellEditor
        key={q.order}
        cor={cor}
        cfg={cfg}
        onChange={onChange}
        ui={ui}
        c={c}
        isMobile={isMobile}
      />
    );
  }

  return null;
}
