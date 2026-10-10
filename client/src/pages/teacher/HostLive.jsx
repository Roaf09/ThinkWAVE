import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { makeSocket } from "../../lib/socket";
import { QRCodeCanvas } from "qrcode.react";
import { useTheme } from "../../context/ThemeContext";
import ActionDialog from "../../components/ActionDialog";
import { normalizeTemplateType } from "../../lib/templateTypes";
import { templateAccent } from "../../lib/templatePalette";
import ThemeIconButton from "../../components/ThemeIconButton";
import { TwLogoLoader } from "../../components/TwLogoLoader";
import { BOT_SKILLS, sampleBotAnswer, scoreBotAnswer, demoBotSeed, createBotRng } from "../../lib/tutorialBots";
import { TeacherPressButton } from "./TeacherUI";
import { TwIcon } from "../../components/TwUI";
import { getSessionBackground } from "../../lib/sessionBackgrounds";
import { buildCrosswordGrid, buildCrosswordSeed, buildCrosswordSignature } from "../../lib/crossword";
import ThinkBotTutorial from "../../components/ThinkBotTutorial";
import { readTutorialState, writeTutorialState } from "../../lib/tutorialState";

function useHostIsMobile(breakpoint = 760) {
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth <= breakpoint);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setIsMobile(window.innerWidth <= breakpoint);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [breakpoint]);
  return isMobile;
}

export default function HostLive({ guestMode = false }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { dark, toggleTheme } = useTheme();
  const hostIsMobile = useHostIsMobile();
  const [mobileSheet, setMobileSheet] = useState(null);
  const [sheetClosing, setSheetClosing] = useState(false);
  const [codeContinueReady, setCodeContinueReady] = useState(false);
  const sheetRef = useRef(null);
  const sheetDragRef = useRef(null);
  // Snap detents as fractions of viewport height (sheet canvas is 80dvh tall and
  // stuck to the bottom, so 0.8 shows it fully with translateY(0)). Dragging
  // moves via transform (compositor-friendly); transitions stay off mid-gesture
  // and spring back on release.
  const SHEET_DETENTS = [0.25, 0.5, 0.8];
  const SHEET_FULL = 0.8;
  const [sheetDetent, setSheetDetent] = useState(0.8);
  const sheetDetentRef = useRef(0.8);
  const sheetHeightPx = () => (typeof window !== "undefined" ? window.innerHeight : 800) * SHEET_FULL;
  const detentToOffset = (d) => Math.round((1 - d / SHEET_FULL) * sheetHeightPx());
  function closeMobileSheet() {
    if (!mobileSheet || sheetClosing) return;
    sheetRef.current?.classList.remove("is-dragging");
    sheetDragRef.current = null;
    setSheetClosing(true);
    window.setTimeout(() => { setMobileSheet(null); setSheetClosing(false); }, 300);
  }
  function openMobileSheet(kind) {
    setSheetClosing(false);
    // Opening from the FAB goes all the way up; switching tabs while open
    // keeps the current height instead of dropping back down.
    if (!mobileSheet) {
      sheetDetentRef.current = SHEET_FULL;
      setSheetDetent(SHEET_FULL);
    }
    const el = sheetRef.current;
    if (el) { el.classList.remove("is-dragging"); el.style.transform = ""; }
    // In GROUP mode the participants view is replaced by Groupings.
    setMobileSheet(kind === "participants" && state?.join_mode === "GROUP" ? "groupings" : kind);
  }
  function onSheetPointerDown(event) {
    const el = sheetRef.current;
    if (!el || !mobileSheet || sheetClosing) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch {}
    el.classList.add("is-dragging");
    sheetDragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startOffset: detentToOffset(sheetDetentRef.current),
      lastY: event.clientY,
      lastT: performance.now(),
      velocity: 0,
    };
  }
  function onSheetPointerMove(event) {
    const drag = sheetDragRef.current;
    const el = sheetRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !el) return;
    const now = performance.now();
    const dy = event.clientY - drag.lastY;
    const dt = Math.max(1, now - drag.lastT);
    drag.velocity = 0.7 * (dy / dt) + 0.3 * (drag.velocity || 0);
    drag.lastY = event.clientY;
    drag.lastT = now;
    const h = sheetHeightPx();
    const next = Math.min(h, Math.max(-h * 0.15, drag.startOffset + (event.clientY - drag.startY)));
    el.style.transform = `translateY(${Math.round(next)}px)`;
  }
  function endSheetDrag(event) {
    const drag = sheetDragRef.current;
    const el = sheetRef.current;
    sheetDragRef.current = null;
    if (!drag || !el) return;
    if (event && event.pointerId !== undefined && event.pointerId !== drag.pointerId) return;
    el.classList.remove("is-dragging");
    el.style.transform = "";
    const h = sheetHeightPx();
    const endOffset = drag.startOffset + ((event?.clientY ?? drag.lastY) - drag.startY);
    // Visible viewport fraction: offset 0 => full 0.8, offset h => hidden.
    const visible = SHEET_FULL * (1 - endOffset / h);
    const velocity = drag.velocity || 0;
    if (velocity > 0.6 || visible < 0.15) { closeMobileSheet(); return; }
    let best = SHEET_DETENTS[0];
    for (const d of SHEET_DETENTS) if (Math.abs(d - visible) < Math.abs(best - visible)) best = d;
    if (velocity < -0.6) {
      const higher = SHEET_DETENTS.find((d) => d > best);
      if (higher !== undefined) best = higher;
    }
    sheetDetentRef.current = best;
    setSheetDetent(best);
  }
  useEffect(() => {
    if (!mobileSheet) return undefined;
    const onKey = (event) => { if (event.key === "Escape") closeMobileSheet(); };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sheetRef.current?.focus?.();
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prevOverflow; };
  }, [mobileSheet]);
  const [state, setState] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [roster, setRoster] = useState([]);
  const [guestNotices, setGuestNotices] = useState([]);
  const notifiedGuestIdsRef = useRef(new Set());
  useEffect(() => {
    const fresh = (roster || []).filter((row) => row.guest_repeat && !row.kicked_at && !notifiedGuestIdsRef.current.has(Number(row.id)));
    if (!fresh.length) return;
    fresh.forEach((row) => notifiedGuestIdsRef.current.add(Number(row.id)));
    setGuestNotices((list) => [...list, ...fresh.map((row) => ({ id: Number(row.id), name: `${row.first_name || ""} ${row.last_name || ""}`.trim(), visits: Number(row.guest_visits || 0) }))].slice(-3));
  }, [roster]);
  const [groups, setGroups] = useState([]);
  const [scores, setScores] = useState([]);
  const [scoreMode, setScoreMode] = useState("normal");
  const [msg, setMsg] = useState("");
  const [loadError, setLoadError] = useState("");
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
  // Mobile tutorial: open the participants sheet the moment the welcome step
  // arrives so the dialog has something to sit above.
  useEffect(() => {
    if (!hostIsMobile) return undefined;
    if (hostTutorialStage === "participants" && !mobileSheet) openMobileSheet("participants");
    return undefined;
  }, [hostTutorialStage, hostIsMobile]);
  // 5+ groups need more room: raise an open sheet to full height.
  useEffect(() => {
    if (mobileSheet && (groups || []).length >= 5 && sheetDetentRef.current !== SHEET_FULL) {
      sheetDetentRef.current = SHEET_FULL;
      setSheetDetent(SHEET_FULL);
      if (sheetRef.current) sheetRef.current.style.transform = "";
    }
  }, [groups, mobileSheet]);
  // Mobile tutorial: the code step's continue affordance appears 2s after the
  // code tab is shown, not before it is tapped.
  useEffect(() => {
    setCodeContinueReady(false);
    if (hostTutorialStage !== "code" || !hostIsMobile || mobileSheet !== "code") return undefined;
    const timer = window.setTimeout(() => setCodeContinueReady(true), 2000);
    return () => window.clearTimeout(timer);
  }, [hostTutorialStage, hostIsMobile, mobileSheet]);
  const [tabTutorialOpen, setTabTutorialOpen] = useState(false);
  const [tutorialDemo, setTutorialDemo] = useState(false);
  const [tutorialBots, setTutorialBots] = useState([]);
  const [tutorialAnsweredCount, setTutorialAnsweredCount] = useState(0);
  const [tutorialChoiceCounts, setTutorialChoiceCounts] = useState({});
  const [tutorialBotScores, setTutorialBotScores] = useState({});
  const [tutorialBotCompetitive, setTutorialBotCompetitive] = useState({});
  const tutorialJoinStartedRef = useRef(false);
  const tutorialAnswerRunRef = useRef("");
  const socketRef = useRef(null);
  // Last time ANY socket message arrived. The 3s poll below is only a
  // fallback for dead sockets — while messages flow, polling is pure waste
  // (full state re-download + re-render storm on every tick).
  const lastSocketAtRef = useRef(0);
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
    setLoadError("");
    Promise.all([api.get(`/sessions/${id}/state`), api.get("/auth/me")])
      .then(([sessionRes, meRes]) => {
        const data = sessionRes.data;
        setState(data.session);
        setQuestions(data.questions || []);
        setRoster(data.participants || []);
        setGroups(data.groups || []);
        setScores(data.scores || []);
        setChoiceCounts(data.choiceCounts || {});
        if (data.session?.server_now_ms != null) setClockOffsetMs(Date.now() - Number(data.session.server_now_ms));
        else if (data.session?.server_now) setClockOffsetMs(Date.now() - new Date(data.session.server_now).getTime());
        currentQuestionIndexRef.current = Number(data.session?.current_question_index || 0);
        const uid = meRes?.data?.id || meRes?.data?.user?.id || null;
        setTutorialUserId(uid);
        const tutorialState = uid ? readTutorialState(uid) : {};
        const returningTutorialDemo = !guestMode && Number(tutorialState?.tutorialDemoSessionId) === Number(id) && data.session?.join_mode !== "GROUP";
        if (returningTutorialDemo) {
          setTutorialDemo(true);
          setTutorialBots(buildTutorialBots());
          setTutorialBotScores(tutorialState?.tutorialDemoBotScores || {});
          setTutorialBotCompetitive(tutorialState?.tutorialDemoBotCompetitive || {});
          tutorialJoinStartedRef.current = true;
          const questionIndex = Number(data.session?.current_question_index || 0);
          const currentTutorialQuestion = (data.questions || [])[questionIndex] || null;
          const questionKey = String(currentTutorialQuestion?.question_id ?? currentTutorialQuestion?.id ?? questionIndex);
          const savedProgress = tutorialState?.tutorialDemoQuestionProgress || null;
          const savedKey = String(savedProgress?.questionKey ?? "");
          if (savedProgress && (savedKey === questionKey || savedKey === String(currentTutorialQuestion?.id ?? questionIndex))) {
            setTutorialAnsweredCount(Math.max(0, Math.min(3, Number(savedProgress.answeredCount || 0))));
            setTutorialChoiceCounts(savedProgress.choiceCounts && typeof savedProgress.choiceCounts === "object" ? savedProgress.choiceCounts : {});
          }
          setHostTutorialStage(tutorialState.hostPanelSeen ? null : resumeTutorialHostStage(data.session?.status, tutorialState?.tutorialDemoHostStage));
        } else if (!guestMode && uid && !tutorialState.hostPanelSeen && data.session?.join_mode !== "GROUP") {
          setTutorialDemo(true);
          setHostTutorialStage("participants");
          writeTutorialState(uid, { tutorialDemoSessionId: Number(id), tutorialDemoHostStage: "participants" });
        }
      })
      .catch((err) => {
        const message = err?.response?.data?.message || err?.message || "Could not load session.";
        setMsg(message);
        setLoadError(message);
      });
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
    const touchSocket = () => { lastSocketAtRef.current = Date.now(); };
    // Fires for every incoming event (present + future): one stamp spot.
    if (typeof socket.onAny === "function") socket.onAny(touchSocket);
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
      if (payload.state?.server_now_ms != null) setClockOffsetMs(Date.now() - Number(payload.state.server_now_ms));
      else if (payload.state?.server_now) setClockOffsetMs(Date.now() - new Date(payload.state.server_now).getTime());
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
    socket.on("offline:updated", ({ participantId, count, questions }) => setRoster((rows) => rows.map((row) => Number(row.id) === Number(participantId) ? { ...row, offline_count: Number(count || 0), offline_questions: (questions || []).join(",") } : row)));
    socket.on("screenshot:updated", ({ participantId, count }) => setRoster((rows) => rows.map((row) => Number(row.id) === Number(participantId) ? { ...row, screenshot_count: count } : row)));
    socket.on("presence:interrupted", ({ participantId }) => setRoster((rows) => rows.map((row) => Number(row.id) === Number(participantId) ? { ...row, presenceInterrupted: true } : row)));
    socket.on("presence:screens", ({ participantId, extended }) => setRoster((rows) => rows.map((row) => Number(row.id) === Number(participantId) ? { ...row, extendedScreens: !!extended } : row)));
    socket.on("integrity:flag", ({ participantId, count }) => setRoster((rows) => rows.map((row) => Number(row.id) === Number(participantId) ? { ...row, integrity_count: Number(count || Number(row.integrity_count || 0) + 1) } : row)));
    const heartbeat = setInterval(() => socket.emit("teacher:heartbeat", { sessionId: Number(id) }), 5000);
    return () => {
      clearInterval(heartbeat);
      if (typeof socket.offAny === "function") {
        try { socket.offAny(touchSocket); } catch {}
      }
      socket.removeAllListeners();
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [id, guestMode]);

  // Polling fallback for dead sockets only (guest hosts, missed pushes).
  // While socket messages arrive (<10s since the last one), the poll skips —
  // firing it anyway re-downloads + re-renders the whole panel every 3s.
  useEffect(() => {
    if (!state || !["LOBBY", "LIVE", "PAUSED"].includes(state.status)) return undefined;
    const timer = window.setInterval(async () => {
      if (Date.now() - lastSocketAtRef.current < 10000) return;
      try {
        const { data } = await api.get(`/sessions/${id}/state`);
        if (Array.isArray(data.scores)) setScores(data.scores);
        if (Array.isArray(data.participants)) setRoster(data.participants);
        if (data.session) {
          setState((current) => ({ ...(current || {}), ...(data.session || {}) }));
          if (data.session?.server_now_ms != null) setClockOffsetMs(Date.now() - Number(data.session.server_now_ms));
        }
        if (Array.isArray(data.questions) && data.questions.length) {
          setQuestions((current) => (sameQuestionSnapshot(current, data.questions) ? current : data.questions));
        }
      } catch { /* socket remains primary; ignore poll failures */ }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [id, state?.status]);

  const currentQ = useMemo(() => state ? questions[Number(state.current_question_index || 0)] || null : null, [state, questions]);
  const isGuestHost = guestMode || !!state?.is_guest_host;
  const isEnded = state?.status === "ENDED";
  const isLive = state?.status === "LIVE";
  const isPaused = state?.status === "PAUSED";
  const joinMode = state?.join_mode || "SOLO";
  // questions.length can be 0 for a moment (initial load, a reconnect race
  // before a fresh snapshot lands) — treating that as "index >= -1" made
  // every question look like the last one, which armed the 3-minute
  // idle-then-auto-end effect below on any mid-session question, not just
  // the true final one. Without a known question count, this is never "last".
  const isLast = !!state && questions.length > 0 && Number(state.current_question_index || 0) >= questions.length - 1;
  const rosterStats = useMemo(() => {
    const active = roster.filter((row) => !row.kicked_at);
    const connectedCount = active.filter((row) => Number(row.connected) === 1).length;
    const unassignedRows = active.filter((row) => !row.group_id);
    const offlineTotal = roster.reduce((sum, row) => sum + Number(row.offline_count || 0), 0);
    return { active, connectedCount, unassignedRows, offlineTotal };
  }, [roster]);
  const activeRoster = rosterStats.active;
  // Running offline log for the whole session, shown beside the joined count.
  const offlineLogLabel = ` · ${rosterStats.offlineTotal} offline log${rosterStats.offlineTotal === 1 ? "" : "s"}`;
  const connected = rosterStats.connectedCount;
  const unassigned = rosterStats.unassignedRows;
  const canStart = joinMode !== "GROUP" || (groups.length > 0 && unassigned.length === 0);
  const expected = useMemo(() => joinMode === "GROUP"
    ? groups.filter((group) => (group.members || []).some((member) => Number(member.connected) === 1)).length
    : connected, [joinMode, groups, connected]);
  const displayRoster = useMemo(() => tutorialDemo ? [...roster, ...tutorialBots] : roster, [tutorialDemo, roster, tutorialBots]);
  const sortedDisplayRoster = useMemo(() => [...displayRoster].sort((a, b) => `${a.last_name || ""} ${a.first_name || ""}`.localeCompare(`${b.last_name || ""} ${b.first_name || ""}`)), [displayRoster]);
  const displayScores = useMemo(() => {
    if (!tutorialDemo) return scores;
    const fakeRows = tutorialBots.map((bot, index) => {
      const normal = Number(tutorialBotScores[bot.id] || 0);
      const meta = tutorialBotCompetitive[bot.id] || {};
      return { participant_id: bot.id, first_name: "ThinkBOT", last_name: String(index + 1), total_points: normal, competitive_points: Math.round(Number(meta.competitive || 0)), response_time_ms: Math.round(Number(meta.responseMs || 0)) };
    });
    return [...scores, ...fakeRows];
  }, [tutorialDemo, tutorialBots, tutorialBotScores, tutorialBotCompetitive, scores]);
  const displayLeaders = useMemo(() => [...displayScores].sort((a, b) => {
    const primary = scoreMode === "competitive"
      ? Number(b.competitive_points || 0) - Number(a.competitive_points || 0)
      : Number(b.total_points || 0) - Number(a.total_points || 0);
    if (primary) return primary;
    const secondary = scoreMode === "competitive"
      ? Number(b.total_points || 0) - Number(a.total_points || 0)
      : Number(b.competitive_points || 0) - Number(a.competitive_points || 0);
    if (secondary) return secondary;
    const aTime = Number(a.response_time_ms || a.completion_ms || Number.MAX_SAFE_INTEGER);
    const bTime = Number(b.response_time_ms || b.completion_ms || Number.MAX_SAFE_INTEGER);
    if (aTime !== bTime) return aTime - bTime;
    return Number(a.participant_id || a.group_id || Number.MAX_SAFE_INTEGER) - Number(b.participant_id || b.group_id || Number.MAX_SAFE_INTEGER);
  }).slice(0, 3), [displayScores, scoreMode]);
  // Attendance always shows the teacher/academic score. Competitive points only belong
  // to the Top Scores view and student-facing leaderboards.
  const displayScoreByParticipant = useMemo(() => new Map(displayScores.map((score) => [
    Number(score.participant_id),
    Number(score.total_points || 0),
  ])), [displayScores]);
  const displayExpected = tutorialDemo ? tutorialBots.length + expected : expected;
  const displayAnsweredCount = tutorialDemo ? tutorialAnsweredCount + answeredCount : answeredCount;
  const displayChoiceCounts = useMemo(() => {
    if (!tutorialDemo) return choiceCounts;
    const merged = { ...choiceCounts };
    Object.entries(tutorialChoiceCounts || {}).forEach(([key, value]) => { merged[key] = Number(merged[key] || 0) + Number(value || 0); });
    return merged;
  }, [tutorialDemo, tutorialChoiceCounts, choiceCounts]);

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
    const resumeHoldUntil = Number(state?.resume_hold_until_ms || 0);
    const resumeHoldRemaining = Number(state?.resume_hold_remaining_sec);
    if (resumeHoldUntil > serverNowMs && Number.isFinite(resumeHoldRemaining)) {
      return { remainingSec: Math.max(0, resumeHoldRemaining), progress: total ? Math.min(1, resumeHoldRemaining / total) : 0, total };
    }
    const startsAt = state?.question_started_at_ms != null
      ? Number(state.question_started_at_ms)
      : state?.question_started_at ? new Date(state.question_started_at).getTime() : 0;
    if (startsAt && startsAt > serverNowMs) {
      return { remainingSec: total, progress: total ? 1 : 0, total };
    }
    const deadline = state?.question_deadline_at_ms != null
      ? Number(state.question_deadline_at_ms)
      : state?.question_deadline_at
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
    // No group-mode bot tutorials: bots stay solo-style only.
    if (state?.join_mode === "GROUP") return undefined;
    const questionKey = String(currentQ?.question_id ?? currentQ?.id ?? state?.current_question_index ?? "");
    if (!questionKey || tutorialAnswerRunRef.current === questionKey) return undefined;
    tutorialAnswerRunRef.current = questionKey;
    const alreadyAnswered = Math.max(0, Math.min(3, Number(tutorialAnsweredCount || 0)));
    if (alreadyAnswered >= 3) return undefined;
    const timers = [];
    const config = currentQ?.config_json || {};
    const correct = currentQ?.correct_json || {};
    const basePoints = Number(config?.points ?? state?.points_per_question ?? 1);
    const timeLimitMs = Math.max(1, Number(config?.timeLimitSec ?? state?.time_limit_sec ?? 30)) * 1000;
    const questionStartedAt = Date.now();
    let elapsed = 1000 + Math.floor(Math.random() * 4001);
    [0, 1, 2].slice(alreadyAnswered).forEach((botIndex, remainingIndex) => {
      if (remainingIndex > 0) elapsed += 1000 + Math.floor(Math.random() * 4001);
      const delay = elapsed;
      timers.push(window.setTimeout(() => {
        setTutorialAnsweredCount((value) => Math.min(3, value + 1));
        // Each bot samples a student-like answer at its skill level, then the
        // REAL scorer + speed formula decide its points — nothing hardcoded.
        // Seeded per (session, question, bot) so host + analytics agree and
        // repeat visits stay stable; elapsed stays live-measured.
        const skill = BOT_SKILLS[botIndex]?.hitRate ?? 0.6;
        const botRng = createBotRng(demoBotSeed(id, questionKey, botIndex, "answer"));
        const { answer, selectedIndexes } = sampleBotAnswer({ templateType: state?.template_type, config, correct, skill, rng: botRng });
        const elapsedMs = Date.now() - questionStartedAt;
        const result = scoreBotAnswer({ templateType: state?.template_type, config, correct, answer, basePoints, elapsedMs, timeLimitMs });
        const tt = normalizeTemplateType(state?.template_type);
        if (tt === "MCQ" || tt === "TRUE_FALSE") {
          for (const selected of selectedIndexes) {
            if (selected >= 0) setTutorialChoiceCounts((current) => ({ ...current, [String(selected)]: Number(current[String(selected)] || 0) + 1 }));
          }
        }
        const botId = -101 - botIndex;
        const earned = result.timeExpired ? 0 : Number(result.pointsAwarded || 0);
        setTutorialBotScores((current) => ({ ...current, [botId]: Math.max(0, Number(current[botId] || 0) + earned) }));
        setTutorialBotCompetitive((current) => {
          const previous = current[botId] || {};
          return { ...current, [botId]: { competitive: Math.max(0, Number(previous.competitive || 0) + Number(result.competitivePoints || 0)), responseMs: Math.max(0, Number(previous.responseMs || 0) + elapsedMs) } };
        });
      }, delay));
    });
    return () => timers.forEach((timerId) => window.clearTimeout(timerId));
  }, [tutorialDemo, isLive, currentQ?.id, state?.current_question_index, state?.template_type, state?.points_per_question, state?.join_mode, questions.length]);

  useEffect(() => {
    if (!tutorialDemo || !tutorialUserId) return;
    writeTutorialState(tutorialUserId, {
      tutorialDemoSessionId: Number(id),
      ...(hostTutorialStage ? { tutorialDemoHostStage: hostTutorialStage } : {}),
      tutorialDemoBotScores: tutorialBotScores,
      tutorialDemoBotCompetitive: tutorialBotCompetitive,
      ...(currentQ ? {
        tutorialDemoQuestionProgress: {
          questionKey: String(currentQ?.question_id ?? currentQ?.id ?? state?.current_question_index ?? ""),
          questionIndex: Number(state?.current_question_index || 0),
          answeredCount: Math.max(0, Math.min(3, Number(tutorialAnsweredCount || 0))),
          choiceCounts: tutorialChoiceCounts || {},
        },
      } : {}),
    });
  }, [tutorialDemo, tutorialUserId, tutorialBotScores, tutorialBotCompetitive, tutorialAnsweredCount, tutorialChoiceCounts, hostTutorialStage, currentQ?.question_id, currentQ?.id, state?.current_question_index, id]);

  useEffect(() => {
    if (!tutorialDemo || !isLive || !currentQ || tutorialAnsweredCount < 3) return undefined;
    const tutorialTemplate = normalizeTemplateType(state?.template_type);
    const isBatchTutorial = ["MATCHING", "CROSSWORD"].includes(tutorialTemplate);
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
    }, 3000);
    return () => window.clearTimeout(timerId);
  }, [tutorialDemo, hostTutorialStage, isLive]);

  // The question-content explainer is now two short lines shown one at a time
  // instead of both stacked together: the first line fades in, then after a
  // beat automatically hands off to "question_metrics", which fades in the
  // second line in its place.
  useEffect(() => {
    if (!tutorialDemo || hostTutorialStage !== "question") return undefined;
    const timerId = window.setTimeout(() => {
      setHostTutorialStage("question_metrics");
    }, 3000);
    return () => window.clearTimeout(timerId);
  }, [tutorialDemo, hostTutorialStage]);

  function skipQuestionTutorial() {
    setHostTutorialStage("end");
  }

  useEffect(() => {
    if (hostTutorialStage !== "question_metrics") return undefined;
    const nodes = Array.from(document.querySelectorAll('[data-tutorial="host-question-metrics"], [data-tutorial="host-question-progress"]'));
    const previous = new Map();
    nodes.forEach((node) => {
      previous.set(node, node.style.getPropertyValue("--tw-template-tutorial-highlight"));
      node.style.setProperty("--tw-template-tutorial-highlight", "#ffffff");
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
    if (!canStart) { setMsg("Create groups and assign all joined students before starting."); return; }
    setStarting(true);
    for (let value = 3; value >= 1; value -= 1) {
      setCountdown(value);
      const keepGoing = await waitForCountdownTick();
      if (!keepGoing) return;
    }
    setCountdown(0);
    socketRef.current?.emit("teacher:setStatus", { sessionId: Number(id), status: "LIVE" });
    setStarting(false);
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
    if (hostIsMobile) { setMobileSheet(null); setSheetClosing(false); }
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


  if (!state) {
    if (loadError) return <div className="grid min-h-[100vh] place-items-center" style={{ background: C.pageBg, color: C.text }}><div style={{ textAlign: "center", display: "grid", gap: 12, justifyItems: "center" }}><div style={{ fontWeight: 900 }}>{loadError}</div><button type="button" onClick={() => window.location.reload()} style={{ padding: "10px 18px", borderRadius: 10, border: `1px solid ${C.border}`, background: C.cardBg, color: C.text, fontWeight: 800, cursor: "pointer" }}>Retry</button></div></div>;
    return <div className="grid min-h-[100vh] place-items-center" style={{ background: C.pageBg, color: C.muted }}><TwLogoLoader minHeight="60vh" /></div>;
  }

  const startLabel = starting ? `Starting in ${countdown}…` : isLive ? "Pause" : isPaused ? "Resume" : "Start";
  const sideBorder = `color-mix(in srgb, ${accent} ${dark ? 72 : 62}%, ${dark ? "#dbeafe" : "#0f172a"})`;
  const joinUrl = `${window.location.origin}/play?code=${encodeURIComponent(state.join_code || "")}`;
  const disableControl = starting || (isLast && isLive && timer.remainingSec === 0);

  return <div className="tw-host-live tw-host-live-v24 tw-host-live-v25 min-h-[100vh] bg-cover bg-center bg-fixed" style={{ backgroundImage: experienceBackground, color: C.text, "--host-accent": accent, "--host-soft": `${C.accent}18`, "--host-side-border": sideBorder, "--host-action-icon": dark ? "#fff" : "#0f172a" }}>
    <header className="tw-host-header" style={{ background: C.headerBg, borderColor: C.border }}>
      <div>
        <div className="tw-host-brand"><span>Think</span><span>WAVE</span><small>Host Panel</small></div>
        <div className="tw-host-status"><StatusPill label={state.status} kind={isLive ? "green" : isEnded ? "neutral" : "yellow"}/>{!isGuestHost && <StatusPill label={joinMode === "GROUP" ? "Group Mode" : "Solo Mode"} kind="blue"/>}{msg && <span style={{ color: C.muted }}>{msg}</span>}</div>
      </div>
      <div className="tw-host-actions">
        {isEnded && <TeacherPressButton tone="blue" className="tw-host-action-button tw-host-control-white-icon" onClick={() => navigate(isGuestHost ? "/guest" : "/teacher", { state: { tab: isGuestHost ? "history" : "home" } })}>Dashboard</TeacherPressButton>}
        {!isEnded && <>
          <TeacherPressButton data-tutorial="host-panel-start" tone="blue" className="tw-host-action-button tw-host-control-white-icon" icon={isLive ? "pause" : "play"} onClick={handlePrimaryControl} disabled={disableControl || (tutorialDemo && hostTutorialStage === "start" && tutorialBots.length < 3)}>{startLabel}</TeacherPressButton>
          <TeacherPressButton data-tutorial="host-panel-end" tone="red" className="tw-host-action-button tw-host-control-white-icon" icon="stop" onClick={handleEndControl}>End</TeacherPressButton>
        </>}
      </div>
    </header>

    <main className={`tw-host-main tw-host-main-v24${hostIsMobile ? " is-mobile-host" : ""}`}>
      <section className="tw-host-scoreboard" style={{ ...card(C), background: dark ? "#16213c" : "#dbeafe" }}>
        <div className="tw-host-section-title"><h3><TwIcon name="trophy" size={21}/>Top Scores</h3><button type="button" className="tw-host-score-mode-chip" onClick={() => setScoreMode((mode) => mode === "competitive" ? "normal" : "competitive")} title="Switch between competitive and normal points">{scoreMode === "competitive" ? "Competitive points" : "Normal points"}</button></div>
        <Podium leaders={displayLeaders} C={C} scoreMode={scoreMode} onToggleScoreMode={() => setScoreMode((mode) => mode === "competitive" ? "normal" : "competitive")}/>
      </section>

      {!isEnded ? <div className="tw-host-content-grid">
        <section data-tutorial="host-question-content" className="tw-host-question-card" style={{ ...card(C), border: `5px solid color-mix(in srgb, ${accent} 82%, ${C.border})`, boxShadow: `0 10px 0 color-mix(in srgb, ${accent} 44%, ${C.border}), 0 20px 42px ${accent}24` }}>
          <div className="tw-host-question-head">
            <div data-tutorial="host-quiz-title"><h2>{state.quiz_title || "Quiz"}</h2><span className="tw-host-question-count">{state.template_type === "MATCHING" ? "Batch" : "Question"} {Number(state.current_question_index || 0) + 1} of {questions.length}</span></div>
            <div data-tutorial="host-question-metrics" className="tw-host-question-meta">
              {hostIsMobile ? (
                <StatusPill className={`tw-host-white-metric${displayExpected > 0 && displayAnsweredCount >= displayExpected ? " is-complete" : ""}`} label={`${displayAnsweredCount}/${displayExpected} answered`} kind={displayExpected > 0 && displayAnsweredCount >= displayExpected ? "green" : "blue"}/>
              ) : (
                <StatusPill className={`tw-host-white-metric${displayExpected > 0 && displayAnsweredCount >= displayExpected ? " is-complete" : ""}`} label={`${displayAnsweredCount}/${displayExpected} answered`} kind={displayExpected > 0 && displayAnsweredCount >= displayExpected ? "green" : "blue"}/>
              )}
              <StatusPill className="tw-host-white-metric" label={`${tutorialQuestionMaxPoints(currentQ, normalizeTemplateType(state?.template_type), state?.points_per_question)} pts`} kind="blue"/>
              <span className={`tw-host-pixel-timer${timer.remainingSec <= 3 && isLive ? " is-danger" : timer.remainingSec <= 4 && isLive ? " is-warning" : ""}`} style={{ "--host-accent": "#22c55e" }}><TwIcon name="clock" size={20}/>{fmtTime(timer.remainingSec)}</span>
              {isLive && !isLast && <TeacherPressButton tone="blue" className="tw-host-action-button tw-host-control-white-icon tw-host-next-template" style={{ "--tw-press-face": accent, "--tw-press-base": `color-mix(in srgb, ${accent} 62%, #071024)`, "--tw-press-border": `color-mix(in srgb, ${accent} 58%, #fff)` }} icon="arrowRight" onClick={nextQuestion}>Next</TeacherPressButton>}
            </div>
          </div>
          <div data-tutorial="host-question-progress" className={`tw-host-progress tw-host-pixel-progress${timer.remainingSec <= 3 && isLive ? " is-danger" : timer.remainingSec <= 4 && isLive ? " is-warning" : ""}`} style={{ "--host-accent": accent }}><div style={{ width: `${Math.round(timer.progress * 100)}%` }}/></div>
          <div className="tw-host-prompt" style={{ background: C.cardBg2, borderColor: C.border }}><div style={{ width: "100%", boxSizing: "border-box", background: `color-mix(in srgb, ${accent} 12%, #ffffff)`, border: `3px solid ${accent}`, borderRadius: 8, padding: "20px 24px", minHeight: 130, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 6px 0 color-mix(in srgb, ${accent} 58%, #0f172a), 0 18px 34px ${accent}59, inset 0 2px 0 rgba(255,255,255,.8)` }}><h3 style={{ fontSize: fitHostTextSize(currentQ?.prompt, 31, 17), color: "#0f172a", textAlign: "center", margin: 0, overflowWrap: "anywhere" }}>{currentQ?.prompt || "Waiting for the first question"}</h3></div>{currentQ && <QuestionPreview q={currentQ} templateType={state.template_type} C={C} choiceCounts={displayChoiceCounts}/>}</div>
        </section>
        <div className={`tw-host-right-stack${hostIsMobile ? " is-mobile-hidden" : ""}`}>
          {joinMode === "GROUP" ? (
            <section data-tutorial="host-panel-groups" className="tw-host-attendance" style={{ ...card(C), border: `3px solid ${sideBorder}` }}>
              <div className="tw-host-section-title"><h3><TwIcon name="users" size={21}/> Groupings</h3><span className="text-[12px]" style={{ color: C.muted }}>{tutorialDemo ? displayRoster.filter((row) => !row.kicked_at).length : activeRoster.length} joined{offlineLogLabel}</span></div>
              <div className="tw-host-attendance-scroll"><GroupingsPanel groups={groups} roster={displayRoster} canAdd={state.status === "LOBBY"} onAddGroup={() => socketRef.current?.emit("teacher:addGroup", { sessionId: Number(id) })} onDeleteGroup={(group) => setDeleteGroupTarget(group)} C={C} /></div>
            </section>
          ) : (
            <section data-tutorial="host-panel-participants" className="tw-host-attendance" style={{ ...card(C), border: `3px solid ${sideBorder}` }}>
              <div className="tw-host-section-title"><h3><TwIcon name="users" size={21}/> {isGuestHost ? "Participants" : "Student Attendance"}</h3><span className="text-[12px]" style={{ color: C.muted }}>{tutorialDemo ? displayRoster.filter((row) => !row.kicked_at).length : activeRoster.length} joined{offlineLogLabel}</span></div>
              <div className="tw-host-attendance-scroll">{sortedDisplayRoster.map((row) => <AttendanceRow key={row.id} row={row} score={displayScoreByParticipant.get(Number(row.id)) || 0} C={C}/>)}{!sortedDisplayRoster.length && <div className="p-[24px] text-center" style={{ color: C.muted }}>No participants have joined yet.</div>}</div>
            </section>
          )}
          <section data-tutorial="host-panel-code" className="tw-host-join" style={{ ...card(C), border: `3px solid ${sideBorder}` }}>
            <div className="tw-host-section-title"><h3><TwIcon name="qr" size={21}/> {isGuestHost ? "Join Code" : "Guest Join"}</h3><b className="tracking-[.18em]" style={{ color: C.accent }}>{state.join_code}</b></div>
            <div className="tw-host-qr"><QRCodeCanvas value={joinUrl} size={116} bgColor="#ffffff" fgColor="#0f172a" includeMargin/></div>
          </section>
        </div>
      </div> : <section className="tw-host-ended-shell" style={card(C)}><div className="tw-host-ended-card"><h2>Session ended</h2><TeacherPressButton data-tutorial="host-panel-analytics" tone="blue" icon="chart" className="tw-host-open-analytics" style={{ "--host-accent": accent }} onClick={openAnalyticsFromTutorial}>Open Analytics</TeacherPressButton></div></section>}
      {hostIsMobile && mobileSheet && (
        <div className={`tw-host-mobile-sheet-backdrop${sheetClosing ? " is-closing" : ""}`} onClick={closeMobileSheet}>
          <div ref={sheetRef} data-tutorial="host-mobile-sheet" tabIndex={-1} className={`tw-host-mobile-sheet${mobileSheet === "code" ? " is-code" : ""}${sheetClosing ? " is-closing" : ""}`} role="dialog" aria-modal="true" aria-label={mobileSheet === "code" ? "Join code" : joinMode === "GROUP" ? "Groupings" : "Participants"} onClick={(e) => e.stopPropagation()} style={{ background: C.cardBg, borderColor: C.border, color: C.text, transform: `translateY(${sheetClosing ? 105 : Math.round((1 - sheetDetent / SHEET_FULL) * 100)}%)` }}>
            <div className="tw-host-sheet-dragzone" style={{ touchAction: "none" }} onPointerDown={onSheetPointerDown} onPointerMove={onSheetPointerMove} onPointerUp={endSheetDrag} onPointerCancel={endSheetDrag}>
              <div className="tw-builder-sheet-handle tw-host-sheet-handle-big" />
            </div>
            <div className="tw-host-mobile-sheet-tabs">
              {joinMode === "GROUP" ? (
                <button type="button" className={mobileSheet === "groupings" ? "is-active" : ""} onClick={() => openMobileSheet("groupings")}>Groupings</button>
              ) : (
                <button type="button" className={mobileSheet === "participants" ? "is-active" : ""} onClick={() => openMobileSheet("participants")}>Participants</button>
              )}
              <button type="button" data-tutorial="host-sheet-code-tab" className={mobileSheet === "code" ? "is-active" : ""} onClick={() => openMobileSheet("code")}>Code</button>
            </div>
            {mobileSheet === "code" ? (
              <div className="tw-host-mobile-sheet-body">
                <div className="tw-host-section-title"><h3><TwIcon name="qr" size={28}/> {isGuestHost ? "Join Code" : "Guest Join"}</h3><b className="tracking-[.18em]" style={{ color: C.accent }}>{state.join_code}</b></div>
                <div className="tw-host-qr"><QRCodeCanvas value={joinUrl} size={220} bgColor="#ffffff" fgColor="#0f172a" includeMargin/></div>
                <div className="tw-host-mobile-code-text text-center font-black tracking-[.18em]" style={{ color: C.accent }}>{state.join_code}</div>
              </div>
            ) : joinMode === "GROUP" ? (
              <div className="tw-host-mobile-sheet-body">
                <div className="tw-host-section-title"><h3><TwIcon name="users" size={28}/> Groupings</h3><span className="tw-host-joined-count" style={{ color: C.muted }}>{tutorialDemo ? displayRoster.filter((row) => !row.kicked_at).length : activeRoster.length} joined{offlineLogLabel}</span></div>
                <div className="tw-host-attendance-scroll"><GroupingsPanel groups={groups} roster={displayRoster} canAdd={state.status === "LOBBY"} onAddGroup={() => socketRef.current?.emit("teacher:addGroup", { sessionId: Number(id) })} onDeleteGroup={(group) => setDeleteGroupTarget(group)} C={C} /></div>
              </div>
            ) : (
              <div className="tw-host-mobile-sheet-body">
                <div className="tw-host-section-title"><h3><TwIcon name="users" size={28}/> {isGuestHost ? "Participants" : "Student Attendance"}</h3><span className="tw-host-joined-count" style={{ color: C.muted }}>{tutorialDemo ? displayRoster.filter((row) => !row.kicked_at).length : activeRoster.length} joined{offlineLogLabel}</span></div>
                <div className="tw-host-attendance-scroll">{sortedDisplayRoster.map((row) => <AttendanceRow key={row.id} row={row} score={displayScoreByParticipant.get(Number(row.id)) || 0} C={C}/>)}{!sortedDisplayRoster.length && <div className="p-[24px] text-center" style={{ color: C.muted }}>No participants have joined yet.</div>}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>

    <ThemeIconButton dark={dark} onClick={toggleTheme} className="tw-host-floating-theme" size={22} />
    {hostIsMobile && !mobileSheet && (
      <button type="button" className="tw-host-participants-fab" aria-label={joinMode === "GROUP" ? "Open groupings" : "Open participants"} onClick={() => openMobileSheet("participants")} style={{ background: C.cardBg, borderColor: C.border, color: C.text }}>
        <TwIcon name="users" size={22} />
      </button>
    )}

    {!tabTutorialOpen && hostTutorialStage === "participants" && (hostIsMobile ? (
      <ThinkBotTutorial accentColor={accent} target='[data-tutorial="host-mobile-sheet"]' placement="above" square clickAnywhere allowTargetInteraction={true} onClickAnywhere={() => setHostTutorialStage("code")}>
        <p><strong>Welcome to your Host Panel!</strong></p>
        <p>Students or Guests joining your live session will appear here.</p>
      </ThinkBotTutorial>
    ) : (
      <ThinkBotTutorial accentColor={accent} target={joinMode === "GROUP" ? '[data-tutorial="host-panel-groups"]' : '[data-tutorial="host-panel-participants"]'} placement="left" square clickAnywhere allowTargetInteraction={false} onClickAnywhere={() => { window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" }); setHostTutorialStage("code"); }}>
        <p><strong>Welcome to your Host Panel!</strong></p>
        <p>Students or Guests joining your live session will appear here.</p>
      </ThinkBotTutorial>
    ))}
    {!tabTutorialOpen && hostTutorialStage === "code" && (hostIsMobile ? (
      <ThinkBotTutorial accentColor={accent} target='[data-tutorial="host-sheet-code-tab"]' placement="above" square highlightMode="target" allowTargetInteraction={true} clickAnywhere={codeContinueReady} onClickAnywhere={() => setHostTutorialStage("start")}>
        <p>If someone still needs to join, share this code with them.</p>
      </ThinkBotTutorial>
    ) : (
      <ThinkBotTutorial accentColor={accent} target='[data-tutorial="host-panel-code"]' placement="left" square clickAnywhere allowTargetInteraction={false} onClickAnywhere={() => { window.scrollTo({ top: 0, behavior: "smooth" }); setHostTutorialStage("start"); }}>
        <p>If someone still needs to join, share this code with them.</p>
      </ThinkBotTutorial>
    ))}
    {!tabTutorialOpen && hostTutorialStage === "start" && <ThinkBotTutorial accentColor={accent} target='[data-tutorial="host-panel-start"]' placement="below" square highlightMode="target"><p>Once everyone is ready, start the activity from here.</p></ThinkBotTutorial>}
    {!tabTutorialOpen && ["countdown", "question_delay", "ending"].includes(hostTutorialStage) && <ThinkBotTutorial accentColor={accent} />}
    {!tabTutorialOpen && hostTutorialStage === "question" && (
      <ThinkBotTutorial accentColor={accent} target='[data-tutorial="host-question-content"]' placement={hostIsMobile ? "above" : "right"} square dialogWidth={hostIsMobile ? 300 : 360} allowTargetInteraction={false} secondaryLabel="Skip" onSecondary={skipQuestionTutorial}>
        <p className="tw-tutorial-fade-line">This is the question content area. It displays the current question the students are answering on their screens.</p>
      </ThinkBotTutorial>
    )}
    {!tabTutorialOpen && hostTutorialStage === "question_metrics" && (hostIsMobile ? (
      <ThinkBotTutorial accentColor={accent} target='[data-tutorial="host-quiz-title"]' placement="above" square dialogWidth={300} highlight={false} allowTargetInteraction={false} secondaryLabel="Skip" onSecondary={skipQuestionTutorial}>
        <p className="tw-tutorial-fade-line">You can see how many have already answered, how many points the question is worth, and the timer.</p>
      </ThinkBotTutorial>
    ) : (
      <ThinkBotTutorial accentColor={accent} target='[data-tutorial="host-question-content"]' placement="right" square dialogWidth={360} highlight={false} allowTargetInteraction={false} secondaryLabel="Skip" onSecondary={skipQuestionTutorial}>
        <p className="tw-tutorial-fade-line">You can see how many have already answered, how many points the question is worth, and the timer.</p>
      </ThinkBotTutorial>
    ))}
    {!tabTutorialOpen && hostTutorialStage === "end" && <ThinkBotTutorial accentColor={accent} target='[data-tutorial="host-panel-end"]' placement="below" square highlightMode="target"><p>When your class is finished, use <strong>End Session</strong>.</p></ThinkBotTutorial>}
    {!tabTutorialOpen && hostTutorialStage === "analytics" && <ThinkBotTutorial accentColor={accent} target='[data-tutorial="host-panel-analytics"]' placement="right" dialogWidth={390} highlightMode="target"><p>Ending the session closes live gameplay and saves the session results so you can review them in <strong>Analytics</strong>.</p></ThinkBotTutorial>}

    {tabTutorialOpen && <ThinkBotTutorial accentColor={accent} target='[data-tutorial="host-tab-out"]' placement="left" square clickAnywhere allowTargetInteraction={false} onClickAnywhere={() => { if (tutorialUserId) writeTutorialState(tutorialUserId, { fiveStudentTabSeen: true }); setTabTutorialOpen(false); }}><p>This counts the amount of times they leave the session.</p><p>When they reach <strong>2 counts</strong>, ThinkWAVE gives a warning. Reaching <strong>3</strong> will kick them out of the session due to suspicious actions.</p></ThinkBotTutorial>}

    <GuestRepeatNotice notices={guestNotices} accent={accent} onDismiss={(nid) => setGuestNotices((list) => list.filter((n) => n.id !== nid))} />

    <ActionDialog open={!!confirmAction} plainIcon flatSurface tone={confirmAction === "end" ? "red" : "blue"} icon={<TwIcon name={confirmAction === "end" ? "stop" : isLive ? "pause" : "play"} size={46}/>} title={confirmAction === "end" ? "End this session?" : isLive ? "Pause this session?" : isPaused ? "Resume this session?" : "Start this session?"} message={isLive && confirmAction !== "end" ? "The question timer and gameplay will pause for everyone." : ""} onClose={() => setConfirmAction(null)}><button className="tw-dialog-text-cancel" onClick={() => setConfirmAction(null)}>Cancel</button><TeacherPressButton tone={confirmAction === "end" ? "red" : "blue"} onClick={runConfirmed}>{confirmAction === "end" ? "End" : isLive ? "Pause" : isPaused ? "Resume" : "Start"}</TeacherPressButton></ActionDialog>
    <ActionDialog open={allAnsweredPrompt} icon={<TwIcon name="check" size={28}/>} title={advanceReason === "timeup" ? "Time is up" : "Everyone has answered"} message={advanceReason === "timeup" ? "Moving to the next question even if some participants did not submit." : ""} onClose={() => setAllAnsweredPrompt(false)}><TeacherPressButton tone="blue" className="tw-host-dialog-blue-no-outline" onClick={() => { setAllAnsweredPrompt(false); socketRef.current?.emit("teacher:setStatus", { sessionId: Number(id), status: "PAUSED" }); }}>Wait</TeacherPressButton><TeacherPressButton tone="blue" style={{ "--tw-press-face": accent, "--tw-press-base": `color-mix(in srgb, ${accent} 62%, #071024)`, "--tw-press-border": `color-mix(in srgb, ${accent} 58%, #fff)` }} onClick={() => { setAllAnsweredPrompt(false); nextQuestion(); }}>Go to next ({autoNextCount})</TeacherPressButton></ActionDialog>
    <ActionDialog open={finishedPrompt} plainIcon flatSurface tone="blue" icon={<TwIcon name="trophy" size={46}/>} title="Everyone has finished answering" message="You can end the session when you are ready." onClose={() => setFinishedPrompt(false)}><TeacherPressButton tone="blue" className="tw-host-dialog-blue-no-outline" onClick={() => { setFinishedPrompt(false); socketRef.current?.emit("teacher:setStatus", { sessionId: Number(id), status: "PAUSED" }); }}>Review scores</TeacherPressButton><TeacherPressButton tone="red" onClick={() => { setFinishedPrompt(false); socketRef.current?.emit("teacher:setStatus", { sessionId: Number(id), status: "ENDED" }); }}>End session</TeacherPressButton></ActionDialog>
    <ActionDialog open={!!deleteGroupTarget} plainIcon flatSurface tone="red" icon={<TwIcon name="trash" size={46}/>} title="Delete group?" message={deleteGroupTarget ? `Delete ${deleteGroupTarget.display_name}? Its students will return to the waiting list.` : ""} onClose={() => setDeleteGroupTarget(null)}><button className="tw-dialog-text-cancel" onClick={() => setDeleteGroupTarget(null)}>Cancel</button><TeacherPressButton tone="red" onClick={() => { socketRef.current?.emit("teacher:deleteGroup", { sessionId: Number(id), groupId: deleteGroupTarget.id }); setDeleteGroupTarget(null); }}>Delete</TeacherPressButton></ActionDialog>
  </div>;
}

const Podium = memo(function Podium({ leaders, scoreMode = "competitive", onToggleScoreMode }) {
  const order = [leaders[1], leaders[0], leaders[2]];
  const places = [2, 1, 3];
  return <div className="tw-host-podium">{order.map((row, index) => {
    const place = places[index];
    const name = row ? (row.group_name || `${row.first_name || ""} ${row.last_name || ""}`.trim()) : "Waiting…";
    const value = scoreMode === "competitive" ? Number(row?.competitive_points || 0) : Number(row?.total_points || 0);
    return <div key={place} className={`tw-host-podium-place place-${place}`}>
      <div className="tw-host-trophy"><TwIcon name="trophy" size={54} strokeWidth={2.2}/><span>{place}</span></div>
      <div className="tw-host-podium-platform"><div className="tw-host-podium-person"><div className="tw-host-podium-avatar" aria-hidden="true">{row?.profile_image ? <img src={row.profile_image} alt=""/> : <TwIcon name={row?.group_name ? "users" : "user"} size={18}/>}</div><b>{name}</b></div><button type="button" className="tw-host-podium-points tw-host-score-click" onClick={onToggleScoreMode} title="Click to switch point type">{formatHostScore(value, scoreMode)} pts</button></div>
    </div>;
  })}</div>;
});
// "3,5" -> "Q3, Q5" for the host panel's offline log.
function offlineQuestionsLabel(value) {
  return String(value || "").split(",").map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0).map((n) => `Q${n}`).join(", ");
}
const AttendanceRow = memo(function AttendanceRow({ row, score, C }) { const offlineCount = Number(row.offline_count || 0); const offlineQs = offlineQuestionsLabel(row.offline_questions); const tabCount = Number(row.tab_out_count || 0); const shotCount = Number(row.screenshot_count || 0); const integrityCount = Number(row.integrity_count || 0); const [showShots, setShowShots] = useState(false); const kicked = !!row.kicked_at; const indicator = row.presenceInterrupted ? "#f97316" : kicked ? "#ef4444" : Number(row.connected) === 1 ? "#22c55e" : "#94a3b8"; const tabColor = tabCount >= 3 ? "#ef4444" : tabCount === 2 ? "#f97316" : "#94a3b8"; const shownCount = showShots ? shotCount : tabCount; const shownColor = tabColor; const shownLabel = showShots ? `screen capture${shotCount === 1 ? "" : "s"}` : `tab out${tabCount === 1 ? "" : "s"}`; const isPracticeBot = Number(row.id) < 0; return <div className="tw-host-attendance-row" style={{ borderColor: C.border, background: C.cardBg2, gridTemplateColumns: "10px minmax(0,1fr) auto" }}><span className="tw-host-online-dot" style={{ background: indicator }} title={row.presenceInterrupted ? "Monitoring interrupted — no heartbeat for 15s+ while connected" : undefined}/><span className="tw-host-student-name">{row.first_name} {row.last_name}{isPracticeBot ? <em title="Practice bot — not a real student, doesn't count toward class results." className="ml-[4px] text-[11px] not-italic opacity-70">(Practice)</em> : null}{row.is_guest ? <em title={row.guest_repeat ? `Guest for the ${ordinal(row.guest_visits)} time in this class — records aren't saved to an account.` : "Joined as a guest (no student account)."} className="ml-[4px] text-[11px] not-italic" style={row.guest_repeat ? { color: "#f97316", fontWeight: 800 } : { opacity: 0.7 }}>{row.guest_repeat ? `(Guest · ${ordinal(row.guest_visits)} visit)` : "(Guest)"}</em> : null}{integrityCount > 0 ? <em title="Answers in a shape the quiz screen can't produce — sent by a modified page or script. Scored 0." className="ml-[4px] text-[11px] not-italic" style={{ color: "#ef4444", fontWeight: 800 }}>(⚠ {integrityCount} tampered)</em> : null}{row.extendedScreens ? <em title="Student device reports multiple displays — could be a projector, not proof of anything." className="ml-[4px] text-[11px] not-italic opacity-70">(2 screens)</em> : null}{row.presenceInterrupted ? <em title="No presence heartbeat for 15s+ while connected — tab may be frozen or messages blocked." className="ml-[4px] text-[11px] not-italic opacity-70">(signal lost)</em> : null}</span><span style={{ display: "flex", alignItems: "center", gap: 10, justifySelf: "end", whiteSpace: "nowrap" }}><span className="tw-host-attendance-score" title="Normal quiz points">{formatHostScore(score, "normal")} pts</span>{kicked ? <span className="tw-host-kicked">Kicked</span> : null}<span title={offlineCount > 0 ? `Went offline during: ${offlineQs || "unknown question"}` : "Has not gone offline during this live session"} className="text-[12px] font-extrabold" style={{ color: offlineCount > 0 ? "#f97316" : "#94a3b8" }}>{offlineCount} offline{offlineQs ? ` (${offlineQs})` : ""}</span><button type="button" data-tutorial="host-tab-out" onClick={() => setShowShots((v) => !v)} title={showShots ? "Screen captures (0 does not mean no screenshots were taken) — click to show tab-out count" : "Click to show screen-capture count"} className="text-[12px] font-extrabold" style={{ color: shownColor, background: "transparent", border: 0, padding: 0, font: "inherit", cursor: "pointer", textAlign: "right" }}>{shownCount} {shownLabel}</button></span></div>; });
function ordinal(n) {
  const v = Number(n) || 0;
  const s = ["th", "st", "nd", "rd"];
  const m = v % 100;
  return `${v}${s[(m - 20) % 10] || s[m] || s[0]}`;
}

// One-time notice when a guest reaches their 3rd+ live session of this class.
// Same 3D prompt-box language as the host question prompt: accent border +
// solid slab + glow + top highlight.
function GuestRepeatNotice({ notices, onDismiss, accent = "#f97316" }) {
  if (!notices.length) return null;
  const slabBase = `color-mix(in srgb, ${accent} 58%, #0f172a)`;
  return <div role="status" aria-live="polite" style={{ position: "fixed", right: 18, bottom: 18, zIndex: 60, display: "grid", gap: 10, width: "min(92vw, 360px)" }}>
    {notices.map((notice) => <div key={notice.id} style={{ background: `color-mix(in srgb, ${accent} 12%, #ffffff)`, color: "#0f172a", border: `3px solid ${accent}`, borderRadius: 14, padding: "12px 14px", boxShadow: `0 6px 0 ${slabBase}, 0 18px 34px ${accent}59, inset 0 2px 0 rgba(255,255,255,.8)` }}>
      <div style={{ fontWeight: 900, marginBottom: 4 }}>Repeat guest</div>
      <div style={{ fontSize: 13, lineHeight: 1.5 }}><b>{notice.name || "A guest"}</b> has joined this class&apos;s live sessions {notice.visits} times as a guest. Their results aren&apos;t saved to an account. Consider sharing the class code so they can sign up.</div>
      <button type="button" onClick={() => onDismiss(notice.id)} style={{ marginTop: 8, background: "transparent", border: 0, padding: 0, color: "#5a6a9a", fontWeight: 800, cursor: "pointer" }}>Dismiss</button>
    </div>)}
  </div>;
}

// Groupings replaces Student Attendance in GROUP mode (solo keeps AttendanceRow).
// Students self-join groups; the teacher only adds/deletes them (LOBBY only,
// enforced server-side). Single-expand mirrors the analytics per-question
// pattern: opening one group fades the rest out until it closes again.
const GroupingsPanel = memo(function GroupingsPanel({ groups, roster, canAdd, onAddGroup, onDeleteGroup, C }) {
  const [expandedId, setExpandedId] = useState(null);
  useEffect(() => {
    if (expandedId !== null && !(groups || []).some((g) => Number(g.id) === Number(expandedId))) setExpandedId(null);
  }, [groups, expandedId]);
  const tabById = useMemo(() => {
    const map = new Map();
    for (const row of roster || []) map.set(Number(row.id), Number(row.tab_out_count || 0));
    return map;
  }, [roster]);
  const offlineById = useMemo(() => {
    const map = new Map();
    for (const row of roster || []) map.set(Number(row.id), { count: Number(row.offline_count || 0), questions: offlineQuestionsLabel(row.offline_questions) });
    return map;
  }, [roster]);
  return (
    <div className="tw-host-groupings">
    <div className={`tw-host-group-list${expandedId !== null ? " has-expanded" : ""}`}>
      {(groups || []).map((group) => {
        const expanded = Number(expandedId) === Number(group.id);
        const hidden = expandedId !== null && !expanded;
        const members = group.members || [];
        return (
          <div key={group.id} className={`tw-host-group-card${expanded ? " is-expanded" : ""}${hidden ? " is-hidden" : ""}`} aria-hidden={hidden} style={{ borderColor: C.border, background: C.cardBg2 }}>
            <button type="button" className="tw-host-group-toggle" aria-expanded={expanded} tabIndex={hidden ? -1 : 0} onClick={() => { if (!hidden) setExpandedId(expanded ? null : group.id); }} style={{ color: C.text }}>
              <span className="tw-host-group-name" title={group.display_name}>{group.display_name}</span>
              <span className="tw-host-group-count" style={{ color: C.muted }}>({members.length})</span>
              {onDeleteGroup && <span role="button" tabIndex={hidden ? -1 : 0} title={`Delete ${group.display_name}`} aria-label={`Delete ${group.display_name}`} className="tw-host-group-delete-icon" onClick={(e) => { e.stopPropagation(); if (!hidden) onDeleteGroup(group); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); if (!hidden) onDeleteGroup(group); } }} style={{ color: "#dc2626" }}><TwIcon name="trash" size={22} /></span>}
              <TwIcon name={expanded ? "chevronUp" : "chevronDown"} size={26} />
            </button>
            <div className={`tw-host-group-collapse${expanded ? " is-open" : ""}`}>
              <div>
                <div className="tw-host-group-members" style={{ borderColor: C.border, background: C.cardBg }}>
                  {members.map((member) => {
                    const count = Number(tabById.get(Number(member.id)) || 0);
                    const tabColor = count >= 3 ? "#ef4444" : count === 2 ? "#f97316" : "#94a3b8";
                    const off = offlineById.get(Number(member.id)) || { count: 0, questions: "" };
                    return (
                      <div key={member.id} className="tw-host-group-member" style={{ color: C.text }}>
                        <span className="tw-host-online-dot" style={{ background: Number(member.connected) === 1 ? "#22c55e" : "#94a3b8" }} />
                        <span className="tw-host-student-name">{member.first_name} {member.last_name}</span>
                        <span title={off.count > 0 ? `Went offline during: ${off.questions || "unknown question"}` : "Has not gone offline during this live session"} className="text-[12px] font-extrabold" style={{ color: off.count > 0 ? "#f97316" : "#94a3b8", marginRight: 8 }}>{off.count} offline{off.questions ? ` (${off.questions})` : ""}</span><span className="text-[12px] font-extrabold" style={{ color: tabColor }}>{count} tab out{count === 1 ? "" : "s"}</span>
                      </div>
                    );
                  })}
                  {!members.length && <div style={{ fontSize: 12, color: C.muted }}>No students joined yet.</div>}
                </div>
              </div>
            </div>
          </div>
        );
      })}
      {!groups?.length && expandedId === null && <div className="p-[24px] text-center" style={{ color: C.muted }}>No groups yet. Tap + Add Group to create one.</div>}
    </div>
      {canAdd && expandedId === null && <button type="button" className="tw-host-group-add" onClick={onAddGroup} style={{ borderColor: C.border, background: C.cardBg2, color: C.text }}><TwIcon name="plus" size={17}/> Add Group</button>}
    </div>
  );
});
const QuestionPreview = memo(function QuestionPreview({ q, templateType, C, choiceCounts = {} }) {
  const cfg = q?.config_json || {};
  const correct = q?.correct_json || {};
  const tt = normalizeTemplateType(templateType);

  if (tt === "MCQ" || tt === "TRUE_FALSE") {
    const options = tt === "TRUE_FALSE"
      ? [{ text: "True", image: "" }, { text: "False", image: "" }]
      : (Array.isArray(cfg.options) ? cfg.options : []);
    return <div className={`tw-host-options tw-host-student-choice-grid${tt === "TRUE_FALSE" ? " is-true-false" : ""}`}>{options.map((option, i) => {
      const text = typeof option === "object" ? option.text : option;
      const image = typeof option === "object" ? option.image : "";
      const oddLast = options.length % 2 === 1 && i === options.length - 1;
      const label = tt === "TRUE_FALSE" ? (i === 0 ? "T" : "F") : String.fromCharCode(65 + i);
      return <div key={i} className={`tw-host-student-choice choice-${i + 1}${oddLast ? " is-odd-last" : ""}`}>
        <span className="tw-host-student-choice-badge">{label}</span>
        <span className="tw-host-student-choice-content">
          {image && <img src={image} alt=""/>}
          {!(tt === "MCQ" && cfg.mcqMode === "MODIFIED" && image) && <b style={{ fontSize: fitHostTextSize(text, 22, 13) }}>{text || "Image option"}</b>}
        </span>
        {/* True/False shares this options loop and its slots line up with what
            the server already sends for it (true -> 0, false -> 1), so it gets
            the same per-choice counter as MCQ. */}
        {(tt === "MCQ" || tt === "TRUE_FALSE") && <em className="tw-host-choice-count" aria-label={`${Number(choiceCounts[String(i)] || 0)} responses`}>{Number(choiceCounts[String(i)] || 0)}</em>}
      </div>;
    })}</div>;
  }

  if (tt === "TYPE_ANSWER") {
    const main = String(correct?.text || cfg?.answer || "").trim();
    const extra = (Array.isArray(correct?.answers) ? correct.answers : []).map((a) => String(a || "").trim()).filter((a) => a && a !== main).slice(0, 2);
    const answers = [main, ...extra].filter(Boolean);
    const accent = C.accent || "#a855f7";
    const well = { background: "#ffffff", border: `3px solid ${accent}`, borderRadius: 14, boxShadow: `inset 0 4px 0 rgba(15,23,42,.10), inset 0 10px 20px color-mix(in srgb, ${accent} 16%, transparent)`, padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "center", color: "#0f172a", fontWeight: 900, lineHeight: 1.45, textAlign: "center", overflowWrap: "anywhere", boxSizing: "border-box", minHeight: 58, width: "100%" };
    return <div className="tw-host-identification-answer" style={{ background: "transparent", borderColor: "transparent", display: "grid", gap: 10, padding: 0 }}>
      {answers.length ? answers.map((a, i) => <div key={i} style={well}><b style={{ fontSize: fitHostTextSize(a, 22, 13) }}>{a}</b></div>) : <div style={well}><b style={{ fontSize: 14 }}>No answer set</b></div>}
    </div>;
  }

  if (tt === "MATCHING") {
    const colA = Array.isArray(cfg.colA) ? cfg.colA : [];
    const sourceB = Array.isArray(cfg.colB) ? cfg.colB : [];
    const dummyB = Array.isArray(cfg.dummyB) ? cfg.dummyB : [];
    const pairedB = sourceB.slice(0, colA.length);
    const sourceTail = sourceB.slice(colA.length);
    const distractors = dummyB.length ? dummyB : sourceTail;
    const accent = C.accent || "#f97316";
    const outer3d = { border: `3px solid ${accent}`, borderRadius: 18, background: `color-mix(in srgb, ${accent} 12%, #ffffff)`, boxShadow: `0 6px 0 ${accent}, 0 14px 28px ${accent}40, inset 0 2px 0 rgba(255,255,255,.6)`, padding: 12, display: "grid", gap: 8, boxSizing: "border-box", width: "100%" };
    const inset3d = { background: "#ffffff", border: `3px solid ${accent}`, borderRadius: 12, boxShadow: `inset 0 4px 0 rgba(15,23,42,.10), inset 0 10px 20px color-mix(in srgb, ${accent} 16%, transparent)`, color: "#0f172a", padding: "8px 10px", boxSizing: "border-box", minWidth: 0 };
    const pairRow = { display: "grid", gridTemplateColumns: "minmax(0,1fr) auto minmax(0,1fr)", gap: 8, alignItems: "center" };
    const labelRow = { display: "grid", gridTemplateColumns: "minmax(0,1fr) auto minmax(0,1fr)", gap: 8, alignItems: "center", fontSize: 11, fontWeight: 950, textTransform: "uppercase", letterSpacing: ".06em", color: accent };
    return <div className="tw-host-matching-bank" style={outer3d}>
      {colA.length > 0 && <div style={labelRow}><span style={{ textAlign: "center" }}>Column A</span><span /><span style={{ textAlign: "center" }}>Column B</span></div>}
      {colA.map((row, i) => <div key={i} style={pairRow}>
        <div style={inset3d}><HostMediaChoice item={row} fallback={`Item ${i + 1}`} C={C} /></div>
        <span style={{ color: accent, fontWeight: 1000 }}>&lt;-&gt;</span>
        <div style={inset3d}><HostMediaChoice item={pairedB[i]} fallback={`Match ${i + 1}`} C={C} /></div>
      </div>)}
      {distractors.length > 0 && <div style={{ fontSize: 11, fontWeight: 950, textTransform: "uppercase", letterSpacing: ".06em", color: accent }}>Distractors</div>}
      {distractors.map((row, i) => <div key={`d-${i}`} style={inset3d}><HostMediaChoice item={row} fallback={`Distractor ${i + 1}`} C={C} /></div>)}
    </div>;
  }

  if (tt === "GUESS_WORD_4PICS") {
    const answer = String(correct?.text || cfg?.target || "").trim();
    const images = Array.isArray(cfg.images) ? cfg.images : [];
    const imgCard = { border: "4px solid #35a159", borderRadius: 20, background: "#7fd09a", boxShadow: "0 8px 0 #25753f, 0 16px 28px rgba(15,23,42,.16)", padding: 8, boxSizing: "border-box", overflow: "hidden" };
    const answerCard = { background: "#e7f4ec", border: "3px solid #35a159", borderRadius: 20, boxShadow: "0 6px 0 #25753f, 0 14px 28px rgba(37,117,63,.25), inset 0 2px 0 rgba(255,255,255,.7)", padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "center", color: "#14532d", fontWeight: 900, lineHeight: 1.4, textAlign: "center", overflowWrap: "anywhere", boxSizing: "border-box", minHeight: 72, width: "100%" };
    return <div className="tw-host-guess-bank" style={{ display: "grid", gap: 12, justifyItems: "center", width: "100%" }}>
      <div style={{ width: "min(100%, 320px)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>{[0, 1, 2, 3].map((i) => <div key={i} className="aspect-square overflow-hidden grid place-items-center" style={imgCard}>{images[i] ? <img src={images[i]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 12, display: "block" }} /> : <span style={{ color: "#14532d", fontWeight: 900, fontSize: 28 }}>?</span>}</div>)}</div>
      <div style={{ ...answerCard, width: "min(100%, 320px)" }}><b style={{ fontSize: fitHostTextSize(answer || "No answer set", 24, 14) }}>{answer || "No answer set"}</b></div>
    </div>;
  }

  if (tt === "CROSSWORD") {
    const words = Array.isArray(cfg.answers) && cfg.answers.length ? cfg.answers : (Array.isArray(correct.answers) ? correct.answers : []);
    const requestedGridSize = Math.max(5, Math.min(8, Number(cfg.gridSize || 6)));
    const signature = `${buildCrosswordSignature({ questionId: 0, gridSize: requestedGridSize, words })}-${Number(cfg.gridSeed || 0)}`;
    const generated = buildCrosswordGrid({ gridSize: requestedGridSize, words, seed: buildCrosswordSeed(signature) });
    const gridSize = generated.gridSize;
    const grid = Array.isArray(cfg.grid) && cfg.grid.length === gridSize * gridSize ? cfg.grid : generated.grid;
    const accent = C.accent || "#0ea5e9";
    const face = `color-mix(in srgb, ${accent} 30%, #ffffff)`;
    const base = `color-mix(in srgb, ${accent} 55%, #0f172a)`;
    const ink = `color-mix(in srgb, ${accent} 72%, #0f172a)`;
    const displayWords = words.map((word) => String(word || "").toUpperCase().replace(/[^A-Z]/g, "")).filter(Boolean);
    return <div className="tw-host-crossword-bank" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "stretch", width: "100%" }}>
      <div className="grid place-items-center" style={{ flex: "3 1 320px", minWidth: 0, maxWidth: 440, width: "100%", margin: "0 auto", padding: 14, borderRadius: 18, border: `4px solid ${accent}`, background: C.cardBg, boxShadow: `0 8px 0 color-mix(in srgb, ${accent} 58%, #0f172a), 0 18px 36px ${accent}40`, boxSizing: "border-box" }}>
      <div className="grid w-full" style={{ gridTemplateColumns: `repeat(${gridSize}, minmax(0,1fr))`, gap: gridSize > 9 ? 3 : 5 }}>
        {grid.map((letter, index) => {
          const upper = String(letter || "").toUpperCase();
          return upper
            ? <span key={`${signature}-${index}`} className="aspect-square grid place-items-center font-black" style={{ borderRadius: gridSize > 9 ? 6 : 9, border: `2px solid ${accent}`, background: "#ffffff", boxShadow: `inset 0 3px 0 rgba(15,23,42,.10), inset 0 6px 12px color-mix(in srgb, ${accent} 18%, transparent)`, color: C.accent, fontSize: gridSize > 9 ? 11 : 15 }}>{upper}</span>
            : <span key={`${signature}-${index}`} className="aspect-square" style={{ borderRadius: gridSize > 9 ? 6 : 9, border: `1px solid ${C.border}`, background: "transparent" }} />;
        })}
      </div>
      </div>
      {displayWords.length > 0 && <div style={{ flex: "2 1 200px", minWidth: 0, alignSelf: "center", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, justifyItems: "stretch" }}>
        {displayWords.map((word, i) => <div key={`${word}-${i}`} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: "8px 10px", border: `4px solid ${accent}`, borderRadius: 14, background: face, boxShadow: `0 4px 0 ${base}, 0 10px 20px rgba(15,23,42,.14)`, boxSizing: "border-box", minWidth: 0 }}><span style={{ color: ink, fontWeight: 900, fontSize: 14, overflowWrap: "anywhere", textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{word}</span></div>)}
      </div>}
    </div>;
  }

  return <div style={{ color: C.muted }}>Student interaction is shown on each learner’s screen.</div>;
});

const HostMediaChoice = memo(function HostMediaChoice({ item, fallback }) {
  const value = item && typeof item === "object" ? item : { text: String(item || "") };
  const text = String(value.text || "").trim();
  const image = String(value.image || "").trim();
  return <span className="tw-host-media-mini" style={{ background: "transparent", border: "none", padding: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, minWidth: 0, textAlign: "center" }}>
    {(text || !image) && <b style={{ fontSize: fitHostTextSize(text || fallback, 18, 12), color: "#0f172a", overflowWrap: "anywhere", minWidth: 0 }}>{text || fallback}</b>}
    {image && <img src={image} alt="" style={{ width: 42, height: 42, borderRadius: 8, objectFit: "cover", flex: "none" }} />}
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
  if (templateType === "CROSSWORD") {
    const words = Array.isArray(question?.correct_json?.answers) && question.correct_json.answers.length
      ? question.correct_json.answers.length
      : (Array.isArray(question?.config_json?.answers) ? question.config_json.answers.length : 0);
    return Math.max(perUnit, perUnit * Math.max(1, words));
  }
  return perUnit;
}
function StatusPill({ label, kind = "neutral", className = "" }) { const palette = kind === "green" ? { bg: "#22c55e20", fg: "#22c55e", br: "#22c55e55" } : kind === "yellow" ? { bg: "#fbbf2420", fg: "#f59e0b", br: "#fbbf2455" } : kind === "red" ? { bg: "#ef444420", fg: "#ef4444", br: "#ef444455" } : kind === "blue" ? { bg: "#2b6cff20", fg: "#6792ff", br: "#2b6cff55" } : { bg: "#94a3b820", fg: "#94a3b8", br: "#94a3b855" }; return <span className={`${className} px-[11px] py-[5px] text-[12px] font-[850] rounded-[999px]`} style={{ background: palette.bg, color: palette.fg, border: `1px solid ${palette.br}` }}>{label}</span>; }
function formatHostScore(value, mode = "normal") {
  const n = Number(value || 0);
  if (mode === "competitive") return Math.round(n).toLocaleString();
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function fmtTime(sec) { const value = Math.max(0, Number(sec || 0)); return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`; }
function card(C) { return { background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 20, padding: 20, boxShadow: `0 18px 42px ${C.accent}16` }; }
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
