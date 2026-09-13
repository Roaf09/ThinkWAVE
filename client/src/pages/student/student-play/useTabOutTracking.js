import { useEffect, useRef } from "react";
import { API_BASE } from "../../../lib/api";

// Revision 10.20 turned this off "temporarily ... during gameplay testing" and
// it was never turned back on, which is why every participant sat at 0 tab
// outs no matter what they did. Removal-on-tab-out is still off separately,
// server-side (AUTO_KICK_AFTER_TAB_OUTS in sessions.socket.js) - this only
// controls whether the activity is recorded at all.
const TAB_OUT_TRACKING_ENABLED = true;

export function useTabOutTracking({ sessionId, participantId, socketRef, stateRef, questionCountRef, currentQRef, submittedRef, setExperienceBlur }) {
  const lastTabSignal = useRef(0);
  const awayRef = useRef(false);

  useEffect(() => {
    if (!TAB_OUT_TRACKING_ENABLED) return undefined;
    // A single departure surfaces as several DOM events (blur fires just
    // before visibilitychange; some browsers flap hidden/visible when the
    // screen dims or a notification appears), so count per *departure*, not
    // per event: once counted, nothing counts again until the student is
    // actually back. The time floor additionally absorbs a fast
    // hidden -> visible -> hidden flap that would otherwise re-arm it.
    function shouldCount() {
      if (stateRef.current?.status !== "LIVE" || !participantId) return false;
      const lastIndex=Math.max(0,(questionCountRef.current||0)-1);
      if(Number(stateRef.current?.current_question_index||0)>=lastIndex && submittedRef.current===currentQRef.current?.id) return false;
      if (awayRef.current) return false;
      const now = Date.now();
      if (now - lastTabSignal.current < 1500) return false;
      lastTabSignal.current = now;
      awayRef.current = true;
      return true;
    }
    // Only a genuine return to the quiz re-arms counting.
    function markBack() {
      awayRef.current = false;
      setExperienceBlur(false);
    }
    function signalTabOut() {
      if (!shouldCount()) return;
      setExperienceBlur(true);
      socketRef.current?.emit("student:tabOut", { sessionId:Number(sessionId), participantId });
    }
    // Closing the tab/window or switching away hard enough that the page gets
    // torn down doesn't leave the socket alive long enough to deliver an
    // emit. sendBeacon is built to survive unload, so the "left the app
    // entirely" case still gets recorded.
    function signalTabOutOnUnload() {
      if (!shouldCount()) return;
      setExperienceBlur(true);
      // The server requires proof of seat ownership (same reconnectKey the
      // socket handshake uses) so one client can't forge another student's
      // sequential participantId and frame them with false tab-outs.
      const payload = JSON.stringify({ participantId, reconnectKey: localStorage.getItem("qz_reconnectKey") || "" });
      const sent = navigator.sendBeacon?.(
        `${API_BASE}/api/sessions/${Number(sessionId)}/tab-event`,
        new Blob([payload], { type: "application/json" })
      );
      if (!sent) socketRef.current?.emit("student:tabOut", { sessionId:Number(sessionId), participantId });
    }
    function onVisibility(){ if(document.hidden) signalTabOut(); else markBack(); }
    function onBlur(){ if(document.visibilityState !== "hidden") signalTabOut(); }
    function onFocus(){ markBack(); }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pagehide", signalTabOutOnUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pagehide", signalTabOutOnUnload);
    };
  }, [sessionId, participantId]);
}
