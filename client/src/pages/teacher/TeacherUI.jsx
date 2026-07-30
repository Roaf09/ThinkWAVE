import React from "react";
import { createPortal } from "react-dom";
import { useTheme } from "../../context/ThemeContext";
import { TwIcon } from "../../components/TwUI";

const METRIC_PALETTES = {
  blue:   { light: { bg: "#a8c1ff", border: "#2555c7" }, dark: { bg: "#1d4fb8", border: "#102d75" } },
  teal:   { light: { bg: "#8fe3da", border: "#0f8176" }, dark: { bg: "#0f766e", border: "#064e47" } },
  purple: { light: { bg: "#c5b5ff", border: "#7040d8" }, dark: { bg: "#6d28d9", border: "#421786" } },
  orange: { light: { bg: "#ffd37b", border: "#c87800" }, dark: { bg: "#a94f08", border: "#6f3105" } },
  red:    { light: { bg: "#fda4af", border: "#be123c" }, dark: { bg: "#9f1239", border: "#5f0825" } },
  green:  { light: { bg: "#9ee6b6", border: "#178c43" }, dark: { bg: "#16753a", border: "#0d4d27" } },
};

export function TeacherMetricCard({ icon, label, value, hint, tone = "blue" }) {
  const { dark } = useTheme();
  const palette = (METRIC_PALETTES[tone] || METRIC_PALETTES.blue)[dark ? "dark" : "light"];
  const ink = dark ? "#ffffff" : "#0f172a";
  return (
    <div className="tw-teacher-metric" style={{ "--teacher-metric-bg": palette.bg, "--teacher-metric-border": palette.border, "--teacher-metric-ink": ink }}>
      <span className="tw-teacher-metric-icon"><TwIcon name={icon} size={23} /></span>
      <div>
        <strong>{Number(value || 0).toLocaleString()}</strong>
        <b>{label}</b>
        {hint && <small>{hint}</small>}
      </div>
    </div>
  );
}

export function TeacherPressButton({ tone = "blue", className = "", icon, children, type = "button", ...props }) {
  return (
    <button type={type} {...props} className={`tw-admin-press tw-admin-press-${tone} tw-teacher-press ${className}`.trim()}>
      <span>{icon ? <TwIcon name={icon} size={17} /> : null}{children}</span>
    </button>
  );
}

export function ThinkBotEmptyState({ title, actionLabel, onAction, compact = false, c }) {
  return (
    <section className={`tw-thinkbot-empty${compact ? " is-compact" : ""}`} style={{ background: c.cardBg, borderColor: c.border, color: c.text }}>
      <img src="/media/thinkbotsit.png" alt="ThinkBOT" />
      <h3>{title}</h3>
      {actionLabel && <TeacherPressButton tone="purple" onClick={onAction}>{actionLabel}</TeacherPressButton>}
    </section>
  );
}

export function TeacherActionModal({ c, icon = "alert", title, message, tone = "blue", confirmLabel = "Confirm", cancelLabel = "Cancel", onConfirm, onClose, hideCancel = false, textCancel = false, children }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <>
      <div className="tw-admin-logout-backdrop" onClick={onClose} />
      <div className="tw-admin-logout-layer" onClick={onClose}>
        <section className="tw-admin-logout-modal tw-teacher-action-modal" onClick={(event) => event.stopPropagation()} style={{ background: c.cardBg, borderColor: c.border, color: c.text }}>
          <header><TwIcon name={icon} size={58} /><strong>{title}</strong></header>
          {message && <p style={{ color: c.textMuted }}>{message}</p>}
          {children}
          <div className="tw-admin-logout-actions tw-teacher-action-actions">
            {!hideCancel && (textCancel ? <button type="button" className="tw-teacher-text-cancel" onClick={onClose}>{cancelLabel}</button> : <TeacherPressButton tone="blue" onClick={onClose}>{cancelLabel}</TeacherPressButton>)}
            <TeacherPressButton tone={tone} onClick={onConfirm}>{confirmLabel}</TeacherPressButton>
          </div>
        </section>
      </div>
    </>,
    document.body
  );
}
