import { useEffect, useState } from "react";
import { LoadingDots } from "../../../components/TwUI";
import thinkBotLogo from "../../../assets/thinkbot-logo.png";

// Shown over the question as soon as THIS participant's answer is locked in
// (live sessions, every template). It reuses the waiting-lobby card, with:
//   0-3s   "Answer Submitted!"
//   3s+    "Waiting for other participants to finish..."  (until the next question)
// and blurs the whole screen behind it so a finished participant's question
// and options can't be read off their screen by anyone else.
//
// The parent mounts this with key={questionId}, so the 3-second timer
// restarts for every new question and the overlay unmounts when it advances.
export function AnswerWaitOverlay({ dark, cardBg, cardBor, textC, mutedC }) {
  const [phase, setPhase] = useState("submitted");

  useEffect(() => {
    const timer = setTimeout(() => setPhase("waiting"), 3000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`sp-waiting-page ${dark ? "theme-dark" : "theme-light"}`}
      style={{
        position: "fixed",
        inset: 0,
        // Above the question, leaderboard and group-vote dialog; below the
        // capture blur (400), fullscreen gate (460) and anti-cheat dialog (500).
        zIndex: 300,
        display: "grid",
        placeItems: "center",
        padding: 20,
        // Backdrop only: the card stays crisp, everything behind it is blurred.
        background: dark ? "rgba(3,10,28,.55)" : "rgba(255,255,255,.45)",
        backdropFilter: "blur(22px)",
        WebkitBackdropFilter: "blur(22px)",
        // Keeps sound / theme / leaderboard controls usable under the blur.
        pointerEvents: "none",
      }}
    >
      <div className="sp-wait-card sp-page-enter" style={{ width: "min(100%, 520px)", background: cardBg, borderColor: cardBor }}>
        <div className="sp-wait-icon-wrap sp-thinkbot-loading" style={{ background: dark ? "rgba(8,22,50,.88)" : "rgba(255,255,255,.92)", borderColor: cardBor }}>
          <span className="sp-thinkbot-loading-ring" aria-hidden="true" />
          <img src={thinkBotLogo} alt="ThinkBot" className="sp-thinkbot-loading-logo" />
        </div>
        <h3 className="sp-wait-title" style={{ color: textC, margin: 0 }}>
          {phase === "submitted"
            ? "Answer Submitted!"
            : <>Waiting for other participants to finish<LoadingDots color={mutedC} /></>}
        </h3>
      </div>
    </div>
  );
}
