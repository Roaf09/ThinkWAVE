import { useEffect, useRef, useState } from "react";

const IDLE_EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"];

// Shared 10-minute inactivity logout. Any activity re-arms the timer; once
// fired, any click/keypress/tap calls onTimeout (the dashboard signs out).
// Returns true while the "logged out due to inactivity" state is showing.
export function useIdleLogout({ onTimeout, timeoutMs = 10 * 60 * 1000 }) {
  const [idleFired, setIdleFired] = useState(false);
  const callbackRef = useRef(onTimeout);
  callbackRef.current = onTimeout;

  useEffect(() => {
    if (idleFired) return undefined;
    let timer = null;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setIdleFired(true), timeoutMs);
    };
    IDLE_EVENTS.forEach((name) => window.addEventListener(name, arm, { passive: true }));
    arm();
    return () => {
      clearTimeout(timer);
      IDLE_EVENTS.forEach((name) => window.removeEventListener(name, arm));
    };
  }, [idleFired, timeoutMs]);

  useEffect(() => {
    if (!idleFired) return undefined;
    const go = () => { try { callbackRef.current?.(); } catch {} };
    window.addEventListener("click", go);
    window.addEventListener("keydown", go);
    window.addEventListener("touchstart", go);
    return () => {
      window.removeEventListener("click", go);
      window.removeEventListener("keydown", go);
      window.removeEventListener("touchstart", go);
    };
  }, [idleFired]);

  return idleFired;
}
