import { useEffect, useState } from "react";
import { templateTone } from "../../../../lib/templatePalette";
import { TwIcon } from "../../../../components/TwUI";
import { TeacherPressButton } from "../../TeacherUI";
import ThinkBotTutorial from "../../../../components/ThinkBotTutorial";
import { tabCard as card, tabBtn as btn, tabInputStyle as inputStyle, normalizeBankTemplate as normalizeLiveTemplate, solidModalBg, useIsMobileViewport } from "../teacherTabShared";
import { BackgroundPicker } from "./HostBackgroundPicker";
import { ClassPicker } from "./ClassPicker";

// Extracted verbatim from LiveSessionsTab.jsx (no behavior change).
// normalizeLiveTemplate is now the shared normalizeBankTemplate (identical mapping).
// modalBackdrop + schedule/calendar helpers stay local (Live-specific styling).
export function AssignModal({ quiz, folders, c, dark, onClose, onSubmit, tutorialStage, onTutorialStage, onTutorialFinish }) {
  const [form, setForm] = useState({ classId: null, availableFrom: "", availableUntil: "", backgroundKey: null });
  const isMobile = useIsMobileViewport();
  const [editing, setEditing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const complete = !!form.classId && !!form.availableFrom && !!form.availableUntil;
  const selected = folders.find((folder) => Number(folder.id) === Number(form.classId));
  const tone = templateTone(normalizeLiveTemplate(quiz.template_type), c, dark);
  function submit(event) { event.preventDefault(); if (complete) { if (tutorialStage === "assign_create") onTutorialFinish?.(); onSubmit(quiz, form); } }
  useEffect(() => {
    document.body.classList.add("tw-mobile-modal-open");
    return () => document.body.classList.remove("tw-mobile-modal-open");
  }, []);
  return <div style={modalBackdrop} onClick={onClose}><form onSubmit={submit} onClick={(event) => event.stopPropagation()} className="tw-assignment-setup-modal" style={{ ...card(c, { width: "min(95vw, 700px)", padding: 0, overflow: "hidden", background: solidModalBg(c) }) }}>
    {isMobile && <div className="tw-host-launch-toprow"><button type="button" aria-label="Close" onClick={onClose}><TwIcon name="close" size={20} /></button></div>}
    <div className="px-[28px] py-[22px] flex justify-between items-center" style={{ borderBottom: `1px solid ${c.border}` }}><div><h2 className="m-0" style={{ color: c.text }}>Set up assignment</h2>{!isMobile && <p className="mb-0" style={{ color: c.textMuted }}>Set the schedule, choose the class, then pick the gameplay background.</p>}</div>{!isMobile && <button type="button" onClick={onClose} style={{ ...btn(c), width: 42, height: 42, display: "grid", placeItems: "center", padding: 0 }}><TwIcon name="close" size={20} /></button>}</div>
    <div className="p-[28px] grid gap-[14px]">
      <div data-tutorial="assign-schedule" role="button" tabIndex={0} onClick={() => setEditing(true)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setEditing(true); } }} style={{ ...card(c, { boxShadow: "none", padding: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, background: c.cardBg2 }), cursor: "pointer" }}>
        <div className="flex gap-[14px] items-center"><TwIcon name="calendar" size={28} /><div><div className="text-[13px] font-[800]" style={{ color: c.textMuted }}>Schedule</div><div className="font-[900] tw-assign-schedule-value" style={{ color: c.text }}>{form.availableFrom && form.availableUntil ? `${formatSchedule(form.availableFrom)} → ${formatSchedule(form.availableUntil)}` : "Set start and end date/time"}</div></div></div>
        <button type="button" onClick={(event) => { event.stopPropagation(); setEditing(true); }} style={btn(c)}>Edit</button>
      </div>
      <div className="text-[13px]" style={{ color: c.textMuted }}>Students will only be able to answer within the selected schedule.</div>
      <button data-tutorial="assign-class" type="button" className="tw-host-class-field" onClick={() => setPickerOpen(true)} style={{ background: c.inputBg, borderColor: c.inputBorder, color: selected ? c.text : c.textMuted, "--tw-template-accent": tone.accent, "--tw-template-soft": tone.softBg }}><TwIcon name="classes" size={20} /><span>{selected?.pathLabel || "Choose a class"}</span><TwIcon name="chevronDown" size={18} /></button>
      <div className="tw-assignment-primary-actions flex justify-end items-center gap-[14px] mt-[4px]"><button type="button" onClick={onClose} className="tw-teacher-text-cancel">Cancel</button><TeacherPressButton data-tutorial="assign-create" type="submit" tone="blue" disabled={!complete}>Create Assignment</TeacherPressButton></div>
      <BackgroundPicker selectedKey={form.backgroundKey} onSelect={(backgroundKey) => { setForm((current) => ({ ...current, backgroundKey })); if (tutorialStage === "assign_background") onTutorialStage?.("assign_create"); }} c={c} category={quiz.category} />
    </div>
    {tutorialStage === "assign_schedule" && !editing && <ThinkBotTutorial target='[data-tutorial="assign-schedule"]' placement="left" square><p>Assignments are completed by students on their own time. Start by deciding when students can access this activity.</p></ThinkBotTutorial>}
    {tutorialStage === "assign_class" && !pickerOpen && <ThinkBotTutorial target='[data-tutorial="assign-class"]' placement="left" square highlightMode="target"><p>Now choose which class should receive the assignment.</p></ThinkBotTutorial>}
    {tutorialStage === "assign_background" && <ThinkBotTutorial target='[data-tutorial="session-backgrounds"]' placement={isMobile ? "above" : "left"} square><p>Browse through the available gameplay backgrounds and pick the one you want your students to see.</p></ThinkBotTutorial>}
    {tutorialStage === "assign_create" && <ThinkBotTutorial target='[data-tutorial="assign-create"]' placement="above" square highlightMode="target"><p>Ready? Create the assignment and ThinkWAVE will take care of the rest.</p></ThinkBotTutorial>}
    {editing && <ScheduleEditor c={c} form={form} setForm={setForm} onClose={() => setEditing(false)} onApply={() => tutorialStage === "assign_schedule" && onTutorialStage?.("assign_class")} />}
    {pickerOpen && <ClassPicker c={c} dark={dark} folders={folders} selectedId={form.classId} onClose={() => setPickerOpen(false)} onSelect={(id) => { setForm((current) => ({ ...current, classId: id })); setPickerOpen(false); if (tutorialStage === "assign_class") onTutorialStage?.("assign_background"); }} />}
  </form></div>;
}

function ScheduleEditor({ c, form, setForm, onClose, onApply }) {
  const startDefault = parseScheduleDate(form.availableFrom, new Date());
  const endDefault = parseScheduleDate(form.availableUntil, addDaysAtNoon(startDefault, 3));
  const [draft, setDraft] = useState({ availableFrom: toLocalDateTimeValue(startDefault), availableUntil: toLocalDateTimeValue(endDefault) });
  const [activeField, setActiveField] = useState("availableFrom");
  const [viewDate, setViewDate] = useState(() => new Date(startDefault.getFullYear(), startDefault.getMonth(), 1));
  const activeDate = parseScheduleDate(draft[activeField], activeField === "availableFrom" ? startDefault : endDefault);
  const days = buildCalendarDays(viewDate);
  const timeOptions = buildTimeOptions();

  useEffect(() => { const date = parseScheduleDate(draft[activeField], activeDate); setViewDate(new Date(date.getFullYear(), date.getMonth(), 1)); }, [activeField]);

  function setDatePart(day) { const next = new Date(activeDate); next.setFullYear(viewDate.getFullYear(), viewDate.getMonth(), day); setDraft((current) => ({ ...current, [activeField]: toLocalDateTimeValue(next) })); }
  function setTimePart(value) { const [hour, minute] = value.split(":").map(Number); const next = new Date(activeDate); next.setHours(hour, minute, 0, 0); setDraft((current) => ({ ...current, [activeField]: toLocalDateTimeValue(next) })); }
  function apply() { const from = parseScheduleDate(draft.availableFrom, startDefault); let until = parseScheduleDate(draft.availableUntil, endDefault); if (until <= from) until = new Date(from.getTime() + 3600000); setForm((current) => ({ ...current, availableFrom: toLocalDateTimeValue(from), availableUntil: toLocalDateTimeValue(until) })); onClose(); onApply?.(); }

  const selectedTime = minutesToTimeValue(activeDate.getHours() * 60 + activeDate.getMinutes());
  return <div className="tw-schedule-overlay" style={calendarOverlay(c)} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} onContextMenu={(event) => event.stopPropagation()}>
    <div role="dialog" aria-modal="true" className="tw-schedule-dialog w-[min(94vw,440px)] rounded-[12px] overflow-hidden" style={{ background: solidModalBg(c), color: c.text, boxShadow: "0 24px 60px rgba(0,0,0,.28)" }}>
      <div className="px-[20px] pt-[22px] pb-[12px]">
        <div className="flex justify-between items-center gap-[12px] mb-[14px]"><div className="font-[900] text-[22px]">{viewDate.toLocaleString([], { month: "long", year: "numeric" })}</div><div className="flex gap-[8px]"><button type="button" onClick={() => setViewDate((date) => new Date(date.getFullYear(), date.getMonth() - 1, 1))} style={calendarNavBtn(c)}>‹</button><button type="button" onClick={() => setViewDate((date) => new Date(date.getFullYear(), date.getMonth() + 1, 1))} style={calendarNavBtn(c)}>›</button></div></div>
        <div className="grid grid-cols-[1fr_1fr] gap-[8px] mb-[12px]"><button type="button" onClick={() => setActiveField("availableFrom")} style={segmentBtn(c, activeField === "availableFrom")}>Start<br/><small>{formatSchedule(draft.availableFrom)}</small></button><button type="button" onClick={() => setActiveField("availableUntil")} style={segmentBtn(c, activeField === "availableUntil")}>End<br/><small>{formatSchedule(draft.availableUntil)}</small></button></div>
        <div className="grid grid-cols-[repeat(7,1fr)] text-center font-[800] gap-y-[10px] mb-[8px]" style={{ color: c.textMuted }}>{["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => <div key={day}>{day}</div>)}</div>
        <div className="tw-schedule-days grid grid-cols-[repeat(7,1fr)] gap-[8px] text-center">{days.map((day, index) => { const selected = day && sameCalendarDay(activeDate, viewDate, day); return <button key={`${day || "blank"}-${index}`} type="button" disabled={!day} onClick={() => setDatePart(day)} style={calendarDayBtn(c, selected, !day)}>{day || ""}</button>; })}</div>
      </div>
      <div className="px-[20px] pt-[18px] pb-[16px]" style={{ borderTop: `1px solid ${c.border}` }}><div className="font-[900] text-[17px] mb-[8px]">Time</div><select value={selectedTime} onChange={(event) => setTimePart(event.target.value)} className="h-[46px] font-[700]" style={{ ...inputStyle(c) }}>{timeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
      <div className="px-[20px] pt-0 pb-[22px] flex justify-end items-center gap-[14px]"><button type="button" onClick={onClose} className="tw-teacher-text-cancel">Cancel</button><TeacherPressButton type="button" tone="blue" onClick={apply}>Set</TeacherPressButton></div>
    </div>
  </div>;
}

function parseScheduleDate(value, fallback) { const date = value ? new Date(value) : new Date(fallback); return Number.isNaN(date.getTime()) ? new Date(fallback) : date; }
function addDaysAtNoon(base, days) { const date = new Date(base); date.setDate(date.getDate() + days); date.setHours(12, 0, 0, 0); return date; }
function toLocalDateTimeValue(date) { const value = new Date(date); const pad = (number) => String(number).padStart(2, "0"); return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`; }
function buildCalendarDays(viewDate) { const firstDay = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1).getDay(); const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate(); return [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, index) => index + 1)]; }
function sameCalendarDay(date, viewDate, day) { return date.getFullYear() === viewDate.getFullYear() && date.getMonth() === viewDate.getMonth() && date.getDate() === day; }
function buildTimeOptions() { const rows = []; for (let hour = 0; hour < 24; hour += 1) for (const minute of [0, 30]) rows.push({ value: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`, label: new Date(2026, 0, 1, hour, minute).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) }); return rows; }
function minutesToTimeValue(minutes) { const rounded = Math.round(minutes / 30) * 30; const hour = Math.floor((rounded % 1440) / 60); const minute = rounded % 60; return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`; }
function calendarNavBtn(c) { return { width: 42, height: 42, borderRadius: 8, border: "none", background: c.cardBg2, color: c.text, fontSize: 28, fontWeight: 900, lineHeight: 1, cursor: "pointer" }; }
function calendarDayBtn(c, selected, blank) { return { height: 42, borderRadius: 6, border: "none", background: selected ? c.accent : "transparent", color: blank ? "transparent" : selected ? "#fff" : c.text, fontSize: 17, fontWeight: selected ? 900 : 600, cursor: blank ? "default" : "pointer", opacity: blank ? 0 : 1 }; }
function segmentBtn(c, active) { return { border: `1px solid ${active ? c.accent : c.border}`, background: active ? `${c.accent}18` : c.cardBg2, color: active ? c.accent : c.text, borderRadius: 12, padding: "10px 12px", textAlign: "left", fontWeight: 900, cursor: "pointer", lineHeight: 1.35 }; }
function calendarOverlay() { return { position: "fixed", inset: 0, zIndex: 9500, display: "grid", placeItems: "center", background: "rgba(15,23,42,.38)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)", padding: 20 }; }
function formatSchedule(value) { if (!value) return "Not set"; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }); }
const modalBackdrop = { position: "fixed", inset: 0, background: "rgba(15,23,42,.46)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", display: "grid", placeItems: "center", padding: 20, zIndex: 9000, isolation: "isolate" };
