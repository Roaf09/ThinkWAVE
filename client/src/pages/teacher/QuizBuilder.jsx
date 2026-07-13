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
import { normalizeTemplateType } from "../../lib/templateTypes";
import { templateLabel, templateTone } from "../../lib/templatePalette";

function normalizeSemanticText(value) {
  // Revision 3: lightweight duplicate detector catches reordered/similar answer wording offline.
  const stopWords = new Set(["a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "have", "in", "is", "it", "its", "of", "on", "or", "that", "the", "these", "this", "to", "was", "were", "what", "which", "who", "whom", "with"]);
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.replace(/(ing|ed|es|s)$/i, ""))
    .filter((word) => word.length > 1 && !stopWords.has(word))
    .sort();
}

function similarity(a, b) {
  const wordsA = normalizeSemanticText(a);
  const wordsB = normalizeSemanticText(b);
  if (wordsA.length === 0 || wordsB.length === 0) return 0;
  const setA = new Set(wordsA);
  const setB = new Set(wordsB);
  const intersection = [...setA].filter((w) => setB.has(w)).length;
  const union = new Set([...setA, ...setB]).size || 1;
  const containment = intersection / Math.min(setA.size, setB.size);
  const jaccard = intersection / union;
  return Math.max(jaccard, containment * 0.9);
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
  switch (normalizeTemplateType(t)) {
    case "MCQ":
      return { options: defaultMcqOptions(c), promptImage: "", mcqMode: "NORMAL" };
    case "TRUE_FALSE":
      return { options: ["True", "False"], promptImage: "" };
    case "MATCHING":
      return {
        colA: [{ text: "", image: "" }],
        colB: [{ text: "", image: "" }],
        dummyB: [{ text: "", image: "" }], // Revision 1: matching requires at least one dummy answer.
      };
    case "GUESS_WORD_4PICS":
      return { images: ["", "", "", ""], dummyLetters: 6, target: "" };
    case "THINK_SPELL":
      return { gridSize: 8, answers: [], minWordLength: 3, pointsPerWord: 1, lengthBonusPerLetter: 1 };
    case "TYPE_ANSWER":
      return { promptImage: "" };
    default:
      return {};
  }
}

function defaultCorrect(t) {
  switch (normalizeTemplateType(t)) {
    case "MCQ":
    case "TRUE_FALSE":
      return { choice: "" };
    case "MATCHING":
      return { pairs: [{ aIndex: 0, bIndex: 0 }] };
    case "THINK_SPELL":
      return { text: "", answers: [] };
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
    points: 1,
  };
}

function trimText(v) {
  return String(v || "").trim();
}

function clampQuestionPoints(value, max = 3) {
  // Revision 3: cap per-question points at 1 to 3.
  return Math.min(max, Math.max(1, Number(value) || 1));
}

function displayTemplateName(value) {
  return templateLabel(value);
}

function reorderList(list, from, to) {
  // Revision 1: reusable drag/drop ordering for choices and image cards.
  const next = [...(Array.isArray(list) ? list : [])];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function answerLabel(option) {
  return trimText(option?.text) || trimText(option?.label) || trimText(option?.image);
}

function hasDuplicateRows(rows) {
  // Revision 3: duplicate choices are detected by exact image match or similar text meaning.
  const list = (rows || []).map(answerLabel).filter(Boolean);
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const a = list[i];
      const b = list[j];
      const imageLike = /^data:image\//.test(a) || /^https?:\/\//.test(a) || /^data:image\//.test(b) || /^https?:\/\//.test(b);
      if (imageLike && trimText(a).toLowerCase() === trimText(b).toLowerCase()) return true;
      if (!imageLike && similarity(a, b) >= 0.72) return true;
    }
  }
  return false;
}

function hasDuplicateTextValues(values) {
  return hasDuplicateRows((values || []).map((text) => ({ text })));
}

function newChoiceId() {
  return `choice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultMcqOptions(category) {
  const count = category === "K12" ? 3 : 4;
  return Array.from({ length: count }, () => ({ id: newChoiceId(), text: "", image: "" }));
}

function defaultMcqImageOptions() {
  // Revision 4: Modified MCQ uses exactly four image-only answer choices.
  return Array.from({ length: 4 }, () => ({ id: newChoiceId(), text: "", image: "" }));
}

function normalizeChoiceOption(option, index = 0) {
  if (option && typeof option === "object") {
    return {
      id: String(option.id || `option-${index + 1}`),
      text: option.text ?? option.label ?? "",
      image: option.image ?? "",
    };
  }
  return { id: `option-${index + 1}`, text: String(option ?? ""), image: "" };
}

function normalizeChoiceOptions(options, category) {
  const fallback = defaultMcqOptions(category);
  const source = Array.isArray(options) && options.length ? options : fallback;
  return source.map(normalizeChoiceOption);
}

function choiceHasContent(option) {
  return !!(trimText(option?.text) || trimText(option?.image));
}

function choiceMatchesValue(option, value) {
  const selected = trimText(value).toLowerCase();
  if (!selected) return false;
  return [option?.id, option?.text].some((v) => trimText(v).toLowerCase() === selected);
}

function choiceDisplay(option, fallback = "Choice") {
  return trimText(option?.text) || (trimText(option?.image) ? "Image choice" : fallback);
}

function supportsExplanationFields(templateType) {
  return ["MCQ", "TRUE_FALSE", "TYPE_ANSWER"].includes(normalizeTemplateType(templateType));
}

function hasAnswerKey(q, templateType) {
  const tt = normalizeTemplateType(templateType);
  const cor = q?.correct || {};
  if (tt === "MCQ") return !!((Array.isArray(cor.choices) && cor.choices.length) || trimText(cor.choice));
  if (tt === "TRUE_FALSE") return !!trimText(cor.choice);
  if (tt === "TYPE_ANSWER") return !!trimText(cor.text);
  return false;
}

function difficultyLabel(value) {
  const v = String(value || "medium").toLowerCase();
  if (["easy", "medium", "hard"].includes(v)) return v;
  return "medium";
}

function normalizeMatchingPayload(config, correct) {
  const cfg = config || {};
  const cor = correct || {};
  const colA = Array.isArray(cfg.colA) ? cfg.colA.map((item) => ({ text: item?.text || "", image: item?.image || "" })) : [];
  const rawB = Array.isArray(cfg.colB) ? cfg.colB.map((item) => ({ text: item?.text || "", image: item?.image || "" })) : [];
  const pairMap = new Map((Array.isArray(cor.pairs) ? cor.pairs : []).map((pair) => [Number(pair?.aIndex), Number(pair?.bIndex)]));
  const pairedB = colA.length ? colA.map((_, index) => rawB[pairMap.get(index)] || rawB[index] || { text: "", image: "" }) : rawB;
  const dummyB = Array.isArray(cfg.dummyB) ? cfg.dummyB.map((item) => ({ text: item?.text || "", image: item?.image || "" })) : rawB.slice(colA.length);
  return {
    config: { ...cfg, colA, colB: [...pairedB, ...dummyB], dummyB: dummyB.length ? dummyB : [{ text: "", image: "" }] },
    correct: { ...cor, pairs: colA.map((_, i) => ({ aIndex: i, bIndex: i })) },
  };
}

function validateQuestion(q, templateType) {
  const tt = normalizeTemplateType(templateType);
  const issues = [];
  if (!trimText(q.prompt)) issues.push("prompt is empty");

  const cfg = q.config || {};
  const cor = q.correct || {};

  if (tt === "MCQ") {
    const isModifiedMcq = cfg.mcqMode === "MODIFIED";
    const opts = isModifiedMcq ? normalizeChoiceOptions(cfg.options, q.category).slice(0, 4) : normalizeChoiceOptions(cfg.options, q.category);
    const correctChoices = Array.isArray(cor.choices) && cor.choices.length ? cor.choices : [cor.choice].filter(Boolean);
    if (isModifiedMcq && opts.length !== 4) issues.push("modified MCQ needs exactly 4 image choices");
    if (isModifiedMcq && opts.some((opt) => !trimText(opt?.image))) issues.push("modified MCQ needs an image for all 4 choices");
    if (!isModifiedMcq && opts.some((opt) => !choiceHasContent(opt))) issues.push("one or more choices are empty");
    if (opts.some((opt) => trimText(opt?.text).length > 255)) issues.push("choices must be 255 characters or fewer");
    if (!isModifiedMcq && opts.filter(choiceHasContent).length < 2) issues.push("needs at least 2 completed choices");
    if (!correctChoices.length || correctChoices.some((choice) => !opts.some((opt) => choiceMatchesValue(opt, choice)))) issues.push("correct answer is not selected");
    if (cfg.answerMode === "TWO" && correctChoices.length !== 2) issues.push("two-answer mode needs exactly 2 correct answers");
    if (hasDuplicateRows(opts)) issues.push("choices must be unique — remove duplicate options");
  }

  if (tt === "TRUE_FALSE") {
    if (!trimText(cor.choice)) issues.push("correct answer is not selected");
  }

  if (["TYPE_ANSWER", "DRAW_IT", "GRIP_GUESS"].includes(tt)) {
    if (!trimText(cor.text)) issues.push("correct answer is empty");
    if (trimText(cor.text).length > 255) issues.push("answer must be 255 characters or fewer");
  }

  if (tt === "THINK_SPELL") {
    const answers = Array.isArray(cor.answers) && cor.answers.length
      ? cor.answers
      : Array.isArray(cfg.answers)
        ? cfg.answers
        : [cor.horizontal, cor.vertical, cor.diagonal, cor.text];
    const cleaned = answers
      .map((w) => trimText(w))
      .filter(Boolean);
    if (!cleaned.length) issues.push("answer set is empty");
    if (hasDuplicateTextValues(cleaned)) issues.push("answers must be unique — remove duplicate or similar words");
    for (const word of cleaned) {
      if (word.length > 255) issues.push(`"${word}" must be 255 characters or fewer`);
      if (!/^[A-Za-z\s-]+$/.test(word)) issues.push(`"${word}" should use letters only (spaces allowed)`);
      const normalized = word.toUpperCase().replace(/[^A-Z]/g, "");
      if (!normalized.length) issues.push(`"${word}" must contain at least 1 letter`);
    }

    const size = Number(cfg.gridSize ?? 7);
    if (Number.isFinite(size) && size >= 5 && size <= 12) {
      for (const word of cleaned) {
        const normalized = word.toUpperCase().replace(/[^A-Z]/g, "");
        if (normalized.length > size) issues.push(`"${word}" is too long for the grid size`);
      }
    }
    if (!Number.isFinite(size) || size < 5 || size > 12) issues.push("grid size must be between 5 and 12");
  }

  if (tt === "GUESS_WORD_4PICS") {
    const images = Array.isArray(cfg.images) ? cfg.images : [];
    if (images.length < 4 || images.some((src) => !trimText(src))) issues.push("all 4 image clues must be filled");
    if (hasDuplicateRows(images.map((image) => ({ image })))) issues.push("image choices must be unique");
    const word = trimText(cor.text || cfg.target);
    if (!word) issues.push("correct word is empty");
    if (word.length > 255) issues.push("correct word must be 255 characters or fewer");
    if (!/^[A-Za-z0-9\s-]+$/.test(word)) issues.push("correct word should use letters only (spaces allowed)");
    const dummy = Number(cfg.dummyLetters ?? 6);
    if (!Number.isFinite(dummy) || dummy < 0 || dummy > 12) issues.push("extra letter count must be between 0 and 12");
  }

  if (tt === "MATCHING") {
    const colA = Array.isArray(cfg.colA) ? cfg.colA : [];
    const colB = Array.isArray(cfg.colB) ? cfg.colB : [];
    const dummyB = Array.isArray(cfg.dummyB) ? cfg.dummyB : colB.slice(colA.length);
    const pairs = Array.isArray(cor.pairs) ? cor.pairs : [];
    const usedB = new Set();
    if (colA.length === 0 || colB.length < colA.length + 1) issues.push("matching needs all pairs plus at least one dummy answer");
    if (dummyB.length < 1 || dummyB.length > 2) issues.push("matching dummy answers must be minimum 1 and maximum 2");
    if (colA.some((item) => !(trimText(item?.text) || trimText(item?.image)))) issues.push("one or more column A items are empty");
    if (colB.some((item) => !(trimText(item?.text) || trimText(item?.image)))) issues.push("one or more column B items are empty");
    if ([...colA, ...colB].some((item) => trimText(item?.text).length > 255)) issues.push("matching labels must be 255 characters or fewer");
    if (pairs.length !== colA.length) issues.push("correct matches are not set");
    if (hasDuplicateRows(colA)) issues.push("column A has duplicate labels or images — each term must be unique");
    if (hasDuplicateRows(colB)) issues.push("column B has duplicate entries — each match/dummy must be unique");
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
export default function QuizBuilder({ guestMode = false } = {}) {
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

  useEffect(() => {
    if (!["saved", "published", "bankSaved"].includes(modal)) return;
    const t = setTimeout(() => setModal(null), 2000);
    return () => clearTimeout(t);
  }, [modal]);

  const load = useCallback(async () => {
    const { data } = await api.get(`/quizzes/${id}`);
    setQuiz({ ...data.quiz, template_type: normalizeTemplateType(data.quiz.template_type) });
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
            shuffleColA: !!settings.randomizeQuestions,
          }
        : {};
      const supportExtra = supportsExplanationFields(quiz?.template_type) && hasAnswerKey(q, quiz?.template_type)
        ? { difficulty: difficultyLabel(q.config?.difficulty) }
        : {};
      return {
        ...q,
        order: idx,
        config: {
          ...q.config,
          ...extra,
          ...supportExtra,
          timeLimitSec: q.timeLimitSec,
          // Revision 3: every template now stores points per individual question, capped at 3.
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
      setTimeout(() => navigate(builderHomePath), 1800);
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
  const promptMaxLength = guestMode ? 120 : 255;
  const builderHomePath = guestMode ? "/guest" : "/teacher";

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
            <button style={ui.ghostBtn} onClick={() => navigate(builderHomePath)}>← Back</button>
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
                    {guestMode ? "Guest Builder · " : ""}{displayTemplateName(quiz.template_type)} · {quiz.category} · {quiz.status}
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
            {!guestMode && <button style={ui.secondaryBtn} onClick={() => setBankOpen(true)}>Add from Bank</button>}
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
                    {!guestMode && (
                      <button style={{ ...ui.secondaryBtn, padding: "7px 12px", fontSize: 12 }} disabled={validateQuestion(currentQ, quiz.template_type).length > 0} onClick={() => setModal("confirmBank")}>
                        Save to Bank
                      </button>
                    )}
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
                    <div style={ui.metaLabel}>⭐ Points</div>
                    <div style={ui.metaRow}>
                      <input
                        type="number"
                        min={1}
                        max={3}
                        value={currentQ.points ?? 1}
                        onChange={(e) => updateQ({
                          // Revision 3: all templates use per-question points from 1 to 3.
                          points: clampQuestionPoints(e.target.value, 3),
                        })}
                        style={ui.metaInput}
                      />
                      <span style={ui.metaSuffix}>per question</span>
                    </div>
                  </div>
                </div>

                <label style={ui.fieldLabel}>
                  Prompt
                  <span style={{ fontSize: 11, opacity: 0.55, marginLeft: 8 }}>{(currentQ.prompt || "").length}/{promptMaxLength}</span>
                </label>
                <textarea rows={4} maxLength={promptMaxLength} value={currentQ.prompt} onChange={(e) => updateQ({ prompt: e.target.value.slice(0, promptMaxLength) })} style={ui.textarea} />
                <div style={{ marginTop: 10, marginBottom: 16 }}>
                  <MediaInput
                    label="Question image (optional)"
                    value={currentQ.config?.promptImage || ""}
                    placeholder="Image URL for this question"
                    onChange={(value) => updateQ({ config: { ...(currentQ.config || {}), promptImage: value } })}
                    ui={ui}
                    c={c}
                  />
                </div>

                <TemplateEditor templateType={quiz.template_type} category={quiz.category} q={currentQ} onChange={updateQ} ui={ui} c={c} guestMode={guestMode} />
                {supportsExplanationFields(quiz.template_type) && hasAnswerKey(currentQ, quiz.template_type) && (
                  <QuestionSupportFields q={currentQ} onChange={updateQ} ui={ui} c={c} />
                )}
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
      <div style={{ ...ui.modalCard, maxWidth: 680, maxHeight: "78vh", overflowY: "auto", textAlign: "left" }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0, color: c.text }}>Add from Question Bank</h3>
        <p style={{ fontSize: 13, color: c.textMuted, marginTop: -8, marginBottom: 16 }}>Template: <b>{templateType}</b></p>
        {loading && <p style={{ color: c.textMuted }}>Loading…</p>}
        {!loading && questions.length === 0 && <p style={{ color: c.textMuted }}>No saved questions for this template.</p>}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {questions.map((q) => <BankQuestionCard key={q.id} q={q} onSelect={onSelect} ui={ui} c={c} />)}
        </div>
        <div style={{ marginTop: 16 }}><button style={ui.secondaryBtn} onClick={onClose}>Cancel</button></div>
      </div>
    </div>
  );
}

function BankQuestionCard({ q, onSelect, ui, c }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = safeJson(q.config_json) || q.config_json || {};
  const cor = safeJson(q.correct_json) || q.correct_json || {};
  return (
    <div style={{ background: c.cardBg2, border: `1px solid ${c.border}`, borderRadius: 16, padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 6, flexWrap: "wrap" }}><span style={{ ...ui.badge, background: c.pageBg, color: c.text }}>{q.template_type}</span></div>
          <div style={{ fontWeight: 800, fontSize: 14, color: c.text, lineHeight: 1.45 }}>{q.prompt}</div>
        </div>
        <button type="button" style={{ ...ui.primaryBtn, padding: "8px 13px", fontSize: 12 }} onClick={() => onSelect(q)}>Use Question</button>
      </div>
      <BankQuestionPreview templateType={q.template_type} cfg={cfg} cor={cor} expanded={expanded} setExpanded={setExpanded} ui={ui} c={c} />
    </div>
  );
}

function MiniImage({ src, c, label = "Image" }) {
  return src ? <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : <div style={{ display: "grid", placeItems: "center", height: "100%", color: c.textMuted, fontSize: 11, fontWeight: 800 }}>{label}</div>;
}

function BankQuestionPreview({ templateType, cfg, cor, expanded, setExpanded, ui, c }) {
  const tt = normalizeTemplateType(templateType);
  const previewWrap = { marginTop: 12, border: `1px solid ${c.border}`, borderRadius: 14, background: c.cardBg, padding: 12 };
  const answerBox = { marginTop: 10, padding: "9px 11px", borderRadius: 12, background: `${c.accent}12`, border: `1px solid ${c.accent}40`, color: c.text, fontSize: 13, fontWeight: 800 };

  if (tt === "MCQ") {
    const opts = normalizeChoiceOptions(cfg.options, "");
    const raw = Array.isArray(cor.choices) && cor.choices.length ? cor.choices : [cor.choice].filter(Boolean);
    const corrects = raw.filter(Boolean);
    return (
      <div style={previewWrap}>
        <div style={{ display: "grid", gap: 8 }}>
          {opts.map((opt, i) => {
            const correct = corrects.some((choice) => choiceMatchesValue(opt, choice));
            return <div key={opt.id || i} style={{ display: "grid", gridTemplateColumns: "32px 1fr auto", gap: 8, alignItems: "center", border: `1px solid ${correct ? c.accent : c.border}`, borderRadius: 12, padding: "8px 10px", background: correct ? `${c.accent}10` : c.cardBg2 }}><span style={{ ...ui.badge, justifyContent: "center", background: c.pageBg, color: c.text }}>{String.fromCharCode(65 + i)}</span><span style={{ color: c.text, fontWeight: correct ? 900 : 650 }}>{choiceDisplay(opt, `Choice ${i + 1}`)}</span>{correct && <span style={{ ...ui.badge, background: c.greenBg, color: c.greenFg }}>Correct</span>}</div>;
          })}
        </div>
        <div style={answerBox}>Correct answer{corrects.length > 1 ? "s" : ""}: {corrects.map((choice) => choiceDisplay(opts.find((opt) => choiceMatchesValue(opt, choice)), choice)).join(" + ")}</div>
      </div>
    );
  }

  if (tt === "TRUE_FALSE") return <div style={previewWrap}><div style={answerBox}>Correct answer: {trimText(cor.choice) || "Not set"}</div></div>;
  if (tt === "TYPE_ANSWER") return <div style={previewWrap}><div style={answerBox}>Correct answer: {trimText(cor.text) || "Not set"}</div></div>;

  if (tt === "MATCHING") {
    const colA = Array.isArray(cfg.colA) ? cfg.colA : [];
    const colB = Array.isArray(cfg.colB) ? cfg.colB : [];
    const pairs = Array.isArray(cor.pairs) && cor.pairs.length ? cor.pairs : colA.map((_, i) => ({ aIndex: i, bIndex: i }));
    const needsExpand = colA.length >= 3;
    const visible = needsExpand && !expanded ? pairs.slice(0, 2) : pairs;
    return (
      <div style={previewWrap}>
        <div style={{ display: "grid", gap: 8 }}>
          {visible.map((pair, i) => {
            const left = colA[Number(pair.aIndex)] || colA[i] || {};
            const right = colB[Number(pair.bIndex)] || colB[i] || {};
            return <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 8, alignItems: "center", color: c.text, fontSize: 13, fontWeight: 750 }}><span style={{ padding: 9, borderRadius: 10, background: c.cardBg2 }}>{answerLabel(left) || `Pair ${i + 1} A`}</span><span style={{ color: c.textMuted }}>⇄</span><span style={{ padding: 9, borderRadius: 10, background: c.cardBg2 }}>{answerLabel(right) || `Pair ${i + 1} B`}</span></div>;
          })}
        </div>
        {needsExpand && <button type="button" style={{ ...ui.ghostBtn, marginTop: 10, padding: "7px 10px", fontSize: 12 }} onClick={() => setExpanded(!expanded)}>{expanded ? "Show less" : `Expand ${pairs.length} pairs`}</button>}
      </div>
    );
  }

  if (tt === "GUESS_WORD_4PICS") {
    const images = Array.isArray(cfg.images) ? cfg.images.slice(0, 4) : [];
    while (images.length < 4) images.push("");
    return (
      <div style={previewWrap}>
        <div style={{ width: 156, display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6 }}>
          {images.map((src, i) => <div key={i} style={{ height: 72, borderRadius: 10, overflow: "hidden", background: c.cardBg2, border: `1px solid ${c.border}` }}><MiniImage src={src} c={c} label={`Pic ${i + 1}`} /></div>)}
        </div>
        <div style={answerBox}>Correct answer: {trimText(cor.text || cfg.target) || "Not set"}</div>
      </div>
    );
  }

  if (tt === "THINK_SPELL") {
    const answers = (Array.isArray(cor.answers) && cor.answers.length ? cor.answers : Array.isArray(cfg.answers) ? cfg.answers : []).map(trimText).filter(Boolean);
    const gridSize = Math.min(12, Math.max(5, Number(cfg.gridSize || 8) || 8));
    const needsExpand = gridSize >= 8 || answers.length > 5;
    const visibleAnswers = needsExpand && !expanded ? answers.slice(0, 5) : answers;
    const cells = Array.from({ length: Math.min(gridSize * gridSize, expanded ? 144 : 64) });
    return (
      <div style={previewWrap}>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ width: expanded ? 220 : 156, display: "grid", gridTemplateColumns: `repeat(${gridSize}, 1fr)`, gap: 2, padding: 8, borderRadius: 12, border: `1px solid ${c.border}`, background: c.cardBg2, overflow: "auto", maxHeight: expanded ? 240 : 178 }}>
            {cells.map((_, i) => <span key={i} style={{ aspectRatio: "1", borderRadius: 4, background: `${c.accent}18`, display: "block" }} />)}
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ color: c.text, fontWeight: 900, marginBottom: 8 }}>{gridSize}×{gridSize} letter grid</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{visibleAnswers.map((word, i) => <span key={`${word}-${i}`} style={{ ...ui.badge, background: c.pageBg, color: c.text }}>{word}</span>)}</div>
            <div style={answerBox}>Typed answers: {answers.length ? answers.join(", ") : "Not set"}</div>
          </div>
        </div>
        {needsExpand && <button type="button" style={{ ...ui.ghostBtn, marginTop: 10, padding: "7px 10px", fontSize: 12 }} onClick={() => setExpanded(!expanded)}>{expanded ? "Show less" : "Expand large grid"}</button>}
      </div>
    );
  }

  return null;
}

/**
 * ThinkSpellEditor — isolated sub-component so useState for rawText is
 * scoped here.  Parent passes `key={q.order}` so this unmounts/remounts
 * (resetting rawText) whenever the teacher navigates to a different question.
 *
 * Fix: previously the textarea had value={answersText} where answersText was
 * derived by immediately parsing cor.answers.  Every keystroke triggered a
 * re-parse that stripped any trailing comma+space, making it impossible to
 * type more than the first answer word.  Now rawText is the local source of
 * truth while the user is typing; only the parsed array is sent upstream.
 */
function ThinkSpellEditor({ cor, cfg, onChange, ui, c, maxWords = null }) {
  const initText = (
    Array.isArray(cor.answers) && cor.answers.length
      ? cor.answers
      : [cor.horizontal, cor.vertical, cor.diagonal, cor.text].filter(Boolean)
  ).join(", ");

  const [rawText, setRawText] = useState(initText);

  function handleAnswersChange(e) {
    const next = e.target.value;
    setRawText(next);
    const parsed = next
      .split(",")
      .map((w) => trimText(w))
      .filter(Boolean);
    const limited = maxWords ? parsed.slice(0, maxWords) : parsed;
    onChange({ correct: { ...cor, answers: limited }, config: { ...cfg, answers: limited } });
  }

  return (
    <div style={ui.innerCard}>
      <h4 style={ui.innerTitle}>Think &amp; Spell</h4>

      <label style={ui.smallLabel}>Valid words (comma or space separated)</label>
      <textarea
        rows={3}
        maxLength={1000}
        value={rawText}
        placeholder="cat, dog, bird, fish, crab"
        onChange={handleAnswersChange}
        style={ui.textarea}
      />
      <div style={{ color: c.textMuted, fontSize: 11, marginTop: 4 }}>
        Students earn points for each word they find in the letter grid before time runs out.
        {maxWords ? ` Guest quizzes can use up to ${maxWords} words.` : ""}
      </div>

      <label style={{ ...ui.smallLabel, marginTop: 12, display: "block" }}>Grid size</label>
      <input
        type="number"
        min={5}
        max={12}
        value={Number(cfg.gridSize ?? 8)}
        onChange={(e) =>
          onChange({
            config: {
              ...cfg,
              gridSize: Math.min(12, Math.max(5, Number(e.target.value) || 8)),
              answers: Array.isArray(cor.answers) ? cor.answers : [],
            },
          })
        }
        style={{ ...ui.smallInput, width: 110 }}
      />

      <label style={{ ...ui.smallLabel, marginTop: 12, display: "block" }}>Minimum word length</label>
      <input
        type="number"
        min={2}
        max={8}
        value={Number(cfg.minWordLength ?? 3)}
        onChange={(e) =>
          onChange({
            config: {
              ...cfg,
              minWordLength: Math.min(8, Math.max(2, Number(e.target.value) || 3)),
            },
          })
        }
        style={{ ...ui.smallInput, width: 110 }}
      />

      <label style={{ ...ui.smallLabel, marginTop: 12, display: "block" }}>Points per word</label>
      <input
        type="number"
        min={1}
        max={20}
        value={Number(cfg.pointsPerWord ?? 1)}
        onChange={(e) =>
          onChange({
            config: {
              ...cfg,
              pointsPerWord: Math.min(20, Math.max(1, Number(e.target.value) || 1)),
            },
          })
        }
        style={{ ...ui.smallInput, width: 110 }}
      />

      <label style={{ ...ui.smallLabel, marginTop: 12, display: "block" }}>Bonus per extra letter</label>
      <input
        type="number"
        min={0}
        max={10}
        value={Number(cfg.lengthBonusPerLetter ?? 1)}
        onChange={(e) =>
          onChange({
            config: {
              ...cfg,
              lengthBonusPerLetter: Math.min(10, Math.max(0, Number(e.target.value) || 0)),
            },
          })
        }
        style={{ ...ui.smallInput, width: 110 }}
      />
      <div style={{ color: c.textMuted, fontSize: 12, marginTop: 8 }}>
        Bookworm-style play: students chain adjacent letters, tiles refill after each word, longer words and combos earn more points.
        Words can be found in any order; same letters as your word count (grid path order may differ).
      </div>
    </div>
  );
}

function MediaInput({ label, value, placeholder, onChange, ui, c }) {
  async function handleFile(file) {
    if (!file || !/^image\//.test(file.type || "")) return;
    const optimized = await compressImageFile(file);
    if (optimized) onChange(optimized);
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {label ? <label style={ui.smallLabel}>{label}</label> : null}
      <div style={{ display: "grid", gridTemplateColumns: value ? "104px 1fr" : "1fr", gap: 10, alignItems: "stretch" }}>
        {value ? (
          <div style={{ position: "relative", minHeight: 82, borderRadius: 12, overflow: "hidden", border: `1px solid ${c.border}`, background: c.cardBg2 }}>
            <img src={value} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            <button
              type="button"
              onClick={() => onChange("")}
              style={{ position: "absolute", top: 6, right: 6, width: 24, height: 24, borderRadius: 999, border: "none", background: "rgba(15,23,42,0.78)", color: "#fff", fontWeight: 900, cursor: "pointer" }}
            >
              x
            </button>
          </div>
        ) : null}
        <div style={{ display: "grid", gap: 8 }}>
          <input
            maxLength={6000}
            value={value || ""}
            placeholder={placeholder || "Image URL or uploaded image"}
            onChange={(e) => onChange(e.target.value)}
            style={ui.input}
          />
          <label
            style={{
              ...ui.secondaryBtn,
              textAlign: "center",
              padding: "9px 12px",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Upload image
            <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handleFile(e.target.files?.[0])} />
          </label>
        </div>
      </div>
    </div>
  );
}

function TemplateEditor({ templateType, category, q, onChange, ui, c, guestMode = false }) {
  const [showMatchingSuggest, setShowMatchingSuggest] = useState(false);
  const tt = normalizeTemplateType(templateType);
  const cfg = q.config || {};
  const cor = q.correct || {};

  if (tt === "MCQ") {
    const mcqMode = guestMode ? "NORMAL" : (cfg.mcqMode === "MODIFIED" ? "MODIFIED" : "NORMAL");
    const baseOptions = normalizeChoiceOptions(cfg.options, category);
    const opts = mcqMode === "MODIFIED"
      ? [...baseOptions, ...defaultMcqImageOptions()].slice(0, 4).map((opt, index) => ({ ...opt, id: opt.id || `image-option-${index + 1}`, text: "" }))
      : baseOptions;
    const MIN = mcqMode === "MODIFIED" ? 4 : 2;
    const MAX = mcqMode === "MODIFIED" ? 4 : 5;
    // Revision 5: Modified MCQ requires only one image answer, so two-answer mode is disabled.
    const answerMode = mcqMode === "MODIFIED" ? "ONE" : (cfg.answerMode === "TWO" ? "TWO" : "ONE");
    const rawCorrect = Array.isArray(cor.choices) && cor.choices.length ? cor.choices : [cor.choice].filter(Boolean);
    const correctChoices = (answerMode === "TWO" ? rawCorrect.slice(0, 2) : rawCorrect.slice(0, 1)).filter(Boolean);
    function emitOptions(nextOptions, nextCorrect = cor, extraConfig = {}) {
      onChange({ config: { ...cfg, ...extraConfig, options: nextOptions, answerMode, mcqMode }, correct: nextCorrect });
    }

    function setMcqMode(nextMode) {
      // Revision 4: MCQ has Normal mode and Modified image-choice mode.
      const nextOptions = nextMode === "MODIFIED"
        ? [...opts, ...defaultMcqImageOptions()].slice(0, 4).map((opt) => ({ id: opt.id || newChoiceId(), text: "", image: opt.image || "" }))
        : (Array.isArray(cfg.options) && cfg.options.length ? cfg.options.map(normalizeChoiceOption) : defaultMcqOptions(category));
      const kept = correctChoices.filter((choice) => nextOptions.some((row) => choiceMatchesValue(row, choice) && (nextMode !== "MODIFIED" || trimText(row.image))));
      const nextAnswerMode = nextMode === "MODIFIED" ? "ONE" : answerMode;
      const nextCorrect = nextAnswerMode === "TWO"
        ? { ...cor, choice: kept[0] || "", choices: kept.slice(0, 2) }
        : { ...cor, choice: kept[0] || "", choices: kept[0] ? [kept[0]] : [] };
      onChange({ config: { ...cfg, mcqMode: nextMode, options: nextOptions, answerMode: nextAnswerMode }, correct: nextCorrect, points: clampQuestionPoints(q.points, 3) });
    }

    function setAnswerMode(nextMode) {
      if (mcqMode === "MODIFIED" && nextMode === "TWO") return;
      // Revision 1: teacher can switch between one-answer and two-answer MCQ scoring.
      const nextCorrect = nextMode === "TWO"
        ? { ...cor, choices: correctChoices.slice(0, 2), choice: correctChoices[0] || "" }
        : { ...cor, choice: correctChoices[0] || "", choices: correctChoices[0] ? [correctChoices[0]] : [] };
      onChange({ config: { ...cfg, options: opts, answerMode: nextMode, mcqMode }, correct: nextCorrect, points: clampQuestionPoints(q.points, 3) });
    }

    function toggleCorrect(opt) {
      const value = opt.id;
      const canSelect = mcqMode === "MODIFIED" ? !!trimText(opt?.image) : choiceHasContent(opt);
      if (!canSelect) return;
      if (answerMode === "ONE") {
        onChange({ correct: { ...cor, choice: value, choices: [value] } });
        return;
      }
      const exists = correctChoices.some((choice) => choiceMatchesValue(opt, choice));
      const nextChoices = exists ? correctChoices.filter((choice) => !choiceMatchesValue(opt, choice)) : [...correctChoices, value].slice(0, 2);
      onChange({ correct: { ...cor, choice: nextChoices[0] || "", choices: nextChoices } });
    }

    function reorderOption(from, to) {
      if (from === to) return;
      emitOptions(reorderList(opts, from, to));
    }

    const selectedOpt = opts.find((opt) => correctChoices.some((choice) => choiceMatchesValue(opt, choice)));
    return (
      <div style={ui.innerCard}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 12, flexWrap: "wrap" }}>
          <h4 style={ui.innerTitle}>
            Multiple Choice <span style={ui.innerMeta}>({mcqMode === "MODIFIED" ? "4 image choices" : `${opts.length}, min ${MIN}/max ${MAX}`})</span>
          </h4>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {!guestMode && <>
              <button type="button" style={{ ...ui.secondaryBtn, padding: "4px 10px", fontSize: 12, borderColor: mcqMode === "NORMAL" ? c.accent : c.border }} onClick={() => setMcqMode("NORMAL")}>Normal</button>
              <button type="button" style={{ ...ui.secondaryBtn, padding: "4px 10px", fontSize: 12, borderColor: mcqMode === "MODIFIED" ? c.accent : c.border }} onClick={() => setMcqMode("MODIFIED")}>Modified</button>
            </>}
            <button type="button" style={{ ...ui.secondaryBtn, padding: "4px 10px", fontSize: 12, borderColor: answerMode === "ONE" ? c.accent : c.border }} onClick={() => setAnswerMode("ONE")}>1 answer</button>
            <button
              type="button"
              disabled={mcqMode === "MODIFIED"}
              style={{
                ...ui.secondaryBtn,
                padding: "4px 10px",
                fontSize: 12,
                borderColor: answerMode === "TWO" ? c.accent : c.border,
                opacity: mcqMode === "MODIFIED" ? 0.38 : 1,
                cursor: mcqMode === "MODIFIED" ? "not-allowed" : "pointer",
                transition: "opacity 0.2s ease, border-color 0.2s ease",
              }}
              onClick={() => setAnswerMode("TWO")}
            >
              2 answers
            </button>
            {mcqMode === "NORMAL" && !guestMode && (
              <>
                <button
                  style={{ ...ui.secondaryBtn, padding: "4px 10px", fontSize: 12 }}
                  disabled={opts.length <= MIN}
                  onClick={() => {
                    const next = opts.slice(0, -1);
                    const kept = correctChoices.filter((choice) => next.some((row) => choiceMatchesValue(row, choice)));
                    emitOptions(next, { ...cor, choice: kept[0] || "", choices: kept });
                  }}
                >
                  − Delete Choice
                </button>
                <button
                  style={{ ...ui.secondaryBtn, padding: "4px 10px", fontSize: 12 }}
                  onClick={() => {
                    if (opts.length >= MAX) setShowMatchingSuggest(true);
                    else emitOptions([...opts, { id: newChoiceId(), text: "", image: "" }]);
                  }}
                >
                  ＋ Add Choice
                </button>
              </>
            )}
          </div>
        </div>

        <div style={{ fontSize: 12, color: c.textMuted, marginBottom: 10 }}>
          {mcqMode === "MODIFIED"
            ? "Modified mode uses exactly 4 image choices. Upload images, then mark the correct image answer."
            : <>Drag choices to reorder. Mark {answerMode === "TWO" ? "exactly two" : "one"} correct answer{answerMode === "TWO" ? "s" : ""}.</>}
        </div>

        <div
          style={{
            // Revision 5: Modified MCQ uses a 4 Pics-style 2x2 image layout in the builder.
            display: "grid",
            gridTemplateColumns: mcqMode === "MODIFIED" ? "repeat(2, minmax(0, 1fr))" : "1fr",
            gap: mcqMode === "MODIFIED" ? 14 : 10,
          }}
        >
          {opts.map((opt, i) => {
            const hasContent = mcqMode === "MODIFIED" ? !!trimText(opt.image) : choiceHasContent(opt);
            const isCorrect = correctChoices.some((choice) => choiceMatchesValue(opt, choice)) && hasContent;
            const letter = String.fromCharCode(65 + i);
            return (
              <div
                key={opt.id || i}
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/plain", String(i))}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => reorderOption(Number(e.dataTransfer.getData("text/plain")), i)}
                style={{
                  display: "flex",
                  flexDirection: mcqMode === "MODIFIED" ? "column" : "row",
                  gap: mcqMode === "MODIFIED" ? 12 : 10,
                  alignItems: mcqMode === "MODIFIED" ? "stretch" : "center",
                  padding: mcqMode === "MODIFIED" ? "14px" : "10px 12px",
                  borderRadius: mcqMode === "MODIFIED" ? 18 : 14,
                  border: `2px solid ${isCorrect ? c.accent : c.border}`,
                  background: isCorrect ? `${c.accent}12` : c.cardBg,
                  transition: "all 0.18s ease",
                  cursor: "grab",
                }}
              >
                <button
                  type="button"
                  title="Mark as correct answer"
                  onClick={() => toggleCorrect(opt)}
                  disabled={!hasContent}
                  style={{
                    flexShrink: 0,
                    width: 22,
                    height: 22,
                    borderRadius: answerMode === "TWO" ? 6 : "50%",
                    border: `2px solid ${isCorrect ? c.accent : c.textMuted}`,
                    background: isCorrect ? c.accent : "transparent",
                    cursor: hasContent ? "pointer" : "not-allowed",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 0,
                    transition: "all 0.18s ease",
                  }}
                >
                  {isCorrect && <span style={{ color: "#fff", fontSize: 12, fontWeight: 900, lineHeight: 1 }}>✓</span>}
                </button>
                <span style={{ ...ui.badge, background: c.yellowBg, color: c.yellowFg, flexShrink: 0 }}>{letter}</span>
                <div style={{ display: "grid", gap: 8, flex: 1, width: mcqMode === "MODIFIED" ? "100%" : undefined }}>
                  {mcqMode === "NORMAL" && (
                    <input
                      maxLength={guestMode ? 120 : 255}
                      value={opt.text}
                      placeholder={`Option ${letter} text`}
                      onChange={(e) => {
                        const next = opts.map((row, idx) => (idx === i ? { ...row, text: e.target.value.slice(0, guestMode ? 120 : 255) } : row));
                        emitOptions(next);
                      }}
                      style={{ ...ui.input, margin: 0 }}
                    />
                  )}
                  <MediaInput
                    value={opt.image}
                    placeholder={`Option ${letter} image URL`}
                    onChange={(value) => {
                      // Revision 4: Modified MCQ image choices are uploaded/selected directly as answers.
                      const next = opts.map((row, idx) => (idx === i ? { ...row, image: value, text: mcqMode === "MODIFIED" ? "" : row.text } : row));
                      const kept = correctChoices.filter((choice) => next.some((row) => choiceMatchesValue(row, choice) && (mcqMode !== "MODIFIED" || trimText(row.image))));
                      emitOptions(next, { ...cor, choice: kept[0] || "", choices: kept });
                    }}
                    ui={ui}
                    c={c}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {answerMode === "TWO" && (
          <div style={{ marginTop: 14, color: c.textMuted, fontSize: 12 }}>
            {/* Revision 3: each correct MCQ answer is worth 50% of the question points in two-answer mode. */}
            Two-answer mode gives 50% of the question points for each correct selected answer.
          </div>
        )}


        <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 12, background: selectedOpt ? `${c.accent}14` : c.cardBg2, border: `1px solid ${selectedOpt ? c.accent : c.border}`, fontSize: 13, color: selectedOpt ? c.accent : c.textMuted, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
          {selectedOpt ? <>✓ Correct answer{answerMode === "TWO" ? "s" : ""}: <span style={{ fontWeight: 900 }}>{correctChoices.map((choice) => choiceDisplay(opts.find((row) => choiceMatchesValue(row, choice)), "Selected choice")).join(" + ")}</span></> : <>○ No correct answer selected yet</>}
        </div>

        {showMatchingSuggest && (
          <ActionDialog
            tone="blue"
            icon="🔀"
            title="Too many choices?"
            message={<><p style={{ margin: "0 0 12px" }}>MCQ is capped at <strong style={{ color: c.text }}>5 choices</strong>. If you need more options, the <strong style={{ color: c.accent }}>Matching</strong> template is a better fit.</p><div style={{ background: c.cardBg2, border: `1px solid ${c.border}`, borderRadius: 14, padding: "12px 14px", fontSize: 13, lineHeight: 1.6 }}>⚠️ Converting will <strong style={{ color: c.text }}>reset this question&apos;s choices and correct answer</strong>. Your prompt text will be kept.</div></>}
            onClose={() => setShowMatchingSuggest(false)}
            width="min(100%, 440px)"
            actions={<div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}><button type="button" style={{ ...primaryBtn({ bg: c.accent, fg: "#fff", border: c.accent }), width: "100%", padding: "13px 16px", boxShadow: `0 12px 26px ${c.accent}38` }} onClick={() => { setShowMatchingSuggest(false); onChange({ config: { colA: [{ text: "", image: "" }], colB: [{ text: "", image: "" }, { text: "", image: "" }], dummyB: [{ text: "", image: "" }] }, correct: { pairs: [{ aIndex: 0, bIndex: 0 }] }, _convertToMatching: true }); }}>🔀 Yes, convert to Matching</button><button type="button" style={{ ...ui.secondaryBtn, width: "100%", padding: "13px 16px", fontSize: 14, fontWeight: 800 }} onClick={() => setShowMatchingSuggest(false)}>Keep MCQ</button></div>}
          />
        )}
      </div>
    );
  }

  if (tt === "TRUE_FALSE") {
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

  if (["TYPE_ANSWER", "DRAW_IT", "GRIP_GUESS"].includes(tt)) {
    return (
      <div style={ui.innerCard}>
        <h4 style={ui.innerTitle}>{tt === "TYPE_ANSWER" ? "Identification" : "Answer"}</h4>
        {/* Revision 1: Typed response is displayed as Identification per panel suggestion. */}
        <input maxLength={255} value={cor.text ?? ""} placeholder="Correct answer" onChange={(e) => onChange({ correct: { ...cor, text: e.target.value.slice(0, 255) }, config: { ...cfg, typoTolerance: 0 } })} style={ui.input} />
        {/* {templateType === "TYPE_ANSWER" && (
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
        )} */}
      </div>
    );
  }

  if (tt === "GUESS_WORD_4PICS") {
    const images = Array.isArray(cfg.images) ? [...cfg.images] : ["", "", "", ""];
    while (images.length < 4) images.push("");

    function setImage(index, value) {
      const next = [...images];
      next[index] = value;
      // Revision 3: 4 Pics keeps only the original word-guess gameplay.
      onChange({ config: { ...cfg, images: next, target: cfg.target ?? cor.text ?? "", dummyLetters: Number(cfg.dummyLetters || 6) } });
    }

    function reorderImage(from, to) {
      if (from === to) return;
      onChange({ config: { ...cfg, images: reorderList(images, from, to) } });
    }

    async function handleFile(index, file) {
      if (!file || !/^image\//.test(file.type || "")) return;
      const optimized = await compressImageFile(file);
      if (optimized) setImage(index, optimized);
    }

    return (
      <div style={ui.innerCard}>
        <h4 style={ui.innerTitle}>Guess Word / 4 Pics</h4>
        <div style={{ color: c.textMuted, fontSize: 12, marginBottom: 10 }}>
          Drag images to reorder. Students will spell the correct word using the letter bank.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(160px, 1fr))", gap: 12 }}>
          {images.slice(0, 4).map((src, index) => (
            <div
              key={index}
              draggable
              onDragStart={(e) => e.dataTransfer.setData("text/plain", String(index))}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => reorderImage(Number(e.dataTransfer.getData("text/plain")), index)}
              style={{ border: `2px solid ${c.border}`, borderRadius: 16, overflow: "hidden", background: c.cardBg2, cursor: "grab", minHeight: 150, display: "grid", placeItems: "center", position: "relative" }}
            >
              {src ? <img src={src} alt="" style={{ width: "100%", height: 150, objectFit: "cover", display: "block" }} /> : <div style={{ color: c.textMuted, fontWeight: 800 }}>Image {index + 1}</div>}
              <div style={{ padding: 10, width: "100%", boxSizing: "border-box" }}>
                <input maxLength={6000} value={src || ""} placeholder={`Image ${index + 1} URL`} onChange={(e) => setImage(index, e.target.value)} style={ui.input} />
                <div style={{ marginTop: 6 }}>
                  <label style={{ ...ui.secondaryBtn, display: "block", textAlign: "center", padding: "8px 10px", fontSize: 12, cursor: "pointer" }}>
                    Upload image
                    <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handleFile(index, e.target.files?.[0])} />
                  </label>
                </div>
              </div>
            </div>
          ))}
        </div>
        <label style={{ ...ui.smallLabel, marginTop: 12, display: "block" }}>Correct word</label>
        <input maxLength={255} value={cor.text ?? ""} onChange={(e) => onChange({ correct: { ...cor, text: e.target.value.slice(0, 255) }, config: { ...cfg, images, target: e.target.value.slice(0, 255), dummyLetters: Number(cfg.dummyLetters || 6) } })} style={ui.input} />
        <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
          <label style={ui.smallLabel}>Extra random letters</label>
          <input type="number" min={0} max={12} value={Number(cfg.dummyLetters || 6)} onChange={(e) => onChange({ config: { ...cfg, images, target: cfg.target ?? cor.text ?? "", dummyLetters: Math.min(12, Math.max(0, Number(e.target.value) || 0)) } })} style={{ ...ui.smallInput, width: 84 }} />
        </div>
      </div>
    );
  }

  if (tt === "MATCHING") {
    const colA = Array.isArray(cfg.colA) && cfg.colA.length ? cfg.colA.map((item) => ({ text: item?.text || "", image: item?.image || "" })) : [{ text: "", image: "" }];
    const allB = Array.isArray(cfg.colB) && cfg.colB.length ? cfg.colB.map((item) => ({ text: item?.text || "", image: item?.image || "" })) : [{ text: "", image: "" }, { text: "", image: "" }];
    const dummyB = Array.isArray(cfg.dummyB) && cfg.dummyB.length ? cfg.dummyB.map((item) => ({ text: item?.text || "", image: item?.image || "" })) : allB.slice(colA.length, colA.length + 2);
    const pairB = Array.from({ length: colA.length }, (_, i) => ({ text: allB[i]?.text || "", image: allB[i]?.image || "" }));
    const activeDummy = dummyB.length ? dummyB.slice(0, 2) : [{ text: "", image: "" }];

    function emit(aRows, bRows, dRows) {
      // Revision 1: matching saves paired answers first, then dummy choices.
      const cleanedDummy = dRows.slice(0, 2);
      onChange({
        config: { ...cfg, colA: aRows, colB: [...bRows, ...cleanedDummy], dummyB: cleanedDummy },
        correct: { ...cor, pairs: aRows.map((_, i) => ({ aIndex: i, bIndex: i })) },
      });
    }

    function updateA(i, patch) { emit(colA.map((row, idx) => (idx === i ? { ...row, ...patch } : row)), pairB, activeDummy); }
    function updateB(i, patch) { emit(colA, pairB.map((row, idx) => (idx === i ? { ...row, ...patch } : row)), activeDummy); }
    function updateDummy(i, patch) { emit(colA, pairB, activeDummy.map((row, idx) => (idx === i ? { ...row, ...patch } : row))); }
    const maxPairs = guestMode ? 5 : 99;
    function addRow() { if (colA.length >= maxPairs) return; emit([...colA, { text: "", image: "" }], [...pairB, { text: "", image: "" }], activeDummy); }
    function removeRow(index) { if (colA.length <= 1) return; emit(colA.filter((_, i) => i !== index), pairB.filter((_, i) => i !== index), activeDummy); }
    function addDummy() { if (activeDummy.length >= 2) return; emit(colA, pairB, [...activeDummy, { text: "", image: "" }]); }
    function removeDummy(index) { if (activeDummy.length <= 1) return; emit(colA, pairB, activeDummy.filter((_, i) => i !== index)); }
    function movePair(from, to) { if (from === to) return; emit(reorderList(colA, from, to), reorderList(pairB, from, to), activeDummy); }
    function moveDummy(from, to) { if (from === to) return; emit(colA, pairB, reorderList(activeDummy, from, to)); }

    return (
      <div style={ui.innerCard}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <div>
            <h4 style={ui.innerTitle}>Matching Pairs</h4>
            <div style={{ color: c.textMuted, fontSize: 12, marginTop: 4 }}>Each pair is correct by row. Add 1–2 dummy answers below for Column B distractors.{guestMode ? " Guest limit: 5 pairs max." : ""}</div>
          </div>
          <button style={{ ...ui.secondaryBtn, padding: "7px 12px", fontSize: 12, opacity: colA.length >= maxPairs ? 0.55 : 1, cursor: colA.length >= maxPairs ? "not-allowed" : "pointer" }} disabled={colA.length >= maxPairs} onClick={addRow}>＋ Add Pair</button>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          {colA.map((_, index) => (
            <div key={index} draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", String(index))} onDragOver={(e) => e.preventDefault()} onDrop={(e) => movePair(Number(e.dataTransfer.getData("text/plain")), index)} style={{ border: `1px solid ${c.border}`, borderRadius: 18, background: c.cardBg2, padding: 14, display: "grid", gap: 12, cursor: "grab" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ ...ui.badge, background: c.pageBg, color: c.text }}>Pair {index + 1}</div>
                <button style={{ ...ui.dangerGhostBtn, padding: "6px 12px", fontSize: 12, opacity: colA.length <= 1 ? 0.55 : 1, cursor: colA.length <= 1 ? "not-allowed" : "pointer" }} disabled={colA.length <= 1} onClick={() => removeRow(index)}>Delete pair</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(220px,1fr) 56px minmax(220px,1fr)", gap: 12, alignItems: "center" }}>
                <div style={{ display: "grid", gap: 8 }}>
                  <label style={ui.smallLabel}>Column A</label>
                  <input maxLength={255} value={colA[index]?.text || ""} placeholder="Concept / term / caption" onChange={(e) => updateA(index, { text: e.target.value.slice(0, 255) })} style={ui.input} />
                  <MediaInput value={colA[index]?.image || ""} placeholder="Column A image URL" onChange={(value) => updateA(index, { image: value })} ui={ui} c={c} />
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: c.textMuted, fontWeight: 900, fontSize: 24 }}>⇄</div>
                <div style={{ display: "grid", gap: 8 }}>
                  <label style={ui.smallLabel}>Column B Correct Match</label>
                  <input maxLength={255} value={pairB[index]?.text || ""} placeholder="Definition / answer / caption" onChange={(e) => updateB(index, { text: e.target.value.slice(0, 255) })} style={ui.input} />
                  <MediaInput value={pairB[index]?.image || ""} placeholder="Column B image URL" onChange={(value) => updateB(index, { image: value })} ui={ui} c={c} />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 16, border: `1px dashed ${c.border}`, borderRadius: 18, padding: 14, background: c.cardBg2 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <div>
              <h4 style={{ ...ui.innerTitle, margin: 0 }}>Dummy Answers</h4>
              <div style={{ color: c.textMuted, fontSize: 12, marginTop: 4 }}>Minimum 1, maximum 2. These appear in Column B but do not match Column A.</div>
            </div>
            <button type="button" style={{ ...ui.secondaryBtn, padding: "7px 12px", fontSize: 12 }} disabled={activeDummy.length >= 2} onClick={addDummy}>＋ Add Dummy</button>
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {activeDummy.map((row, index) => (
              <div key={index} draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", String(index))} onDragOver={(e) => e.preventDefault()} onDrop={(e) => moveDummy(Number(e.dataTransfer.getData("text/plain")), index)} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "start", border: `1px solid ${c.border}`, borderRadius: 14, padding: 12, background: c.cardBg, cursor: "grab" }}>
                <div style={{ display: "grid", gap: 8 }}>
                  <label style={ui.smallLabel}>Dummy {index + 1}</label>
                  <input maxLength={255} value={row.text || ""} placeholder="Wrong choice" onChange={(e) => updateDummy(index, { text: e.target.value.slice(0, 255) })} style={ui.input} />
                  <MediaInput value={row.image || ""} placeholder="Dummy image URL" onChange={(value) => updateDummy(index, { image: value })} ui={ui} c={c} />
                </div>
                <button type="button" style={{ ...ui.dangerGhostBtn, padding: "6px 12px", fontSize: 12 }} disabled={activeDummy.length <= 1} onClick={() => removeDummy(index)}>Delete</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (tt === "THINK_SPELL") {
    // key=q.order ensures ThinkSpellEditor unmounts+remounts when the user
    // switches to a different question, which resets its internal rawText state.
    return (
      <ThinkSpellEditor
        key={q.order}
        cor={cor}
        cfg={cfg}
        onChange={onChange}
        ui={ui}
        c={c}
        maxWords={guestMode ? 5 : null}
      />
    );
  }

  return null;
}

function QuestionSupportFields({ q, onChange, ui, c }) {
  const cfg = q.config || {};
  const difficulty = difficultyLabel(cfg.difficulty);
  return (
    <div style={{ ...ui.innerCard, marginTop: 16, borderStyle: "dashed" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <h4 style={{ ...ui.innerTitle, marginBottom: 4 }}>Answer explanation</h4>
          <div style={{ color: c.textMuted, fontSize: 12 }}>Shown to students after they submit their answer.</div>
        </div>
        <label style={{ display: "grid", gap: 6, minWidth: 150 }}>
          <span style={ui.smallLabel}>Difficulty</span>
          <select value={difficulty} onChange={(e) => onChange({ config: { ...cfg, difficulty: e.target.value } })} style={ui.input}>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </label>
      </div>
      <textarea
        rows={3}
        maxLength={1000}
        value={cfg.explanation || ""}
        placeholder="explanation goes here"
        onChange={(e) => onChange({ config: { ...cfg, explanation: e.target.value.slice(0, 1000), difficulty } })}
        style={ui.textarea}
      />
    </div>
  );
}

function getUi(c, dark, templateType) {
  const palette = templateTone(templateType, c, true);
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
      borderBottom: `1px solid ${palette.border}`,
      position: "sticky",
      top: 0,
      zIndex: 10,
      boxShadow: dark ? `0 10px 30px ${palette.accent}22` : `0 10px 30px ${palette.accent}20`,
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
      borderBottom: `1px solid ${palette.border}`,
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
      border: `1px solid ${active ? palette.border : c.border}`,
      background: active ? palette.bg : c.cardBg2,
      color: c.text,
      cursor: "pointer",
      boxShadow: active ? palette.shadow : "none",
    }),
    toggleTitle: { fontWeight: 800, fontSize: 14, color: c.text },
    toggleHint: { fontSize: 12, color: c.textMuted, marginTop: 4, lineHeight: 1.5 },
    switchTrack: (active) => ({
      width: 50,
      height: 30,
      borderRadius: 999,
      position: "relative",
      flexShrink: 0,
      background: active ? palette.accent : dark ? "#24324f" : "#c6d3f7",
      border: `1px solid ${active ? palette.accent : c.border}`,
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
      border: `1.5px solid ${palette.border}`,
      borderRadius: 22,
      padding: "28px 32px",
      boxShadow: dark ? `0 10px 34px ${palette.accent}20` : `0 12px 34px ${palette.accent}24`,
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
      borderColor: palette.accent,
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
      border: `1px solid ${palette.accent}`,
      background: palette.accent,
      color: "#fff",
      fontSize: 14,
      fontWeight: 900,
      cursor: "pointer",
      boxShadow: `0 12px 26px ${palette.accent}33`,
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
