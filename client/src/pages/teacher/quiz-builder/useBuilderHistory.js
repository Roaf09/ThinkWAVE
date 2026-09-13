import { useEffect, useRef, useState } from "react";

// Undo/redo works at the level of the whole `questions` array: any
// mutation anywhere in the builder (typing, adding, deleting, duplicating,
// moving, locking...) eventually flows through setQuestions, so watching
// that single value catches every kind of change without having to
// instrument each handler individually. Rapid-fire changes (typing) are
// coalesced into one history entry after a short pause so undo moves in
// sensible chunks instead of one keystroke at a time.
export function useBuilderHistory({ questions, setQuestions, setQIndex, setIsSaved, editVersionRef }) {
  const historyRef = useRef({ stack: [], index: -1, skip: false, timer: null });
  const [, setHistoryTick] = useState(0);

  useEffect(() => {
    const h = historyRef.current;
    if (h.skip) { h.skip = false; return; }
    if (!questions || !questions.length) return;
    const snapshot = JSON.parse(JSON.stringify(questions));
    if (h.timer) clearTimeout(h.timer);
    h.timer = window.setTimeout(() => {
      h.stack = h.stack.slice(0, h.index + 1);
      h.stack.push(snapshot);
      if (h.stack.length > 60) h.stack.shift();
      h.index = h.stack.length - 1;
      setHistoryTick((v) => v + 1);
    }, 550);
    return () => { if (h.timer) clearTimeout(h.timer); };
  }, [questions]);

  function undo() {
    const h = historyRef.current;
    if (h.index <= 0) return;
    if (h.timer) { clearTimeout(h.timer); h.timer = null; }
    h.index -= 1;
    h.skip = true;
    const restored = JSON.parse(JSON.stringify(h.stack[h.index]));
    editVersionRef.current += 1;
    setQuestions(restored);
    setIsSaved(false);
    setQIndex((i) => Math.min(i, restored.length - 1));
    setHistoryTick((v) => v + 1);
  }

  function redo() {
    const h = historyRef.current;
    if (h.index >= h.stack.length - 1) return;
    if (h.timer) { clearTimeout(h.timer); h.timer = null; }
    h.index += 1;
    h.skip = true;
    const restored = JSON.parse(JSON.stringify(h.stack[h.index]));
    editVersionRef.current += 1;
    setQuestions(restored);
    setIsSaved(false);
    setQIndex((i) => Math.min(i, restored.length - 1));
    setHistoryTick((v) => v + 1);
  }

  const canUndo = historyRef.current.index > 0;
  const canRedo = historyRef.current.index < historyRef.current.stack.length - 1;

  return { undo, redo, canUndo, canRedo };
}
