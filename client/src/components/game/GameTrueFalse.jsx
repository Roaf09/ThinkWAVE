
// Shared True/False renderer. value: { choice }. lock behaves like GameMcq.
export function GameTrueFalse({ options, value, onChange, disabled, lock = "lock-all" }) {
  const opts = Array.isArray(options) && options.length ? options : ["True", "False"];
  const labels = ["T", "F"];
  const dimOthers = lock === "dim-unselected";
  return (
    <div className="quiz-choices true-false-choices">
      {opts.map((o, i) => {
        const active = value?.choice === o;
        const isDimmed = dimOthers && disabled && !active;
        return (
          <button
            key={i}
            type="button"
            className={`choice-btn ${active ? "active" : ""} ${isDimmed ? "dimmed" : ""}`}
            onClick={() => !disabled && onChange({ choice: o })}
            disabled={dimOthers ? (disabled && !active) : disabled}
          >
            <span className="choice-badge">{labels[i] || o?.charAt(0)?.toUpperCase() || ""}</span>
            <span className="choice-text">{o}</span>
          </button>
        );
      })}
    </div>
  );
}
