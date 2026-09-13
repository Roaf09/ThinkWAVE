import { useEffect, useMemo, useRef, useState } from "react";
import { buildThinkSpellGrid, buildThinkSpellSeed, buildThinkSpellSignature } from "../../../lib/thinkSpell";
import { trimText } from "./quizBuilderUtils";

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
export function ThinkSpellEditor({ cor, cfg, onChange, ui, c, maxWords = null, isMobile = false }) {
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
  const normalizedCounts = normalized.reduce((acc, w) => { acc[w] = (acc[w] || 0) + 1; return acc; }, {});
  const hasDuplicateWords = Object.values(normalizedCounts).some((n) => n > 1);
  const duplicateWordSet = new Set(Object.entries(normalizedCounts).filter(([, n]) => n > 1).map(([w]) => w));
  const longest = normalized.length ? Math.max(...normalized.map((word) => word.length)) : 5;
  const shortest = normalized.length ? Math.min(...normalized.map((word) => word.length)) : 5;
  const minGrid = Math.min(12, Math.max(5, longest, shortest));
  const maxGrid = Math.min(12, Math.max(minGrid, longest + 3));
  const gridSize = Math.min(maxGrid, Math.max(minGrid, Number(cfg.gridSize || minGrid)));
  const gridSeed = Number(cfg.gridSeed || 1);
  const canFill = normalized.length >= 4 && gridSize >= longest && !hasDuplicateWords;
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
    // Do not accept duplicates into the saved quiz data: if the typed word
    // (normalized, case-insensitive) already exists in another field, keep it
    // visible locally with an error but do not commit it upstream.
    const nextNormalized = next.map((w) => trimText(w).toUpperCase().replace(/[^A-Z]/g, "")).filter(Boolean);
    const counts = nextNormalized.reduce((acc, w) => { acc[w] = (acc[w] || 0) + 1; return acc; }, {});
    const hasDupes = Object.values(counts).some((n) => n > 1);
    if (hasDupes) return;
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

  const gridPreview = (
    <div className="grid place-items-center p-[14px] rounded-[18px]" style={{ minHeight: isMobile ? 0 : 330, border: `1.5px solid ${ui.templateBorder || c.border}`, background: c.cardBg }}>
      <div key={`${gridSize}-${gridSeed}-${cfg.gridFilled}-${isArranging}`} className="grid w-[min(100%,430px)]" style={{ gridTemplateColumns: `repeat(${visiblePreview.gridSize}, minmax(0,1fr))`, gap: visiblePreview.gridSize > 9 ? 3 : 5, animation: "twGridFill 320ms ease" }}>
        {visiblePreview.grid.map((letter, index) => <div className="tw-crossword-grid-cell aspect-square grid place-items-center font-black" key={index} style={{ borderRadius: visiblePreview.gridSize > 9 ? 6 : 9, border: `1px solid ${c.border}`, background: letter ? c.cardBg2 : "transparent", color: c.accent, fontSize: visiblePreview.gridSize > 9 ? 11 : 15, transition: "transform .24s ease, background .24s ease, opacity .24s ease", animation: letter ? "twTilePop 240ms ease both" : "none" }}>{letter}</div>)}
      </div>
    </div>
  );
  if (isMobile) {
    return (
      <div style={{ ...ui.innerCard, gridTemplateColumns: "1fr" }} className="tw-crossword-mobile grid gap-3">
        <div className="flex justify-between items-center gap-3">
          <h4 style={{ ...ui.innerTitle, margin: 0 }}>Crossword</h4>
        </div>
        <div data-tutorial="builder-crossword-word-editor">
          <div className="tw-crossword-word-head">
            <label style={ui.smallLabel}>Valid or correct words</label>
            <div className="tw-crossword-word-actions">
              <button type="button" className="tw-builder-press tw-builder-press-neutral" onClick={removeWordField} disabled={wordFields.length <= 4} aria-label="Remove word field">−</button>
              <button type="button" className="tw-builder-press tw-builder-press-blue" onClick={addWordField} disabled={wordFields.length >= fieldLimit} aria-label="Add word field">＋</button>
            </div>
          </div>
          <div data-tutorial="builder-crossword-words" className="tw-crossword-word-grid">
            {wordFields.map((word, index) => {
              const norm = trimText(word).toUpperCase().replace(/[^A-Z]/g, "");
              const isDup = norm && duplicateWordSet.has(norm);
              return (
                <input
                  key={index}
                  maxLength={255}
                  value={word}
                  placeholder={`Word ${index + 1}`}
                  onChange={(event) => updateWord(index, event.target.value)}
                  style={isDup ? { ...ui.input, borderColor: "#ef4444", background: "rgba(239,68,68,.08)" } : ui.input}
                  title={isDup ? "Duplicate word — all correct words must be unique" : undefined}
                />
              );
            })}
          </div>
          {hasDuplicateWords && <div className="text-[12px] font-extrabold mt-[6px]" style={{ color: "#dc2626" }}>Duplicate words are not allowed — all correct words must be unique.</div>}
        </div>
        {gridPreview}
        <div>
          <label style={ui.smallLabel}>Grid size</label>
          <select value={gridSize} onChange={(e) => setGridSize(e.target.value)} className="block w-full mt-[7px]" style={ui.select} disabled={!normalized.length}>
            {Array.from({ length: Math.max(1, maxGrid - minGrid + 1) }, (_, i) => minGrid + i).map((size) => <option key={size} value={size}>{size} × {size}</option>)}
          </select>
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
    );
  }
  return (
    <div style={ui.innerCard} className="grid grid-cols-[minmax(260px,.85fr)_minmax(300px,1.15fr)] gap-[18px] items-start">
      <div className="grid gap-3">
        <div data-tutorial="builder-crossword-word-editor">
          <div className="tw-crossword-word-head">
            <label style={ui.smallLabel}>Valid or correct words</label>
            <div className="tw-crossword-word-actions">
              <button type="button" className="tw-builder-press tw-builder-press-neutral" onClick={removeWordField} disabled={wordFields.length <= 4} aria-label="Remove word field">−</button>
              <button type="button" className="tw-builder-press tw-builder-press-blue" onClick={addWordField} disabled={wordFields.length >= fieldLimit} aria-label="Add word field">＋</button>
            </div>
          </div>
          <div data-tutorial="builder-crossword-words" className="tw-crossword-word-grid">
            {wordFields.map((word, index) => {
              const norm = trimText(word).toUpperCase().replace(/[^A-Z]/g, "");
              const isDup = norm && duplicateWordSet.has(norm);
              return (
                <input
                  key={index}
                  maxLength={255}
                  value={word}
                  placeholder={`Word ${index + 1}`}
                  onChange={(event) => updateWord(index, event.target.value)}
                  style={isDup ? { ...ui.input, borderColor: "#ef4444", background: "rgba(239,68,68,.08)" } : ui.input}
                  title={isDup ? "Duplicate word — all correct words must be unique" : undefined}
                />
              );
            })}
          </div>
          {hasDuplicateWords && <div className="text-[12px] font-extrabold mt-[6px]" style={{ color: "#dc2626" }}>Duplicate words are not allowed — all correct words must be unique.</div>}
        </div>
        <button type="button" style={ui.toggleCard(cfg.showWordList !== false)} onClick={() => onChange({ config: { ...cfg, answers, showWordList: cfg.showWordList === false } })}>
          <div><div style={ui.toggleTitle}>Show valid words during gameplay</div><div style={ui.toggleHint}>{cfg.showWordList === false ? "Higher-order mode: learners discover which words to find." : "Lower-order mode: learners can see the word goals."}</div></div>
          <span style={ui.switchTrack(cfg.showWordList !== false)}><span style={ui.switchThumb(cfg.showWordList !== false)} /></span>
        </button>
        <div>
          <label style={ui.smallLabel}>Grid size</label>
          <select value={gridSize} onChange={(e) => setGridSize(e.target.value)} className="block w-full mt-[7px]" style={ui.select} disabled={!normalized.length}>
            {Array.from({ length: Math.max(1, maxGrid - minGrid + 1) }, (_, i) => minGrid + i).map((size) => <option key={size} value={size}>{size} × {size}</option>)}
          </select>
          <div className="text-[11px] mt-[6px]" style={{ color: c.textMuted }}>Available size is based on the longest valid word, up to three additional rows and columns.</div>
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
      {gridPreview}
    </div>
  );
}
