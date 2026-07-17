/* FILE GUIDE:
 * client/src/components/TwUI.jsx
 * Purpose: Shared ThinkWAVE visual primitives for the UI refresh: thick-line icons, empty states, and metric cards.
 */

import React from "react";
import { useColors } from "../context/ThemeContext";

const iconSet = {
  home: [<path key="1" d="M4 11.5 12 5l8 6.5" />, <path key="2" d="M6.5 10.5V20h11v-9.5" />, <path key="3" d="M10 20v-5h4v5" />],
  create: [<path key="1" d="M12 5v14" />, <path key="2" d="M5 12h14" />],
  bank: [<path key="1" d="M5 7.5 12 4l7 3.5-7 3.5-7-3.5Z" />, <path key="2" d="M5 12l7 3.5 7-3.5" />, <path key="3" d="M5 16.5 12 20l7-3.5" />],
  live: [<path key="1" d="M8 6.5v11l9-5.5-9-5.5Z" />],
  classes: [<path key="1" d="M4.5 7.5h15" />, <path key="2" d="M6 5h12a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 18 19H6a1.5 1.5 0 0 1-1.5-1.5v-11A1.5 1.5 0 0 1 6 5Z" />, <path key="3" d="M8.5 11h7" />, <path key="4" d="M8.5 15h4" />],
  history: [<path key="1" d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />, <path key="2" d="M4.5 5.5v4h4" />, <path key="3" d="M12 8v4.5l3 1.8" />],
  invitation: [<path key="1" d="M4.5 7.5h15v10h-15v-10Z" />, <path key="2" d="m5 8 7 5 7-5" />],
  sun: [<circle key="1" cx="12" cy="12" r="4" />, <path key="2" d="M12 2.8v2" />, <path key="3" d="M12 19.2v2" />, <path key="4" d="M4.8 4.8l1.4 1.4" />, <path key="5" d="M17.8 17.8l1.4 1.4" />, <path key="6" d="M2.8 12h2" />, <path key="7" d="M19.2 12h2" />, <path key="8" d="M4.8 19.2l1.4-1.4" />, <path key="9" d="M17.8 6.2l1.4-1.4" />],
  moon: [<path key="1" d="M19 14.5A7.2 7.2 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5Z" />],
  logout: [<path key="1" d="M10 5H6.5A1.5 1.5 0 0 0 5 6.5v11A1.5 1.5 0 0 0 6.5 19H10" />, <path key="2" d="M13 8l4 4-4 4" />, <path key="3" d="M17 12H9" />],
  join: [<path key="1" d="M7 13.5 11 17l6-9" />, <path key="2" d="M4.5 5.5h15v13h-15z" />],
  host: [<path key="1" d="M5 7h14" />, <path key="2" d="M7 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />, <path key="3" d="M8.5 11h7" />, <path key="4" d="M8.5 15H13" />],
  user: [<circle key="1" cx="12" cy="8" r="3.2" />, <path key="2" d="M5.5 20a6.5 6.5 0 0 1 13 0" />],
  student: [<path key="1" d="M4 9 12 5l8 4-8 4-8-4Z" />, <path key="2" d="M7 11.2v4.2c1.4 1.4 3 2.1 5 2.1s3.6-.7 5-2.1v-4.2" />, <path key="3" d="M20 9v5" />],
  teacher: [<circle key="1" cx="9" cy="8" r="3" />, <path key="2" d="M3.8 20a5.2 5.2 0 0 1 10.4 0" />, <path key="3" d="M15 7h5" />, <path key="4" d="M15 11h5" />, <path key="5" d="M17 15h3" />],
  guest: [<path key="1" d="M12 4.5a4 4 0 0 1 4 4c0 3-4 4.5-4 4.5S8 11.5 8 8.5a4 4 0 0 1 4-4Z" />, <path key="2" d="M5 20c1.5-2.8 3.8-4.2 7-4.2s5.5 1.4 7 4.2" />],
  spark: [<path key="1" d="M12 3l1.7 5.1L19 10l-5.3 1.9L12 17l-1.7-5.1L5 10l5.3-1.9L12 3Z" />, <path key="2" d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z" />],
  folder: [<path key="1" d="M4 7.5A1.5 1.5 0 0 1 5.5 6H10l2 2h6.5A1.5 1.5 0 0 1 20 9.5v7A1.5 1.5 0 0 1 18.5 18h-13A1.5 1.5 0 0 1 4 16.5v-9Z" />],
  clock: [<circle key="1" cx="12" cy="12" r="8" />, <path key="2" d="M12 8v4l2.5 1.5" />],
  calendar: [<rect key="1" x="4.5" y="5.5" width="15" height="14" rx="2" />, <path key="2" d="M8 3.5v4" />, <path key="3" d="M16 3.5v4" />, <path key="4" d="M4.5 10h15" />, <path key="5" d="M8 14h.01" />, <path key="6" d="M12 14h.01" />, <path key="7" d="M16 14h.01" />],
  chart: [<path key="1" d="M5 19V5" />, <path key="2" d="M5 19h14" />, <path key="3" d="M8.5 15v-3" />, <path key="4" d="M12 15V8" />, <path key="5" d="M15.5 15v-5" />],
  check: [<path key="1" d="m5 12 4 4 10-10" />],
  alert: [<path key="1" d="M12 4 21 20H3L12 4Z" />, <path key="2" d="M12 9v4" />, <path key="3" d="M12 17h.01" />],
  mcq: [<path key="1" d="M6 7h12" />, <path key="2" d="M6 12h12" />, <path key="3" d="M6 17h8" />],
  truefalse: [<path key="1" d="m4.5 12 3 3 5-6" />, <path key="2" d="m15 9 4.5 6" />, <path key="3" d="m19.5 9-4.5 6" />],
  identification: [<path key="1" d="M5 6h14" />, <path key="2" d="M5 12h9" />, <path key="3" d="M5 18h6" />, <path key="4" d="M16 17l3-3 2 2-3 3h-2v-2Z" />],
  matching: [<path key="1" d="M7 7h.01" />, <path key="2" d="M17 7h.01" />, <path key="3" d="M7 17h.01" />, <path key="4" d="M17 17h.01" />, <path key="5" d="M8.5 7h7" />, <path key="6" d="M8.5 17h7" />, <path key="7" d="M12 8.5v7" />],
  image: [<rect key="1" x="4.5" y="5.5" width="15" height="13" rx="2" />, <circle key="2" cx="9" cy="10" r="1.2" />, <path key="3" d="m6 17 4.2-4.2 2.8 2.8 2-2L18 17" />],
  spell: [<path key="1" d="M6 7h4v4H6z" />, <path key="2" d="M14 7h4v4h-4z" />, <path key="3" d="M6 15h4v4H6z" />, <path key="4" d="M14 15h4v4h-4z" />, <path key="5" d="M10 9h4" />, <path key="6" d="M12 11v4" />],
  gear: [<circle key="1" cx="12" cy="12" r="3" />, <path key="2" d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />],
  upload: [<path key="1" d="M12 16V4" />, <path key="2" d="m7 9 5-5 5 5" />, <path key="3" d="M5 20h14" />],
  trash: [<path key="1" d="M4 7h16" />, <path key="2" d="M9 7V4h6v3" />, <path key="3" d="m7 7 1 13h8l1-13" />, <path key="4" d="M10 11v5" />, <path key="5" d="M14 11v5" />],
  arrow: [<path key="1" d="M5 12h14" />, <path key="2" d="m14 7 5 5-5 5" />],
  chevronDown: [<path key="1" d="m6 9 6 6 6-6" />],
  chevronUp: [<path key="1" d="m6 15 6-6 6 6" />],
  bell: [<path key="1" d="M6.5 10a5.5 5.5 0 0 1 11 0v4l2 2H4.5l2-2v-4Z" />, <path key="2" d="M10 19h4" />],
  health: [<path key="1" d="M12 20s-7-4.3-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.7-7 10-7 10Z" />, <path key="2" d="M8 12h2l1-2.5 2 5 1-2.5h2" />],
  volume: [<path key="1" d="M5 10h3l4-3v10l-4-3H5z" />, <path key="2" d="M15 9.5a4 4 0 0 1 0 5" />, <path key="3" d="M17.5 7a7 7 0 0 1 0 10" />],
  volumeOff: [<path key="1" d="M5 10h3l4-3v10l-4-3H5z" />, <path key="2" d="m16 10 5 5" />, <path key="3" d="m21 10-5 5" />],
  mic: [<rect key="1" x="9" y="3" width="6" height="11" rx="3" />, <path key="2" d="M6.5 11.5a5.5 5.5 0 0 0 11 0" />, <path key="3" d="M12 17v4" />, <path key="4" d="M9 21h6" />],
  stop: [<rect key="1" x="6" y="6" width="12" height="12" rx="2" />],
  pause: [<path key="1" d="M8 5v14" />, <path key="2" d="M16 5v14" />],
  play: [<path key="1" d="M8 5v14l11-7Z" />],
  cpu: [<rect key="1" x="7" y="7" width="10" height="10" rx="2" />, <path key="2" d="M10 10h4v4h-4z" />, <path key="3" d="M9 3v4M15 3v4M9 17v4M15 17v4M3 9h4M17 9h4M3 15h4M17 15h4" />],
  memory: [<rect key="1" x="4" y="7" width="16" height="10" rx="2" />, <path key="2" d="M7 10h2M11 10h2M15 10h2M7 14h10" />],
  server: [<rect key="1" x="4" y="4" width="16" height="6" rx="2" />, <rect key="2" x="4" y="14" width="16" height="6" rx="2" />, <path key="3" d="M8 7h.01M8 17h.01M12 7h5M12 17h5" />],
  traffic: [<path key="1" d="M4 18h16" />, <path key="2" d="M6 15l4-4 3 2 5-7" />, <path key="3" d="m15 6 3 0 0 3" />],
  error: [<circle key="1" cx="12" cy="12" r="8" />, <path key="2" d="M12 8v5" />, <path key="3" d="M12 16h.01" />],
  search: [<circle key="1" cx="10.5" cy="10.5" r="6.5" />, <path key="2" d="m15.5 15.5 4 4" />],
  mail: [<rect key="1" x="4" y="6" width="16" height="12" rx="2" />, <path key="2" d="m5 7 7 6 7-6" />],
  phone: [<path key="1" d="M7 4h3l1.2 4-2 1.3a14 14 0 0 0 5.5 5.5l1.3-2 4 1.2v3c0 1.1-.9 2-2 2C10.3 19 5 13.7 5 7a3 3 0 0 1 2-3Z" />],
  globe: [<circle key="1" cx="12" cy="12" r="9" />, <path key="2" d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />],
  briefcase: [<rect key="1" x="4" y="7" width="16" height="12" rx="2" />, <path key="2" d="M9 7V5h6v2M4 12h16M10 12v2h4v-2" />],
  analytics: [<path key="1" d="M4 19V9" />, <path key="2" d="M10 19V5" />, <path key="3" d="M16 19v-7" />, <path key="4" d="M3 19h18" />],
  arrowRight: [<path key="1" d="M5 12h14" />, <path key="2" d="m14 7 5 5-5 5" />],
  download: [<path key="1" d="M12 4v11" />, <path key="2" d="m7 11 5 5 5-5" />, <path key="3" d="M5 20h14" />],
  link: [<path key="1" d="M9.5 14.5 14.5 9" />, <path key="2" d="M7.5 16.5 6 18a3.5 3.5 0 0 1-5-5l3-3a3.5 3.5 0 0 1 5 0" />, <path key="3" d="m16.5 7.5 1.5-1.5a3.5 3.5 0 0 1 5 5l-3 3a3.5 3.5 0 0 1-5 0" />],
  plus: [<path key="1" d="M12 5v14" />, <path key="2" d="M5 12h14" />],
  trophy: [<path key="1" d="M8 4h8v4a4 4 0 0 1-8 0V4Z" />, <path key="2" d="M8 6H4v2a4 4 0 0 0 4 4" />, <path key="3" d="M16 6h4v2a4 4 0 0 1-4 4" />, <path key="4" d="M12 12v5" />, <path key="5" d="M8 20h8" />],
  users: [<circle key="1" cx="9" cy="8" r="3" />, <circle key="2" cx="17" cy="9" r="2.3" />, <path key="3" d="M3.5 20a5.5 5.5 0 0 1 11 0" />, <path key="4" d="M14 15.5a4.5 4.5 0 0 1 6.5 4" />],
  warning: [<path key="1" d="M12 4 21 20H3L12 4Z" />, <path key="2" d="M12 9v4" />, <path key="3" d="M12 17h.01" />],
  close: [<path key="1" d="m6 6 12 12" />, <path key="2" d="M18 6 6 18" />],
};

export function TwIcon({ name = "spark", size = 20, strokeWidth = 2.6, style, title }) {
  const children = iconSet[name] || iconSet.spark;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      style={{ display: "inline-block", verticalAlign: "middle", flex: "0 0 auto", ...style }}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {title && <title>{title}</title>}
      {children}
    </svg>
  );
}

export function IconBubble({ name = "spark", c, size = 42, iconSize = 22, tone = "blue", style }) {
  const fallbackColors = useColors();
  const colors = c || fallbackColors;
  const toneMap = {
    blue: { bg: `${colors.accent}18`, fg: colors.accent, border: `${colors.accent}44` },
    green: { bg: colors.greenBg, fg: colors.greenFg, border: colors.greenBorder },
    yellow: { bg: colors.yellowBg, fg: colors.yellowFg, border: colors.yellowBorder },
    red: { bg: colors.redBg, fg: colors.redFg, border: colors.redBorder },
    neutral: { bg: colors.cardBg2, fg: colors.textMuted, border: colors.border },
  };
  const toneValue = toneMap[tone] || toneMap.blue;
  return (
    <span
      className="tw-icon-bubble"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.32),
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: toneValue.bg,
        color: toneValue.fg,
        border: `1px solid ${toneValue.border}`,
        ...style,
      }}
    >
      <TwIcon name={name} size={iconSize} />
    </span>
  );
}

export function EmptyState({ icon = "spark", title, message, action, c, compact = false }) {
  const fallbackColors = useColors();
  const colors = c || fallbackColors;
  return (
    <div className="tw-empty-state" style={{ borderColor: colors.border, background: colors.cardBg2, color: colors.text, padding: compact ? 14 : 20 }}>
      <IconBubble name={icon} c={colors} size={compact ? 38 : 48} iconSize={compact ? 19 : 24} />
      <div style={{ minWidth: 0 }}>
        {title && <div style={{ fontWeight: 900, color: colors.text, marginBottom: 4 }}>{title}</div>}
        {message && <div style={{ color: colors.textMuted, fontSize: 13, lineHeight: 1.55 }}>{message}</div>}
      </div>
      {action && <div style={{ marginLeft: "auto" }}>{action}</div>}
    </div>
  );
}

export function StatCard({ c, icon = "chart", label, value, hint, tone = "blue", accent }) {
  const fallbackColors = useColors();
  const colors = c || fallbackColors;
  return (
    <div className="tw-stat-card" style={{ background: colors.cardBg, borderColor: colors.border }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div>
          <div style={{ textTransform: "uppercase", letterSpacing: "0.08em", color: colors.textSub, fontWeight: 900, fontSize: 11 }}>{label}</div>
          <div style={{ color: accent || colors.text, fontSize: 32, fontWeight: 950, marginTop: 10, letterSpacing: "-0.04em" }}>{value}</div>
        </div>
        <IconBubble name={icon} c={colors} tone={tone} />
      </div>
      <div style={{ color: colors.textMuted, fontSize: 13, marginTop: 12, lineHeight: 1.55 }}>{hint}</div>
    </div>
  );
}
