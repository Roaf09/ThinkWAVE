import { memo, useEffect, useMemo, useRef, useState } from "react";

function seededOrder(length, enabled, seedText) {
  const values = Array.from({ length }, (_, index) => index);
  if (!enabled || length < 2) return values;
  let seed = 2166136261;
  for (const char of String(seedText || "matching")) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }
  if (values.every((value, index) => value === index)) values.push(values.shift());
  return values;
}

function textOf(item, fallback) {
  const value = String(item?.text || "").trim();
  return value || (!item?.image ? fallback : "");
}

function MatchingConnectorGame({ config = {}, valueMap = {}, onChange, disabled = false, questionKey = "matching", participantSeed = 0 }) {
  const colA = Array.isArray(config.colA) ? config.colA : [];
  const rawB = Array.isArray(config.colB) ? config.colB : [];
  const dummyB = Array.isArray(config.dummyB) ? config.dummyB : [];
  // Older saved matching questions may already contain distractors in colB while
  // also retaining dummyB. Keep only the paired portion, then append unique distractors.
  const pairedB = dummyB.length && rawB.length > colA.length ? rawB.slice(0, colA.length) : rawB;
  const signature = (item) => JSON.stringify({
    text: String(item?.text ?? item?.label ?? item?.value ?? item ?? "").trim().toLowerCase(),
    image: String(item?.image ?? "").trim(),
  });
  const seenB = new Set(pairedB.map(signature));
  const uniqueDummyB = dummyB.filter((item) => {
    const key = signature(item);
    if (!key || seenB.has(key)) return false;
    seenB.add(key);
    return true;
  });
  const colB = [...pairedB, ...uniqueDummyB];
  const orderA = useMemo(() => seededOrder(colA.length, !!config.shuffleColA, `${questionKey}-a-p${participantSeed || 0}`), [colA.length, config.shuffleColA, questionKey, participantSeed]);
  const orderB = useMemo(() => seededOrder(colB.length, true, `${questionKey}-b-p${participantSeed || 0}`), [colB.length, questionKey, participantSeed]);
  const wrapperRef = useRef(null);
  const endpointRefs = useRef(new Map());
  // Cached geometry: endpoint centers relative to the wrapper + the wrapper's
  // viewport offset for cursor math. Lines are positioned relative to the
  // wrapper, so scrolling never invalidates them — only resize/question
  // changes re-measure. This kills the old per-render getBoundingClientRect
  // storm (every committed line, every second, every scroll).
  const layoutRef = useRef({ points: new Map(), wrapLeft: 0, wrapTop: 0, ready: false });
  const [active, setActive] = useState(null);
  const [cursor, setCursor] = useState(null);
  // Set when a press (pointerdown) already activated/connected: the synthetic
  // click that follows the same press must be ignored, otherwise every
  // press-drag would leave a dangling active line behind.
  const downRef = useRef(false);
  const [lineVersion, setLineVersion] = useState(0);
  const moveFrameRef = useRef(0);
  const pendingCursorRef = useRef(null);
  const layoutFrameRef = useRef(0);

  useEffect(() => {
    setActive(null);
    setCursor(null);
  }, [questionKey]);

  function measureAll() {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const outer = wrapper.getBoundingClientRect();
    const pts = new Map();
    for (const [key, el] of endpointRefs.current) {
      if (!el || !el.isConnected) continue;
      const rect = el.getBoundingClientRect();
      pts.set(key, { x: rect.left - outer.left + rect.width / 2, y: rect.top - outer.top + rect.height / 2 });
    }
    layoutRef.current = { points: pts, wrapLeft: outer.left, wrapTop: outer.top, ready: true };
    setLineVersion((value) => value + 1);
  }

  // Re-measure after new endpoints mount (question change covers it too).
  useEffect(() => {
    measureAll();
  }, [questionKey, colA.length, colB.length]);

  useEffect(() => {
    const update = () => {
      if (layoutFrameRef.current) return;
      layoutFrameRef.current = requestAnimationFrame(() => {
        layoutFrameRef.current = 0;
        measureAll();
      });
    };
    // Scroll does NOT re-render: relative geometry is unchanged by scrolling.
    // It only refreshes the wrapper's viewport offset so the drag cursor
    // stays accurate mid-scroll, with zero React work.
    const refreshWrapOffset = () => {
      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      const outer = wrapper.getBoundingClientRect();
      layoutRef.current.wrapLeft = outer.left;
      layoutRef.current.wrapTop = outer.top;
    };
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    if (wrapperRef.current && observer) observer.observe(wrapperRef.current);
    window.addEventListener("resize", update, { passive: true });
    window.addEventListener("scroll", refreshWrapOffset, { passive: true, capture: true });
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", refreshWrapOffset, true);
      if (layoutFrameRef.current) cancelAnimationFrame(layoutFrameRef.current);
      if (moveFrameRef.current) cancelAnimationFrame(moveFrameRef.current);
    };
  }, []);

  const usedB = useMemo(() => new Set(Object.values(valueMap || {}).map(Number)), [valueMap]);

  function pointFor(side, index) {
    const hit = layoutRef.current.points.get(`${side}-${index}`);
    if (hit) return hit;
    // Fallback for endpoints mounted after the last measure pass.
    const wrapper = wrapperRef.current;
    const endpoint = endpointRefs.current.get(`${side}-${index}`);
    if (!wrapper || !endpoint) return null;
    const outer = wrapper.getBoundingClientRect();
    const rect = endpoint.getBoundingClientRect();
    const pt = { x: rect.left - outer.left + rect.width / 2, y: rect.top - outer.top + rect.height / 2 };
    layoutRef.current.points.set(`${side}-${index}`, pt);
    return pt;
  }

  function removePairByEndpoint(side, index) {
    const next = { ...(valueMap || {}) };
    if (side === "A" && next[index] !== undefined) {
      delete next[index];
      onChange(next);
      return true;
    }
    if (side === "B") {
      const key = Object.keys(next).find((aIndex) => Number(next[aIndex]) === Number(index));
      if (key !== undefined) {
        delete next[key];
        onChange(next);
        return true;
      }
    }
    return false;
  }

  function connect(aIndex, bIndex) {
    const next = { ...(valueMap || {}) };
    Object.keys(next).forEach((key) => {
      if (Number(key) === Number(aIndex) || Number(next[key]) === Number(bIndex)) delete next[key];
    });
    next[Number(aIndex)] = Number(bIndex);
    onChange(next);
  }

  // Press anywhere on a card (not just the small dot) to start connecting,
  // so press-drag-release works in one motion on desktop and touch.
  function handleCardPress(event, side, index) {
    if (disabled) return;
    if (event.pointerType === "mouse" && event.button > 0) return;
    if (event.target.closest(".match-connect-dot")) return;
    downRef.current = true;
    handleEndpoint(side, index);
  }

  function handlePressClick(event, side, index) {
    if (downRef.current) {
      downRef.current = false;
      return;
    }
    if (!event.target.closest(".match-connect-dot")) handleEndpoint(side, index);
  }

  function handleDotPress(event, side, index) {
    if (disabled) return;
    if (event.pointerType === "mouse" && event.button > 0) return;
    event.stopPropagation();
    downRef.current = true;
    handleEndpoint(side, index);
  }

  function handleDotClick(side, index) {
    if (downRef.current) {
      downRef.current = false;
      return;
    }
    handleEndpoint(side, index);
  }

  function handleEndpoint(side, index) {
    if (disabled) return;
    if (!active && removePairByEndpoint(side, index)) return;
    if (!active) {
      setActive({ side, index });
      setCursor(pointFor(side, index));
      return;
    }
    if (active.side === side) {
      setActive({ side, index });
      setCursor(pointFor(side, index));
      return;
    }
    const aIndex = side === "A" ? index : active.index;
    const bIndex = side === "B" ? index : active.index;
    connect(aIndex, bIndex);
    setActive(null);
    setCursor(null);
  }

  function handlePointerMove(event) {
    if (!active || !wrapperRef.current) return;
    const cx = event.clientX ?? event.touches?.[0]?.clientX;
    const cy = event.clientY ?? event.touches?.[0]?.clientY;
    if (cx == null || cy == null) return;
    // Cached wrapper offset (refreshed on scroll) — no layout read per move.
    const cached = layoutRef.current;
    let wrapLeft = cached.wrapLeft;
    let wrapTop = cached.wrapTop;
    if (!cached.ready) {
      const rect = wrapperRef.current.getBoundingClientRect();
      wrapLeft = rect.left;
      wrapTop = rect.top;
    }
    pendingCursorRef.current = { x: cx - wrapLeft, y: cy - wrapTop };
    if (moveFrameRef.current) return;
    moveFrameRef.current = requestAnimationFrame(() => {
      moveFrameRef.current = 0;
      if (pendingCursorRef.current) setCursor(pendingCursorRef.current);
    });
  }

  function handleDropAt(clientX, clientY) {
    if (!active || disabled) return false;
    const el = typeof document !== "undefined" ? document.elementFromPoint(clientX, clientY) : null;
    const target = el?.closest?.("[data-match-side]");
    if (!target) return false;
    const side = target.getAttribute("data-match-side");
    const index = Number(target.getAttribute("data-match-index"));
    if (!side || !Number.isFinite(index) || side === active.side) return false;
    const aIndex = side === "A" ? index : active.index;
    const bIndex = side === "B" ? index : active.index;
    connect(aIndex, bIndex);
    setActive(null);
    setCursor(null);
    return true;
  }

  function handlePointerUp(event) {
    if (!active) return;
    const cx = event.clientX ?? event.changedTouches?.[0]?.clientX;
    const cy = event.clientY ?? event.changedTouches?.[0]?.clientY;
    if (cx == null || cy == null) return;
    handleDropAt(cx, cy);
  }

  // Committed lines only depend on pairs + cached geometry: parent ticks
  // (1s timer) and cursor moves skip recompute entirely via memo.
  const lines = useMemo(() => Object.entries(valueMap || {}).map(([aIndex, bIndex]) => {
    const start = pointFor("A", Number(aIndex));
    const end = pointFor("B", Number(bIndex));
    // Cached pointFor intentionally omits layout deps: geometry only
    // changes via measureAll -> lineVersion.
    return start && end ? { key: `${aIndex}-${bIndex}`, start, end } : null;
  }).filter(Boolean), [valueMap, lineVersion, questionKey]);
  const activeStart = useMemo(
    () => (active ? pointFor(active.side, active.index) : null),
    [active, lineVersion, questionKey],
  );

  return (
    <div
      className="match-connect"
      ref={wrapperRef}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => { downRef.current = false; setActive(null); setCursor(null); }}
      onTouchMove={(e) => { const t = e.touches?.[0]; if (t) handlePointerMove(t); }}
      onTouchEnd={(e) => { const t = e.changedTouches?.[0]; if (t) handlePointerUp(t); }}
      style={{ touchAction: "none" }}
    >
      <svg className="match-connect-lines" aria-hidden="true">
        {lines.map(({ key, start, end }) => <line key={key} x1={start.x} y1={start.y} x2={end.x} y2={end.y} />)}
        {activeStart && cursor ? <line className="is-active" x1={activeStart.x} y1={activeStart.y} x2={cursor.x} y2={cursor.y} /> : null}
      </svg>
      <section className="match-connect-column match-connect-column-a">
        <h3>Column A</h3>
        <div className="match-connect-list">
          {orderA.map((index) => {
            const item = colA[index] || {};
            const paired = valueMap?.[index] !== undefined;
            return <div key={`a-${index}`} data-match-side="A" data-match-index={index} className={`match-connect-card${paired ? " is-paired" : ""}`} role="button" tabIndex={disabled ? -1 : 0} onPointerDown={(event) => handleCardPress(event, "A", index)} onClick={(event) => handlePressClick(event, "A", index)} onKeyDown={(event) => { if (!disabled && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); handleEndpoint("A", index); } }} style={{ touchAction: "none", cursor: disabled ? "default" : "grab" }}>
              <div className="match-connect-content">
                {textOf(item, `Item ${index + 1}`) ? <span>{textOf(item, `Item ${index + 1}`)}</span> : null}
                {item.image ? <img src={item.image} alt="" loading="lazy" decoding="async" /> : null}
              </div>
              <button type="button" data-match-side="A" data-match-index={index} className="match-connect-dot is-right" ref={(node) => node ? endpointRefs.current.set(`A-${index}`, node) : endpointRefs.current.delete(`A-${index}`)} onPointerDown={(event) => handleDotPress(event, "A", index)} onClick={() => handleDotClick("A", index)} disabled={disabled} aria-label={`Connect Column A item ${index + 1}`} style={{ touchAction: "none" }} />
            </div>;
          })}
        </div>
      </section>
      <section className="match-connect-column match-connect-column-b">
        <h3>Column B</h3>
        <div className="match-connect-list">
          {orderB.map((index) => {
            const item = colB[index] || {};
            const paired = usedB.has(index);
            return <div key={`b-${index}`} data-match-side="B" data-match-index={index} className={`match-connect-card${paired ? " is-paired" : ""}`} role="button" tabIndex={disabled ? -1 : 0} onPointerDown={(event) => handleCardPress(event, "B", index)} onClick={(event) => handlePressClick(event, "B", index)} onKeyDown={(event) => { if (!disabled && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); handleEndpoint("B", index); } }} style={{ touchAction: "none", cursor: disabled ? "default" : "grab" }}>
              <button type="button" data-match-side="B" data-match-index={index} className="match-connect-dot is-left" ref={(node) => node ? endpointRefs.current.set(`B-${index}`, node) : endpointRefs.current.delete(`B-${index}`)} onPointerDown={(event) => handleDotPress(event, "B", index)} onClick={() => handleDotClick("B", index)} disabled={disabled} aria-label={`Connect Column B item ${index + 1}`} style={{ touchAction: "none" }} />
              <div className="match-connect-content">
                {textOf(item, `Answer ${index + 1}`) ? <span>{textOf(item, `Answer ${index + 1}`)}</span> : null}
                {item.image ? <img src={item.image} alt="" loading="lazy" decoding="async" /> : null}
              </div>
            </div>;
          })}
        </div>
      </section>
    </div>
  );
}


export default memo(MatchingConnectorGame);
