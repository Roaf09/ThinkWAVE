/* FILE GUIDE:
 * client/src/pages/teacher/QuizBuilder.jsx
 * Purpose: Teacher quiz builder for all templates and per-question settings.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { useColors, useTheme } from "../../context/ThemeContext";
import ActionDialog, { primaryBtn, secondaryBtn } from "../../components/ActionDialog";

function similarity(a, b) {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  const intersection = [...wordsA].filter((w) => wordsB.has(w));
  return intersection.length / Math.max(wordsA.size, wordsB.size);
}

function findDuplicates(questions) {
  const dupes = [];
  for (let i = 0; i < questions.length; i++) {
    for (let j = i + 1; j < questions.length; j++) {
      const score = similarity(questions[i].prompt || "", questions[j].prompt || "");
      if (score >= 0.7) dupes.push({ i: i + 1, j: j + 1, score: Math.round(score * 100) });
    }
  }
  return dupes;
}

function safeJson(v) {
  if (!v) return null;
  if (typeof v === "object") return v;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}


async function compressImageFile(file) {
  if (!file) return null;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    const maxW = 1280;
    const maxH = 720;
    let { width, height } = img;
    const ratio = Math.min(1, maxW / width, maxH / height);
    width = Math.max(1, Math.round(width * ratio));
    height = Math.max(1, Math.round(height * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function defaultConfig(t, c) {
  switch (t) {
    case "MCQ":
      return { options: c === "K12" ? ["", "", ""] : ["", "", "", ""] };
    case "TRUE_FALSE":
      return { options: ["True", "False"] };
    case "MATCHING":
      return {
        colA: [{ text: "", image: "" }],
        colB: [{ text: "" }],
        useImageColumnA: false,
      };
    case "GUESS_WORD_4PICS":
      return { images: ["", "", "", ""] };
    case "THINK_SPELL":
      return { dummyLetters: 6, target: "" };
    default:
      return {};
  }
}

function defaultCorrect(t) {
  switch (t) {
    case "MCQ":
    case "TRUE_FALSE":
      return { choice: "" };
    case "MATCHING":
      return { pairs: [{ aIndex: 0, bIndex: 0 }] };
    default:
      return { text: "" };
  }
}

function buildBlankQuestion(quiz, order = 0) {
  return {
    order,
    prompt: "",
    config: defaultConfig(quiz?.template_type, quiz?.category),
    correct: defaultCorrect(quiz?.template_type),
    timeLimitSec: 30,
    points: quiz?.template_type === "MATCHING" ? 2 : 1,
  };
}

function trimText(v) {
  return String(v || "").trim();
}

function normalizeMatchingPayload(config, correct) {
  const cfg = config || {};
  const cor = correct || {};
  const colA = Array.isArray(cfg.colA) ? cfg.colA.map((item) => ({ text: item?.text || "", image: item?.image || "" })) : [];
  const rawB = Array.isArray(cfg.colB) ? cfg.colB.map((item) => ({ text: item?.text || "" })) : [];
  const pairMap = new Map((Array.isArray(cor.pairs) ? cor.pairs : []).map((pair) => [Number(pair?.aIndex), Number(pair?.bIndex)]));
  const colB = colA.length ? colA.map((_, index) => rawB[pairMap.get(index)] || rawB[index] || { text: "" }) : rawB;
  return {
    config: { ...cfg, colA, colB },
    correct: { ...cor, pairs: colA.map((_, i) => ({ aIndex: i, bIndex: i })) },
  };
}

function validateQuestion(q, templateType) {
  const issues = [];
  if (!trimText(q.prompt)) issues.push("prompt is empty");

  const cfg = q.config || {};
  const cor = q.correct || {};

  if (templateType === "MCQ") {
    const opts = Array.isArray(cfg.options) ? cfg.options.map(trimText) : [];
    if (opts.some((opt) => !opt)) issues.push("one or more choices are empty");
    if (opts.filter(Boolean).length < 2) issues.push("needs at least 2 completed choices");
    if (!trimText(cor.choice)) issues.push("correct answer is not selected");
  }

  if (templateType === "TRUE_FALSE") {
    if (!trimText(cor.choice)) issues.push("correct answer is not selected");
  }

  if (["TYPE_ANSWER", "DRAW_IT", "GRIP_GUESS", "GUESS_WORD_4PICS", "THINK_SPELL"].includes(templateType)) {
    if (!trimText(cor.text)) issues.push("correct answer is empty");
  }

  if (templateType === "GUESS_WORD_4PICS") {
    const images = Array.isArray(cfg.images) ? cfg.images : [];
    if (images.length < 4 || images.some((src) => !trimText(src))) issues.push("all 4 image clues must be filled");
  }

  if (templateType === "MATCHING") {
    const useImageColumnA = !!cfg.useImageColumnA;
    const colA = Array.isArray(cfg.colA) ? cfg.colA : [];
    const colB = Array.isArray(cfg.colB) ? cfg.colB : [];
    const pairs = Array.isArray(cor.pairs) ? cor.pairs : [];
    const usedB = new Set();
    if (colA.length === 0 || colB.length === 0 || colA.length !== colB.length) issues.push("matching pairs are incomplete");
    if (colA.some((item) => !(trimText(item?.text) || (useImageColumnA && trimText(item?.image))))) issues.push("one or more column A items are empty");
    if (colB.some((item) => !trimText(item?.text))) issues.push("one or more column B items are empty");
    if (pairs.length !== colA.length) issues.push("correct matches are not set");
    for (const pair of pairs) {
      const aIndex = Number(pair?.aIndex);
      const bIndex = Number(pair?.bIndex);
      if (!Number.isInteger(aIndex) || !Number.isInteger(bIndex) || aIndex < 0 || bIndex < 0 || aIndex >= colA.length || bIndex >= colB.length) {
        issues.push("one or more correct matches are invalid");
        break;
      }
      if (usedB.has(bIndex)) {
        issues.push("a column B match is used more than once");
        break;
      }
      usedB.add(bIndex);
    }
  }

  return issues;
}

// QuizBuilder is the main authoring page. Each template shares the same save/publish flow but renders different fields.
export default function QuizBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { dark, toggleTheme } = useTheme();
  const c = useColors();
  const ui = useMemo(() => getUi(c, dark), [c, dark]);

  const [quiz, setQuiz] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [qIndex, setQIndex] = useState(0);
  const [settings, setSettings] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modal, setModal] = useState(null);
  const [bankOpen, setBankOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [dupeList, setDupeList] = useState([]);
  const [invalidList, setInvalidList] = useState([]);
  const [isSaved, setIsSaved] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleSaving, setTitleSaving] = useState(false);
  const [navDir, setNavDir] = useState("next");
  const [navTick, setNavTick] = useState(0);
  const [publishFlow, setPublishFlow] = useState(false);

  useEffect(() => {
    if (!["saved", "published", "bankSaved"].includes(modal)) return;
    const t = setTimeout(() => setModal(null), 2000);
    return () => clearTimeout(t);
  }, [modal]);

  const load = useCallback(async () => {
    const { data } = await api.get(`/quizzes/${id}`);
    setQuiz(data.quiz);
    setTitleDraft(data.quiz.title || "");
    setSettings({
      randomizeQuestions: !!data.quiz.randomize_questions,
      shuffleAnswers: !!data.quiz.shuffle_answers,
    });

    const loaded = (data.questions || []).map((q) => {
      const cfg = safeJson(q.config_json) || {};
      let correct = safeJson(q.correct_json) || {};
      let nextCfg = cfg;
      if (data.quiz?.template_type === "MATCHING") {
        const normalized = normalizeMatchingPayload(cfg, correct);
        nextCfg = normalized.config;
        correct = normalized.correct;
      }
      return {
        id: q.id,
        order: q.question_order,
        prompt: q.prompt,
        config: nextCfg,
        correct,
        timeLimitSec: nextCfg.timeLimitSec ?? data.quiz.time_limit_sec ?? 30,
        points: nextCfg.points ?? data.quiz.points_per_question ?? 1,
      };
    });

    if (loaded.length === 0) {
      setQuestions([buildBlankQuestion(data.quiz, 0)]);
      setIsSaved(false);
    } else {
      setQuestions(loaded);
      setIsSaved(true);
    }
    setQIndex(0);
    setNavTick((v) => v + 1);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  function markUnsaved(updater) {
    setQuestions((qs) => (typeof updater === "function" ? updater(qs) : updater));
    setIsSaved(false);
  }

  async function saveSettings(patch) {
    const next = { ...settings, ...patch };
    setSettings(next);
    try {
      await api.put(`/quizzes/${id}/settings`, {
        timeLimitSec: 30,
        pointsPerQuestion: 1,
        randomizeQuestions: next.randomizeQuestions,
        shuffleAnswers: next.shuffleAnswers,
      });
    } catch {
      setMsg("Failed to save settings.");
    }
  }

  async function saveTitle() {
    const clean = trimText(titleDraft);
    if (!clean) {
      setTitleDraft(quiz?.title || "");
      setTitleEditing(false);
      return;
    }
    if (clean === quiz?.title) {
      setTitleEditing(false);
      return;
    }
    setTitleSaving(true);
    try {
      await api.put(`/quizzes/${id}/meta`, { title: clean });
      setQuiz((prev) => ({ ...prev, title: clean }));
      setTitleDraft(clean);
      setTitleEditing(false);
      setMsg("Quiz title updated.");
    } catch (e) {
      setMsg(e?.response?.data?.message || "Failed to update title.");
    } finally {
      setTitleSaving(false);
    }
  }

  function addQuestion() {
    markUnsaved((qs) => [...qs, buildBlankQuestion(quiz, qs.length)]);
    setNavDir("next");
    setQIndex(questions.length);
    setNavTick((v) => v + 1);
  }

  function deleteCurrentQuestion() {
    if (!questions.length) return;
    setModal("confirmDeleteQuestion");
  }

  function performDeleteCurrentQuestion() {
    if (questions.length === 1) {
      setQuestions([buildBlankQuestion(quiz, 0)]);
      setQIndex(0);
      setIsSaved(false);
      setNavTick((v) => v + 1);
      setModal(null);
      return;
    }
    markUnsaved((qs) => qs.filter((_, i) => i !== qIndex).map((q, i) => ({ ...q, order: i })));
    setQIndex((i) => Math.max(0, i - 1));
    setNavDir("prev");
    setNavTick((v) => v + 1);
    setModal(null);
  }

  function updateQ(patch) {
    markUnsaved((qs) => {
      const next = [...qs];
      next[qIndex] = { ...next[qIndex], ...patch };
      return next;
    });
  }

  function goPrev() {
    if (qIndex === 0) return;
    setNavDir("prev");
    setQIndex((i) => i - 1);
    setNavTick((v) => v + 1);
  }

  function goNext() {
    if (qIndex >= questions.length - 1) return;
    setNavDir("next");
    setQIndex((i) => i + 1);
    setNavTick((v) => v + 1);
  }

  function prepareForSave() {
    return questions.map((q, idx) => {
      const extra = quiz?.template_type === "MATCHING"
        ? {
            shuffleColA: !!settings.randomizeQuestions,
          }
        : {};
      return {
        ...q,
        order: idx,
        config: { ...q.config, ...extra, timeLimitSec: q.timeLimitSec, points: q.points },
      };
    });
  }

  function checkInvalid() {
    const list = questions
      .map((q, idx) => ({ question: idx + 1, issues: validateQuestion(q, quiz?.template_type) }))
      .filter((x) => x.issues.length > 0);
    setInvalidList(list);
    if (list.length) setModal("invalid");
    return list;
  }

  async function _doSave({ showModal = true } = {}) {
    try {
      await api.put(`/quizzes/${id}/questions`, { questions: prepareForSave() });
      setIsSaved(true);
      if (showModal) setModal("saved");
    } catch (e) {
      setMsg(e?.response?.data?.message || "Save failed.");
    }
  }

  async function save() {
    setPublishFlow(false);
    setMsg("");
    if (checkInvalid().length) return;
    const dupes = findDuplicates(questions);
    if (dupes.length) {
      setDupeList(dupes);
      setModal("duplicates");
      return;
    }
    await _doSave();
  }

  function publish() {
    setPublishFlow(true);
    setMsg("");
    if (!isSaved || quiz?.status === "PUBLISHED") return;
    if (checkInvalid().length) return;
    const dupes = findDuplicates(questions);
    if (dupes.length) {
      setDupeList(dupes);
      setModal("duplicates");
      return;
    }
    setModal("confirmPublish");
  }

  async function confirmPublish() {
    try {
      await api.post(`/quizzes/${id}/publish`);
      setQuiz((prev) => ({ ...prev, status: "PUBLISHED" }));
      setPublishFlow(false);
      setModal("published");
    } catch (e) {
      setMsg(e?.response?.data?.message || "Publish failed.");
    }
  }

  async function deleteQuiz() {
    try {
      await api.delete(`/quizzes/${id}`);
      setModal("deleted");
      setTimeout(() => navigate("/teacher"), 1800);
    } catch {
      setMsg("Delete failed.");
    }
  }

  async function doSaveToBank(q) {
    const issues = validateQuestion(q, quiz?.template_type);
    if (issues.length) {
      setInvalidList([{ question: qIndex + 1, issues }]);
      setModal("invalid");
      return;
    }
    try {
      await api.post("/question-bank", {
        templateType: quiz.template_type,
        category: quiz.category,
        prompt: q.prompt,
        config: q.config,
        correct: q.correct,
      });
      setModal("bankSaved");
      setMsg("Saved to question bank.");
    } catch {
      setMsg("Failed to save to bank.");
    }
  }

  function addFromBank(bankQ) {
    let parsedConfig = safeJson(bankQ.config_json) || bankQ.config_json || {};
    let parsedCorrect = safeJson(bankQ.correct_json) || bankQ.correct_json || {};
    if (quiz?.template_type === "MATCHING") {
      const normalized = normalizeMatchingPayload(parsedConfig, parsedCorrect);
      parsedConfig = normalized.config;
      parsedCorrect = normalized.correct;
    }
    const newQ = {
      order: questions.length,
      prompt: bankQ.prompt,
      config: parsedConfig,
      correct: parsedCorrect,
      timeLimitSec: parsedConfig?.timeLimitSec ?? 30,
      points: parsedConfig?.points ?? 1,
    };
    markUnsaved((qs) => [...qs, newQ]);
    setNavDir("next");
    setQIndex(questions.length);
    setNavTick((v) => v + 1);
    setBankOpen(false);
    setMsg("Question added from bank.");
  }

  if (!quiz || !settings) {
    return (
      <div className="container">
        <div className="card">Loading...</div>
      </div>
    );
  }

  const currentQ = questions[qIndex] || null;
  const totalQ = questions.length;
  const isFirst = qIndex === 0;
  const isLast = totalQ === 0 || qIndex === totalQ - 1;
  const publishDisabled = !isSaved || quiz.status === "PUBLISHED";

  return (
    <>
      <style>{`
        @keyframes twSlideLeftIn {
          from { opacity: 0; transform: translateX(32px) scale(0.985); }
          to { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes twSlideRightIn {
          from { opacity: 0; transform: translateX(-32px) scale(0.985); }
          to { opacity: 1; transform: translateX(0) scale(1); }
        }
      `}</style>

      {bankOpen && <div style={ui.blurOverlay} />}

      <div style={ui.page}>
        <div style={ui.topBar}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", minWidth: 280, flex: 1 }}>
            <button style={ui.ghostBtn} onClick={() => navigate("/teacher")}>← Back</button>
            <button onClick={toggleTheme} style={ui.ghostBtn}>{dark ? "☀️ Light" : "🌙 Dark"}</button>
            <div style={{ minWidth: 260, flex: 1 }}>
              {titleEditing ? (
                <div style={ui.titleEditorWrap}>
                  <input
                    autoFocus
                    value={titleDraft}
                    maxLength={255}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveTitle();
                      if (e.key === "Escape") {
                        setTitleDraft(quiz.title || "");
                        setTitleEditing(false);
                      }
                    }}
                    style={ui.titleInput}
                    placeholder="Quiz title"
                  />
                  <button style={ui.secondaryBtn} onClick={saveTitle} disabled={titleSaving}>{titleSaving ? "Saving..." : "Save title"}</button>
                  <button style={ui.ghostBtn} onClick={() => { setTitleDraft(quiz.title || ""); setTitleEditing(false); }}>Cancel</button>
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 900, fontSize: 20, color: c.text }}>{quiz.title}</div>
                    <button style={ui.inlineEditBtn} onClick={() => setTitleEditing(true)}>✎ Edit title</button>
                  </div>
                  <div style={{ fontSize: 12, color: c.textMuted, marginTop: 4 }}>
                    {quiz.template_type} · {quiz.category} · {quiz.status}
                  </div>
                </>
              )}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button style={ui.dangerGhostBtn} onClick={() => setModal("confirmDelete")}>Delete Quiz</button>
            <button style={{ ...ui.secondaryBtn, ...(settingsOpen ? ui.secondaryBtnActive : {}) }} onClick={() => setSettingsOpen((v) => !v)}>
              Settings {settingsOpen ? "▲" : "▼"}
            </button>
            <button style={ui.secondaryBtn} onClick={() => setBankOpen(true)}>Add from Bank</button>
            <button style={ui.secondaryBtn} onClick={addQuestion}>＋ Add Question</button>
            <button style={isSaved ? ui.savedBtn : ui.secondaryBtn} onClick={save} disabled={isSaved}>{isSaved ? "Saved" : "Save"}</button>
            <button style={publishDisabled ? ui.disabledPrimaryBtn : ui.primaryBtn} onClick={publish} disabled={publishDisabled}>
              {quiz.status === "PUBLISHED" ? "Published" : "Publish"}
            </button>
          </div>
        </div>

        {msg && <div style={ui.msgBar}>{msg}</div>}

        <div className={`collapsible-content ${settingsOpen ? "open" : ""}`} style={{ marginTop: settingsOpen ? 0 : 0 }}>
          <div className="collapsible-inner">
            <div style={ui.settingsPanel}>
              <div style={ui.settingsPanelInner}>
              <button style={ui.toggleCard(settings.randomizeQuestions)} onClick={() => saveSettings({ randomizeQuestions: !settings.randomizeQuestions })}>
                <div>
                  <div style={ui.toggleTitle}>{quiz.template_type === "MATCHING" ? "Shuffle column A cards" : "Randomize question order"}</div>
                    <div style={ui.toggleHint}>{quiz.template_type === "MATCHING" ? "Shuffle the prompt-side cards for each student view." : "Mix the question sequence each time the live session starts."}</div>
                </div>
                <span style={ui.switchTrack(settings.randomizeQuestions)}><span style={ui.switchThumb(settings.randomizeQuestions)} /></span>
              </button>
              {quiz.template_type !== "TRUE_FALSE" && quiz.template_type !== "MATCHING" && quiz.template_type !== "GUESS_WORD_4PICS" && (
                <button style={ui.toggleCard(settings.shuffleAnswers)} onClick={() => saveSettings({ shuffleAnswers: !settings.shuffleAnswers })}>
                  <div>
                    <div style={ui.toggleTitle}>Shuffle answer choices</div>
                    <div style={ui.toggleHint}>Randomize the order of options for each student view.</div>
                  </div>
                  <span style={ui.switchTrack(settings.shuffleAnswers)}><span style={ui.switchThumb(settings.shuffleAnswers)} /></span>
                </button>
              )}
              </div>
            </div>
          </div>
        </div>

        <div style={ui.pagerBar}>
          <button style={{ ...ui.pagerBtn, visibility: isFirst ? "hidden" : "visible" }} onClick={goPrev}>‹ Previous</button>
          <div style={{ textAlign: "center", color: c.text, fontSize: 15, fontWeight: 800 }}>{`${quiz?.template_type === "MATCHING" ? "Batch" : "Question"} ${qIndex + 1} of ${totalQ}`}</div>
          <button style={{ ...ui.pagerBtn, visibility: isLast ? "hidden" : "visible" }} onClick={goNext}>Next ›</button>
        </div>

        <div style={ui.editorArea}>
          {currentQ && (
            <div key={`${qIndex}-${navTick}`} style={{ animation: `${navDir === "next" ? "twSlideLeftIn" : "twSlideRightIn"} 220ms cubic-bezier(0.22, 1, 0.36, 1)` }}>
              <div style={ui.questionCard}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 900, fontSize: 17, color: c.accent }}>{quiz?.template_type === "MATCHING" ? `Batch ${qIndex + 1}` : `Question ${qIndex + 1}`}</span>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button style={{ ...ui.secondaryBtn, padding: "7px 12px", fontSize: 12 }} disabled={validateQuestion(currentQ, quiz.template_type).length > 0} onClick={() => setModal("confirmBank")}>
                      Save to Bank
                    </button>
                    <button style={{ ...ui.dangerGhostBtn, padding: "7px 12px", fontSize: 12 }} onClick={deleteCurrentQuestion}>Delete</button>
                  </div>
                </div>

                <div style={ui.metaGrid}>
                  <div style={ui.metaCard}>
                    <div style={ui.metaLabel}>⏱ Time limit</div>
                    <div style={ui.metaRow}>
                      <input type="number" min={5} max={600} value={currentQ.timeLimitSec ?? 30} onChange={(e) => updateQ({ timeLimitSec: Number(e.target.value) })} style={ui.metaInput} />
                      <span style={ui.metaSuffix}>seconds</span>
                    </div>
                  </div>
                  <div style={ui.metaCard}>
                    <div style={ui.metaLabel}>⭐ {quiz.template_type === "MATCHING" ? "Points per pair" : "Points"}</div>
                    <div style={ui.metaRow}>
                      <input
                        type="number"
                        min={quiz.template_type === "MATCHING" ? 2 : 1}
                        max={quiz.template_type === "MATCHING" ? 5 : 10}
                        value={currentQ.points ?? (quiz.template_type === "MATCHING" ? 2 : 1)}
                        onChange={(e) => updateQ({
                          points: quiz.template_type === "MATCHING"
                            ? Math.min(5, Math.max(2, Number(e.target.value)))
                            : Math.min(10, Math.max(1, Number(e.target.value))),
                        })}
                        style={ui.metaInput}
                      />
                      <span style={ui.metaSuffix}>{quiz.template_type === "MATCHING" ? "per correct pair" : "per question"}</span>
                    </div>
                  </div>
                </div>

                <label style={ui.fieldLabel}>
                  Prompt
                  <span style={{ fontSize: 11, opacity: 0.55, marginLeft: 8 }}>{(currentQ.prompt || "").length}/255</span>
                </label>
                <textarea rows={4} maxLength={255} value={currentQ.prompt} onChange={(e) => updateQ({ prompt: e.target.value })} style={ui.textarea} />

                <TemplateEditor templateType={quiz.template_type} category={quiz.category} q={currentQ} onChange={updateQ} ui={ui} c={c} />
              </div>
            </div>
          )}
        </div>
      </div>

      {modal === "saved" && <BuilderModal tone="green" icon="✓" title="Progress Saved" message="Quiz questions saved successfully." onClose={() => setModal(null)} ui={ui} c={c} autoDismiss />}
      {modal === "published" && <BuilderModal tone="green" icon="🚀" title="Quiz Published!" message="Your quiz is now published and ready to host live." onClose={() => setModal(null)} ui={ui} c={c} autoDismiss />}
      {modal === "deleted" && <BuilderModal tone="red" icon="🗑" title="Quiz Deleted" message="Deleted. Returning to dashboard…" onClose={() => {}} ui={ui} c={c} autoDismiss />}
      {modal === "confirmDelete" && (
        <BuilderModal
          tone="red"
          icon="🗑"
          title="Delete Quiz?"
          message={<>Delete <b style={{ color: c.text }}>{quiz.title}</b>? This cannot be undone.</>}
          onClose={() => setModal(null)}
          ui={ui}
          c={c}
          actions={(
            <>
              <button style={secondaryBtn(c, dark)} onClick={() => setModal(null)}>Cancel</button>
              <button style={primaryBtn({ bg: c.redBg, fg: c.redFg, border: c.redBorder })} onClick={deleteQuiz}>Yes, delete</button>
            </>
          )}
        />
      )}
      {modal === "confirmDeleteQuestion" && (
        <BuilderModal
          tone="red"
          icon="🗑"
          title="Delete question?"
          message={questions.length === 1 ? "This will reset the builder to one blank question." : <>{quiz?.template_type === "MATCHING" ? "Batch" : "Question"} <b style={{ color: c.text }}>{qIndex + 1}</b> will be removed from this quiz.</>}
          onClose={() => setModal(null)}
          ui={ui}
          c={c}
          actions={(
            <>
              <button style={secondaryBtn(c, dark)} onClick={() => setModal(null)}>Cancel</button>
              <button style={primaryBtn({ bg: c.redBg, fg: c.redFg, border: c.redBorder })} onClick={performDeleteCurrentQuestion}>Yes, delete</button>
            </>
          )}
        />
      )}
      {modal === "confirmPublish" && (
        <BuilderModal
          tone="blue"
          icon="🚀"
          title="Publish Quiz?"
          message="Students will now be able to host and join this quiz live. You can still view and edit it later if needed."
          onClose={() => setModal(null)}
          ui={ui}
          c={c}
          actions={(
            <>
              <button style={secondaryBtn(c, dark)} onClick={() => setModal(null)}>Cancel</button>
              <button style={primaryBtn({ bg: `${c.accent}18`, fg: c.accent, border: c.accent })} onClick={confirmPublish}>Yes, publish</button>
            </>
          )}
        />
      )}
      {modal === "confirmBank" && (
        <BuilderModal
          tone="blue"
          icon="📚"
          title="Save question to bank?"
          message={quiz?.template_type === "MATCHING" ? "This will add the current batch to your question bank so you can reuse it later." : "This will add the current question to your question bank so you can reuse it later."}
          onClose={() => setModal(null)}
          ui={ui}
          c={c}
          actions={(
            <>
              <button style={secondaryBtn(c, dark)} onClick={() => setModal(null)}>Cancel</button>
              <button style={primaryBtn({ bg: `${c.accent}18`, fg: c.accent, border: c.accent })} onClick={async () => { const issues = validateQuestion(currentQ, quiz?.template_type); if (issues.length) { setMsg(`Complete this ${quiz?.template_type === "MATCHING" ? "batch" : "question"} first: ${issues[0]}.`); setModal(null); return; } setModal(null); await doSaveToBank(currentQ); }}>Yes, save to bank</button>
            </>
          )}
        />
      )}
      {modal === "bankSaved" && <BuilderModal tone="green" icon="✓" title="Saved to Bank" message="The current question was added to your question bank." onClose={() => setModal(null)} ui={ui} c={c} autoDismiss />}
      {modal === "duplicates" && (
        <BuilderModal
          tone="yellow"
          icon="⚠️"
          title="Duplicate Questions Detected"
          onClose={() => setModal(null)}
          ui={ui}
          c={c}
          message={(
            <div>
              <p style={{ margin: "0 0 12px", color: c.textMuted, fontSize: 14 }}>The following questions are very similar. Please review before saving:</p>
              {dupeList.map((d, i) => (
                <div key={i} style={ui.warnItem}><strong>Q{d.i} and Q{d.j}</strong><span style={{ opacity: 0.75 }}> — {d.score}% similar</span></div>
              ))}
            </div>
          )}
          actions={(
            <>
              <button style={secondaryBtn(c, dark)} onClick={() => setModal(null)}>Review questions</button>
              <button style={primaryBtn({ bg: `${c.accent}18`, fg: c.accent, border: c.accent })} onClick={async () => {
                setModal(null);
                await _doSave({ showModal: !publishFlow });
                if (publishFlow) setModal("confirmPublish");
              }}>{publishFlow ? "Save & Continue" : "Save Anyway"}</button>
            </>
          )}
        />
      )}
      {modal === "invalid" && (
        <BuilderModal
          tone="yellow"
          icon="⚠️"
          title="Some questions are incomplete"
          onClose={() => setModal(null)}
          ui={ui}
          c={c}
          message={(
            <div>
              <p style={{ margin: "0 0 12px", color: c.textMuted, fontSize: 14 }}>Please complete these questions first before saving or publishing:</p>
              {invalidList.map((item) => (
                <div key={item.question} style={ui.warnItem}><strong>{quiz?.template_type === "MATCHING" ? `Batch ${item.question}` : `Question ${item.question}`}</strong><div style={{ marginTop: 4 }}>{item.issues.join(" · ")}</div></div>
              ))}
            </div>
          )}
          actions={<button style={primaryBtn({ bg: c.yellowBg, fg: c.yellowFg, border: c.yellowBorder })} onClick={() => setModal(null)}>Okay</button>}
        />
      )}

      {bankOpen && <BankModal templateType={quiz.template_type} onSelect={addFromBank} onClose={() => setBankOpen(false)} ui={ui} c={c} />}
    </>
  );
}

function BuilderModal({ title, message, onClose, actions, ui, c, autoDismiss = false, tone = "blue", icon }) {
  return (
    <ActionDialog
      tone={tone}
      icon={icon}
      title={title}
      message={message}
      onClose={onClose}
      actions={actions}
      autoDismiss={autoDismiss}
      closeOnBackdrop={!autoDismiss}
      width="min(100%, 560px)"
    />
  );
}

function BankModal({ templateType, onSelect, onClose, ui, c }) {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/question-bank")
      .then(({ data }) => setQuestions((data || []).filter((q) => q.template_type === templateType)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [templateType]);

  return (
    <div style={ui.modalWrap} onClick={onClose}>
      <div style={{ ...ui.modalCard, maxWidth: 560, maxHeight: "75vh", overflowY: "auto", textAlign: "left" }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0, color: c.text }}>Add from Question Bank</h3>
        <p style={{ fontSize: 13, color: c.textMuted, marginTop: -8, marginBottom: 16 }}>Template: <b>{templateType}</b></p>
        {loading && <p style={{ color: c.textMuted }}>Loading…</p>}
        {!loading && questions.length === 0 && <p style={{ color: c.textMuted }}>No saved questions for this template.</p>}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {questions.map((q) => (
            <div key={q.id} style={{ background: c.cardBg2, border: `1px solid ${c.border}`, borderRadius: 14, cursor: "pointer", padding: 14 }} onClick={() => onSelect(q)}>
              <div style={{ display: "flex", gap: 8, marginBottom: 6 }}><span style={{ ...ui.badge, background: c.pageBg, color: c.text }}>{q.template_type}</span></div>
              <div style={{ fontWeight: 700, fontSize: 14, color: c.text }}>{q.prompt}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 16 }}><button style={ui.secondaryBtn} onClick={onClose}>Cancel</button></div>
      </div>
    </div>
  );
}


function TemplateEditor({ templateType, category, q, onChange, ui, c }) {
  const cfg = q.config || {};
  const cor = q.correct || {};

  if (templateType === "MCQ") {
    const opts = Array.isArray(cfg.options) ? cfg.options : (category === "K12" ? ["", "", ""] : ["", "", "", ""]);
    const MIN = 2, MAX = 10;
    return (
      <div style={ui.innerCard}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h4 style={ui.innerTitle}>Multiple Choice <span style={ui.innerMeta}>({opts.length}, min {MIN}/max {MAX})</span></h4>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={{ ...ui.secondaryBtn, padding: "4px 10px", fontSize: 12 }} disabled={opts.length <= MIN} onClick={() => onChange({ config: { ...cfg, options: opts.slice(0, -1) } })}>− Option</button>
            <button style={{ ...ui.secondaryBtn, padding: "4px 10px", fontSize: 12 }} disabled={opts.length >= MAX} onClick={() => onChange({ config: { ...cfg, options: [...opts, ""] } })}>＋ Option</button>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {opts.map((opt, i) => (
            <div key={i} style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span style={{ ...ui.badge, background: c.yellowBg, color: c.yellowFg }}>{String.fromCharCode(65 + i)}</span>
              <input maxLength={255} value={opt} placeholder={`Option ${String.fromCharCode(65 + i)}`} onChange={(e) => { const next = [...opts]; next[i] = e.target.value; onChange({ config: { ...cfg, options: next }, correct: { ...cor, choice: cor.choice || next[0] } }); }} style={ui.input} />
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12 }}>
          <label style={ui.smallLabel}>Correct answer</label>
          <select value={cor.choice ?? ""} onChange={(e) => onChange({ correct: { ...cor, choice: e.target.value } })} style={ui.select}>
            <option value="">(choose)</option>
            {opts.map((o, i) => <option key={i} value={o}>{String.fromCharCode(65 + i)}: {o || "(empty)"}</option>)}
          </select>
        </div>
      </div>
    );
  }

  if (templateType === "TRUE_FALSE") {
    const selected = trimText(cor.choice).toLowerCase();
    return (
      <div style={ui.innerCard}>
        <h4 style={ui.innerTitle}>True / False</h4>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
          {["True", "False"].map((value) => {
            const active = selected === value.toLowerCase();
            return (
              <button
                key={value}
                type="button"
                onClick={() => onChange({ config: { ...cfg, options: ["True", "False"] }, correct: { ...cor, choice: value } })}
                style={{
                  borderRadius: 16,
                  padding: "18px 16px",
                  border: `2px solid ${active ? c.accent : c.border}`,
                  background: active ? `${c.accent}16` : c.cardBg2,
                  color: active ? c.accent : c.text,
                  fontWeight: 900,
                  fontSize: 16,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  boxShadow: active ? `0 12px 28px ${c.accent}22` : "none",
                  transition: "all 0.22s ease",
                  outline: active ? `3px solid ${c.accent}18` : "none",
                }}
              >
                <span style={{
                  width: 16,
                  height: 16,
                  borderRadius: 999,
                  border: `2px solid ${active ? c.accent : c.textMuted}`,
                  background: active ? c.accent : "transparent",
                  transition: "all 0.22s ease",
                }} />
                {value}
              </button>
            );
          })}
        </div>
        <div style={{ color: c.textMuted, fontSize: 12, marginTop: 10 }}>Choose the correct answer. The outlined button becomes the answer key.</div>
      </div>
    );
  }

  if (["TYPE_ANSWER", "DRAW_IT", "GRIP_GUESS"].includes(templateType)) {
    return (
      <div style={ui.innerCard}>
        <h4 style={ui.innerTitle}>Answer</h4>
        <input maxLength={255} value={cor.text ?? ""} placeholder="Correct answer" onChange={(e) => onChange({ correct: { ...cor, text: e.target.value }, config: { ...cfg, typoTolerance: Number(cfg.typoTolerance || 1) } })} style={ui.input} />
        {templateType === "TYPE_ANSWER" && (
          <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
            <label style={ui.smallLabel}>Accepted typos</label>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <input
                type="range"
                min={1}
                max={5}
                value={Number(cfg.typoTolerance || 1)}
                onChange={(e) => onChange({ config: { ...cfg, typoTolerance: Math.min(5, Math.max(1, Number(e.target.value) || 1)) } })}
                style={{ flex: 1 }}
              />
              <div style={{ ...ui.badge, minWidth: 36, justifyContent: "center", background: c.cardBg2, color: c.text }}>{Number(cfg.typoTolerance || 1)}</div>
            </div>
            <div style={{ color: c.textMuted, fontSize: 12 }}>Choose how many typos to accept as correct (1 to 5).</div>
          </div>
        )}
      </div>
    );
  }

  if (templateType === "GUESS_WORD_4PICS") {
    const images = Array.isArray(cfg.images) ? [...cfg.images] : ["", "", "", ""];
    while (images.length < 4) images.push("");

    function setImage(index, value) {
      const next = [...images];
      next[index] = value;
      onChange({ config: { ...cfg, images: next, typoTolerance: Number(cfg.typoTolerance || 1) } });
    }

    async function handleFile(index, file) {
      if (!file) return;
      if (!/^image\//.test(file.type || '')) return;
      const optimized = await compressImageFile(file);
      if (optimized) setImage(index, optimized);
    }

    return (
      <div style={ui.innerCard}>
        <h4 style={ui.innerTitle}>4 Pics 1 Word</h4>
        <div style={{ color: c.textMuted, fontSize: 12, marginTop: 4, marginBottom: 12 }}>Drop an image into any tile, or click a tile to upload. The clues are shown in a 2×2 board during gameplay.</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(180px, 1fr))", gap: 14 }}>
          {images.slice(0, 4).map((src, i) => (
            <label
              key={i}
              style={{
                position: "relative",
                minHeight: 172,
                borderRadius: 18,
                border: `1.5px dashed ${src ? c.accent : c.border}`,
                background: c.cardBg2,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                cursor: "pointer",
                boxShadow: src ? `0 14px 28px ${c.accent}14` : "none",
              }}
              onDragOver={(e) => { e.preventDefault(); }}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer?.files?.[0];
                if (file) handleFile(i, file);
              }}
            >
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handleFile(i, e.target.files?.[0])} />
              {src ? (
                <>
                  <img src={src} alt={`Clue ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setImage(i, ""); }}
                    style={{ position: "absolute", top: 10, right: 10, width: 34, height: 34, borderRadius: 999, border: "none", background: "rgba(15,23,42,0.78)", color: "#fff", fontWeight: 900, cursor: "pointer" }}
                  >×</button>
                  <div style={{ position: "absolute", left: 10, bottom: 10, padding: "6px 10px", borderRadius: 999, background: "rgba(15,23,42,0.74)", color: "#fff", fontSize: 12, fontWeight: 700 }}>Image {i + 1}</div>
                </>
              ) : (
                <div style={{ textAlign: "center", padding: 18 }}>
                  <div style={{ fontSize: 34, marginBottom: 8 }}>🖼️</div>
                  <div style={{ color: c.text, fontWeight: 800 }}>Drop image here</div>
                  <div style={{ color: c.textMuted, fontSize: 12, marginTop: 4 }}>or click to upload clue #{i + 1}</div>
                  <div style={{ color: c.textSub, fontSize: 11, marginTop: 6 }}>Images are auto-compressed to SD/HD for faster classroom loading.</div>
                </div>
              )}
            </label>
          ))}
        </div>
        <label style={{ ...ui.smallLabel, marginTop: 12, display: "block" }}>Correct word</label>
        <input maxLength={255} value={cor.text ?? ""} onChange={(e) => onChange({ correct: { ...cor, text: e.target.value }, config: { ...cfg, images, typoTolerance: Number(cfg.typoTolerance || 1) } })} style={ui.input} />
        <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
          <label style={ui.smallLabel}>Accepted typos</label>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <input
              type="range"
              min={1}
              max={5}
              value={Number(cfg.typoTolerance || 1)}
              onChange={(e) => onChange({ config: { ...cfg, images, typoTolerance: Math.min(5, Math.max(1, Number(e.target.value) || 1)) } })}
              style={{ flex: 1 }}
            />
            <div style={{ ...ui.badge, minWidth: 36, justifyContent: "center", background: c.cardBg2, color: c.text }}>{Number(cfg.typoTolerance || 1)}</div>
          </div>
          <div style={{ color: c.textMuted, fontSize: 12 }}>Scoring follows the same typo tolerance rule as Type Answer.</div>
        </div>
      </div>
    );
  }

  if (templateType === "MATCHING") {
    const useImageColumnA = !!cfg.useImageColumnA;
    const colA = Array.isArray(cfg.colA) && cfg.colA.length ? cfg.colA.map((item) => ({ text: item?.text || "", image: item?.image || "" })) : [{ text: "", image: "" }];
    const colB = Array.isArray(cfg.colB) && cfg.colB.length ? cfg.colB.map((item) => ({ text: item?.text || "" })) : [{ text: "" }];
    const rowCount = Math.max(colA.length, colB.length, 1);
    const nextA = Array.from({ length: rowCount }, (_, i) => ({ text: colA[i]?.text || "", image: colA[i]?.image || "" }));
    const nextB = Array.from({ length: rowCount }, (_, i) => ({ text: colB[i]?.text || "" }));

    function emit(aRows, bRows) {
      onChange({
        config: { ...cfg, useImageColumnA, colA: aRows, colB: bRows },
        correct: { ...cor, pairs: aRows.map((_, i) => ({ aIndex: i, bIndex: i })) },
      });
    }

    function updateA(i, patch) {
      emit(nextA.map((row, idx) => (idx === i ? { ...row, ...patch } : row)), nextB);
    }

    function updateB(i, text) {
      emit(nextA, nextB.map((row, idx) => (idx === i ? { ...row, text } : row)));
    }

    function addRow() {
      emit([...nextA, { text: "", image: "" }], [...nextB, { text: "" }]);
    }

    function removeRow(index) {
      if (rowCount <= 1) return;
      emit(nextA.filter((_, i) => i !== index), nextB.filter((_, i) => i !== index));
    }

    function toggleImageMode() {
      onChange({ config: { ...cfg, useImageColumnA: !useImageColumnA, colA: nextA, colB: nextB }, correct: { ...cor, pairs: nextA.map((_, i) => ({ aIndex: i, bIndex: i })) } });
    }

    return (
      <div style={ui.innerCard}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <div>
            <h4 style={ui.innerTitle}>Matching Pairs</h4>
            <div style={{ color: c.textMuted, fontSize: 12, marginTop: 4 }}>Each row is paired automatically: Column A row 1 matches Column B row 1, and so on. During gameplay, Column B is shuffled by default while Column A follows the shuffle setting above.</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button style={{ ...ui.secondaryBtn, padding: "7px 12px", fontSize: 12 }} onClick={toggleImageMode}>{useImageColumnA ? "Image mode: On" : "Image mode: Off"}</button>
            <button style={{ ...ui.secondaryBtn, padding: "7px 12px", fontSize: 12 }} onClick={addRow}>＋ Add Pair</button>
          </div>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          {Array.from({ length: rowCount }).map((_, index) => (
            <div key={index} style={{ border: `1px solid ${c.border}`, borderRadius: 18, background: c.cardBg2, padding: 14, display: "grid", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ ...ui.badge, background: c.pageBg, color: c.text }}>Pair {index + 1}</div>
                <button style={{ ...ui.dangerGhostBtn, padding: "6px 12px", fontSize: 12, opacity: rowCount <= 1 ? 0.55 : 1, cursor: rowCount <= 1 ? "not-allowed" : "pointer" }} disabled={rowCount <= 1} onClick={() => removeRow(index)}>Delete pair</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(220px,1fr) 56px minmax(220px,1fr)", gap: 12, alignItems: "center" }}>
                <div style={{ display: "grid", gap: 8 }}>
                  <label style={ui.smallLabel}>Column A</label>
                  <input maxLength={255} value={nextA[index]?.text || ""} placeholder={useImageColumnA ? "Label or caption (optional)" : "Concept / term / phrase"} onChange={(e) => updateA(index, { text: e.target.value })} style={ui.input} />
                  {useImageColumnA && <input maxLength={255} value={nextA[index]?.image || ""} placeholder="Image URL for column A" onChange={(e) => updateA(index, { image: e.target.value })} style={ui.input} />}
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: c.textMuted, fontWeight: 900, fontSize: 24 }}>⇄</div>
                <div style={{ display: "grid", gap: 8 }}>
                  <label style={ui.smallLabel}>Column B</label>
                  <input maxLength={255} value={nextB[index]?.text || ""} placeholder="Definition / answer / match" onChange={(e) => updateB(index, e.target.value)} style={ui.input} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (templateType === "THINK_SPELL") {
    return (
      <div style={ui.innerCard}>
        <h4 style={ui.innerTitle}>Think &amp; Spell</h4>
        <label style={ui.smallLabel}>Correct word</label>
        <input maxLength={255} value={cor.text ?? ""} onChange={(e) => onChange({ correct: { ...cor, text: e.target.value }, config: { ...cfg, target: e.target.value } })} style={ui.input} />
        <label style={{ ...ui.smallLabel, marginTop: 10, display: "block" }}>Dummy letters</label>
        <input type="number" value={Number(cfg.dummyLetters || 6)} onChange={(e) => onChange({ config: { ...cfg, dummyLetters: Number(e.target.value || 0), target: cfg.target ?? cor.text ?? "" } })} style={{ ...ui.smallInput, width: 80 }} />
      </div>
    );
  }

  return null;
}

function getUi(c, dark) {
  return {
    page: {
      display: "flex",
      flexDirection: "column",
      minHeight: "100vh",
      background: c.pageBg,
      transition: "background 0.3s",
    },
    topBar: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 12,
      padding: "14px 28px",
      background: dark ? c.sidebarBg : c.cardBg,
      borderBottom: `1px solid ${c.border}`,
      position: "sticky",
      top: 0,
      zIndex: 10,
      boxShadow: dark ? "0 10px 30px rgba(0,0,0,0.22)" : "0 10px 30px rgba(43,108,255,0.08)",
    },
    titleEditorWrap: {
      display: "flex",
      gap: 8,
      alignItems: "center",
      flexWrap: "wrap",
    },
    titleInput: {
      minWidth: 260,
      flex: 1,
      padding: "12px 14px",
      borderRadius: 12,
      border: `1px solid ${c.inputBorder}`,
      background: c.inputBg,
      color: c.text,
      fontSize: 15,
      fontWeight: 700,
      boxSizing: "border-box",
    },
    inlineEditBtn: {
      padding: "6px 12px",
      borderRadius: 999,
      border: `1px solid ${c.border}`,
      background: c.cardBg2,
      color: c.textMuted,
      fontSize: 12,
      fontWeight: 800,
      cursor: "pointer",
    },
    settingsPanel: {
      background: dark ? c.cardBg2 : c.cardBg,
      borderBottom: `1px solid ${c.border}`,
      transition: "background 0.3s, border-color 0.3s",
    },
    settingsPanelInner: {
      display: "grid",
      gap: 14,
      gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
      padding: "16px 28px 18px",
    },
    toggleCard: (active) => ({
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
      width: "100%",
      textAlign: "left",
      padding: "16px 18px",
      borderRadius: 18,
      border: `1px solid ${active ? c.accent : c.border}`,
      background: active ? (dark ? "rgba(43,108,255,0.18)" : "rgba(43,108,255,0.12)") : c.cardBg2,
      color: c.text,
      cursor: "pointer",
      boxShadow: active ? (dark ? "0 12px 28px rgba(43,108,255,0.14)" : "0 12px 28px rgba(43,108,255,0.12)") : "none",
    }),
    toggleTitle: { fontWeight: 800, fontSize: 14, color: c.text },
    toggleHint: { fontSize: 12, color: c.textMuted, marginTop: 4, lineHeight: 1.5 },
    switchTrack: (active) => ({
      width: 50,
      height: 30,
      borderRadius: 999,
      position: "relative",
      flexShrink: 0,
      background: active ? c.accent : dark ? "#24324f" : "#c6d3f7",
      border: `1px solid ${active ? c.accent : c.border}`,
      transition: "all 0.2s ease",
    }),
    switchThumb: (active) => ({
      position: "absolute",
      top: 3,
      left: active ? 23 : 3,
      width: 22,
      height: 22,
      borderRadius: "50%",
      background: "#fff",
      transition: "left 0.2s ease",
      boxShadow: "0 4px 10px rgba(0,0,0,0.18)",
    }),
    pagerBar: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "16px 40px",
      borderBottom: `1px solid ${c.border}`,
      background: dark ? c.pageBg : c.cardBg2,
    },
    editorArea: {
      flex: 1,
      padding: "28px 40px",
      maxWidth: 920,
      width: "100%",
      margin: "0 auto",
      boxSizing: "border-box",
    },
    questionCard: {
      background: c.cardBg,
      border: `1px solid ${c.border}`,
      borderRadius: 22,
      padding: "28px 32px",
      boxShadow: dark ? "0 10px 34px rgba(0,0,0,0.28)" : "0 12px 34px rgba(43,108,255,0.12)",
    },
    metaGrid: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
      gap: 14,
      marginBottom: 18,
    },
    metaCard: {
      padding: "14px 16px",
      borderRadius: 16,
      background: c.cardBg2,
      border: `1px solid ${c.border}`,
      boxShadow: dark ? "inset 0 1px 0 rgba(255,255,255,0.03)" : "inset 0 1px 0 rgba(255,255,255,0.55)",
    },
    metaLabel: { fontSize: 12, fontWeight: 800, color: c.textMuted, marginBottom: 10, letterSpacing: "0.03em", textTransform: "uppercase" },
    metaRow: { display: "flex", alignItems: "center", gap: 10 },
    metaInput: {
      width: 96,
      padding: "10px 12px",
      borderRadius: 12,
      border: `1px solid ${c.inputBorder}`,
      background: c.inputBg,
      color: c.text,
      fontSize: 15,
      fontWeight: 800,
      boxSizing: "border-box",
    },
    metaSuffix: { fontSize: 13, color: c.textMuted, fontWeight: 700 },
    fieldLabel: {
      fontSize: 13,
      fontWeight: 800,
      color: c.text,
      display: "block",
      marginBottom: 8,
      letterSpacing: "0.02em",
    },
    textarea: {
      padding: "12px 14px",
      borderRadius: 12,
      border: `1px solid ${c.inputBorder}`,
      background: c.inputBg,
      color: c.text,
      fontSize: 14,
      width: "100%",
      boxSizing: "border-box",
      resize: "vertical",
      minHeight: 90,
    },
    textareaSmall: {
      padding: "9px 12px",
      borderRadius: 10,
      border: `1px solid ${c.inputBorder}`,
      background: c.inputBg,
      color: c.text,
      fontSize: 13,
      width: "100%",
      boxSizing: "border-box",
    },
    input: {
      padding: "10px 13px",
      borderRadius: 11,
      border: `1px solid ${c.inputBorder}`,
      background: c.inputBg,
      color: c.text,
      fontSize: 14,
      width: "100%",
      boxSizing: "border-box",
    },
    select: {
      padding: "9px 12px",
      borderRadius: 10,
      border: `1px solid ${c.inputBorder}`,
      background: c.inputBg,
      color: c.text,
      fontSize: 14,
    },
    smallInput: {
      padding: "8px 10px",
      borderRadius: 10,
      border: `1px solid ${c.inputBorder}`,
      background: c.inputBg,
      color: c.text,
      fontSize: 14,
    },
    smallLabel: { fontSize: 12, color: c.textMuted, fontWeight: 700 },
    blurOverlay: {
      position: "fixed",
      inset: 0,
      backdropFilter: "blur(5px)",
      background: dark ? "rgba(0,0,0,0.55)" : "rgba(30,45,85,0.26)",
      zIndex: 200,
    },
    modalWrap: {
      position: "fixed",
      inset: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 201,
      padding: 20,
    },
    modalCard: {
      background: c.cardBg,
      border: `1px solid ${c.border}`,
      borderRadius: 20,
      padding: "30px 28px",
      width: "min(100%, 440px)",
      textAlign: "center",
      boxShadow: dark ? "0 24px 80px rgba(0,0,0,0.5)" : "0 24px 80px rgba(43,108,255,0.16)",
    },
    innerCard: {
      marginTop: 16,
      background: c.cardBg2,
      border: `1px solid ${c.border}`,
      borderRadius: 16,
      padding: 16,
    },
    innerTitle: { margin: "0 0 10px", color: c.text },
    innerMeta: { fontSize: 12, opacity: 0.7 },
    badge: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "3px 10px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 700,
    },
    warnItem: {
      background: c.yellowBg,
      border: `1px solid ${c.yellowBorder}`,
      borderRadius: 10,
      padding: "10px 12px",
      marginBottom: 8,
      fontSize: 13,
      color: c.yellowFg,
      textAlign: "left",
    },
    msgBar: {
      padding: "10px 28px",
      fontSize: 13,
      color: c.textMuted,
      fontWeight: 700,
    },
    ghostBtn: {
      padding: "8px 16px",
      borderRadius: 10,
      border: `1px solid ${c.border}`,
      background: dark ? "transparent" : c.cardBg2,
      color: c.textMuted,
      fontSize: 13,
      fontWeight: 800,
      cursor: "pointer",
    },
    pagerBtn: {
      padding: "12px 28px",
      borderRadius: 12,
      border: `1px solid ${c.border}`,
      background: c.cardBg,
      color: c.text,
      fontSize: 15,
      fontWeight: 800,
      cursor: "pointer",
    },
    secondaryBtn: {
      padding: "10px 14px",
      borderRadius: 12,
      border: `1px solid ${dark ? c.border : c.inputBorder}`,
      background: dark ? c.cardBg2 : "#edf3ff",
      color: dark ? c.text : "#17305f",
      fontSize: 14,
      fontWeight: 800,
      cursor: "pointer",
      boxShadow: dark ? "none" : "0 8px 18px rgba(43,108,255,0.08)",
    },
    secondaryBtnActive: {
      background: dark ? "#1b2b55" : "#d8e6ff",
      borderColor: c.accent,
      color: dark ? "#ffffff" : "#12306b",
    },
    savedBtn: {
      padding: "10px 14px",
      borderRadius: 12,
      border: `1px solid ${dark ? "#2f4067" : "#b8c8ef"}`,
      background: dark ? "#1a2540" : "#dfe8fb",
      color: dark ? "#90a0c8" : "#5f759f",
      fontSize: 14,
      fontWeight: 800,
      cursor: "default",
    },
    primaryBtn: {
      padding: "10px 16px",
      borderRadius: 12,
      border: "1px solid #2b6cff",
      background: "#2b6cff",
      color: "#fff",
      fontSize: 14,
      fontWeight: 900,
      cursor: "pointer",
      boxShadow: "0 12px 26px rgba(43,108,255,0.24)",
    },
    disabledPrimaryBtn: {
      padding: "10px 16px",
      borderRadius: 12,
      border: `1px solid ${dark ? "#2f4067" : "#b8c8ef"}`,
      background: dark ? "#1a2540" : "#dfe8fb",
      color: dark ? "#90a0c8" : "#5f759f",
      fontSize: 14,
      fontWeight: 900,
      cursor: "not-allowed",
      opacity: 0.95,
    },
    dangerGhostBtn: {
      padding: "10px 14px",
      borderRadius: 12,
      border: `1px solid ${c.redBorder}`,
      background: c.redBg,
      color: c.redFg,
      fontSize: 14,
      fontWeight: 800,
      cursor: "pointer",
    },
    dangerPrimaryBtn: {
      padding: "10px 16px",
      borderRadius: 12,
      border: "1px solid #dc2626",
      background: "#dc2626",
      color: "#fff",
      fontSize: 14,
      fontWeight: 900,
      cursor: "pointer",
    },
  };
}

