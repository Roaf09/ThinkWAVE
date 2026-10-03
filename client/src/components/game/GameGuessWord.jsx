import { useEffect, useState } from "react";
import { TwIcon } from "../TwUI";
import { buildLetterBank, countAnswerLetters } from "../../lib/letterBank";

// Shared Guess-Word renderer for live + assignment gameplay.
// value: { mode?, target?, text?, bank? }, onChange(nextValue).
// onSubmit/submitDisabled are accepted but unused: submitting happens only
// via the main Submit button below the game (one submit, no duplicates).
// Server-provided letterBank/answerLength (student view) are used when
// present so the answer (target) never reaches the student client; teacher
// preview keeps using target.
export function GameGuessWord({ images, target, dummyLetters, letterBank, answerLength, value, onChange, disabled }) {
  const [zoomedImage, setZoomedImage] = useState(null);
  const safeImages = Array.isArray(images) ? images : [];
  const serverBank = Array.isArray(letterBank) && letterBank.length
    ? letterBank.map((x, i) => (typeof x === "string" ? { id: i, ch: x } : { id: Number(x?.id ?? i), ch: String(x?.ch ?? "") })).filter((t) => t.ch)
    : null;
  const serverLen = Number(answerLength) > 0 ? Number(answerLength) : null;
  const answerLen = serverLen || Math.max(1, countAnswerLetters(target));
  const serverBankSig = serverBank ? serverBank.map((t) => `${t.id}:${t.ch}`).join("|") : "";

  useEffect(() => {
    if (serverBank) {
      const curSig = Array.isArray(value?.bank) ? value.bank.map((x) => `${x?.id}:${x?.ch}`).join("|") : "";
      if (value?.mode === "pics4" && curSig === serverBankSig && value.bank.length) return;
      onChange({ mode: "pics4", target: "", text: "", bank: serverBank });
      return;
    }
    if (value?.mode === "pics4" && value?.target === target && value?.bank?.length) return;
    onChange({ mode: "pics4", target, text: "", bank: buildLetterBank(target, Number(dummyLetters || 6)) });
  }, [dummyLetters, target, serverBankSig]);

  const bank = Array.isArray(value?.bank) ? value.bank.map((x, i) => typeof x === "string" ? { id: i, ch: x } : x) : [];
  const built = String(value?.text || "");
  const usedIds = (() => {
    const ids = [];
    const builtChars = built ? built.split("") : [];
    const avail = bank.map((b) => ({ ...b, taken: false }));
    for (const ch of builtChars) {
      const t = avail.find((tile) => !tile.taken && tile.ch === ch);
      if (t) { t.taken = true; ids.push(t.id); }
    }
    return new Set(ids);
  })();

  function tap(id, ch) {
    if (disabled || usedIds.has(id) || built.length >= answerLen) return;
    onChange({ ...value, text: `${built}${ch}` });
  }
  function backspace() { if (!disabled && built) onChange({ ...value, text: built.slice(0, -1) }); }
  function clear() { if (!disabled) onChange({ ...value, text: "" }); }

  const guessBankSignature = bank.map((tile) => `${tile.id}:${tile.ch}`).join("|");
  const guessBuilt = built;
  useEffect(() => {
    const onKeyDown = (event) => {
      if (disabled || event.ctrlKey || event.metaKey || event.altKey) return;
      const targetEl = event.target;
      if (targetEl instanceof HTMLElement && (targetEl.tagName === "INPUT" || targetEl.tagName === "TEXTAREA" || targetEl.isContentEditable)) return;
      if (event.key === "Backspace") {
        if (guessBuilt) { event.preventDefault(); onChange({ ...value, text: String(value?.text || "").slice(0, -1) }); }
        return;
      }
      if (!/^[a-zA-Z]$/.test(event.key) || guessBuilt.length >= answerLen) return;
      const pressed = event.key.toUpperCase();
      const tile = bank.find((candidate) => !usedIds.has(candidate.id) && String(candidate.ch || "").toUpperCase() === pressed);
      if (!tile) return;
      event.preventDefault();
      tap(tile.id, tile.ch);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [disabled, answerLen, guessBankSignature, guessBuilt]);

  return (
    <div className="pics4-wrap simple-mode">
      <div className="pics4-grid compact-grid">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="pics4-frame compact-frame">
            {safeImages[i] ? <img src={safeImages[i]} alt={`Clue ${i + 1}`} loading="lazy" decoding="async" role="button" tabIndex={0} onClick={() => setZoomedImage(safeImages[i])} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setZoomedImage(safeImages[i]); }} /> : <span className="pics4-placeholder">?</span>}
          </div>
        ))}
      </div>
      <div className="pics4-answer-shell">
        <p className="pics4-answer-label">Tap letters to build the word.</p>
        <div className="spell-wrap">
          <div className="spell-display">
            {Array.from({ length: answerLen }).map((_, i) => <div key={i} className="spell-char">{built[i] || "•"}</div>)}
          </div>
          <div className="spell-bank">
            {bank.map(({ id, ch }) => <button key={id} type="button" className={`spell-tile${usedIds.has(id) ? " used" : ""}`} onClick={() => tap(id, ch)} disabled={disabled || usedIds.has(id) || built.length >= answerLen}>{ch}</button>)}
          </div>
          <div className="spell-controls">
            <button type="button" className="spell-ctrl back" onClick={backspace} disabled={disabled || !built}>Back</button>
            <button type="button" className="spell-ctrl clr" onClick={clear} disabled={disabled || !built}>Clear</button>
          </div>
        </div>
      </div>
      {zoomedImage && <div className="sp-image-zoom-backdrop" role="dialog" aria-modal="true" onClick={() => setZoomedImage(null)}><div className="sp-image-zoom-card" onClick={(event) => event.stopPropagation()}><button type="button" className="sp-image-zoom-close" aria-label="Close image" onClick={() => setZoomedImage(null)}><TwIcon name="close" size={22}/></button><img src={zoomedImage} alt="Zoomed clue" /></div></div>}
    </div>
  );
}
