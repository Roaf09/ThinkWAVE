import React, { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../lib/api";
import ActionDialog, { primaryBtn } from "../../../components/ActionDialog";
import { TwIcon } from "../../../components/TwUI";
import { buildThinkSpellGrid, buildThinkSpellSeed, buildThinkSpellSignature } from "../../../templates/thinkspell/thinkSpell";
import { VoiceRecorderButton } from "../../../components/AudioControls";
import { templateTone } from "../../../lib/templatePalette";
import { normalizeTemplateType } from "../../../lib/templateTypes";
import {
  choiceDisplay,
  clampQuestionPoints,
  compressImageFile,
  choiceHasContent,
  choiceMatchesValue,
  defaultMcqImageOptions,
  defaultMcqOptions,
  hasDuplicateRows,
  hasDuplicateTextValues,
  newChoiceId,
  normalizeChoiceOption,
  normalizeChoiceOptions,
  normalizeMatchingPayload,
  reorderList,
  trimText,
} from "./quizBuilderUtils";

export function BuilderModal({ title, message, onClose, actions, ui, c, autoDismiss = false, tone = "blue", icon }) {
  return (
    <ActionDialog
      tone={tone}
      icon={icon}
      title={title}
      message={message}
      onClose={onClose}
      actions={actions}
      autoDismiss={autoDismiss}
      closeOnBackdrop={!autoDismiss}
      width="min(100%, 560px)"
      plainIcon
    />
  );
}

export function BankModal({ templateType, onSelect, onClose, ui, c }) {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/question-bank")
      .then(({ data }) => setQuestions((data || []).filter((q) => q.template_type === templateType)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [templateType]);

  return (
    <div style={ui.modalWrap} onClick={onClose}>
      <section className="tw-builder-bank-dialog" style={{ ...ui.modalCard, maxWidth: 620, maxHeight: "82vh", overflowY: "auto", textAlign: "left" }} onClick={(e) => e.stopPropagation()}>
        <div className="tw-builder-dialog-icon tw-builder-dialog-icon-plain" style={{ color: c.text, background: "transparent", borderColor: "transparent" }}><TwIcon name="bank" size={44} /></div>
        <h3 style={{ margin: "14px 0 4px", color: c.text, fontSize: 24 }}>Add from Question Bank</h3>
        <p style={{ fontSize: 13, color: c.textMuted, margin: "0 0 18px" }}>Choose a saved {templateType} question to add to this quiz.</p>
        {loading && <p style={{ color: c.textMuted }}>Loading…</p>}
        {!loading && questions.length === 0 && <p style={{ color: c.textMuted }}>No saved questions for this template.</p>}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {questions.map((q) => (
            <button type="button" key={q.id} className="tw-builder-bank-row tw-builder-bank-choice-press" style={{ background: c.cardBg2, borderColor: ui.templateBorder || c.border, color: c.text, "--tw-bank-accent": ui.templateAccent || c.accent, "--tw-bank-soft": ui.templateSoftBg || c.cardBg2 }} onClick={() => onSelect(q)}>
              <span style={{ ...ui.badge, background: c.pageBg, color: c.text }}>{q.template_type}</span>
              <strong>{q.prompt || "Untitled question"}</strong>
            </button>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}><button type="button" className="tw-teacher-text-cancel" onClick={onClose}>Cancel</button></div>
      </section>
    </div>
  );
}

/**
 * ThinkSpellEditor — isolated sub-component so useState for rawText is
 * scoped here.  Parent passes `key={q.order}` so this unmounts/remounts
 * (resetting rawText) whenever the teacher navigates to a different question.
 *
 * Fix: previously the textarea had value={answersText} where answersText was
 * derived by immediately parsing cor.answers.  Every keystroke triggered a
 * re-parse that stripped any trailing comma+space, making it impossible to
 * type more than the first answer word.  Now rawText is the local source of
 * truth while the user is typing; only the parsed array is sent upstream.
 */
export function ThinkSpellEditor({ cor, cfg, onChange, ui, c, maxWords = null }) {
  const initialAnswers = Array.isArray(cor.answers) && cor.answers.length
    ? cor.answers
    : Array.isArray(cfg.answers) && cfg.answers.length
      ? cfg.answers
      : [cor.text].filter(Boolean);
  const fieldLimit = Math.max(4, Math.min(8, Number(maxWords || 8)));
  const [wordFields, setWordFields] = useState(() => {
    const seeded = initialAnswers.slice(0, fieldLimit);
    while (seeded.length < 4) seeded.push("");
    return seeded;
  });
  const allAnswers = wordFields.map((word) => trimText(word)).filter(Boolean);
  const answers = allAnswers.slice(0, fieldLimit);
  const normalized = answers.map((word) => word.toUpperCase().replace(/[^A-Z]/g, "")).filter(Boolean);
  const longest = normalized.length ? Math.max(...normalized.map((word) => word.length)) : 5;
  const shortest = normalized.length ? Math.min(...normalized.map((word) => word.length)) : 5;
  const minGrid = Math.min(12, Math.max(5, longest, shortest));
  const maxGrid = Math.min(12, Math.max(minGrid, longest + 3));
  const gridSize = Math.min(maxGrid, Math.max(minGrid, Number(cfg.gridSize || minGrid)));
  const gridSeed = Number(cfg.gridSeed || 1);
  const canFill = normalized.length >= 4 && gridSize >= longest;
  const [isArranging, setIsArranging] = useState(false);
  const [arrangingGrid, setArrangingGrid] = useState([]);
  const [arrangingGridSize, setArrangingGridSize] = useState(gridSize);
  const [arrangeDots, setArrangeDots] = useState(1);
  const arrangeTimerRef = useRef(null);
  const savedGridKey = Array.isArray(cfg.grid) ? cfg.grid.join("") : "";
  const preview = useMemo(() => {
    if (!cfg.gridFilled || !canFill) return { grid: new Array(gridSize * gridSize).fill(""), gridSize };
    if (Array.isArray(cfg.grid) && cfg.grid.length === gridSize * gridSize) {
      return { grid: cfg.grid.map((letter) => String(letter || "").toUpperCase()), gridSize };
    }
    const signature = `${buildThinkSpellSignature({ questionId: 0, gridSize, words: normalized })}-${gridSeed}`;
    return buildThinkSpellGrid({ gridSize, words: normalized, seed: buildThinkSpellSeed(signature) });
  }, [cfg.gridFilled, canFill, gridSize, gridSeed, savedGridKey, normalized.join("|")]);
  const visiblePreview = isArranging
    ? { grid: arrangingGrid, gridSize: arrangingGridSize }
    : preview;

  useEffect(() => () => {
    if (arrangeTimerRef.current) window.clearInterval(arrangeTimerRef.current);
  }, []);

  useEffect(() => {
    if (!isArranging) return undefined;
    const timer = window.setInterval(() => setArrangeDots((value) => (value % 3) + 1), 320);
    return () => window.clearInterval(timer);
  }, [isArranging]);

  function commitWords(nextFields) {
    const bounded = nextFields.slice(0, fieldLimit);
    const parsed = bounded.map((word) => trimText(word)).filter(Boolean);
    const clean = parsed.map((word) => word.toUpperCase().replace(/[^A-Z]/g, "")).filter(Boolean);
    const nextLongest = clean.length ? Math.max(...clean.map((word) => word.length)) : 5;
    const nextMin = Math.min(12, Math.max(5, nextLongest));
    const nextMax = Math.min(12, Math.max(nextMin, nextLongest + 3));
    const nextSize = Math.min(nextMax, Math.max(nextMin, Number(cfg.gridSize || nextMin)));
    onChange({
      correct: { ...cor, answers: parsed, text: parsed[0] || "" },
      config: { ...cfg, answers: parsed, gridSize: nextSize, grid: [], gridFilled: false, minWordLength: 3, pointsPerWord: 1, lengthBonusPerLetter: 0 },
    });
  }

  function updateWord(index, value) {
    const next = wordFields.map((word, i) => (i === index ? value.slice(0, 255) : word));
    setWordFields(next);
    commitWords(next);
  }

  function addWordField() {
    if (wordFields.length >= fieldLimit) return;
    setWordFields((current) => [...current, ""]);
  }

  function removeWordField() {
    if (wordFields.length <= 4) return;
    const removed = wordFields[wordFields.length - 1];
    const next = wordFields.slice(0, -1);
    setWordFields(next);
    if (trimText(removed)) commitWords(next);
  }

  function setGridSize(value) {
    const next = Math.min(maxGrid, Math.max(minGrid, Number(value) || minGrid));
    onChange({ config: { ...cfg, answers, gridSize: next, grid: [], gridFilled: false, minWordLength: 3, pointsPerWord: 1, lengthBonusPerLetter: 0 } });
  }

  function buildSavedGrid(seedValue) {
    const signature = `${buildThinkSpellSignature({ questionId: 0, gridSize, words: normalized })}-${seedValue}`;
    return buildThinkSpellGrid({ gridSize, words: normalized, seed: buildThinkSpellSeed(signature) });
  }

  function fillGrid() {
    if (!canFill || isArranging || cfg.gridFilled) return;
    const seedValue = gridSeed || 1;
    const filled = buildSavedGrid(seedValue);
    const blank = new Array(filled.grid.length).fill("");
    setArrangingGridSize(filled.gridSize);
    setArrangingGrid(blank);
    setIsArranging(true);
    setArrangeDots(1);
    window.dispatchEvent(new CustomEvent("thinkwave:tutorial-event", { detail: { type: "crossword-arranging" } }));

    let shown = 0;
    const stepMs = Math.max(34, Math.ceil(5000 / Math.max(1, filled.grid.length)));
    if (arrangeTimerRef.current) window.clearInterval(arrangeTimerRef.current);
    arrangeTimerRef.current = window.setInterval(() => {
      shown += 1;
      setArrangingGrid(filled.grid.map((letter, index) => (index < shown ? letter : "")));
      if (shown >= filled.grid.length) {
        window.clearInterval(arrangeTimerRef.current);
        arrangeTimerRef.current = null;
        window.setTimeout(() => {
          onChange({ config: { ...cfg, answers, gridSize: filled.gridSize, grid: filled.grid, gridFilled: true, gridSeed: seedValue, minWordLength: 3, pointsPerWord: 1, lengthBonusPerLetter: 0 } });
          setIsArranging(false);
        }, 220);
      }
    }, stepMs);
  }

  function shuffleGrid() {
    if (!canFill || !cfg.gridFilled) return;
    const seedValue = gridSeed + 1;
    const shuffled = buildSavedGrid(seedValue);
    onChange({ config: { ...cfg, answers, gridSize: shuffled.gridSize, grid: shuffled.grid, gridFilled: true, gridSeed: seedValue, minWordLength: 3, pointsPerWord: 1, lengthBonusPerLetter: 0 } });
  }

  return (
    <div style={{ ...ui.innerCard, display: "grid", gridTemplateColumns: "minmax(260px,.85fr) minmax(300px,1.15fr)", gap: 18, alignItems: "start" }}>
      <div style={{ display: "grid", gap: 12 }}>
        <div data-tutorial="builder-crossword-word-editor">
          <div className="tw-crossword-word-head">
            <label style={ui.smallLabel}>Valid or correct words</label>
            <div className="tw-crossword-word-actions">
              <button type="button" className="tw-builder-press tw-builder-press-neutral" onClick={removeWordField} disabled={wordFields.length <= 4} aria-label="Remove word field">−</button>
              <button type="button" className="tw-builder-press tw-builder-press-blue" onClick={addWordField} disabled={wordFields.length >= fieldLimit} aria-label="Add word field">＋</button>
            </div>
          </div>
          <div data-tutorial="builder-crossword-words" className="tw-crossword-word-grid">
            {wordFields.map((word, index) => (
              <input
                key={index}
                maxLength={255}
                value={word}
                placeholder={`Word ${index + 1}`}
                onChange={(event) => updateWord(index, event.target.value)}
                style={ui.input}
              />
            ))}
          </div>
          {maxWords && <div style={{ color: c.textMuted, fontSize: 11, marginTop: 6 }}>Upgrade plan to support more words per batch!</div>}
        </div>
        <button type="button" style={ui.toggleCard(cfg.showWordList !== false)} onClick={() => onChange({ config: { ...cfg, answers, showWordList: cfg.showWordList === false } })}>
          <div><div style={ui.toggleTitle}>Show valid words during gameplay</div><div style={ui.toggleHint}>{cfg.showWordList === false ? "Higher-order mode: learners discover which words to find." : "Lower-order mode: learners can see the word goals."}</div></div>
          <span style={ui.switchTrack(cfg.showWordList !== false)}><span style={ui.switchThumb(cfg.showWordList !== false)} /></span>
        </button>
        <div>
          <label style={ui.smallLabel}>Grid size</label>
          <select value={gridSize} onChange={(e) => setGridSize(e.target.value)} style={{ ...ui.select, display: "block", width: "100%", marginTop: 7 }} disabled={!normalized.length}>
            {Array.from({ length: Math.max(1, maxGrid - minGrid + 1) }, (_, i) => minGrid + i).map((size) => <option key={size} value={size}>{size} × {size}</option>)}
          </select>
          <div style={{ color: c.textMuted, fontSize: 11, marginTop: 6 }}>Available size is based on the longest valid word, up to three additional rows and columns.</div>
        </div>
        <button
          data-tutorial="builder-crossword-fill"
          type="button"
          className={`tw-builder-press tw-builder-press-blue${cfg.gridFilled ? " is-filled" : ""}`}
          onClick={fillGrid}
          disabled={!canFill || isArranging || cfg.gridFilled}
          style={{ ...ui.primaryBtn, opacity: canFill ? 1 : .5, cursor: canFill && !isArranging && !cfg.gridFilled ? "pointer" : "not-allowed" }}
        >
          {isArranging ? <>Arranging<span className="tw-arranging-dots">{".".repeat(arrangeDots)}</span></> : cfg.gridFilled ? "Filled Up" : "Fill It Up!"}
        </button>
        <button data-tutorial="builder-crossword-shuffle" type="button" className="tw-builder-press tw-builder-press-neutral" onClick={shuffleGrid} disabled={!canFill || !cfg.gridFilled || isArranging} style={{ ...ui.secondaryBtn, opacity: canFill && cfg.gridFilled && !isArranging ? 1 : .5, cursor: canFill && cfg.gridFilled && !isArranging ? "pointer" : "not-allowed" }}>Shuffle</button>
      </div>
      <div style={{ minHeight: 330, display: "grid", placeItems: "center", padding: 14, borderRadius: 18, border: `1.5px solid ${ui.templateBorder || c.border}`, background: c.cardBg }}>
        <div key={`${gridSize}-${gridSeed}-${cfg.gridFilled}-${isArranging}`} style={{ width: "min(100%, 430px)", display: "grid", gridTemplateColumns: `repeat(${visiblePreview.gridSize}, minmax(0,1fr))`, gap: visiblePreview.gridSize > 9 ? 3 : 5, animation: "twGridFill 320ms ease" }}>
          {visiblePreview.grid.map((letter, index) => <div className="tw-crossword-grid-cell" key={index} style={{ aspectRatio: "1", display: "grid", placeItems: "center", borderRadius: visiblePreview.gridSize > 9 ? 6 : 9, border: `1px solid ${c.border}`, background: letter ? c.cardBg2 : "transparent", color: c.accent, fontWeight: 900, fontSize: visiblePreview.gridSize > 9 ? 11 : 15, transition: "transform .24s ease, background .24s ease, opacity .24s ease", animation: letter ? "twTilePop 240ms ease both" : "none" }}>{letter}</div>)}
        </div>
      </div>
    </div>
  );
}

export function MediaInput({ label, value, placeholder, onChange, ui, c }) {
  async function handleFile(file) {
    if (!file || !/^image\//.test(file.type || "")) return;
    const optimized = await compressImageFile(file);
    if (optimized) onChange(optimized);
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {label ? <label style={ui.smallLabel}>{label}</label> : null}
      <div style={{ display: "grid", gridTemplateColumns: value ? "104px 1fr" : "1fr", gap: 10, alignItems: "stretch" }}>
        {value ? (
          <div style={{ position: "relative", minHeight: 82, borderRadius: 12, overflow: "hidden", border: `1px solid ${c.border}`, background: c.cardBg2 }}>
            <img src={value} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            <button
              type="button"
              onClick={() => onChange("")}
              style={{ position: "absolute", top: 6, right: 6, width: 24, height: 24, borderRadius: 999, border: "none", background: "rgba(15,23,42,0.78)", color: "#fff", fontWeight: 900, cursor: "pointer" }}
            >
              x
            </button>
          </div>
        ) : null}
        <div style={{ display: "grid", gap: 8 }}>
          <input
            maxLength={6000}
            value={value || ""}
            placeholder={placeholder || "Image URL or uploaded image"}
            onChange={(e) => onChange(e.target.value)}
            style={ui.input}
          />
          <label
            style={{
              ...ui.secondaryBtn,
              textAlign: "center",
              padding: "9px 12px",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Upload image
            <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handleFile(e.target.files?.[0])} />
          </label>
        </div>
      </div>
    </div>
  );
}


export function ImageUploadTile({ value, label = "Upload image", onChange, c, accent = "#2b6cff", compact = false }) {
  async function handleFile(file) {
    if (!file || !/^image\//.test(file.type || "")) return;
    const optimized = await compressImageFile(file);
    if (optimized) onChange(optimized);
  }
  return (
    <div className={`tw-builder-image-tile${compact ? " is-compact" : ""}`} style={{ borderColor: `${accent}99`, background: value ? c.cardBg : `${accent}0e` }}>
      <label title={value ? "Click to replace image" : label}>
        {value ? <img src={value} alt="" /> : <span><b>＋</b><small>{label}</small></span>}
        <input type="file" accept="image/*" hidden onChange={(event) => { handleFile(event.target.files?.[0]); event.target.value = ""; }} />
      </label>
      {value && <button type="button" className="tw-builder-image-remove" onClick={() => onChange("")} aria-label="Remove image">×</button>}
    </div>
  );
}

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

function CorrectAnswerExplanation({ value, onChange, ui, c }) {
  return <div className="tw-correct-answer-explanation" style={{ marginTop: 14, padding: 14, borderRadius: 14, border: `2px solid ${c.accent}55`, background: `${c.accent}0c` }}>
    <label style={{ ...ui.smallLabel, display: "block", marginBottom: 7, color: c.text }}>Why is this the correct answer?</label>
    <textarea data-tutorial="builder-answer-explanation" required maxLength={1000} rows={3} value={value || ""} onChange={(event) => onChange(event.target.value.slice(0, 1000))} placeholder="Explain why this answer is correct." style={{ ...ui.input, minHeight: 82, resize: "vertical", lineHeight: 1.5 }} />
  </div>;
}

export function TemplateEditor({ templateType, category, q, onChange, ui, c, isBasic = false }) {
  const [showMatchingSuggest, setShowMatchingSuggest] = useState(false);
  const [matchingPairIndex, setMatchingPairIndex] = useState(0);
  const [matchingDirection, setMatchingDirection] = useState("next");
  const [matchingImagesEnabled, setMatchingImagesEnabled] = useState(false);
  const [identificationBlurred, setIdentificationBlurred] = useState(false);
  const [guessAnswerBlurred, setGuessAnswerBlurred] = useState(false);
  const [mcqDragIndex, setMcqDragIndex] = useState(null);
  const [mcqDragOver, setMcqDragOver] = useState(null);
  const [mcqDropMode, setMcqDropMode] = useState("before");
  const mcqDragArmedRef = useRef(null);
  const tt = normalizeTemplateType(templateType);
  const cfg = q.config || {};
  const cor = q.correct || {};

  useEffect(() => {
    setIdentificationBlurred(Boolean(trimText(cfg.explanation)));
    setGuessAnswerBlurred(Boolean(trimText(cfg.explanation)));
  }, [q.order, tt]);

  useEffect(() => {
    if (tt !== "MATCHING") return;
    const count = Math.max(1, Array.isArray(cfg.colA) ? cfg.colA.length : 1);
    setMatchingPairIndex((current) => Math.min(current, count - 1));
    const hasExistingImages = [...(Array.isArray(cfg.colA) ? cfg.colA : []), ...(Array.isArray(cfg.colB) ? cfg.colB : [])]
      .some((item) => trimText(item?.image));
    setMatchingImagesEnabled(Boolean(cfg.matchingImagesEnabled || hasExistingImages));
  }, [tt, q.order, cfg.matchingImagesEnabled, Array.isArray(cfg.colA) ? cfg.colA.length : 0, Array.isArray(cfg.colB) ? cfg.colB.length : 0]);

  if (tt === "MCQ") {
    const mcqMode = isBasic ? "NORMAL" : (cfg.mcqMode === "MODIFIED" ? "MODIFIED" : "NORMAL");
    const baseOptions = normalizeChoiceOptions(cfg.options, category);
    const opts = mcqMode === "MODIFIED"
      ? [...baseOptions, ...defaultMcqImageOptions()].slice(0, 4).map((opt, index) => ({ ...opt, id: opt.id || `image-option-${index + 1}`, text: "" }))
      : baseOptions;
    const MIN = mcqMode === "MODIFIED" ? 4 : 3;
    const MAX = mcqMode === "MODIFIED" ? 4 : (isBasic ? 4 : 5);
    const answerMode = cfg.answerMode === "TWO" ? "TWO" : "ONE";
    const rawCorrect = Array.isArray(cor.choices) && cor.choices.length ? cor.choices : [cor.choice].filter(Boolean);
    const correctChoices = (answerMode === "TWO" ? rawCorrect.slice(0, 2) : rawCorrect.slice(0, 1)).filter(Boolean);

    function emitOptions(nextOptions, nextCorrect = cor, extraConfig = {}) {
      onChange({ config: { ...cfg, ...extraConfig, options: nextOptions, answerMode, mcqMode }, correct: nextCorrect });
    }

    function setMcqMode(nextMode) {
      if (isBasic && nextMode === "MODIFIED") return;
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

    const selectedOpt = opts.find((opt) => correctChoices.some((choice) => choiceMatchesValue(opt, choice)));
    return (
      <div data-tutorial="builder-mcq-section" style={ui.innerCard}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 12, flexWrap: "wrap" }}>
          <h4 style={ui.innerTitle}>
            Multiple Choice <span style={ui.innerMeta}>({mcqMode === "MODIFIED" ? "4 image choices" : `${opts.length}, min ${MIN}/max ${MAX}`})</span>
          </h4>
          <div className="tw-mcq-control-stack" data-tutorial="builder-mcq-controls">
            <div className="tw-mcq-control-row">
              <button type="button" className={`tw-builder-press tw-builder-mini-white${mcqMode === "NORMAL" ? " is-selected" : ""}`} style={{ ...ui.secondaryBtn, padding: "4px 10px", fontSize: 12 }} onClick={() => setMcqMode("NORMAL")}>Normal</button>
              <button data-tutorial="builder-mcq-modified" type="button" className={`tw-builder-press tw-builder-mini-white${mcqMode === "MODIFIED" ? " is-selected" : ""}`} disabled={isBasic} title={isBasic ? "Institution plan feature" : ""} style={{ ...ui.secondaryBtn, padding: "4px 10px", fontSize: 12, opacity: isBasic ? .4 : 1, cursor: isBasic ? "not-allowed" : "pointer" }} onClick={() => { window.dispatchEvent(new CustomEvent("thinkwave:tutorial-event", { detail: { type: "mcq-modified" } })); setMcqMode("MODIFIED"); }}>Modified</button>
              <button type="button" className={`tw-builder-press tw-builder-mini-white${answerMode === "ONE" ? " is-selected" : ""}`} style={{ ...ui.secondaryBtn, padding: "4px 10px", fontSize: 12 }} onClick={() => setAnswerMode("ONE")}>1 answer</button>
              <button type="button" className={`tw-builder-press tw-builder-mini-white${answerMode === "TWO" ? " is-selected" : ""}`} style={{ ...ui.secondaryBtn, padding: "4px 10px", fontSize: 12 }} onClick={() => setAnswerMode("TWO")}>2 answers</button>
            </div>
            {mcqMode === "NORMAL" && <div className="tw-mcq-control-row is-secondary">
              <button type="button" className="tw-builder-press tw-builder-mini-white" title="Delete choice" aria-label="Delete choice" style={{ ...ui.secondaryBtn, padding: "4px 11px", fontSize: 16 }} disabled={opts.length <= MIN} onClick={() => {
                const next = opts.slice(0, -1);
                const kept = correctChoices.filter((choice) => next.some((row) => choiceMatchesValue(row, choice)));
                emitOptions(next, { ...cor, choice: kept[0] || "", choices: kept });
              }}>−</button>
              <button type="button" className="tw-builder-press tw-builder-mini-white" title="Add choice" aria-label="Add choice" style={{ ...ui.secondaryBtn, padding: "4px 11px", fontSize: 16 }} disabled={isBasic && opts.length >= MAX} onClick={() => {
                if (opts.length >= MAX) { if (!isBasic) setShowMatchingSuggest(true); return; }
                emitOptions([...opts, { id: newChoiceId(), text: "", image: "" }]);
              }}>＋</button>
            </div>}
          </div>
        </div>

        <div style={{ fontSize: 12, color: c.textMuted, marginBottom: 12 }}>
          {mcqMode === "MODIFIED"
            ? "Click the small circle to set it as the correct answer."
            : <>Drag choices to reorder. Mark {answerMode === "TWO" ? "exactly two" : "one"} correct answer{answerMode === "TWO" ? "s" : ""}.</>}
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
              className={`tw-mcq-normal-choice${isCorrect ? " is-correct" : ""}${mcqDragIndex === i ? " is-drag-source" : ""}${mcqDragOver === i ? " is-drag-over" : ""}`}
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
              style={{ borderColor: isCorrect ? c.accent : c.border, background: isCorrect ? `${c.accent}12` : c.cardBg }}
            >
              <button type="button" className={`tw-mcq-correct-dot tw-mcq-letter-selector${answerMode === "TWO" ? " is-two-answer" : ""}`} title={`Mark choice ${letter} as correct`} onClick={() => toggleCorrect(opt)} disabled={!hasContent} style={{ borderRadius: answerMode === "TWO" ? 8 : "50%", transition: "border-radius .28s cubic-bezier(.22,1,.36,1), transform .24s ease, background .22s ease, border-color .22s ease", borderColor: isCorrect ? c.accent : c.textMuted, background: isCorrect ? c.accent : "transparent", color: isCorrect ? "#fff" : c.text }}>{isCorrect ? <TwIcon name="check" size={16} /> : letter}</button>
              <div className="tw-mcq-normal-content">
                <input maxLength={255} value={opt.text} placeholder={`Option ${letter} text`} onChange={(e) => emitOptions(opts.map((row, idx) => (idx === i ? { ...row, text: e.target.value } : row)))} style={{ ...ui.input, margin: 0 }} />
                {(!isBasic || cfg.voiceRecord) && <div className="tw-mcq-option-media-row">
                  {!isBasic && <ImageUploadTile compact value={opt.image} label={`Upload option ${letter} image`} onChange={(value) => updateImage(i, value)} c={c} accent={ui.templateAccent} />}
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
              >☰</button>
            </div>;
          })}
        </div>

        {answerMode === "TWO" && <div style={{ marginTop: 14, color: c.textMuted, fontSize: 12 }}>Two-answer mode gives 50% of the question points for each correct selected answer.</div>}
        <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 12, background: selectedOpt ? `${c.accent}14` : c.cardBg2, border: `1px solid ${selectedOpt ? c.accent : c.border}`, fontSize: 13, color: selectedOpt ? c.accent : c.textMuted, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
          {selectedOpt ? <>✓ Correct answer{answerMode === "TWO" ? "s" : ""}: <span style={{ fontWeight: 900 }}>{correctChoices.map((choice) => choiceDisplay(opts.find((row) => choiceMatchesValue(row, choice)), "Selected choice")).join(" + ")}</span></> : <>○ No correct answer selected yet</>}
        </div>
        {selectedOpt && <CorrectAnswerExplanation value={cfg.explanation || ""} onChange={(explanation) => onChange({ config: { ...cfg, options: opts, answerMode, mcqMode, explanation } })} ui={ui} c={c} />}

        {showMatchingSuggest && <ActionDialog tone="blue" icon="matching" plainIcon title="Too many choices?" message={<><p style={{ margin: "0 0 12px" }}>MCQ is capped at <strong style={{ color: c.text }}>5 choices</strong>. If you need more options, the <strong style={{ color: c.accent }}>Matching</strong> template is a better fit.</p><div style={{ background: c.cardBg2, border: `1px solid ${c.border}`, borderRadius: 14, padding: "12px 14px", fontSize: 13, lineHeight: 1.6 }}>Converting will <strong style={{ color: c.text }}>reset this question&apos;s choices and correct answer</strong>. Your question text will be kept.</div></>} onClose={() => setShowMatchingSuggest(false)} width="min(100%, 440px)" actions={<div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}><button type="button" className="tw-builder-press tw-builder-press-blue" style={{ ...primaryBtn({ bg: c.accent, fg: "#fff", border: c.accent }), width: "100%", padding: "13px 16px", boxShadow: `0 12px 26px ${c.accent}38` }} onClick={() => { setShowMatchingSuggest(false); onChange({ config: { colA: [{ text: "", image: "" }], colB: [{ text: "", image: "" }], dummyB: [] }, correct: { pairs: [{ aIndex: 0, bIndex: 0 }] }, _convertToMatching: true }); }}>Yes, convert to Matching</button><button type="button" className="tw-builder-press tw-builder-press-neutral" style={{ ...ui.secondaryBtn, width: "100%", padding: "13px 16px", fontSize: 14, fontWeight: 800 }} onClick={() => setShowMatchingSuggest(false)}>Keep MCQ</button></div>} />}
      </div>
    );
  }

  if (tt === "TRUE_FALSE") {
    const selected = trimText(cor.choice).toLowerCase();
    return (
      <div style={ui.innerCard}>
        <h4 style={ui.innerTitle}>True / False</h4>
        <div data-tutorial="builder-tf-answers" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
          {["True", "False"].map((value) => {
            const active = selected === value.toLowerCase();
            return (
              <button
                key={value}
                type="button"
                className={`tw-builder-answer-choice ${active ? `is-${value.toLowerCase()}` : ""}`}
                onClick={() => onChange({ config: { ...cfg, options: ["True", "False"] }, correct: { ...cor, choice: value } })}
                style={{
                  borderRadius: 16,
                  padding: "18px 16px",
                  border: `2px solid ${active ? (value === "True" ? "#22c55e" : "#ef4444") : c.border}`,
                  background: active ? (value === "True" ? "rgba(34,197,94,.12)" : "rgba(239,68,68,.12)") : c.cardBg2,
                  color: active ? (value === "True" ? "#16a34a" : "#dc2626") : c.text,
                  fontWeight: 900,
                  fontSize: 16,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
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

  if (["TYPE_ANSWER", "DRAW_IT", "GRIP_GUESS"].includes(tt)) {
    return (
      <div style={ui.innerCard}>
        <h4 style={ui.innerTitle}>{tt === "TYPE_ANSWER" ? "Identification" : "Answer"}</h4>
        {/* Revision 1: Typed response is displayed as Identification per panel suggestion. */}
        <div data-tutorial="builder-identification-answer"><label style={{ ...ui.smallLabel, display: "block", marginBottom: 8 }}>Correct answer</label><input maxLength={255} value={cor.text ?? ""} placeholder="Enter the answer" onFocus={() => { if (!trimText(cfg.explanation)) setIdentificationBlurred(false); }} onBlur={() => { if (trimText(cor.text)) setIdentificationBlurred(true); }} onChange={(e) => onChange({ correct: { ...cor, text: e.target.value.slice(0, 255) }, config: { ...cfg, typoTolerance: 0 } })} style={{ ...ui.input, fontWeight: 850, letterSpacing: ".04em" }} />{tt === "TYPE_ANSWER" && identificationBlurred && trimText(cor.text) && <CorrectAnswerExplanation value={cfg.explanation || ""} onChange={(explanation) => onChange({ config: { ...cfg, typoTolerance: 0, explanation } })} ui={ui} c={c} />}</div>
        {/* {templateType === "TYPE_ANSWER" && (
          <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
            <label style={ui.smallLabel}>Accepted typos</label>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <input
                type="range"
                min={1}
                max={5}
                value={Number(cfg.typoTolerance || 1)}
                onChange={(e) => onChange({ config: { ...cfg, typoTolerance: Math.min(5, Math.max(1, Number(e.target.value) || 1)) } })}
                style={{ flex: 1 }}
              />
              <div style={{ ...ui.badge, minWidth: 36, justifyContent: "center", background: c.cardBg2, color: c.text }}>{Number(cfg.typoTolerance || 1)}</div>
            </div>
            <div style={{ color: c.textMuted, fontSize: 12 }}>Choose how many typos to accept as correct (1 to 5).</div>
          </div>
        )} */}
      </div>
    );
  }

  if (tt === "GUESS_WORD_4PICS") {
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

        <div className="tw-guess-word-answer-row" data-tutorial="builder-guess-word-fields" style={{ marginTop: 16, padding: 15, borderRadius: 16, border: `1px solid ${ui.templateBorder || c.border}`, background: ui.templateSoftBg || c.cardBg2 }}>
          <div data-tutorial="builder-guess-answer">
            <label style={{ ...ui.smallLabel, display: "block", marginBottom: 8 }}>Correct word</label>
            <input
              maxLength={255}
              value={cor.text ?? ""}
              placeholder="Enter the answer"
              onFocus={() => { if (!trimText(cfg.explanation)) setGuessAnswerBlurred(false); }}
              onBlur={() => { if (trimText(cor.text)) setGuessAnswerBlurred(true); }}
              onChange={(e) => onChange({ correct: { ...cor, text: e.target.value.slice(0, 255) }, config: { ...cfg, images, target: e.target.value.slice(0, 255), dummyLetters: Number(cfg.dummyLetters || 6) } })}
              style={{ ...ui.input, fontWeight: 850, letterSpacing: ".04em" }}
            />
          </div>
          <div data-tutorial="builder-guess-distractors">
            <label style={{ ...ui.smallLabel, display: "block", marginBottom: 8 }}>Distractor letters</label>
            <input
              type="number"
              min={0}
              max={12}
              value={Number(cfg.dummyLetters || 6)}
              onChange={(e) => onChange({ config: { ...cfg, images, target: cfg.target ?? cor.text ?? "", dummyLetters: Math.min(12, Math.max(0, Number(e.target.value) || 0)) } })}
              style={{ ...ui.input, fontWeight: 850 }}
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

  if (tt === "MATCHING") {
    const colA = Array.isArray(cfg.colA) && cfg.colA.length ? cfg.colA.map((item) => ({ text: item?.text || "", image: item?.image || "" })) : [{ text: "", image: "" }];
    const allB = Array.isArray(cfg.colB) && cfg.colB.length ? cfg.colB.map((item) => ({ text: item?.text || "", image: item?.image || "" })) : [{ text: "", image: "" }];
    const dummyB = Array.isArray(cfg.dummyB) && cfg.dummyB.length ? cfg.dummyB.map((item) => ({ text: item?.text || "", image: item?.image || "" })) : allB.slice(colA.length, colA.length + 2);
    const pairB = Array.from({ length: colA.length }, (_, i) => ({ text: allB[i]?.text || "", image: allB[i]?.image || "" }));
    const maxPairs = isBasic ? 5 : 999;
    const maxDummies = isBasic ? 1 : 2;
    const activeDummy = dummyB.slice(0, maxDummies);
    const activePair = Math.min(matchingPairIndex, colA.length - 1);
    const imagesEnabled = Boolean(cfg.matchingImagesEnabled ?? matchingImagesEnabled);

    function emit(aRows, bRows, dRows, extraConfig = {}) {
      const cleanedDummy = dRows.slice(0, maxDummies);
      onChange({
        config: { ...cfg, matchingImagesEnabled: imagesEnabled, ...extraConfig, colA: aRows, colB: [...bRows, ...cleanedDummy], dummyB: cleanedDummy },
        correct: { ...cor, pairs: aRows.map((_, i) => ({ aIndex: i, bIndex: i })) },
      });
    }

    function togglePairImages() {
      const nextEnabled = !imagesEnabled;
      setMatchingImagesEnabled(nextEnabled);
      onChange({
        config: { ...cfg, matchingImagesEnabled: nextEnabled, colA, colB: [...pairB, ...activeDummy], dummyB: activeDummy },
        correct: { ...cor, pairs: colA.map((_, i) => ({ aIndex: i, bIndex: i })) },
      });
    }

    function updateA(i, patch) { emit(colA.map((row, idx) => (idx === i ? { ...row, ...patch } : row)), pairB, activeDummy); }
    function updateB(i, patch) { emit(colA, pairB.map((row, idx) => (idx === i ? { ...row, ...patch } : row)), activeDummy); }
    function updateDummy(i, patch) { emit(colA, pairB, activeDummy.map((row, idx) => (idx === i ? { ...row, ...patch } : row))); }
    function addRow() {
      if (colA.length >= maxPairs) return;
      emit([...colA, { text: "", image: "" }], [...pairB, { text: "", image: "" }], activeDummy);
      setMatchingDirection("next");
      setMatchingPairIndex(colA.length);
    }
    function removeRow(index) {
      if (colA.length <= 1) return;
      emit(colA.filter((_, i) => i !== index), pairB.filter((_, i) => i !== index), activeDummy);
      setMatchingPairIndex((current) => Math.max(0, Math.min(current, colA.length - 2)));
    }
    function addDummy() { if (activeDummy.length < maxDummies) emit(colA, pairB, [...activeDummy, { text: "", image: "" }]); }
    function removeDummy(index) { emit(colA, pairB, activeDummy.filter((_, i) => i !== index)); }
    function showPair(index) {
      if (index < 0 || index >= colA.length || index === activePair) return;
      setMatchingDirection(index > activePair ? "next" : "prev");
      setMatchingPairIndex(index);
    }

    return (
      <div style={ui.innerCard}>
        <div data-tutorial="builder-matching-pairs">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
          <div><h4 style={ui.innerTitle}>Matching Pairs</h4></div>
          <div className="tw-matching-pair-actions">
            <button
              type="button"
              data-tutorial="builder-matching-add-image"
              className="tw-builder-press tw-matching-white-action"
              style={{ ...ui.secondaryBtn, padding: "7px 12px", fontSize: 12 }}
              onClick={togglePairImages}
            >{imagesEnabled ? "− Image" : "＋ Image"}</button>
            <button type="button" data-tutorial="builder-matching-add-pair" className="tw-builder-press tw-matching-white-action" style={{ ...ui.secondaryBtn, padding: "7px 12px", fontSize: 12, opacity: colA.length >= maxPairs ? .5 : 1 }} disabled={colA.length >= maxPairs} onClick={addRow}>＋ Pair</button>
          </div>
        </div>

        <div className="tw-matching-pair-carousel">
          <button type="button" className="tw-matching-arrow" style={{ "--tw-match-accent": ui.templateAccent, "--tw-match-disabled-border": c.border, "--tw-match-disabled-bg": c.cardBg, "--tw-match-disabled-color": c.text }} disabled={activePair === 0} onClick={() => showPair(activePair - 1)}>←</button>
          <div key={`${activePair}-${matchingDirection}`} data-tutorial="builder-matching-active-pair" className={`tw-matching-pair-card is-${matchingDirection}`} style={{ borderColor: ui.templateBorder, background: c.cardBg2 }}>
            <div className="tw-matching-pair-head">
              <span style={{ ...ui.badge, background: ui.templateSoftBg, color: ui.templateAccent }}>Pair {activePair + 1} of {colA.length}</span>
              <button type="button" className="tw-builder-press tw-builder-press-red tw-matching-delete-minus" title="Delete pair" aria-label="Delete pair" disabled={colA.length <= 1} onClick={() => removeRow(activePair)}>−</button>
            </div>
            <div className="tw-matching-pair-fields">
              <div>
                <label style={ui.smallLabel}>Column A</label>
                <input maxLength={255} value={colA[activePair]?.text || ""} placeholder={imagesEnabled ? "Concept, term, or caption (optional)" : "Concept or term"} onChange={(e) => updateA(activePair, { text: e.target.value.slice(0, 255) })} style={ui.input} />
                {imagesEnabled && <ImageUploadTile compact value={colA[activePair]?.image || ""} label="Upload Column A image" onChange={(value) => updateA(activePair, { image: value })} c={c} accent={ui.templateAccent} />}
              </div>
              <div className="tw-matching-link">⇄</div>
              <div>
                <label style={ui.smallLabel}>Column B Correct Match</label>
                <input maxLength={255} value={pairB[activePair]?.text || ""} placeholder={imagesEnabled ? "Answer or caption (optional)" : "Correct match"} onChange={(e) => updateB(activePair, { text: e.target.value.slice(0, 255) })} style={ui.input} />
                {imagesEnabled && <ImageUploadTile compact value={pairB[activePair]?.image || ""} label="Upload Column B image" onChange={(value) => updateB(activePair, { image: value })} c={c} accent={ui.templateAccent} />}
              </div>
            </div>
          </div>
          <button type="button" className="tw-matching-arrow" style={{ "--tw-match-accent": ui.templateAccent, "--tw-match-disabled-border": c.border, "--tw-match-disabled-bg": c.cardBg, "--tw-match-disabled-color": c.text }} disabled={activePair >= colA.length - 1} onClick={() => showPair(activePair + 1)}>→</button>
        </div>
        </div>

        <div className="tw-matching-dummy-section" data-tutorial="builder-matching-dummy" style={{ borderColor: c.border, background: c.cardBg2 }}>
          {activeDummy.length === 0 ? (
            <div className="tw-matching-add-dummy-empty"><button type="button" data-tutorial="builder-matching-add-dummy" className="tw-builder-press tw-builder-press-blue" onClick={addDummy}>Add Distractors</button></div>
          ) : <>
            <div className="tw-matching-dummy-head">
              <div><h4 style={{ ...ui.innerTitle, margin: 0 }}>Distractors</h4></div>
              {activeDummy.length < maxDummies && <button type="button" data-tutorial="builder-matching-add-dummy" className="tw-builder-press tw-builder-press-blue" onClick={addDummy}>Add Distractors</button>}
            </div>
            <div className={`tw-matching-dummy-grid${activeDummy.length === 1 ? " is-single" : ""}`}>
              {activeDummy.map((row, index) => (
                <div key={index} className="tw-matching-dummy-card" style={{ borderColor: c.border, background: c.cardBg }}>
                  <div className="tw-matching-dummy-label"><label style={ui.smallLabel}>Distractor {index + 1}</label><button type="button" className="tw-builder-press tw-builder-press-red tw-matching-delete-minus" title="Delete distractor" aria-label="Delete distractor" onClick={() => removeDummy(index)}>−</button></div>
                  <div className="tw-matching-dummy-fields">
                    <textarea rows={4} className="tw-matching-dummy-input tw-matching-distractor-input" maxLength={255} value={row.text || ""} placeholder="Distractor answer (optional)" onChange={(e) => updateDummy(index, { text: e.target.value.slice(0, 255) })} style={ui.input} />
                    <ImageUploadTile compact value={row.image || ""} label="Upload image" onChange={(value) => updateDummy(index, { image: value })} c={c} accent={ui.templateAccent} />
                  </div>
                </div>
              ))}
            </div>
          </>}
        </div>
      </div>
    );
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
        maxWords={isBasic ? 4 : null}
      />
    );
  }

  return null;
}

export function getUi(c, dark, templateType) {
  const palette = templateTone(templateType, c, true);
  return {
    page: {
      display: "flex",
      flexDirection: "column",
      minHeight: "100vh",
      background: c.pageBg,
      transition: "background 0.3s",
    },
    topBar: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 12,
      padding: "14px 28px",
      background: palette.accent,
      borderBottom: `4px solid ${palette.border}`,
      position: "sticky",
      top: 0,
      zIndex: 10,
      boxShadow: dark ? `0 10px 30px ${palette.accent}22` : `0 10px 30px ${palette.accent}20`,
    },
    titleEditorWrap: {
      display: "flex",
      gap: 8,
      alignItems: "center",
      flexWrap: "wrap",
    },
    titleInput: {
      width: "min(100%, 520px)",
      minWidth: 0,
      padding: "3px 0 5px",
      borderRadius: 0,
      border: "none",
      borderBottom: `2px solid ${palette.border}`,
      background: "transparent",
      color: c.text,
      fontSize: "clamp(20px,2.1vw,30px)",
      lineHeight: 1.2,
      fontWeight: 950,
      boxSizing: "border-box",
      outline: "none",
    },
    inlineEditBtn: {
      padding: "6px 12px",
      borderRadius: 999,
      border: `1px solid ${c.border}`,
      background: c.cardBg2,
      color: c.textMuted,
      fontSize: 12,
      fontWeight: 800,
      cursor: "pointer",
    },
    settingsPanel: {
      background: dark ? c.cardBg2 : c.cardBg,
      borderBottom: `3px solid ${palette.border}`,
      transition: "background 0.3s, border-color 0.3s",
    },
    settingsPanelInner: {
      display: "grid",
      gap: 14,
      gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
      padding: "16px 28px 18px",
    },
    toggleCard: (active) => ({
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
      width: "100%",
      textAlign: "left",
      padding: "16px 18px",
      borderRadius: 18,
      border: `3px solid ${active ? palette.border : c.border}`,
      background: active ? palette.bg : c.cardBg2,
      color: c.text,
      cursor: "pointer",
      boxShadow: active ? `0 5px 0 ${palette.border}, ${palette.shadow}` : `0 4px 0 ${c.border}`,
    }),
    toggleTitle: { fontWeight: 850, fontSize: 14, color: palette.accent },
    toggleHint: { fontSize: 12, color: c.textMuted, marginTop: 4, lineHeight: 1.5 },
    switchTrack: (active) => ({
      width: 50,
      height: 30,
      borderRadius: 999,
      position: "relative",
      flexShrink: 0,
      background: active ? palette.accent : dark ? `color-mix(in srgb, ${palette.accent} 42%, #102443)` : "#c6d3f7",
      border: `3px solid ${active ? palette.accent : dark ? palette.border : c.border}`,
      transition: "all 0.2s ease",
    }),
    switchThumb: (active) => ({
      position: "absolute",
      top: 3,
      left: active ? 23 : 3,
      width: 22,
      height: 22,
      borderRadius: "50%",
      background: "#fff",
      transition: "left 0.2s ease",
      boxShadow: "0 4px 10px rgba(0,0,0,0.18)",
    }),
    pagerBar: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "16px 40px",
      borderBottom: `1px solid ${c.border}`,
      background: dark ? c.pageBg : c.cardBg2,
    },
    editorArea: {
      flex: 1,
      padding: "28px 40px",
      maxWidth: 920,
      width: "100%",
      margin: "0 auto",
      boxSizing: "border-box",
    },
    questionCard: {
      background: dark ? `color-mix(in srgb, ${palette.accent} 32%, #102443)` : `color-mix(in srgb, ${palette.accent} 25%, #ffffff)`,
      border: `3px solid ${palette.border}`,
      borderRadius: 22,
      padding: "28px 32px",
      boxShadow: dark ? `0 10px 34px ${palette.accent}20` : `0 12px 34px ${palette.accent}24`,
    },
    metaGrid: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
      gap: 14,
      marginBottom: 18,
    },
    metaCard: {
      padding: "14px 16px",
      borderRadius: 16,
      background: dark ? `color-mix(in srgb, ${palette.accent} 24%, ${c.cardBg2})` : `color-mix(in srgb, ${palette.accent} 16%, #ffffff)`,
      border: `3px solid ${palette.border}`,
      boxShadow: `0 5px 0 color-mix(in srgb, ${palette.accent} 55%, ${c.border}), 0 12px 24px ${palette.accent}18`,
    },
    metaLabel: { fontSize: 12, fontWeight: 850, color: palette.accent, marginBottom: 10, letterSpacing: "0.03em", textTransform: "uppercase" },
    metaRow: { display: "flex", alignItems: "center", gap: 10 },
    metaInput: {
      width: 96,
      padding: "10px 12px",
      borderRadius: 12,
      border: `1px solid ${c.inputBorder}`,
      background: "#fff",
      color: "#111827",
      fontSize: 15,
      fontWeight: 800,
      boxSizing: "border-box",
    },
    metaSuffix: { fontSize: 13, color: c.textMuted, fontWeight: 700 },
    fieldLabel: {
      fontSize: 13,
      fontWeight: 800,
      color: palette.accent,
      display: "block",
      marginBottom: 8,
      letterSpacing: "0.02em",
    },
    textarea: {
      padding: "12px 14px",
      borderRadius: 12,
      border: `1px solid ${c.inputBorder}`,
      background: "#fff",
      color: "#111827",
      fontSize: 14,
      width: "100%",
      boxSizing: "border-box",
      resize: "vertical",
      minHeight: 90,
      fontFamily: "inherit",
    },
    textareaSmall: {
      padding: "9px 12px",
      borderRadius: 10,
      border: `1px solid ${c.inputBorder}`,
      background: "#fff",
      color: "#111827",
      fontSize: 13,
      width: "100%",
      boxSizing: "border-box",
    },
    input: {
      padding: "10px 13px",
      borderRadius: 11,
      border: `1px solid ${c.inputBorder}`,
      background: "#fff",
      color: "#111827",
      fontSize: 14,
      width: "100%",
      boxSizing: "border-box",
    },
    select: {
      padding: "9px 12px",
      borderRadius: 10,
      border: `1px solid ${c.inputBorder}`,
      background: "#fff",
      color: "#111827",
      fontSize: 14,
    },
    smallInput: {
      padding: "8px 10px",
      borderRadius: 10,
      border: `1px solid ${c.inputBorder}`,
      background: "#fff",
      color: "#111827",
      fontSize: 14,
    },
    smallLabel: { fontSize: 12, color: palette.accent, fontWeight: 800 },
    blurOverlay: {
      position: "fixed",
      inset: 0,
      backdropFilter: "blur(5px)",
      background: dark ? "rgba(0,0,0,0.55)" : "rgba(30,45,85,0.26)",
      zIndex: 200,
    },
    modalWrap: {
      position: "fixed",
      inset: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 201,
      padding: 20,
    },
    modalCard: {
      background: c.cardBg,
      border: `1px solid ${c.border}`,
      borderRadius: 20,
      padding: "30px 28px",
      width: "min(100%, 440px)",
      textAlign: "center",
      boxShadow: dark ? "0 24px 80px rgba(0,0,0,0.5)" : "0 24px 80px rgba(43,108,255,0.16)",
    },
    innerCard: {
      marginTop: 16,
      background: `linear-gradient(145deg, ${palette.softBg}, ${c.cardBg2})`,
      border: `2.5px solid ${palette.border}`,
      borderRadius: 16,
      padding: 16,
    },
    innerTitle: { margin: "0 0 10px", color: palette.accent, fontWeight: 900 },
    innerMeta: { fontSize: 12, opacity: 0.7 },
    badge: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "3px 10px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 700,
    },
    warnItem: {
      background: c.yellowBg,
      border: `1px solid ${c.yellowBorder}`,
      borderRadius: 10,
      padding: "10px 12px",
      marginBottom: 8,
      fontSize: 13,
      color: c.yellowFg,
      textAlign: "left",
    },
    msgBar: {
      padding: "10px 28px",
      fontSize: 13,
      color: c.textMuted,
      fontWeight: 700,
    },
    ghostBtn: {
      padding: "8px 16px",
      borderRadius: 10,
      border: `1px solid ${c.border}`,
      background: dark ? "transparent" : c.cardBg2,
      color: c.textMuted,
      fontSize: 13,
      fontWeight: 800,
      cursor: "pointer",
    },
    pagerBtn: {
      padding: "12px 28px",
      borderRadius: 12,
      border: `1px solid ${c.border}`,
      background: c.cardBg,
      color: c.text,
      fontSize: 15,
      fontWeight: 800,
      cursor: "pointer",
    },
    secondaryBtn: {
      padding: "10px 14px",
      borderRadius: 12,
      border: `1px solid ${dark ? c.border : c.inputBorder}`,
      background: dark ? c.cardBg2 : "#edf3ff",
      color: dark ? c.text : "#17305f",
      fontSize: 14,
      fontWeight: 800,
      cursor: "pointer",
      boxShadow: dark ? "none" : "0 8px 18px rgba(43,108,255,0.08)",
    },
    secondaryBtnActive: {
      background: dark ? "#1b2b55" : "#d8e6ff",
      borderColor: palette.accent,
      color: dark ? "#ffffff" : "#12306b",
    },
    savedBtn: {
      padding: "10px 14px",
      borderRadius: 12,
      border: `1px solid ${dark ? "#2f4067" : "#b8c8ef"}`,
      background: dark ? "#1a2540" : "#dfe8fb",
      color: dark ? "#90a0c8" : "#5f759f",
      fontSize: 14,
      fontWeight: 800,
      cursor: "default",
    },
    primaryBtn: {
      padding: "10px 16px",
      borderRadius: 12,
      border: `1px solid ${palette.accent}`,
      background: palette.accent,
      color: "#fff",
      fontSize: 14,
      fontWeight: 900,
      cursor: "pointer",
      boxShadow: `0 12px 26px ${palette.accent}33`,
    },
    disabledPrimaryBtn: {
      padding: "10px 16px",
      borderRadius: 12,
      border: `1px solid ${dark ? "#2f4067" : "#b8c8ef"}`,
      background: dark ? "#1a2540" : "#dfe8fb",
      color: dark ? "#90a0c8" : "#5f759f",
      fontSize: 14,
      fontWeight: 900,
      cursor: "not-allowed",
      opacity: 0.95,
    },
    dangerGhostBtn: {
      padding: "10px 14px",
      borderRadius: 12,
      border: `1px solid ${c.redBorder}`,
      background: c.redBg,
      color: c.redFg,
      fontSize: 14,
      fontWeight: 800,
      cursor: "pointer",
    },
    templateBorder: palette.border,
    templateAccent: palette.accent,
    templateSoftBg: palette.softBg,
    dangerPrimaryBtn: {
      padding: "10px 16px",
      borderRadius: 12,
      border: "1px solid #dc2626",
      background: "#dc2626",
      color: "#fff",
      fontSize: 14,
      fontWeight: 900,
      cursor: "pointer",
    },
  };
}
