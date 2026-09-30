import { useRef, useState } from "react";
import { api } from "../lib/api";
import { manilaDate } from "../lib/dateFormat";
import { TwIcon } from "./TwUI";

// Shared Profile Settings tab content for teacher / student / admin /
// superadmin dashboards. Desktop avatar clicks open this as a tab (sidebar
// stays visible); mobile keeps the existing profile modals.
function Chevron({ open }) {
  return (
    <span style={{ display: "inline-flex", transition: "transform .2s ease", transform: open ? "none" : "rotate(-90deg)", color: "inherit", opacity: 0.7 }}>
      <TwIcon name="chevronDown" size={18} />
    </span>
  );
}

function ExpandableRow({ label, summary, danger, expanded, onToggle, children }) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!!expanded}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "15px 16px", border: "none", background: "transparent", color: "inherit", font: "inherit", cursor: "pointer", textAlign: "left" }}
      >
        <span style={{ fontSize: 14, fontWeight: 800, color: danger ? "#dc2626" : "inherit" }}>{label}</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0, fontSize: 13, fontWeight: 600, opacity: 0.75 }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>{summary}</span>
          <Chevron open={expanded} />
        </span>
      </button>
      {expanded && <div style={{ padding: "0 16px 16px", display: "grid", gap: 10 }}>{children}</div>}
    </div>
  );
}

function StaticRow({ label, value }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "15px 16px" }}>
      <span style={{ fontSize: 14, fontWeight: 800 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, opacity: 0.75, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220, paddingRight: 26 }}>{value || "Not set"}</span>
    </div>
  );
}

function RowInput({ c, ...props }) {
  return <input {...props} style={{ width: "100%", boxSizing: "border-box", padding: "12px 13px", borderRadius: 8, border: `1px solid ${c.inputBorder || c.border}`, background: c.inputBg || c.cardBg2, color: c.text, fontFamily: "inherit", ...(props.style || {}) }} />;
}

function RowButton({ children, tone = "blue", disabled, style, ...props }) {
  const bg = tone === "red" ? "#dc2626" : "#2b6cff";
  return <button type="button" disabled={disabled} {...props} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "10px 18px", borderRadius: 8, border: 0, background: bg, color: "#fff", fontFamily: "inherit", fontWeight: 900, fontSize: 14, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1, ...(style || {}) }}>{children}</button>;
}

function CancelButton({ c, onClick }) {
  return <button type="button" onClick={onClick} style={{ border: "none", background: "transparent", color: c.textMuted, fontFamily: "inherit", fontSize: 14, fontWeight: 800, cursor: "pointer", padding: "10px 4px" }}>Cancel</button>;
}

function RowActions({ c, onCancel, children }) {
  return <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12 }}>{onCancel && <CancelButton c={c} onClick={onCancel} />}{children}</div>;
}

function RowMsg({ c, kind, text }) {
  if (!text) return null;
  const danger = kind === "error";
  return <div style={{ padding: "10px 13px", borderRadius: 8, fontSize: 13, fontWeight: 800, color: danger ? c.redFg : c.greenFg, background: danger ? c.redBg : c.greenBg, border: `1px solid ${danger ? c.redBorder : c.greenBorder}` }}>{text}</div>;
}

function PwField({ c, showCheck, ...props }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <RowInput c={c} {...props} type={show ? "text" : "password"} style={{ paddingRight: 78 }} />
      <span style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", display: "inline-flex", alignItems: "center", gap: 2 }}>
        {showCheck && (
          <span style={{ display: "inline-flex", color: "#16a34a" }}>
            <TwIcon name="check" size={20} strokeWidth={3.2} />
          </span>
        )}
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? "Hide password" : "Show password"}
          title={show ? "Hide password" : "Show password"}
          style={{ border: "none", background: "transparent", color: c.textMuted, cursor: "pointer", display: "inline-flex", padding: 4 }}
        >
          <TwIcon name={show ? "eyeOff" : "eye"} size={20} />
        </button>
      </span>
    </div>
  );
}

function passwordScore(value) {
  let score = 0;
  if (value.length >= 8) score += 1;
  if (/[A-Z]/.test(value)) score += 1;
  if (/[a-z]/.test(value)) score += 1;
  if (/[0-9]/.test(value)) score += 1;
  if (/[^A-Za-z0-9]/.test(value)) score += 1;
  return score;
}

function StrengthMeter({ c, value }) {
  if (!value) return null;
  const score = passwordScore(value);
  const level = score <= 2 ? "weak" : score <= 4 ? "medium" : "strong";
  const color = level === "weak" ? "#dc2626" : level === "medium" ? "#d97706" : "#16a34a";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ flex: 1, height: 8, borderRadius: 99, background: c.cardBg2, border: `1px solid ${c.border}`, overflow: "hidden" }}>
        <div style={{ width: `${(score / 5) * 100}%`, height: "100%", borderRadius: 99, background: color, transition: "width .25s ease, background .25s ease" }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 900, color, textTransform: "capitalize", minWidth: 52, textAlign: "right" }}>{level}</span>
    </div>
  );
}

const BIRTH_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const BIRTH_YEARS = (() => { const current = new Date().getFullYear(); const years = []; for (let y = current; y >= 1900; y -= 1) years.push(y); return years; })();

function calendarDays(view) {
  const first = new Date(view.getFullYear(), view.getMonth(), 1).getDay();
  const count = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  return [...Array(first).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)];
}

function sameDay(selected, view, day) {
  return selected.getFullYear() === view.getFullYear() && selected.getMonth() === view.getMonth() && selected.getDate() === day;
}

function toDateValue(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatBirthDate(value) {
  if (!value) return "";
  // Anchor at noon Manila time so far-away browser zones can't shift the day.
  return manilaDate(`${String(value).slice(0, 10)}T12:00:00+08:00`, { dateStyle: "long" });
}

// Classic calendar birthday picker shared by the tab (staff + student).
export function BirthDateModal({ c, value, onSelect, onClose }) {
  const initial = value ? new Date(`${value}T12:00:00`) : new Date(2010, 0, 1);
  const [view, setView] = useState(new Date(initial.getFullYear(), initial.getMonth(), 1));
  const [selected, setSelected] = useState(initial);
  const days = calendarDays(view);
  const pickerSelect = { padding: "8px 8px", borderRadius: 8, border: `1px solid ${c.inputBorder || c.border}`, background: c.inputBg || c.cardBg2, color: c.text, fontFamily: "inherit", fontWeight: 800, fontSize: 13, cursor: "pointer", maxWidth: 128 };
  const backdrop = { position: "fixed", inset: 0, background: "rgba(3,7,18,.62)", display: "grid", placeItems: "center", padding: 20, zIndex: 4000 };
  const cardBg = { background: c.cardBg, border: `1px solid ${c.border}`, borderRadius: 8, padding: 18, color: c.text };
  return (
    <div style={backdrop}>
      <div className="w-[min(94vw,430px)]" style={cardBg}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <h3 style={{ margin: 0 }}>Select Birth Date</h3>
          <button type="button" onClick={onClose} aria-label="Close" style={{ width: 38, height: 38, display: "grid", placeItems: "center", borderRadius: 8, border: `1px solid ${c.border}`, background: c.cardBg2, color: c.text, cursor: "pointer" }}><TwIcon name="close" size={18} /></button>
        </div>
        <div className="flex justify-between items-center mt-[18px] mb-[12px] gap-[8px]">
          <button type="button" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))} style={{ padding: "10px 14px", borderRadius: 8, border: `1px solid ${c.border}`, background: c.cardBg2, color: c.text, fontWeight: 900, cursor: "pointer" }}>‹</button>
          <span className="flex gap-[8px] justify-center" style={{ flexWrap: "nowrap", flex: "1 1 auto", minWidth: 0 }}>
            <select aria-label="Birth month" value={view.getMonth()} onChange={(e) => setView(new Date(view.getFullYear(), Number(e.target.value), 1))} style={pickerSelect}>{BIRTH_MONTHS.map((month, index) => <option key={month} value={index}>{month}</option>)}</select>
            <select aria-label="Birth year" value={view.getFullYear()} onChange={(e) => setView(new Date(Number(e.target.value), view.getMonth(), 1))} style={pickerSelect}>{BIRTH_YEARS.map((year) => <option key={year} value={year}>{year}</option>)}</select>
          </span>
          <button type="button" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))} style={{ padding: "10px 14px", borderRadius: 8, border: `1px solid ${c.border}`, background: c.cardBg2, color: c.text, fontWeight: 900, cursor: "pointer" }}>›</button>
        </div>
        <div className="grid grid-cols-[repeat(7,1fr)] text-center gap-[5px]">
          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => <div key={day} className="text-[11px] font-[950]" style={{ color: c.textMuted }}>{day}</div>)}
          {days.map((day, index) => day ? <button key={index} type="button" onClick={() => setSelected(new Date(view.getFullYear(), view.getMonth(), day, 12))} style={{ border: `1px solid ${sameDay(selected, view, day) ? c.accent : "transparent"}`, background: sameDay(selected, view, day) ? c.accent : c.cardBg2, color: sameDay(selected, view, day) ? "#fff" : c.text }} className="h-[40px] rounded-[9px] cursor-pointer font-[inherit] font-black">{day}</button> : <span key={index} />)}
        </div>
        <button type="button" onClick={() => onSelect(toDateValue(selected))} className="w-full mt-[18px]" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "10px 14px", borderRadius: 8, border: 0, background: "#2b6cff", color: "#fff", fontFamily: "inherit", fontWeight: 900, cursor: "pointer" }}>Set Birthday</button>
      </div>
    </div>
  );
}

const inputKeys = ["firstName", "lastName", "contactNumber", "middleInitial", "studentId"];

const CROP_VIEW = 280;
const CROP_OUT = 512;

function dataUrlToFile(dataUrl, name = "avatar.jpg") {
  const [head, b64] = String(dataUrl).split(",");
  const mime = (/data:(.*?);/.exec(head || "") || [])[1] || "image/jpeg";
  const bin = atob(b64 || "");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], name, { type: mime });
}

// Drag-and-drop photo editor: instant preview, drag to reposition, slider
// to zoom, circular live preview, then Save (process + upload) or Cancel.
function PhotoCropModal({ c, src, saving, onCancel, onSave }) {
  const [nat, setNat] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef(null);

  const base = nat ? Math.max(CROP_VIEW / nat.w, CROP_VIEW / nat.h) : 1;
  const dw = nat ? nat.w * base * zoom : 0;
  const dh = nat ? nat.h * base * zoom : 0;

  function clamp(x, y, z = zoom) {
    const w = nat ? nat.w * base * z : 0;
    const h = nat ? nat.h * base * z : 0;
    const mx = Math.max(0, (w - CROP_VIEW) / 2);
    const my = Math.max(0, (h - CROP_VIEW) / 2);
    return { x: Math.min(mx, Math.max(-mx, x)), y: Math.min(my, Math.max(-my, y)) };
  }

  function onPointerDown(e) {
    if (saving || !nat) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y };
  }

  function onPointerMove(e) {
    if (!drag.current) return;
    setPos(clamp(drag.current.ox + (e.clientX - drag.current.sx), drag.current.oy + (e.clientY - drag.current.sy)));
  }

  function endDrag() {
    drag.current = null;
  }

  function onZoom(v) {
    const z = Math.min(3, Math.max(1, Number(v) || 1));
    setZoom(z);
    setPos((p) => clamp(p.x, p.y, z));
  }

  async function handleSave() {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = src;
    });
    const scale = base * zoom;
    const s = CROP_VIEW / scale;
    const sx = (dw / 2 - CROP_VIEW / 2 - pos.x) / scale;
    const sy = (dh / 2 - CROP_VIEW / 2 - pos.y) / scale;
    const canvas = document.createElement("canvas");
    canvas.width = CROP_OUT;
    canvas.height = CROP_OUT;
    canvas.getContext("2d").drawImage(img, sx, sy, s, s, 0, 0, CROP_OUT, CROP_OUT);
    onSave(canvas.toDataURL("image/jpeg", 0.92));
  }

  const k = 64 / CROP_VIEW;
  const backdrop = { position: "fixed", inset: 0, background: "rgba(3,7,18,.62)", display: "grid", placeItems: "center", padding: 20, zIndex: 4100 };
  return (
    <div style={backdrop}>
      <div className="w-[min(94vw,400px)]" style={{ background: c.cardBg, border: `1px solid ${c.border}`, borderRadius: 8, padding: 18, color: c.text }}>
        <h3 style={{ margin: "0 0 4px" }}>Adjust photo</h3>
        <p className="m-0 text-[13px]" style={{ color: c.textMuted }}>Drag to reposition, slide to zoom. The circle is what gets saved.</p>
        <div style={{ display: "grid", placeItems: "center", marginTop: 14 }}>
          <div
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            style={{ position: "relative", width: CROP_VIEW, maxWidth: "100%", aspectRatio: "1", overflow: "hidden", borderRadius: 8, background: c.cardBg2, cursor: saving ? "not-allowed" : "grab", touchAction: "none" }}
          >
            {src && (
              <img
                src={src}
                alt="Crop preview"
                draggable={false}
                onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                style={{ position: "absolute", left: "50%", top: "50%", width: dw || undefined, height: dh || undefined, maxWidth: "none", transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))`, pointerEvents: "none" }}
              />
            )}
            <div style={{ position: "absolute", left: "50%", top: "50%", width: "100%", aspectRatio: "1", transform: "translate(-50%,-50%)", borderRadius: "50%", boxShadow: "0 0 0 999px rgba(3,7,18,.55)", border: "2px solid #fff", pointerEvents: "none" }} />
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", overflow: "hidden", position: "relative", flex: "none", background: c.cardBg2, border: `2px solid ${c.accent}` }}>
            {src && !!dw && (
              <img src={src} alt="" draggable={false} style={{ position: "absolute", left: "50%", top: "50%", width: dw * k, height: dh * k, maxWidth: "none", transform: `translate(calc(-50% + ${pos.x * k}px), calc(-50% + ${pos.y * k}px))`, pointerEvents: "none" }} />
            )}
          </div>
          <div style={{ flex: 1, display: "grid", gap: 4 }}>
            <label style={{ fontSize: 12, fontWeight: 800, color: c.textMuted }}>Zoom</label>
            <input type="range" min={1} max={3} step={0.05} value={zoom} disabled={saving || !nat} onChange={(e) => onZoom(e.target.value)} style={{ width: "100%", accentColor: c.accent }} />
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12, marginTop: 14 }}>
          <CancelButton c={c} onClick={() => { if (!saving) onCancel(); }} />
          <RowButton disabled={saving || !nat} onClick={handleSave}>{saving ? "Uploading…" : "Save photo"}</RowButton>
        </div>
      </div>
    </div>
  );
}

export default function ProfileTab({
  c,
  roleLabel = "Profile",
  showInstitution = true,
  institutionFallback = "Not linked",
  studentMode = false,
  profile = {},
  onStaffSaved,
  onSaveStudentPatch,
  onAvatarUpload,
  onAvatarRemove,
  onLogout,
  onDeleted,
}) {
  const [expanded, setExpanded] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [rowBusy, setRowBusy] = useState({});
  const [rowMsg, setRowMsg] = useState({});
  const [birthOpen, setBirthOpen] = useState(false);
  const [cropSrc, setCropSrc] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const photoInputRef = useRef(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarMsg, setAvatarMsg] = useState("");
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState({ kind: "", text: "" });
  const [pwCurrentOk, setPwCurrentOk] = useState(null);
  const pwVerifyRef = useRef(0);
  const [del, setDel] = useState({ phrase: "", password: "" });
  const [delBusy, setDelBusy] = useState(false);
  const [delMsg, setDelMsg] = useState("");

  function toggle(key) {
    setExpanded((cur) => (cur === key ? null : key));
    setDrafts((cur) => {
      if (cur[key] !== undefined) return cur;
      if (key === "birthDate") return { ...cur, [key]: profile.birthDate || "" };
      if (inputKeys.includes(key)) return { ...cur, [key]: profile[key] ?? "" };
      return cur;
    });
    setRowMsg((cur) => ({ ...cur, [key]: "" }));
  }

  function setDraft(key, value) {
    setDrafts((cur) => ({ ...cur, [key]: value }));
  }

  function cancelRow(key) {
    setExpanded((cur) => (cur === key ? null : cur));
    setDrafts((cur) => {
      const next = { ...cur };
      delete next[key];
      return next;
    });
    setRowMsg((cur) => ({ ...cur, [key]: "" }));
  }

  async function saveStaffRow(key, rawValue) {
    const value = key === "contactNumber" || key === "birthDate"
      ? (String(rawValue || "").trim() ? String(rawValue).trim() : null)
      : String(rawValue || "").trim();
    if ((key === "firstName" || key === "lastName") && !value) {
      setRowMsg((cur) => ({ ...cur, [key]: "This field is required." }));
      return;
    }
    setRowBusy((cur) => ({ ...cur, [key]: true }));
    setRowMsg((cur) => ({ ...cur, [key]: "" }));
    try {
      const { data } = await api.patch("/auth/me", { [key]: value });
      onStaffSaved?.(data);
      setRowMsg((cur) => ({ ...cur, [key]: "Saved." }));
    } catch (e) {
      setRowMsg((cur) => ({ ...cur, [key]: e?.response?.data?.message || "Unable to save." }));
    } finally {
      setRowBusy((cur) => ({ ...cur, [key]: false }));
    }
  }

  async function saveStudentRow(patch) {
    const key = Object.keys(patch)[0];
    setRowBusy((cur) => ({ ...cur, [key]: true }));
    setRowMsg((cur) => ({ ...cur, [key]: "" }));
    try {
      const err = await onSaveStudentPatch(patch);
      setRowMsg((cur) => ({ ...cur, [key]: err || "Saved." }));
    } catch (e) {
      setRowMsg((cur) => ({ ...cur, [key]: e?.message || "Unable to save." }));
    } finally {
      setRowBusy((cur) => ({ ...cur, [key]: false }));
    }
  }

  function staffTextRow(key, label) {
    const value = drafts[key] ?? profile[key] ?? "";
    return (
      <ExpandableRow label={label} summary={profile[key] || "Not set"} expanded={expanded === key} onToggle={() => toggle(key)}>
        <RowInput c={c} value={value} maxLength={key === "contactNumber" ? 40 : 80} onChange={(e) => setDraft(key, e.target.value)} placeholder={label} />
        <RowActions c={c} onCancel={() => cancelRow(key)}>
          <RowButton disabled={!!rowBusy[key]} onClick={() => saveStaffRow(key, value)}>{rowBusy[key] ? "Saving…" : "Save"}</RowButton>
        </RowActions>
        {rowMsg[key] && <RowMsg c={c} kind={rowMsg[key] === "Saved." ? "ok" : "error"} text={rowMsg[key]} />}
      </ExpandableRow>
    );
  }

  function studentTextRow(key, label, required, maxLength = 80) {
    const value = drafts[key] ?? profile[key] ?? "";
    return (
      <ExpandableRow label={label} summary={profile[key] || "Not set"} expanded={expanded === key} onToggle={() => toggle(key)}>
        <RowInput c={c} value={value} maxLength={maxLength} onChange={(e) => setDraft(key, e.target.value)} placeholder={label} />
        <RowActions c={c} onCancel={() => cancelRow(key)}>
          <RowButton disabled={!!rowBusy[key]} onClick={() => {
            const clean = String(value || "").trim();
            if (required && !clean) { setRowMsg((cur) => ({ ...cur, [key]: "This field is required." })); return; }
            saveStudentRow({ [key]: clean });
          }}>{rowBusy[key] ? "Saving…" : "Save"}</RowButton>
        </RowActions>
        {rowMsg[key] && <RowMsg c={c} kind={rowMsg[key] === "Saved." ? "ok" : "error"} text={rowMsg[key]} />}
      </ExpandableRow>
    );
  }

  function birthdayRow(isStudent) {
    const draft = drafts.birthDate ?? profile.birthDate ?? "";
    const display = draft || profile.birthDate;
    return (
      <ExpandableRow label="Birthday" summary={display ? formatBirthDate(display) : "Not set"} expanded={expanded === "birthDate"} onToggle={() => toggle("birthDate")}>
        <button
          type="button"
          onClick={() => setBirthOpen(true)}
          style={{ width: "100%", boxSizing: "border-box", padding: "12px 13px", borderRadius: 8, border: `1px solid ${c.inputBorder || c.border}`, background: c.inputBg || c.cardBg2, color: draft ? c.text : c.textMuted, fontFamily: "inherit", textAlign: "left", cursor: "pointer" }}
        >
          {draft ? formatBirthDate(draft) : "Select birth date"}
        </button>
        <RowActions c={c} onCancel={() => { cancelRow("birthDate"); }}>
          {draft && (
            <RowButton tone="red" disabled={!!rowBusy.birthDate} onClick={() => {
              setDraft("birthDate", "");
              if (isStudent) saveStudentRow({ birthDate: "" });
              else saveStaffRow("birthDate", null);
            }}>Clear</RowButton>
          )}
          <RowButton disabled={!!rowBusy.birthDate} onClick={() => {
            if (isStudent) saveStudentRow({ birthDate: draft || "" });
            else saveStaffRow("birthDate", draft);
          }}>{rowBusy.birthDate ? "Saving…" : "Save"}</RowButton>
        </RowActions>
        {rowMsg.birthDate && <RowMsg c={c} kind={rowMsg.birthDate === "Saved." ? "ok" : "error"} text={rowMsg.birthDate} />}
      </ExpandableRow>
    );
  }

  function handleAvatarFile(file) {
    if (!file) return;
    if (!String(file.type || "").startsWith("image/")) { setAvatarMsg("Please choose an image file."); return; }
    const limit = studentMode ? 2_000_000 : 2_500_000;
    if (file.size > limit) { setAvatarMsg(studentMode ? "Please choose an image smaller than 2 MB." : "Profile image must be 2.5 MB or smaller."); return; }
    setAvatarMsg("");
    const reader = new FileReader();
    reader.onload = () => setCropSrc(String(reader.result || ""));
    reader.readAsDataURL(file);
  }

  async function saveCroppedPhoto(dataUrl) {
    setAvatarBusy(true);
    setAvatarMsg("");
    try {
      if (studentMode) {
        const err = await onAvatarUpload?.(dataUrlToFile(dataUrl));
        if (err) { setAvatarMsg(err); return; }
      } else {
        const { data } = await api.patch("/auth/me", { profileImage: dataUrl });
        onStaffSaved?.(data);
      }
      setCropSrc(null);
    } catch (e) {
      setAvatarMsg(e?.response?.data?.message || "Unable to upload image.");
    } finally {
      setAvatarBusy(false);
    }
  }

  async function removeAvatarStaff() {
    setAvatarBusy(true);
    setAvatarMsg("");
    try {
      const { data } = await api.patch("/auth/me", { profileImage: null });
      onStaffSaved?.(data);
    } catch (e) {
      setAvatarMsg(e?.response?.data?.message || "Unable to remove image.");
    } finally {
      setAvatarBusy(false);
    }
  }

  async function verifyCurrentPassword(value) {
    const clean = String(value || "").trim();
    if (!clean) { setPwCurrentOk(null); return; }
    const stamp = (pwVerifyRef.current += 1);
    try {
      const { data } = await api.post("/auth/verify-password", { password: clean });
      if (pwVerifyRef.current === stamp) setPwCurrentOk(!!data?.ok);
    } catch {
      if (pwVerifyRef.current === stamp) setPwCurrentOk(null);
    }
  }

  async function submitPassword() {
    if (!pw.current || !pw.next || !pw.confirm) { setPwMsg({ kind: "error", text: "Fill in all three password fields." }); return; }
    if (pw.next !== pw.confirm) { setPwMsg({ kind: "error", text: "New passwords do not match." }); return; }
    if (pw.next === pw.current) { setPwMsg({ kind: "error", text: "New password must be different from the current password." }); return; }
    setPwBusy(true);
    setPwMsg({ kind: "", text: "" });
    try {
      const { data } = await api.post("/auth/password", { currentPassword: pw.current, newPassword: pw.next });
      setPw({ current: "", next: "", confirm: "" });
      setPwCurrentOk(null);
      setPwMsg({ kind: "ok", text: data?.message || "Password updated." });
      window.setTimeout(() => setPwMsg({ kind: "", text: "" }), 2000);
    } catch (e) {
      const serverMsg = e?.response?.data?.message || "Unable to update password.";
      setPwMsg({ kind: "error", text: serverMsg === "Validation error" ? "New password must be 8+ characters with uppercase, lowercase, number, and symbol." : serverMsg });
    } finally {
      setPwBusy(false);
    }
  }

  function cancelPassword() {
    setPw({ current: "", next: "", confirm: "" });
    setPwMsg({ kind: "", text: "" });
    setPwCurrentOk(null);
    setExpanded((cur) => (cur === "password" ? null : cur));
  }

  async function submitDelete() {
    if (del.phrase.trim() !== "DELETE") { setDelMsg("Type DELETE to confirm."); return; }
    if (!del.password) { setDelMsg("Enter your password to confirm."); return; }
    setDelBusy(true);
    setDelMsg("");
    try {
      await api.delete("/auth/me", { data: { password: del.password } });
      onDeleted?.();
    } catch (e) {
      setDelMsg(e?.response?.data?.message || "Unable to delete account.");
      setDelBusy(false);
    }
  }

  function cancelDelete() {
    setDel({ phrase: "", password: "" });
    setDelMsg("");
    setExpanded((cur) => (cur === "delete" ? null : cur));
  }

  const displayName = studentMode
    ? `${profile.firstName || ""} ${profile.lastName || ""}`.trim() || "Student"
    : `${profile.firstName || ""} ${profile.lastName || ""}`.trim() || roleLabel;
  const card = { background: c.cardBg, border: `1px solid ${c.border}`, borderRadius: 8, color: c.text };
  const formCard = { ...card, boxShadow: "0 18px 40px rgba(15,23,42,.08)" };

  return (
    <div className="container grid gap-[18px]" style={{ maxWidth: 520, margin: "0 auto", width: "100%" }}>
      <section>
        <h2 style={{ marginBottom: 4, color: c.text }}>Profile Settings</h2>
      </section>

      <section style={{ ...formCard, padding: "22px 18px 14px", display: "grid", placeItems: "center", textAlign: "center" }}>
        {profile.profileImage && (
          <>
            <div style={{ position: "relative" }}>
              <div style={{ width: 96, height: 96, borderRadius: "50%", display: "grid", placeItems: "center", overflow: "hidden", border: `3px solid ${c.accent}`, background: c.cardBg2, color: c.text }}>
                <img src={profile.profileImage} alt="Profile" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
            </div>
            <div style={{ fontWeight: 950, fontSize: 17, marginTop: 10, color: c.text }}>{displayName}</div>
            {!studentMode && profile.email && <div style={{ fontSize: 13, color: c.textMuted }}>{profile.email}</div>}
          </>
        )}
        <div
          onDragOver={(e) => { e.preventDefault(); if (!avatarBusy) setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); if (!avatarBusy) handleAvatarFile(e.dataTransfer?.files?.[0]); }}
          onClick={() => { if (!avatarBusy) photoInputRef.current?.click(); }}
          style={{
            width: "100%", marginTop: profile.profileImage ? 12 : 0, padding: "16px 14px", borderRadius: 8, boxSizing: "border-box",
            minHeight: profile.profileImage ? undefined : 180,
            border: `2px dashed ${dragOver ? c.accent : c.border}`, background: dragOver ? `${c.accent}12` : "transparent",
            color: c.textMuted, fontSize: 13, fontWeight: 700, cursor: avatarBusy ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "border-color .2s, background .2s",
          }}
        >
          <TwIcon name="upload" size={18} />
          <span>{avatarBusy ? "Working…" : "Drag & drop a photo here, or click to browse"}</span>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            hidden
            disabled={avatarBusy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              handleAvatarFile(file);
            }}
          />
        </div>
        {profile.profileImage && (
          <div style={{ display: "flex", marginTop: 8 }}>
            <button type="button" disabled={avatarBusy} onClick={() => (studentMode ? onAvatarRemove?.() : removeAvatarStaff())} style={{ ...smallBtn(c), opacity: avatarBusy ? 0.6 : 1 }}>
              Remove
            </button>
          </div>
        )}
        {avatarMsg && <div style={{ marginTop: 10, width: "100%" }}><RowMsg c={c} kind="error" text={avatarMsg} /></div>}
      </section>

      <section style={{ ...formCard, padding: "6px 0" }}>
        <div style={{ padding: "12px 16px 4px", fontSize: 15, fontWeight: 950, color: c.text }}>Personal Information</div>
        <div style={{ paddingLeft: 14 }}>
        {studentMode ? (
          <>
            {studentTextRow("firstName", "First name", true)}
            {studentTextRow("lastName", "Last name", true)}
            {studentTextRow("middleInitial", "Middle initial", false, 10)}
            {studentTextRow("studentId", "Student ID", true, 80)}
            {birthdayRow(true)}
          </>
        ) : (
          <>
            {staffTextRow("firstName", "First name", true)}
            {staffTextRow("lastName", "Last name", true)}
            {staffTextRow("contactNumber", "Contact number", false)}
            <StaticRow label="Email" value={profile.email} />
            {showInstitution && <StaticRow label="Plan" value={profile.institutionName || institutionFallback} />}
            {birthdayRow(false)}
          </>
        )}
        </div>
      </section>

      <section style={{ ...formCard, padding: "6px 0" }}>
        <div style={{ padding: "12px 16px 4px", fontSize: 15, fontWeight: 950, color: c.text }}>Account Settings</div>
        <div style={{ paddingLeft: 14 }}>
        <ExpandableRow label="Update password" summary="••••••••" expanded={expanded === "password"} onToggle={() => toggle("password")}>
          <PwField c={c} showCheck={pwCurrentOk === true} type="password" value={pw.current} onChange={(e) => { setPw((p) => ({ ...p, current: e.target.value })); setPwCurrentOk(null); }} onBlur={(e) => verifyCurrentPassword(e.target.value)} placeholder="Current password" autoComplete="current-password" />
          <PwField c={c} showCheck={passwordScore(pw.next) === 5} type="password" value={pw.next} onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))} placeholder="New password" autoComplete="new-password" />
          <StrengthMeter c={c} value={pw.next} />
          <PwField c={c} showCheck={!!pw.confirm && pw.confirm === pw.next} type="password" value={pw.confirm} onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))} placeholder="Confirm new password" autoComplete="new-password" />
          <RowActions c={c} onCancel={cancelPassword}>
            <RowButton disabled={pwBusy} onClick={submitPassword}>{pwBusy ? "Updating…" : "Update password"}</RowButton>
          </RowActions>
          {pwMsg.text && <RowMsg c={c} kind={pwMsg.kind === "ok" ? "ok" : "error"} text={pwMsg.text} />}
        </ExpandableRow>
        <ExpandableRow label="Delete account" summary="" danger expanded={expanded === "delete"} onToggle={() => toggle("delete")}>
          <div style={{ fontSize: 13, color: c.textMuted }}>This deactivates your account immediately and signs you out. Type <b style={{ color: c.text }}>DELETE</b> and enter your password to confirm.</div>
          <RowInput c={c} value={del.phrase} onChange={(e) => setDel((d) => ({ ...d, phrase: e.target.value }))} placeholder="Type DELETE" />
          <RowInput c={c} type="password" value={del.password} onChange={(e) => setDel((d) => ({ ...d, password: e.target.value }))} placeholder="Password" autoComplete="current-password" />
          <RowActions c={c} onCancel={cancelDelete}>
            <RowButton tone="red" disabled={delBusy} onClick={submitDelete}>{delBusy ? "Deleting…" : "Delete my account"}</RowButton>
          </RowActions>
          {delMsg && <RowMsg c={c} kind="error" text={delMsg} />}
        </ExpandableRow>
        <div style={{ padding: "4px 0" }}>
          <button type="button" onClick={() => onLogout?.()} style={{ width: "100%", display: "flex", alignItems: "center", padding: "15px 16px", border: "none", background: "transparent", color: "inherit", font: "inherit", fontSize: 14, fontWeight: 800, cursor: "pointer", textAlign: "left" }}>
            Log out
          </button>
        </div>
        </div>
      </section>

      {cropSrc && (
        <PhotoCropModal
          c={c}
          src={cropSrc}
          saving={avatarBusy}
          onCancel={() => { if (!avatarBusy) setCropSrc(null); }}
          onSave={saveCroppedPhoto}
        />
      )}
      {birthOpen && (
        <BirthDateModal
          c={c}
          value={drafts.birthDate ?? profile.birthDate ?? ""}
          onSelect={(v) => { setDraft("birthDate", v); setBirthOpen(false); }}
          onClose={() => setBirthOpen(false)}
        />
      )}
    </div>
  );
}

function smallBtn(c) {
  return { display: "inline-flex", alignItems: "center", padding: "8px 14px", borderRadius: 8, border: `1px solid ${c.border}`, background: c.cardBg2, color: c.text, fontSize: 13, fontWeight: 800, fontFamily: "inherit" };
}
