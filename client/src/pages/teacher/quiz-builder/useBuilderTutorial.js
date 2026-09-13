import { useEffect, useMemo, useState } from "react";
import { normalizeTemplateType } from "../../../lib/templateTypes";
import { hasSeenTemplateTutorial, markTemplateTutorialSeen, readTutorialState, writeTutorialState } from "../../../lib/tutorialState";
import { trimText, validateQuestion } from "./quizBuilderUtils";

export function useBuilderTutorial({ guestMode, quiz, questions, qIndex, isSaved }) {
  const [tutorialUserId, setTutorialUserId] = useState(null);
  const [builderTutorialStage, setBuilderTutorialStage] = useState(null);
  const [followupTemplateTutorial, setFollowupTemplateTutorial] = useState(false);
  const [modifiedTutorialOpen, setModifiedTutorialOpen] = useState(false);
  const [mcqTipVisible, setMcqTipVisible] = useState(false);

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
    // Persist the skip immediately. Without this, the "Would you like to see
    // the tutorial for this template?" prompt reappears the moment the teacher
    // types or clicks anything, because the trigger effect below re-runs on
    // every questions/quiz change and re-opens the prompt whenever the stage
    // is falsy and the template hasn't been marked seen yet.
    if (!guestMode && tutorialUserId && quiz?.template_type) {
      markTemplateTutorialSeen(tutorialUserId, quiz.template_type);
    }
    finishFollowupTemplateTutorial();
  }

  function startFollowupTemplateTutorial() {
    // This is only ever reached from the "template_prompt" stage, which only
    // appears once the teacher has already been through the very first
    // template tutorial. So the "Every template has its own builder tools..."
    // explainer - which only makes sense the first time ever - is skipped,
    // jumping straight into the actual walkthrough.
    setBuilderTutorialStage("question");
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
    if (!["mcq_correct", "specific"].includes(builderTutorialStage) || normalizeTemplateType(quiz?.template_type) !== "MCQ") return undefined;
    const dots = Array.from(document.querySelectorAll('[data-tutorial="builder-mcq-options"] .tw-mcq-correct-dot'));
    const controls = document.querySelector('[data-tutorial="builder-mcq-controls"]');
    if (builderTutorialStage === "mcq_correct") dots.forEach((node) => node.classList.add("tw-tutorial-mini-pulse"));
    if (builderTutorialStage === "mcq_correct" && tutorialMcqAllChoicesFilled) controls?.classList.add("tw-tutorial-mini-pulse");
    return () => {
      dots.forEach((node) => node.classList.remove("tw-tutorial-mini-pulse"));
      controls?.classList.remove("tw-tutorial-mini-pulse");
    };
  }, [builderTutorialStage, quiz?.template_type, tutorialMcqAllChoicesFilled]);

  useEffect(() => {
    if (!["answer_explanation", "answer_explanation_done"].includes(builderTutorialStage)) return undefined;
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

  return {
    tutorialUserId,
    setTutorialUserId,
    builderTutorialStage,
    setBuilderTutorialStage,
    followupTemplateTutorial,
    setFollowupTemplateTutorial,
    modifiedTutorialOpen,
    setModifiedTutorialOpen,
    mcqTipVisible,
    tutorialMcqAllChoicesFilled,
    finishFollowupTemplateTutorial,
    skipFollowupTemplateTutorial,
    startFollowupTemplateTutorial,
  };
}
