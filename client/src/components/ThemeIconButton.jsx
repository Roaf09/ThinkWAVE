import { TwIcon } from "./TwUI";

// Tailwind pilot (see styles/tailwind.css): the base look is utilities.
// The legacy `tw-theme-icon-button` hook stays on the element so contextual
// sidebar overrides and svg fixes keep matching, and `tw-theme-icon-swap`
// keeps the keyframe animation. Props/API unchanged.
const BASE =
  "tw-theme-icon-button inline-grid h-[42px] w-[42px] place-items-center rounded-xl " +
  "border border-solid border-current bg-transparent p-0 cursor-pointer " +
  "transition-[transform,background-color,border-color,color] duration-[220ms] ease-[ease] " +
  "hover:-translate-y-0.5 hover:-rotate-3 hover:bg-brand/10";

export default function ThemeIconButton({ dark, onClick, style, className = "", size = 19 }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${BASE} ${className}`.trim()}
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
