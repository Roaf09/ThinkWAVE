/* FILE GUIDE:
 * client/src/components/ActionDialog.jsx
 * Purpose: Reusable confirmation/validation modal used across the UI.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useColors, useTheme } from "../context/ThemeContext";
import { TwIcon } from "./TwUI";

const TONES = {
  red:   { icon: "trash", lightTint: "rgba(252,165,165,0.45)", darkTint: "rgba(127,29,29,0.32)" },
  yellow:{ icon: "warning", lightTint: "rgba(253,224,71,0.35)", darkTint: "rgba(120,53,15,0.32)" },
  blue:  { icon: "alert", lightTint: "rgba(147,197,253,0.35)", darkTint: "rgba(43,108,255,0.28)" },
  green: { icon: "check",  lightTint: "rgba(134,239,172,0.35)", darkTint: "rgba(20,83,45,0.32)" },
};

const ICON_ALIASES = {
  "🗑": "trash", "🗑️": "trash", trash: "trash", delete: "trash",
  "⚠": "warning", "⚠️": "warning", warning: "warning",
  "✓": "check", check: "check", success: "check",
  "🚀": "spark", publish: "spark", spark: "spark",
  "📚": "bank", bank: "bank",
  "ℹ": "alert", "ℹ️": "alert", info: "alert", alert: "alert",
  plus: "plus", history: "history", logout: "logout", calendar: "calendar",
};

function DialogIcon({ icon, fallback }) {
  if (React.isValidElement(icon)) return icon;
  const raw = String(icon || fallback || "alert");
  const name = ICON_ALIASES[raw] || raw;
  return <TwIcon name={name} size={48} strokeWidth={2.7} />;
}

// Reusable modal for confirmations, warnings, and success/error notices across the app.
export default function ActionDialog({
  open = true,
  tone = "blue",
  icon,
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  onClose,
  onConfirm,
  children,
  actions,
  autoDismiss = false,
  autoDismissMs = 2000,
  closeOnBackdrop = true,
  width = "min(100%, 540px)",
  plainIcon = false,
  flatSurface = false,
}) {
  const c = useColors();
  const { dark } = useTheme();
  const [closing, setClosing] = useState(false);
  const toneConfig = useMemo(() => {
    const base = TONES[tone] || TONES.blue;
    const bg = tone === "red" ? c.redBg : tone === "yellow" ? c.yellowBg : tone === "green" ? c.greenBg : `${c.accent}18`;
    const fg = tone === "red" ? c.redFg : tone === "yellow" ? c.yellowFg : tone === "green" ? c.greenFg : c.accent;
    const border = tone === "red" ? c.redBorder : tone === "yellow" ? c.yellowBorder : tone === "green" ? c.greenBorder : c.accent;
    return { ...base, bg, fg, border };
  }, [tone, c]);

  useEffect(() => {
    if (!open || !autoDismiss) return;
    const t = setTimeout(() => {
      setClosing(true);
      setTimeout(() => onClose?.(), 260);
    }, autoDismissMs);
    return () => clearTimeout(t);
  }, [open, autoDismiss, autoDismissMs, onClose]);

  useEffect(() => {
    if (!open) setClosing(false);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prevOverflow; };
  }, [open]);

  if (!open) return null;

  const dismiss = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(() => onClose?.(), 240);
  };

  const node = (
    <>
      <div
        onClick={closeOnBackdrop && !autoDismiss ? dismiss : undefined}
        className="fixed inset-0 z-[4200]"
        style={{
          background: dark ? "rgba(0,0,0,0.68)" : "rgba(30,45,85,0.30)",
          backdropFilter: "blur(8px)",
          opacity: closing ? 0 : 1,
          transition: "opacity 260ms ease",
        }}
      />
      <div className="fixed inset-0 z-[4201] flex items-center justify-center p-5 pointer-events-none">
        <div
          className="rounded-[20px] overflow-hidden"
          style={{
            width,
            background: c.cardBg,
            border: `1px solid ${c.border}`,
            boxShadow: dark ? "0 24px 64px rgba(0,0,0,0.48)" : "0 22px 56px rgba(43,108,255,0.14)",
            opacity: closing ? 0 : 1,
            transform: closing ? "translateY(12px) scale(0.985)" : "translateY(0) scale(1)",
            transition: "opacity 260ms ease, transform 260ms ease",
            pointerEvents: "auto",
          }}
        >
          <div className="px-[30px] pt-7 pb-[18px]" style={{ background: flatSurface ? "transparent" : (dark ? `linear-gradient(180deg, ${toneConfig.darkTint}, transparent)` : `linear-gradient(180deg, ${toneConfig.lightTint}, transparent)`) }}>
            <div className="w-[76px] h-[76px] flex items-center justify-center mb-4" style={{ borderRadius: plainIcon ? 0 : 18, background: plainIcon ? "transparent" : toneConfig.bg, color: plainIcon ? (dark ? "#fff" : "#0f172a") : toneConfig.fg, border: plainIcon ? "none" : `1px solid ${toneConfig.border}`, boxShadow: "none" }}>
              <DialogIcon icon={icon} fallback={toneConfig.icon} />
            </div>
            {title && <h3 className="m-0 text-2xl font-black tracking-[-0.02em]" style={{ color: c.text }}>{title}</h3>}
            {message !== undefined && (
              <div className="mt-3 text-sm leading-[1.7]" style={{ color: c.textMuted }}>
                {typeof message === "string" ? <p className="m-0">{message}</p> : message}
              </div>
            )}
          </div>

          {(children || actions || confirmLabel || !autoDismiss) && (
            <div className="px-[30px] pb-7 flex gap-3 justify-end flex-wrap">
              {children || actions || (
                autoDismiss ? null : (
                  <>
                    <button onClick={dismiss} className={SECONDARY_BTN_CLASS} style={secondaryBtn(c, dark)}>{cancelLabel}</button>
                    {confirmLabel && <button onClick={onConfirm} className={PRIMARY_BTN_CLASS} style={primaryBtn(toneConfig)}>{confirmLabel}</button>}
                  </>
                )
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );

  return createPortal(node, document.body);
}

// Static button shells as utilities; colors stay inline (theme/tone-driven).
// secondaryBtn/primaryBtn now return dynamic-only style objects.
const SECONDARY_BTN_CLASS = "px-[22px] py-3 rounded-xl text-[15px] font-extrabold cursor-pointer";
const PRIMARY_BTN_CLASS = "px-[22px] py-3 rounded-xl text-[15px] font-black cursor-pointer";

export function secondaryBtn(c, dark) {
  return {
    border: `1px solid ${dark ? c.border : c.inputBorder || c.border}`,
    background: dark ? c.cardBg2 : "#edf3ff",
    color: dark ? c.text : "#17305f",
    boxShadow: dark ? "none" : "0 8px 18px rgba(43,108,255,0.08)",
  };
}

export function primaryBtn(tone) {
  return {
    border: `1px solid ${tone.border}`,
    background: tone.bg,
    color: tone.fg,
  };
}
