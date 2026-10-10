import { useEffect } from "react";
import { LoadingDots } from "../../../components/TwUI";
import thinkBotLogo from "../../../assets/thinkbot-logo.png";

// Pre-start notice shown before a live session or an assignment begins when
// at least one question needs two answers. Same look as AnswerWaitOverlay
// ("Waiting for other participants to finish..."): blurred screen, ThinkBot
// loader card and animated dots. Auto-dismisses after `durationMs`.
export function TwoAnswerNoticeOverlay({ dark, cardBg, cardBor, textC, mutedC, durationMs = 5000, onDone }) {
  useEffect(() => {
    if (!onDone) return undefined;
    const timer = setTimeout(onDone, durationMs);
    return () => clearTimeout(timer);
  }, [durationMs, onDone]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`sp-waiting-page ${dark ? "theme-dark" : "theme-light"}`}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 300,
        display: "grid",
        placeItems: "center",
        padding: 20,
        background: dark ? "rgba(3,10,28,.55)" : "rgba(255,255,255,.45)",
        backdropFilter: "blur(22px)",
        WebkitBackdropFilter: "blur(22px)",
        pointerEvents: "none",
      }}
    >
      <div className="sp-wait-card sp-page-enter" style={{ width: "min(100%, 520px)", background: cardBg, borderColor: cardBor }}>
        <div className="sp-wait-icon-wrap sp-thinkbot-loading" style={{ background: dark ? "rgba(8,22,50,.88)" : "rgba(255,255,255,.92)", borderColor: cardBor }}>
          <span className="sp-thinkbot-loading-ring" aria-hidden="true" />
          <img src={thinkBotLogo} alt="ThinkBot" className="sp-thinkbot-loading-logo" />
        </div>
        <h3 className="sp-wait-title" style={{ color: textC, margin: 0 }}>
          Some of the questions has 2 answers to submit!<LoadingDots color={mutedC} />
        </h3>
      </div>
    </div>
  );
}
