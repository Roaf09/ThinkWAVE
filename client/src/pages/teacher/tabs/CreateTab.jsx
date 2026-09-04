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
import ThinkBotTutorial from "../../../components/ThinkBotTutorial";

const ALL_TEMPLATES = [
  { value: "MCQ", label: "Multiple Choice", icon: "mcq", tone: "blue" },
  { value: "TRUE_FALSE", label: "True / False", icon: "truefalse", tone: "teal" },
  { value: "TYPE_ANSWER", label: "Identification", icon: "identification", tone: "purple" },
  { value: "MATCHING", label: "Matching", icon: "matching", tone: "orange" },
  { value: "GUESS_WORD_4PICS", label: "Guess Word", icon: "image", tone: "green" },
  { value: "THINK_SPELL", label: "Crossword", icon: "spell", tone: "purple" },
];

const card = (c, extra = {}) => ({
  background: c.cardBg,
  border: `1px solid ${c.border}`,
  borderRadius: 20,
  padding: 26,
  boxShadow: c.pageBg === "#eef2ff" ? "0 18px 40px rgba(43,108,255,0.09)" : "0 18px 40px rgba(0,0,0,0.18)",
  ...extra,
});

export default function CreateTab({ setActiveTab, guestMode = false, tutorial }) {
  const navigate = useNavigate();
  const c = useColors();
  const { dark } = useTheme();
  const [recentQuizzes, setRecentQuizzes] = useState([]);
  const [form, setForm] = useState({ title: "", category: "", templateType: "", classId: null });
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (tutorial?.stage !== "create_intro_delay") return undefined;
    const timer = window.setTimeout(() => tutorial?.setStage?.("create_intro"), 2000);
    return () => window.clearTimeout(timer);
  }, [tutorial?.stage]);

  const tutorialTitleHasText = !!form.title.trim();

  useEffect(() => {
    if (tutorial?.stage !== "create_title" || !tutorialTitleHasText) return undefined;
    // Start this timer when the teacher first begins typing. Continuing to edit the
    // title does not restart it; the teacher chooses when to proceed with Done.
    const timer = window.setTimeout(() => tutorial?.setStage?.("create_title_done"), 3000);
    return () => window.clearTimeout(timer);
  }, [tutorial?.stage, tutorialTitleHasText]);

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
    if (!form.title.trim()) return setMsg("Add a quiz title first.");
    if (!form.category) return setMsg("Select K-12 or College.");
    if (!form.templateType) return setMsg("Select a quiz template.");
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
      if (!guestMode && tutorial?.stage === "create_open_builder") tutorial.setStage?.("builder_pending", { tutorialTemplateType: form.templateType });
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
          <input data-tutorial="create-title" value={form.title} onChange={(e) => patch({ title: e.target.value })} placeholder="e.g. Quiz 1 – Biology Chapter 3" required style={{ ...inputStyle(c), fontWeight: 850, letterSpacing: ".04em" }} />
        </div>

        <div data-tutorial="create-category" className="tw-create-category-tutorial-target" style={{ borderRadius: 16, display: "inline-grid", width: "min(100%, 560px)" }}>
          <label style={labelStyle(c)}>Category</label>
          <div style={{ display: "flex", gap: 10, maxWidth: 560 }}>
            {["K12", "COLLEGE"].map((cat) => <button key={cat} type="button" onClick={() => { patch({ category: cat }); if (tutorial?.stage === "create_choose_category") tutorial.setStage?.("create_choose_template"); }} style={segmentBtn(c, form.category === cat)}><TwIcon name={cat === "K12" ? "classes" : "student"} size={16} /> {cat === "K12" ? "K-12" : "College"}</button>)}
          </div>
        </div>

        {msg && <div style={{ padding: "12px 14px", borderRadius: 14, background: c.redBg, border: `1px solid ${c.redBorder}`, color: c.redFg, fontSize: 13 }}>{msg}</div>}
        <TeacherPressButton type="submit" tone="blue" disabled={saving} data-tutorial="create-open-builder" className="tw-teacher-create-submit">{saving ? "Creating…" : "Create & Open Builder"}</TeacherPressButton>
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

    {!guestMode && tutorial?.stage === "create_intro_delay" && <ThinkBotTutorial />}
    {!guestMode && tutorial?.stage === "create_intro" && <ThinkBotTutorial placement="center" dialogWidth={430} dragKey="create-intro-dialog" clickAnywhere onClickAnywhere={() => tutorial?.setStage?.("create_intro_details")}><p>Now that your class is ready, let’s create something for them to play.</p></ThinkBotTutorial>}
    {!guestMode && tutorial?.stage === "create_intro_details" && <ThinkBotTutorial placement="center" dialogWidth={430} dragKey="create-intro-dialog" actionLabel="Okay!" actionDelay={2000} onAction={() => tutorial?.setStage?.("create_title")}><p>Templates control how your activity looks and how students interact with it.</p></ThinkBotTutorial>}
    {!guestMode && ["create_title", "create_title_done"].includes(tutorial?.stage) && <ThinkBotTutorial target='[data-tutorial="create-title"]' placement="right" dialogWidth={300} dragKey="create-title-dialog" highlightMode="target" allowTargetInteraction={true} className="tw-tutorial-done-avatar-clear" reserveActionSpace actionLabel={tutorial?.stage === "create_title_done" ? "Done" : undefined} onAction={() => tutorial?.setStage?.("create_choose_category")}><p>First, add a quiz title.</p></ThinkBotTutorial>}
    {!guestMode && tutorial?.stage === "create_choose_category" && <ThinkBotTutorial target='[data-tutorial="create-category"]' placement="right" dialogWidth={360} highlightMode="spotlight" highlightPadding={14} className="tw-tutorial-create-focus"><p>Second, select the category of the class you are handling.</p></ThinkBotTutorial>}
    {!guestMode && tutorial?.stage === "create_choose_template" && <ThinkBotTutorial target='[data-tutorial="create-template-section"]' placement="above" dialogWidth={440} highlightMode="spotlight" highlightPadding={14} className="tw-tutorial-create-focus"><p>Each template offers a different kind of experience. Choose whichever one fits the activity you want to make.</p></ThinkBotTutorial>}
    {!guestMode && tutorial?.stage === "create_open_builder" && <ThinkBotTutorial target='[data-tutorial="create-open-builder"]' placement="above" className="tw-tutorial-bob-down tw-tutorial-template-selected" highlightMode="target"><p>Your template is selected. Create it and open the builder to start adding questions.</p></ThinkBotTutorial>}
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
function segmentBtn(c, active) { return { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px 14px", borderRadius: 14, border: `${active ? 4 : 2}px solid ${active ? c.accent : c.border}`, background: active ? `${c.accent}18` : c.cardBg2, color: active ? c.accent : c.textMuted, fontWeight: 850, cursor: "pointer" }; }
