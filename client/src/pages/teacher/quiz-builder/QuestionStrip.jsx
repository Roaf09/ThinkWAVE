import React, { memo, useCallback, useRef } from "react";
import { summarizeBuilderQuestion } from "./builderColorUtils";

export function QuestionStrip({
  open,
  closing,
  questions,
  qIndex,
  setQIndex,
  setNavDir,
  setNavTick,
  templateType,
  stripDrag,
  setStripDrag,
  stripSettleIndex,
  stripTouchRef,
  closeQuestionStrip,
  moveQuestionFromStrip,
}) {
  // Floating drag copy, same recipe as the MCQ choice reorder: the real card
  // stays in place (dimmed by is-drag-source) while a live clone of it rides
  // the cursor/finger, and the browser's washed-out native ghost is hidden.
  // Hooks stay above the closed-strip early return below.
  const dragFollowerRef = useRef(null);
  const dragOffsetRef = useRef({ x: 24, y: 40 });
  const touchGhostRef = useRef(null);
  // Latest moveQuestionFromStrip by ref: rows below are memoized, so they
  // must not receive the ever-changing function itself as a prop.
  const moveRef = useRef(null);
  moveRef.current = moveQuestionFromStrip;
  const moveDragFollower = useCallback((clientX, clientY) => {
    const host = dragFollowerRef.current;
    if (!host) return;
    const off = dragOffsetRef.current;
    host.style.transform = `translate3d(${clientX - off.x}px, ${clientY - off.y}px, 0)`;
  }, []);
  const followDragPointer = useCallback((event) => {
    moveDragFollower(event.clientX, event.clientY);
  }, [moveDragFollower]);
  const showCardGhost = useCallback((source, clientX, clientY) => {
    const host = dragFollowerRef.current;
    if (!host || !source) return;
    const rect = source.getBoundingClientRect();
    dragOffsetRef.current = {
      x: Math.max(0, (clientX ?? rect.left + 24) - rect.left),
      y: Math.max(0, (clientY ?? rect.top + 40) - rect.top),
    };
    const preview = source.cloneNode(true);
    preview.className = "tw-builder-question-mini";
    preview.style.width = `${rect.width}px`;
    preview.style.margin = "0";
    preview.style.transform = "none";
    preview.style.opacity = "1";
    preview.style.pointerEvents = "none";
    host.innerHTML = "";
    host.appendChild(preview);
    host.style.display = "block";
    host.style.willChange = "transform";
    moveDragFollower(clientX, clientY);
  }, [moveDragFollower]);
  const hideCardGhost = useCallback(() => {
    const host = dragFollowerRef.current;
    if (host) { host.style.display = "none"; host.style.willChange = ""; host.innerHTML = ""; }
  }, []);
  if (!open && !closing) return null;
  return (
    <aside className={`tw-builder-question-strip${closing ? " is-closing" : ""}`}>
      <div ref={dragFollowerRef} aria-hidden="true" style={{ display: "none", position: "fixed", left: 0, top: 0, zIndex: 9999, pointerEvents: "none", margin: 0 }} />
      <div className="tw-builder-question-strip-head"><button type="button" className="tw-builder-question-strip-close" aria-label="Close question sidebar" title="Close" onClick={closeQuestionStrip}>×</button></div>
      <div className="tw-builder-question-strip-list">
        <div className={`tw-builder-question-strip-gap${stripDrag.mode === "insertAt" && stripDrag.to === 0 ? " is-active" : ""}`} onDragOver={(event) => { event.preventDefault(); setStripDrag((current) => current.from === null ? current : { ...current, to: 0, mode: "insertAt" }); }} onDrop={(event) => { event.preventDefault(); const from = Number(event.dataTransfer.getData("text/plain")); moveQuestionFromStrip(Number.isFinite(from) ? from : stripDrag.from, 0, "insertAt"); }} />
        {questions.map((row, index) => {
          const dragMode = stripDrag.to === index ? stripDrag.mode : null;
          const previewShift = stripDrag.from !== null && stripDrag.to !== null && stripDrag.from !== index
            ? (stripDrag.from < stripDrag.to && index > stripDrag.from && index <= Math.min(stripDrag.to, questions.length - 1) ? " is-preview-shift-up"
              : stripDrag.from > stripDrag.to && index >= stripDrag.to && index < stripDrag.from ? " is-preview-shift-down" : "")
            : "";
          return <React.Fragment key={row.id || `question-${index}`}>
            <StripMiniButton
              row={row}
              index={index}
              isActive={index === qIndex}
              qIndex={qIndex}
              templateType={templateType}
              dragFrom={stripDrag.from}
              dropMode={dragMode}
              previewShift={previewShift}
              isSettling={stripSettleIndex === index}
              setQIndex={setQIndex}
              setNavDir={setNavDir}
              setNavTick={setNavTick}
              setStripDrag={setStripDrag}
              stripTouchRef={stripTouchRef}
              touchGhostRef={touchGhostRef}
              moveRef={moveRef}
              showCardGhost={showCardGhost}
              moveDragFollower={moveDragFollower}
              followDragPointer={followDragPointer}
              hideCardGhost={hideCardGhost}
            />
            <div className={`tw-builder-question-strip-gap${stripDrag.mode === "insertAt" && stripDrag.to === index + 1 ? " is-active" : ""}`} onDragOver={(event) => { event.preventDefault(); setStripDrag((current) => current.from === null ? current : { ...current, to: index + 1, mode: "insertAt" }); }} onDrop={(event) => { event.preventDefault(); const from = Number(event.dataTransfer.getData("text/plain")); moveQuestionFromStrip(Number.isFinite(from) ? from : stripDrag.from, index + 1, "insertAt"); }} />
          </React.Fragment>;
        })}
      </div>
    </aside>
  );
}

// One mini question card. Memoized so typing in the editor only redraws the
// edited row: untouched rows keep their object identity upstream, and every
// other prop here is a primitive, a stable setter, or a stable ref.
const StripMiniButton = memo(function StripMiniButton({
  row,
  index,
  isActive,
  qIndex,
  templateType,
  dragFrom,
  dropMode,
  previewShift,
  isSettling,
  setQIndex,
  setNavDir,
  setNavTick,
  setStripDrag,
  stripTouchRef,
  touchGhostRef,
  moveRef,
  showCardGhost,
  moveDragFollower,
  followDragPointer,
  hideCardGhost,
}) {
  return <button
    type="button"
    draggable
    data-strip-index={index}
    className={`tw-builder-question-mini${isActive ? " is-active" : ""}${dragFrom === index ? " is-drag-source" : ""}${dropMode && dropMode !== "insertAt" ? ` is-drop-${dropMode}` : ""}${previewShift}${isSettling ? " is-settling" : ""}`}
    onClick={() => {
      if (stripTouchRef.current.moved) { stripTouchRef.current = { active: false, moved: false }; return; }
      if (dragFrom !== null) return;
      setNavDir(index > qIndex ? "next" : "prev");
      setQIndex(index);
      setNavTick((v) => v + 1);
    }}
    onDragStart={(event) => {
      setStripDrag({ from: index, to: index, mode: "swap" });
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", String(index));
      const source = event.currentTarget;
      showCardGhost(source, event.clientX, event.clientY);
      const blank = document.createElement("canvas");
      blank.width = 1; blank.height = 1;
      event.dataTransfer.setDragImage(blank, 0, 0);
      document.addEventListener("dragover", followDragPointer);
      const cleanup = () => {
        document.removeEventListener("dragover", followDragPointer);
        hideCardGhost();
        source.removeEventListener("dragend", cleanup);
      };
      source.addEventListener("dragend", cleanup);
    }}
    onDragOver={(event) => {
      event.preventDefault();
      if (dragFrom === null || dragFrom === index) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const ratio = (event.clientY - rect.top) / Math.max(1, rect.height);
      const mode = ratio < .24 ? "before" : ratio > .76 ? "after" : "swap";
      setStripDrag((current) => current.to === index && current.mode === mode ? current : { ...current, to: index, mode });
    }}
    onDrop={(event) => {
      event.preventDefault();
      const from = Number(event.dataTransfer.getData("text/plain"));
      moveRef.current?.(Number.isFinite(from) ? from : dragFrom, index, dropMode || "swap");
    }}
    onDragEnd={() => setStripDrag({ from: null, to: null, mode: null })}
    onTouchStart={(event) => {
      stripTouchRef.current = { active: true, moved: false };
      setStripDrag({ from: index, to: index, mode: "swap" });
      const t = event.touches?.[0];
      touchGhostRef.current = { source: event.currentTarget, shown: false, x: t?.clientX ?? 0, y: t?.clientY ?? 0 };
    }}
    onTouchMove={(e) => {
      const t = e.touches?.[0];
      if (!t) return;
      stripTouchRef.current.moved = true;
      const ghost = touchGhostRef.current;
      if (ghost && !ghost.shown) {
        ghost.shown = true;
        showCardGhost(ghost.source, t.clientX, t.clientY);
      } else if (ghost?.shown) {
        moveDragFollower(t.clientX, t.clientY);
      }
      const el = document.elementFromPoint(t.clientX, t.clientY);
      const rowEl = el?.closest?.("[data-strip-index]");
      if (!rowEl) return;
      const over = Number(rowEl.getAttribute("data-strip-index"));
      if (!Number.isFinite(over)) return;
      const rect = rowEl.getBoundingClientRect();
      const ratio = (t.clientY - rect.top) / Math.max(1, rect.height);
      const mode = ratio < .24 ? "before" : ratio > .76 ? "after" : "swap";
      setStripDrag((current) => {
        if (current.from === null) return { from: over, to: over, mode };
        return (current.to === over && current.mode === mode ? current : { ...current, to: over, mode });
      });
    }}
    onTouchEnd={() => {
      touchGhostRef.current = null;
      hideCardGhost();
      if (!stripTouchRef.current.active) return;
      const wasMoved = stripTouchRef.current.moved;
      setStripDrag((current) => {
        if (current.from !== null && current.to !== null && (wasMoved || current.from !== current.to)) {
          const { from, to, mode } = current;
          if (from !== to || (mode && mode !== "swap")) {
            window.setTimeout(() => moveRef.current?.(from, to, mode || "swap"), 0);
            return { from: null, to: null, mode: null };
          }
        }
        return { from: null, to: null, mode: null };
      });
      if (!wasMoved) stripTouchRef.current = { active: false, moved: false };
      // when moved, keep moved=true until click suppression consumes it
    }}
    style={{ touchAction: "pan-y" }}
  >
    <strong>{index + 1}</strong>
    <span className="tw-mini-question-prompt">{row.prompt || "Untitled question"}</span>
    <small className="tw-mini-question-answer">{summarizeBuilderQuestion(row, templateType)}</small>
  </button>;
});

export function BuilderMobileDots({ questions, qIndex, setQIndex, setNavDir, setNavTick, isBatchTemplate }) {
  return (
    <div className="tw-builder-mobile-dots" role="tablist" aria-label="Questions">
      {questions.map((_, index) => (
        <button
          key={index}
          type="button"
          role="tab"
          aria-selected={index === qIndex}
          aria-label={`Go to ${isBatchTemplate ? "batch" : "question"} ${index + 1}`}
          className={`tw-builder-mobile-dot${index === qIndex ? " is-active" : ""}`}
          onClick={() => {
            if (index === qIndex) return;
            setNavDir(index > qIndex ? "next" : "prev");
            setQIndex(index);
            setNavTick((v) => v + 1);
          }}
        />
      ))}
    </div>
  );
}
