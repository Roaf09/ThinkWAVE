import React from "react";
import { TwIcon } from "./TwUI";

export default function ThemeIconButton({ dark, onClick, style, className = "", size = 19 }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`tw-theme-icon-button ${className}`.trim()}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      style={style}
    >
      <span key={dark ? "sun" : "moon"} className="tw-theme-icon-swap">
        <TwIcon name={dark ? "sun" : "moon"} size={size} />
      </span>
    </button>
  );
}
