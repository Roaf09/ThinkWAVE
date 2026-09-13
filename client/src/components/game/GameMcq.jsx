import { useMemo } from "react";
import { choiceValue, normalizeChoiceOption, seededOrder, trimText } from "./gameChoices";

// Shared MCQ renderer for live + assignment gameplay.
// - value: { choice?, choices? }, onChange(nextValue) with the same shape.
// - shuffleSeed: per-student shuffle seed, or null for natural order.
// - lock: "dim-unselected" (live: submitted selection stays visible, rest dim)
//   or "lock-all" (assignment: everything disables together).
export function GameMcq({ options, mcqMode, answerMode, value, onChange, disabled, lock = "lock-all", shuffleSeed = null }) {
  const opts = Array.isArray(options) ? options.map(normalizeChoiceOption) : [];
  const order = useMemo(
    () => seededOrder(opts.length, shuffleSeed != null, shuffleSeed || "mcq"),
    [opts.length, shuffleSeed]
  );
  const displayOpts = order.map((idx) => opts[idx]).filter(Boolean);
  const labels = "ABCDEFGHIJ".split("");
  const isModifiedMcq = mcqMode === "MODIFIED";
  const twoMode = answerMode === "TWO";
  const selectedList = Array.isArray(value?.choices) ? value.choices : [value?.choice].filter(Boolean);
  const dimOthers = lock === "dim-unselected";

  function toggleChoice(choice) {
    if (!twoMode) return onChange({ choice });
    if (selectedList.includes(choice)) return onChange({ choices: selectedList.filter((x) => x !== choice) });
    if (selectedList.length >= 2) return onChange({ choices: [selectedList[1], choice] });
    return onChange({ choices: [...selectedList, choice] });
  }

  return (
    <div className={`quiz-choices ${isModifiedMcq ? "modified-mcq-choices" : ""}`}>
      {displayOpts.map((o, i) => {
        const choice = choiceValue(o);
        const active = selectedList.includes(choice) || selectedList.includes(o.text);
        const textLen = trimText(o.text).length;
        const isDimmed = dimOthers && disabled && !active;
        return (
          <button
            key={o.id || i}
            type="button"
            className={`choice-btn ${isModifiedMcq ? "modified-mcq-choice" : ""} ${active ? "active" : ""} ${isDimmed ? "dimmed" : ""}`}
            onClick={() => !disabled && toggleChoice(choice)}
            disabled={dimOthers ? (disabled && !active) : disabled}
          >
            <span className="choice-badge">{labels[i] || ""}</span>
            <span className="choice-content">
              {o.image ? <img src={o.image} alt="" className="choice-img" /> : null}
              {(trimText(o.text) || !o.image) ? <span className="choice-text" style={{ fontSize: textLen > 90 ? 13 : textLen > 55 ? 14 : undefined }}>{trimText(o.text) || `Option ${labels[i] || i + 1}`}</span> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
