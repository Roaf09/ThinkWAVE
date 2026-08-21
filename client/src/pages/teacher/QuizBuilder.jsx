/* FILE GUIDE:
 * client/src/pages/teacher/QuizBuilder.jsx
 * Purpose: Teacher quiz builder orchestration for all templates.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { useColors, useTheme } from "../../context/ThemeContext";
import ActionDialog, { primaryBtn, secondaryBtn } from "../../components/ActionDialog";
import ThemeIconButton from "../../components/ThemeIconButton";
import { TwIcon } from "../../components/TwUI";
import { TeacherPressButton } from "./TeacherUI";
import { getTemplateLimit, isInstitutionPlan } from "../../lib/planLimits";
import { normalizeTemplateType } from "../../lib/templateTypes";
import { templateAccent } from "../../lib/templatePalette";
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
import ThinkBotTutorial from "../../components/ThinkBotTutorial";
import { hasSeenTemplateTutorial, markTemplateTutorialSeen, readTutorialState, writeTutorialState } from "../../lib/tutorialState";

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
  const [isSaving, setIsSaving] = useState(false);
  const editVersionRef = useRef(0);
  const savePromiseRef = useRef(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleSaving, setTitleSaving] = useState(false);
  const [navDir, setNavDir] = useState("next");
  const [navTick, setNavTick] = useState(0);
  const [publishFlow, setPublishFlow] = useState(false);
  const [institutionPlan, setInstitutionPlan] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [tutorialUserId, setTutorialUserId] = useState(null);
  const [builderTutorialStage, setBuilderTutorialStage] = useState(null);
  const [followupTemplateTutorial, setFollowupTemplateTutorial] = useState(false);
  const [modifiedTutorialOpen, setModifiedTutorialOpen] = useState(false);
  const [mcqTipVisible, setMcqTipVisible] = useState(false);
  const [bankSavedOrders, setBankSavedOrders] = useState(() => new Set());
  const isBasic = !institutionPlan;
  const planLimit = getTemplateLimit(quiz?.template_type);

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const { data } = await api.get(`/quizzes/${id}`);
      let institution = false;
      if (!guestMode) {
        try {
          const { data: me } = await api.get("/auth/me");
          institution = isInstitutionPlan(me);
          setTutorialUserId(me?.id || null);
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

  useEffect(() => {
    if (guestMode || !tutorialUserId || !quiz?.template_type) return;
    if (hasSeenTemplateTutorial(tutorialUserId, quiz.template_type)) return;
    // A persisted question set proves this template has already been successfully
    // saved before, even if local tutorial storage was cleared or came from an
    // older revision. Do not re-teach an already-used template.
    if (isSaved && questions.some((question) => Number(question?.id) > 0)) {
      markTemplateTutorialSeen(tutorialUserId, quiz.template_type);
      setBuilderTutorialStage(null);
      return;
    }
    const state = readTutorialState(tutorialUserId);
    const hasSeenAny = Object.values(state?.templateSeen || {}).some(Boolean);
    setFollowupTemplateTutorial(hasSeenAny);
    setBuilderTutorialStage((current) => current || (hasSeenAny ? "template_prompt" : "intro"));
  }, [guestMode, tutorialUserId, quiz?.template_type, isSaved, questions]);

  function finishFollowupTemplateTutorial() {
    setBuilderTutorialStage(null);
  }

  function skipFollowupTemplateTutorial() {
    finishFollowupTemplateTutorial();
  }

  function startFollowupTemplateTutorial() {
    // A template counts as "used" only after its quiz is successfully saved.
    // Opening, skipping, or completing the walkthrough alone must not suppress
    // the tutorial on a later unsaved visit.
    setBuilderTutorialStage("intro");
  }

  useEffect(() => {
    if (!builderTutorialStage || !quiz || !questions.length) return undefined;
    const q = questions[qIndex] || questions[0];
    if (!q) return undefined;
    const tt = normalizeTemplateType(quiz.template_type);
    const cfg = q.config || {};
    const cor = q.correct || {};

    // The first ever template tutorial keeps the question prompt step visible for
    // two seconds after text is entered, then asks the teacher to confirm they are done.
    if (builderTutorialStage === "question" && trimText(q.prompt)) {
      const timer = window.setTimeout(() => setBuilderTutorialStage("question_done"), 2000);
      return () => window.clearTimeout(timer);
    }
    if (builderTutorialStage === "specific" && tt === "TYPE_ANSWER" && trimText(cor.text)) {
      const timer = window.setTimeout(() => setBuilderTutorialStage("identification_done"), 2000);
      return () => window.clearTimeout(timer);
    }

    if (builderTutorialStage === "specific") {
      let next = null;
      if (tt === "MCQ") {
        const modified = cfg.mcqMode === "MODIFIED";
        const opts = Array.isArray(cfg.options) ? cfg.options : [];
        const ready = modified
          ? opts.slice(0, 4).length === 4 && opts.slice(0, 4).every((o) => trimText(o?.image))
          : opts.length >= 3 && opts.every((o) => trimText(o?.text) || trimText(o?.image));
        if (ready) next = "mcq_correct";
      } else if (tt === "TRUE_FALSE") {
        if (trimText(cor.choice)) {
          if (followupTemplateTutorial) {
            const timer = window.setTimeout(() => finishFollowupTemplateTutorial(), 500);
            return () => window.clearTimeout(timer);
          }
          next = "answer_explanation";
        }
      } else if (tt === "TYPE_ANSWER") {
        // Identification waits for typing to stop, then shows a Done? confirmation.
      } else if (tt === "MATCHING") {
        // Matching now waits for the teacher to press the tutorial Done button.
        // This keeps the pair editor interactive long enough to try text, images,
        // or a combination before moving on to distractors.
      } else if (tt === "GUESS_WORD_4PICS") {
        const images = Array.isArray(cfg.images) ? cfg.images.slice(0, 4) : [];
        if (images.length === 4 && images.every((x) => trimText(x))) next = "guess_images_done";
      } else if (tt === "THINK_SPELL") {
        // Crossword waits for the teacher to press Done after entering at least four words.
      }
      if (next) {
        const timer = window.setTimeout(() => setBuilderTutorialStage(next), 250);
        return () => window.clearTimeout(timer);
      }
    }

    if (builderTutorialStage === "mcq_correct") {
      const choices = Array.isArray(cor.choices) ? cor.choices.filter(Boolean) : [cor.choice].filter(Boolean);
      const needed = cfg.answerMode === "TWO" ? 2 : 1;
      if (choices.length >= needed) {
        const timer = window.setTimeout(() => {
          if (followupTemplateTutorial) finishFollowupTemplateTutorial();
          else setBuilderTutorialStage("answer_explanation");
        }, 2000);
        return () => window.clearTimeout(timer);
      }
    }
    if (builderTutorialStage === "answer_explanation" && trimText(cfg.explanation)) {
      const timer = window.setTimeout(() => setBuilderTutorialStage("answer_explanation_done"), 3000);
      return () => window.clearTimeout(timer);
    }
    if (builderTutorialStage === "matching_add_pair" && tt === "MATCHING") {
      const colA = Array.isArray(cfg.colA) ? cfg.colA : [];
      if (colA.length >= 2) {
        const timer = window.setTimeout(() => setBuilderTutorialStage("matching_new_pair"), 180);
        return () => window.clearTimeout(timer);
      }
    }
    if (builderTutorialStage === "repeat" && validateQuestion(q, quiz.template_type).length === 0) {
      const timer = window.setTimeout(() => setBuilderTutorialStage("repeat_done"), tt === "TYPE_ANSWER" ? 2000 : 250);
      return () => window.clearTimeout(timer);
    }
    if (builderTutorialStage === "save" && isSaved) {
      const timer = window.setTimeout(() => setBuilderTutorialStage("publish"), 2000);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [builderTutorialStage, questions, qIndex, quiz, isSaved, followupTemplateTutorial]);

  useEffect(() => {
    if (builderTutorialStage === "add_delay") {
      const timer = window.setTimeout(() => {
        window.scrollTo({ top: 0, behavior: "smooth" });
        setBuilderTutorialStage("meta");
      }, 2000);
      return () => window.clearTimeout(timer);
    }
    if (builderTutorialStage === "save_delay") {
      const timer = window.setTimeout(() => {
        window.scrollTo({ top: 0, behavior: "smooth" });
        setBuilderTutorialStage("save");
      }, 2000);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [builderTutorialStage, followupTemplateTutorial]);

  const tutorialMcqAllChoicesFilled = useMemo(() => {
    if (!quiz || normalizeTemplateType(quiz.template_type) !== "MCQ" || !questions.length) return false;
    const cfg = (questions[qIndex] || questions[0])?.config || {};
    const options = Array.isArray(cfg.options) ? cfg.options : [];
    const modified = cfg.mcqMode === "MODIFIED";
    return modified
      ? options.slice(0, 4).length === 4 && options.slice(0, 4).every((option) => trimText(option?.image))
      : options.length >= 3 && options.every((option) => trimText(option?.text) || trimText(option?.image));
  }, [quiz, questions, qIndex]);

  useEffect(() => {
    setMcqTipVisible(builderTutorialStage === "mcq_correct" && tutorialMcqAllChoicesFilled);
  }, [builderTutorialStage, tutorialMcqAllChoicesFilled]);

  useEffect(() => {
    if (!["mcq_correct", "specific", "repeat_mcq_correct"].includes(builderTutorialStage) || normalizeTemplateType(quiz?.template_type) !== "MCQ") return undefined;
    const dots = Array.from(document.querySelectorAll('[data-tutorial="builder-mcq-options"] .tw-mcq-correct-dot'));
    const controls = document.querySelector('[data-tutorial="builder-mcq-controls"]');
    if (["mcq_correct", "repeat_mcq_correct"].includes(builderTutorialStage)) dots.forEach((node) => node.classList.add("tw-tutorial-mini-pulse"));
    if (builderTutorialStage === "mcq_correct" && tutorialMcqAllChoicesFilled) controls?.classList.add("tw-tutorial-mini-pulse");
    return () => {
      dots.forEach((node) => node.classList.remove("tw-tutorial-mini-pulse"));
      controls?.classList.remove("tw-tutorial-mini-pulse");
    };
  }, [builderTutorialStage, quiz?.template_type, tutorialMcqAllChoicesFilled]);

  useEffect(() => {
    if (!["answer_explanation", "answer_explanation_done", "repeat_explanation"].includes(builderTutorialStage)) return undefined;
    const timer = window.setTimeout(() => {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [builderTutorialStage, qIndex]);

  useEffect(() => {
    if (guestMode || !tutorialUserId) return undefined;
    const onEvent = (event) => {
      if (event?.detail?.type === "mcq-modified") {
        const state = readTutorialState(tutorialUserId);
        if (!state.modifiedMcqSeen) {
          writeTutorialState(tutorialUserId, { modifiedMcqSeen: true });
          setModifiedTutorialOpen(true);
        }
      }
      if (event?.detail?.type === "crossword-arranging" && builderTutorialStage === "crossword_fill") setBuilderTutorialStage("crossword_shuffle");
    };
    window.addEventListener("thinkwave:tutorial-event", onEvent);
    return () => window.removeEventListener("thinkwave:tutorial-event", onEvent);
  }, [guestMode, tutorialUserId, builderTutorialStage]);

  function markUnsaved(updater) {
    editVersionRef.current += 1;
    setQuestions((qs) => (typeof updater === "function" ? updater(qs) : updater));
    setIsSaved(false);
  }

  async function saveSettings(patch) {
    const next = { ...settings, ...patch };
    setSettings(next);
    editVersionRef.current += 1;
    setIsSaved(false);
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
      editVersionRef.current += 1;
      setIsSaved(false);
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
    const tutorialAddRequested = builderTutorialStage === "add";
    markUnsaved((qs) => {
      const blank = buildBlankQuestion(quiz, qs.length);
      blank.config = { ...blank.config, ...inheritedGlobalConfig(qs) };
      return [...qs, blank];
    });
    setNavDir("next");
    setQIndex(questions.length);
    setNavTick((v) => v + 1);
    if (tutorialAddRequested) {
      // Main onboarding: guide the second question one area at a time again.
      // Follow-up/template-specific tutorials keep their shorter repeat flow.
      setBuilderTutorialStage(!followupTemplateTutorial ? "repeat_meta" : "repeat");
    }
  }

  function deleteCurrentQuestion() {
    if (!questions.length) return;
    setModal("confirmDeleteQuestion");
  }

  function performDeleteCurrentQuestion() {
    if (questions.length === 1) {
      editVersionRef.current += 1;
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
    // Never allow two question-set saves from this builder to overlap. This is
    // paired with the server transaction so double-clicks, delayed responses,
    // retries, and publish/save races cannot create duplicate active rows.
    if (savePromiseRef.current) return savePromiseRef.current;
    const saveVersion = editVersionRef.current;
    const payload = prepareForSave();
    setIsSaving(true);
    const task = (async () => {
      try {
        await api.put(`/quizzes/${id}/questions`, { questions: payload });
        const stillCurrent = editVersionRef.current === saveVersion;
        setIsSaved(stillCurrent);
        if (stillCurrent && !guestMode && tutorialUserId && quiz?.template_type) {
          markTemplateTutorialSeen(tutorialUserId, quiz.template_type);
        }
        return true;
      } catch (e) {
        setMsg(e?.response?.data?.message || "Save failed.");
        return false;
      } finally {
        setIsSaving(false);
      }
    })();
    savePromiseRef.current = task;
    try {
      return await task;
    } finally {
      if (savePromiseRef.current === task) savePromiseRef.current = null;
    }
  }

  function requestSave() {
    setPublishFlow(false);
    setMsg("");
    if (builderTutorialStage === "save_review") setBuilderTutorialStage("save");
    setModal("confirmSave");
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
    await _doSave({ showModal: builderTutorialStage !== "save" });
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
      setModal(null);
      if (!guestMode && tutorialUserId && builderTutorialStage) {
        markTemplateTutorialSeen(tutorialUserId, quiz?.template_type);
        setBuilderTutorialStage(null);
        const state = readTutorialState(tutorialUserId);
        if (state.mainStage === "builder_pending") {
          writeTutorialState(tutorialUserId, { mainStarted: true, mainStage: "nav_sessions" });
          window.setTimeout(() => navigate("/teacher"), 1500);
        }
      }
    } catch (e) {
      setMsg(e?.response?.data?.message || "Publish failed.");
    }
  }

  async function deleteQuiz() {
    try {
      await api.delete(`/quizzes/${id}`);
      setModal(null);
      navigate(guestMode ? "/guest" : "/teacher");
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
      setBankSavedOrders((current) => {
        const next = new Set(current);
        next.add(Number(q?.order ?? qIndex));
        return next;
      });
      if (builderTutorialStage === "bank") {
        setBuilderTutorialStage(["MATCHING", "THINK_SPELL"].includes(normalizeTemplateType(quiz?.template_type)) ? "save_delay" : "add");
      }
    } catch (error) {
      setMsg(error?.response?.data?.message || "Failed to save to bank.");
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
    setMsg("");
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
  const publishDisabled = isSaving || !isSaved || quiz.status === "PUBLISHED";
  const isBatchTemplate = ["MATCHING", "GUESS_WORD_4PICS", "THINK_SPELL"].includes(quiz.template_type);
  const tutorialHighlightColor = lightenTutorialColor(templateAccent(quiz.template_type), dark ? 0.24 : 0.36);
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

      <div className="tw-quiz-builder-page" style={{ ...ui.page, "--tw-template-tutorial-highlight": tutorialHighlightColor }}>
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
            <TeacherPressButton tone="red" data-tutorial="builder-delete-quiz" className="tw-builder-icon-press tw-builder-toolbar-action" style={{ "--builder-action-icon": "#fff" }} title="Delete quiz" aria-label="Delete quiz" onClick={() => setModal("confirmDelete")}><TwIcon name="trash" size={20} /></TeacherPressButton>
            {!guestMode && <TeacherPressButton tone="blue" icon="bank" data-tutorial="builder-add-bank" className="tw-builder-toolbar-action" style={{ "--builder-action-icon": "#fff" }} onClick={() => setBankOpen(true)}>Add from Bank</TeacherPressButton>}
            <TeacherPressButton tone="blue" data-tutorial="builder-add-question" onClick={addQuestion}>＋ {isBatchTemplate ? "Add Batch" : "Add Question"}</TeacherPressButton>
            <TeacherPressButton tone="blue" icon="check" data-tutorial="builder-save" className={`tw-builder-toolbar-action${isSaved ? " is-latched" : ""}`} style={{ "--builder-action-icon": "#fff" }} onClick={requestSave} disabled={isSaved || isSaving}>{isSaving ? "Saving…" : isSaved ? "Saved" : "Save"}</TeacherPressButton>
            <TeacherPressButton tone="blue" icon="spark" data-tutorial="builder-publish" className={`tw-builder-toolbar-action${quiz.status === "PUBLISHED" ? " is-latched" : ""}`} style={{ "--builder-action-icon": "#fff" }} onClick={publish} disabled={publishDisabled}>{quiz.status === "PUBLISHED" ? "Published" : "Publish"}</TeacherPressButton>
          </div>
        </div>

        <div className={`collapsible-content ${settingsOpen ? "open" : ""}`} style={{ marginTop: settingsOpen ? 0 : 0 }}>
          <div className="collapsible-inner">
            <div style={ui.settingsPanel}>
              <div style={ui.settingsPanelInner}>
              {!guestMode && <button style={ui.toggleCard(settings.randomizeQuestions)} onClick={() => saveSettings({ randomizeQuestions: !settings.randomizeQuestions })}>
                <div>
                  <div style={ui.toggleTitle}>{isBatchTemplate ? "Randomize assigned batches" : "Randomize assigned question order"}</div>
                  <div style={ui.toggleHint}>{isBatchTemplate ? "Assigned sessions only: each student gets the batches in a shuffled order. Live hosting keeps the builder order." : "Assigned sessions only: each student gets the questions in a shuffled order. Live hosting keeps the builder order."}</div>
                </div>
                <span style={ui.switchTrack(settings.randomizeQuestions)}><span style={ui.switchThumb(settings.randomizeQuestions)} /></span>
              </button>}
              {quiz.template_type === "MATCHING" && (
                <button style={ui.toggleCard(settings.shuffleAnswers)} onClick={() => saveSettings({ shuffleAnswers: !settings.shuffleAnswers })}>
                  <div><div style={ui.toggleTitle}>Shuffle Column A</div><div style={ui.toggleHint}>Change the prompt-side card order independently for each participant.</div></div>
                  <span style={ui.switchTrack(settings.shuffleAnswers)}><span style={ui.switchThumb(settings.shuffleAnswers)} /></span>
                </button>
              )}
              {quiz.template_type === "MCQ" && (
                <button style={ui.toggleCard(settings.shuffleAnswers)} onClick={() => saveSettings({ shuffleAnswers: !settings.shuffleAnswers })}>
                  <div><div style={ui.toggleTitle}>Shuffle answer choices</div><div style={ui.toggleHint}>Give every student or guest their own shuffled option order while keeping the answer key intact.</div></div>
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

        <div style={ui.editorArea} data-tutorial="builder-editor-shell">
          {currentQ && (
            <div key={`${qIndex}-${navTick}`} style={{ animation: `${navDir === "next" ? "twSlideLeftIn" : "twSlideRightIn"} 220ms cubic-bezier(0.22, 1, 0.36, 1)` }}>
              <div style={ui.questionCard}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 900, fontSize: 17, color: ui.templateAccent }}>{isBatchTemplate ? `Batch ${qIndex + 1}` : `Question ${qIndex + 1}`}</span>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {!guestMode && <TeacherPressButton tone="blue" icon="bank" data-tutorial="builder-save-bank" className={`tw-builder-small-press tw-builder-toolbar-action${bankSavedOrders.has(Number(currentQ?.order ?? qIndex)) ? " is-latched" : ""}`} style={{ "--builder-action-icon": "#fff" }} disabled={bankSavedOrders.has(Number(currentQ?.order ?? qIndex)) || validateQuestion(currentQ, quiz.template_type).length > 0} onClick={() => setModal("confirmBank")}>{bankSavedOrders.has(Number(currentQ?.order ?? qIndex)) ? "Saved" : "Save to Bank"}</TeacherPressButton>}
                    <TeacherPressButton tone="red" className="tw-builder-small-icon-press" title={isBatchTemplate ? "Delete batch" : "Delete question"} aria-label={isBatchTemplate ? "Delete batch" : "Delete question"} onClick={deleteCurrentQuestion}><TwIcon name="trash" size={20} /></TeacherPressButton>
                  </div>
                </div>

                <div data-tutorial="builder-meta-grid" style={ui.metaGrid}>
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
                  <div data-tutorial="builder-question">
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

      {!guestMode && !modifiedTutorialOpen && builderTutorialStage === "template_prompt" && (
        <ThinkBotTutorial accentColor={quiz ? templateAccent(quiz.template_type) : undefined} placement="center" dialogWidth={430} actionLabel="Okay" secondaryLabel="Skip" onSecondary={skipFollowupTemplateTutorial} className="tw-tutorial-template-optin" onAction={startFollowupTemplateTutorial}>
          <p>Would you like to see the tutorial for this template?</p>
        </ThinkBotTutorial>
      )}
      {!guestMode && !modifiedTutorialOpen && builderTutorialStage === "intro" && (
        <ThinkBotTutorial accentColor={quiz ? templateAccent(quiz.template_type) : undefined} placement="center" dialogWidth={430} actionLabel="Okay!" actionDelay={followupTemplateTutorial ? 0 : 2000} onAction={() => setBuilderTutorialStage("question")}>
          <p>Every template has its own builder tools, so this walkthrough is just for <strong>{quiz ? ({ MCQ: "Multiple Choice", TRUE_FALSE: "True or False", TYPE_ANSWER: "Identification", MATCHING: "Matching", GUESS_WORD_4PICS: "Guess Word", THINK_SPELL: "Crossword" }[quiz.template_type] || quiz.template_type) : "this template"}</strong>.</p>
        </ThinkBotTutorial>
      )}
      {!guestMode && !modifiedTutorialOpen && ["question", "question_done"].includes(builderTutorialStage) && (
        <ThinkBotTutorial accentColor={quiz ? templateAccent(quiz.template_type) : undefined}
          target='[data-tutorial="builder-question"]'
          placement="right"
          square
          dialogWidth={350}
          dragKey="builder-question-dialog"
          allowTargetInteraction={true}
          className="tw-tutorial-done-avatar-clear"
          reserveActionSpace
          actionLabel={builderTutorialStage === "question_done" ? "Done" : undefined}
          onAction={() => {
            window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
            setBuilderTutorialStage("specific");
          }}
        >
          <p>Start here by entering your question.</p>
        </ThinkBotTutorial>
      )}
      {!guestMode && !modifiedTutorialOpen && builderTutorialStage === "specific" && normalizeTemplateType(quiz?.template_type) === "MCQ" && (
        <ThinkBotTutorial accentColor={quiz ? templateAccent(quiz.template_type) : undefined} target='[data-tutorial="builder-mcq-options"]' placement="screen-left" square dialogWidth={360} dragKey="builder-mcq-dialog" highlightMode="target">
          <p>Next, add the possible answers.</p>
        </ThinkBotTutorial>
      )}
      {!guestMode && !modifiedTutorialOpen && builderTutorialStage === "mcq_correct" && (
        <ThinkBotTutorial accentColor={quiz ? templateAccent(quiz.template_type) : undefined} target='[data-tutorial="builder-mcq-options"]' placement="screen-left" square dialogWidth={360} dragKey="builder-mcq-dialog" highlight={false} hint={mcqTipVisible ? <span>You may also add or delete choices, or set <strong>2 answers</strong> for a question.</span> : null}>
          <p>Next, add the possible answers.</p>
          <p className="tw-tutorial-fade-line">Now click the small circle beside the correct answer.</p>
        </ThinkBotTutorial>
      )}
      {!guestMode && !modifiedTutorialOpen && builderTutorialStage === "specific" && normalizeTemplateType(quiz?.template_type) === "TRUE_FALSE" && <ThinkBotTutorial accentColor={quiz ? templateAccent(quiz.template_type) : undefined} target='[data-tutorial="builder-tf-answers"]' placement="screen-right" square dialogWidth={360}><p>Next, select either <strong>True</strong> or <strong>False</strong> to set it as the correct answer.</p></ThinkBotTutorial>}
      {!guestMode && !modifiedTutorialOpen && ["specific", "identification_done"].includes(builderTutorialStage) && normalizeTemplateType(quiz?.template_type) === "TYPE_ANSWER" && <ThinkBotTutorial accentColor={quiz ? templateAccent(quiz.template_type) : undefined} target='[data-tutorial="builder-identification-answer"]' placement="screen-right" square dialogWidth={350} dragKey="builder-identification-dialog" allowTargetInteraction={true} className="tw-tutorial-done-avatar-clear" reserveActionSpace actionLabel={builderTutorialStage === "identification_done" ? "Done" : undefined} onAction={() => { document.activeElement?.blur?.(); if (followupTemplateTutorial) finishFollowupTemplateTutorial(); else setBuilderTutorialStage("answer_explanation"); }}><p>Next, type in the correct answer.</p></ThinkBotTutorial>}
      {!guestMode && !modifiedTutorialOpen && builderTutorialStage === "specific" && normalizeTemplateType(quiz?.template_type) === "MATCHING" && (
        <>
          <ThinkBotTutorial accentColor={quiz ? templateAccent(quiz.template_type) : undefined}
            target='[data-tutorial="builder-matching-pairs"]'
            placement="screen-right"
            square
            dialogWidth={370}
            dragKey="builder-matching-dialog"
            reserveActionSpace
            actionLabel="Done"
            actionDelay={2000}
            onAction={() => setBuilderTutorialStage("matching_dummy")}
          >
            <p>Next, fill in both columns A and B.</p>
            <p className="tw-tutorial-fade-line">You can also click <strong>Add Image</strong> to upload an image for a pair.</p>
          </ThinkBotTutorial>
          <ThinkBotTutorial accentColor={quiz ? templateAccent(quiz.template_type) : undefined}
            target='[data-tutorial="builder-matching-pairs"]'
            placement="screen-left"
            square
            dialogWidth={330}
            dragKey="builder-matching-tip-dialog"
            highlight={false}
            blockInteraction={false}
            className="tw-tutorial-matching-tip"
          >
            <p><strong>TIP:</strong> text only, image only, and combined are allowed.</p>
          </ThinkBotTutorial>
        </>
      )}
      {!guestMode && !modifiedTutorialOpen && builderTutorialStage === "matching_dummy" && normalizeTemplateType(quiz?.template_type) === "MATCHING" && (() => {
        const q = questions[qIndex] || questions[0];
        const cfg = q?.config || {};
        const colA = Array.isArray(cfg.colA) ? cfg.colA : [];
        const allB = Array.isArray(cfg.colB) ? cfg.colB : [];
        const dummies = Array.isArray(cfg.dummyB) && cfg.dummyB.length ? cfg.dummyB : allB.slice(colA.length);
        const dummyReady = dummies.some((row) => trimText(row?.text) || trimText(row?.image));
        return <ThinkBotTutorial accentColor={quiz ? templateAccent(quiz.template_type) : undefined}
          target='[data-tutorial="builder-matching-dummy"]' placement="screen-right" square dialogWidth={350}
          allowTargetInteraction={true} reserveActionSpace actionLabel={dummyReady ? "Done" : undefined}
          onAction={() => setBuilderTutorialStage("matching_add_pair")}>
          <p>Add a distractor, then fill it in.</p>
        </ThinkBotTutorial>;
      })()}
      {!guestMode && !modifiedTutorialOpen && builderTutorialStage === "matching_add_pair" && normalizeTemplateType(quiz?.template_type) === "MATCHING" && <ThinkBotTutorial
        accentColor={quiz ? templateAccent(quiz.template_type) : undefined}
        target='[data-tutorial="builder-matching-add-pair"]' placement="above" square dialogWidth={330}
        highlightMode="target" allowTargetInteraction={true}><p>Add another pair.</p></ThinkBotTutorial>}
      {!guestMode && !modifiedTutorialOpen && builderTutorialStage === "matching_new_pair" && normalizeTemplateType(quiz?.template_type) === "MATCHING" && (() => {
        const q = questions[qIndex] || questions[0];
        const cfg = q?.config || {};
        const colA = Array.isArray(cfg.colA) ? cfg.colA : [];
        const colB = Array.isArray(cfg.colB) ? cfg.colB : [];
        const index = Math.max(0, colA.length - 1);
        const a = colA[index] || {};
        const b = colB[index] || {};
        const pairReady = (trimText(a?.text) || trimText(a?.image)) && (trimText(b?.text) || trimText(b?.image));
        return <ThinkBotTutorial accentColor={quiz ? templateAccent(quiz.template_type) : undefined}
          target='[data-tutorial="builder-matching-active-pair"]' placement="screen-right" square dialogWidth={350}
          allowTargetInteraction={true} reserveActionSpace actionLabel={pairReady ? "Done" : undefined}
          onAction={() => { if (followupTemplateTutorial) finishFollowupTemplateTutorial(); else setBuilderTutorialStage("add_delay"); }}>
          <p>Fill in the new pair, then click Done.</p>
        </ThinkBotTutorial>;
      })()}
      {!guestMode && !modifiedTutorialOpen && ["specific", "guess_images_done"].includes(builderTutorialStage) && normalizeTemplateType(quiz?.template_type) === "GUESS_WORD_4PICS" && <ThinkBotTutorial
        accentColor={quiz ? templateAccent(quiz.template_type) : undefined} target='[data-tutorial="builder-guess-images"]' placement="screen-right" square dialogWidth={350}
        dragKey="builder-guess-images-dialog" reserveActionSpace actionLabel={builderTutorialStage === "guess_images_done" ? "Done" : undefined}
        onAction={() => setBuilderTutorialStage("guess_word_fields")}><p>Next, upload the four images you want to use.</p></ThinkBotTutorial>}
      {!guestMode && !modifiedTutorialOpen && builderTutorialStage === "guess_word_fields" && normalizeTemplateType(quiz?.template_type) === "GUESS_WORD_4PICS" && (() => {
        const q = questions[qIndex] || questions[0];
        const cor = q?.correct || {};
        return <ThinkBotTutorial accentColor={quiz ? templateAccent(quiz.template_type) : undefined}
          target='[data-tutorial="builder-guess-word-fields"]' placement="screen-right" square dialogWidth={370}
          allowTargetInteraction={true} reserveActionSpace actionLabel={trimText(cor.text) ? "Done" : undefined}
          onAction={() => { if (followupTemplateTutorial) finishFollowupTemplateTutorial(); else setBuilderTutorialStage("answer_explanation"); }}>
          <p>Enter the <strong>correct word</strong>.</p>
          <p>Now set the number of <strong>distractor letters</strong>.</p>
        </ThinkBotTutorial>;
      })()}
      {!guestMode && !modifiedTutorialOpen && builderTutorialStage === "specific" && normalizeTemplateType(quiz?.template_type) === "THINK_SPELL" && <ThinkBotTutorial accentColor={quiz ? templateAccent(quiz.template_type) : undefined} target='[data-tutorial="builder-crossword-words"]' placement="screen-right" square dialogWidth={350} reserveActionSpace actionLabel={(() => { const q = questions[qIndex] || questions[0]; const cfg = q?.config || {}; const cor = q?.correct || {}; const words = Array.isArray(cor.answers) && cor.answers.length ? cor.answers : (Array.isArray(cfg.answers) ? cfg.answers : []); return words.filter((word) => trimText(word)).length >= 4 ? "Done" : undefined; })()} onAction={() => setBuilderTutorialStage("crossword_word_controls")}><p>Next, type in the words you would like to use.</p></ThinkBotTutorial>}
      {!guestMode && !modifiedTutorialOpen && builderTutorialStage === "crossword_word_controls" && normalizeTemplateType(quiz?.template_type) === "THINK_SPELL" && <ThinkBotTutorial
        accentColor={quiz ? templateAccent(quiz.template_type) : undefined} target='[data-tutorial="builder-crossword-word-editor"]' placement="screen-right" square dialogWidth={370}
        allowTargetInteraction={true} reserveActionSpace actionLabel="Done" actionDelay={2000} onAction={() => setBuilderTutorialStage("crossword_fill")}><p>You may add or delete the number of correct words.</p></ThinkBotTutorial>}
      {!guestMode && !modifiedTutorialOpen && builderTutorialStage === "crossword_fill" && <ThinkBotTutorial accentColor={quiz ? templateAccent(quiz.template_type) : undefined} target='[data-tutorial="builder-crossword-fill"]' placement="above" square dialogWidth={350} highlightMode="target" className="tw-tutorial-bob-down"><p>Click <strong>Fill It Up!</strong> to complete the grid.</p></ThinkBotTutorial>}
      {!guestMode && !modifiedTutorialOpen && builderTutorialStage === "crossword_shuffle" && (() => {
        const q = questions[qIndex] || questions[0];
        const cfg = q?.config || {};
        return <ThinkBotTutorial accentColor={quiz ? templateAccent(quiz.template_type) : undefined}
          target='[data-tutorial="builder-crossword-shuffle"]' placement="screen-right" square dialogWidth={350} highlightMode="target"
          allowTargetInteraction={true} reserveActionSpace actionLabel={cfg.gridFilled ? "Done" : undefined}
          onAction={() => { if (followupTemplateTutorial) finishFollowupTemplateTutorial(); else setBuilderTutorialStage("add_delay"); }}>
          <p>You may also shuffle the arrangement of the letters.</p>
        </ThinkBotTutorial>;
      })()}
      {!guestMode && !modifiedTutorialOpen && ["answer_explanation", "answer_explanation_done"].includes(builderTutorialStage) && <ThinkBotTutorial accentColor={quiz ? templateAccent(quiz.template_type) : undefined} target='[data-tutorial="builder-answer-explanation"]' placement="right" square dialogWidth={350} className="tw-tutorial-answer-explanation tw-tutorial-done-avatar-clear" allowTargetInteraction={true} reserveActionSpace actionLabel={builderTutorialStage === "answer_explanation_done" ? "Done" : undefined} onAction={() => setBuilderTutorialStage("add_delay")}><p>Add a short explanation of why the answer is correct.</p></ThinkBotTutorial>}
      {!guestMode && !modifiedTutorialOpen && ["add_delay", "save_delay"].includes(builderTutorialStage) && <ThinkBotTutorial accentColor={quiz ? templateAccent(quiz.template_type) : undefined} />}
      {!guestMode && !modifiedTutorialOpen && builderTutorialStage === "meta" && <ThinkBotTutorial accentColor={quiz ? templateAccent(quiz.template_type) : undefined} target='[data-tutorial="builder-meta-grid"]' placement="right" square dialogWidth={370} className="tw-tutorial-meta-lower tw-tutorial-meta-points-side" actionLabel="Done" onAction={() => setBuilderTutorialStage("bank")}><p>You can set the time limit and points depending on the question.</p></ThinkBotTutorial>}
      {!guestMode && !modifiedTutorialOpen && builderTutorialStage === "bank" && modal !== "confirmBank" && <ThinkBotTutorial accentColor={quiz ? templateAccent(quiz.template_type) : undefined} target='[data-tutorial="builder-save-bank"]' placement="below" dialogWidth={390} highlightMode="target"><p>You can also save this specific {isBatchTemplate ? "batch" : "question"} along with its choices in case you need it in the future.</p></ThinkBotTutorial>}
      {!guestMode && !modifiedTutorialOpen && builderTutorialStage === "add" && !modal && (
        <ThinkBotTutorial accentColor={quiz ? templateAccent(quiz.template_type) : undefined} target='[data-tutorial="builder-add-question"]' placement="below" square dialogWidth={360} highlightMode="target" className="tw-tutorial-add-question-close">
          <p>Need another one? Use <strong>{isBatchTemplate ? "Add Batch" : "Add Question"}</strong> whenever you want to expand your activity.</p>
        </ThinkBotTutorial>
      )}
      {!guestMode && !modifiedTutorialOpen && builderTutorialStage === "repeat_meta" && (
        <ThinkBotTutorial accentColor={quiz ? templateAccent(quiz.template_type) : undefined}
          target='[data-tutorial="builder-meta-grid"]' placement="right" square dialogWidth={370}
          className="tw-tutorial-meta-lower tw-tutorial-meta-points-side" reserveActionSpace actionLabel="Done"
          onAction={() => setBuilderTutorialStage("repeat_question")}>
          <p>Now let’s try doing it again for a different question!</p>
          <p>Set the time limit and points for this question.</p>
        </ThinkBotTutorial>
      )}
      {!guestMode && !modifiedTutorialOpen && builderTutorialStage === "repeat_question" && (
        <ThinkBotTutorial accentColor={quiz ? templateAccent(quiz.template_type) : undefined}
          target='[data-tutorial="builder-question"]' placement="right" square dialogWidth={350}
          dragKey="builder-repeat-question-dialog" allowTargetInteraction={true} reserveActionSpace
          actionLabel={trimText((questions[qIndex] || questions[0])?.prompt) ? "Done" : undefined}
          onAction={() => { window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" }); setBuilderTutorialStage(normalizeTemplateType(quiz?.template_type) === "MCQ" ? "repeat_mcq_answers" : "repeat"); }}>
          <p>Enter your next question.</p>
        </ThinkBotTutorial>
      )}
      {!guestMode && !modifiedTutorialOpen && builderTutorialStage === "repeat_mcq_answers" && normalizeTemplateType(quiz?.template_type) === "MCQ" && (
        <ThinkBotTutorial accentColor={quiz ? templateAccent(quiz.template_type) : undefined}
          target='[data-tutorial="builder-mcq-options"]' placement="screen-left" square dialogWidth={360}
          dragKey="builder-repeat-mcq-dialog" highlightMode="target" blockInteraction={false} reserveActionSpace
          actionLabel={tutorialMcqAllChoicesFilled ? "Done" : undefined}
          onAction={() => setBuilderTutorialStage("repeat_mcq_correct")}>
          <p>Add the possible answers.</p>
        </ThinkBotTutorial>
      )}
      {!guestMode && !modifiedTutorialOpen && builderTutorialStage === "repeat_mcq_correct" && normalizeTemplateType(quiz?.template_type) === "MCQ" && (
        <ThinkBotTutorial accentColor={quiz ? templateAccent(quiz.template_type) : undefined}
          target='[data-tutorial="builder-mcq-options"]' placement="screen-left" square dialogWidth={360}
          dragKey="builder-repeat-mcq-dialog" highlight={false} allowTargetInteraction={true} reserveActionSpace
          actionLabel={(() => { const q = questions[qIndex] || questions[0]; const cfg = q?.config || {}; const cor = q?.correct || {}; const selected = Array.isArray(cor.choices) ? cor.choices.filter(Boolean) : [cor.choice].filter(Boolean); return selected.length >= (cfg.answerMode === "TWO" ? 2 : 1) ? "Done" : undefined; })()}
          onAction={() => { window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" }); setBuilderTutorialStage("repeat_explanation"); }}>
          <p>Now click the small circle beside the correct answer{((questions[qIndex] || questions[0])?.config || {}).answerMode === "TWO" ? "s" : ""}.</p>
        </ThinkBotTutorial>
      )}
      {!guestMode && !modifiedTutorialOpen && builderTutorialStage === "repeat_explanation" && normalizeTemplateType(quiz?.template_type) === "MCQ" && (
        <ThinkBotTutorial accentColor={quiz ? templateAccent(quiz.template_type) : undefined}
          target='[data-tutorial="builder-answer-explanation"]' placement="right" square dialogWidth={350}
          dragKey="builder-repeat-explanation-dialog" className="tw-tutorial-answer-explanation tw-tutorial-done-avatar-clear"
          allowTargetInteraction={true} reserveActionSpace
          actionLabel={trimText(((questions[qIndex] || questions[0])?.config || {}).explanation) ? "Done" : undefined}
          onAction={() => { window.scrollTo({ top: 0, behavior: "smooth" }); setBuilderTutorialStage("save"); }}>
          <p>Add the short explanation for the correct answer.</p>
        </ThinkBotTutorial>
      )}
      {!guestMode && !modifiedTutorialOpen && ["repeat", "repeat_done"].includes(builderTutorialStage) && (
        <ThinkBotTutorial accentColor={quiz ? templateAccent(quiz.template_type) : undefined}
          target='[data-tutorial="builder-editor-shell"]'
          placement="screen-right"
          square
          dialogWidth={370}
          dragKey="builder-repeat-dialog"
          highlight={false}
          allowTargetInteraction={true}
          className="tw-tutorial-done-avatar-clear"
          reserveActionSpace
          actionLabel={builderTutorialStage === "repeat_done" ? "Done" : undefined}
          onAction={() => {
            window.scrollTo({ top: 0, behavior: "smooth" });
            setBuilderTutorialStage("save");
          }}
        >
          <p>Now let’s try doing it again for a different question!</p>
        </ThinkBotTutorial>
      )}
      {!guestMode && !modifiedTutorialOpen && ["save", "publish"].includes(builderTutorialStage) && !["duplicates", "invalid", "confirmPublish", "confirmSave"].includes(modal) && (
        <ThinkBotTutorial accentColor={quiz ? templateAccent(quiz.template_type) : undefined}
          target={builderTutorialStage === "publish" ? '[data-tutorial="builder-publish"]' : '[data-tutorial="builder-save"]'}
          placement="below"
          dialogWidth={390}
          dragKey="builder-save-publish-dialog"
          highlightMode="target"
        >
          <p>{builderTutorialStage === "save" ? "Save your finished work to continue." : "Your work is saved. Publish it when you are ready to use it in a session."}</p>
        </ThinkBotTutorial>
      )}
      {!guestMode && modifiedTutorialOpen && <ThinkBotTutorial accentColor={quiz ? templateAccent(quiz.template_type) : undefined} target='[data-tutorial="builder-mcq-options"]' placement="screen-right" square dialogWidth={370} actionLabel="Okay!" actionDelay={2000} onAction={() => setModifiedTutorialOpen(false)}><p>For Modified Multiple Choice, you can set images as the answer choices.</p></ThinkBotTutorial>}

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
      {modal === "confirmSave" && (
        <BuilderModal
          tone="blue"
          icon="check"
          title="Save Quiz?"
          message="Save your current quiz questions and settings? You can continue editing after saving."
          onClose={() => setModal(null)}
          ui={ui}
          c={c}
          actions={(
            <>
              <button type="button" className="tw-teacher-text-cancel" onClick={() => setModal(null)}>Cancel</button>
              <TeacherPressButton tone="blue" onClick={async () => { setModal(null); await save(); }}>Yes, save</TeacherPressButton>
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
              <TeacherPressButton data-tutorial="builder-confirm-publish" tone="blue" onClick={confirmPublish}>Yes, publish</TeacherPressButton>
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
      {modal === "duplicates" && (
        <BuilderModal
          tone="yellow"
          icon="warning"
          title="Duplicate Questions Detected"
          onClose={() => { setModal(null); if (builderTutorialStage === "save") setBuilderTutorialStage("save_review"); }}
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
          actions={builderTutorialStage === "save" ? (
            <TeacherPressButton tone="yellow" onClick={() => { setModal(null); setBuilderTutorialStage("save_review"); }}>Review questions</TeacherPressButton>
          ) : (
            <>
              <button style={secondaryBtn(c, dark)} onClick={() => setModal(null)}>Review questions</button>
              <button style={primaryBtn({ bg: `${c.accent}18`, fg: c.accent, border: c.accent })} onClick={async () => {
                setModal(null);
                await _doSave({ showModal: !publishFlow && builderTutorialStage !== "save" });
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
          onClose={() => { setModal(null); if (builderTutorialStage === "save") setBuilderTutorialStage("save_review"); }}
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
          actions={<TeacherPressButton tone="yellow" onClick={() => { setModal(null); if (builderTutorialStage === "save") setBuilderTutorialStage("save_review"); }}>Okay</TeacherPressButton>}
        />
      )}

      {msg && !modal && <BuilderModal
        tone={/failed|error|cannot|only|complete|already/i.test(msg) ? "yellow" : "green"}
        icon={/failed|error|cannot|only|complete|already/i.test(msg) ? "warning" : "check"}
        title={/failed|error|cannot|only|complete|already/i.test(msg) ? "Action needed" : "Updated"}
        message={msg}
        onClose={() => setMsg("")}
        ui={ui}
        c={c}
        autoDismiss={!/failed|error|cannot|only|complete|already/i.test(msg)}
      />}
      {!guestMode && bankOpen && <BankModal templateType={quiz.template_type} onSelect={addFromBank} onClose={() => setBankOpen(false)} ui={ui} c={c} />}
    </>
  );
}
function lightenTutorialColor(hex, amount = 0.32) {
  const value = String(hex || "#2b6cff").replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return hex || "#60a5fa";
  const mix = (channel) => Math.round(channel + (255 - channel) * Math.max(0, Math.min(1, amount)));
  const r = mix(parseInt(value.slice(0, 2), 16));
  const g = mix(parseInt(value.slice(2, 4), 16));
  const b = mix(parseInt(value.slice(4, 6), 16));
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

