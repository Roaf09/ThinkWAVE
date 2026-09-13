import { useEffect, useRef } from "react";
import {
  buildThinkSpellSignature,
  getPathLinePoints,
  loadThinkSpellGridState,
  matchThinkSpellWord,
  normalizeThinkWordKey,
  resolveThinkSpellWordBank,
  validatePathSpellsWord,
} from "../../lib/thinkSpell";

function straightThinkSpellPath(startIndex, endIndex, gridSize) {
  const size = Math.max(1, Number(gridSize || 1));
  const start = Number(startIndex);
  const end = Number(endIndex);
  if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
  const startRow = Math.floor(start / size);
  const startCol = start % size;
  const endRow = Math.floor(end / size);
  const endCol = end % size;
  const rowDelta = endRow - startRow;
  const colDelta = endCol - startCol;
  if (rowDelta !== 0 && colDelta !== 0 && Math.abs(rowDelta) !== Math.abs(colDelta)) return null;
  const steps = Math.max(Math.abs(rowDelta), Math.abs(colDelta));
  if (steps === 0) return [start];
  const rowStep = Math.sign(rowDelta);
  const colStep = Math.sign(colDelta);
  return Array.from({ length: steps + 1 }, (_, step) => (startRow + rowStep * step) * size + (startCol + colStep * step));
}

// Shared crossword word-hunt for live + assignment gameplay.
// store: full round object ({ mode, sig, grid, gridSize, wordBank,
//   foundEntries, selected, built, ...extra keys the host flow owns }).
// onStore(nextFullObject) replaces it; partial updates go through patch().
// - correct: live passes the real answers (grid state depends on them),
//   assignment passes {} (its bank comes from config alone).
// - initExtra: extra keys seeded at init (live: { totalPoints: 0 }).
// - summaryHint/totalPoints: end-of-round summary line (live shows points,
//   assignment hides them); pass totalPoints={null} to hide.
export function GameCrossword({ config: cfg, correct = {}, store, onStore, disabled, questionId, timeUp = false, initExtra = {}, summaryHint = "", totalPoints = null }) {
  const gridSize = Math.min(12, Math.max(5, Number(cfg.gridSize ?? 8) || 8));
  const minWordLength = Math.min(8, Math.max(2, Number(cfg.minWordLength ?? 3) || 3));
  const wordBank = resolveThinkSpellWordBank({ config: cfg, correct });
  const sig = buildThinkSpellSignature({ questionId, gridSize, words: wordBank });
  const draggingRef = useRef(false);
  const gridShellRef = useRef(null);
  const pointerIdRef = useRef(null);
  const moveFrameRef = useRef(0);
  const pendingPointRef = useRef(null);
  const storeRef = useRef(store);
  storeRef.current = store;

  useEffect(() => {
    if (store?.mode === "wordhunt-batch" && store.sig === sig && Array.isArray(store.grid) && store.grid.length) return;
    const initial = loadThinkSpellGridState({ config: cfg, correct, questionId, priorPayload: null });
    onStore({ mode: "wordhunt-batch", sig, grid: initial.grid, gridSize: initial.gridSize, wordBank, words: [], foundEntries: [], selected: [], built: "", ...initExtra });
  }, [sig]);

  const grid = Array.isArray(store?.grid) ? store.grid : [];
  const activeGridSize = Number(store?.gridSize || gridSize);
  const selected = Array.isArray(store?.selected) ? store.selected : [];
  const selectedSet = new Set(selected);
  const foundEntries = Array.isArray(store?.foundEntries) ? store.foundEntries : [];
  const foundSet = new Set(foundEntries.map((entry) => normalizeThinkWordKey(entry.text || entry.word || "")));
  const foundPathSet = new Set(foundEntries.flatMap((entry) => Array.isArray(entry.path) ? entry.path.map(Number) : []));
  const built = selected.map((cell) => grid[cell] || "").join("");
  const cellGap = 8;

  function patch(next) {
    const merged = { ...(storeRef.current || {}), ...next };
    storeRef.current = merged;
    onStore(merged);
  }

  function addIndex(cell) {
    if (disabled || !grid[cell]) return;
    const currentSelected = Array.isArray(storeRef.current?.selected) ? storeRef.current.selected : [];
    if (!currentSelected.length) return patch({ selected: [cell], built: String(grid[cell] || "") });
    const nextSelected = straightThinkSpellPath(currentSelected[0], cell, activeGridSize);
    if (!nextSelected || nextSelected.some((cellIndex) => !grid[cellIndex])) return;
    patch({ selected: nextSelected, built: nextSelected.map((n) => grid[n] || "").join("") });
  }

  function finishSelection() {
    const pointerId = pointerIdRef.current;
    if (pointerId !== null && gridShellRef.current?.hasPointerCapture?.(pointerId)) {
      try { gridShellRef.current.releasePointerCapture(pointerId); } catch {}
    }
    pointerIdRef.current = null;
    draggingRef.current = false;
    const path = Array.isArray(storeRef.current?.selected) ? [...storeRef.current.selected] : [];
    const text = path.map((cell) => grid[cell] || "").join("");
    const matchedKey = matchThinkSpellWord(text, wordBank);
    const pathValid = text.length >= minWordLength && validatePathSpellsWord({ grid, gridSize: activeGridSize, path, word: text });
    const latestFound = Array.isArray(storeRef.current?.foundEntries) ? storeRef.current.foundEntries : [];
    const latestFoundSet = new Set(latestFound.map((entry) => normalizeThinkWordKey(entry.text || entry.word || "")));
    if (matchedKey && pathValid && !latestFoundSet.has(matchedKey)) {
      const nextFound = [...latestFound, { text, path }];
      return patch({ foundEntries: nextFound, words: nextFound, selected: [], built: "" });
    }
    patch({ selected: [], built: "" });
  }

  function handleGridPointerMove(e) {
    if (!draggingRef.current || disabled) return;
    pendingPointRef.current = { x: e.clientX, y: e.clientY };
    if (moveFrameRef.current) return;
    moveFrameRef.current = requestAnimationFrame(() => {
      moveFrameRef.current = 0;
      const point = pendingPointRef.current;
      if (!point || !draggingRef.current) return;
      const target = document.elementFromPoint(point.x, point.y)?.closest?.("[data-bword-index]");
      if (target) addIndex(Number(target.dataset.bwordIndex));
    });
  }

  useEffect(() => () => {
    if (moveFrameRef.current) cancelAnimationFrame(moveFrameRef.current);
  }, []);

  const linePoints = selected.length > 1 ? getPathLinePoints(selected, activeGridSize, 48, cellGap) : [];
  const foundLines = foundEntries
    .map((entry) => Array.isArray(entry?.path) && entry.path.length > 1 ? getPathLinePoints(entry.path.map(Number), activeGridSize, 48, cellGap) : [])
    .filter((points) => points.length > 1);
  const previewStatus = !built ? "" : built.length < minWordLength ? `Need at least ${minWordLength} letters` : foundSet.has(matchThinkSpellWord(built, wordBank)) ? "Already found" : matchThinkSpellWord(built, wordBank) ? "Release to add this word" : "Not on the word list";

  return (
    <div className="bword-wrap">
      <div className="bword-game-panel">
        <div className="bword-hud">
          <div className="bword-hud-stat"><span className="bword-hud-label">Found</span><span className="bword-hud-value">{foundEntries.length}/{wordBank.length}</span></div>
        </div>
        {wordBank.length > 0 && cfg.showWordList !== false && (
          <div className="bword-quest-panel">
            <div className="bword-quest-title">Word goals</div>
            <div className="bword-quest-list">
              {wordBank.map((word) => {
                const key = normalizeThinkWordKey(word);
                const done = foundSet.has(key);
                return <span key={key} className={`bword-quest-chip${done ? " done" : ""}`}>{done ? "✓ " : ""}{word.toUpperCase()}</span>;
              })}
            </div>
          </div>
        )}
        <div ref={gridShellRef} className="bword-grid-shell" onPointerMove={handleGridPointerMove} onPointerUp={finishSelection} onPointerCancel={finishSelection}>
          <div className="bword-grid" style={{ gridTemplateColumns: `repeat(${activeGridSize}, minmax(0, 1fr))`, gap: cellGap }}>
            {grid.map((ch, cell) => (
              <button
                key={`${sig}-${cell}`}
                type="button"
                className={`bword-cell${selectedSet.has(cell) ? " selected" : ""}${foundPathSet.has(cell) ? " found" : ""}`}
                onPointerDown={(e) => {
                  if (disabled) return;
                  e.preventDefault();
                  pointerIdRef.current = e.pointerId;
                  gridShellRef.current?.setPointerCapture?.(e.pointerId);
                  draggingRef.current = true;
                  patch({ selected: [cell], built: String(grid[cell] || "") });
                }}
                onPointerEnter={() => draggingRef.current && addIndex(cell)}
                disabled={disabled}
                data-bword-index={cell}
              >
                {ch}
              </button>
            ))}
          </div>
          {(foundLines.length > 0 || linePoints.length > 1) && (
            <svg className="bword-path-line" viewBox={`0 0 ${activeGridSize * 56} ${activeGridSize * 56}`} preserveAspectRatio="none">
              {foundLines.map((points, index) => <polyline key={`found-line-${index}`} className="is-found" points={points.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="rgba(34,197,94,.98)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />)}
              {linePoints.length > 1 && <polyline key={`active-${selected.join("-")}`} className="is-active" points={linePoints.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="rgba(134, 239, 172, 0.95)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />}
            </svg>
          )}
        </div>
        <div className="bword-built-row">
          <div className="spell-display bword-current-word">
            {(built || "•").split("").map((c, i) => <div key={i} className="spell-char" style={{ width: 32, height: 34, background: c === "•" ? "rgba(255,255,255,0.08)" : "var(--sp-spell-char-bg)" }}>{c}</div>)}
          </div>
          <div className={`bword-preview-status${previewStatus.includes("Release") ? " ok" : ""}`}>{previewStatus}</div>
        </div>
        {timeUp && (
          <div className="bword-summary bword-summary-inside">
            <div className="bword-summary-title">Time&apos;s up!</div>
            <div className="bword-summary-meta">You found <b>{foundEntries.length}</b> word{foundEntries.length === 1 ? "" : "s"}{totalPoints != null && <> · <b>{Number(totalPoints || 0)}</b> pts</>}</div>
            <div className="bword-summary-hint">{summaryHint}</div>
          </div>
        )}
      </div>
    </div>
  );
}
