import { useEffect, useMemo, useRef, useState } from "react";
import { TwIcon } from "../../../../components/TwUI";
import { getSessionBackgroundsForCategory } from "../../../../lib/sessionBackgrounds";

// Extracted verbatim from LiveSessionsTab.jsx (no behavior change).
export function BackgroundPicker({ selectedKey, onSelect, c, category }) {
  const visibleCount = 4;
  const pool = useMemo(() => getSessionBackgroundsForCategory(category), [category]);
  const total = pool.length;
  const [startIndex, setStartIndex] = useState(0);
  const [slideDirection, setSlideDirection] = useState("next");
  const lastWheelAt = useRef(0);
  const carouselRef = useRef(null);
  const selectedIndex = pool.findIndex((item) => item.key === selectedKey);
  const visible = Array.from({ length: Math.min(visibleCount, total) }, (_, offset) => pool[(startIndex + offset) % total]);

  // If the audience category changes (or the picker mounts) and the currently
  // selected background isn't in this category's pool, reset the carousel
  // back to the start of the filtered pool instead of pointing at a
  // background the teacher can no longer see here.
  useEffect(() => { setStartIndex(0); }, [category]);

  function move(step) {
    if (!total) return;
    setSlideDirection(step > 0 ? "next" : "prev");
    setStartIndex((value) => (value + step + total) % total);
  }

  // Mobile: swipe the row instead of tapping arrow buttons (arrows are
  // hidden below the mobile breakpoint via CSS).
  const touchStartRef = useRef(null);
  function onTouchStart(event) { touchStartRef.current = event.touches[0].clientX; }
  function onTouchEnd(event) {
    const startX = touchStartRef.current;
    touchStartRef.current = null;
    if (startX == null) return;
    const dx = event.changedTouches[0].clientX - startX;
    if (Math.abs(dx) < 34) return;
    move(dx < 0 ? 1 : -1);
  }

  useEffect(() => {
    const node = carouselRef.current;
    if (!node || !total) return undefined;
    const handleWheel = (event) => {
      if (Math.abs(event.deltaY) < 4) return;
      event.preventDefault();
      const now = Date.now();
      if (now - lastWheelAt.current < 220) return;
      lastWheelAt.current = now;
      const step = event.deltaY > 0 ? 1 : -1;
      setSlideDirection(step > 0 ? "next" : "prev");
      setStartIndex((value) => (value + step + total) % total);
    };
    node.addEventListener("wheel", handleWheel, { passive: false });
    return () => node.removeEventListener("wheel", handleWheel);
  }, [total]);

  return <div className="tw-session-background-picker" data-tutorial="session-backgrounds">
    <div className="tw-session-background-head"><span>Choose a gameplay background</span><small style={{ color: c.textMuted }}>{selectedIndex >= 0 ? `${selectedIndex + 1} of ${total}` : "No background selected"}</small></div>
    <div ref={carouselRef} className="tw-session-background-carousel" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <button type="button" aria-label="Previous backgrounds" className="tw-session-background-arrow is-left" onClick={() => move(-1)} style={{ color: c.text, borderColor: c.border, background: c.cardBg2 }}><TwIcon name="arrow" size={20} /></button>
      <div className="tw-session-background-track">
        <div key={startIndex} className={`tw-session-background-track-inner is-${slideDirection}`}>
          {visible.map((item) => <button type="button" key={item.key} className={`tw-session-background-card${selectedKey === item.key ? " is-selected" : ""}`} onClick={() => onSelect(item.key)} style={{ borderColor: selectedKey === item.key ? c.accent : c.border, background: c.cardBg2 }} title={item.label}><img src={item.src} alt={item.label} />{selectedKey === item.key && <span><TwIcon name="check" size={17} /></span>}</button>)}
        </div>
      </div>
      <button type="button" aria-label="Next backgrounds" className="tw-session-background-arrow" onClick={() => move(1)} style={{ color: c.text, borderColor: c.border, background: c.cardBg2 }}><TwIcon name="arrow" size={20} /></button>
    </div>
  </div>;
}
