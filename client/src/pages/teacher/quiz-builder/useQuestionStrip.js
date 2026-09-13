import { useRef, useState } from "react";

export function useQuestionStrip({ questions, qIndex, setQIndex, markUnsaved, onOpen }) {
  const [questionStripOpen, setQuestionStripOpen] = useState(false);
  const [questionStripClosing, setQuestionStripClosing] = useState(false);
  const [stripDrag, setStripDrag] = useState({ from: null, to: null, mode: null });
  const [stripSettleIndex, setStripSettleIndex] = useState(null);
  const stripTouchRef = useRef({ active: false, moved: false });

  function closeQuestionStrip() {
    if (!questionStripOpen || questionStripClosing) return;
    setQuestionStripClosing(true);
    window.setTimeout(() => {
      setQuestionStripOpen(false);
      setQuestionStripClosing(false);
      setStripDrag({ from: null, to: null, mode: null });
    }, 260);
  }

  function toggleQuestionStrip() {
    if (questionStripOpen) closeQuestionStrip();
    else {
      onOpen?.();
      setQuestionStripClosing(false);
      setQuestionStripOpen(true);
    }
  }

  function moveQuestionFromStrip(from, to, mode) {
    const inserting = mode === "insertAt";
    if (from === null || to === null || from < 0 || to < 0 || from >= questions.length || (!inserting && to >= questions.length) || (inserting && to > questions.length)) return;
    if (!inserting && from === to) return;
    const rows = questions;
    const next = [...rows];
    let selectedIndex = qIndex;
    if (mode === "swap") {
      [next[from], next[to]] = [next[to], next[from]];
      if (qIndex === from) selectedIndex = to;
      else if (qIndex === to) selectedIndex = from;
    } else {
      const activeRow = rows[qIndex];
      const [moving] = next.splice(from, 1);
      let insertAt = to;
      if (from < to) insertAt -= 1;
      if (mode === "after") insertAt += 1;
      insertAt = Math.max(0, Math.min(next.length, insertAt));
      next.splice(insertAt, 0, moving);
      selectedIndex = qIndex === from ? insertAt : Math.max(0, next.indexOf(activeRow));
    }
    markUnsaved(next.map((row, index) => ({ ...row, order: index })));
    setQIndex(selectedIndex);
    setStripSettleIndex(selectedIndex);
    window.setTimeout(() => setStripSettleIndex(null), 330);
    // Reordering from the pager/strip must not animate or otherwise affect the
    // background question form — keep the background stable.
    setStripDrag({ from: null, to: null, mode: null });
  }

  return {
    questionStripOpen,
    questionStripClosing,
    stripDrag,
    setStripDrag,
    stripSettleIndex,
    stripTouchRef,
    closeQuestionStrip,
    toggleQuestionStrip,
    moveQuestionFromStrip,
  };
}
