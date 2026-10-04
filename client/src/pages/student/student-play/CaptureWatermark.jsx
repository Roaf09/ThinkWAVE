// Student-side trace watermark (Phase 2) — disabled per request; component
// kept as a no-op so existing imports keep working.

export function CaptureWatermark() {
  return null;
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
