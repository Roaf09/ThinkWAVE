import { VoiceRecorderButton } from "../../../components/AudioControls";
import { normalizeTemplateType } from "../../../lib/templateTypes";
import { normalizeChoiceOptions, trimText } from "./quizBuilderUtils";

export function voiceAnswerRows(question, templateType) {
  const tt = normalizeTemplateType(templateType);
  const cfg = question?.config || {};
  const correct = question?.correct || {};
  const clean = (value, fallback) => trimText(value) || fallback;
  if (tt === "MCQ") {
    return normalizeChoiceOptions(cfg.options || [], "").map((option, index) => ({
      key: `choice-${option.id || index}`,
      label: clean(option.text, `Choice ${String.fromCharCode(65 + index)}`),
    }));
  }
  if (tt === "TRUE_FALSE") return ["True", "False"].map((label, index) => ({ key: `tf-${index}`, label }));
  if (tt === "TYPE_ANSWER") return [{ key: "identification-answer", label: clean(correct.text, "Correct answer") }];
  if (tt === "MATCHING") {
    const rows = [];
    (cfg.colA || []).forEach((row, index) => rows.push({ key: `a-${index}`, label: `Column A ${index + 1}: ${clean(row?.text, "image item")}` }));
    (cfg.colB || []).forEach((row, index) => rows.push({ key: `b-${index}`, label: `Column B ${index + 1}: ${clean(row?.text, "image item")}` }));
    (cfg.dummyB || []).forEach((row, index) => rows.push({ key: `dummy-${index}`, label: `Dummy ${index + 1}: ${clean(row?.text, "image item")}` }));
    return rows;
  }
  if (tt === "GUESS_WORD_4PICS") return [{ key: "guess-word", label: clean(cfg.target || correct.text, "Correct word") }];
  if (tt === "THINK_SPELL") {
    const words = Array.isArray(cfg.answers) && cfg.answers.length ? cfg.answers : (Array.isArray(correct.answers) ? correct.answers : []);
    return words.map((word, index) => ({ key: `word-${index}`, label: clean(word, `Word ${index + 1}`) }));
  }
  return [];
}

export function VoiceRecordingPanel({ question, templateType, onChange, ui, c, compactQuestionOnly = false }) {
  const cfg = question?.config || {};
  const tt = normalizeTemplateType(templateType);
  const recordings = Array.isArray(cfg.voiceAnswers) ? cfg.voiceAnswers : [];
  const rows = voiceAnswerRows(question, templateType);
  const holdToRecord = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)")?.matches;
  const setRecording = (index, value) => {
    const next = [...recordings];
    next[index] = value;
    onChange({ config: { ...cfg, voiceAnswers: next } });
  };
  return (
    <div className={`tw-voice-recording-panel${compactQuestionOnly ? " is-question-compact" : ""}`} style={{ ...ui.innerCard, marginTop: compactQuestionOnly ? 0 : 14, marginBottom: compactQuestionOnly ? 0 : 16, padding: 16 }}>
      {!compactQuestionOnly && <><div style={{ fontWeight: 900, color: c.text, marginBottom: 4 }}>Voice support</div>
      <div style={{ fontSize: 12, color: c.textMuted, marginBottom: 12 }}>
        {holdToRecord ? "Press and hold the speaker to record. Release to stop." : "Click the speaker to record. Click it again to stop."}
      </div></>}
      <div className="tw-voice-record-row">
        <div>{compactQuestionOnly ? <span>{trimText(question?.prompt) || "Record question audio"}</span> : <><strong>Question</strong><span>{trimText(question?.prompt) || "Question"}</span></>}</div>
        <VoiceRecorderButton holdToRecord={holdToRecord} value={cfg.voicePrompt || ""} onChange={(value) => onChange({ config: { ...cfg, voicePrompt: value } })} />
      </div>
      {tt !== "MCQ" && rows.map((row, index) => (
        <div className="tw-voice-record-row" key={row.key}>
          <div><strong>{`Answer ${index + 1}`}</strong><span>{row.label}</span></div>
          <VoiceRecorderButton holdToRecord={holdToRecord} value={recordings[index] || ""} onChange={(value) => setRecording(index, value)} />
        </div>
      ))}
    </div>
  );
}

export function CorrectAnswerExplanation({ value, onChange, ui, c }) {
  return <div className="tw-correct-answer-explanation" style={{ marginTop: 14, padding: 14, borderRadius: 14, border: `2px solid ${c.accent}55`, background: `${c.accent}0c` }}>
    <label style={{ ...ui.smallLabel, display: "block", marginBottom: 7, color: c.text }}>Why is this the correct answer?</label>
    <textarea data-tutorial="builder-answer-explanation" maxLength={1000} rows={3} value={value || ""} onChange={(event) => onChange(event.target.value.slice(0, 1000))} placeholder="Explain: optional" style={{ ...ui.input, minHeight: 82, resize: "vertical", lineHeight: 1.5 }} />
  </div>;
}
