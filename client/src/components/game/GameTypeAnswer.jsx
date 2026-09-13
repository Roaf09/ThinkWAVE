
// Shared identification input. value: string, onChange(string).
export function GameTypeAnswer({ value, onChange, disabled }) {
  const text = String(value ?? "");
  const MAX = 255;
  return (
    <div className="type-wrap">
      <div className="type-center-shell">
        <p className="type-label">Type your identification answer below</p>
        <div className={`type-input-row${disabled ? " locked" : ""}`}>
          <input
            className="type-input"
            value={text}
            onChange={(e) => onChange(e.target.value.slice(0, MAX))}
            placeholder="Start typing..."
            disabled={disabled}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            maxLength={MAX}
          />
          {!disabled && text && <button type="button" className="type-clear-btn" onClick={() => onChange("")}>✕</button>}
        </div>
        <div className="type-count">{text.length} / {MAX}</div>
      </div>
    </div>
  );
}
