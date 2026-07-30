import { normalizeTemplateType } from "../../../lib/templateTypes";
import { templateLabel } from "../../../lib/templatePalette";

export function normalizeSemanticText(value) {
  const stopWords = new Set(["a", "an", "are", "as", "at", "be", "by", "for", "from", "has", "have", "in", "is", "it", "its", "of", "on", "that", "the", "these", "this", "to", "was", "were", "what", "which", "who", "whom", "with"]);
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.replace(/(ing|ed|es|s)$/i, ""))
    .filter((word) => word.length > 1 && !stopWords.has(word))
    .sort();
}

export function similarity(a, b) {
  const wordsA = normalizeSemanticText(a);
  const wordsB = normalizeSemanticText(b);
  if (wordsA.length === 0 || wordsB.length === 0) return 0;

  const setA = new Set(wordsA);
  const setB = new Set(wordsB);
  const intersection = [...setA].filter((word) => setB.has(word)).length;
  const union = new Set([...setA, ...setB]).size || 1;
  const minSize = Math.max(1, Math.min(setA.size, setB.size));
  const maxSize = Math.max(setA.size, setB.size, 1);

  const jaccard = intersection / union;
  const dice = (2 * intersection) / Math.max(1, setA.size + setB.size);
  const containment = intersection / minSize;
  const lengthRatio = minSize / maxSize;
  const unmatchedRatio = (union - intersection) / union;

  // Shared words matter, but additional or missing words reduce the score.
  // This prevents a short question from being marked duplicate merely because
  // all of its words also appear inside a much longer, meaningfully different one.
  const lexicalScore = (jaccard * 0.5) + (dice * 0.3) + (containment * 0.2);
  const lengthPenalty = 0.65 + (lengthRatio * 0.35);
  const differencePenalty = 1 - (unmatchedRatio * 0.35);
  return Math.max(0, Math.min(1, lexicalScore * lengthPenalty * differencePenalty));
}

export function findDuplicates(questions) {
  const dupes = [];
  for (let i = 0; i < questions.length; i++) {
    for (let j = i + 1; j < questions.length; j++) {
      const score = similarity(questions[i].prompt || "", questions[j].prompt || "");
      if (score >= 0.58) dupes.push({ i: i + 1, j: j + 1, score: Math.round(score * 100) });
    }
  }
  return dupes;
}

export function safeJson(v) {
  if (!v) return null;
  if (typeof v === "object") return v;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}


export async function compressImageFile(file) {
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

export function defaultConfig(t, c) {
  switch (normalizeTemplateType(t)) {
    case "MCQ":
      return { options: defaultMcqOptions(c), promptImage: "", showPromptImage: false, mcqMode: "NORMAL", voiceRecord: false, textToSpeech: false, voicePrompt: "", voiceAnswers: [] };
    case "TRUE_FALSE":
      return { options: ["True", "False"], promptImage: "", showPromptImage: false, voiceRecord: false, textToSpeech: false, voicePrompt: "", voiceAnswers: [] };
    case "MATCHING":
      return {
        colA: [{ text: "", image: "" }],
        colB: [{ text: "", image: "" }],
        dummyB: [],
        promptImage: "",
        showPromptImage: false,
        voiceRecord: false,
        textToSpeech: false,
        voicePrompt: "",
        voiceAnswers: [],
      };
    case "GUESS_WORD_4PICS":
      return { images: ["", "", "", ""], dummyLetters: 6, target: "", promptImage: "", showPromptImage: false, voiceRecord: false, textToSpeech: false, voicePrompt: "", voiceAnswers: [] };
    case "THINK_SPELL":
      return { gridSize: 5, answers: [], gridSeed: 1, gridFilled: false, promptImage: "", showPromptImage: false, minWordLength: 3, pointsPerWord: 1, lengthBonusPerLetter: 0, showWordList: true, voiceRecord: false, textToSpeech: false, voicePrompt: "", voiceAnswers: [] };
    case "TYPE_ANSWER":
      return { promptImage: "", showPromptImage: false, voiceRecord: false, textToSpeech: false, voicePrompt: "", voiceAnswers: [] };
    default:
      return {};
  }
}

export function defaultCorrect(t) {
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

export function buildBlankQuestion(quiz, order = 0) {
  return {
    order,
    prompt: "",
    config: defaultConfig(quiz?.template_type, quiz?.category),
    correct: defaultCorrect(quiz?.template_type),
    timeLimitSec: 30,
    points: 1,
  };
}

export function trimText(v) {
  return String(v || "").trim();
}

export function clampQuestionPoints(value, max = 3) {
  return Math.min(max, Math.max(1, Number(value) || 1));
}

export function displayTemplateName(value) {
  return templateLabel(value);
}

export function reorderList(list, from, to) {
  const next = [...(Array.isArray(list) ? list : [])];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function answerLabel(option) {
  return trimText(option?.text) || trimText(option?.label) || trimText(option?.image);
}

export function hasDuplicateRows(rows) {
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

export function hasDuplicateTextValues(values) {
  return hasDuplicateRows((values || []).map((text) => ({ text })));
}

export function newChoiceId() {
  return `choice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function defaultMcqOptions(category) {
  const count = category === "K12" ? 3 : 4;
  return Array.from({ length: count }, () => ({ id: newChoiceId(), text: "", image: "" }));
}

export function defaultMcqImageOptions() {
  return Array.from({ length: 4 }, () => ({ id: newChoiceId(), text: "", image: "" }));
}

export function normalizeChoiceOption(option, index = 0) {
  if (option && typeof option === "object") {
    return {
      id: String(option.id || `option-${index + 1}`),
      text: option.text ?? option.label ?? "",
      image: option.image ?? "",
    };
  }
  return { id: `option-${index + 1}`, text: String(option ?? ""), image: "" };
}

export function normalizeChoiceOptions(options, category) {
  const fallback = defaultMcqOptions(category);
  const source = Array.isArray(options) && options.length ? options : fallback;
  return source.map(normalizeChoiceOption);
}

export function choiceHasContent(option) {
  return !!(trimText(option?.text) || trimText(option?.image));
}

export function choiceMatchesValue(option, value) {
  const selected = trimText(value).toLowerCase();
  if (!selected) return false;
  return [option?.id, option?.text].some((v) => trimText(v).toLowerCase() === selected);
}

export function choiceDisplay(option, fallback = "Choice") {
  return trimText(option?.text) || (trimText(option?.image) ? "Image choice" : fallback);
}

export function normalizeMatchingPayload(config, correct) {
  const cfg = config || {};
  const cor = correct || {};
  const colA = Array.isArray(cfg.colA) ? cfg.colA.map((item) => ({ text: item?.text || "", image: item?.image || "" })) : [];
  const rawB = Array.isArray(cfg.colB) ? cfg.colB.map((item) => ({ text: item?.text || "", image: item?.image || "" })) : [];
  const pairMap = new Map((Array.isArray(cor.pairs) ? cor.pairs : []).map((pair) => [Number(pair?.aIndex), Number(pair?.bIndex)]));
  const pairedB = colA.length ? colA.map((_, index) => rawB[pairMap.get(index)] || rawB[index] || { text: "", image: "" }) : rawB;
  const dummyB = Array.isArray(cfg.dummyB) ? cfg.dummyB.map((item) => ({ text: item?.text || "", image: item?.image || "" })) : rawB.slice(colA.length);
  return {
    config: { ...cfg, colA, colB: [...pairedB, ...dummyB], dummyB },
    correct: { ...cor, pairs: colA.map((_, i) => ({ aIndex: i, bIndex: i })) },
  };
}

export function validateQuestion(q, templateType) {
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
    if (!isModifiedMcq && opts.filter(choiceHasContent).length < 3) issues.push("needs at least 3 completed choices");
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
    if (colA.length === 0 || colB.length < colA.length) issues.push("matching needs a completed answer for every pair");
    if (dummyB.length > 2) issues.push("matching supports a maximum of 2 dummy answers");
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
