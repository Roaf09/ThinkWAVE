import { useEffect, useRef } from "react";

// Scroll container for charts: wheel / trackpad / finger gestures the inner
// content can handle are consumed here (non-passive listener), so the outer
// modal scrollbar never moves while interacting with a chart. Gestures the
// inner content cannot use (e.g. already at the edge) bubble normally.
export function InnerScroll({ children, style, axis = "both" }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      const canX = el.scrollWidth > el.clientWidth + 1;
      const canY = el.scrollHeight > el.clientHeight + 1;
      let dx = e.deltaX;
      let dy = e.deltaY;
      // Vertical wheel over a sideways-only scroller drives it sideways.
      if (axis === "x" || (canX && !canY && Math.abs(dy) > Math.abs(dx))) {
        dx = dx + dy;
        dy = 0;
      }
      const wantX = axis !== "y" && dx !== 0 && canX;
      const wantY = axis !== "x" && dy !== 0 && canY;
      if (!wantX && !wantY) return;
      const atLeft = el.scrollLeft <= 0;
      const atRight = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
      const atTop = el.scrollTop <= 0;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
      const moveX = wantX && !(dx < 0 && atLeft) && !(dx > 0 && atRight);
      const moveY = wantY && !(dy < 0 && atTop) && !(dy > 0 && atBottom);
      if (!moveX && !moveY) return;
      if (moveX) el.scrollLeft += dx;
      if (moveY) el.scrollTop += dy;
      e.preventDefault();
      e.stopPropagation();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [axis]);
  return (
    <div ref={ref} style={{ ...style }}>
      {children}
    </div>
  );
}
