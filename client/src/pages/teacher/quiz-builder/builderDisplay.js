import { normalizeTemplateType } from "../../../lib/templateTypes";
import { templateAccent } from "../../../lib/templatePalette";
import { truncateBuilderTitle } from "./useBuilderViewport";
import { darkenHex, lightenTutorialColor } from "./builderColorUtils";

export function getBuilderDisplay({
  quiz,
  questions,
  qIndex,
  settings,
  isSaving,
  isSaved,
  isMobile,
  builderTitleLimit,
  dark,
  guestMode,
  saveSettings,
  applyConfigToAllQuestions,
  updateQ,
  questionStripOpen,
  closeQuestionStrip,
  setSettingsOpen,
  setOverflowOpen,
  setOverflowTitleEditing,
  setQMenuOpen,
  setTitleDraft,
}) {
  const currentQ = questions[qIndex] || null;
  const totalQ = questions.length;
  const isFirst = qIndex === 0;
  const isLast = totalQ === 0 || qIndex === totalQ - 1;
  const publishLatched = ["PUBLISHED", "BANKED"].includes(String(quiz.status || "").toUpperCase());
  const publishDisabled = isSaving || !isSaved || publishLatched;
  const isBatchTemplate = ["MATCHING", "GUESS_WORD_4PICS", "THINK_SPELL"].includes(quiz.template_type);
  const tutorialHighlightColor = lightenTutorialColor(templateAccent(quiz.template_type), dark ? 0.24 : 0.36);
  const builderTemplateAccent = templateAccent(quiz.template_type);
  const builderTemplateDragClass = `is-template-${normalizeTemplateType(quiz.template_type).toLowerCase().replace(/_/g, "-")}`;
  const builderActionFace = darkenHex(builderTemplateAccent, dark ? 0.42 : 0.36);
  const builderActionBase = darkenHex(builderTemplateAccent, dark ? 0.58 : 0.52);
  const builderActionBorder = darkenHex(builderTemplateAccent, dark ? 0.50 : 0.44);
  const builderDialogActionStyle = { "--tw-press-face": builderTemplateAccent, "--tw-press-base": builderActionBase, "--tw-press-border": builderActionBorder, color: "#fff" };
  const builderQuestionSolid = dark
    ? `color-mix(in srgb, ${builderTemplateAccent} 18%, #172a46)`
    : `color-mix(in srgb, ${builderTemplateAccent} 25%, #ffffff)`;
  const globalShowPromptImage = questions.length > 0 && questions.every((question) => !!question.config?.showPromptImage);
  const globalVoiceRecord = questions.length > 0 && questions.every((question) => !!question.config?.voiceRecord);
  const globalTextToSpeech = questions.length > 0 && questions.every((question) => !!question.config?.textToSpeech);
  const truncatedQuizTitle = truncateBuilderTitle(quiz?.title || "Untitled quiz", builderTitleLimit);
  const fullQuizTitle = String(quiz?.title || "Untitled quiz");
  const crosswordShowWordList = (questions[qIndex] || questions[0])?.config?.showWordList !== false;
  const isCrossword = normalizeTemplateType(quiz?.template_type) === "THINK_SPELL";

  const builderSettingsRows = [];
  if (!guestMode) builderSettingsRows.push({ key: "randomize", label: isBatchTemplate ? "Randomize assigned batches" : "Randomize assigned question order", active: !!settings?.randomizeQuestions, onToggle: () => saveSettings({ randomizeQuestions: !settings.randomizeQuestions }) });
  if (quiz?.template_type === "MATCHING") builderSettingsRows.push({ key: "shuffleA", label: "Shuffle Column A", active: !!settings?.shuffleAnswers, onToggle: () => saveSettings({ shuffleAnswers: !settings.shuffleAnswers }) });
  if (quiz?.template_type === "MCQ") builderSettingsRows.push({ key: "shuffleMcq", label: "Shuffle answer choices", active: !!settings?.shuffleAnswers, onToggle: () => saveSettings({ shuffleAnswers: !settings.shuffleAnswers }) });
  builderSettingsRows.push({ key: "qimage", label: "Question image", active: !!globalShowPromptImage, onToggle: () => applyConfigToAllQuestions({ showPromptImage: !globalShowPromptImage }) });
  builderSettingsRows.push({ key: "voice", label: "Voice record", active: !!globalVoiceRecord, onToggle: () => { const enabled = !globalVoiceRecord; applyConfigToAllQuestions({ voiceRecord: enabled, textToSpeech: enabled ? false : globalTextToSpeech }); } });
  builderSettingsRows.push({ key: "tts", label: "Text to speech", active: !!globalTextToSpeech, onToggle: () => { const enabled = !globalTextToSpeech; applyConfigToAllQuestions({ textToSpeech: enabled, voiceRecord: enabled ? false : globalVoiceRecord }); } });
  if (isMobile && isCrossword) builderSettingsRows.push({ key: "wordlist", label: "Show valid words during gameplay", active: crosswordShowWordList, onToggle: () => { const q = questions[qIndex] || questions[0]; if (!q) return; updateQ({ config: { ...(q.config || {}), showWordList: !crosswordShowWordList } }); } });

  function openSettings() {
    if (questionStripOpen) closeQuestionStrip();
    setOverflowOpen(false);
    setOverflowTitleEditing(false);
    setQMenuOpen(false);
    setSettingsOpen(true);
  }
  function openOverflow() {
    if (questionStripOpen) closeQuestionStrip();
    setSettingsOpen(false);
    setQMenuOpen(false);
    setOverflowTitleEditing(false);
    setTitleDraft(quiz?.title || "");
    setOverflowOpen(true);
  }

  return {
    currentQ,
    totalQ,
    isFirst,
    isLast,
    publishLatched,
    publishDisabled,
    isBatchTemplate,
    tutorialHighlightColor,
    builderTemplateAccent,
    builderTemplateDragClass,
    builderActionFace,
    builderActionBase,
    builderActionBorder,
    builderDialogActionStyle,
    builderQuestionSolid,
    truncatedQuizTitle,
    fullQuizTitle,
    builderSettingsRows,
    openSettings,
    openOverflow,
  };
}
