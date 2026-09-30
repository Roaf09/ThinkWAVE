import { useEffect, useRef, useState } from "react";

// Undo/redo works at the level of the whole `questions` array: any
// mutation anywhere in the builder (typing, adding, deleting, duplicating,
// moving, locking...) eventually flows through setQuestions, so watching
// that single value catches every kind of change without having to
// instrument each handler individually. Rapid-fire changes (typing) are
// coalesced into one history entry after a short pause so undo moves in
// sensible chunks instead of one keystroke at a time.
// Media blobs (photos, voice recordings) never belong in an undo entry:
// they dwarf the text and would make every snapshot huge. Text undo stays,
// media stays as-is in the live quiz. Same policy the top-level fields
// already had, extended to nested choice/pair/image lists.
function stripMediaStrings(value) {
  if (typeof value === "string") {
    return value.startsWith("data:image/") || value.startsWith("data:audio/") ? "" : value;
  }
  if (Array.isArray(value)) return value.map(stripMediaStrings);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value)) out[key] = stripMediaStrings(value[key]);
    return out;
  }
  return value;
}

export function useBuilderHistory({ questions, setQuestions, setQIndex, setIsSaved, editVersionRef }) {
  const historyRef = useRef({ stack: [], index: -1, skip: false, timer: null, pending: null });
  const [, setHistoryTick] = useState(0);

  useEffect(() => {
    const h = historyRef.current;
    if (h.skip) { h.skip = false; return; }
    if (!questions || !questions.length) return;
    // Remember the latest questions, but clone them only if the pause
    // actually completes. Cloning the whole quiz on every keystroke was the
    // heaviest per-letter cost in the builder.
    h.pending = questions;
    if (h.timer) clearTimeout(h.timer);
    h.timer = window.setTimeout(() => {
      const latest = h.pending;
      h.pending = null;
      if (!latest || !latest.length) return;
      const snapshot = JSON.parse(JSON.stringify(latest));
      h.stack = h.stack.slice(0, h.index + 1);
      const light = snapshot.map((q) => {
        if (!q || typeof q !== "object") return q;
        const cfg = q.config_json && typeof q.config_json === "object" ? { ...q.config_json } : q.config_json;
        const cor = q.correct_json && typeof q.correct_json === "object" ? { ...q.correct_json } : q.correct_json;
        return { ...q, config_json: stripMediaStrings(cfg), correct_json: stripMediaStrings(cor) };
      });
      h.stack.push(light);
      if (h.stack.length > 25) h.stack.shift();
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
