/* FILE GUIDE:
 * client/src/pages/student/StudentAsyncPlay.jsx
 * Purpose: Revision 11 asynchronous quiz player styled to match the live session gameplay shell.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { useTheme } from "../../context/ThemeContext";
import { normalizeTemplateType, TEMPLATE_TYPES } from "../../lib/templateTypes";
import { buildLetterBank, countAnswerLetters } from "../../lib/letterBank";
import {
  buildThinkSpellSignature,
  getPathLinePoints,
  isAdjacentSelection,
  isStraightLinePath,
  loadThinkSpellGridState,
  matchThinkSpellWord,
  normalizeThinkWordKey,
  resolveThinkSpellWordBank,
  validatePathSpellsWord,
} from "../../lib/thinkSpell";
import soundManager from "../../utils/soundmanager";
import "./StudentPlay.css";

function LoadingDots({ color = "currentColor" }) {
  return <span className="tw-loading-dots" aria-hidden="true" style={{ color }}><span>.</span><span>.</span><span>.</span></span>;
}

function ThemeTogglePill({ dark, onClick, style }) {
  return (
    <button className="sp-inline-theme-toggle" onClick={onClick} type="button" style={{ padding: "7px 14px", borderRadius: 20, fontSize: 13, fontWeight: 700, color: dark ? "#bfd0ff" : "#5a6a9a", border: dark ? "1px solid rgba(191,208,255,0.18)" : "1px solid rgba(43,108,255,0.16)", background: dark ? "rgba(255,255,255,0.04)" : "transparent", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8, whiteSpace: "nowrap", ...(style || {}) }}>
      <span style={{ fontSize: 14 }}>{dark ? "☀️" : "🌙"}</span><span>{dark ? "Light" : "Dark"}</span>
    </button>
  );
}

function SoundTogglePill({ muted, onClick, style }) {
  return (
    <button className="sp-inline-sound-toggle" onClick={onClick} type="button" style={{ padding: "7px 14px", borderRadius: 20, fontSize: 13, fontWeight: 800, color: muted ? "#ffd4d4" : "#d8ffe8", border: muted ? "1px solid rgba(255,120,120,0.28)" : "1px solid rgba(120,255,180,0.24)", background: muted ? "rgba(127, 29, 29, 0.26)" : "rgba(18, 96, 63, 0.22)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8, whiteSpace: "nowrap", ...(style || {}) }} title={muted ? "Unmute sounds" : "Mute sounds"} aria-label={muted ? "Unmute sounds" : "Mute sounds"}>
      <span style={{ fontSize: 14 }}>{muted ? "🔇" : "🔊"}</span><span>{muted ? "Muted" : "Sound"}</span>
    </button>
  );
}

function questionDifficulty(q) {
  const value = String(q?.config_json?.difficulty || "").trim().toLowerCase();
  return ["easy", "medium", "hard"].includes(value) ? value : "";
}

function currentQuestionExplanation(q) {
  return String(q?.config_json?.explanation || "").trim();
}

export default function StudentAsyncPlay() {
  const { quizId } = useParams();
  const nav = useNavigate();
  const { dark, toggleTheme } = useTheme();
  const [quiz, setQuiz] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [msg, setMsg] = useState("");
  const [result, setResult] = useState(null);
  const [submittedByQuestion, setSubmittedByQuestion] = useState({});
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackQ, setFeedbackQ] = useState(null);
  const [feedbackFxKey, setFeedbackFxKey] = useState(0);
  const feedbackHideTimer = useRef(null);
  const [isMuted, setIsMuted] = useState(() => soundManager.isMuted());

  const pageBg = dark ? "#0a4eb4" : "#6db9f1";
  const cardBg = dark ? "#0e1733" : "#ffffff";
  const cardBor = dark ? "#1e2d55" : "#c7d2fe";
  const textC = dark ? "#e7e9ee" : "#0f172a";
  const mutedC = dark ? "#8a9bc4" : "#5a6a9a";

  useEffect(() => {
    let alive = true;
    api.get(`/student/quizzes/${quizId}`)
      .then(({ data }) => {
        if (!alive) return;
        setQuiz(data.quiz);
        setQuestions(data.questions || []);
      })
      .catch((err) => setMsg(err?.response?.data?.message || "Quiz unavailable."));
    return () => { alive = false; };
  }, [quizId]);

  // Revision 11: assignment gameplay now uses the same playing background music + mute control as live sessions.
  useEffect(() => {
    function unlockAudio() {
      void soundManager.unlock().then(() => { void soundManager.startBGM("playing"); });
    }
    void soundManager.startBGM("playing");
    window.addEventListener("pointerdown", unlockAudio, { passive: true });
    window.addEventListener("keydown", unlockAudio);
    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
      clearTimeout(feedbackHideTimer.current);
      soundManager.stopBGM();
    };
  }, []);

  useEffect(() => { void soundManager.startBGM("playing"); }, [isMuted]);

  const q = questions[idx];
  const tt = normalizeTemplateType(quiz?.template_type);
  const currentAnswer = answers[q?.id] || {};
  const progress = questions.length ? ((idx + 1) / questions.length) * 100 : 0;
  const isLast = idx >= questions.length - 1;
  const done = !!result;
  const currentSubmitted = q?.id ? submittedByQuestion[q.id] : null;
  const difficulty = questionDifficulty(q);

  function handleToggleMute() {
    const nextMuted = soundManager.toggleMute();
    setIsMuted(nextMuted);
    if (!nextMuted) void soundManager.startBGM("playing");
  }

  function setAnswer(answer) {
    if (!q?.id || done || currentSubmitted) return;
    setAnswers((prev) => ({ ...prev, [q.id]: answer }));
  }

  async function submitCurrentQuestion() {
    if (!q?.id || done || currentSubmitted) return;
    setMsg("");
    try {
      const { data } = await api.post(`/student/quizzes/${quizId}/check-question`, { questionId: Number(q.id), answer: currentAnswer });
      const feedback = {
        isCorrect: !!data.isCorrect,
        points: Number(data.points || 0),
        explanation: String(data.explanation || currentQuestionExplanation(q)),
      };
      setSubmittedByQuestion((prev) => ({ ...prev, [q.id]: feedback }));
      setFeedbackQ(feedback);
      setShowFeedback(true);
      setFeedbackFxKey((v) => v + 1);
      clearTimeout(feedbackHideTimer.current);
      feedbackHideTimer.current = setTimeout(() => setShowFeedback(false), 2200);
      soundManager.play(feedback.isCorrect ? "correct" : "wrong").catch(() => {});
    } catch (err) {
      setMsg(err?.response?.data?.message || "Could not submit this question.");
      soundManager.play("wrong").catch(() => {});
    }
  }

  async function submit() {
    try {
      const payload = Object.entries(answers).map(([questionId, answer]) => ({ questionId: Number(questionId), answer }));
      const { data } = await api.post(`/student/quizzes/${quizId}/submit`, { answers: payload });
      setResult(data);
      soundManager.play("correct").catch(() => {});
    } catch (err) {
      setMsg(err?.response?.data?.message || "Submit failed.");
      soundManager.play("wrong").catch(() => {});
    }
  }

  if (msg && !quiz) {
    return <AsyncShell dark={dark} pageBg={pageBg} cardBg={cardBg} cardBor={cardBor} textC={textC} mutedC={mutedC} title="ThinkWAVE Assignment" isMuted={isMuted} onMute={handleToggleMute} onTheme={toggleTheme}><div className="sp-wait-card sp-page-enter" style={{ maxWidth: 520, background: cardBg, borderColor: cardBor, textAlign: "center" }}><h3 className="sp-wait-title" style={{ color: textC }}>Assignment unavailable</h3><p className="sp-wait-subtitle" style={{ color: mutedC }}>{msg}</p><button className="submit-btn" type="button" onClick={() => nav('/student')}>Back to Dashboard</button></div></AsyncShell>;
  }

  if (!quiz || !q) {
    return <AsyncShell dark={dark} pageBg={pageBg} cardBg={cardBg} cardBor={cardBor} textC={textC} mutedC={mutedC} title="ThinkWAVE Assignment" isMuted={isMuted} onMute={handleToggleMute} onTheme={toggleTheme}><div className="sp-wait-card sp-page-enter" style={{ maxWidth: 520, background: cardBg, borderColor: cardBor, textAlign: "center" }}><h3 className="sp-wait-title" style={{ color: textC }}>Loading assignment<LoadingDots color={mutedC} /></h3></div></AsyncShell>;
  }

  return (
    <div style={{ minHeight: "100vh", background: pageBg, color: textC, fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      {showFeedback && feedbackQ && (
        <div className={`sp-feedback-overlay ${feedbackQ.isCorrect ? "is-correct" : "is-wrong"}`}>
          <div key={feedbackFxKey} className={`sp-feedback-card ${feedbackQ.isCorrect ? "is-correct" : "is-wrong"}`}>
            <div className="sp-feedback-icon">{feedbackQ.isCorrect ? "✅" : "❌"}</div>
            <div className="sp-feedback-title">{feedbackQ.isCorrect ? `Correct! +${feedbackQ.points} pts` : "Incorrect"}</div>
            <div className="sp-feedback-subtitle">{feedbackQ.isCorrect ? "Nice one — keep going!" : "Review the explanation before moving on."}</div>
            {feedbackQ.explanation && (
              <div className="sp-explanation-panel">
                <div className="sp-explanation-kicker">Explanation</div>
                <p>{feedbackQ.explanation}</p>
              </div>
            )}
          </div>
        </div>
      )}
      <div className={`quiz-shell-new ${dark ? "theme-dark" : "theme-light"}`} style={{ width: "100%", minHeight: "100vh", margin: 0, display: "flex", flexDirection: "column" }}>
        <div className="qn-header">
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div className="qn-subject">{quiz.title || "ThinkWAVE Assignment"}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <SoundTogglePill muted={isMuted} onClick={handleToggleMute} style={{ padding: "6px 11px", fontSize: 12 }} />
              <ThemeTogglePill dark={dark} onClick={toggleTheme} style={{ padding: "6px 11px", fontSize: 12, color: dark ? "#dbe7ff" : "#17305f", border: dark ? "1px solid rgba(219,231,255,0.25)" : "1px solid rgba(43,108,255,0.18)", background: dark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.92)", boxShadow: dark ? "0 12px 22px rgba(0,0,0,0.26)" : "0 12px 22px rgba(43,108,255,0.14)" }} />
            </div>
          </div>
          <div className="qn-meta">
            <div className="qn-qcount">Q {idx + 1}/{questions.length}</div>
            <div className="qn-timer">Assignment</div>
          </div>
        </div>
        <div className="qn-progress"><div className="qn-progress-bar" style={{ width: `${Math.round(progress)}%` }} /></div>
        {difficulty && <div key={`${q.id}-${difficulty}`} className={`sp-difficulty-pop ${difficulty}`}>{difficulty}</div>}

        <div className="qn-body" style={{ flex: 1 }}>
          {done ? (
            <div className="sp-wait-card sp-page-enter" style={{ maxWidth: 560, margin: "0 auto", background: cardBg, borderColor: cardBor, textAlign: "center" }}>
              <div className="sp-wait-icon-wrap" style={{ margin: "0 auto 16px", background: dark ? "rgba(255,255,255,0.05)" : "#eef3ff", borderColor: cardBor }}><div className="sp-wait-icon">✅</div></div>
              <h3 className="sp-wait-title" style={{ color: textC, marginBottom: 8 }}>Submitted!</h3>
              <p className="sp-wait-subtitle" style={{ color: mutedC }}>You scored <b style={{ color: "#2b6cff" }}>{result.score}/{result.maxScore}</b>.</p>
              <button className="submit-btn" type="button" onClick={() => nav('/student')}>Back to Dashboard</button>
            </div>
          ) : (
            <>
              <div className="qn-prompt-box">
                {q?.config_json?.promptImage ? <img src={q.config_json.promptImage} alt="" className="qn-prompt-img" /> : null}
                <span className="qn-prompt-text">{q.prompt}</span>
              </div>
              <TemplateBody templateType={tt} q={q} value={currentAnswer} onChange={setAnswer} disabled={done || !!currentSubmitted} />
              {currentSubmitted && (
                <div style={{ maxWidth: 720, margin: "18px auto 0", padding: "14px 16px", borderRadius: 18, background: currentSubmitted.isCorrect ? "rgba(34,197,94,0.14)" : "rgba(239,68,68,0.12)", border: `1px solid ${currentSubmitted.isCorrect ? "rgba(34,197,94,0.34)" : "rgba(239,68,68,0.28)"}`, color: textC, fontWeight: 800 }}>
                  {currentSubmitted.isCorrect ? `Correct · +${currentSubmitted.points} pts` : "Incorrect"}
                  {currentSubmitted.explanation ? <div style={{ marginTop: 8, color: mutedC, fontWeight: 700, lineHeight: 1.55 }}>{currentSubmitted.explanation}</div> : null}
                </div>
              )}
              {msg && <div style={{ textAlign: "center", color: "#ef4444", fontWeight: 700, marginTop: 12 }}>{msg}</div>}
              <div style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap", marginTop: 22 }}>
                <button type="button" className="spell-ctrl back" onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0}>Previous</button>
                {!currentSubmitted ? (
                  <button type="button" className="submit-btn" onClick={submitCurrentQuestion}>Submit</button>
                ) : isLast ? (
                  <button type="button" className="submit-btn" onClick={submit}>Finish</button>
                ) : (
                  <button type="button" className="submit-btn" onClick={() => setIdx((i) => Math.min(questions.length - 1, i + 1))}>Next</button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function AsyncShell({ dark, pageBg, cardBg, cardBor, textC, mutedC, title, isMuted, onMute, onTheme, children }) {
  return (
    <div style={{ minHeight: "100vh", background: pageBg, color: textC, fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <div className={`quiz-shell-new ${dark ? "theme-dark" : "theme-light"}`} style={{ width: "100%", minHeight: "100vh", margin: 0, display: "flex", flexDirection: "column" }}>
        <div className="qn-header">
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div className="qn-subject">{title}</div>
            <SoundTogglePill muted={isMuted} onClick={onMute} style={{ padding: "6px 11px", fontSize: 12 }} />
            <ThemeTogglePill dark={dark} onClick={onTheme} style={{ padding: "6px 11px", fontSize: 12 }} />
          </div>
          <div className="qn-meta"><div className="qn-timer">Assignment</div></div>
        </div>
        <div className="qn-body" style={{ flex: 1, display: "grid", placeItems: "center" }}>{children}</div>
      </div>
    </div>
  );
}

function trimText(v) { return String(v || "").trim(); }
function normalizeChoiceOption(option, index = 0) {
  if (option && typeof option === "object") return { id: String(option.id || `option-${index + 1}`), text: option.text ?? option.label ?? "", image: option.image ?? "" };
  return { id: `option-${index + 1}`, text: String(option ?? ""), image: "" };
}
function choiceValue(option) { return option?.id || option?.text || ""; }

function TemplateBody({ templateType, q, value, onChange, disabled }) {
  const cfg = q?.config_json || {};
  if (templateType === TEMPLATE_TYPES.MCQ) return <McqTemplate cfg={cfg} value={value} onChange={onChange} disabled={disabled} />;
  if (templateType === TEMPLATE_TYPES.TRUE_FALSE) return <TrueFalseTemplate cfg={cfg} value={value} onChange={onChange} disabled={disabled} />;
  if (templateType === TEMPLATE_TYPES.MATCHING) return <MatchingTemplate cfg={cfg} value={value} onChange={onChange} disabled={disabled} />;
  if (templateType === TEMPLATE_TYPES.GUESS_WORD_4PICS) return <GuessWord4PicsTemplate cfg={cfg} value={value} onChange={onChange} disabled={disabled} />;
  if (templateType === TEMPLATE_TYPES.THINK_SPELL) return <BookwormThinkSpellTemplate cfg={cfg} value={value} onChange={onChange} disabled={disabled} questionId={q?.id} />;
  return <TypeAnswerTemplate value={value} onChange={onChange} disabled={disabled} />;
}

function McqTemplate({ cfg, value, onChange, disabled }) {
  const opts = Array.isArray(cfg.options) ? cfg.options.map(normalizeChoiceOption) : [];
  const labels = "ABCDEFGHIJ".split("");
  const isModifiedMcq = cfg.mcqMode === "MODIFIED";
  const twoMode = cfg.answerMode === "TWO" && !isModifiedMcq;
  const selectedList = Array.isArray(value.choices) ? value.choices : [value.choice].filter(Boolean);
  function toggleChoice(choice) {
    if (!twoMode) return onChange({ choice });
    if (selectedList.includes(choice)) return onChange({ choices: selectedList.filter((x) => x !== choice) });
    if (selectedList.length >= 2) return onChange({ choices: [selectedList[1], choice] });
    return onChange({ choices: [...selectedList, choice] });
  }
  return (
    <div className={`quiz-choices ${isModifiedMcq ? "modified-mcq-choices" : ""}`}>
      {opts.map((o, i) => {
        const choice = choiceValue(o);
        const active = selectedList.includes(choice) || selectedList.includes(o.text);
        const textLen = trimText(o.text).length;
        return <button key={o.id || i} type="button" className={`choice-btn ${isModifiedMcq ? "modified-mcq-choice" : ""} ${active ? "active" : ""}`} onClick={() => !disabled && toggleChoice(choice)} disabled={disabled}><span className="choice-badge">{labels[i] || ""}</span><span className="choice-content">{o.image ? <img src={o.image} alt="" className="choice-img" /> : null}{(trimText(o.text) || !o.image) ? <span className="choice-text" style={{ fontSize: textLen > 90 ? 13 : textLen > 55 ? 14 : undefined }}>{trimText(o.text) || `Option ${labels[i] || i + 1}`}</span> : null}</span></button>;
      })}
    </div>
  );
}

function TrueFalseTemplate({ cfg, value, onChange, disabled }) {
  const opts = Array.isArray(cfg.options) && cfg.options.length ? cfg.options : ["True", "False"];
  return <div className="quiz-choices">{opts.map((o, i) => <button key={i} type="button" className={`choice-btn ${value.choice === o ? "active" : ""}`} onClick={() => !disabled && onChange({ choice: o })} disabled={disabled}><span className="choice-badge">{i === 0 ? "T" : "F"}</span><span className="choice-text">{o}</span></button>)}</div>;
}

function TypeAnswerTemplate({ value, onChange, disabled }) {
  const text = String(value.text || "");
  const MAX = 255;
  return <div className="type-wrap"><div className="type-center-shell"><p className="type-label">Type your identification answer below</p><div className={`type-input-row${disabled ? " locked" : ""}`}><input className="type-input" value={text} onChange={(e) => onChange({ text: e.target.value.slice(0, MAX) })} placeholder="Start typing..." disabled={disabled} autoComplete="off" spellCheck={false} maxLength={MAX} />{!disabled && text && <button type="button" className="type-clear-btn" onClick={() => onChange({ text: "" })}>✕</button>}</div>{text.length > 0 && <div className="type-charboxes">{text.split("").map((ch, i) => <div key={i} className="type-charbox">{ch === " " ? "\u00A0" : ch}</div>)}</div>}<div className="type-count">{text.length} / {MAX}</div></div></div>;
}

// Revision 11: assignment matching uses the same matching card classes as live gameplay.
function MatchingTemplate({ cfg, value, onChange, disabled }) {
  const colA = Array.isArray(cfg.colA) ? cfg.colA : [];
  const colB = Array.isArray(cfg.colB) ? cfg.colB : [];
  const pairs = Array.isArray(value.pairs) ? value.pairs : [];
  const matchingMap = Object.fromEntries(pairs.map((p) => [Number(p.aIndex), Number(p.bIndex)]));
  const [selectedA, setSelectedA] = useState(null);
  const usedB = new Set(Object.values(matchingMap).map(Number));
  const total = colA.length;
  const matchedCount = Object.keys(matchingMap).length;
  function updateMap(next) { onChange({ pairs: Object.entries(next).map(([aIndex, bIndex]) => ({ aIndex: Number(aIndex), bIndex: Number(bIndex) })) }); }
  function assignPair(aIndex, bIndex) {
    const next = { ...matchingMap };
    Object.keys(next).forEach((key) => { if (Number(key) === Number(aIndex) || Number(next[key]) === Number(bIndex)) delete next[key]; });
    next[Number(aIndex)] = Number(bIndex);
    updateMap(next);
    setSelectedA(null);
  }
  return (
    <div className="match-v2">
      <div className="match-v2-intro"><div className="match-v2-steps"><span className="match-v2-step"><span className="match-v2-step-num">1</span> Pick a question</span><span className="match-v2-step-arrow">→</span><span className="match-v2-step"><span className="match-v2-step-num">2</span> Pick its answer</span></div><div className="match-v2-progress"><div className="match-v2-progress-top"><span className="match-v2-progress-label">{matchedCount} of {total} matched</span></div><div className="match-v2-progress-track"><div className="match-v2-progress-fill" style={{ width: `${total ? Math.round((matchedCount / total) * 100) : 0}%` }} /></div></div></div>
      <p className="match-v2-hint">{selectedA !== null ? "Now tap the matching answer on the right." : "Tap a question on the left, then tap its answer."}</p>
      <div className="match-v2-columns"><section className="match-v2-col"><h3 className="match-v2-col-title">Questions</h3><ul className="match-v2-list">{colA.map((a, ai) => <li key={ai}><button type="button" className={`match-v2-card match-v2-card-q ${selectedA === ai ? "is-selected" : ""} ${matchingMap[ai] !== undefined ? "is-matched" : ""}`} onClick={() => !disabled && setSelectedA(selectedA === ai ? null : ai)} disabled={disabled}><span className="match-v2-card-main">{a.image ? <img src={a.image} alt="" className="match-v2-img" /> : null}<span className="match-v2-text">{trimText(a.text) || `Question ${ai + 1}`}</span>{matchingMap[ai] !== undefined ? <span className="match-v2-paired"><span className="match-v2-paired-label">Your answer:</span><strong>{trimText(colB[Number(matchingMap[ai])]?.text) || `Answer ${Number(matchingMap[ai]) + 1}`}</strong></span> : null}</span></button></li>)}</ul></section><section className="match-v2-col"><h3 className="match-v2-col-title">Answers</h3><ul className="match-v2-list">{colB.map((b, bi) => <li key={bi}><button type="button" className={`match-v2-card match-v2-card-ans ${usedB.has(bi) ? "is-used" : ""} ${selectedA !== null && !usedB.has(bi) ? "is-targetable" : ""}`} onClick={() => !disabled && selectedA !== null && !usedB.has(bi) && assignPair(selectedA, bi)} disabled={disabled || usedB.has(bi)}><span className="match-v2-card-main">{b.image ? <img src={b.image} alt="" className="match-v2-img" /> : null}<span className="match-v2-text">{trimText(b.text) || `Answer ${bi + 1}`}</span></span>{usedB.has(bi) ? <span className="match-v2-used-tag">Matched</span> : null}</button></li>)}</ul></section></div>
    </div>
  );
}

function GuessWord4PicsTemplate({ cfg, value, onChange, disabled }) {
  const images = Array.isArray(cfg.images) ? cfg.images : [];
  const target = String(cfg.target ?? "");
  const answerLen = Math.max(1, countAnswerLetters(target));
  useEffect(() => {
    if (value.mode === "pics4" && value.target === target && Array.isArray(value.bank) && value.bank.length) return;
    onChange({ mode: "pics4", target, text: "", bank: buildLetterBank(target, Number(cfg.dummyLetters || 6)) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.dummyLetters, target]);
  const bank = Array.isArray(value.bank) ? value.bank.map((x, i) => typeof x === "string" ? { id: i, ch: x } : x) : [];
  const built = String(value.text || "");
  const usedIds = (() => { const ids = []; const chars = built.split(""); const avail = bank.map((b) => ({ ...b, taken: false })); for (const ch of chars) { const t = avail.find((tile) => !tile.taken && tile.ch === ch); if (t) { t.taken = true; ids.push(t.id); } } return new Set(ids); })();
  function tap(id, ch) { if (disabled || usedIds.has(id) || built.length >= answerLen) return; onChange({ ...value, text: `${built}${ch}` }); }
  return <div className="pics4-wrap simple-mode"><div className="pics4-grid compact-grid">{[0,1,2,3].map((i) => <div key={i} className="pics4-frame compact-frame">{images[i] ? <img src={images[i]} alt={`Clue ${i + 1}`} /> : <span className="pics4-placeholder">?</span>}</div>)}</div><div className="pics4-answer-shell"><p className="pics4-answer-label">Tap letters to build the word.</p><div className="spell-wrap"><div className="spell-display">{Array.from({ length: answerLen }).map((_, i) => <div key={i} className="spell-char">{built[i] || "•"}</div>)}</div><div className="spell-bank">{bank.map(({ id, ch }) => <button key={id} type="button" className={`spell-tile${usedIds.has(id) ? " used" : ""}`} onClick={() => tap(id, ch)} disabled={disabled || usedIds.has(id) || built.length >= answerLen}>{ch}</button>)}</div><div className="spell-controls"><button type="button" className="spell-ctrl back" onClick={() => onChange({ ...value, text: built.slice(0, -1) })} disabled={disabled || !built}>⌫ Back</button><button type="button" className="spell-ctrl clr" onClick={() => onChange({ ...value, text: "" })} disabled={disabled || !built}>Clear</button></div></div></div></div>;
}

function BookwormThinkSpellTemplate({ cfg, value, onChange, disabled, questionId }) {
  const gridSize = Math.min(12, Math.max(5, Number(cfg.gridSize ?? 8) || 8));
  const minWordLength = Math.min(8, Math.max(2, Number(cfg.minWordLength ?? 3) || 3));
  const wordBank = resolveThinkSpellWordBank({ config: cfg, correct: {} });
  const sig = buildThinkSpellSignature({ questionId, gridSize, words: wordBank });
  const draggingRef = useRef(false);
  useEffect(() => {
    if (value?.mode === "wordhunt-batch" && value.sig === sig && Array.isArray(value.grid) && value.grid.length) return;
    const initial = loadThinkSpellGridState({ config: cfg, correct: {}, questionId, priorPayload: null });
    onChange({ mode: "wordhunt-batch", sig, grid: initial.grid, gridSize: initial.gridSize, wordBank, words: [], foundEntries: [], selected: [], built: "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
  const grid = Array.isArray(value.grid) ? value.grid : [];
  const activeGridSize = Number(value.gridSize || gridSize);
  const selected = Array.isArray(value.selected) ? value.selected : [];
  const selectedSet = new Set(selected);
  const foundEntries = Array.isArray(value.foundEntries) ? value.foundEntries : [];
  const foundSet = new Set(foundEntries.map((entry) => normalizeThinkWordKey(entry.text || entry.word || "")));
  const foundPathSet = new Set(foundEntries.flatMap((entry) => Array.isArray(entry.path) ? entry.path.map(Number) : []));
  const built = selected.map((cell) => grid[cell] || "").join("");
  const cellGap = 8;
  function patch(next) { onChange({ ...value, ...next }); }
  function addIndex(cell) {
    if (disabled || !grid[cell] || selectedSet.has(cell)) return;
    if (!selected.length) return patch({ selected: [cell], built: String(grid[cell] || "") });
    const last = selected[selected.length - 1];
    if (!isAdjacentSelection(last, cell, activeGridSize)) return;
    const nextSelected = [...selected, cell];
    if (!isStraightLinePath(nextSelected, activeGridSize)) return;
    patch({ selected: nextSelected, built: nextSelected.map((n) => grid[n] || "").join("") });
  }
  function finishSelection() {
    draggingRef.current = false;
    const text = selected.map((cell) => grid[cell] || "").join("");
    const matchedKey = matchThinkSpellWord(text, wordBank);
    const pathValid = text.length >= minWordLength && validatePathSpellsWord({ grid, gridSize: activeGridSize, path: selected, word: text });
    if (matchedKey && pathValid && !foundSet.has(matchedKey)) {
      const nextFound = [...foundEntries, { text, path: selected }];
      return patch({ foundEntries: nextFound, words: nextFound, selected: [], built: "" });
    }
    patch({ selected: [], built: "" });
  }
  function handleGridPointerMove(e) { if (!draggingRef.current || disabled) return; const target = document.elementFromPoint(e.clientX, e.clientY)?.closest?.("[data-bword-index]"); if (target) addIndex(Number(target.dataset.bwordIndex)); }
  const linePoints = selected.length > 1 ? getPathLinePoints(selected, activeGridSize, 48, cellGap) : [];
  const previewStatus = !built ? "Hold and drag across adjacent letters." : built.length < minWordLength ? `Need at least ${minWordLength} letters` : foundSet.has(matchThinkSpellWord(built, wordBank)) ? "Already found" : matchThinkSpellWord(built, wordBank) ? "Release to add this word" : "Not on the word list";
  return <div className="bword-wrap"><div className="bword-hud"><div className="bword-hud-stat"><span className="bword-hud-label">Found</span><span className="bword-hud-value">{foundEntries.length}/{wordBank.length}</span></div><div className="bword-hud-stat"><span className="bword-hud-label">Submit</span><span className="bword-hud-value">Once</span></div></div><div className="bword-instructions">Hold and drag across adjacent letters to find words. Find all answers first, then submit once.</div>{wordBank.length > 0 && <div className="bword-quest-panel"><div className="bword-quest-title">Word goals</div><div className="bword-quest-list">{wordBank.map((word) => { const key = normalizeThinkWordKey(word); const done = foundSet.has(key); return <span key={key} className={`bword-quest-chip${done ? " done" : ""}`}>{done ? "✓ " : ""}{word.toUpperCase()}</span>; })}</div></div>}<div className="bword-grid-shell" onPointerMove={handleGridPointerMove} onPointerLeave={() => draggingRef.current && finishSelection()}><div className="bword-grid" style={{ gridTemplateColumns: `repeat(${activeGridSize}, minmax(0, 1fr))`, gap: cellGap }}>{grid.map((ch, cell) => <button key={`${sig}-${cell}`} type="button" className={`bword-cell${selectedSet.has(cell) ? " selected" : ""}${foundPathSet.has(cell) ? " found" : ""}`} onPointerDown={(e) => { if (disabled) return; e.preventDefault(); draggingRef.current = true; patch({ selected: [cell], built: String(grid[cell] || "") }); }} onPointerEnter={() => draggingRef.current && addIndex(cell)} onPointerUp={finishSelection} disabled={disabled} data-bword-index={cell}>{ch}</button>)}</div>{linePoints.length > 1 && <svg className="bword-path-line" viewBox={`0 0 ${activeGridSize * 56} ${activeGridSize * 56}`} preserveAspectRatio="none"><polyline points={linePoints.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="rgba(134, 239, 172, 0.95)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" /></svg>}</div><div className="bword-built-row"><div className="spell-display bword-current-word">{(built || "•").split("").map((letter, i) => <div key={i} className="spell-char" style={{ width: 32, height: 34, background: letter === "•" ? "rgba(255,255,255,0.08)" : "var(--sp-spell-char-bg)" }}>{letter}</div>)}</div><div className={`bword-preview-status${previewStatus.includes("Release") ? " ok" : ""}`}>{previewStatus}</div></div><div className="bword-controls"><button type="button" className="spell-ctrl clr" onClick={() => patch({ selected: [], built: "" })} disabled={disabled || !selected.length}>Clear current line</button></div>{foundEntries.length > 0 && <div className="bword-found-panel"><div className="bword-found-title">Words found before submission</div><div className="bword-found-list">{foundEntries.map((entry, index) => <span key={`${entry.text}-${index}`} className="bword-found-chip">{(entry.text || "").toUpperCase()}{!disabled && <button type="button" onClick={() => { const nextFound = foundEntries.filter((_, i) => i !== index); patch({ foundEntries: nextFound, words: nextFound }); }} style={{ marginLeft: 6, border: 0, background: "transparent", color: "inherit", cursor: "pointer", fontWeight: 900 }}>×</button>}</span>)}</div></div>}</div>;
}
