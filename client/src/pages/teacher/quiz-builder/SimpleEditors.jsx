import { useEffect, useState } from "react";
import { TwIcon } from "../../../components/TwUI";
import { TRUE_FALSE_TILES } from "../../../lib/templatePalette";
import { VoiceRecorderButton } from "../../../components/AudioControls";
import { ImageUploadTile } from "./builderMedia";
import { CorrectAnswerExplanation } from "./builderVoice";
import { fitCappedLines, reorderList, trimText } from "./quizBuilderUtils";

export function TrueFalseEditor({ q, onChange, ui, c, isMobile = false }) {
  const cfg = q.config || {};
  const cor = q.correct || {};
  const selected = trimText(cor.choice).toLowerCase();
  // Same 3D tile language as the MCQ gameplay choices: green True, red False.
  const tiles = TRUE_FALSE_TILES;
  return (
    <div style={ui.innerCard}>
      <h4 style={ui.innerTitle}>True / False</h4>
      <div data-tutorial="builder-tf-answers" className="grid gap-3 mt-3" style={{ gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr" }}>
        {tiles.map((tile) => {
          const active = selected === tile.value.toLowerCase();
          return (
            <button
              key={tile.value}
              type="button"
              onClick={() => onChange({ config: { ...cfg, options: ["True", "False"] }, correct: { ...cor, choice: active ? "" : tile.value } })}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: 22,
                borderRadius: 20,
                border: `4px solid ${tile.border}`,
                background: tile.face,
                color: tile.ink,
                boxShadow: active
                  ? `0 1px 0 ${tile.base}, 0 8px 18px rgba(15,23,42,.18)`
                  : `0 8px 0 ${tile.base}, 0 16px 28px rgba(15,23,42,.16)`,
                transform: active ? "translateY(5px)" : "translateY(-3px)",
                transition: "transform .13s ease, filter .16s ease, box-shadow .13s ease",
                fontFamily: "inherit",
                fontWeight: 900,
                fontSize: 18,
                cursor: "pointer",
              }}
            >
              <span style={{
                width: 56, height: 56, flex: "none", borderRadius: "50%",
                border: `4px solid ${tile.border}`, background: tile.badge, color: tile.ink,
                boxShadow: `0 3px 0 ${tile.base}`, fontWeight: 1000, fontSize: 24,
                display: "grid", placeItems: "center",
              }}>{active ? <TwIcon name="check" size={22} strokeWidth={3.2} /> : tile.short}</span>
              <span style={{ flex: "1 1 auto", textAlign: "center", fontSize: 36 }}>{tile.value}</span>
            </button>
          );
        })}
      </div>
      {selected && <CorrectAnswerExplanation value={cfg.explanation || ""} onChange={(explanation) => onChange({ config: { ...cfg, options: ["True", "False"], explanation } })} ui={ui} c={c} />}
    </div>
  );
}

export function TypeAnswerEditor({ templateType, q, onChange, ui, c, isMobile = false }) {
  const cfg = q.config || {};
  const cor = q.correct || {};
  const tt = templateType;
  const [identificationBlurred, setIdentificationBlurred] = useState(false);

  useEffect(() => {
    setIdentificationBlurred(Boolean(trimText(cfg.explanation)));
  }, [q.order, tt]);

  const extra = Array.isArray(cor.answers) ? cor.answers : [];
  const fields = [cor.text ?? "", ...extra].slice(0, 3);
  const total = fields.length;

  // Same field recipe as the matching builder: white inset wells with 22px
  // bold centered text in a fixed 3-line box. Longer text shrinks toward
  // 12px instead of growing; leftover space becomes top padding so short
  // text sits centered both ways.
  const identAccent = ui.templateAccent || "#a855f7";
  function fitIdentification(input) {
    if (!input) return;
    fitCappedLines(input, { maxSize: 22, minSize: 12, maxLines: 3, maxHeight: 80 });
  }
  const identField = {
    background: "#ffffff",
    border: `3px solid ${identAccent}`,
    borderRadius: 14,
    boxShadow: `inset 0 4px 0 rgba(15,23,42,.10), inset 0 10px 20px color-mix(in srgb, ${identAccent} 16%, transparent)`,
    padding: "12px 14px",
    display: "flex",
    alignItems: "center",
  };

  function updateField(index, value) {
    const clean = String(value || "").slice(0, 255);
    if (index === 0) {
      onChange({ correct: { ...cor, text: clean }, config: { ...cfg, typoTolerance: 0 } });
    } else {
      const nextExtra = [...extra];
      while (nextExtra.length < index) nextExtra.push("");
      nextExtra[index - 1] = clean;
      onChange({ correct: { ...cor, answers: nextExtra.slice(0, 2) }, config: { ...cfg, typoTolerance: 0 } });
    }
  }

  function addAnswer() {
    if (total >= 3) return;
    onChange({ correct: { ...cor, answers: [...extra, ""].slice(0, 2) }, config: { ...cfg, typoTolerance: 0 } });
  }

  // Per-answer voice, same as MCQ choices: recordings live in
  // config.voiceAnswers, one slot per answer field.
  function updateRecording(index, value) {
    const recordings = Array.isArray(cfg.voiceAnswers) ? [...cfg.voiceAnswers] : [];
    recordings[index] = value;
    onChange({ config: { ...cfg, voiceAnswers: recordings } });
  }

  function removeLastAnswer() {
    if (total <= 1) return;
    if (extra.length > 0) {
      onChange({ correct: { ...cor, answers: extra.slice(0, -1) }, config: { ...cfg, typoTolerance: 0 } });
    } else {
      onChange({ correct: { ...cor, text: "" }, config: { ...cfg, typoTolerance: 0 } });
    }
  }

  return (
    <div style={ui.innerCard}>
      <div className="flex justify-between items-center gap-3 flex-wrap" style={{ marginBottom: 12 }}>
        <h4 style={{ ...ui.innerTitle, margin: 0 }}>{tt === "TYPE_ANSWER" ? "Identification" : "Answer"}</h4>
        <div className="tw-mcq-control-row">
          {total >= 2 && (
            <button
              type="button"
              className="tw-builder-press tw-builder-mini-white"
              onClick={removeLastAnswer}
              title="Remove last answer"
              aria-label="Remove last answer"
              style={isMobile
                ? { ...ui.secondaryBtn, padding: "4px 11px", fontSize: 16 }
                : { ...ui.secondaryBtn, padding: "4px 10px", fontSize: 12 }}
            >
              {isMobile ? "−" : "− Delete"}
            </button>
          )}
          <button
            type="button"
            className="tw-builder-press tw-builder-mini-white"
            onClick={addAnswer}
            disabled={total >= 3}
            data-tutorial="builder-identification-add-answer"
            title={total >= 3 ? "At most 3 answers" : "Add another accepted answer"}
            aria-label="Add another accepted answer"
            style={isMobile
              ? { ...ui.secondaryBtn, padding: "4px 11px", fontSize: 16, opacity: total >= 3 ? 0.5 : 1 }
              : { ...ui.secondaryBtn, padding: "4px 10px", fontSize: 12, opacity: total >= 3 ? 0.5 : 1 }}
          >
            {isMobile ? "＋" : "＋ Add answer"}
          </button>
        </div>
      </div>
      {/* Revision 1: Typed response is displayed as Identification per panel suggestion. */}
      <div data-tutorial="builder-identification-answer">
        <style>{`.tw-identification-input::placeholder{color:rgba(15,23,42,.5)}`}</style>
        <label className="block mb-2" style={ui.smallLabel}>Correct answer{total > 1 ? `s (${total}/3)` : ""}</label>
        <div style={isMobile
          ? { display: "flex", flexDirection: "column", gap: 8 }
          : { display: "flex", gap: 8, flexWrap: "nowrap" }}>
          {fields.map((val, idx) => (
            <div
              key={idx}
              style={isMobile
                ? { display: "flex", flexDirection: "column", gap: 8 }
                : { flex: "1 1 0", minWidth: 0 }}
            >
              <div style={identField}>
                <textarea
                  rows={3}
                  maxLength={255}
                  value={val ?? ""}
                  placeholder={idx === 0 ? "Enter the answer" : `Alt answer ${idx + 1}`}
                  onFocus={() => { if (!trimText(cfg.explanation)) setIdentificationBlurred(false); }}
                  onBlur={() => { if (trimText(cor.text)) setIdentificationBlurred(true); }}
                  onChange={(e) => updateField(idx, e.target.value)}
                  onInput={(e) => fitIdentification(e.currentTarget)}
                  ref={(el) => { if (el) fitIdentification(el); }}
                  className="font-[850] tracking-[.04em] tw-identification-input"
                  style={{ width: "100%", boxSizing: "border-box", background: "transparent", border: "none", outline: "none", resize: "none", overflow: "hidden", color: "#0f172a", fontWeight: 900, fontSize: 22, lineHeight: 1.45, textAlign: "center", fontFamily: "inherit", padding: 0 }}
                />
              </div>
              {cfg.voiceRecord && <div className="tw-builder-choice-record" style={{ marginTop: 8 }}><span>{idx === 0 ? "Answer recording" : `Alt answer ${idx + 1} recording`}</span><VoiceRecorderButton value={(Array.isArray(cfg.voiceAnswers) ? cfg.voiceAnswers : [])[idx] || ""} onChange={(value) => updateRecording(idx, value)} /></div>}
            </div>
          ))}
        </div>
        {tt === "TYPE_ANSWER" && identificationBlurred && trimText(cor.text) && <CorrectAnswerExplanation value={cfg.explanation || ""} onChange={(explanation) => onChange({ config: { ...cfg, typoTolerance: 0, explanation } })} ui={ui} c={c} />}
      </div>
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

  // Same recipe as the MCQ choice tiles, at identification size: big 30px
  // text in a fixed 3-line box. Longer text shrinks toward 12px instead of
  // growing; leftover space becomes top padding so short text sits centered.
  function fitGuessWord(input) {
    if (!input) return;
    fitCappedLines(input, { maxSize: 30, minSize: 12, maxLines: 3, maxHeight: 126 });
  }

  const guessBox = {
    background: "#e7f4ec",
    border: "3px solid #35a159",
    borderRadius: 20,
    boxShadow: "0 6px 0 #25753f, 0 14px 28px rgba(37,117,63,.25), inset 0 2px 0 rgba(255,255,255,.7)",
    padding: "12px 14px",
    display: "flex",
    alignItems: "center",
  };
  const guessInput = {
    width: "100%",
    boxSizing: "border-box",
    background: "transparent",
    border: "none",
    outline: "none",
    resize: "none",
    overflow: "hidden",
    color: "#14532d",
    fontWeight: 900,
    fontSize: 30,
    lineHeight: 1.4,
    textAlign: "center",
    fontFamily: "inherit",
    padding: 0,
  };

  return (
    <div style={ui.innerCard}>
      <h4 style={ui.innerTitle}>Guess Word</h4>
      <style>{`.tw-guess-word-input::placeholder{color:rgba(20,83,45,.45)}`}</style>
      <div className="tw-guess-word-grid" data-tutorial="builder-guess-images">
        {images.slice(0, 4).map((src, index) => (
          <div key={index} className="tw-guess-word-image" draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", String(index))} onDragOver={(e) => e.preventDefault()} onDrop={(e) => reorderImage(Number(e.dataTransfer.getData("text/plain")), index)}>
            <div style={{ border: "4px solid #35a159", borderRadius: 20, background: "#7fd09a", boxShadow: "0 8px 0 #25753f, 0 16px 28px rgba(15,23,42,.16)", padding: 8, height: "100%", boxSizing: "border-box", overflow: "hidden" }}>
              <ImageUploadTile value={src} label={`Upload image ${index + 1}`} onChange={(value) => setImage(index, value)} c={c} accent={ui.templateAccent} />
            </div>
          </div>
        ))}
      </div>

      <div className="tw-guess-word-answer-row mt-4 p-[15px] rounded-2xl" data-tutorial="builder-guess-word-fields" style={{ border: `1px solid ${ui.templateBorder || c.border}`, background: ui.templateSoftBg || c.cardBg2 }}>
        <div data-tutorial="builder-guess-answer">
          <label className="block mb-2" style={ui.smallLabel}>Correct word</label>
          <div style={guessBox}>
            <textarea
              rows={3}
              maxLength={255}
              value={cor.text ?? ""}
              placeholder="Enter the answer"
              onFocus={() => { if (!trimText(cfg.explanation)) setGuessAnswerBlurred(false); }}
              onBlur={() => { if (trimText(cor.text)) setGuessAnswerBlurred(true); }}
              onChange={(e) => onChange({ correct: { ...cor, text: e.target.value.slice(0, 255) }, config: { ...cfg, images, target: e.target.value.slice(0, 255), dummyLetters: Math.min(6, Math.max(3, Number(cfg.dummyLetters ?? 6) || 6)) } })}
              onInput={(e) => fitGuessWord(e.currentTarget)}
              ref={(el) => { if (el) fitGuessWord(el); }}
              className="font-[850] tracking-[.04em] tw-guess-word-input"
              style={guessInput}
            />
          </div>
        </div>
        <div data-tutorial="builder-guess-distractors">
          <label className="block mb-2" style={ui.smallLabel}>Distractor letters</label>
          <div style={guessBox}>
            <select
              value={String(Math.min(6, Math.max(3, Number(cfg.dummyLetters ?? 6) || 6)))}
              onChange={(e) => onChange({ config: { ...cfg, images, target: cfg.target ?? cor.text ?? "", dummyLetters: Math.min(6, Math.max(3, Number(e.target.value) || 6)) } })}
              className="font-[850]"
              style={{ ...guessInput, height: 126, fontSize: 30, width: "100%" }}
              aria-label="Distractor letters (3 to 6)"
            >
              {[3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
        {guessAnswerBlurred && trimText(cor.text) && (
          <div className="tw-guess-word-explanation">
            <CorrectAnswerExplanation
              value={cfg.explanation || ""}
              onChange={(explanation) => onChange({ config: { ...cfg, images, target: cor.text ?? cfg.target ?? "", dummyLetters: Math.min(6, Math.max(3, Number(cfg.dummyLetters ?? 6) || 6)), explanation } })}
              ui={ui}
              c={c}
            />
          </div>
        )}
      </div>
    </div>
  );
}
