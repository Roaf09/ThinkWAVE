import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { makeSocket } from "../../lib/socket";
import { QRCodeCanvas } from "qrcode.react";
import { useTheme } from "../../context/ThemeContext";
import ActionDialog, { primaryBtn, secondaryBtn } from "../../components/ActionDialog";
import { normalizeTemplateType } from "../../lib/templateTypes";
import { templateAccent } from "../../lib/templatePalette";
import ThemeIconButton from "../../components/ThemeIconButton";
import { TeacherPressButton } from "./TeacherUI";
import { TwIcon } from "../../components/TwUI";
import { getSessionBackground } from "../../lib/sessionBackgrounds";
import { buildThinkSpellGrid, buildThinkSpellSeed, buildThinkSpellSignature } from "../../templates/thinkspell/thinkSpell";
import ThinkBotTutorial from "../../components/ThinkBotTutorial";
import { readTutorialState, writeTutorialState } from "../../lib/tutorialState";

export default function HostLive({ guestMode = false }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { dark, toggleTheme } = useTheme();
  const [state, setState] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [roster, setRoster] = useState([]);
  const [groups, setGroups] = useState([]);
  const [scores, setScores] = useState([]);
  const [msg, setMsg] = useState("");
  const [starting, setStarting] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [nowMs, setNowMs] = useState(Date.now());
  const [answeredCount, setAnsweredCount] = useState(0);
  const [choiceCounts, setChoiceCounts] = useState({});
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [confirmAction, setConfirmAction] = useState(null);
  const [deleteGroupTarget, setDeleteGroupTarget] = useState(null);
  const [allAnsweredPrompt, setAllAnsweredPrompt] = useState(false);
  const [finishedPrompt, setFinishedPrompt] = useState(false);
  const [autoNextCount, setAutoNextCount] = useState(5);
  const [advanceReason, setAdvanceReason] = useState("answered");
  const [tutorialUserId, setTutorialUserId] = useState(null);
  const [hostTutorialStage, setHostTutorialStage] = useState(null);
  const [tabTutorialOpen, setTabTutorialOpen] = useState(false);
  const [tutorialDemo, setTutorialDemo] = useState(false);
  const [tutorialBots, setTutorialBots] = useState([]);
  const [tutorialAnsweredCount, setTutorialAnsweredCount] = useState(0);
  const [tutorialChoiceCounts, setTutorialChoiceCounts] = useState({});
  const [tutorialBotScores, setTutorialBotScores] = useState({});
  const tutorialJoinStartedRef = useRef(false);
  const tutorialAnswerRunRef = useRef("");
  const socketRef = useRef(null);
  const lastTeacherActionRef = useRef(Date.now());
  const lastQuestionEndedAtRef = useRef(null);
  const timedOutQuestionRef = useRef(null);
  const currentQuestionIndexRef = useRef(null);
  const countdownWaitRef = useRef(null);

  const accent = templateAccent(state?.template_type);
  const C = useMemo(() => dark
    ? { pageBg: `linear-gradient(180deg,#07111f,${accent}18 55%,#0e1733)`, cardBg: "#0c172d", cardBg2: "#091325", border: `${accent}56`, text: "#e7e9ee", muted: "#8a9bc4", accent, headerBg: "#0d1428" }
    : { pageBg: `linear-gradient(180deg,#f8fbff,${accent}14 55%,#e6eeff)`, cardBg: "#ffffff", cardBg2: `${accent}0d`, border: `${accent}4f`, text: "#0f172a", muted: "#4b5f92", accent, headerBg: "#f5f8ff" }, [accent, dark]);

  useEffect(() => {
    Promise.all([api.get(`/sessions/${id}/state`), api.get("/auth/me")])
      .then(([sessionRes, meRes]) => {
        const data = sessionRes.data;
        setState(data.session);
        setQuestions(data.questions || []);
        setRoster(data.participants || []);
        setGroups(data.groups || []);
        setScores(data.scores || []);
        setChoiceCounts(data.choiceCounts || {});
        currentQuestionIndexRef.current = Number(data.session?.current_question_index || 0);
        const uid = meRes?.data?.id || meRes?.data?.user?.id || null;
        setTutorialUserId(uid);
        const tutorialState = uid ? readTutorialState(uid) : {};
        const returningTutorialDemo = !guestMode && Number(tutorialState?.tutorialDemoSessionId) === Number(id);
        if (returningTutorialDemo) {
          setTutorialDemo(true);
          setTutorialBots(buildTutorialBots());
          setTutorialBotScores(tutorialState?.tutorialDemoBotScores || {});
          tutorialJoinStartedRef.current = true;
          const questionIndex = Number(data.session?.current_question_index || 0);
          const currentTutorialQuestion = (data.questions || [])[questionIndex] || null;
          const questionKey = String(currentTutorialQuestion?.id ?? questionIndex);
          const savedProgress = tutorialState?.tutorialDemoQuestionProgress || null;
          if (savedProgress && String(savedProgress.questionKey ?? "") === questionKey) {
            setTutorialAnsweredCount(Math.max(0, Math.min(3, Number(savedProgress.answeredCount || 0))));
            setTutorialChoiceCounts(savedProgress.choiceCounts && typeof savedProgress.choiceCounts === "object" ? savedProgress.choiceCounts : {});
          }
          setHostTutorialStage(tutorialState.hostPanelSeen ? null : resumeTutorialHostStage(data.session?.status, tutorialState?.tutorialDemoHostStage));
        } else if (!guestMode && uid && !tutorialState.hostPanelSeen) {
          setTutorialDemo(true);
          setHostTutorialStage("participants");
          writeTutorialState(uid, { tutorialDemoSessionId: Number(id), tutorialDemoHostStage: "participants" });
        }
      })
      .catch(() => { if (!guestMode) setMsg("Could not load session."); });
  }, [id]);

  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const markActivity = () => { lastTeacherActionRef.current = Date.now(); };
    window.addEventListener("pointerdown", markActivity, { passive: true });
    window.addEventListener("keydown", markActivity);
    return () => {
      window.removeEventListener("pointerdown", markActivity);
      window.removeEventListener("keydown", markActivity);
    };
  }, []);

  useEffect(() => {
    const socket = makeSocket();
    socketRef.current = socket;
    socket.on("connect", () => socket.emit("teacher:join", { sessionId: Number(id) }));
    socket.on("teacher:error", (payload) => setMsg(payload?.message || "Action could not be completed."));
    socket.on("session:state", (payload) => {
      const nextQuestionIndex = Number(payload.state?.current_question_index || 0);
      const questionChanged = currentQuestionIndexRef.current !== nextQuestionIndex;
      currentQuestionIndexRef.current = nextQuestionIndex;
      // Preserve setup-only fields (especially background_key) when live socket
      // snapshots omit them, so starting the session never falls back to the
      // dashboard gradient while the host panel scrolls.
      setState((current) => ({ ...(current || {}), ...(payload.state || {}) }));
      setQuestions((current) => sameQuestionSnapshot(current, payload.questions || []) ? current : (payload.questions || []));
      if (payload.state?.server_now) setClockOffsetMs(Date.now() - new Date(payload.state.server_now).getTime());
      if (questionChanged) {
        setAnsweredCount(0);
        setChoiceCounts({});
        setTutorialAnsweredCount(0);
        setTutorialChoiceCounts({});
        timedOutQuestionRef.current = null;
      }
      setAllAnsweredPrompt(false);
      setFinishedPrompt(false);
      setAutoNextCount(5);
      setAdvanceReason("answered");
    });
    socket.on("roster:update", (rows) => setRoster(rows || []));
    socket.on("groups:update", (rows) => setGroups(rows || []));
    socket.on("scores:update", (rows) => setScores(rows || []));
    socket.on("answer:received", (payload = {}) => {
      setAnsweredCount((value) => value + 1);
      const keys = Array.isArray(payload.choiceKeys) ? payload.choiceKeys : [];
      if (keys.length) setChoiceCounts((current) => {
        const next = { ...current };
        keys.forEach((key) => { next[key] = Number(next[key] || 0) + 1; });
        return next;
      });
    });
    socket.on("tab:updated", ({ participantId, count }) => setRoster((rows) => rows.map((row) => Number(row.id) === Number(participantId) ? { ...row, tab_out_count: count } : row)));
    const heartbeat = setInterval(() => socket.emit("teacher:heartbeat", { sessionId: Number(id) }), 5000);
    return () => {
      clearInterval(heartbeat);
      socket.removeAllListeners();
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [id, guestMode]);

  const currentQ = useMemo(() => state ? questions[Number(state.current_question_index || 0)] || null : null, [state, questions]);
  const isGuestHost = guestMode || !!state?.is_guest_host;
  const isEnded = state?.status === "ENDED";
  const isLive = state?.status === "LIVE";
  const isPaused = state?.status === "PAUSED";
  const joinMode = state?.join_mode || "SOLO";
  const isLast = !!state && Number(state.current_question_index || 0) >= Math.max(0, questions.length - 1);
  const rosterStats = useMemo(() => {
    const active = roster.filter((row) => !row.kicked_at);
    const connectedCount = active.filter((row) => Number(row.connected) === 1).length;
    const unassignedRows = active.filter((row) => !row.group_id);
    return { active, connectedCount, unassignedRows };
  }, [roster]);
  const activeRoster = rosterStats.active;
  const connected = rosterStats.connectedCount;
  const unassigned = rosterStats.unassignedRows;
  const canStart = joinMode !== "GROUP" || (groups.length > 0 && unassigned.length === 0);
  const expected = useMemo(() => joinMode === "GROUP"
    ? groups.filter((group) => (group.members || []).some((member) => Number(member.connected) === 1)).length
    : connected, [joinMode, groups, connected]);
  const sortedRoster = useMemo(() => [...roster].sort((a, b) => `${a.last_name || ""} ${a.first_name || ""}`.localeCompare(`${b.last_name || ""} ${b.first_name || ""}`)), [roster]);
  const leaders = useMemo(() => [...scores].sort((a, b) => Number(b.total_points || 0) - Number(a.total_points || 0)).slice(0, 3), [scores]);
  const scoreByParticipant = useMemo(() => new Map(scores.map((score) => [Number(score.participant_id), Number(score.total_points || 0)])), [scores]);
  const displayRoster = useMemo(() => tutorialDemo ? [...roster, ...tutorialBots] : roster, [tutorialDemo, roster, tutorialBots]);
  const sortedDisplayRoster = useMemo(() => [...displayRoster].sort((a, b) => `${a.last_name || ""} ${a.first_name || ""}`.localeCompare(`${b.last_name || ""} ${b.first_name || ""}`)), [displayRoster]);
  const displayScores = useMemo(() => {
    if (!tutorialDemo) return scores;
    const fakeRows = tutorialBots.map((bot, index) => ({ participant_id: bot.id, first_name: "ThinkBOT", last_name: String(index + 1), total_points: Number(tutorialBotScores[bot.id] || 0) }));
    return [...scores, ...fakeRows];
  }, [tutorialDemo, tutorialBots, tutorialBotScores, scores]);
  const displayLeaders = useMemo(() => [...displayScores].sort((a, b) => Number(b.total_points || 0) - Number(a.total_points || 0)).slice(0, 3), [displayScores]);
  const displayScoreByParticipant = useMemo(() => new Map(displayScores.map((score) => [Number(score.participant_id), Number(score.total_points || 0)])), [displayScores]);
  const displayExpected = tutorialDemo ? 3 : expected;
  const displayAnsweredCount = tutorialDemo ? tutorialAnsweredCount : answeredCount;
  const displayChoiceCounts = tutorialDemo ? tutorialChoiceCounts : choiceCounts;

  useEffect(() => {
    if (guestMode || !tutorialUserId || activeRoster.length < 5 || tabTutorialOpen) return;
    if (readTutorialState(tutorialUserId).fiveStudentTabSeen) return;
    setTabTutorialOpen(true);
  }, [guestMode, tutorialUserId, activeRoster.length, tabTutorialOpen]);

  useEffect(() => {
    if (tutorialDemo) return;
    if (!isLive || expected <= 0 || answeredCount < expected) return;
    if (isLast) setFinishedPrompt(true);
    else { setAdvanceReason("answered"); setAutoNextCount(5); setAllAnsweredPrompt(true); }
  }, [answeredCount, expected, isLive, isLast, tutorialDemo]);

  useEffect(() => {
    if (!allAnsweredPrompt) return undefined;
    if (autoNextCount <= 0) {
      setAllAnsweredPrompt(false);
      nextQuestion();
      return undefined;
    }
    const timeout = setTimeout(() => setAutoNextCount((value) => value - 1), 1000);
    return () => clearTimeout(timeout);
  }, [allAnsweredPrompt, autoNextCount]);

  const timer = useMemo(() => {
    const total = Number(currentQ?.config_json?.timeLimitSec || state?.time_limit_sec || 0);
    if (!currentQ) return { remainingSec: 0, progress: 0, total };
    if (isPaused) {
      const pausedRemaining = Number(state?.paused_remaining_sec);
      if (Number.isFinite(pausedRemaining) && pausedRemaining >= 0) return { remainingSec: pausedRemaining, progress: total ? pausedRemaining / total : 0, total };
    }
    if (!isLive) return { remainingSec: 0, progress: 0, total };
    const serverNowMs = nowMs - clockOffsetMs;
    const startsAt = state?.question_started_at ? new Date(state.question_started_at).getTime() : 0;
    if (startsAt && startsAt > serverNowMs) {
      return { remainingSec: total, progress: total ? 1 : 0, total };
    }
    const deadline = state?.question_deadline_at
      ? new Date(state.question_deadline_at).getTime()
      : startsAt
        ? startsAt + total * 1000
        : 0;
    const remaining = Math.max(0, Math.ceil((deadline - serverNowMs) / 1000));
    return { remainingSec: remaining, progress: total ? Math.min(1, remaining / total) : 0, total };
  }, [currentQ, state, isLive, isPaused, nowMs, clockOffsetMs]);

  useEffect(() => {
    if (tutorialDemo) return;
    if (!isLive || !currentQ || timer.remainingSec !== 0 || allAnsweredPrompt || finishedPrompt) return;
    const questionKey = String(currentQ.id ?? state?.current_question_index ?? "");
    if (timedOutQuestionRef.current === questionKey) return;
    timedOutQuestionRef.current = questionKey;
    if (isLast) {
      setFinishedPrompt(true);
      return;
    }
    setAdvanceReason("timeup");
    setAutoNextCount(5);
    setAllAnsweredPrompt(true);
  }, [isLive, isLast, currentQ?.id, state?.current_question_index, timer.remainingSec, allAnsweredPrompt, finishedPrompt, tutorialDemo]);

  useEffect(() => {
    if (!(isLive && isLast && currentQ && timer.remainingSec === 0)) {
      lastQuestionEndedAtRef.current = null;
      return undefined;
    }
    if (!lastQuestionEndedAtRef.current) {
      lastQuestionEndedAtRef.current = Date.now();
      lastTeacherActionRef.current = Date.now();
    }
    const interval = setInterval(() => {
      const inactiveSince = Math.max(lastQuestionEndedAtRef.current || 0, lastTeacherActionRef.current || 0);
      if (Date.now() - inactiveSince >= 3 * 60 * 1000) {
        socketRef.current?.emit("teacher:setStatus", { sessionId: Number(id), status: "ENDED" });
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [id, isLive, isLast, currentQ?.id, timer.remainingSec]);


  useEffect(() => {
    if (!tutorialDemo || hostTutorialStage !== "participants") return undefined;
    const raf = window.requestAnimationFrame(() => {
      const attendance = document.querySelector('[data-tutorial="host-panel-participants"]');
      if (attendance?.scrollIntoView) attendance.scrollIntoView({ behavior: "auto", block: "center" });
      else window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [tutorialDemo, hostTutorialStage]);

  // Tutorial-only student simulation. These rows never touch the server and exist
  // only to demonstrate what a real live class looks like to a first-time host.
  useEffect(() => {
    if (!tutorialDemo || tutorialJoinStartedRef.current) return undefined;
    tutorialJoinStartedRef.current = true;
    let cancelled = false;
    const timers = [];
    const bots = buildTutorialBots();
    let elapsed = 2000;
    bots.forEach((bot, index) => {
      if (index > 0) elapsed += 1000 + Math.floor(Math.random() * 4001);
      timers.push(window.setTimeout(() => {
        if (cancelled) return;
        setTutorialBots((current) => current.some((row) => row.id === bot.id) ? current : [...current, bot]);
      }, elapsed));
    });
    return () => { cancelled = true; timers.forEach((timerId) => window.clearTimeout(timerId)); };
  }, [tutorialDemo]);

  useEffect(() => {
    if (!tutorialDemo || !isLive || !currentQ) return undefined;
    const questionKey = String(currentQ.id ?? state?.current_question_index ?? "");
    if (!questionKey || tutorialAnswerRunRef.current === questionKey) return undefined;
    tutorialAnswerRunRef.current = questionKey;
    const alreadyAnswered = Math.max(0, Math.min(3, Number(tutorialAnsweredCount || 0)));
    if (alreadyAnswered >= 3) return undefined;
    const timers = [];
    const tt = normalizeTemplateType(state?.template_type);
    const correctIndex = tutorialCorrectChoiceIndex(currentQ, tt);
    const wrongIndex = tutorialWrongChoiceIndex(currentQ, tt, correctIndex);
    let elapsed = 1000 + Math.floor(Math.random() * 4001);
    [0, 1, 2].slice(alreadyAnswered).forEach((botIndex, remainingIndex) => {
      if (remainingIndex > 0) elapsed += 1000 + Math.floor(Math.random() * 4001);
      timers.push(window.setTimeout(() => {
        setTutorialAnsweredCount((value) => Math.min(3, value + 1));
        const questionIndex = Number(state?.current_question_index || 0);
        const thinkBot2Correct = questions.length > 1 && questionIndex === 0;
        if ((tt === "MCQ" || tt === "TRUE_FALSE") && correctIndex >= 0) {
          const selected = botIndex === 0 || (botIndex === 1 && thinkBot2Correct) ? correctIndex : wrongIndex;
          if (selected >= 0) setTutorialChoiceCounts((current) => ({ ...current, [String(selected)]: Number(current[String(selected)] || 0) + 1 }));
        }
        const botId = -101 - botIndex;
        const points = tutorialQuestionMaxPoints(currentQ, tt, state?.points_per_question);
        const earned = botIndex === 0
          ? points
          : botIndex === 1
            ? (questions.length > 1 ? (questionIndex === 0 ? points : 0) : Math.max(0, points - 1))
            : 0;
        setTutorialBotScores((current) => ({ ...current, [botId]: Math.max(0, Math.round(Number(current[botId] || 0) + earned)) }));
      }, elapsed));
    });
    return () => timers.forEach((timerId) => window.clearTimeout(timerId));
  }, [tutorialDemo, isLive, currentQ?.id, state?.current_question_index, state?.template_type, state?.points_per_question, questions.length]);

  useEffect(() => {
    if (!tutorialDemo || !tutorialUserId) return;
    writeTutorialState(tutorialUserId, {
      tutorialDemoSessionId: Number(id),
      ...(hostTutorialStage ? { tutorialDemoHostStage: hostTutorialStage } : {}),
      tutorialDemoBotScores: tutorialBotScores,
      ...(currentQ ? {
        tutorialDemoQuestionProgress: {
          questionKey: String(currentQ.id ?? state?.current_question_index ?? ""),
          questionIndex: Number(state?.current_question_index || 0),
          answeredCount: Math.max(0, Math.min(3, Number(tutorialAnsweredCount || 0))),
          choiceCounts: tutorialChoiceCounts || {},
        },
      } : {}),
    });
  }, [tutorialDemo, tutorialUserId, tutorialBotScores, tutorialAnsweredCount, tutorialChoiceCounts, hostTutorialStage, currentQ?.id, state?.current_question_index, id]);

  useEffect(() => {
    if (!tutorialDemo || !isLive || !currentQ || tutorialAnsweredCount < 3) return undefined;
    const tutorialTemplate = normalizeTemplateType(state?.template_type);
    const isBatchTutorial = ["MATCHING", "THINK_SPELL"].includes(tutorialTemplate);
    // Question-based templates keep the final question visible until its timer
    // actually finishes. Matching/Crossword are batch activities, so the demo
    // may continue as soon as the three ThinkBOT responses are complete.
    if (!isBatchTutorial && timer.remainingSec !== 0) return undefined;
    const timerId = window.setTimeout(() => {
      if (isLast) {
        window.scrollTo({ top: 0, behavior: "smooth" });
        setHostTutorialStage("end");
      } else {
        nextQuestion();
      }
    }, isLast ? 2000 : 900);
    return () => window.clearTimeout(timerId);
  }, [tutorialDemo, isLive, currentQ?.id, timer.remainingSec, tutorialAnsweredCount, isLast, state?.template_type]);

  useEffect(() => {
    if (!tutorialDemo || hostTutorialStage !== "question_delay" || !isLive) return undefined;
    const timerId = window.setTimeout(() => {
      setHostTutorialStage("question");
    }, 2000);
    return () => window.clearTimeout(timerId);
  }, [tutorialDemo, hostTutorialStage, isLive]);

  useEffect(() => {
    if (hostTutorialStage !== "question_metrics") return undefined;
    const nodes = Array.from(document.querySelectorAll('[data-tutorial="host-question-metrics"], [data-tutorial="host-question-progress"]'));
    const previous = new Map();
    nodes.forEach((node) => {
      previous.set(node, node.style.getPropertyValue("--tw-template-tutorial-highlight"));
      node.style.setProperty("--tw-template-tutorial-highlight", accent);
      node.classList.add("tw-tutorial-host-metrics-pulse");
    });
    return () => nodes.forEach((node) => {
      node.classList.remove("tw-tutorial-host-metrics-pulse");
      const oldValue = previous.get(node);
      if (oldValue) node.style.setProperty("--tw-template-tutorial-highlight", oldValue);
      else node.style.removeProperty("--tw-template-tutorial-highlight");
    });
  }, [hostTutorialStage, state?.current_question_index, accent]);

  useEffect(() => {
    if (hostTutorialStage === "ending" && isEnded) setHostTutorialStage("analytics");
  }, [hostTutorialStage, isEnded]);

  useEffect(() => {
    if (!tutorialDemo || !isPaused || !hostTutorialStage || ["participants", "code", "start"].includes(hostTutorialStage)) return undefined;
    let attempts = 0;
    const interval = window.setInterval(() => {
      attempts += 1;
      if (socketRef.current?.connected) {
        socketRef.current.emit("teacher:setStatus", { sessionId: Number(id), status: "LIVE" });
        window.clearInterval(interval);
      } else if (attempts >= 20) {
        window.clearInterval(interval);
      }
    }, 250);
    return () => window.clearInterval(interval);
  }, [tutorialDemo, isPaused, hostTutorialStage, id]);


  useEffect(() => () => {
    if (countdownWaitRef.current?.timer) clearTimeout(countdownWaitRef.current.timer);
    countdownWaitRef.current?.resolve?.(false);
    countdownWaitRef.current = null;
  }, []);

  function waitForCountdownTick() {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (countdownWaitRef.current?.timer === timer) countdownWaitRef.current = null;
        resolve(true);
      }, 1000);
      countdownWaitRef.current = { timer, resolve };
    });
  }

  async function startWithCountdown() {
  if (starting) return;

  if (!canStart) {
    setMsg("Create groups and assign all joined students before starting.");
    return;
  }

  const socket = socketRef.current;

  if (!socket?.connected) {
    setMsg("Connection to the live session was lost. Please refresh and try again.");
    return;
  }

  setStarting(true);

  try {
    for (let value = 3; value >= 1; value -= 1) {
      setCountdown(value);

      const keepGoing = await waitForCountdownTick();
      if (!keepGoing) return;
    }

    if (!socket.connected) {
      setMsg("Connection lost while starting the session.");
      return;
    }

    setCountdown(0);

    socket.emit("teacher:setStatus", {
      sessionId: Number(id),
      status: "LIVE",
    });
  } finally {
    setStarting(false);
  }
}

  function nextQuestion() {
    if (!isLive || isLast) return;
    socketRef.current?.emit("teacher:nextQuestion", { sessionId: Number(id) });
  }

  async function runConfirmed() {
    const action = confirmAction;
    setConfirmAction(null);
    if (action === "toggle") {
      if (isLive) socketRef.current?.emit("teacher:setStatus", { sessionId: Number(id), status: "PAUSED" });
      else if (isPaused) socketRef.current?.emit("teacher:setStatus", { sessionId: Number(id), status: "LIVE" });
      else {
        await startWithCountdown();
        if (hostTutorialStage === "start") setHostTutorialStage("end");
      }
    }
    if (action === "end") {
      socketRef.current?.emit("teacher:setStatus", { sessionId: Number(id), status: "ENDED" });
      if (hostTutorialStage === "end") setHostTutorialStage("analytics");
    }
  }

  async function handlePrimaryControl() {
    if (tutorialDemo && hostTutorialStage === "start" && !isLive && !isPaused) {
      setHostTutorialStage("countdown");
      // Revision 10.14: move the teacher to the question area immediately after
      // Start is pressed. The explanatory dialogue can appear afterwards.
      window.requestAnimationFrame(() => {
        document.querySelector('[data-tutorial="host-question-content"]')?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      await startWithCountdown();
      setHostTutorialStage("question_delay");
      return;
    }
    setConfirmAction("toggle");
  }

  function handleEndControl() {
    if (tutorialDemo && hostTutorialStage === "end") {
      if (tutorialUserId) writeTutorialState(tutorialUserId, { tutorialDemoSessionId: Number(id), tutorialDemoBotScores: tutorialBotScores });
      setHostTutorialStage("ending");
      socketRef.current?.emit("teacher:setStatus", { sessionId: Number(id), status: "ENDED" });
      return;
    }
    setConfirmAction("end");
  }

  function openAnalyticsFromTutorial() {
    if (tutorialUserId) writeTutorialState(tutorialUserId, { hostPanelSeen: true, ...(tutorialDemo ? { tutorialDemoSessionId: Number(id), tutorialDemoBotScores: tutorialBotScores } : {}) });
    setHostTutorialStage(null);
    navigate(isGuestHost ? `/guest/analytics/${id}` : `/teacher/analytics/${id}`);
  }

  const selectedBackground = useMemo(() => getSessionBackground(state?.background_key), [state?.background_key]);
  const experienceBackground = useMemo(() => selectedBackground
    ? `linear-gradient(${dark ? "rgba(4,12,28,.64),rgba(4,12,28,.72)" : "rgba(255,255,255,.50),rgba(242,247,255,.65)"}), url("${selectedBackground.src}")`
    : C.pageBg, [selectedBackground, dark, C.pageBg]);


  if (!state) return <div style={{ minHeight: "100vh", background: C.pageBg, display: "grid", placeItems: "center", color: C.muted }}>Loading session…</div>;

  const startLabel = starting ? `Starting in ${countdown}…` : isLive ? "Pause" : isPaused ? "Resume" : "Start";
  const sideBorder = dark ? "rgba(226,232,240,.42)" : "rgba(15,23,42,.28)";
  const joinUrl = `${window.location.origin}/play?code=${encodeURIComponent(state.join_code || "")}`;
  const disableControl = starting || (isLast && isLive && timer.remainingSec === 0);

  return <div className="tw-host-live tw-host-live-v24 tw-host-live-v25" style={{ minHeight: "100vh", backgroundImage: experienceBackground, backgroundSize: "cover", backgroundPosition: "center", backgroundAttachment: "fixed", color: C.text, "--host-accent": C.accent, "--host-soft": `${C.accent}18`, "--host-side-border": sideBorder, "--host-action-icon": dark ? "#fff" : "#0f172a" }}>
    <header className="tw-host-header" style={{ background: C.headerBg, borderColor: C.border }}>
      <div>
        <div className="tw-host-brand"><span>Think</span><span>WAVE</span><small>Host Panel</small></div>
        <div className="tw-host-status"><StatusPill label={state.status} kind={isLive ? "green" : isEnded ? "neutral" : "yellow"}/>{!isGuestHost && <StatusPill label={joinMode === "GROUP" ? "Group Mode" : "Solo Mode"} kind="blue"/>}{msg && <span style={{ color: C.muted }}>{msg}</span>}</div>
      </div>
      <div className="tw-host-actions">
        {isEnded && <TeacherPressButton tone="blue" className="tw-host-action-button tw-host-control-white-icon" icon="home" onClick={() => navigate(isGuestHost ? "/guest" : "/teacher", { state: { tab: isGuestHost ? "history" : "home" } })}>Dashboard</TeacherPressButton>}
        {!isEnded && <>
          <TeacherPressButton data-tutorial="host-panel-start" tone="blue" className="tw-host-action-button tw-host-control-white-icon" icon={isLive ? "pause" : "play"} onClick={handlePrimaryControl} disabled={disableControl || (tutorialDemo && hostTutorialStage === "start" && tutorialBots.length < 3)}>{startLabel}</TeacherPressButton>
          <TeacherPressButton data-tutorial="host-panel-end" tone="red" className="tw-host-action-button tw-host-control-white-icon" icon="stop" onClick={handleEndControl}>End</TeacherPressButton>
        </>}
      </div>
    </header>

    <main className="tw-host-main tw-host-main-v24">
      <section className="tw-host-scoreboard" style={{ ...card(C), background: dark ? "#16213c" : "#dbeafe" }}>
        <div className="tw-host-section-title"><h3><TwIcon name="trophy" size={21}/>Top Scores</h3></div>
        <Podium leaders={displayLeaders} C={C}/>
      </section>

      {!isEnded ? <div className="tw-host-content-grid">
        <section data-tutorial="host-question-content" className="tw-host-question-card" style={{ ...card(C), border: `4px solid ${dark ? "#2563eb" : "#1d4ed8"}` }}>
          <div className="tw-host-question-head">
            <div><h2>{state.quiz_title || "Quiz"}</h2><span className="tw-host-question-count">{state.template_type === "MATCHING" ? "Batch" : "Question"} {Number(state.current_question_index || 0) + 1} of {questions.length}</span></div>
            <div data-tutorial="host-question-metrics" className="tw-host-question-meta">
              <StatusPill label={`${displayAnsweredCount}/${displayExpected} answered`} kind="blue"/>
              <StatusPill label={`${Number(currentQ?.config_json?.points ?? state?.points_per_question ?? 1)} pts`} kind="blue"/>
              <StatusPill label={fmtTime(timer.remainingSec)} kind={timer.remainingSec <= 5 && isLive ? "red" : "green"}/>
              {isLive && !isLast && <TeacherPressButton tone="blue" className="tw-host-action-button tw-host-control-white-icon" icon="arrowRight" onClick={nextQuestion}>Next</TeacherPressButton>}
            </div>
          </div>
          <div data-tutorial="host-question-progress" className="tw-host-progress" style={{ background: C.border }}><div style={{ width: `${Math.round(timer.progress * 100)}%`, background: timer.remainingSec <= 5 ? "#ef4444" : C.accent }}/></div>
          <div className="tw-host-prompt" style={{ background: C.cardBg2, borderColor: C.border }}><h3 style={{ fontSize: fitHostTextSize(currentQ?.prompt, 31, 17) }}>{currentQ?.prompt || "Waiting for the first question"}</h3>{currentQ && <QuestionPreview q={currentQ} templateType={state.template_type} C={C} choiceCounts={displayChoiceCounts}/>}</div>
        </section>
        <div className="tw-host-right-stack">
          <section data-tutorial="host-panel-participants" className="tw-host-attendance" style={{ ...card(C), border: `3px solid ${sideBorder}` }}>
            <div className="tw-host-section-title"><h3><TwIcon name="users" size={21}/> {isGuestHost ? "Participants" : "Student Attendance"}</h3><span style={{ color: C.muted, fontSize: 12 }}>{tutorialDemo ? displayRoster.filter((row) => !row.kicked_at).length : activeRoster.length} joined</span></div>
            <div className="tw-host-attendance-scroll">{sortedDisplayRoster.map((row) => <AttendanceRow key={row.id} row={row} score={displayScoreByParticipant.get(Number(row.id)) || 0} C={C}/>)}{!sortedDisplayRoster.length && <div style={{ color: C.muted, textAlign: "center", padding: 24 }}>No participants have joined yet.</div>}</div>
          </section>
          <section data-tutorial="host-panel-code" className="tw-host-join" style={{ ...card(C), border: `3px solid ${sideBorder}` }}>
            <div className="tw-host-section-title"><h3><TwIcon name="qr" size={21}/> {isGuestHost ? "Join Code" : "Guest Join"}</h3><b style={{ color: C.accent, letterSpacing: ".18em" }}>{state.join_code}</b></div>
            <div className="tw-host-qr"><QRCodeCanvas value={joinUrl} size={116} bgColor="#ffffff" fgColor="#0f172a" includeMargin/></div>
            {joinMode === "GROUP" && state.status === "LOBBY" && <div className="tw-host-group-tools"><button onClick={() => socketRef.current?.emit("teacher:addGroup", { sessionId: Number(id) })} style={btnStyle(C, "secondary")}><TwIcon name="plus" size={15}/> Add Group</button><div>{groups.map((group) => <button key={group.id} onClick={() => setDeleteGroupTarget(group)} style={btnStyle(C, "ghost")}>{group.display_name} ({group.members?.length || 0})</button>)}</div></div>}
          </section>
        </div>
      </div> : <section className="tw-host-ended-shell" style={card(C)}><div className="tw-host-ended-card"><h2>Session ended</h2><TeacherPressButton data-tutorial="host-panel-analytics" tone="blue" icon="chart" onClick={openAnalyticsFromTutorial}>Open Analytics</TeacherPressButton></div></section>}
    </main>

    <ThemeIconButton dark={dark} onClick={toggleTheme} className="tw-host-floating-theme" size={22} />

    {!tabTutorialOpen && hostTutorialStage === "participants" && (
      <ThinkBotTutorial accentColor={accent} target='[data-tutorial="host-panel-participants"]' placement="left" square clickAnywhere allowTargetInteraction={false} onClickAnywhere={() => { window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" }); setHostTutorialStage("code"); }}>
        <p><strong>Welcome to your Host Panel!</strong></p>
        <p>Students or Guests joining your live session will appear here.</p>
      </ThinkBotTutorial>
    )}
    {!tabTutorialOpen && hostTutorialStage === "code" && (
      <ThinkBotTutorial accentColor={accent} target='[data-tutorial="host-panel-code"]' placement="left" square clickAnywhere allowTargetInteraction={false} onClickAnywhere={() => { window.scrollTo({ top: 0, behavior: "smooth" }); setHostTutorialStage("start"); }}>
        <p>If someone still needs to join, share this code with them.</p>
      </ThinkBotTutorial>
    )}
    {!tabTutorialOpen && hostTutorialStage === "start" && <ThinkBotTutorial accentColor={accent} target='[data-tutorial="host-panel-start"]' placement="below" square highlightMode="target"><p>Once everyone is ready, start the activity from here.</p></ThinkBotTutorial>}
    {!tabTutorialOpen && ["countdown", "question_delay", "ending"].includes(hostTutorialStage) && <ThinkBotTutorial accentColor={accent} />}
    {!tabTutorialOpen && hostTutorialStage === "question" && (
      <ThinkBotTutorial accentColor={accent} target='[data-tutorial="host-question-content"]' placement="screen-left" square dialogWidth={360} clickAnywhere allowTargetInteraction={false} onClickAnywhere={() => setHostTutorialStage("question_metrics")}>
        <p>This is the question content area. It displays the current question the students are answering on their screens.</p>
      </ThinkBotTutorial>
    )}
    {!tabTutorialOpen && hostTutorialStage === "question_metrics" && (
      <ThinkBotTutorial accentColor={accent} target='[data-tutorial="host-question-content"]' placement="screen-left" square dialogWidth={360} highlight={false} allowTargetInteraction={false}>
        <p>This is the question content area. It displays the current question the students are answering on their screens.</p>
        <p className="tw-tutorial-fade-line">You can see how many have already answered, how many points the question is worth, and the timer.</p>
      </ThinkBotTutorial>
    )}
    {!tabTutorialOpen && hostTutorialStage === "end" && <ThinkBotTutorial accentColor={accent} target='[data-tutorial="host-panel-end"]' placement="below" square highlightMode="target"><p>When your class is finished, use <strong>End Session</strong>.</p></ThinkBotTutorial>}
    {!tabTutorialOpen && hostTutorialStage === "analytics" && <ThinkBotTutorial accentColor={accent} target='[data-tutorial="host-panel-analytics"]' placement="right" dialogWidth={390} highlightMode="target"><p>Ending the session closes live gameplay and saves the session results so you can review them in <strong>Analytics</strong>.</p></ThinkBotTutorial>}

    {tabTutorialOpen && <ThinkBotTutorial accentColor={accent} target='[data-tutorial="host-tab-out"]' placement="left" square clickAnywhere allowTargetInteraction={false} onClickAnywhere={() => { if (tutorialUserId) writeTutorialState(tutorialUserId, { fiveStudentTabSeen: true }); setTabTutorialOpen(false); }}><p>This counts the amount of times they leave the session.</p><p>When they reach <strong>2 counts</strong>, ThinkWAVE gives a warning. Reaching <strong>3</strong> will kick them out of the session due to suspicious actions.</p></ThinkBotTutorial>}

    <ActionDialog open={!!confirmAction} plainIcon flatSurface tone={confirmAction === "end" ? "red" : "blue"} icon={<TwIcon name={confirmAction === "end" ? "stop" : isLive ? "pause" : "play"} size={46}/>} title={confirmAction === "end" ? "End this session?" : isLive ? "Pause this session?" : isPaused ? "Resume this session?" : "Start this session?"} message={isLive && confirmAction !== "end" ? "The question timer and gameplay will pause for everyone." : ""} onClose={() => setConfirmAction(null)}><button className="tw-dialog-text-cancel" onClick={() => setConfirmAction(null)}>Cancel</button><button className={`tw-dialog-press ${confirmAction === "end" ? "is-red" : "is-blue"}`} onClick={runConfirmed}><span>{confirmAction === "end" ? "End" : isLive ? "Pause" : isPaused ? "Resume" : "Start"}</span></button></ActionDialog>
    <ActionDialog open={allAnsweredPrompt} icon={<TwIcon name="check" size={28}/>} title={advanceReason === "timeup" ? "Time is up" : "Everyone has answered"} message={advanceReason === "timeup" ? "Moving to the next question even if some participants did not submit." : ""} onClose={() => setAllAnsweredPrompt(false)}><button onClick={() => setAllAnsweredPrompt(false)} style={secondaryBtn(C, dark)}>Wait</button><button onClick={() => { setAllAnsweredPrompt(false); nextQuestion(); }} style={primaryBtn({ bg: C.accent, fg: "#fff", border: C.accent })}>Go to next ({autoNextCount})</button></ActionDialog>
    <ActionDialog open={finishedPrompt} plainIcon flatSurface tone="blue" icon={<TwIcon name="trophy" size={46}/>} title="Everyone has finished answering" message="You can end the session when you are ready." onClose={() => setFinishedPrompt(false)}><button onClick={() => setFinishedPrompt(false)} className="tw-dialog-text-cancel">Review scores</button><button className="tw-dialog-press is-blue" onClick={() => { setFinishedPrompt(false); socketRef.current?.emit("teacher:setStatus", { sessionId: Number(id), status: "ENDED" }); }}><span>End session</span></button></ActionDialog>
    <ActionDialog open={!!deleteGroupTarget} tone="red" icon={<TwIcon name="trash" size={28}/>} title="Delete group?" message={deleteGroupTarget ? `Delete ${deleteGroupTarget.display_name}? Its students will return to the waiting list.` : ""} onClose={() => setDeleteGroupTarget(null)}><button onClick={() => setDeleteGroupTarget(null)} style={secondaryBtn(C, dark)}>Cancel</button><button onClick={() => { socketRef.current?.emit("teacher:deleteGroup", { sessionId: Number(id), groupId: deleteGroupTarget.id }); setDeleteGroupTarget(null); }} style={primaryBtn({ bg: "#fee2e2", fg: "#dc2626", border: "#fca5a5" })}>Delete</button></ActionDialog>
  </div>;
}

const Podium = memo(function Podium({ leaders, C }) {
  const order = [leaders[1], leaders[0], leaders[2]];
  const places = [2, 1, 3];
  return <div className="tw-host-podium">{order.map((row, index) => {
    const place = places[index];
    const name = row ? (row.group_name || `${row.first_name || ""} ${row.last_name || ""}`.trim()) : "Waiting…";
    return <div key={place} className={`tw-host-podium-place place-${place}`}>
      <div className="tw-host-trophy"><TwIcon name="trophy" size={54} strokeWidth={2.2}/><span>{place}</span></div>
      <div className="tw-host-podium-platform"><b>{name}</b><span className="tw-host-podium-points">{Math.round(Number(row?.total_points || 0))} pts</span></div>
    </div>;
  })}</div>;
});
const AttendanceRow = memo(function AttendanceRow({ row, score, C }) { const count = Number(row.tab_out_count || 0); const kicked = !!row.kicked_at; const indicator = kicked ? "#ef4444" : Number(row.connected) === 1 ? "#22c55e" : "#94a3b8"; const tabColor = count >= 3 ? "#ef4444" : count === 2 ? "#f97316" : "#94a3b8"; return <div className="tw-host-attendance-row" style={{ borderColor: C.border, background: C.cardBg2 }}><span className="tw-host-online-dot" style={{ background: indicator }}/><span className="tw-host-student-name">{row.first_name} {row.last_name}</span><b>{Math.round(Number(score || 0))} pts</b>{kicked ? <span className="tw-host-kicked">Kicked</span> : <span/>}<span data-tutorial="host-tab-out" style={{ color: tabColor, fontSize: 12, fontWeight: 800 }}>{count} tab out{count === 1 ? "" : "s"}</span></div>; });
const QuestionPreview = memo(function QuestionPreview({ q, templateType, C, choiceCounts = {} }) {
  const cfg = q?.config_json || {};
  const correct = q?.correct_json || {};
  const tt = normalizeTemplateType(templateType);

  if (tt === "MCQ" || tt === "TRUE_FALSE") {
    const options = tt === "TRUE_FALSE"
      ? [{ text: "True", image: "" }, { text: "False", image: "" }]
      : (Array.isArray(cfg.options) ? cfg.options : []);
    return <div className="tw-host-options">{options.map((option, i) => {
      const text = typeof option === "object" ? option.text : option;
      const image = typeof option === "object" ? option.image : "";
      const oddLast = options.length % 2 === 1 && i === options.length - 1;
      return <div key={i} className={oddLast ? "is-odd-last" : ""} style={{ background: C.cardBg, borderColor: C.border }}>
        <span>{String.fromCharCode(65 + i)}</span>
        {image && <img src={image} alt=""/>}
        {!(tt === "MCQ" && cfg.mcqMode === "MODIFIED" && image) && <b style={{ fontSize: fitHostTextSize(text, 22, 13) }}>{text || "Image option"}</b>}
        <em className="tw-host-choice-count" aria-label={`${Number(choiceCounts[String(i)] || 0)} responses`}>{Number(choiceCounts[String(i)] || 0)}</em>
      </div>;
    })}</div>;
  }

  if (tt === "TYPE_ANSWER") {
    const answer = String(correct?.text || cfg?.answer || "").trim();
    return <div className="tw-host-identification-answer" style={{ background: C.cardBg, borderColor: C.border }}>
      <b style={{ fontSize: fitHostTextSize(answer || "No answer set", 24, 14) }}>{answer || "No answer set"}</b>
    </div>;
  }

  if (tt === "MATCHING") {
    const colA = Array.isArray(cfg.colA) ? cfg.colA : [];
    const sourceB = Array.isArray(cfg.colB) ? cfg.colB : [];
    const dummyB = Array.isArray(cfg.dummyB) ? cfg.dummyB : [];
    const pairedB = sourceB.slice(0, colA.length);
    const sourceTail = sourceB.slice(colA.length);
    const normalizedDummy = dummyB.length ? dummyB : sourceTail;
    const colB = [...pairedB, ...normalizedDummy];
    return <div className="tw-host-matching-preview">
      <div><h4>Column A</h4>{colA.map((row, i) => <HostMediaChoice key={i} item={row} fallback={`Item ${i + 1}`} C={C}/>)}</div>
      <div><h4>Column B</h4>{colB.map((row, i) => <HostMediaChoice key={i} item={row} fallback={`Choice ${i + 1}`} C={C}/>)}</div>
    </div>;
  }

  if (tt === "GUESS_WORD_4PICS") {
    return <div className="tw-host-pics">{[0, 1, 2, 3].map((i) => <div key={i}>{cfg.images?.[i] ? <img src={cfg.images[i]} alt=""/> : "?"}</div>)}</div>;
  }

  if (tt === "THINK_SPELL") {
    const words = Array.isArray(cfg.answers) && cfg.answers.length ? cfg.answers : (Array.isArray(correct.answers) ? correct.answers : []);
    const requestedGridSize = Math.max(5, Math.min(8, Number(cfg.gridSize || 6)));
    const signature = `${buildThinkSpellSignature({ questionId: 0, gridSize: requestedGridSize, words })}-${Number(cfg.gridSeed || 0)}`;
    const generated = buildThinkSpellGrid({ gridSize: requestedGridSize, words, seed: buildThinkSpellSeed(signature) });
    const gridSize = generated.gridSize;
    const grid = Array.isArray(cfg.grid) && cfg.grid.length === gridSize * gridSize ? cfg.grid : generated.grid;
    return <div className="tw-host-thinkspell-grid" style={{ gridTemplateColumns: `repeat(${gridSize}, minmax(0,1fr))` }}>
      {grid.map((letter, index) => <span key={`${signature}-${index}`}>{String(letter || "").toUpperCase()}</span>)}
    </div>;
  }

  return <div style={{ color: C.muted }}>Student interaction is shown on each learner’s screen.</div>;
});

const HostMediaChoice = memo(function HostMediaChoice({ item, fallback, C }) {
  const value = item && typeof item === "object" ? item : { text: String(item || "") };
  const text = String(value.text || "").trim();
  const image = String(value.image || "").trim();
  return <span className="tw-host-media-choice" style={{ background: C.cardBg, borderColor: C.border }}>
    {(text || !image) && <b style={{ fontSize: fitHostTextSize(text || fallback, 18, 12) }}>{text || fallback}</b>}
    {image && <img src={image} alt="" />}
  </span>;
});
function fitHostTextSize(text, max = 24, min = 12) { const length = String(text || "").length; if (length <= 28) return max; if (length >= 150) return min; return Math.max(min, Math.round(max - (length - 28) * ((max - min) / 122))); }
function sameQuestionSnapshot(a = [], b = []) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (Number(a[i]?.id) !== Number(b[i]?.id)) return false;
    if (a[i]?.prompt !== b[i]?.prompt) return false;
    if (JSON.stringify(a[i]?.config_json || null) !== JSON.stringify(b[i]?.config_json || null)) return false;
  }
  return true;
}
function tutorialQuestionMaxPoints(question, templateType, fallbackPoints = 1) {
  const perUnit = Math.max(1, Math.round(Number(question?.config_json?.points ?? fallbackPoints ?? 1)));
  if (templateType === "MATCHING") {
    const pairs = Array.isArray(question?.correct_json?.pairs) ? question.correct_json.pairs.length : 0;
    return Math.max(perUnit, perUnit * Math.max(1, pairs));
  }
  if (templateType === "THINK_SPELL") {
    const words = Array.isArray(question?.correct_json?.answers) && question.correct_json.answers.length
      ? question.correct_json.answers.length
      : (Array.isArray(question?.config_json?.answers) ? question.config_json.answers.length : 0);
    return Math.max(perUnit, perUnit * Math.max(1, words));
  }
  return perUnit;
}
function tutorialCorrectChoiceIndex(question, templateType) {
  const correct = question?.correct_json || {};
  if (templateType === "TRUE_FALSE") {
    const value = String(correct.choice ?? correct.text ?? "").trim().toLowerCase();
    return value === "false" || value === "1" ? 1 : 0;
  }
  if (templateType !== "MCQ") return -1;
  const cfg = question?.config_json || {};
  const choices = Array.isArray(correct.choices) ? correct.choices : [correct.choice].filter((value) => value !== undefined && value !== null);
  const first = choices[0];
  if (Number.isInteger(Number(first)) && String(first).trim() !== "") {
    const index = Number(first);
    if (index >= 0 && index < (cfg.options || []).length) return index;
  }
  const options = Array.isArray(cfg.options) ? cfg.options : [];
  const normalized = String(first ?? "").trim().toLowerCase();
  const found = options.findIndex((option) => String(option?.id ?? option?.text ?? option ?? "").trim().toLowerCase() === normalized);
  return found >= 0 ? found : 0;
}
function tutorialWrongChoiceIndex(question, templateType, correctIndex) {
  const optionCount = templateType === "TRUE_FALSE" ? 2 : Math.max(0, (question?.config_json?.options || []).length);
  if (optionCount <= 1) return correctIndex;
  for (let index = 0; index < optionCount; index += 1) if (index !== correctIndex) return index;
  return correctIndex;
}
function StatusPill({ label, kind = "neutral" }) { const palette = kind === "green" ? { bg: "#22c55e20", fg: "#22c55e", br: "#22c55e55" } : kind === "yellow" ? { bg: "#fbbf2420", fg: "#f59e0b", br: "#fbbf2455" } : kind === "red" ? { bg: "#ef444420", fg: "#ef4444", br: "#ef444455" } : kind === "blue" ? { bg: "#2b6cff20", fg: "#6792ff", br: "#2b6cff55" } : { bg: "#94a3b820", fg: "#94a3b8", br: "#94a3b855" }; return <span style={{ padding: "5px 11px", borderRadius: 999, fontSize: 12, fontWeight: 850, background: palette.bg, color: palette.fg, border: `1px solid ${palette.br}` }}>{label}</span>; }
function fmtTime(sec) { const value = Math.max(0, Number(sec || 0)); return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`; }
function card(C) { return { background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 20, padding: 20, boxShadow: `0 18px 42px ${C.accent}16` }; }
function btnStyle(C, variant) { const base = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "10px 15px", borderRadius: 11, fontSize: 13, fontWeight: 800, cursor: "pointer", transition: "all .2s", fontFamily: "inherit" }; if (variant === "primary") return { ...base, background: C.accent, color: "#fff", border: `1px solid ${C.accent}` }; if (variant === "danger") return { ...base, background: "#ef444420", color: "#ef4444", border: "1px solid #ef444455" }; return { ...base, background: C.cardBg2, color: C.text, border: `1px solid ${C.border}` }; }

function resumeTutorialHostStage(status, persistedStage) {
  const normalizedStatus = String(status || "LOBBY").toUpperCase();
  const stage = String(persistedStage || "");
  if (normalizedStatus === "ENDED") return "analytics";
  if (["LIVE", "PAUSED"].includes(normalizedStatus)) {
    if (["question", "question_metrics", "end", "ending"].includes(stage)) return stage;
    if (["countdown", "question_delay"].includes(stage)) return "question_delay";
    return "question_delay";
  }
  if (["participants", "code", "start"].includes(stage)) return stage;
  return "participants";
}

function buildTutorialBots() {
  return [1, 2, 3].map((number) => ({ id: -100 - number, first_name: "ThinkBOT", last_name: String(number), connected: 1, tab_out_count: 0, kicked_at: null, group_id: null, tutorial_bot: true }));
}
