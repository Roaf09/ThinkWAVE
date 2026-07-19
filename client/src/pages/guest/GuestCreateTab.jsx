import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { useColors } from "../../context/ThemeContext";
import { IconBubble } from "../../components/TwUI";
import { templateCardChrome, templateTone } from "../../lib/templatePalette";

const TEMPLATES = [
  { value: "MCQ", label: "Multiple Choice", icon: "mcq" },
  { value: "TRUE_FALSE", label: "True / False", icon: "truefalse" },
  { value: "TYPE_ANSWER", label: "Identification", icon: "identification" },
  { value: "MATCHING", label: "Matching", icon: "matching" },
  { value: "GUESS_WORD_4PICS", label: "Guess Word", icon: "image" },
  { value: "THINK_SPELL", label: "Think and Spell", icon: "spell" },
];

export default function GuestCreateTab() {
  const navigate = useNavigate();
  const c = useColors();
  const [form, setForm] = useState({ title: "", templateType: "MCQ" });
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setMsg("");
    setSaving(true);
    try {
      const { data } = await api.post("/quizzes", {
        title: form.title,
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

  return <div className="container" style={{ display: "grid", gap: 18 }}>
    <section><h2 style={{ marginBottom: 4, color: c.text }}>Create</h2></section>
    <section style={card(c, { maxWidth: 760 })}>
      <form onSubmit={submit} style={{ display: "grid", gap: 20 }}>
        <div><label style={label(c)}>Quiz Title</label><input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Enter a quiz title" style={input(c)} /></div>
        <div><label style={label(c)}>Question Template</label><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10 }}>
          {TEMPLATES.map((template) => {
            const active = form.templateType === template.value;
            const tone = templateTone(template.value, c, active);
            return <button key={template.value} type="button" className={`tw-template-card${active ? " is-active" : ""}`} onClick={() => setForm({ ...form, templateType: template.value })} style={{ ...templateCardChrome(template.value, c, active), color: c.text }}>
              <IconBubble name={template.icon} c={c} size={42} iconSize={21} style={{ background: tone.iconBg, borderColor: tone.iconBorder, color: tone.accent }} />
              <div style={{ fontSize: 14, fontWeight: 900, color: active ? tone.accent : c.text }}>{template.label}</div>
            </button>;
          })}
        </div></div>
        {msg && <div style={{ padding: "12px 14px", borderRadius: 14, background: c.redBg, border: `1px solid ${c.redBorder}`, color: c.redFg, fontSize: 13 }}>{msg}</div>}
        <button disabled={saving} style={{ padding: "15px 16px", borderRadius: 16, border: "none", background: c.accent, color: "#fff", fontWeight: 900, cursor: "pointer" }}>{saving ? "Creating…" : "Create & Open Builder →"}</button>
      </form>
    </section>
  </div>;
}
function card(c, extra={}) { return { background: c.cardBg, border: `1px solid ${c.border}`, borderRadius: 20, padding: 24, boxShadow: c.pageBg === "#eef2ff" ? "0 18px 40px rgba(43,108,255,.09)" : "0 18px 40px rgba(0,0,0,.18)", ...extra }; }
function label(c) { return { display: "block", marginBottom: 7, fontSize: 13, color: c.textMuted, fontWeight: 800 }; }
function input(c) { return { width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 14, border: `1px solid ${c.inputBorder}`, background: c.inputBg, color: c.text, fontSize: 14 }; }
