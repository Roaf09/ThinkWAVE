import { useRef, useState } from "react";
import ActionDialog, { primaryBtn } from "../../../components/ActionDialog";
import { TwIcon } from "../../../components/TwUI";
import { VoiceRecorderButton } from "../../../components/AudioControls";
import { ImageUploadTile } from "./builderMedia";
import { CorrectAnswerExplanation } from "./builderVoice";
import {
  choiceHasContent,
  choiceMatchesValue,
  clampQuestionPoints,
  defaultMcqImageOptions,
  defaultMcqOptions,
  newChoiceId,
  normalizeChoiceOption,
  normalizeChoiceOptions,
  trimText,
} from "./quizBuilderUtils";

export function McqEditor({ category, q, onChange, ui, c, isMobile = false }) {
  const [showMatchingSuggest, setShowMatchingSuggest] = useState(false);
  const [mcqDragIndex, setMcqDragIndex] = useState(null);
  const [mcqDragOver, setMcqDragOver] = useState(null);
  const [mcqDropMode, setMcqDropMode] = useState("before");
  const [mcqMenuOpen, setMcqMenuOpen] = useState(false);
  const mcqDragArmedRef = useRef(null);
  const mcqTouchRef = useRef({ active: false, from: null });
  const cfg = q.config || {};
  const cor = q.correct || {};

  const mcqMode = cfg.mcqMode === "MODIFIED" ? "MODIFIED" : "NORMAL";
  const baseOptions = normalizeChoiceOptions(cfg.options, category);
  const opts = mcqMode === "MODIFIED"
    ? [...baseOptions, ...defaultMcqImageOptions()].slice(0, 4).map((opt, index) => ({ ...opt, id: opt.id || `image-option-${index + 1}`, text: "" }))
    : baseOptions;
  const MIN = mcqMode === "MODIFIED" ? 4 : 3;
  const MAX = mcqMode === "MODIFIED" ? 4 : 5;
  const answerMode = cfg.answerMode === "TWO" ? "TWO" : "ONE";
  const rawCorrect = Array.isArray(cor.choices) && cor.choices.length ? cor.choices : [cor.choice].filter(Boolean);
  const correctChoices = (answerMode === "TWO" ? rawCorrect.slice(0, 2) : rawCorrect.slice(0, 1)).filter(Boolean);
  const mcqImagesEnabled = cfg.mcqImagesEnabled ?? baseOptions.some((o) => trimText(o?.image));

  function emitOptions(nextOptions, nextCorrect = cor, extraConfig = {}) {
    onChange({ config: { ...cfg, mcqImagesEnabled, ...extraConfig, options: nextOptions, answerMode, mcqMode }, correct: nextCorrect });
  }

  function toggleMcqImages() {
    onChange({ config: { ...cfg, options: opts, answerMode, mcqMode, mcqImagesEnabled: !mcqImagesEnabled } });
  }

  function setMcqMode(nextMode) {
    const nextOptions = nextMode === "MODIFIED"
      ? [...opts, ...defaultMcqImageOptions()].slice(0, 4).map((opt) => ({ id: opt.id || newChoiceId(), text: "", image: opt.image || "" }))
      : (Array.isArray(cfg.options) && cfg.options.length ? cfg.options.map(normalizeChoiceOption) : defaultMcqOptions(category));
    const kept = correctChoices.filter((choice) => nextOptions.some((row) => choiceMatchesValue(row, choice) && (nextMode !== "MODIFIED" || trimText(row.image))));
    const nextCorrect = answerMode === "TWO"
      ? { ...cor, choice: kept[0] || "", choices: kept.slice(0, 2) }
      : { ...cor, choice: kept[0] || "", choices: kept[0] ? [kept[0]] : [] };
    onChange({ config: { ...cfg, mcqMode: nextMode, options: nextOptions, answerMode }, correct: nextCorrect, points: clampQuestionPoints(q.points, 3) });
  }

  function setAnswerMode(nextMode) {
    const nextCorrect = nextMode === "TWO"
      ? { ...cor, choices: correctChoices.slice(0, 2), choice: correctChoices[0] || "" }
      : { ...cor, choice: correctChoices[0] || "", choices: correctChoices[0] ? [correctChoices[0]] : [] };
    onChange({ config: { ...cfg, options: opts, answerMode: nextMode, mcqMode }, correct: nextCorrect, points: clampQuestionPoints(q.points, 3) });
  }

  function toggleCorrect(opt) {
    const value = opt.id;
    const canSelect = mcqMode === "MODIFIED" ? !!trimText(opt?.image) : choiceHasContent(opt);
    if (!canSelect) return;
    if (answerMode === "ONE") {
      onChange({ correct: { ...cor, choice: value, choices: [value] } });
      return;
    }
    const exists = correctChoices.some((choice) => choiceMatchesValue(opt, choice));
    const nextChoices = exists ? correctChoices.filter((choice) => !choiceMatchesValue(opt, choice)) : [...correctChoices, value].slice(0, 2);
    onChange({ correct: { ...cor, choice: nextChoices[0] || "", choices: nextChoices } });
  }

  function reorderOption(from, to, mode = "before") {
    if (from === null || from === undefined || to === null || to === undefined || mcqMode === "MODIFIED") return;
    if (from === to) return;
    const next = [...opts];
    const [moved] = next.splice(from, 1);
    let insertAt = to + (mode === "after" ? 1 : 0);
    if (from < insertAt) insertAt -= 1;
    insertAt = Math.max(0, Math.min(next.length, insertAt));
    next.splice(insertAt, 0, moved);
    emitOptions(next);
  }

  function updateImage(index, value) {
    const next = opts.map((row, idx) => (idx === index ? { ...row, image: value, text: mcqMode === "MODIFIED" ? "" : row.text } : row));
    const kept = correctChoices.filter((choice) => next.some((row) => choiceMatchesValue(row, choice) && (mcqMode !== "MODIFIED" || trimText(row.image))));
    emitOptions(next, { ...cor, choice: kept[0] || "", choices: kept });
  }

  function updateRecording(index, value) {
    const recordings = Array.isArray(cfg.voiceAnswers) ? [...cfg.voiceAnswers] : [];
    recordings[index] = value;
    onChange({ config: { ...cfg, options: opts, voiceAnswers: recordings, answerMode, mcqMode } });
  }

  const mcqModeButtons = (
    <>
      <button type="button" className={`tw-builder-press tw-builder-mini-white${mcqMode === "NORMAL" ? " is-selected" : ""}`} style={{ ...ui.secondaryBtn, padding: "4px 10px", fontSize: 12 }} onClick={() => setMcqMode("NORMAL")}>Normal</button>
      <button data-tutorial="builder-mcq-modified" type="button" className={`tw-builder-press tw-builder-mini-white${mcqMode === "MODIFIED" ? " is-selected" : ""}`} style={{ ...ui.secondaryBtn, padding: "4px 10px", fontSize: 12 }} onClick={() => { window.dispatchEvent(new CustomEvent("thinkwave:tutorial-event", { detail: { type: "mcq-modified" } })); setMcqMode("MODIFIED"); }}>Modified</button>
      <button type="button" className={`tw-builder-press tw-builder-mini-white${answerMode === "ONE" ? " is-selected" : ""}`} style={{ ...ui.secondaryBtn, padding: "4px 10px", fontSize: 12 }} onClick={() => setAnswerMode("ONE")}>1 answer</button>
      <button type="button" className={`tw-builder-press tw-builder-mini-white${answerMode === "TWO" ? " is-selected" : ""}`} style={{ ...ui.secondaryBtn, padding: "4px 10px", fontSize: 12 }} onClick={() => setAnswerMode("TWO")}>2 answers</button>
      {mcqMode === "NORMAL" && <button type="button" className={`tw-builder-press tw-builder-mini-white${mcqImagesEnabled ? " is-selected" : ""}`} style={{ ...ui.secondaryBtn, padding: "4px 10px", fontSize: 12 }} onClick={toggleMcqImages} title="Toggle choice image upload">＋ Image</button>}
    </>
  );
  const mcqChoiceStepButtons = mcqMode === "NORMAL" ? (
    <>
      <button type="button" className="tw-builder-press tw-builder-mini-white" title="Delete choice" aria-label="Delete choice" style={{ ...ui.secondaryBtn, padding: "4px 11px", fontSize: 16 }} disabled={opts.length <= MIN} onClick={() => {
        const next = opts.slice(0, -1);
        const kept = correctChoices.filter((choice) => next.some((row) => choiceMatchesValue(row, choice)));
        emitOptions(next, { ...cor, choice: kept[0] || "", choices: kept });
      }}>−</button>
      <button type="button" className="tw-builder-press tw-builder-mini-white" title="Add choice" aria-label="Add choice" style={{ ...ui.secondaryBtn, padding: "4px 11px", fontSize: 16 }} onClick={() => {
        if (opts.length >= MAX) { setShowMatchingSuggest(true); return; }
        emitOptions([...opts, { id: newChoiceId(), text: "", image: "" }]);
      }}>＋</button>
    </>
  ) : null;
  return (
    <div data-tutorial="builder-mcq-section" style={ui.innerCard} className={isMobile ? "tw-mcq-mobile" : undefined}>
      <div className="flex justify-between items-center gap-3 flex-wrap" style={{ marginBottom: isMobile ? 8 : 12 }}>
        <h4 style={{ ...ui.innerTitle, margin: 0 }}>
          Multiple Choice {!isMobile && <span style={ui.innerMeta}>({mcqMode === "MODIFIED" ? "4 image choices" : `${opts.length}, min ${MIN}/max ${MAX}`})</span>}
        </h4>
        {isMobile ? (
          <button type="button" className="tw-mcq-menu-toggle" aria-label={mcqMenuOpen ? "Close answer options" : "Open answer options"} aria-expanded={mcqMenuOpen} onClick={() => setMcqMenuOpen((v) => !v)}>{mcqMenuOpen ? "✕" : "☰"}</button>
        ) : (
        <div className="tw-mcq-control-stack" data-tutorial="builder-mcq-controls">
          <div className="tw-mcq-control-row">
            {mcqModeButtons}
          </div>
        </div>
        )}
      </div>
      {isMobile && mcqMenuOpen && (
        <div className="tw-mcq-mobile-menu" data-tutorial="builder-mcq-controls">
          <div className="tw-mcq-control-row">
            {mcqModeButtons}
          </div>
        </div>
      )}
      {mcqMode === "MODIFIED" && (
        <div className="text-[12px] mb-3" style={{ color: c.textMuted }}>
          Click the small circle to set it as the correct answer.
        </div>
      )}
      <div className="tw-mcq-choice-step-row">
        <span className="tw-mcq-choice-step-spacer" />
        <div className="tw-mcq-control-row is-secondary">
          {mcqChoiceStepButtons}
        </div>
      </div>

      <div data-tutorial="builder-mcq-options" data-tutorial-correct="true" data-tutorial-modified-grid={mcqMode === "MODIFIED" ? "true" : undefined} className={mcqMode === "MODIFIED" ? "tw-mcq-modified-grid" : "tw-mcq-normal-list"}>
        {opts.map((opt, i) => {
          const hasContent = mcqMode === "MODIFIED" ? !!trimText(opt.image) : choiceHasContent(opt);
          const isCorrect = correctChoices.some((choice) => choiceMatchesValue(opt, choice)) && hasContent;
          const letter = String.fromCharCode(65 + i);
          if (mcqMode === "MODIFIED") {
            return <div key={opt.id || i} className={`tw-mcq-image-choice${isCorrect ? " is-correct" : ""}`} style={{ borderColor: isCorrect ? c.accent : c.border, background: isCorrect ? `${c.accent}12` : c.cardBg }}>
              <button type="button" className="tw-mcq-correct-dot tw-mcq-image-correct-letter" title={`Mark choice ${letter} as correct`} onClick={() => toggleCorrect(opt)} disabled={!hasContent} style={{ borderColor: isCorrect ? c.accent : c.textMuted, background: isCorrect ? c.accent : c.cardBg, color: isCorrect ? "#fff" : c.text }}>{isCorrect ? <TwIcon name="check" size={15} /> : letter}</button>
              <ImageUploadTile value={opt.image} label={`Upload image ${letter}`} onChange={(value) => updateImage(i, value)} c={c} accent={ui.templateAccent} />
              {cfg.voiceRecord && <div className="tw-builder-choice-record"><span>Choice {letter} recording</span><VoiceRecorderButton value={(Array.isArray(cfg.voiceAnswers) ? cfg.voiceAnswers : [])[i] || ""} onChange={(value) => updateRecording(i, value)} /></div>}
            </div>;
          }
          return <div
            key={opt.id || i}
            data-mcq-index={i}
            className={`tw-mcq-normal-choice${isCorrect ? " is-correct" : ""}${mcqDragIndex === i ? " is-drag-source is-touch-dragging" : ""}${mcqDragOver === i && mcqDragIndex !== i ? " is-drag-over" : ""}`}
            draggable={mcqMode !== "MODIFIED"}
            onDragStart={(e) => {
              if (mcqDragArmedRef.current !== i) { e.preventDefault(); return; }
              setMcqDragIndex(i);
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", String(i));
              const source = e.currentTarget;
              const clone = source.cloneNode(true);
              clone.style.position = "fixed";
              clone.style.left = "-10000px";
              clone.style.top = "-10000px";
              clone.style.width = `${source.getBoundingClientRect().width}px`;
              clone.style.opacity = "1";
              clone.classList.remove("is-drag-source");
              document.body.appendChild(clone);
              e.dataTransfer.setDragImage(clone, Math.max(20, source.getBoundingClientRect().width - 24), Math.max(18, source.getBoundingClientRect().height / 2));
              window.setTimeout(() => clone.remove(), 0);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (mcqDragIndex !== null && mcqDragIndex !== i) {
                const rect = e.currentTarget.getBoundingClientRect();
                setMcqDragOver(i);
                setMcqDropMode(e.clientY >= rect.top + rect.height / 2 ? "after" : "before");
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              const parsed = Number(e.dataTransfer.getData("text/plain"));
              const from = Number.isFinite(parsed) ? parsed : mcqDragIndex;
              reorderOption(from, i, mcqDropMode);
              setMcqDragIndex(null);
              setMcqDragOver(null);
              setMcqDropMode("before");
            }}
            onDragEnd={() => { mcqDragArmedRef.current = null; setMcqDragIndex(null); setMcqDragOver(null); setMcqDropMode("before"); }}
            onTouchMove={(e) => {
              if (!mcqTouchRef.current.active || mcqMode === "MODIFIED") return;
              const t = e.touches?.[0];
              if (!t) return;
              const el = document.elementFromPoint(t.clientX, t.clientY);
              const row = el?.closest?.("[data-mcq-index]");
              if (!row) return;
              const over = Number(row.getAttribute("data-mcq-index"));
              if (!Number.isFinite(over)) return;
              const rect = row.getBoundingClientRect();
              setMcqDragOver(over);
              setMcqDropMode(t.clientY >= rect.top + rect.height / 2 ? "after" : "before");
            }}
            onTouchEnd={() => {
              if (!mcqTouchRef.current.active) return;
              const from = mcqTouchRef.current.from;
              const to = mcqDragOver;
              mcqTouchRef.current = { active: false, from: null };
              mcqDragArmedRef.current = null;
              if (from !== null && to !== null && from !== to) reorderOption(from, to, mcqDropMode);
              setMcqDragIndex(null);
              setMcqDragOver(null);
              setMcqDropMode("before");
            }}
            style={{ borderColor: isCorrect ? c.accent : c.border, background: isCorrect ? `${c.accent}12` : c.cardBg, touchAction: "pan-y" }}
          >
            <button type="button" className={`tw-mcq-correct-dot tw-mcq-letter-selector${answerMode === "TWO" ? " is-two-answer" : ""}`} title={`Mark choice ${letter} as correct`} onClick={() => toggleCorrect(opt)} disabled={!hasContent} style={{ borderRadius: answerMode === "TWO" ? 8 : "50%", transition: "border-radius .28s cubic-bezier(.22,1,.36,1), transform .24s ease, background .22s ease, border-color .22s ease", borderColor: isCorrect ? c.accent : c.textMuted, background: isCorrect ? c.accent : "transparent", color: isCorrect ? "#fff" : c.text }}>{isCorrect ? <TwIcon name="check" size={16} /> : letter}</button>
            <div className="tw-mcq-normal-content">
              <input maxLength={255} value={opt.text} placeholder={`Option ${letter} text`} onChange={(e) => emitOptions(opts.map((row, idx) => (idx === i ? { ...row, text: e.target.value } : row)))} className="m-0" style={ui.input} />
              {(mcqImagesEnabled || cfg.voiceRecord) && <div className="tw-mcq-option-media-row">
                {mcqImagesEnabled && <ImageUploadTile compact value={opt.image} label={`Upload option ${letter} image`} onChange={(value) => updateImage(i, value)} c={c} accent={ui.templateAccent} />}
                {cfg.voiceRecord && <div className="tw-builder-choice-record"><span>Choice {letter} recording</span><VoiceRecorderButton value={(Array.isArray(cfg.voiceAnswers) ? cfg.voiceAnswers : [])[i] || ""} onChange={(value) => updateRecording(i, value)} /></div>}
              </div>}
            </div>
            <button
              type="button"
              className="tw-mcq-choice-drag-handle"
              title={`Drag choice ${letter}`}
              aria-label={`Drag choice ${letter}`}
              onPointerDown={() => { mcqDragArmedRef.current = i; }}
              onPointerUp={() => { if (mcqDragIndex === null) mcqDragArmedRef.current = null; }}
              onMouseDown={() => { mcqDragArmedRef.current = i; }}
              onTouchStart={() => { if (mcqMode !== "MODIFIED") { mcqDragArmedRef.current = i; mcqTouchRef.current = { active: true, from: i }; setMcqDragIndex(i); setMcqDragOver(i); } }}
              onTouchEnd={() => {
                if (!mcqTouchRef.current.active) return;
                const from = mcqTouchRef.current.from;
                const to = mcqDragOver;
                mcqTouchRef.current = { active: false, from: null };
                mcqDragArmedRef.current = null;
                if (from !== null && to !== null && from !== to) reorderOption(from, to, mcqDropMode);
                setMcqDragIndex(null);
                setMcqDragOver(null);
                setMcqDropMode("before");
              }}
            >☰</button>
          </div>;
        })}
      </div>

      {answerMode === "TWO" && <div className="mt-[14px] text-[12px]" style={{ color: c.textMuted }}>Two-answer mode gives 50% of the question points for each correct selected answer.</div>}
      {correctChoices.length > 0 && <CorrectAnswerExplanation value={cfg.explanation || ""} onChange={(explanation) => onChange({ config: { ...cfg, options: opts, answerMode, mcqMode, explanation } })} ui={ui} c={c} />}

      {showMatchingSuggest && <ActionDialog tone="blue" icon="matching" plainIcon title="Too many choices?" message={<><p className="m-0 mb-3">MCQ is capped at <strong style={{ color: c.text }}>5 choices</strong>. If you need more options, the <strong style={{ color: c.accent }}>Matching</strong> template is a better fit.</p><div className="rounded-[14px] px-[14px] py-3 text-[13px] leading-[1.6]" style={{ background: c.cardBg2, border: `1px solid ${c.border}` }}>Converting will <strong style={{ color: c.text }}>reset this question&apos;s choices and correct answer</strong>. Your question text will be kept.</div></>} onClose={() => setShowMatchingSuggest(false)} width="min(100%, 440px)" actions={<div className="flex flex-col gap-[10px] w-full"><button type="button" className="tw-builder-press tw-builder-press-blue w-full px-4 py-[13px]" style={{ ...primaryBtn({ bg: c.accent, fg: "#fff", border: c.accent }), boxShadow: `0 12px 26px ${c.accent}38` }} onClick={() => { setShowMatchingSuggest(false); onChange({ config: { colA: [{ text: "", image: "" }], colB: [{ text: "", image: "" }], dummyB: [] }, correct: { pairs: [{ aIndex: 0, bIndex: 0 }] }, _convertToMatching: true }); }}>Yes, convert to Matching</button><button type="button" className="tw-builder-press tw-builder-press-neutral w-full" style={{ ...ui.secondaryBtn, padding: "13px 16px", fontSize: 14, fontWeight: 800 }} onClick={() => setShowMatchingSuggest(false)}>Keep MCQ</button></div>} />}
    </div>
  );
}
