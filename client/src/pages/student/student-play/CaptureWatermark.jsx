import { useEffect, useState } from "react";

// Student-side trace watermark (Phase 2).
// Shows ONLY on the student's own gameplay screen — never on host panel.
// If a screenshot / screen recording leaks, the leaker's identity is burned
// into the image itself. Works on desktop + mobile because it is plain DOM.
// Pointer-events none so it never blocks answering; faint so it doesn't
// distract, but readable in a capture.
const SPOTS = [
  { top: "12%", left: "6%", transform: "rotate(-12deg)" },
  { top: "18%", left: "62%", transform: "rotate(-12deg)" },
  { top: "46%", left: "30%", transform: "rotate(-12deg)" },
  { top: "68%", left: "8%", transform: "rotate(-12deg)" },
  { top: "72%", left: "58%", transform: "rotate(-12deg)" },
];

export function CaptureWatermark({ active, text }) {
  const [spot, setSpot] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    // Hop corners so it can't be cropped out of every question.
    const t = setInterval(() => setSpot((i) => (i + 1) % SPOTS.length), 5000);
    return () => clearInterval(t);
  }, [active]);

  if (!active || !text) return null;
  const pos = SPOTS[spot % SPOTS.length];
  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 390,
        pointerEvents: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        overflow: "hidden",
      }}
    >
      {/* faint full-screen diagonal repeat — survives cropping */}
      <div
        style={{
          position: "absolute",
          inset: "-20%",
          display: "grid",
          placeItems: "center",
          opacity: 0.07,
          fontSize: 28,
          fontWeight: 900,
          letterSpacing: 2,
          transform: "rotate(-18deg)",
          whiteSpace: "nowrap",
          color: "currentColor",
        }}
      >
        {text} &nbsp;•&nbsp; {text}
      </div>
      {/* moving pill — readable in screenshots */}
      <div
        style={{
          position: "absolute",
          top: pos.top,
          left: pos.left,
          transform: pos.transform,
          opacity: 0.5,
          fontSize: 12,
          fontWeight: 800,
          padding: "5px 12px",
          borderRadius: 999,
          background: "rgba(15,23,42,.42)",
          color: "#fff",
          boxShadow: "0 4px 14px rgba(0,0,0,.18)",
          whiteSpace: "nowrap",
        }}
      >
        {text}
      </div>
    </div>
  );
}

// Fullscreen entry gate (Phase 2).
// Renders nothing when not needed (lobby, unsupported iOS, already fullscreen).
// When needsFullscreen, covers the quiz with a blur + entry button and blocks
// pointer interaction underneath.
export function FullscreenGate({ needsFullscreen, onEnter, dark }) {
  if (!needsFullscreen) return null;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 460,
        display: "grid",
        placeItems: "center",
        padding: 20,
        background: dark ? "rgba(3,10,28,.55)" : "rgba(255,255,255,.55)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
      }}
    >
      <div
        style={{
          width: "min(92vw, 420px)",
          borderRadius: 20,
          padding: "26px 24px",
          textAlign: "center",
          background: dark ? "rgba(8,22,50,.95)" : "rgba(255,255,255,.97)",
          color: dark ? "#e7e9ee" : "#0f172a",
          boxShadow: "0 20px 60px rgba(0,0,0,.3)",
        }}
      >
        <div style={{ fontSize: 40, marginBottom: 8 }}>⛶</div>
        <h3 style={{ margin: "0 0 8px", fontSize: 19, fontWeight: 900 }}>Fullscreen required</h3>
        <p style={{ margin: "0 0 18px", fontSize: 13.5, lineHeight: 1.6, opacity: 0.85 }}>
          Enter fullscreen to answer. This keeps the quiz focused and limits capturing.
        </p>
        <button
          type="button"
          onClick={onEnter}
          style={{
            border: 0,
            borderRadius: 12,
            padding: "12px 22px",
            background: "#2b6cff",
            color: "#fff",
            fontWeight: 900,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          Enter fullscreen
        </button>
      </div>
    </div>
  );
}
