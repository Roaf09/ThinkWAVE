import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useColors, useTheme } from "../context/ThemeContext";

function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

function parseHexColor(value) {
  const hex = String(value || "").trim().replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
}

function mixHexColor(accent, base, accentWeight = 0.2) {
  const a = parseHexColor(accent);
  const b = parseHexColor(base);
  if (!a || !b) return base;
  const weight = clamp(Number(accentWeight) || 0, 0, 1);
  const mixed = a.map((channel, index) => Math.round(channel * weight + b[index] * (1 - weight)));
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function darkenHexColor(accent, amount = 0.34) {
  const rgb = parseHexColor(accent);
  if (!rgb) return "#173e9c";
  const factor = clamp(1 - Number(amount || 0), 0, 1);
  return `#${rgb.map((channel) => Math.round(channel * factor).toString(16).padStart(2, "0")).join("")}`;
}

// Preserve a teacher-dragged dialogue position across closely related tutorial copy
// steps that remount the bubble (for example “Start here…” -> “Done?”).
const DRAG_POSITIONS = new Map();

export default function ThinkBotTutorial({
  open = true,
  target,
  children,
  actionLabel,
  onAction,
  actionDelay = 0,
  secondaryLabel,
  onSecondary,
  hint,
  placement = "auto",
  highlight = true,
  highlightMode = "spotlight",
  highlightPadding = 7,
  className = "",
  transparent = false,
  square = false,
  dialogWidth,
  matchTargetHeight = false,
  blockInteraction = true,
  allowTargetInteraction = true,
  clickAnywhere = false,
  onClickAnywhere,
  clickAnywhereLabel = "Click anywhere to continue...",
  dragKey,
  accentColor,
  reserveActionSpace = false,
}) {
  const c = useColors();
  const { dark } = useTheme();
  const tutorialAccent = accentColor || c.accent;
  const tutorialBase = darkenHexColor(tutorialAccent, dark ? 0.28 : 0.38);
  const tutorialSurface = accentColor
    ? mixHexColor(tutorialAccent, dark ? "#102443" : "#ffffff", dark ? 0.24 : 0.16)
    : (dark ? "#102443" : "#fff");
  const [rect, setRect] = useState(null);
  const [actionReady, setActionReady] = useState(actionDelay <= 0);
  const [dragPosition, setDragPosition] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [bubbleSize, setBubbleSize] = useState(null);
  const targetNodeRef = useRef(null);
  const bubbleRef = useRef(null);
  const dragSessionRef = useRef(null);
  const suppressClickRef = useRef(false);
  const resolvedDragKey = dragKey || (typeof target === "string" ? `${target}|${placement}` : null);

  // Keep the delay tied to the tutorial stage/component instance rather than child identity.
  // Theme changes re-render children, so depending on children/actionLabel would restart the timer.
  useEffect(() => {
    setActionReady(actionDelay <= 0);
    if (actionDelay <= 0) return undefined;
    const timer = window.setTimeout(() => setActionReady(true), actionDelay);
    return () => window.clearTimeout(timer);
  }, [actionDelay]);

  useLayoutEffect(() => {
    if (!open || typeof document === "undefined") return undefined;
    let raf = 0;
    const resolve = () => {
      const node = typeof target === "string" ? document.querySelector(target) : target?.current || target || null;
      targetNodeRef.current = node;
      if (!node?.getBoundingClientRect) { setRect(null); return; }
      const next = node.getBoundingClientRect();
      setRect({ left: next.left, top: next.top, right: next.right, bottom: next.bottom, width: next.width, height: next.height });
    };
    const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(resolve); };
    resolve();
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    const interval = window.setInterval(resolve, 220);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(interval);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      targetNodeRef.current = null;
    };
  }, [open, target]);

  // Tutorial bubbles became content-sized in later revisions. Measure the real
  // rendered height so above/below/side placement stays close to the target
  // instead of reserving the old fixed 260–330px dialogue height.
  useLayoutEffect(() => {
    if (!open || !bubbleRef.current) return undefined;
    const node = bubbleRef.current;
    const measure = () => {
      const next = { width: node.offsetWidth, height: node.offsetHeight };
      setBubbleSize((current) => current && current.width === next.width && current.height === next.height ? current : next);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [open, children, actionReady, clickAnywhere, square, dialogWidth]);

  // Start a new anchor from its intended position, except when a related
  // tutorial step shares the same drag key. In that case keep the teacher's
  // chosen position instead of snapping the bubble back.
  useEffect(() => {
    setDragPosition(resolvedDragKey ? (DRAG_POSITIONS.get(resolvedDragKey) || null) : null);
    setDragging(false);
    dragSessionRef.current = null;
  }, [resolvedDragKey, dialogWidth, square, matchTargetHeight]);

  useEffect(() => {
    if (!open || !highlight || typeof document === "undefined") return undefined;
    const node = targetNodeRef.current || (typeof target === "string" ? document.querySelector(target) : target?.current || target || null);
    if (!node?.classList) return undefined;
    node.classList.add("tw-tutorial-active-target");
    return () => node.classList.remove("tw-tutorial-active-target");
  }, [open, highlight, target, rect?.left, rect?.top]);

  useEffect(() => {
    if (!open || !highlight || highlightMode !== "target") return undefined;
    const node = targetNodeRef.current || (typeof target === "string" ? document.querySelector(target) : target?.current || target || null);
    if (!node?.classList) return undefined;
    node.classList.add("tw-tutorial-target-pulse");
    const previousTutorialAccent = node.style.getPropertyValue("--tw-template-tutorial-highlight");
    if (accentColor) node.style.setProperty("--tw-template-tutorial-highlight", accentColor);
    const isSidebarTarget = !!node.closest?.('[data-sidebar="true"]') || String(node.getAttribute?.("data-tutorial") || "").startsWith("nav-") || node.hasAttribute?.("data-folder-id");
    if (isSidebarTarget) node.classList.add("tw-tutorial-target-nav");
    const lockTarget = !allowTargetInteraction || clickAnywhere;
    if (lockTarget) node.classList.add("tw-tutorial-target-locked");
    return () => {
      node.classList.remove("tw-tutorial-target-pulse");
      node.classList.remove("tw-tutorial-target-locked");
      node.classList.remove("tw-tutorial-target-nav");
      if (accentColor) {
        if (previousTutorialAccent) node.style.setProperty("--tw-template-tutorial-highlight", previousTutorialAccent);
        else node.style.removeProperty("--tw-template-tutorial-highlight");
      }
    };
  }, [open, highlight, highlightMode, target, rect?.left, rect?.top, allowTargetInteraction, clickAnywhere, accentColor]);

  useEffect(() => {
    if (!open || !blockInteraction || typeof document === "undefined") return undefined;
    const guard = (event) => {
      const targetNode = targetNodeRef.current;
      const eventNode = event.target;
      const inTutorial = !!eventNode?.closest?.("[data-thinkbot-tutorial-root='true']");
      const inTarget = !!(allowTargetInteraction && targetNode && (eventNode === targetNode || targetNode.contains?.(eventNode)));
      if (inTutorial || inTarget) return;
      if (event.type === "keydown") {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener("keydown", guard, true);
    return () => document.removeEventListener("keydown", guard, true);
  }, [open, blockInteraction, allowTargetInteraction]);

  const bubbleStyle = useMemo(() => {
    const vw = typeof window === "undefined" ? 1280 : window.innerWidth;
    const vh = typeof window === "undefined" ? 720 : window.innerHeight;
    const baseWidth = dialogWidth || (square ? 390 : 500);
    const width = Math.min(baseWidth, Math.max(300, vw - 28));
    const approximateHeight = matchTargetHeight && rect ? Math.max(220, rect.height) : (bubbleSize?.height || (square ? 190 : 170));
    if (placement === "center" || (!rect && placement !== "screen-right" && placement !== "screen-left")) {
      return { left: clamp((vw - width) / 2, 14, Math.max(14, vw - width - 14)), top: clamp((vh - approximateHeight) / 2, 18, Math.max(18, vh - approximateHeight - 18)), width, ...(matchTargetHeight && rect ? { minHeight: rect.height } : {}) };
    }
    if (placement === "screen-right") {
      let left = clamp(vw - width - 28, 14, Math.max(14, vw - width - 14));
      let top = clamp((vh - approximateHeight) / 2, 18, Math.max(18, vh - approximateHeight - 18));
      // Prefer the right edge. If the active form area reaches that edge, move
      // the bubble above/below it before considering the left side so question
      // and answer fields stay visible whenever the viewport gives us room.
      if (rect) {
        const overlapsX = left < rect.right + 10 && left + width > rect.left - 10;
        const overlapsY = top < rect.bottom + 10 && top + approximateHeight > rect.top - 10;
        if (overlapsX && overlapsY) {
          const above = rect.top - approximateHeight - 18;
          const below = rect.bottom + 18;
          if (above >= 14) top = above;
          else if (below + approximateHeight <= vh - 14) top = below;
          else if (28 + width <= rect.left - 10) left = 28;
        }
      }
      return { left, top, width, ...(matchTargetHeight && rect ? { minHeight: rect.height } : {}) };
    }
    if (placement === "screen-left") {
      return { left: 28, top: clamp((vh - approximateHeight) / 2, 18, Math.max(18, vh - approximateHeight - 18)), width, ...(matchTargetHeight && rect ? { minHeight: rect.height } : {}) };
    }
    if (!rect) return { left: clamp((vw - width) / 2, 14, Math.max(14, vw - width - 14)), top: clamp(vh * .18, 18, Math.max(18, vh - approximateHeight)), width };
    const gap = 18;
    let top;
    let left = clamp(rect.left + rect.width / 2 - width / 2, 14, Math.max(14, vw - width - 14));
    const below = rect.bottom + gap;
    const above = rect.top - approximateHeight - gap;
    const sideRight = rect.right + gap;
    if (placement === "right" && sideRight + width < vw - 14) {
      left = sideRight;
      top = clamp(rect.top + rect.height / 2 - approximateHeight / 2, 14, vh - approximateHeight - 14);
    } else if (placement === "left" && rect.left - width - gap > 14) {
      left = rect.left - width - gap;
      top = clamp(rect.top + rect.height / 2 - approximateHeight / 2, 14, vh - approximateHeight - 14);
    } else if (placement === "above" || (placement === "auto" && below + approximateHeight > vh - 14 && above > 14)) {
      top = clamp(above, 14, vh - approximateHeight - 14);
    } else {
      top = clamp(below, 14, Math.max(14, vh - approximateHeight - 14));
    }
    return { left, top, width, ...(matchTargetHeight ? { minHeight: Math.max(220, rect.height) } : {}) };
  }, [rect, placement, dialogWidth, square, matchTargetHeight, bubbleSize?.height]);

  const positionedBubbleStyle = useMemo(() => {
    if (!dragPosition || typeof window === "undefined") return bubbleStyle;
    const width = bubbleRef.current?.offsetWidth || Number(bubbleStyle.width) || 390;
    const height = bubbleRef.current?.offsetHeight || (square ? 330 : 260);
    return {
      ...bubbleStyle,
      left: clamp(dragPosition.left, 8, Math.max(8, window.innerWidth - width - 8)),
      top: clamp(dragPosition.top, 8, Math.max(8, window.innerHeight - height - 8)),
    };
  }, [bubbleStyle, dragPosition, square]);

  if (!open || typeof document === "undefined") return null;

  const blockerClick = clickAnywhere ? (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClickAnywhere?.();
  } : undefined;

  const beginDrag = (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const box = bubbleRef.current;
    if (!box) return;
    event.preventDefault();
    event.stopPropagation();
    const boxRect = box.getBoundingClientRect();
    dragSessionRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startLeft: boxRect.left,
      startTop: boxRect.top,
      moved: false,
    };
    suppressClickRef.current = false;
    setDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const moveDrag = (event) => {
    const session = dragSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    const dx = event.clientX - session.startX;
    const dy = event.clientY - session.startY;
    if (!session.moved && Math.hypot(dx, dy) > 3) session.moved = true;
    if (!session.moved) return;
    event.preventDefault();
    const box = bubbleRef.current;
    const width = box?.offsetWidth || 390;
    const height = box?.offsetHeight || 260;
    const nextPosition = {
      left: clamp(session.startLeft + dx, 8, Math.max(8, window.innerWidth - width - 8)),
      top: clamp(session.startTop + dy, 8, Math.max(8, window.innerHeight - height - 8)),
    };
    setDragPosition(nextPosition);
    if (resolvedDragKey) DRAG_POSITIONS.set(resolvedDragKey, nextPosition);
  };

  const endDrag = (event) => {
    const session = dragSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    if (session.moved) {
      suppressClickRef.current = true;
      window.setTimeout(() => { suppressClickRef.current = false; }, 80);
    }
    dragSessionRef.current = null;
    setDragging(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const dialogClick = (event) => {
    // Portalled tutorial bubbles still participate in React event bubbling. Stop
    // their clicks here so dragging/clicking a ThinkBot bubble inside a host or
    // assignment modal can never trigger the modal backdrop and close it.
    event.stopPropagation();
    if (!clickAnywhere) return;
    if (suppressClickRef.current) { event.preventDefault(); return; }
    if (event.target?.closest?.("button,a,input,textarea,select,label,.tw-thinkbot-tutorial-drag-handle")) return;
    blockerClick?.(event);
  };
  const targetHighlightColor = (() => {
    try {
      if (!targetNodeRef.current || typeof window === "undefined") return "";
      return window.getComputedStyle(targetNodeRef.current).getPropertyValue("--tw-template-tutorial-highlight").trim();
    } catch {
      return "";
    }
  })();
  const useHole = blockInteraction && rect && allowTargetInteraction && !clickAnywhere;
  const holePadding = highlight && highlightMode !== "target" ? Math.max(0, Number(highlightPadding || 0)) : 0;
  const holeRect = rect ? {
    left: Math.max(0, rect.left - holePadding),
    top: Math.max(0, rect.top - holePadding),
    right: Math.min(window.innerWidth, rect.right + holePadding),
    bottom: Math.min(window.innerHeight, rect.bottom + holePadding),
  } : null;
  if (holeRect) {
    holeRect.width = Math.max(0, holeRect.right - holeRect.left);
    holeRect.height = Math.max(0, holeRect.bottom - holeRect.top);
  }
  const blockers = blockInteraction ? (useHole && holeRect ? <>
    <div className="tw-tutorial-blocker" style={{ left: 0, top: 0, right: 0, height: holeRect.top }} />
    <div className="tw-tutorial-blocker" style={{ left: 0, top: holeRect.top, width: holeRect.left, height: holeRect.height }} />
    <div className="tw-tutorial-blocker" style={{ left: holeRect.right, top: holeRect.top, right: 0, height: holeRect.height }} />
    <div className="tw-tutorial-blocker" style={{ left: 0, top: holeRect.bottom, right: 0, bottom: 0 }} />
  </> : <div className={`tw-tutorial-blocker tw-tutorial-blocker-full${clickAnywhere ? " is-clickable" : ""}`} onClick={blockerClick} />) : null;

  return createPortal(
    <div data-thinkbot-tutorial-root="true">
      {blockers}
      {highlight && highlightMode !== "target" && rect && <div className="tw-tutorial-highlight" style={{ left: rect.left - highlightPadding, top: rect.top - highlightPadding, width: rect.width + highlightPadding * 2, height: rect.height + highlightPadding * 2, ...((targetHighlightColor || accentColor) ? { "--tw-template-tutorial-highlight": targetHighlightColor || accentColor } : {}) }} />}
      {hint && rect && <div className="tw-tutorial-hint" style={{ left: clamp(rect.right + 12, 12, Math.max(12, window.innerWidth - 334)), top: clamp(rect.top, 12, Math.max(12, window.innerHeight - 180)), background: accentColor ? tutorialSurface : (dark ? "#0b1b34" : "#fff"), borderColor: tutorialAccent, color: c.text }}>{hint}</div>}
      {children && <section ref={bubbleRef} className={`tw-thinkbot-tutorial${square ? " is-square" : ""}${transparent ? " is-transparent" : ""}${dragging ? " is-dragging" : ""}${clickAnywhere ? " has-click-anywhere" : ""} ${className}`.trim()} style={{ ...positionedBubbleStyle, background: transparent ? (dark ? "rgba(16,36,67,.92)" : "rgba(255,255,255,.88)") : tutorialSurface, color: c.text, borderColor: tutorialAccent, "--tw-tutorial-face": tutorialAccent, "--tw-tutorial-base": tutorialBase }} onPointerDown={(event) => event.stopPropagation()} onClick={dialogClick}>
        <div className="tw-thinkbot-tutorial-drag-handle" role="presentation" aria-hidden="true" onPointerDown={beginDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}><span/><span/><span/></div>
        <img src="/media/thinkbot.png" alt="ThinkBot" className="tw-thinkbot-tutorial-avatar" />
        <div className="tw-thinkbot-tutorial-copy">{children}</div>
        {clickAnywhere && <div className="tw-tutorial-click-anywhere">{clickAnywhereLabel}</div>}
        {(reserveActionSpace || actionLabel || secondaryLabel) && <div className={`tw-thinkbot-tutorial-actions is-reserved${actionLabel || secondaryLabel ? " has-action" : ""}`}>
          {secondaryLabel && <button type="button" className="tw-tutorial-secondary" onClick={onSecondary}>{secondaryLabel}</button>}
          {actionLabel && actionReady && <button type="button" className="tw-tutorial-press" onClick={onAction}><span>{actionLabel}</span></button>}
        </div>}
      </section>}
    </div>,
    document.body
  );
}
