import { TwIcon } from "../../../components/TwUI";
import { QuestionAudioButton } from "../../../components/AudioControls";
import thinkBotLogo from "../../../assets/thinkbot-logo.png";
import { LiveLeaderboardPanel } from "./leaderboardViews";
import { TemplateBody } from "./questionViews";
import { feedbackCopy, feedbackStatus, fmtTime, renderAnswerPreview } from "./studentPlayUtils";

export function GameplayView({
  dark,
  experienceBgStyle,
  gameplayAccent,
  experienceControls,
  antiCheatOverlay,
  explanationOverlay,
  liveLeaderboard,
  participantId,
  isGroupMode,
  showFeedback,
  feedbackQ,
  feedbackFxKey,
  groupProposal,
  proposalStatus,
  onVoteGroup,
  cardBor,
  textC,
  mutedC,
  state,
  questions,
  timer,
  completedLiveCount,
  liveQuestionProgress,
  myGroup,
  currentQ,
  thinkSpellTimeUp,
  ttNormalized,
  selectedChoice,
  onSelectedChoice,
  answerText,
  onAnswerText,
  matchingMap,
  onMatchingMap,
  spell,
  onSpell,
  onSubmit,
  isLocked,
  interactionLocked,
  thinkSpellSubmitLabel,
  thinkSpellAllFound,
  msg,
  isMatchingIncomplete,
  isLastQuestion,
  submittedQId,
  selectedBackground,
  feedbackPulse,
}) {
  return (
    <div className={`sp-gameplay-page ${dark ? "theme-dark" : "theme-light"}`} style={{ minHeight: "100vh", ...experienceBgStyle, display: "flex", flexDirection: "column", fontFamily: "'Segoe UI',system-ui,sans-serif", transition: "background 0.45s", "--sp-template-accent": gameplayAccent }}>
        {experienceControls}{antiCheatOverlay}{explanationOverlay}
      <LiveLeaderboardPanel leaderboard={liveLeaderboard} participantId={participantId} groupMode={isGroupMode} />
      {showFeedback && feedbackQ && (() => {
        const status = feedbackQ.status || feedbackStatus(feedbackQ);
        const copy = feedbackCopy(feedbackQ);
        return <div className={`sp-feedback-overlay is-${status}`}>
          <div className="sp-feedback-burst" aria-hidden="true">
            {Array.from({ length: 10 }).map((_, i) => <span key={i} style={{ "--i": i }} />)}
          </div>
          <div key={feedbackFxKey} className={`sp-feedback-card is-${status}`}>
            <div className="sp-feedback-icon"><TwIcon name={copy.icon} size={44}/></div>
            <div className="sp-feedback-title">{copy.title}</div>
            <div className="sp-feedback-subtitle">{copy.subtitle}</div>
          </div>
        </div>;
      })()}

      {groupProposal && isGroupMode && (
        <div style={{ position: "fixed", inset: 0, zIndex: 120, display: "grid", placeItems: "center", background: dark ? "rgba(0,0,0,0.56)" : "rgba(30,45,85,0.24)", backdropFilter: "blur(6px)" }}>
          <div style={{ width: "min(92vw, 520px)", borderRadius: 24, background: dark ? "#0e1733" : "#ffffff", border: `1px solid ${cardBor}`, boxShadow: dark ? "0 30px 80px rgba(0,0,0,0.5)" : "0 24px 60px rgba(43,108,255,0.18)", overflow: "hidden" }}>
            <div style={{ padding: "24px 24px 14px", background: dark ? "linear-gradient(180deg, rgba(43,108,255,0.16), transparent)" : "linear-gradient(180deg, rgba(43,108,255,0.14), transparent)" }}>
              <div style={{ width: 56, height: 56, borderRadius: 16, display: "grid", placeItems: "center", background: "rgba(43,108,255,0.12)", color: "#2b6cff", border: "1px solid rgba(43,108,255,0.2)", marginBottom: 14, fontSize: 24 }}><TwIcon name="users" size={28}/></div>
              <h3 style={{ margin: 0, color: textC, fontSize: 22, fontWeight: 900 }}>Confirm group answer?</h3>
              <p style={{ margin: "10px 0 0", color: mutedC, lineHeight: 1.65, fontSize: 14 }}><b style={{ color: textC }}>{groupProposal.proposerName || "A teammate"}</b> wants to submit this answer: <b style={{ color: textC }}>{renderAnswerPreview(groupProposal.answer)}</b></p>
            </div>
            <div style={{ padding: "0 24px 22px" }}>
              <div style={{ color: mutedC, fontSize: 13, marginBottom: 14 }}>{proposalStatus || `Votes: ${(groupProposal.votes || []).length}/${groupProposal.totalMembers}`}</div>
              <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", flexWrap: "wrap" }}>
                <button onClick={() => onVoteGroup("DISAGREE")} style={{ padding: "12px 18px", borderRadius: 14, border: "1px solid #fca5a5", background: dark ? "#2a0f0f" : "#fee2e2", color: "#dc2626", fontWeight: 800, cursor: "pointer" }}>Disagree</button>
                <button onClick={() => onVoteGroup("AGREE")} style={{ padding: "12px 18px", borderRadius: 14, border: "1px solid rgba(43,108,255,0.3)", background: dark ? "rgba(43,108,255,0.2)" : "#dbeafe", color: "#1d4ed8", fontWeight: 900, cursor: "pointer" }}>Agree</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className={`quiz-shell-new ${dark ? "theme-dark" : "theme-light"} ${selectedBackground ? "has-session-background" : ""} ${feedbackPulse ? `feedback-hit-${feedbackPulse}` : ""}`} style={{ width: "100%", minHeight: "100vh", margin: 0, display: "flex", flexDirection: "column", "--sp-template-accent": gameplayAccent }}>
        <div className="qn-header">
          <div className="qn-title-cluster">
            <div className="qn-brand"><img src={thinkBotLogo} alt="ThinkBot" className="qn-brand-bot"/><span>Think</span><span>WAVE</span></div><div className="qn-subject">{state.quiz_title || "Quiz"}</div>
          </div>
          <div className="qn-meta">
            <div className="qn-qcount">{state?.template_type === "MATCHING" ? `Batch ${(state.current_question_index || 0) + 1}/${questions.length}` : `${(state.current_question_index || 0) + 1}/${questions.length}`}</div>
            <div className={`qn-timer qn-pixel-timer ${state.quiz_category === "K12" ? "is-k12" : ""}${timer.remainingSec <= 3 ? " is-danger" : timer.remainingSec <= 4 ? " is-warning" : ""}`}><TwIcon name="clock" size={20}/> {fmtTime(timer.remainingSec ?? Number(timer.total || state.time_limit_sec || 0))}</div>
          </div>
        </div>
        <div className="qn-question-progress" aria-label={`${completedLiveCount} of ${questions.length} questions answered`}><div className="qn-question-progress-bar" style={{ width: `${liveQuestionProgress}%` }} /></div>
        <div className={`qn-progress qn-timer-progress${timer.remainingSec <= 3 ? " is-danger" : timer.remainingSec <= 4 ? " is-warning" : ""}`}><div className="qn-progress-bar" style={{ width: `${Math.round((timer.progress || 0) * 100)}%` }} /></div>

        <div className="qn-body" style={{ flex: 1 }}>
        {isGroupMode && myGroup && (
          <div style={{ marginBottom: 14, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center", padding: "10px 14px", borderRadius: 16, background: dark ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.75)", border: `1px solid ${cardBor}` }}>
            <div>
              <div style={{ color: textC, fontWeight: 900 }}>{myGroup.display_name}</div>
              <div style={{ color: mutedC, fontSize: 12 }}>{myGroup.members?.map((m) => `${m.first_name} ${m.last_name}`.trim()).join(" · ")}</div>
            </div>
            <div style={{ color: mutedC, fontSize: 12 }}>One final answer per group · majority confirms it</div>
          </div>
        )}
        <div className="qn-prompt-box">
          {currentQ?.config_json?.showPromptImage !== false && currentQ?.config_json?.promptImage ? <img src={currentQ.config_json.promptImage} alt="" className="qn-prompt-img" /> : null}
          <span className="qn-prompt-text">{currentQ.prompt}</span>
          <QuestionAudioButton config={currentQ?.config_json} prompt={currentQ?.prompt} templateType={ttNormalized}/>
        </div>
        <TemplateBody disabled={interactionLocked} templateType={ttNormalized} q={currentQ} selectedChoice={selectedChoice} setSelectedChoice={onSelectedChoice} answerText={answerText} setAnswerText={onAnswerText} matchingMap={matchingMap} setMatchingMap={onMatchingMap} spell={spell} setSpell={onSpell} thinkSpellTimeUp={thinkSpellTimeUp} shuffleChoices={!!state?.shuffle_answers} participantSeed={participantId} onSubmitGuess={onSubmit} guessSubmitDisabled={isLocked} />
        {thinkSpellAllFound && (
          <div className="bword-summary">
            <div className="bword-summary-title">All words found!</div>
            <div className="bword-summary-meta">
              <b>{(spell.foundWords || []).length}</b> words · <b>{Number(spell.totalPoints || 0)}</b> pts
            </div>
            <div className="bword-summary-hint">Wait for the teacher to continue.</div>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "center", marginTop: 20 }}>
          <button
            onClick={onSubmit}
            disabled={isLocked}
            className="submit-btn"
            style={{
              "--sp-submit-accent": gameplayAccent,
              opacity: isLocked ? 0.72 : 1,
              cursor: isLocked ? "not-allowed" : "pointer",
              background: isLocked
                ? (dark ? "linear-gradient(180deg, #27457c 0%, #1b3260 100%)" : "linear-gradient(180deg, #8ec9ff 0%, #73b3f4 100%)")
                : undefined,
              boxShadow: isLocked ? "none" : undefined,
            }}
          >
            {thinkSpellSubmitLabel}
          </button>
        </div>
        {msg && <div style={{ textAlign: "center", color: "#ef4444", fontWeight: 700, marginTop: 12 }}>{msg}</div>}
        {state?.template_type === "MATCHING" && isMatchingIncomplete && <div style={{ textAlign: "center", color: mutedC, fontWeight: 700, marginTop: 12 }}>Match every question with an answer to unlock Submit.</div>}

        {isLastQuestion && submittedQId === currentQ?.id && ttNormalized !== "THINK_SPELL" && <div style={{ textAlign: "center", color: mutedC, fontWeight: 700, marginTop: 12 }}>You have reached the end.</div>}
        </div>
      </div>
    </div>
  );
}
