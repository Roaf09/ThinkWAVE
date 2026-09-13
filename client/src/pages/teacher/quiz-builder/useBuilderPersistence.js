import { useCallback } from "react";
import { api } from "../../../lib/api";
import { normalizeTemplateType } from "../../../lib/templateTypes";
import { markTemplateTutorialSeen, readTutorialState, writeTutorialState } from "../../../lib/tutorialState";
import {
  buildBlankQuestion,
  clampQuestionPoints,
  findDuplicates,
  normalizeMatchingPayload,
  safeJson,
  stableStringify,
  trimText,
  validateQuestion,
} from "./quizBuilderUtils";

export function useBuilderPersistence({
  id,
  guestMode,
  navigate,
  quiz,
  setQuiz,
  questions,
  qIndex,
  settings,
  setSettings,
  setModal,
  setMsg,
  setDupeList,
  setInvalidList,
  isSaved,
  setIsSaved,
  setIsSaving,
  tutorialUserId,
  setTutorialUserId,
  builderTutorialStage,
  setBuilderTutorialStage,
  setPublishFlow,
  titleDraft,
  setTitleDraft,
  setTitleEditing,
  setTitleSaving,
  markUnsaved,
  inheritedGlobalConfig,
  setQuestions,
  setQIndex,
  setNavDir,
  setNavTick,
  setBankOpen,
  setBankSavedOrders,
  setLoadError,
  editVersionRef,
  savePromiseRef,
}) {
  const load = useCallback(async () => {
    setLoadError("");
    try {
      const { data } = await api.get(`/quizzes/${id}`);
      if (!guestMode) {
        try {
          const { data: me } = await api.get("/auth/me");
          setTutorialUserId(me?.id || null);
        } catch { /* no restrictions regardless */ }
      }
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

      if (!guestMode && loaded.length) {
        try {
          const { data: bankRows } = await api.get("/question-bank");
          // Must match server's stable (key-sorted) comparison exactly -
          // plain JSON.stringify would treat two identical questions as
          // different just because their object keys were built in a
          // different order, which was silently breaking this check.
          const normalizeSig = (prompt, config, correct) => `${String(prompt || "").trim().toLowerCase()}|${stableStringify(config)}|${stableStringify(correct)}`;
          const bankSigs = new Set((bankRows || []).filter((row) => normalizeTemplateType(row.template_type) === normalizeTemplateType(data.quiz?.template_type)).map((row) => normalizeSig(row.prompt, safeJson(row.config_json) || row.config_json || {}, safeJson(row.correct_json) || row.correct_json || {})));
          setBankSavedOrders(new Set(loaded.filter((row) => bankSigs.has(normalizeSig(row.prompt, row.config, row.correct))).map((row) => Number(row.order))));
        } catch { setBankSavedOrders(new Set()); }
      }

      if (loaded.length === 0) {
        setQuestions([buildBlankQuestion(data.quiz, 0)]);
        setIsSaved(false);
      } else {
        const showPromptImage = loaded.some((question) => !!question.config?.showPromptImage);
        const voiceRecord = loaded.some((question) => !!question.config?.voiceRecord);
        const textToSpeech = !voiceRecord && loaded.some((question) => !!question.config?.textToSpeech);
        setQuestions(loaded.map((question) => ({ ...question, config: { ...question.config, showPromptImage, voiceRecord, textToSpeech } })));
        setIsSaved(true);
      }
      setQIndex(0);
      setNavTick((v) => v + 1);
    } catch (error) {
      const message = error?.response?.data?.message || "The quiz builder could not load this quiz.";
      setLoadError(error?.response?.status === 404 ? `${message} (id: ${id})` : message);
    }
  }, [id, guestMode]);

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
      // Intentionally silent on success: no "Quiz title updated" popup.
      setMsg("");
    } catch (e) {
      setMsg(e?.response?.data?.message || "Failed to update title.");
    } finally {
      setTitleSaving(false);
    }
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

  async function _doSave() {
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
    if (!isSaved || ["PUBLISHED", "BANKED"].includes(String(quiz?.status || "").toUpperCase())) return;
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
      const message = error?.response?.data?.message || "";
      if (/already.*saved|duplicate/i.test(message)) {
        setMsg("");
        setBankSavedOrders((current) => new Set([...current, Number(q?.order ?? qIndex)]));
        return;
      }
      setMsg(message || "Failed to save to bank.");
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
    // If the slot the teacher currently has open is still blank (they haven't
    // typed a question into it), fill that slot in place. This used to always
    // insert a brand-new slot next to it instead, leaving the blank one behind
    // as a second, empty question.
    const currentIsBlank = questions.length > 0 && !trimText(questions[qIndex]?.prompt);
    const insertAt = qIndex === questions.length - 1 ? questions.length : qIndex;
    markUnsaved((qs) => {
      const next = [...qs];
      if (currentIsBlank && next[qIndex]) next[qIndex] = { ...newQ, order: qIndex };
      else next.splice(insertAt, 0, newQ);
      return next.map((item, index) => ({ ...item, order: index }));
    });
    if (!currentIsBlank) {
      setNavDir(insertAt > qIndex ? "next" : "prev");
      setQIndex(insertAt);
      setNavTick((v) => v + 1);
    }
    setBankOpen(false);
    setMsg("");
  }

  return {
    load,
    saveSettings,
    saveTitle,
    prepareForSave,
    checkInvalid,
    _doSave,
    requestSave,
    save,
    publish,
    confirmPublish,
    deleteQuiz,
    doSaveToBank,
    addFromBank,
  };
}
