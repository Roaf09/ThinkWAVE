import { useEffect, useRef, useState } from "react";

// Shared gameplay protection for live sessions + assignments.
//
// Two jobs:
// 1. awayBlur — while the tab is hidden / window loses focus the gameplay is
//    visually blurred out. Live already *counts* tab-outs server-side.
// 2. Capture deterrents — best-effort only. Browsers expose no API that can
//    truly block OS screenshots or screen recording, so this blanks the
//    screen the moment a capture keystroke/combo is seen (PrintScreen fires
//    keydown *before* the OS grabs the frame; Snip / Game Bar / macOS
//    shortcuts steal focus which fires window blur), blocks print/save
//    shortcuts, and disables copy + context menu outside answer inputs.
//    Mobile (touch-first devices) has no keyboard shortcut to catch, and no
//    browser API reports a screenshot. So two best-effort signals are used:
//      a) a 3+ finger touch (the 3-finger-swipe screenshot gesture on many
//         Android phones), and
//      b) a very short window blur -> focus round trip where the page never
//         became hidden (what the system screenshot flash / overlay does on
//         many phones; a real app switch hides the page and is already
//         counted as a tab-out, so it is excluded here).
//    Both feed the same flashShotBlock() path as PrintScreen: instant blur +
//    the same server tally (the host panel's "screen captures" count).
// 3. Fullscreen gate — optional. When requireFullscreen is true the quiz
//    stays blurred + non-interactive until the student enters fullscreen.
//    iOS Safari (no Fullscreen API) is auto-exempt so it never deadlocks.
//
// `active` gates everything so lobby/intro screens stay unrestricted.
// `requireFullscreen` gates only the fullscreen block (pass LIVE/playing).
// `captureActive` (optional, defaults to `active`) gates ONLY screenshot /
// capture detection (tally + capture blur), so a screen can keep the other
// protections on while not counting captures (e.g. the live waiting lobby).
export function useGameplayProtection({ active, requireFullscreen = false, captureActive, onCaptureAttempt }) {
  const [awayBlur, setAwayBlur] = useState(false);
  const [shotBlocked, setShotBlocked] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(
    () => typeof document !== "undefined" && !!document.fullscreenElement
  );
  const [fullscreenSupported, setFullscreenSupported] = useState(false);
  const activeRef = useRef(active);
  activeRef.current = active;
  const captureActiveRef = useRef(captureActive ?? active);
  captureActiveRef.current = captureActive ?? active;
  const captureRef = useRef(onCaptureAttempt);
  captureRef.current = onCaptureAttempt;
  const shotTimer = useRef(null);
  const lastShotAtRef = useRef(0);
  const blurAtRef = useRef(0);
  const hiddenSinceBlurRef = useRef(false);

  // Fullscreen availability: iPhone Safari has no Fullscreen API —
  // exempt it instead of soft-locking the quiz.
  useEffect(() => {
    try {
      setFullscreenSupported(
        !!document.fullscreenEnabled && !!document.documentElement?.requestFullscreen
      );
    } catch {
      setFullscreenSupported(false);
    }
    function onFsChange() {
      setIsFullscreen(!!document.fullscreenElement);
      // Re-entering fullscreen clears the blur immediately.
      if (document.fullscreenElement) setAwayBlur(false);
    }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  function enterFullscreen() {
    try {
      const p = document.documentElement?.requestFullscreen?.();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch {}
  }

  const needsFullscreen =
    !!requireFullscreen && !!active && !!fullscreenSupported && !isFullscreen;

  useEffect(() => {
    function flashShotBlock() {
      if (!activeRef.current || !captureActiveRef.current) return;
      lastShotAtRef.current = Date.now();
      setShotBlocked(true);
      // Instant opaque cover: Snip / Game Bar overlays steal window focus,
      // so the blur below (onWindowBlur) is already up — this extends it so
      // the captured frame stays blurred.
      setAwayBlur(true);
      // Silent tally for the host panel (no warning to the student): one
      // count per distinct key press. Held keys must not spam the count.
      try { captureRef.current?.(); } catch {}
      // Best-effort: empty a clipboard a PrintScreen may have just filled.
      try {
        const done = navigator.clipboard?.writeText("");
        if (done?.catch) done.catch(() => {});
      } catch {}
      clearTimeout(shotTimer.current);
      shotTimer.current = setTimeout(() => {
        setShotBlocked(false);
        // Keep awayBlur only if the page is genuinely hidden / unfocused.
        try {
          if (!document.hidden && document.hasFocus()) setAwayBlur(false);
        } catch {
          setAwayBlur(false);
        }
      }, 1800);
    }

    // Primary input is touch (phones/tablets). Touch-screen laptops keep a
    // fine primary pointer, so Alt-Tab / Snip there are not misread as phones.
    function isTouchFirst() {
      try { return !!window.matchMedia?.("(pointer: coarse)")?.matches; } catch { return false; }
    }

    // Mobile detections can overlap (3-finger swipe + the blur it causes), so
    // count at most one capture per 2.5s. Desktop key paths are unaffected.
    function flashMobileShot() {
      if (!activeRef.current || !captureActiveRef.current) return;
      if (Date.now() - lastShotAtRef.current < 2500) return;
      flashShotBlock();
    }

    function onTouchStart(e) {
      if (!activeRef.current || !isTouchFirst()) return;
      if ((e.touches?.length || 0) >= 3) flashMobileShot();
    }

    function isPrintScreen(e) {
      try {
        if (e.key === "PrintScreen" || e.code === "PrintScreen") return true;
        if (Number(e.keyCode) === 44) return true;
      } catch {}
      return false;
    }

    function onKeyDown(e) {
      if (!activeRef.current) return;
      if (e.repeat) return;
      // 1. Physical PrintScreen (keydown fires before OS grab on Windows).
      if (isPrintScreen(e)) {
        try { e.preventDefault(); } catch {}
        flashShotBlock();
        return;
      }
      const key = String(e.key || "").toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      // 2. Snip: Win+Shift+S / Ctrl+Shift+S / Cmd+Shift+S.
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && key === "s") {
        try { e.preventDefault(); } catch {}
        flashShotBlock();
        return;
      }
      // 3. macOS screenshots: Cmd+Shift+3/4/5/6 (also blocks Cmd+Shift+4 crop).
      if (e.metaKey && e.shiftKey && ["3", "4", "5", "6"].includes(key)) {
        try { e.preventDefault(); } catch {}
        flashShotBlock();
        return;
      }
      // 4. Xbox Game Bar: Win+G (overlay) / Win+Alt+R (record toggle).
      if (e.metaKey && (key === "g" || (e.altKey && key === "r"))) {
        try { e.preventDefault(); } catch {}
        flashShotBlock();
        return;
      }
      // 5. DevTools quick-open raises the bar slightly (menu still exists).
      // F12 included for consistency — it does not block DevTools.
      if (key === "f12" || ((e.ctrlKey || e.metaKey) && e.shiftKey && ["i", "j", "c"].includes(key))) {
        try { e.preventDefault(); } catch {}
        return;
      }
      if (!mod || !e.key) return;
      // Print / save-as would export the questions; Meta+P/S cover macOS too.
      if (key === "p" || key === "s" || key === "u") {
        try { e.preventDefault(); } catch {}
        if (key === "p") flashShotBlock();
      }
    }

    // Some browsers (notably Chrome on certain layouts) fire PrintScreen on
    // keyup only — catch it there too.
    function onKeyUp(e) {
      if (!activeRef.current) return;
      if (isPrintScreen(e)) {
        try { e.preventDefault(); } catch {}
        flashShotBlock();
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
      if (document.hidden) hiddenSinceBlurRef.current = true;
      if (activeRef.current && document.hidden) setAwayBlur(true);
    }

    function onShow() {
      if (!document.hidden) setAwayBlur(false);
    }

    // Snip / Game Bar / Alt-Tab / screen-record control-center all steal
    // window focus without hiding the document. Blurring instantly here is
    // what makes the captured frame come out blurred.
    function onWindowBlur() {
      blurAtRef.current = Date.now();
      hiddenSinceBlurRef.current = !!document.hidden;
      if (activeRef.current) setAwayBlur(true);
    }

    function onWindowFocus() {
      // Mobile screenshot heuristic: focus came straight back (<2s) and the
      // page was never hidden, so this was not an app/tab switch.
      const awayMs = Date.now() - blurAtRef.current;
      if (blurAtRef.current && awayMs < 2000 && !hiddenSinceBlurRef.current && isTouchFirst()) {
        flashMobileShot();
      }
      blurAtRef.current = 0;
      try {
        if (!document.hidden) setAwayBlur(false);
      } catch {
        setAwayBlur(false);
      }
    }

    function onBeforePrint(e) {
      if (!activeRef.current) return;
      try { e.preventDefault(); } catch {}
      flashShotBlock();
      setAwayBlur(true);
    }

    function onAfterPrint() {
      try {
        if (!document.hidden) setAwayBlur(false);
      } catch {
        setAwayBlur(false);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("copy", onCopy);
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("focus", onShow);
    window.addEventListener("focus", onWindowFocus);
    window.addEventListener("blur", onWindowBlur);
    window.addEventListener("beforeprint", onBeforePrint);
    window.addEventListener("afterprint", onAfterPrint);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("focus", onShow);
      window.removeEventListener("focus", onWindowFocus);
      window.removeEventListener("blur", onWindowBlur);
      window.removeEventListener("beforeprint", onBeforePrint);
      window.removeEventListener("afterprint", onAfterPrint);
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

  return { awayBlur, shotBlocked, isFullscreen, needsFullscreen, enterFullscreen, fullscreenSupported };
}
