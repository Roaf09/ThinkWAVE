/* FILE GUIDE:
 * client/src/components/ActionDialog.jsx
 * Purpose: Reusable confirmation/validation modal used across the UI.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useColors, useTheme } from "../context/ThemeContext";

const TONES = {
  red:   { icon: "🗑", lightTint: "rgba(252,165,165,0.45)", darkTint: "rgba(127,29,29,0.32)" },
  yellow:{ icon: "⚠️", lightTint: "rgba(253,224,71,0.35)", darkTint: "rgba(120,53,15,0.32)" },
  blue:  { icon: "ℹ️", lightTint: "rgba(147,197,253,0.35)", darkTint: "rgba(43,108,255,0.28)" },
  green: { icon: "✓",  lightTint: "rgba(134,239,172,0.35)", darkTint: "rgba(20,83,45,0.32)" },
};

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
        style={{
          position: "fixed",
          inset: 0,
          background: dark ? "rgba(0,0,0,0.68)" : "rgba(30,45,85,0.30)",
          backdropFilter: "blur(8px)",
          zIndex: 4200,
          opacity: closing ? 0 : 1,
          transition: "opacity 260ms ease",
        }}
      />
      <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 4201, pointerEvents: "none" }}>
        <div
          style={{
            width,
            borderRadius: 20,
            background: c.cardBg,
            border: `1px solid ${c.border}`,
            boxShadow: dark ? "0 24px 64px rgba(0,0,0,0.48)" : "0 22px 56px rgba(43,108,255,0.14)",
            overflow: "hidden",
            opacity: closing ? 0 : 1,
            transform: closing ? "translateY(12px) scale(0.985)" : "translateY(0) scale(1)",
            transition: "opacity 260ms ease, transform 260ms ease",
            pointerEvents: "auto",
          }}
        >
          <div style={{ padding: "28px 30px 18px", background: dark ? `linear-gradient(180deg, ${toneConfig.darkTint}, transparent)` : `linear-gradient(180deg, ${toneConfig.lightTint}, transparent)` }}>
            <div style={{ width: 60, height: 60, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", background: toneConfig.bg, color: toneConfig.fg, fontSize: 28, marginBottom: 18, border: `1px solid ${toneConfig.border}` }}>
              {icon || toneConfig.icon}
            </div>
            {title && <h3 style={{ margin: 0, color: c.text, fontSize: 24, fontWeight: 900, letterSpacing: "-0.02em" }}>{title}</h3>}
            {message !== undefined && (
              <div style={{ marginTop: 12, color: c.textMuted, lineHeight: 1.7, fontSize: 14 }}>
                {typeof message === "string" ? <p style={{ margin: 0 }}>{message}</p> : message}
              </div>
            )}
          </div>

          {(children || actions || confirmLabel || !autoDismiss) && (
            <div style={{ padding: "0 30px 28px", display: "flex", gap: 12, justifyContent: "flex-end", flexWrap: "wrap" }}>
              {children || actions || (
                autoDismiss ? null : (
                  <>
                    <button onClick={dismiss} style={secondaryBtn(c, dark)}>{cancelLabel}</button>
                    {confirmLabel && <button onClick={onConfirm} style={primaryBtn(toneConfig)}>{confirmLabel}</button>}
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

export function secondaryBtn(c, dark) {
  return {
    padding: "12px 22px",
    borderRadius: 12,
    border: `1px solid ${dark ? c.border : c.inputBorder || c.border}`,
    background: dark ? c.cardBg2 : "#edf3ff",
    color: dark ? c.text : "#17305f",
    fontSize: 15,
    fontWeight: 800,
    cursor: "pointer",
    boxShadow: dark ? "none" : "0 8px 18px rgba(43,108,255,0.08)",
  };
}

export function primaryBtn(tone) {
  return {
    padding: "12px 22px",
    borderRadius: 12,
    border: `1px solid ${tone.border}`,
    background: tone.bg,
    color: tone.fg,
    fontSize: 15,
    fontWeight: 900,
    cursor: "pointer",
  };
}
