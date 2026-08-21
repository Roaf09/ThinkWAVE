import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { useColors, useTheme } from "../../context/ThemeContext";
import { IconBubble } from "../../components/TwUI";
import { normalizeTemplateType } from "../../lib/templateTypes";
import { templateTone } from "../../lib/templatePalette";
import { TeacherPressButton } from "../teacher/TeacherUI";

const TEMPLATES = [
  { value: "MCQ", label: "Multiple Choice", icon: "mcq" },
  { value: "TRUE_FALSE", label: "True / False", icon: "truefalse" },
  { value: "TYPE_ANSWER", label: "Identification", icon: "identification" },
  { value: "MATCHING", label: "Matching", icon: "matching" },
  { value: "GUESS_WORD_4PICS", label: "Guess Word", icon: "image" },
  { value: "THINK_SPELL", label: "Crossword", icon: "spell" },
];

export default function GuestCreateTab() {
  const navigate = useNavigate();
  const c = useColors();
  const { dark } = useTheme();
  const [form, setForm] = useState({ title: "", templateType: "" });
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setMsg("");
    if (!form.title.trim()) return setMsg("Enter a quiz title.");
    if (!form.templateType) return setMsg("Select a quiz template.");
    setSaving(true);
    try {
      const { data } = await api.post("/quizzes", {
        title: form.title.trim(),
        category: "K12",
        templateType: form.templateType,
        classId: null,
        timeLimitSec: 30,
        pointsPerQuestion: 1,
        randomizeQuestions: false,
        shuffleAnswers: false,
        deliveryMode: "SYNCHRONOUS",
        availableFrom: null,
        availableUntil: null,
      });
      navigate(`/guest/quizzes/${data.id}/builder`);
    } catch (error) {
      setMsg(error?.response?.data?.message || "Failed to create quiz.");
    } finally { setSaving(false); }
  }

  return <div className="container" style={{ display: "grid", gap: 20 }}>
    <section><h2 style={{ marginBottom: 4, color: c.text }}>Create</h2></section>
    <section style={card(c)}>
      <form onSubmit={submit} style={{ display: "grid", gap: 22 }}>
        <div>
          <label style={label(c)}>Quiz Title</label>
          <input required value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Enter a quiz title" style={input(c)} />
        </div>
        <div>
          <label style={label(c)}>Quiz Template</label>
          <div className="tw-teacher-template-grid">
            {TEMPLATES.map((template) => {
              const active = form.templateType === template.value;
              const tone = templateTone(template.value, c, active);
              const ink = templateInk(template.value, dark);
              return <button key={template.value} type="button" className={`tw-teacher-template-press${active ? " is-active" : ""}`} onClick={() => setForm((current) => ({ ...current, templateType: template.value }))} style={{ "--template-face": tone.softBg, "--template-base": tone.border, "--template-border": tone.accent, "--template-ink": ink, color: ink }}>
                <span><IconBubble name={template.icon} c={c} size={44} iconSize={22} style={{ background: tone.iconBg, borderColor: tone.iconBorder, color: ink }} /><b style={{ color: ink }}>{template.label}</b></span>
              </button>;
            })}
          </div>
        </div>
        {msg && <div style={{ padding: "12px 14px", borderRadius: 14, background: c.redBg, border: `1px solid ${c.redBorder}`, color: c.redFg, fontSize: 13 }}>{msg}</div>}
        <TeacherPressButton type="submit" tone="blue" disabled={saving} className="tw-teacher-create-submit">{saving ? "Creating…" : "Create & Open Builder"}</TeacherPressButton>
      </form>
    </section>
  </div>;
}

function templateInk(value, dark) {
  const palette = {
    MCQ: dark ? "#dbeafe" : "#173f9b",
    TRUE_FALSE: dark ? "#ccfbf1" : "#075e57",
    TYPE_ANSWER: dark ? "#ede9fe" : "#5b21b6",
    MATCHING: dark ? "#ffedd5" : "#9a4d00",
    GUESS_WORD_4PICS: dark ? "#dcfce7" : "#166534",
    THINK_SPELL: dark ? "#bae6fd" : "#0369a1",
  };
  return palette[normalizeTemplateType(value)] || (dark ? "#f8fafc" : "#0f172a");
}
function card(c) { return { width: "100%", boxSizing: "border-box", background: c.cardBg, border: `1px solid ${c.border}`, borderRadius: 20, padding: 26, boxShadow: c.pageBg === "#eef2ff" ? "0 18px 40px rgba(43,108,255,.09)" : "0 18px 40px rgba(0,0,0,.18)" }; }
function label(c) { return { display: "block", marginBottom: 7, fontSize: 13, color: c.textMuted, fontWeight: 800 }; }
function input(c) { return { width: "100%", boxSizing: "border-box", padding: "13px 15px", borderRadius: 14, border: `1px solid ${c.inputBorder}`, background: c.inputBg, color: c.text, fontSize: 14, fontFamily: "inherit" }; }
