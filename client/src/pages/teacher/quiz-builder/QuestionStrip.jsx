import React from "react";
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
  if (!open && !closing) return null;
  return (
    <aside className={`tw-builder-question-strip${closing ? " is-closing" : ""}`}>
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
            <button
              type="button"
              draggable
              data-strip-index={index}
              className={`tw-builder-question-mini${index === qIndex ? " is-active" : ""}${stripDrag.from === index ? " is-drag-source" : ""}${dragMode && dragMode !== "insertAt" ? ` is-drop-${dragMode}` : ""}${previewShift}${stripSettleIndex === index ? " is-settling" : ""}`}
              onClick={() => {
                if (stripTouchRef.current.moved) { stripTouchRef.current = { active: false, moved: false }; return; }
                if (stripDrag.from !== null) return;
                setNavDir(index > qIndex ? "next" : "prev");
                setQIndex(index);
                setNavTick((v) => v + 1);
              }}
              onDragStart={(event) => {
                setStripDrag({ from: index, to: index, mode: "swap" });
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", String(index));
              }}
              onDragOver={(event) => {
                event.preventDefault();
                if (stripDrag.from === null || stripDrag.from === index) return;
                const rect = event.currentTarget.getBoundingClientRect();
                const ratio = (event.clientY - rect.top) / Math.max(1, rect.height);
                const mode = ratio < .24 ? "before" : ratio > .76 ? "after" : "swap";
                setStripDrag((current) => current.to === index && current.mode === mode ? current : { ...current, to: index, mode });
              }}
              onDrop={(event) => {
                event.preventDefault();
                const from = Number(event.dataTransfer.getData("text/plain"));
                moveQuestionFromStrip(Number.isFinite(from) ? from : stripDrag.from, index, stripDrag.mode || "swap");
              }}
              onDragEnd={() => setStripDrag({ from: null, to: null, mode: null })}
              onTouchStart={() => {
                stripTouchRef.current = { active: true, moved: false };
                setStripDrag({ from: index, to: index, mode: "swap" });
              }}
              onTouchMove={(e) => {
                const t = e.touches?.[0];
                if (!t) return;
                stripTouchRef.current.moved = true;
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
                if (!stripTouchRef.current.active) return;
                const wasMoved = stripTouchRef.current.moved;
                setStripDrag((current) => {
                  if (current.from !== null && current.to !== null && (wasMoved || current.from !== current.to)) {
                    const { from, to, mode } = current;
                    if (from !== to || (mode && mode !== "swap")) {
                      window.setTimeout(() => moveQuestionFromStrip(from, to, mode || "swap"), 0);
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
            </button>
            <div className={`tw-builder-question-strip-gap${stripDrag.mode === "insertAt" && stripDrag.to === index + 1 ? " is-active" : ""}`} onDragOver={(event) => { event.preventDefault(); setStripDrag((current) => current.from === null ? current : { ...current, to: index + 1, mode: "insertAt" }); }} onDrop={(event) => { event.preventDefault(); const from = Number(event.dataTransfer.getData("text/plain")); moveQuestionFromStrip(Number.isFinite(from) ? from : stripDrag.from, index + 1, "insertAt"); }} />
          </React.Fragment>;
        })}
      </div>
    </aside>
  );
}

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
