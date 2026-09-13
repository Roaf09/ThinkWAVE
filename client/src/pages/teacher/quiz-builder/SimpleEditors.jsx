import { useEffect, useState } from "react";
import { ImageUploadTile } from "./builderMedia";
import { CorrectAnswerExplanation } from "./builderVoice";
import { reorderList, trimText } from "./quizBuilderUtils";

export function TrueFalseEditor({ q, onChange, ui, c }) {
  const cfg = q.config || {};
  const cor = q.correct || {};
  const selected = trimText(cor.choice).toLowerCase();
  return (
    <div style={ui.innerCard}>
      <h4 style={ui.innerTitle}>True / False</h4>
      <div data-tutorial="builder-tf-answers" className="grid grid-cols-[1fr_1fr] gap-3 mt-3">
        {["True", "False"].map((value) => {
          const active = selected === value.toLowerCase();
          return (
            <button
              key={value}
              type="button"
              className={`tw-builder-answer-choice rounded-2xl px-4 py-[18px] font-black text-[16px] cursor-pointer flex items-center justify-center gap-[10px]${active ? ` is-${value.toLowerCase()}` : ""}`}
              onClick={() => onChange({ config: { ...cfg, options: ["True", "False"] }, correct: { ...cor, choice: value } })}
              style={{
                border: `2px solid ${active ? (value === "True" ? "#22c55e" : "#ef4444") : c.border}`,
                background: active ? (value === "True" ? "rgba(34,197,94,.12)" : "rgba(239,68,68,.12)") : c.cardBg2,
                color: active ? (value === "True" ? "#16a34a" : "#dc2626") : c.text,
                boxShadow: active ? `0 12px 28px ${value === "True" ? "rgba(34,197,94,.22)" : "rgba(239,68,68,.22)"}` : "none",
                transition: "all 0.22s ease",
                outline: active ? `3px solid ${value === "True" ? "rgba(34,197,94,.14)" : "rgba(239,68,68,.14)"}` : "none",
              }}
            >
              <span
                className={`tw-tf-state-dot${active ? " is-active" : ""} is-${value.toLowerCase()}`}
                style={{ "--tw-tf-color": value === "True" ? "#22c55e" : "#ef4444", "--tw-tf-idle": c.textMuted }}
              />
              {value}
            </button>
          );
        })}
      </div>
      {selected && <CorrectAnswerExplanation value={cfg.explanation || ""} onChange={(explanation) => onChange({ config: { ...cfg, options: ["True", "False"], explanation } })} ui={ui} c={c} />}
    </div>
  );
}

export function TypeAnswerEditor({ templateType, q, onChange, ui, c }) {
  const cfg = q.config || {};
  const cor = q.correct || {};
  const tt = templateType;
  const [identificationBlurred, setIdentificationBlurred] = useState(false);

  useEffect(() => {
    setIdentificationBlurred(Boolean(trimText(cfg.explanation)));
  }, [q.order, tt]);

  return (
    <div style={ui.innerCard}>
      <h4 style={ui.innerTitle}>{tt === "TYPE_ANSWER" ? "Identification" : "Answer"}</h4>
      {/* Revision 1: Typed response is displayed as Identification per panel suggestion. */}
      <div data-tutorial="builder-identification-answer"><label className="block mb-2" style={ui.smallLabel}>Correct answer</label><input maxLength={255} value={cor.text ?? ""} placeholder="Enter the answer" onFocus={() => { if (!trimText(cfg.explanation)) setIdentificationBlurred(false); }} onBlur={() => { if (trimText(cor.text)) setIdentificationBlurred(true); }} onChange={(e) => onChange({ correct: { ...cor, text: e.target.value.slice(0, 255) }, config: { ...cfg, typoTolerance: 0 } })} className="font-[850] tracking-[.04em]" style={ui.input} />{tt === "TYPE_ANSWER" && identificationBlurred && trimText(cor.text) && <CorrectAnswerExplanation value={cfg.explanation || ""} onChange={(explanation) => onChange({ config: { ...cfg, typoTolerance: 0, explanation } })} ui={ui} c={c} />}</div>
    </div>
  );
}

export function GuessWordEditor({ q, onChange, ui, c }) {
  const cfg = q.config || {};
  const cor = q.correct || {};
  const [guessAnswerBlurred, setGuessAnswerBlurred] = useState(false);

  useEffect(() => {
    setGuessAnswerBlurred(Boolean(trimText(cfg.explanation)));
  }, [q.order]);

  const images = Array.isArray(cfg.images) ? [...cfg.images] : ["", "", "", ""];
  while (images.length < 4) images.push("");

  function setImage(index, value) {
    const next = [...images];
    next[index] = value;
    onChange({ config: { ...cfg, images: next, target: cfg.target ?? cor.text ?? "", dummyLetters: Number(cfg.dummyLetters || 6) } });
  }

  function reorderImage(from, to) {
    if (from === to) return;
    onChange({ config: { ...cfg, images: reorderList(images, from, to) } });
  }

  return (
    <div style={ui.innerCard}>
      <h4 style={ui.innerTitle}>Guess Word</h4>
      <div className="tw-guess-word-grid" data-tutorial="builder-guess-images">
        {images.slice(0, 4).map((src, index) => (
          <div key={index} className="tw-guess-word-image" draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", String(index))} onDragOver={(e) => e.preventDefault()} onDrop={(e) => reorderImage(Number(e.dataTransfer.getData("text/plain")), index)}>
            <ImageUploadTile value={src} label={`Upload image ${index + 1}`} onChange={(value) => setImage(index, value)} c={c} accent={ui.templateAccent} />
          </div>
        ))}
      </div>

      <div className="tw-guess-word-answer-row mt-4 p-[15px] rounded-2xl" data-tutorial="builder-guess-word-fields" style={{ border: `1px solid ${ui.templateBorder || c.border}`, background: ui.templateSoftBg || c.cardBg2 }}>
        <div data-tutorial="builder-guess-answer">
          <label className="block mb-2" style={ui.smallLabel}>Correct word</label>
          <input
            maxLength={255}
            value={cor.text ?? ""}
            placeholder="Enter the answer"
            onFocus={() => { if (!trimText(cfg.explanation)) setGuessAnswerBlurred(false); }}
            onBlur={() => { if (trimText(cor.text)) setGuessAnswerBlurred(true); }}
            onChange={(e) => onChange({ correct: { ...cor, text: e.target.value.slice(0, 255) }, config: { ...cfg, images, target: e.target.value.slice(0, 255), dummyLetters: Number(cfg.dummyLetters || 6) } })}
            className="font-[850] tracking-[.04em]" style={ui.input}
          />
        </div>
        <div data-tutorial="builder-guess-distractors">
          <label className="block mb-2" style={ui.smallLabel}>Distractor letters</label>
          <input
            type="number"
            min={0}
            max={12}
            value={Number(cfg.dummyLetters || 6)}
            onChange={(e) => onChange({ config: { ...cfg, images, target: cfg.target ?? cor.text ?? "", dummyLetters: Math.min(12, Math.max(0, Number(e.target.value) || 0)) } })}
            className="font-[850]" style={ui.input}
          />
        </div>
        {guessAnswerBlurred && trimText(cor.text) && (
          <div className="tw-guess-word-explanation">
            <CorrectAnswerExplanation
              value={cfg.explanation || ""}
              onChange={(explanation) => onChange({ config: { ...cfg, images, target: cor.text ?? cfg.target ?? "", dummyLetters: Number(cfg.dummyLetters || 6), explanation } })}
              ui={ui}
              c={c}
            />
          </div>
        )}
      </div>
    </div>
  );
}
