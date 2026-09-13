import { LoadingDots } from "../../../components/TwUI";
import thinkBotLogo from "../../../assets/thinkbot-logo.png";
import { WaitRosterCard } from "./experienceChrome";

export function WaitingRoomView({
  dark,
  waitExperienceBgStyle,
  experienceControls,
  antiCheatOverlay,
  explanationOverlay,
  cardBg,
  cardBor,
  textC,
  mutedC,
  state,
  isGroupMode,
  myGroup,
  isGuestHosted,
  msg,
  roster,
  groups,
  groupNameDraft,
  onGroupNameDraft,
  participantId,
  onJoinGroup,
}) {
  const waitingTitle = state?.status === "PAUSED"
    ? "Game Paused, please wait"
    : isGroupMode
      ? (myGroup ? "Waiting for the teacher to start" : "Waiting for teacher to add groups")
      : "Waiting for others to join";
  const waitingSubtitle = state?.status === "PAUSED"
    ? "The teacher will resume shortly."
    : isGroupMode
      ? "Groups update in real time as the teacher prepares the session."
      : isGuestHosted ? "The host will start the session soon." : "The teacher will start the session soon.";
  return (
    <div className={`sp-waiting-page ${dark ? "theme-dark" : "theme-light"}`} style={{ minHeight: "100vh", ...waitExperienceBgStyle, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI',system-ui,sans-serif", transition: "background 0.45s", padding: 20 }}>
      {experienceControls}{antiCheatOverlay}{explanationOverlay}
      <div className="sp-wait-card sp-page-enter" style={{ width: "min(100%, 820px)", background: cardBg, borderColor: cardBor }}>
        <div className="sp-wait-icon-wrap sp-thinkbot-loading" style={{ background: dark ? "rgba(8,22,50,.88)" : "rgba(255,255,255,.92)", borderColor: cardBor }}>
          <span className="sp-thinkbot-loading-ring" aria-hidden="true" />
          <img src={thinkBotLogo} alt="ThinkBot" className="sp-thinkbot-loading-logo" />
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
          <h3 className="sp-wait-title" style={{ color: textC, margin: 0 }}>{waitingTitle}<LoadingDots color={mutedC} /></h3>
          {/* <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
            <SoundTogglePill muted={isMuted} onClick={handleToggleMute} />
            <ThemeTogglePill dark={dark} onClick={toggleTheme} />
          </div> */}
        </div>
        <p className="sp-wait-subtitle" style={{ color: mutedC }}>{waitingSubtitle}</p>
        {msg && <p style={{ color: "#ef4444", fontWeight: 800 }}>{msg}</p>}

        {!isGroupMode && (
          <div style={{ width: "100%", marginTop: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
            {roster.map((p) => (
              <WaitRosterCard key={p.id} item={p} dark={dark} subtitle={p.connected ? "Online" : "Offline"} />
            ))}
          </div>
        )}

        {isGroupMode && !myGroup && (
          <div style={{ width: "100%", marginTop: 18 }}>
            {groups.length === 0 ? (
              <div style={{ padding: 18, borderRadius: 18, background: dark ? "rgba(255,255,255,0.05)" : "#f4f7ff", border: `1px solid ${cardBor}`, color: textC, fontWeight: 700, textAlign: "center" }}>
                <div className="sp-wait-icon-wrap sp-thinkbot-loading" style={{ margin: "0 auto 12px", width: 78, height: 78, background: dark ? "rgba(8,22,50,.88)" : "rgba(255,255,255,.92)", borderColor: cardBor }}>
                  <span className="sp-thinkbot-loading-ring" aria-hidden="true" />
                  <img src={thinkBotLogo} alt="ThinkBot" className="sp-thinkbot-loading-logo" />
                </div>
                Waiting for teacher to add groups<LoadingDots color={mutedC} />
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
                {groups.map((group) => (
                  <div key={group.id} style={{ padding: 16, borderRadius: 18, background: dark ? "rgba(255,255,255,0.05)" : "#f8faff", border: `1px solid ${cardBor}`, boxShadow: dark ? "none" : "0 12px 28px rgba(43,108,255,0.08)" }}>
                    <div style={{ color: textC, fontWeight: 900, marginBottom: 6 }}>{group.display_name}</div>
                    <div style={{ color: mutedC, fontSize: 12, marginBottom: 10 }}>{group.members?.length || 0} members</div>
                    <button onClick={() => onJoinGroup(group.id)} style={{ padding: "10px 16px", borderRadius: 999, border: "none", background: "#2b6cff", color: "#fff", fontWeight: 800, cursor: "pointer" }}>Join Group</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {isGroupMode && myGroup && (
          <div style={{ width: "100%", marginTop: 18, display: "grid", gap: 12 }}>
            <div style={{ padding: 16, borderRadius: 18, background: dark ? "rgba(255,255,255,0.05)" : "#f8faff", border: `1px solid ${cardBor}` }}>
              <div style={{ color: mutedC, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Your Group</div>
              <input value={groupNameDraft} onChange={(e) => onGroupNameDraft(e.target.value)} disabled={Number(myGroup?.name_editor_participant_id || 0) !== Number(participantId)} style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 14, border: `1px solid ${cardBor}`, background: dark ? "rgba(255,255,255,0.04)" : "#eef2ff", color: textC, fontWeight: 800, opacity: Number(myGroup?.name_editor_participant_id || 0) !== Number(participantId) ? 0.72 : 1 }} />
              <div style={{ color: mutedC, fontSize: 12, marginTop: 8 }}>{Number(myGroup?.name_editor_participant_id || 0) === Number(participantId) ? 'Only the first student in the group can edit the group name.' : 'Only the first student who joined this group can rename it.'}</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
              {myGroup.members?.map((member) => (
                <WaitRosterCard key={member.id} item={member} dark={dark} subtitle={member.connected ? "Online" : "Offline"} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function CountdownView({
  experienceBgStyle,
  experienceControls,
  antiCheatOverlay,
  explanationOverlay,
  dark,
  state,
  questions,
  countdown,
}) {
  return (
    <div style={{ minHeight: "100vh", ...experienceBgStyle, fontFamily: "'Segoe UI',system-ui,sans-serif", transition: "background 0.45s" }}>
      {experienceControls}{antiCheatOverlay}{explanationOverlay}
      <div className="countdown-overlay" style={{ background: dark ? undefined : "radial-gradient(circle at center, rgba(255,255,255,0.86), rgba(219,230,255,0.95))" }}>
        <div className="countdown-card">
          <h3 className="countdown-title" style={{ color: dark ? "#fff" : "#17305f" }}>{Number(state?.current_question_index||0)===0 ? "Get Ready" : Number(state?.current_question_index||0)>=questions.length-1 ? "This will be the last question!" : "Next question coming in..."}</h3>
          <div key={countdown} className="countdown-number">{countdown}</div>
          <p className="countdown-sub" style={{ color: dark ? "rgba(255,255,255,0.75)" : "#5a6a9a" }}>{Number(state?.current_question_index||0)===0 ? "Session is about to start" : "Prepare for the next challenge"}</p>
        </div>
      </div>
    </div>
  );
}
