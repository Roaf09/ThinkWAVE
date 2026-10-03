import { useCallback, useRef } from "react";
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
          points: clampQuestionPoints(nextCfg.points ?? data.quiz.points_per_question ?? 1),
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

  // Autosave: quietly persist completed questions, keep blank ones local.
  // - Sends only questions with a non-empty prompt so a single empty draft
  //   never triggers a server "Validation error" popup while idle.
  // - Never opens warning/confirm modals and never surfaces validation
  //   messages; local state (including empties) is left untouched so the
  //   empty question stays in the builder.
  // - Leaves isSaved=false when empties remain so manual Save still warns.
  async function autosaveQuestions() {
    if (savePromiseRef.current) return savePromiseRef.current;
    const valid = questions.filter((q) => trimText(q?.prompt));
    if (!valid.length) return false;
    const payload = valid.map((q) => {
      const idx = questions.indexOf(q);
      const extra = quiz?.template_type === "MATCHING"
        ? { shuffleColA: !!settings.shuffleAnswers }
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
    // Re-index to 0..n-1 for the server's authoritative order.
    payload.forEach((item, i) => { item.order = i; });
    setIsSaving(true);
    const task = (async () => {
      try {
        await api.put(`/quizzes/${id}/questions`, { questions: payload });
        // Don't mark fully saved while a blank draft remains locally.
        const hasEmpty = questions.some((q) => !trimText(q?.prompt));
        if (!hasEmpty) {
          setIsSaved(true);
          if (!guestMode && tutorialUserId && quiz?.template_type) {
            markTemplateTutorialSeen(tutorialUserId, quiz.template_type);
          }
        }
        return true;
      } catch (e) {
        // Silent on 400s during idle autosave: a fresh question (e.g. a new
        // matching quiz with fewer than 2 pairs) legitimately fails server
        // structural checks before the teacher has typed anything. Manual
        // Save still validates client-side and reports. Surface only
        // non-400 (network/server) failures here.
        const status = e?.response?.status;
        if (status && status !== 400) {
          setMsg(e?.response?.data?.message || "Autosave failed.");
        }
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
    // Warning first: only show the save confirmation when everything is valid.
    // checkInvalid() opens the "Some questions are incomplete" modal itself.
    const list = questions
      .map((q, idx) => ({ question: idx + 1, issues: validateQuestion(q, quiz?.template_type) }))
      .filter((x) => x.issues.length > 0);
    if (list.length) {
      setInvalidList(list);
      setModal("invalid");
      return;
    }
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
    if (["PUBLISHED", "BANKED"].includes(String(quiz?.status || "").toUpperCase())) { setMsg("This quiz is already published."); return; }
    if (!isSaved) { setMsg("Save your questions first before publishing."); return; }
    if (!questions?.length) { setMsg("Add at least one question before publishing."); return; }
    if (checkInvalid().length) return;
    const dupes = findDuplicates(questions);
    if (dupes.length) {
      setDupeList(dupes);
      setModal("duplicates");
      return;
    }
    setModal("confirmPublish");
  }

  // One publish per click: the confirm dialog stays open during the request,
  // so without this guard a double-click fires two publish calls.
  const publishPromiseRef = useRef(null);
  async function confirmPublish() {
    if (publishPromiseRef.current) return publishPromiseRef.current;
    const task = (async () => {
      try {
        await api.post(`/quizzes/${id}/publish`);
        setQuiz((prev) => ({ ...prev, status: "PUBLISHED" }));
        setPublishFlow(false);
        setModal(null);
        if (!guestMode && tutorialUserId) {
          // Main-tour exit is decoupled from the builder track: publishing
          // while mainStage is builder_pending always advances to nav_sessions,
          // even if the builder's own tutorial already finished (null).
          if (builderTutorialStage) {
            markTemplateTutorialSeen(tutorialUserId, quiz?.template_type);
          }
          const mobileTutorial = typeof window !== "undefined" && window.innerWidth <= 760;
          if (mobileTutorial) {
            // Mobile tutorial: stay in the builder, let the overflow sheet
            // auto-close on PUBLISHED, then point at Home. Tapping Home goes
            // to the dashboard where the nav_sessions prompt takes over.
            const state = readTutorialState(tutorialUserId);
            if (state.mainStage === "builder_pending") {
              writeTutorialState(tutorialUserId, { mainStarted: true, mainStage: "nav_sessions" });
            }
            if (builderTutorialStage) setBuilderTutorialStage("home_highlight");
            return;
          }
          if (builderTutorialStage) setBuilderTutorialStage(null);
          const state = readTutorialState(tutorialUserId);
          if (state.mainStage === "builder_pending") {
            writeTutorialState(tutorialUserId, { mainStarted: true, mainStage: "nav_sessions" });
            window.setTimeout(() => navigate("/teacher"), 1500);
          }
        }
      } catch (e) {
        setMsg(e?.response?.data?.message || "Publish failed.");
      }
    })();
    publishPromiseRef.current = task;
    try {
      return await task;
    } finally {
      if (publishPromiseRef.current === task) publishPromiseRef.current = null;
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

  // One bank-save per click: the confirm dialog closes immediately, so a
  // double-click would otherwise post the same question twice.
  const bankSavePromiseRef = useRef(null);
  async function doSaveToBank(q) {
    const issues = validateQuestion(q, quiz?.template_type);
    if (issues.length) {
      setInvalidList([{ question: qIndex + 1, issues }]);
      setModal("invalid");
      return;
    }
    if (bankSavePromiseRef.current) return bankSavePromiseRef.current;
    const task = (async () => {
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
        if (["bank", "bank_menu"].includes(builderTutorialStage)) {
          setBuilderTutorialStage(["MATCHING", "CROSSWORD"].includes(normalizeTemplateType(quiz?.template_type)) ? "save_delay" : "add");
        }
      } catch (error) {
        const message = error?.response?.data?.message || "";
        if (/already.*saved|duplicate/i.test(message)) {
          setMsg("");
          setBankSavedOrders((current) => new Set([...current, Number(q?.order ?? qIndex)]));
          if (["bank", "bank_menu"].includes(builderTutorialStage)) {
            setBuilderTutorialStage(["MATCHING", "CROSSWORD"].includes(normalizeTemplateType(quiz?.template_type)) ? "save_delay" : "add");
          }
          return;
        }
        setMsg(message || "Failed to save to bank.");
      }
    })();
    bankSavePromiseRef.current = task;
    try {
      return await task;
    } finally {
      if (bankSavePromiseRef.current === task) bankSavePromiseRef.current = null;
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
    autosaveQuestions,
    requestSave,
    save,
    publish,
    confirmPublish,
    deleteQuiz,
    doSaveToBank,
    addFromBank,
  };
}
