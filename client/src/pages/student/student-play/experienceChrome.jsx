import ThemeIconButton from "../../../components/ThemeIconButton";
import { TwIcon } from "../../../components/TwUI";

const WAIT_CARD_COLORS = [
  { bg: "#dbeafe", border: "#93c5fd", text: "#1e3a8a" },
  { bg: "#dcfce7", border: "#86efac", text: "#166534" },
  { bg: "#fef3c7", border: "#fcd34d", text: "#92400e" },
  { bg: "#fee2e2", border: "#fca5a5", text: "#b91c1c" },
  { bg: "#ede9fe", border: "#c4b5fd", text: "#6d28d9" },
  { bg: "#cffafe", border: "#67e8f9", text: "#0f766e" },
  { bg: "#fce7f3", border: "#f9a8d4", text: "#be185d" },
  { bg: "#ffedd5", border: "#fdba74", text: "#c2410c" },
];

function hashToIndex(value, length) {
  const s = String(value ?? "");
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return length ? h % length : 0;
}

function rosterTone(seed, dark) {
  const tone = WAIT_CARD_COLORS[hashToIndex(seed, WAIT_CARD_COLORS.length)];
  if (!dark) return tone;
  return {
    bg: `${tone.text}22`,
    border: `${tone.border}88`,
    text: "#e7e9ee",
  };
}

export function ThemeTogglePill({ dark, onClick, style, className = "" }) {
  return <ThemeIconButton dark={dark} onClick={onClick} className={`sp-inline-theme-toggle ${className}`.trim()} style={style} size={22} />;
}

export function SoundTogglePill({ muted, onClick, style, className = "" }) {
  return (
    <button className={`sp-inline-sound-toggle ${className}`.trim()} onClick={onClick} type="button" style={style}
      title={muted ? "Unmute sounds" : "Mute sounds"} aria-label={muted ? "Unmute sounds" : "Mute sounds"}>
      <span key={muted ? "muted" : "sound"} className="tw-theme-icon-swap"><TwIcon name={muted ? "volumeOff" : "volume"} size={19} /></span>
    </button>
  );
}

export function WaitRosterCard({ item, dark, subtitle }) {
  const tone = rosterTone(item.id || `${item.first_name}-${item.last_name}`, dark);
  return (
    <div className="sp-wait-roster-card" style={{ background: tone.bg, borderColor: tone.border }}>
      <div className="sp-roster-profile">{item.profile_image ? <img src={item.profile_image} alt="" /> : <TwIcon name="user" size={18} />}</div>
      <div><div style={{ color: tone.text, fontWeight: 900 }}>{item.first_name} {item.last_name}</div>
      <div style={{ color: dark ? "#bfd0ff" : "#52648f", fontSize: 12 }}>{subtitle}</div></div>
    </div>
  );
}

export function ExperienceControls({ dark, muted, onMute, onTheme }) {
  return <div className="sp-experience-controls"><ThemeTogglePill dark={dark} onClick={onTheme}/><SoundTogglePill muted={muted} onClick={onMute}/></div>;
}

export function AntiCheatModal({ antiCheat, countdown, onConfirm }) {
  if (!antiCheat) return null;
  const warning=antiCheat.type === "warning";
  return <div className="sp-anticheat-backdrop"><div className="sp-anticheat-card">
    <div className={`sp-anticheat-icon ${warning ? "warning" : "danger"}`}><TwIcon name={warning ? "warning" : "logout"} size={38}/></div>
    <h3>{warning ? "Activity warning" : "Session access removed"}</h3>
    <p>{antiCheat.message}</p>
    {warning ? <button type="button" className="tw-dialog-press is-blue" disabled={countdown>0} onClick={onConfirm}><span>{countdown>0 ? `Confirm in ${countdown}s` : "Confirm"}</span></button> : <div className="sp-anticheat-countdown">Redirecting in {Math.max(0,countdown)}s…</div>}
  </div></div>;
}
