import { useMemo, useRef, useState } from "react";
import ActionDialog, { primaryBtn } from "../../../components/ActionDialog";
import { TwIcon } from "../../../components/TwUI";
import { VoiceRecorderButton } from "../../../components/AudioControls";
import { ImageUploadTile } from "./builderMedia";
import { CorrectAnswerExplanation } from "./builderVoice";
import {
  choiceHasContent,
  choiceMatchesValue,
  clampQuestionPoints,
  fitCappedLines,
  defaultMcqImageOptions,
  defaultMcqOptions,
  newChoiceId,
  normalizeChoiceOption,
  normalizeChoiceOptions,
  trimText,
} from "./quizBuilderUtils";
import { GAME_CHOICE_PALETTE } from "../../../lib/templatePalette";

// Gameplay choice palette (mirrors .quiz-choices .choice-btn nth-child 1-5
// in live gameplay): face, 3D base, border, ink, and light badge fill.
// Shared with the crossword word fields and read-only Question Bank cards.
export { GAME_CHOICE_PALETTE };

// Desktop game tiles: full size through 3 lines, then shrink toward the
// floor instead of growing taller. Height hugs content so the row's vertical
// centering keeps text middle-aligned with the answer dot on any line count.
const CHOICE_MAX_FONT = 22;
const CHOICE_MIN_FONT = 12;
const CHOICE_MAX_HEIGHT = 80;

function sizeChoiceField(el, big) {
  if (!el) return;
  if (!big) {
    el.style.fontSize = "";
    el.style.height = "auto";
    el.style.height = `${Math.min(220, Math.max(38, el.scrollHeight))}px`;
    return;
  }
  fitCappedLines(el, { maxSize: CHOICE_MAX_FONT, minSize: CHOICE_MIN_FONT, maxLines: 3, maxHeight: CHOICE_MAX_HEIGHT });
}

export function McqEditor({ category, q, onChange, ui, c, isMobile = false }) {  const [showMatchingSuggest, setShowMatchingSuggest] = useState(false);
  const [mcqDragIndex, setMcqDragIndex] = useState(null);
  const [mcqDragOver, setMcqDragOver] = useState(null);
  const [mouseDragging, setMouseDragging] = useState(false);
  const [mcqMenuOpen, setMcqMenuOpen] = useState(false);
  const mcqDragArmedRef = useRef(null);
  const mcqTouchRef = useRef({ active: false, from: null });
  const dragFollowerRef = useRef(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  // Solid cursor-following preview (see onDragStart): a real on-screen card,
  // so the browser never has to photograph a hidden node. GPU-friendly
  // translate3d keeps it glued to the cursor without trailing behind.
  function moveDragFollower(clientX, clientY) {
    const host = dragFollowerRef.current;
    if (!host || host.style.display === "none") return;
    const off = dragOffsetRef.current;
    host.style.transform = `translate3d(${clientX - off.x}px, ${clientY - off.y}px, 0)`;
  }
  function followDragPointer(e) {
    moveDragFollower(e.clientX, e.clientY);
  }
  const cfg = q.config || {};
  const cor = q.correct || {};

  const mcqMode = cfg.mcqMode === "MODIFIED" ? "MODIFIED" : "NORMAL";
  const baseOptions = normalizeChoiceOptions(cfg.options, category);
  // Spare image slots keep one steady id per position while this question is
  // open. Fresh ids on every view made the 4th tile's id shift under the
  // saved correct mark, which locked Save with no visible reason.
  const spareImageOptions = useMemo(() => defaultMcqImageOptions(), [q?.order]);
  const opts = mcqMode === "MODIFIED"
    ? [...baseOptions, ...spareImageOptions].slice(0, 4).map((opt, index) => ({ ...opt, id: opt.id || `image-option-${index + 1}`, text: "" }))
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

  // Switching modes never loses input: each side's options + correct picks are
  // stashed in config under their mode key, so going Normal → Modified →
  // Normal restores the exact texts (and picks) you had before.
  function setMcqMode(nextMode) {
    const snapshot = {
      options: opts,
      correct: { choice: cor.choice || "", choices: Array.isArray(cor.choices) ? cor.choices : [] },
    };
    const stash = { ...(cfg.mcqModeStash || {}), [mcqMode]: snapshot };
    const saved = stash[nextMode];
    let nextOptions;
    let kept;
    if (saved && Array.isArray(saved.options) && saved.options.length) {
      nextOptions = saved.options.map(normalizeChoiceOption);
      const savedChoices = Array.isArray(saved.correct?.choices) && saved.correct.choices.length
        ? saved.correct.choices
        : [saved.correct?.choice].filter(Boolean);
      kept = savedChoices.filter((choice) => nextOptions.some((row) => choiceMatchesValue(row, choice) && (nextMode !== "MODIFIED" || trimText(row.image))));
    } else if (nextMode === "MODIFIED") {
      nextOptions = [...opts, ...defaultMcqImageOptions()].slice(0, 4).map((opt) => ({ ...opt, id: opt.id || newChoiceId(), text: "", image: opt.image || "" }));
      kept = correctChoices.filter((choice) => nextOptions.some((row) => choiceMatchesValue(row, choice) && trimText(row.image)));
    } else {
      nextOptions = (Array.isArray(cfg.options) && cfg.options.length ? cfg.options.map(normalizeChoiceOption) : defaultMcqOptions(category));
      kept = correctChoices.filter((choice) => nextOptions.some((row) => choiceMatchesValue(row, choice)));
    }
    const nextCorrect = answerMode === "TWO"
      ? { ...cor, choice: kept[0] || "", choices: kept.slice(0, 2) }
      : { ...cor, choice: kept[0] || "", choices: kept[0] ? [kept[0]] : [] };
    onChange({ config: { ...cfg, mcqMode: nextMode, options: nextOptions, answerMode, mcqModeStash: stash }, correct: nextCorrect, points: clampQuestionPoints(q.points, 3) });
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
      const already = correctChoices.some((choice) => choiceMatchesValue(opt, choice));
      if (already) {
        onChange({ correct: { ...cor, choice: "", choices: [] } });
        return;
      }
      onChange({ correct: { ...cor, choice: value, choices: [value] } });
      return;
    }
    const exists = correctChoices.some((choice) => choiceMatchesValue(opt, choice));
    const nextChoices = exists ? correctChoices.filter((choice) => !choiceMatchesValue(opt, choice)) : [...correctChoices, value].slice(0, 2);
    onChange({ correct: { ...cor, choice: nextChoices[0] || "", choices: nextChoices } });
  }

  // Drag-and-drop swaps the two choices: the dragged card and the drop
  // target trade places, every other choice stays exactly where it is.
  // Correct marks follow automatically (they are stored per choice id).
  function reorderOption(from, to) {
    if (from === null || from === undefined || to === null || to === undefined || mcqMode === "MODIFIED") return;
    if (from === to) return;
    if (from < 0 || to < 0 || from >= opts.length || to >= opts.length) return;
    const next = [...opts];
    [next[from], next[to]] = [next[to], next[from]];
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
      <button type="button" className={`tw-builder-press tw-builder-mini-white${answerMode === "TWO" ? " is-selected" : ""}`} style={{ ...ui.secondaryBtn, padding: "4px 10px", fontSize: 12 }} onClick={() => setAnswerMode(answerMode === "TWO" ? "ONE" : "TWO")}>2 answers</button>
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
          <div className="tw-mcq-control-row is-secondary">
            <span style={{ position: "relative", display: "inline-flex" }}>
              <button type="button" className="tw-builder-press tw-builder-mini-white" aria-label={mcqMenuOpen ? "Close answer options" : "Open answer options"} aria-expanded={mcqMenuOpen} style={{ ...ui.secondaryBtn, padding: "4px 11px", fontSize: 16 }} onClick={() => setMcqMenuOpen((v) => !v)}>{mcqMenuOpen ? "✕" : "☰"}</button>
              {mcqMenuOpen && (
                <span data-tutorial="builder-mcq-controls" style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 60, display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", minWidth: 200, background: c.cardBg, border: `1px solid ${c.border}`, borderRadius: 12, padding: 8, boxShadow: "0 12px 28px rgba(15,23,42,.18)" }}>
                  {mcqModeButtons}
                </span>
              )}
            </span>
            {mcqChoiceStepButtons}
          </div>
        ) : (
          <div className="tw-mcq-control-row is-secondary">
            {mcqMenuOpen && (
              <span data-tutorial="builder-mcq-controls" className="tw-mcq-control-row">
                {mcqModeButtons}
              </span>
            )}
            <button type="button" className="tw-builder-press tw-builder-mini-white" aria-label={mcqMenuOpen ? "Close answer options" : "Open answer options"} aria-expanded={mcqMenuOpen} style={{ ...ui.secondaryBtn, padding: "4px 11px", fontSize: 16 }} onClick={() => setMcqMenuOpen((v) => !v)}>{mcqMenuOpen ? "✕" : "☰"}</button>
            {mcqChoiceStepButtons}
          </div>
        )}
      </div>
      <div data-tutorial="builder-mcq-options" data-tutorial-correct="true" data-tutorial-modified-grid={mcqMode === "MODIFIED" ? "true" : undefined} className={`${mcqMode === "MODIFIED" ? "tw-mcq-modified-grid" : "tw-mcq-normal-list"}${mouseDragging ? " is-mouse-dragging" : ""}`} style={mcqMode === "NORMAL" ? { display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14 } : undefined}>
        {mcqMode === "NORMAL" && <style>{`.tw-mcq-game-tile textarea::placeholder{color:rgba(15,23,42,.5)}.tw-mcq-normal-input::placeholder{color:rgba(15,23,42,.5)}`}</style>}
        {opts.map((opt, i) => {
          const hasContent = mcqMode === "MODIFIED" ? !!trimText(opt.image) : choiceHasContent(opt);
          const isCorrect = correctChoices.some((choice) => choiceMatchesValue(opt, choice)) && hasContent;
          const letter = String.fromCharCode(65 + i);
          const gameTile = mcqMode === "NORMAL";
          const pal = GAME_CHOICE_PALETTE[i % GAME_CHOICE_PALETTE.length];
          const spanCentered = gameTile && !isMobile && opts.length % 2 === 1 && i === opts.length - 1;
          // Whole-card grab: any press on the choice arms the drag except on
          // controls (answer circle, text field, upload/voice buttons). The
          // text field keeps full typing + text-selection, the circle keeps
          // its mark-correct job, and the grip icon is now purely decorative.
          const armCardDrag = (event) => {
            if (mcqMode === "MODIFIED") return;
            if (event.target?.closest?.("button,textarea,input,select,a,[contenteditable]")) return;
            mcqDragArmedRef.current = i;
          };
          const beginCardTouchDrag = (event) => {
            if (mcqMode === "MODIFIED") return;
            if (event.target?.closest?.("button,textarea,input,select,a,[contenteditable]")) return;
            if (!event.touches?.[0]) return;
            mcqDragArmedRef.current = i;
            mcqTouchRef.current = { active: true, from: i };
            setMcqDragIndex(i);
            setMcqDragOver(i);
          };
          if (mcqMode === "MODIFIED") {
            return <div key={opt.id || i} className={`tw-mcq-image-choice${isCorrect ? " is-correct" : ""}`} style={{ border: `4px solid ${pal.border}`, borderRadius: 20, background: pal.face, color: pal.ink, boxShadow: isCorrect ? `0 1px 0 ${pal.base}, 0 8px 18px rgba(15,23,42,.18)` : `0 8px 0 ${pal.base}, 0 16px 28px rgba(15,23,42,.16)`, transform: isCorrect ? "translateY(5px)" : "translateY(-3px)", transition: "transform .13s ease, filter .16s ease, box-shadow .13s ease" }}>
              <button type="button" className="tw-mcq-correct-dot tw-mcq-image-correct-letter" title={`Mark choice ${letter} as correct`} onClick={() => toggleCorrect(opt)} disabled={!hasContent} style={{ border: `4px solid ${pal.border}`, background: pal.badge, color: pal.ink, boxShadow: `0 3px 0 ${pal.base}` }}>{isCorrect ? <TwIcon name="check" size={30} /> : letter}</button>
              <ImageUploadTile value={opt.image} label={`Upload image ${letter}`} onChange={(value) => updateImage(i, value)} c={c} accent={pal.border} />
            </div>;
          }
          return <div
            key={opt.id || i}
            data-mcq-index={i}
            className={`tw-mcq-normal-choice${isCorrect ? " is-correct" : ""}${mcqDragIndex === i ? " is-drag-source is-touch-dragging" : ""}${mcqDragOver === i && mcqDragIndex !== i ? " is-drag-over" : ""}`}
            draggable={mcqMode !== "MODIFIED"}
            onPointerDown={armCardDrag}
            onPointerUp={() => { if (mcqDragIndex === null) mcqDragArmedRef.current = null; }}
            onMouseDown={armCardDrag}
            onTouchStart={beginCardTouchDrag}
            onDragStart={(e) => {
              if (mcqDragArmedRef.current !== i) { e.preventDefault(); return; }
              setMcqDragIndex(i);
              setMouseDragging(true);
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", String(i));
              const source = e.currentTarget;
              const rect = source.getBoundingClientRect();
              // Solid preview that rides the cursor: a hidden node's browser
              // photo comes out washed-out, so instead we show a real on-screen
              // copy of the whole card and hide the native ghost with a blank
              // 1px image. Text boxes are swapped for plain blocks carrying the
              // exact same size, weight, spacing, color, and alignment, so the
              // words look identical mid-drag. Grab point: the handle itself
              // follows the cursor — measured live from the handle's real spot
              // inside the card, so it holds true for any card height.
              const gripRect = source.querySelector(".tw-mcq-choice-drag-handle")?.getBoundingClientRect();
              dragOffsetRef.current = gripRect
                ? { x: gripRect.left + gripRect.width / 2 - rect.left, y: gripRect.top + gripRect.height / 2 - rect.top }
                : { x: Math.max(20, rect.width - 24), y: 60 };
              const preview = source.cloneNode(true);
              preview.style.width = `${rect.width}px`;
              preview.style.margin = "0";
              preview.style.transform = "none";
              preview.style.opacity = "1";
              preview.style.pointerEvents = "none";
              preview.classList.remove("is-drag-source", "is-touch-dragging", "is-drag-over");
              preview.querySelectorAll("textarea").forEach((ta) => {
                const still = document.createElement("div");
                const painted = getComputedStyle(ta);
                still.textContent = ta.value || ta.placeholder || "";
                still.style.whiteSpace = "pre-wrap";
                still.style.overflowWrap = "anywhere";
                still.style.width = "100%";
                still.style.boxSizing = "border-box";
                still.style.padding = "0";
                still.style.margin = "0";
                still.style.font = painted.font;
                still.style.fontStyle = painted.fontStyle;
                still.style.fontWeight = painted.fontWeight;
                still.style.fontSize = painted.fontSize;
                still.style.fontFamily = painted.fontFamily;
                still.style.textTransform = painted.textTransform;
                still.style.letterSpacing = painted.letterSpacing;
                still.style.color = painted.color;
                still.style.textAlign = painted.textAlign;
                still.style.lineHeight = painted.lineHeight;
                // Same box too: the fitted height plus its centering padding,
                // so the copy is the exact same size with text sitting
                // identically (otherwise the card comes out shorter).
                still.style.height = ta.style.height || "auto";
                still.style.paddingTop = ta.style.paddingTop || "0px";
                ta.replaceWith(still);
              });
              const host = dragFollowerRef.current;
              if (host) {
                host.innerHTML = "";
                host.appendChild(preview);
                host.style.display = "block";
                host.style.willChange = "transform";
                moveDragFollower(e.clientX, e.clientY);
              }
              const blank = document.createElement("canvas");
              blank.width = 1; blank.height = 1;
              e.dataTransfer.setDragImage(blank, 0, 0);
              document.addEventListener("dragover", followDragPointer);
              const cleanup = () => {
                setMouseDragging(false);
                if (host) { host.style.display = "none"; host.style.willChange = ""; host.innerHTML = ""; }
                document.removeEventListener("dragover", followDragPointer);
                source.removeEventListener("dragend", cleanup);
              };
              source.addEventListener("dragend", cleanup);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (mcqDragIndex !== null && mcqDragIndex !== i) {
                setMcqDragOver(i);
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              const parsed = Number(e.dataTransfer.getData("text/plain"));
              const from = Number.isFinite(parsed) ? parsed : mcqDragIndex;
              reorderOption(from, i);
              setMcqDragIndex(null);
              setMcqDragOver(null);
            }}
            onDragEnd={() => { mcqDragArmedRef.current = null; setMcqDragIndex(null); setMcqDragOver(null); setMouseDragging(false); }}
            onTouchMove={(e) => {
              if (!mcqTouchRef.current.active || mcqMode === "MODIFIED") return;
              const t = e.touches?.[0];
              if (!t) return;
              const el = document.elementFromPoint(t.clientX, t.clientY);
              const row = el?.closest?.("[data-mcq-index]");
              if (!row) return;
              const over = Number(row.getAttribute("data-mcq-index"));
              if (!Number.isFinite(over)) return;
              setMcqDragOver(over);
            }}
            onTouchEnd={() => {
              if (!mcqTouchRef.current.active) return;
              const from = mcqTouchRef.current.from;
              const to = mcqDragOver;
              mcqTouchRef.current = { active: false, from: null };
              mcqDragArmedRef.current = null;
              if (from !== null && to !== null && from !== to) reorderOption(from, to);
              setMcqDragIndex(null);
              setMcqDragOver(null);
            }}
            style={gameTile ? {
              border: `4px solid ${pal.border}`,
              borderRadius: 20,
              background: pal.face,
              color: pal.ink,
              boxShadow: isCorrect ? `0 1px 0 ${pal.base}, 0 8px 18px rgba(15,23,42,.18)` : `0 8px 0 ${pal.base}, 0 16px 28px rgba(15,23,42,.16)`,
              transform: isCorrect ? "translateY(5px)" : "translateY(-3px)",
              transition: "transform .13s ease, filter .16s ease, box-shadow .13s ease",
              touchAction: "pan-y",
              position: "relative",
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: 22,
              ...(spanCentered ? { gridColumn: "1 / -1", justifySelf: "center", width: "calc(50% - 6px)", boxSizing: "border-box" } : null),
            } : { borderColor: isCorrect ? c.accent : c.border, background: isCorrect ? `${c.accent}12` : c.cardBg, touchAction: "pan-y" }}
          >
            <button type="button" className={`tw-mcq-correct-dot tw-mcq-letter-selector${answerMode === "TWO" ? " is-two-answer" : ""}${gameTile ? " tw-mcq-game-badge" : ""}`} title={`Mark choice ${letter} as correct`} onClick={() => toggleCorrect(opt)} disabled={!hasContent} style={gameTile ? {
              width: 56, height: 56, flex: "none", borderRadius: answerMode === "TWO" ? 12 : "50%",
              border: `4px solid ${pal.border}`, background: pal.badge, color: pal.ink,
              boxShadow: `0 3px 0 ${pal.base}`, fontWeight: 1000, fontSize: 24,
              display: "grid", placeItems: "center", cursor: hasContent ? "pointer" : "not-allowed",
            } : { borderRadius: answerMode === "TWO" ? 8 : "50%", transition: "border-radius .28s cubic-bezier(.22,1,.36,1), transform .24s ease, background .22s ease, border-color .22s ease", borderColor: isCorrect ? c.accent : c.textMuted, background: isCorrect ? c.accent : "transparent", color: isCorrect ? "#fff" : c.text }}>{isCorrect ? <TwIcon name="check" size={gameTile ? 22 : 16} /> : letter}</button>
            <div className="tw-mcq-normal-content" style={gameTile ? { flex: "1 1 auto", minWidth: 0 } : undefined}>
              <textarea
                rows={2}
                maxLength={255}
                value={opt.text}
                placeholder={`Option ${letter} text`}
                onChange={(e) => emitOptions(opts.map((row, idx) => (idx === i ? { ...row, text: e.target.value.slice(0, 255) } : row)))}
                onInput={(e) => sizeChoiceField(e.currentTarget, gameTile)}
                ref={(el) => { if (el) sizeChoiceField(el, gameTile); }}
                className={gameTile ? "tw-mcq-game-tile m-0" : "m-0 tw-mcq-normal-input"}
                style={gameTile ? {
                  background: "transparent", border: "none", outline: "none", resize: "none", overflow: "hidden",
                  width: "100%", boxSizing: "border-box", lineHeight: 1.45,
                  color: pal.ink, fontWeight: 900, fontSize: 18, fontFamily: "inherit", padding: 0,
                  textAlign: "center",
                } : { ...ui.input, resize: "none", overflow: "hidden", lineHeight: 1.45, minHeight: 38, textAlign: "center" }}
              />
              {(mcqImagesEnabled || cfg.voiceRecord) && <div className="tw-mcq-option-media-row">
                {mcqImagesEnabled && <ImageUploadTile compact value={opt.image} label={`Upload option ${letter} image`} onChange={(value) => updateImage(i, value)} c={c} accent={pal.border} />}
                {cfg.voiceRecord && <div className="tw-builder-choice-record"><span>Choice {letter} recording</span><VoiceRecorderButton value={(Array.isArray(cfg.voiceAnswers) ? cfg.voiceAnswers : [])[i] || ""} onChange={(value) => updateRecording(i, value)} /></div>}
              </div>}
            </div>
            <button
              type="button"
              className="tw-mcq-choice-drag-handle"
              title="Drag from anywhere on the choice to reorder"
              aria-label="Choice grip (drag from anywhere on the choice)"
              tabIndex={-1}
            >☰</button>
            {gameTile && <span style={{ position: "absolute", right: 12, bottom: 8, fontSize: 11, fontWeight: 800, color: pal.ink, opacity: 0.65 }}>{opt.text.length}/255</span>}
          </div>;
        })}
      </div>
      <div ref={dragFollowerRef} aria-hidden="true" style={{ display: "none", position: "fixed", left: 0, top: 0, zIndex: 9999, pointerEvents: "none", margin: 0 }} />

      {answerMode === "TWO" && <div className="mt-[14px] text-[12px]" style={{ color: c.textMuted }}>Two-answer mode gives 50% of the question points for each correct selected answer.</div>}
      {correctChoices.length > 0 && <CorrectAnswerExplanation value={cfg.explanation || ""} onChange={(explanation) => onChange({ config: { ...cfg, options: opts, answerMode, mcqMode, explanation } })} ui={ui} c={c} />}

      {showMatchingSuggest && <ActionDialog tone="blue" icon="matching" plainIcon title="Too many choices?" message={<><p className="m-0 mb-3">MCQ is capped at <strong style={{ color: c.text }}>5 choices</strong>. If you need more options, the <strong style={{ color: c.accent }}>Matching</strong> template is a better fit.</p><div className="rounded-[14px] px-[14px] py-3 text-[13px] leading-[1.6]" style={{ background: c.cardBg2, border: `1px solid ${c.border}` }}>Converting will <strong style={{ color: c.text }}>reset this question&apos;s choices and correct answer</strong>. Your question text will be kept.</div></>} onClose={() => setShowMatchingSuggest(false)} width="min(100%, 440px)" actions={<div className="flex flex-col gap-[10px] w-full"><button type="button" className="tw-builder-press tw-builder-press-blue w-full px-4 py-[13px]" style={{ ...primaryBtn({ bg: c.accent, fg: "#fff", border: c.accent }), boxShadow: `0 12px 26px ${c.accent}38` }} onClick={() => { setShowMatchingSuggest(false); onChange({ config: { colA: [{ text: "", image: "" }], colB: [{ text: "", image: "" }], dummyB: [] }, correct: { pairs: [{ aIndex: 0, bIndex: 0 }] }, _convertToMatching: true }); }}>Yes, convert to Matching</button><button type="button" className="tw-builder-press tw-builder-press-neutral w-full" style={{ ...ui.secondaryBtn, padding: "13px 16px", fontSize: 14, fontWeight: 800 }} onClick={() => setShowMatchingSuggest(false)}>Keep MCQ</button></div>} />}
    </div>
  );
}
