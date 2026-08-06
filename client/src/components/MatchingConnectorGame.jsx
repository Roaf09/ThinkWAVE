import React, { useEffect, useMemo, useRef, useState } from "react";

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

export default function MatchingConnectorGame({ config = {}, valueMap = {}, onChange, disabled = false, questionKey = "matching" }) {
  const colA = Array.isArray(config.colA) ? config.colA : [];
  const pairedB = Array.isArray(config.colB) ? config.colB : [];
  const dummyB = Array.isArray(config.dummyB) ? config.dummyB : [];
  const colB = [...pairedB, ...dummyB];
  const orderA = useMemo(() => seededOrder(colA.length, !!config.shuffleColA, `${questionKey}-a`), [colA.length, config.shuffleColA, questionKey]);
  const orderB = useMemo(() => seededOrder(colB.length, true, `${questionKey}-b`), [colB.length, questionKey]);
  const wrapperRef = useRef(null);
  const endpointRefs = useRef(new Map());
  const [active, setActive] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [lineVersion, setLineVersion] = useState(0);

  useEffect(() => {
    setActive(null);
    setCursor(null);
  }, [questionKey]);

  useEffect(() => {
    const update = () => setLineVersion((value) => value + 1);
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    if (wrapperRef.current && observer) observer.observe(wrapperRef.current);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, []);

  const usedB = useMemo(() => new Set(Object.values(valueMap || {}).map(Number)), [valueMap]);

  function pointFor(side, index) {
    const wrapper = wrapperRef.current;
    const endpoint = endpointRefs.current.get(`${side}-${index}`);
    if (!wrapper || !endpoint) return null;
    const outer = wrapper.getBoundingClientRect();
    const rect = endpoint.getBoundingClientRect();
    return { x: rect.left - outer.left + rect.width / 2, y: rect.top - outer.top + rect.height / 2 };
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
    const rect = wrapperRef.current.getBoundingClientRect();
    setCursor({ x: event.clientX - rect.left, y: event.clientY - rect.top });
  }

  const lines = Object.entries(valueMap || {}).map(([aIndex, bIndex]) => {
    const start = pointFor("A", Number(aIndex));
    const end = pointFor("B", Number(bIndex));
    return start && end ? { key: `${aIndex}-${bIndex}`, start, end } : null;
  }).filter(Boolean);
  const activeStart = active ? pointFor(active.side, active.index) : null;
  void lineVersion;

  return (
    <div className="match-connect" ref={wrapperRef} onPointerMove={handlePointerMove}>
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
            return <div key={`a-${index}`} className={`match-connect-card${paired ? " is-paired" : ""}`}>
              <div className="match-connect-content">
                {textOf(item, `Item ${index + 1}`) ? <span>{textOf(item, `Item ${index + 1}`)}</span> : null}
                {item.image ? <img src={item.image} alt="" /> : null}
              </div>
              <button type="button" className="match-connect-dot is-right" ref={(node) => node ? endpointRefs.current.set(`A-${index}`, node) : endpointRefs.current.delete(`A-${index}`)} onClick={() => handleEndpoint("A", index)} disabled={disabled} aria-label={`Connect Column A item ${index + 1}`} />
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
            return <div key={`b-${index}`} className={`match-connect-card${paired ? " is-paired" : ""}`}>
              <button type="button" className="match-connect-dot is-left" ref={(node) => node ? endpointRefs.current.set(`B-${index}`, node) : endpointRefs.current.delete(`B-${index}`)} onClick={() => handleEndpoint("B", index)} disabled={disabled} aria-label={`Connect Column B item ${index + 1}`} />
              <div className="match-connect-content">
                {textOf(item, `Answer ${index + 1}`) ? <span>{textOf(item, `Answer ${index + 1}`)}</span> : null}
                {item.image ? <img src={item.image} alt="" /> : null}
              </div>
            </div>;
          })}
        </div>
      </section>
    </div>
  );
}
