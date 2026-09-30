import { useEffect, useRef, useState } from "react";

// Shared gameplay protection for live sessions + assignments.
//
// Two jobs:
// 1. awayBlur — mirrors the assignment behavior on the live side: while the
//    tab is hidden the gameplay is visually blurred out. (Live already
//    *counts* tab-outs server-side; it just never showed anything.)
// 2. Capture deterrents — best-effort only. Browsers expose no API that can
//    truly block OS screenshots or screen recording, so this blanks the
//    screen the moment a capture keystroke is seen (PrintScreen fires
//    keydown *before* the OS grabs the frame), blocks print/save shortcuts,
//    and disables copy + context menu outside answer inputs.
//
// `active` gates everything so lobby/intro screens stay unrestricted.
export function useGameplayProtection({ active, onCaptureAttempt }) {
  const [awayBlur, setAwayBlur] = useState(false);
  const [shotBlocked, setShotBlocked] = useState(false);
  const activeRef = useRef(active);
  activeRef.current = active;
  const captureRef = useRef(onCaptureAttempt);
  captureRef.current = onCaptureAttempt;
  const shotTimer = useRef(null);

  useEffect(() => {
    function flashShotBlock() {
      if (!activeRef.current) return;
      setShotBlocked(true);
      // Silent tally for the host panel (no warning to the student): one
      // count per distinct key press. Held keys must not spam the count.
      try { captureRef.current?.(); } catch {}
      // Best-effort: empty a clipboard a PrintScreen may have just filled.
      try {
        const done = navigator.clipboard?.writeText("");
        if (done?.catch) done.catch(() => {});
      } catch {}
      clearTimeout(shotTimer.current);
      shotTimer.current = setTimeout(() => setShotBlocked(false), 1800);
    }

    function onKeyDown(e) {
      if (!activeRef.current) return;
      if (e.repeat) return;
      if (e.key === "PrintScreen" || e.code === "PrintScreen") {
        try { e.preventDefault(); } catch {}
        flashShotBlock();
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || !e.key) return;
      const key = String(e.key).toLowerCase();
      // Print / save-as would export the questions; Meta+P/S cover macOS too.
      if (key === "p" || key === "s" || key === "u") {
        try { e.preventDefault(); } catch {}
        if (key === "p") flashShotBlock();
      }
    }

    function inField(target) {
      return !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
    }

    // Copying question text out is blocked; typing/editing answers still works.
    function onCopy(e) {
      if (!activeRef.current || inField(e.target)) return;
      try { e.preventDefault(); } catch {}
    }

    // Long-press / right-click menus are blocked except inside answer inputs
    // (mobile students still need paste while typing answers).
    function onContextMenu(e) {
      if (!activeRef.current || inField(e.target)) return;
      try { e.preventDefault(); } catch {}
    }

    function onHide() {
      if (activeRef.current && document.hidden) setAwayBlur(true);
    }

    function onShow() {
      if (!document.hidden) setAwayBlur(false);
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("copy", onCopy);
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("focus", onShow);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("focus", onShow);
      clearTimeout(shotTimer.current);
    };
  }, []);

  // Leaving gameplay clears every visual guard and the body lock.
  useEffect(() => {
    document.body.classList.toggle("sp-capture-guarded", !!active);
    if (!active) {
      setAwayBlur(false);
      setShotBlocked(false);
    }
    return () => document.body.classList.remove("sp-capture-guarded");
  }, [active]);

  return { awayBlur, shotBlocked };
}
