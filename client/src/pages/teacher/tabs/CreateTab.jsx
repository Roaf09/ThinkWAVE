/* FILE GUIDE:
 * client/src/pages/teacher/tabs/CreateTab.jsx
 * Purpose: Teacher entry point for starting a new quiz.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../../lib/api";
import { useColors, useTheme } from "../../../context/ThemeContext";
import { IconBubble, TwIcon } from "../../../components/TwUI";
import { normalizeTemplateType } from "../../../lib/templateTypes";
import { templateTone, templateCardChrome } from "../../../lib/templatePalette";
import { TeacherPressButton } from "../TeacherUI";

const ALL_TEMPLATES = [
  { value: "MCQ", label: "Multiple Choice", icon: "mcq", tone: "blue" },
  { value: "TRUE_FALSE", label: "True / False", icon: "truefalse", tone: "teal" },
  { value: "TYPE_ANSWER", label: "Identification", icon: "identification", tone: "purple" },
  { value: "MATCHING", label: "Matching", icon: "matching", tone: "orange" },
  { value: "GUESS_WORD_4PICS", label: "Guess Word", icon: "image", tone: "green" },
  { value: "THINK_SPELL", label: "Think and Spell", icon: "spell", tone: "purple" },
];


const card = (c, extra = {}) => ({
  background: c.cardBg,
  border: `1px solid ${c.border}`,
  borderRadius: 20,
  padding: 26,
  boxShadow: c.pageBg === "#eef2ff" ? "0 18px 40px rgba(43,108,255,0.09)" : "0 18px 40px rgba(0,0,0,0.18)",
  ...extra,
});

export default function CreateTab({ setActiveTab, guestMode = false }) {
  const navigate = useNavigate();
  const c = useColors();
  const { dark } = useTheme();
  const [recentQuizzes, setRecentQuizzes] = useState([]);
  const [form, setForm] = useState({ title: "", category: "K12", templateType: "MCQ", classId: null });
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const { data } = await api.get("/quizzes");
        if (!ignore) setRecentQuizzes((data || []).slice(0, 3));
      } catch {
        if (!ignore) setRecentQuizzes([]);
      }
    })();
    return () => { ignore = true; };
  }, []);

  const recentTemplates = useMemo(() => {
    const byType = new Map();
    for (const quiz of recentQuizzes) if (!byType.has(quiz.template_type)) byType.set(quiz.template_type, quiz);
    return Array.from(byType.values()).slice(0, 3);
  }, [recentQuizzes]);

  function patch(next) { setForm((prev) => ({ ...prev, ...next })); }

  async function handleSubmit(event) {
    event.preventDefault();
    setMsg("");
    setSaving(true);
    try {
      const { data } = await api.post("/quizzes", {
        ...form,
        timeLimitSec: 30,
        pointsPerQuestion: 1,
        randomizeQuestions: false,
        shuffleAnswers: false,
        deliveryMode: "SYNCHRONOUS",
        availableFrom: null,
        availableUntil: null,
      });
      navigate(guestMode ? `/guest/quizzes/${data.id}/builder` : `/teacher/quizzes/${data.id}/builder`);
    } catch (err) {
      setMsg(err?.response?.data?.message || "Failed to create quiz.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="container" style={{ display: "grid", gap: 20 }}>
    <section><h2 style={{ marginBottom: 4, color: c.text }}>Create</h2></section>

    <section style={card(c, { width: "100%", boxSizing: "border-box" })}>
      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 22 }}>
        <div>
          <label style={labelStyle(c)}>Quiz Title</label>
          <input value={form.title} onChange={(e) => patch({ title: e.target.value })} placeholder="e.g. Quiz 1 – Biology Chapter 3" required style={inputStyle(c)} />
        </div>

        <div>
          <label style={labelStyle(c)}>Category</label>
          <div style={{ display: "flex", gap: 10, maxWidth: 560 }}>
            {["K12", "COLLEGE"].map((cat) => <button key={cat} type="button" onClick={() => patch({ category: cat })} style={segmentBtn(c, form.category === cat)}><TwIcon name={cat === "K12" ? "classes" : "student"} size={16} /> {cat === "K12" ? "K-12" : "College"}</button>)}
          </div>
        </div>

        <div>
          <label style={labelStyle(c)}>Question Template</label>
          <div className="tw-teacher-template-grid">
            {ALL_TEMPLATES.map((template) => {
              const active = form.templateType === template.value;
              const tone = templateTone(template.value, c, active);
              const ink = templateInk(template.value, dark);
              return <button key={template.value} type="button" className={`tw-teacher-template-press${active ? " is-active" : ""}`} onClick={() => patch({ templateType: template.value })} style={{ "--template-face": tone.softBg, "--template-base": tone.border, "--template-border": tone.accent, "--template-ink": ink, color: ink }}>
                <span><IconBubble name={template.icon} c={c} size={44} iconSize={22} style={{ background: tone.iconBg, borderColor: tone.iconBorder, color: ink }} /><b style={{ color: ink }}>{template.label}</b></span>
              </button>;
            })}
          </div>
        </div>

        {msg && <div style={{ padding: "12px 14px", borderRadius: 14, background: c.redBg, border: `1px solid ${c.redBorder}`, color: c.redFg, fontSize: 13 }}>{msg}</div>}
        <TeacherPressButton type="submit" tone="blue" disabled={saving} className="tw-teacher-create-submit">{saving ? "Creating…" : "Create & Open Builder"}</TeacherPressButton>
      </form>
    </section>

    <section style={{ display: "grid", gap: 12 }}>
      <div><div style={{ fontWeight: 900, fontSize: 17, color: c.text }}>Recent template shortcuts</div><div style={{ color: c.textMuted, fontSize: 13, marginTop: 6 }}>Reuse a recent structure to start faster.</div></div>
      <div className="tw-teacher-shortcut-grid">
        {recentTemplates.length === 0 ? <div style={card(c, { color: c.textMuted })}>Recent templates will appear here after you create a few quizzes.</div> : recentTemplates.map((quiz) => {
          const tone = templateTone(quiz.template_type, c, false);
          return <button key={quiz.id} type="button" className="tw-teacher-shortcut-card" onClick={() => navigate(guestMode ? `/guest/quizzes/${quiz.id}/builder` : `/teacher/quizzes/${quiz.id}/builder`)} style={{ ...templateCardChrome(quiz.template_type, c, false), color: c.text, borderWidth: 4, borderRadius: 18 }}>
            <IconBubble name={templateIcon(quiz.template_type)} c={c} size={40} iconSize={20} style={{ background: tone.iconBg, borderColor: tone.iconBorder, color: tone.accent }} />
            <b style={{ color: tone.accent }}>{templateLabel(quiz.template_type)}</b><small style={{ color: c.textMuted }}>{quiz.title}</small>
          </button>;
        })}
      </div>
    </section>
  </div>;
}

function templateInk(value, dark) {
  const normalized = normalizeTemplateType(value);
  const palette = {
    MCQ: dark ? "#dbeafe" : "#173f9b",
    TRUE_FALSE: dark ? "#ccfbf1" : "#075e57",
    TYPE_ANSWER: dark ? "#ede9fe" : "#5b21b6",
    MATCHING: dark ? "#ffedd5" : "#9a4d00",
    GUESS_WORD_4PICS: dark ? "#dcfce7" : "#166534",
    THINK_SPELL: dark ? "#bae6fd" : "#0369a1",
  };
  return palette[normalized] || (dark ? "#f8fafc" : "#0f172a");
}

function templateLabel(value) { const normalized = normalizeTemplateType(value); return ALL_TEMPLATES.find((item) => item.value === normalized)?.label || value; }
function templateIcon(value) { const normalized = normalizeTemplateType(value); return ALL_TEMPLATES.find((item) => item.value === normalized)?.icon || "spark"; }
function labelStyle(c) { return { display: "block", marginBottom: 7, fontSize: 13, color: c.textMuted, fontWeight: 800 }; }
function inputStyle(c) { return { width: "100%", boxSizing: "border-box", padding: "13px 14px", borderRadius: 14, border: `1px solid ${c.inputBorder}`, background: c.inputBg, color: c.text, fontSize: 14 }; }
function segmentBtn(c, active) { return { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px 14px", borderRadius: 14, border: `2px solid ${active ? c.accent : c.border}`, background: active ? `${c.accent}18` : c.cardBg2, color: active ? c.accent : c.textMuted, fontWeight: 850, cursor: "pointer" }; }
