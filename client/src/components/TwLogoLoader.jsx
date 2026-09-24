import thinkBotLogo from "../assets/thinkbot-logo.png";

// Centered ThinkWAVE/ThinkBot loading logo, same animation as the waiting lobby.
// Used for all tab loading states on desktop + mobile (no loading text).
export function TwLogoLoader({ size = 72, minHeight = "40vh", label = "Loading" }) {
  const wrap = Math.max(56, size + 22);
  return (
    <div
      role="status"
      aria-label={label}
      style={{ display: "grid", placeItems: "center", minHeight, width: "100%", textAlign: "center" }}
    >
      <style>{`@keyframes spTwLogoOrbit{0%{transform:rotate(0deg)}30%{transform:rotate(55deg)}68%{transform:rotate(305deg)}100%{transform:rotate(360deg)}}`}</style>
      <div style={{ position: "relative", width: wrap, height: wrap, display: "grid", placeItems: "center" }}>
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            border: "5px solid rgba(43,108,255,.18)",
            borderTopColor: "#2b6cff",
            borderRightColor: "#60a5fa",
            animation: "spTwLogoOrbit 2.8s linear infinite",
          }}
        />
        <img
          src={thinkBotLogo}
          alt=""
          style={{ width: size, height: size, objectFit: "contain", borderRadius: "50%", position: "relative", zIndex: 1, display: "block" }}
        />
      </div>
    </div>
  );
}
