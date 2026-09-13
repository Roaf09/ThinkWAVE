import { useEffect, useState } from "react";

export function truncateBuilderTitle(title, limit = 25) {
  const clean = String(title || "");
  if (clean.length <= limit) return clean;
  return `${clean.slice(0, limit)}...`;
}

export function useBuilderTitleLimit() {
  const compute = () => {
    if (typeof window === "undefined") return 25;
    // Zoomed-in / minimized / split desktop gets narrower layout width —
    // shorten the title earlier so it never crowds the toolbar.
    return window.innerWidth < 1100 ? 15 : 25;
  };
  const [limit, setLimit] = useState(compute);
  useEffect(() => {
    const onResize = () => setLimit(compute());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return limit;
}

export function isMobileDevice() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  try {
    const navData = navigator.userAgentData;
    if (navData && typeof navData.mobile === "boolean") return navData.mobile;
  } catch { /* ignore */ }
  const ua = String(navigator.userAgent || "");
  return /Mobi|Android|iPhone|iPad|iPod|Mobile/i.test(ua);
}

export function useIsMobileViewport(breakpoint = 900) {
  const compute = () => {
    if (typeof window === "undefined") return false;
    if (window.innerWidth > breakpoint) return false;
    // Minimized / split desktop browsers get narrow but must keep the desktop
    // builder UI (which adapts via wrapping) instead of flipping to the mobile
    // sheet UI. Only actual mobile devices use the mobile builder.
    return isMobileDevice();
  };
  const [isMobile, setIsMobile] = useState(compute);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => setIsMobile(compute());
    handler();
    window.addEventListener("resize", handler);
    const mq = window.matchMedia ? window.matchMedia(`(max-width: ${breakpoint}px)`) : null;
    if (mq) {
      if (mq.addEventListener) mq.addEventListener("change", handler);
      else mq.addListener(handler);
    }
    return () => {
      window.removeEventListener("resize", handler);
      if (mq) {
        if (mq.removeEventListener) mq.removeEventListener("change", handler);
        else mq.removeListener(handler);
      }
    };
  }, [breakpoint]);
  return isMobile;
}
