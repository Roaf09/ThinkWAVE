/* FILE GUIDE:
 * client/src/pages/teacher/QuizBuilder.jsx
 * Purpose: Teacher quiz builder orchestration for all templates.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { useColors, useTheme } from "../../context/ThemeContext";
import ActionDialog, { primaryBtn, secondaryBtn } from "../../components/ActionDialog";
import ThemeIconButton from "../../components/ThemeIconButton";
import { TwIcon } from "../../components/TwUI";
import { TeacherPressButton } from "./TeacherUI";
import { getTemplateLimit, isInstitutionPlan } from "../../lib/planLimits";
import { normalizeTemplateType } from "../../lib/templateTypes";
import {
  buildBlankQuestion,
  clampQuestionPoints,
  compressImageFile,
  findDuplicates,
  normalizeMatchingPayload,
  safeJson,
  trimText,
  validateQuestion,
} from "./quiz-builder/quizBuilderUtils";
import { BankModal, BuilderModal, getUi, MediaInput, TemplateEditor, VoiceRecordingPanel } from "./quiz-builder/QuizBuilderParts";

export default function QuizBuilder({ guestMode = false }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { dark, toggleTheme } = useTheme();
  const c = useColors();
  const [quiz, setQuiz] = useState(null);
  const ui = useMemo(() => getUi(c, dark, quiz?.template_type), [c, dark, quiz?.template_type]);
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
  const [institutionPlan, setInstitutionPlan] = useState(false);
  const [loadError, setLoadError] = useState("");
  const isBasic = !institutionPlan;
  const planLimit = getTemplateLimit(quiz?.template_type);

  useEffect(() => {
    if (!["saved", "published", "bankSaved"].includes(modal)) return;
    const t = setTimeout(() => setModal(null), 2000);
    return () => clearTimeout(t);
  }, [modal]);

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const { data } = await api.get(`/quizzes/${id}`);
      let institution = false;
      if (!guestMode) {
        try {
          const { data: me } = await api.get("/auth/me");
          institution = isInstitutionPlan(me);
        } catch {
          institution = false;
        }
      }
      setInstitutionPlan(institution);
      setQuiz({ ...data.quiz, template_type: normalizeTemplateType(data.quiz.template_type) });
      setTitleDraft(data.quiz.title || "");
      setSettings({
        randomizeQuestions: !!data.quiz.randomize_questions,
        shuffleAnswers: !!data.quiz.shuffle_answers,
      });

      const loaded = (data.questions || []).map((q) => {
        const cfg = safeJson(q.config_json) || {};
        let correct = safeJson(q.correct_json) || {};
        let nextCfg = { ...cfg, showPromptImage: cfg.showPromptImage ?? !!cfg.promptImage };
        if (data.quiz?.template_type === "MATCHING") {
          const normalized = normalizeMatchingPayload(cfg, correct);
          nextCfg = { ...normalized.config, showPromptImage: normalized.config.showPromptImage ?? !!normalized.config.promptImage };
          correct = normalized.correct;
        }
        if (!institution) {
          nextCfg = { ...nextCfg, showPromptImage: false, promptImage: "" };
          if (normalizeTemplateType(data.quiz?.template_type) === "MCQ") {
            nextCfg.mcqMode = "NORMAL";
            nextCfg.options = (Array.isArray(nextCfg.options) ? nextCfg.options : []).slice(0, 4).map((option) => typeof option === "object" ? { ...option, image: "" } : option);
          }
          if (normalizeTemplateType(data.quiz?.template_type) === "MATCHING") {
            nextCfg.colA = (nextCfg.colA || []).slice(0, 5);
            nextCfg.colB = (nextCfg.colB || []).slice(0, 6);
            nextCfg.dummyB = (nextCfg.dummyB || []).slice(0, 1);
          }
          if (normalizeTemplateType(data.quiz?.template_type) === "THINK_SPELL") {
            nextCfg.answers = (nextCfg.answers || []).slice(0, 4);
            correct = { ...correct, answers: (correct.answers || nextCfg.answers || []).slice(0, 4) };
          }
        }
        const basicLimit = getTemplateLimit(data.quiz?.template_type);
        return {
          id: q.id,
          order: q.question_order,
          prompt: q.prompt,
          config: nextCfg,
          correct,
          timeLimitSec: institution ? (nextCfg.timeLimitSec ?? data.quiz.time_limit_sec ?? 30) : Math.min(Number(nextCfg.timeLimitSec ?? data.quiz.time_limit_sec ?? 30), basicLimit.maxTimeSec),
          points: nextCfg.points ?? data.quiz.points_per_question ?? 1,
        };
      });

      if (loaded.length === 0) {
        setQuestions([buildBlankQuestion(data.quiz, 0)]);
        setIsSaved(false);
      } else {
        const showPromptImage = institution && loaded.some((question) => !!question.config?.showPromptImage);
        const voiceRecord = loaded.some((question) => !!question.config?.voiceRecord);
        const textToSpeech = !voiceRecord && loaded.some((question) => !!question.config?.textToSpeech);
        setQuestions(loaded.map((question) => ({ ...question, config: { ...question.config, showPromptImage, voiceRecord, textToSpeech } })));
        setIsSaved(true);
      }
      setQIndex(0);
      setNavTick((v) => v + 1);
    } catch (error) {
      setLoadError(error?.response?.data?.message || "The quiz builder could not load this quiz.");
    }
  }, [id, guestMode]);

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

  function applyConfigToAllQuestions(patch) {
    markUnsaved((qs) => qs.map((question) => ({
      ...question,
      config: {
        ...(question.config || {}),
        ...patch,
        voicePrompt: question.config?.voicePrompt || "",
        voiceAnswers: Array.isArray(question.config?.voiceAnswers) ? question.config.voiceAnswers : [],
      },
    })));
  }

  function inheritedGlobalConfig(sourceQuestions = questions) {
    const first = sourceQuestions?.[0]?.config || {};
    return {
      showPromptImage: !!first.showPromptImage,
      voiceRecord: !!first.voiceRecord,
      textToSpeech: !!first.textToSpeech,
    };
  }

  function addQuestion() {
    if (isBasic && questions.length >= planLimit.maxItems) {
      setMsg(`Basic plan allows only ${planLimit.maxItems} ${["MATCHING","THINK_SPELL"].includes(quiz?.template_type) ? "batches" : "questions"} for this template.`);
      return;
    }
    markUnsaved((qs) => {
      const blank = buildBlankQuestion(quiz, qs.length);
      blank.config = { ...blank.config, ...inheritedGlobalConfig(qs) };
      return [...qs, blank];
    });
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
    if (patch._convertToMatching) {
      const { _convertToMatching, ...rest } = patch;
      setQuiz((prev) => ({ ...prev, template_type: "MATCHING" }));
      markUnsaved((qs) => {
        const next = [...qs];
        next[qIndex] = {
          ...next[qIndex],
          ...rest,
          points: 1, // Revision 3: all templates default to 1 point per question
        };
        return next;
      });
      return;
    }
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
            shuffleColA: !!settings.shuffleAnswers,
          }
        : {};
      return {
        ...q,
        order: idx,
        config: {
          ...q.config,
          ...extra,
          timeLimitSec: q.timeLimitSec,
          points: clampQuestionPoints(q.points, 3),
        },
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
      setTimeout(() => navigate(guestMode ? "/guest" : "/teacher"), 1800);
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
      setMsg("");
      setModal("bankSaved");
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
      config: { ...parsedConfig, ...inheritedGlobalConfig(questions) },
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

  if (loadError) {
    return <div className="container" style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <div className="card" style={{ maxWidth: 520, textAlign: "center", display: "grid", gap: 14 }}>
        <b>Quiz Builder could not open</b>
        <span>{loadError}</span>
        <button className="btn" onClick={load}>Try Again</button>
        <button className="btn secondary" onClick={() => navigate(guestMode ? "/guest" : "/teacher", { state: { tab: "create" } })}>Back to Create</button>
      </div>
    </div>;
  }

  if (!quiz || !settings) {
    return <div className="container"><div className="card">Loading Quiz Builder…</div></div>;
  }

  const currentQ = questions[qIndex] || null;
  const totalQ = questions.length;
  const isFirst = qIndex === 0;
  const isLast = totalQ === 0 || qIndex === totalQ - 1;
  const publishDisabled = !isSaved || quiz.status === "PUBLISHED";
  const isBatchTemplate = ["MATCHING", "THINK_SPELL"].includes(quiz.template_type);
  const globalShowPromptImage = questions.length > 0 && questions.every((question) => !!question.config?.showPromptImage);
  const globalVoiceRecord = questions.length > 0 && questions.every((question) => !!question.config?.voiceRecord);
  const globalTextToSpeech = questions.length > 0 && questions.every((question) => !!question.config?.textToSpeech);

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
        @keyframes twGridFill { from { opacity: .45; transform: scale(.985); } to { opacity: 1; transform: scale(1); } }
        @keyframes twTilePop { from { opacity: 0; transform: scale(.72) rotate(-4deg); } to { opacity: 1; transform: scale(1) rotate(0); } }
      `}</style>

      {!guestMode && bankOpen && <div style={ui.blurOverlay} />}

      <div className="tw-quiz-builder-page" style={ui.page}>
        <ThemeIconButton dark={dark} onClick={toggleTheme} size={22} className="tw-builder-floating-theme" aria-label={dark ? "Use light mode" : "Use dark mode"} />
        <div style={ui.topBar}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", minWidth: 280, flex: 1 }}>
            <button className="tw-builder-press tw-builder-press-neutral" style={ui.ghostBtn} onClick={() => navigate(guestMode ? "/guest" : "/teacher", { state: { tab: "live" } })}>← Back</button>
            <button className={`tw-builder-settings-flat${settingsOpen ? " is-active" : ""}`} title="Quiz settings" aria-label="Quiz settings" onClick={() => setSettingsOpen((v) => !v)}><TwIcon name="gear" size={22} /></button>
            <div style={{ minWidth: 220, flex: "0 1 540px" }}>
              {titleEditing ? (
                <input
                  autoFocus
                  value={titleDraft}
                  maxLength={255}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onBlur={saveTitle}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") {
                      setTitleDraft(quiz.title || "");
                      setTitleEditing(false);
                    }
                  }}
                  style={ui.titleInput}
                  placeholder="Quiz title"
                  aria-label="Quiz title"
                  disabled={titleSaving}
                />
              ) : (
                <button type="button" className="tw-builder-title-button" onClick={() => setTitleEditing(true)} title="Click to edit the quiz title" style={{ color: c.text }}>
                  {quiz.title}
                </button>
              )}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <TeacherPressButton tone="red" className="tw-builder-icon-press" title="Delete quiz" aria-label="Delete quiz" onClick={() => setModal("confirmDelete")}><TwIcon name="trash" size={20} /></TeacherPressButton>
            {!guestMode && <TeacherPressButton tone="blue" onClick={() => setBankOpen(true)}>Add from Bank</TeacherPressButton>}
            <TeacherPressButton tone="blue" onClick={addQuestion}>＋ {isBatchTemplate ? "Add Batch" : "Add Question"}</TeacherPressButton>
            <TeacherPressButton tone="blue" onClick={save} disabled={isSaved}>{isSaved ? "Saved" : "Save"}</TeacherPressButton>
            <TeacherPressButton tone="blue" onClick={publish} disabled={publishDisabled}>{quiz.status === "PUBLISHED" ? "Published" : "Publish"}</TeacherPressButton>
          </div>
        </div>

        <div className={`collapsible-content ${settingsOpen ? "open" : ""}`} style={{ marginTop: settingsOpen ? 0 : 0 }}>
          <div className="collapsible-inner">
            <div style={ui.settingsPanel}>
              <div style={ui.settingsPanelInner}>
              <button style={ui.toggleCard(settings.randomizeQuestions)} onClick={() => saveSettings({ randomizeQuestions: !settings.randomizeQuestions })}>
                <div>
                  <div style={ui.toggleTitle}>{isBatchTemplate ? "Randomize batch" : "Randomize question order"}</div>
                  <div style={ui.toggleHint}>{isBatchTemplate ? "Mix the batch sequence when the session starts." : "Mix the question sequence each time the session starts."}</div>
                </div>
                <span style={ui.switchTrack(settings.randomizeQuestions)}><span style={ui.switchThumb(settings.randomizeQuestions)} /></span>
              </button>
              {quiz.template_type === "MATCHING" && (
                <button style={ui.toggleCard(settings.shuffleAnswers)} onClick={() => saveSettings({ shuffleAnswers: !settings.shuffleAnswers })}>
                  <div><div style={ui.toggleTitle}>Shuffle Column A</div><div style={ui.toggleHint}>Change the order of the prompt-side matching cards.</div></div>
                  <span style={ui.switchTrack(settings.shuffleAnswers)}><span style={ui.switchThumb(settings.shuffleAnswers)} /></span>
                </button>
              )}
              {quiz.template_type === "MCQ" && (
                <button style={ui.toggleCard(settings.shuffleAnswers)} onClick={() => saveSettings({ shuffleAnswers: !settings.shuffleAnswers })}>
                  <div><div style={ui.toggleTitle}>Shuffle answer choices</div><div style={ui.toggleHint}>Randomize option order while keeping the answer key intact.</div></div>
                  <span style={ui.switchTrack(settings.shuffleAnswers)}><span style={ui.switchThumb(settings.shuffleAnswers)} /></span>
                </button>
              )}
              {!isBasic && <button style={ui.toggleCard(globalShowPromptImage)} onClick={() => applyConfigToAllQuestions({ showPromptImage: !globalShowPromptImage })}>
                <div><div style={ui.toggleTitle}>Question image</div><div style={ui.toggleHint}>Show an optional image field after every prompt in this quiz.</div></div>
                <span style={ui.switchTrack(globalShowPromptImage)}><span style={ui.switchThumb(globalShowPromptImage)} /></span>
              </button>}
              <button style={ui.toggleCard(globalVoiceRecord)} onClick={() => {
                const enabled = !globalVoiceRecord;
                applyConfigToAllQuestions({ voiceRecord: enabled, textToSpeech: enabled ? false : globalTextToSpeech });
              }}>
                <div><div style={ui.toggleTitle}>Voice record</div><div style={ui.toggleHint}>Enable recording for every question and answer. Voice record and text to speech cannot be active together.</div></div>
                <span style={ui.switchTrack(globalVoiceRecord)}><span style={ui.switchThumb(globalVoiceRecord)} /></span>
              </button>
              <button style={ui.toggleCard(globalTextToSpeech)} onClick={() => {
                const enabled = !globalTextToSpeech;
                applyConfigToAllQuestions({ textToSpeech: enabled, voiceRecord: enabled ? false : globalVoiceRecord });
              }}>
                <div><div style={ui.toggleTitle}>Text to speech</div><div style={ui.toggleHint}>Read every prompt and visible answer aloud. Enabling this turns voice record off for the whole quiz.</div></div>
                <span style={ui.switchTrack(globalTextToSpeech)}><span style={ui.switchThumb(globalTextToSpeech)} /></span>
              </button>
              </div>
            </div>
          </div>
        </div>

        <div style={ui.pagerBar}>
          <button className="tw-builder-press tw-builder-press-neutral" style={{ ...ui.pagerBtn, visibility: isFirst ? "hidden" : "visible" }} onClick={goPrev}>‹ Previous</button>
          <div style={{ textAlign: "center", color: c.text, fontSize: 15, fontWeight: 800 }}>{`${isBatchTemplate ? "Batch" : "Question"} ${qIndex + 1} of ${totalQ}`}</div>
          <button className="tw-builder-press tw-builder-press-neutral" style={{ ...ui.pagerBtn, visibility: isLast ? "hidden" : "visible" }} onClick={goNext}>Next ›</button>
        </div>

        <div style={ui.editorArea}>
          {currentQ && (
            <div key={`${qIndex}-${navTick}`} style={{ animation: `${navDir === "next" ? "twSlideLeftIn" : "twSlideRightIn"} 220ms cubic-bezier(0.22, 1, 0.36, 1)` }}>
              <div style={ui.questionCard}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 900, fontSize: 17, color: ui.templateAccent }}>{isBatchTemplate ? `Batch ${qIndex + 1}` : `Question ${qIndex + 1}`}</span>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {!guestMode && <TeacherPressButton tone="blue" className="tw-builder-small-press" disabled={validateQuestion(currentQ, quiz.template_type).length > 0} onClick={() => setModal("confirmBank")}>Save to Bank</TeacherPressButton>}
                    <TeacherPressButton tone="red" className="tw-builder-small-icon-press" title={isBatchTemplate ? "Delete batch" : "Delete question"} aria-label={isBatchTemplate ? "Delete batch" : "Delete question"} onClick={deleteCurrentQuestion}><TwIcon name="trash" size={20} /></TeacherPressButton>
                  </div>
                </div>

                <div style={ui.metaGrid}>
                  <div style={ui.metaCard}>
                    <div style={ui.metaLabel}>⏱ Time limit</div>
                    <div style={ui.metaRow}>
                      <select value={currentQ.timeLimitSec ?? 30} onChange={(e) => updateQ({ timeLimitSec: Number(e.target.value) })} style={{ ...ui.metaInput, width: 125 }}>
                        {Array.from({ length: Math.floor((isBasic ? planLimit.maxTimeSec : 600) / 30) }, (_, i) => (i + 1) * 30).map((seconds) => <option key={seconds} value={seconds}>{seconds}s</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={ui.metaCard}>
                    <div style={ui.metaLabel}>⭐ Points</div>
                    <div style={ui.metaRow}>
                      <input
                        type="number"
                        min={1}
                        max={3}
                        value={currentQ.points ?? 1}
                        onChange={(e) => updateQ({
                          points: clampQuestionPoints(e.target.value, 3),
                        })}
                        style={ui.metaInput}
                      />
                      <span style={ui.metaSuffix}>{quiz.template_type === "THINK_SPELL" ? "per word" : quiz.template_type === "MATCHING" ? "per pair" : "per question"}</span>
                    </div>
                  </div>
                </div>

                <div className={quiz.template_type === "MCQ" && currentQ.config?.voiceRecord ? "tw-builder-question-voice-grid" : undefined}>
                  <div>
                    <label style={ui.fieldLabel}>
                      Question
                      <span style={{ fontSize: 11, opacity: 0.55, marginLeft: 8 }}>{(currentQ.prompt || "").length}/255</span>
                    </label>
                    <textarea rows={4} maxLength={255} value={currentQ.prompt} onChange={(e) => updateQ({ prompt: e.target.value })} style={ui.textarea} />
                  </div>
                  {quiz.template_type === "MCQ" && currentQ.config?.voiceRecord && <VoiceRecordingPanel question={currentQ} templateType={quiz.template_type} onChange={updateQ} ui={ui} c={c} compactQuestionOnly />}
                </div>
                {quiz.template_type !== "MCQ" && currentQ.config?.voiceRecord && <VoiceRecordingPanel question={currentQ} templateType={quiz.template_type} onChange={updateQ} ui={ui} c={c} />}
                {!isBasic && currentQ.config?.showPromptImage && <div style={{ marginTop: 10, marginBottom: 16 }}>
                  <MediaInput
                    label="Question image (optional)"
                    value={currentQ.config?.promptImage || ""}
                    placeholder="Image URL for this question"
                    onChange={(value) => updateQ({ config: { ...(currentQ.config || {}), promptImage: value } })}
                    ui={ui}
                    c={c}
                  />
                </div>}


                <TemplateEditor templateType={quiz.template_type} category={quiz.category} q={currentQ} onChange={updateQ} ui={ui} c={c} isBasic={isBasic} />
              </div>
            </div>
          )}
        </div>
      </div>

      {modal === "saved" && <BuilderModal tone="green" icon="check" title="Progress Saved" message="Quiz questions saved successfully." onClose={() => setModal(null)} ui={ui} c={c} autoDismiss />}
      {modal === "published" && <BuilderModal tone="green" icon="spark" title="Quiz Published!" message="Your quiz is now published and ready to host live." onClose={() => setModal(null)} ui={ui} c={c} autoDismiss />}
      {modal === "deleted" && <BuilderModal tone="red" icon="trash" title="Quiz Deleted" message="Deleted. Returning to dashboard…" onClose={() => {}} ui={ui} c={c} autoDismiss />}
      {modal === "confirmDelete" && (
        <BuilderModal
          tone="red"
          icon="trash"
          title="Delete Quiz?"
          message={<>Delete <b style={{ color: c.text }}>{quiz.title}</b>? This cannot be undone.</>}
          onClose={() => setModal(null)}
          ui={ui}
          c={c}
          actions={(
            <>
              <button type="button" className="tw-teacher-text-cancel" onClick={() => setModal(null)}>Cancel</button>
              <TeacherPressButton tone="red" onClick={deleteQuiz}>Yes, delete</TeacherPressButton>
            </>
          )}
        />
      )}
      {modal === "confirmDeleteQuestion" && (
        <BuilderModal
          tone="red"
          icon="trash"
          title="Delete question?"
          message={questions.length === 1 ? "This will reset the builder to one blank question." : <>{quiz?.template_type === "MATCHING" ? "Batch" : "Question"} <b style={{ color: c.text }}>{qIndex + 1}</b> will be removed from this quiz.</>}
          onClose={() => setModal(null)}
          ui={ui}
          c={c}
          actions={(
            <>
              <button type="button" className="tw-teacher-text-cancel" onClick={() => setModal(null)}>Cancel</button>
              <TeacherPressButton tone="red" onClick={performDeleteCurrentQuestion}>Yes, delete</TeacherPressButton>
            </>
          )}
        />
      )}
      {modal === "confirmPublish" && (
        <BuilderModal
          tone="blue"
          icon="spark"
          title="Publish Quiz?"
          message="Students will now be able to host and join this quiz live. You can still view and edit it later if needed."
          onClose={() => setModal(null)}
          ui={ui}
          c={c}
          actions={(
            <>
              <button type="button" className="tw-teacher-text-cancel" onClick={() => setModal(null)}>Cancel</button>
              <TeacherPressButton tone="blue" onClick={confirmPublish}>Yes, publish</TeacherPressButton>
            </>
          )}
        />
      )}
      {!guestMode && modal === "confirmBank" && (
        <BuilderModal
          tone="blue"
          icon="bank"
          title="Save question to bank?"
          message={quiz?.template_type === "MATCHING" ? "This will add the current batch to your question bank so you can reuse it later." : "This will add the current question to your question bank so you can reuse it later."}
          onClose={() => setModal(null)}
          ui={ui}
          c={c}
          actions={(
            <>
              <button type="button" className="tw-teacher-text-cancel" onClick={() => setModal(null)}>Cancel</button>
              <TeacherPressButton tone="blue" onClick={async () => { const issues = validateQuestion(currentQ, quiz?.template_type); if (issues.length) { setMsg(`Complete this ${quiz?.template_type === "MATCHING" ? "batch" : "question"} first: ${issues[0]}.`); setModal(null); return; } setModal(null); await doSaveToBank(currentQ); }}>Yes, save to bank</TeacherPressButton>
            </>
          )}
        />
      )}
      {!guestMode && modal === "bankSaved" && <BuilderModal tone="green" icon="check" title="Saved to Bank" message="The current question was added to your question bank." onClose={() => setModal(null)} ui={ui} c={c} autoDismiss />}
      {modal === "duplicates" && (
        <BuilderModal
          tone="yellow"
          icon="warning"
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
          icon="warning"
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

      {msg && !modal && <BuilderModal
        tone={/failed|error|cannot|only|complete/i.test(msg) ? "yellow" : "green"}
        icon={/failed|error|cannot|only|complete/i.test(msg) ? "warning" : "check"}
        title={/failed|error|cannot|only|complete/i.test(msg) ? "Action needed" : "Updated"}
        message={msg}
        onClose={() => setMsg("")}
        ui={ui}
        c={c}
        autoDismiss={!/failed|error|cannot|only|complete/i.test(msg)}
      />}
      {!guestMode && bankOpen && <BankModal templateType={quiz.template_type} onSelect={addFromBank} onClose={() => setBankOpen(false)} ui={ui} c={c} />}
    </>
  );
}

