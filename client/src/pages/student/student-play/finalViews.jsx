import { useState } from "react";
import { TwIcon } from "../../../components/TwUI";
import { getRole } from "../../../lib/auth";

export function FinalLeaderboardView({
  dark,
  exiting,
  experienceBgStyle,
  gameplayAccent,
  experienceControls,
  antiCheatOverlay,
  cardBg,
  textC,
  mutedC,
  scores,
  myGroupId,
  myGroup,
  isGroupMode,
  participantId,
  onExit,
}) {
  const isGuestParticipant = getRole() !== "STUDENT";
  const myScoreIndex = isGroupMode
    ? scores.findIndex((row) => Number(row.group_id || 0) === Number(myGroupId || 0) || (myGroup?.display_name && row.group_name === myGroup.display_name))
    : scores.findIndex((row) => Number(row.participant_id) === Number(participantId));
  const myScore = myScoreIndex >= 0 ? scores[myScoreIndex] : null;
  const myRank = myScoreIndex + 1;
  const totalParticipants = scores.length;
  const leaderboardColumns = Math.max(1, Math.min(4, Math.ceil(totalParticipants / 10)));
  const rankGroups = [scores.slice(3, 10), scores.slice(10, 20), scores.slice(20, 30), scores.slice(30, 40)].slice(0, leaderboardColumns);
  const podiumOrder = [scores[1], scores[0], scores[2]].filter(Boolean);
  const rankOf = (row) => scores.findIndex((candidate) => candidate === row) + 1;
  const displayName = (row) => isGroupMode ? (row.group_name || `${row.first_name || ""} ${row.last_name || ""}`.trim()) : `${row.first_name || ""} ${row.last_name || ""}`.trim();
  const shortDisplayName = (row) => {
    if (isGroupMode) return displayName(row);
    const first = String(row.first_name || "").trim();
    const last = String(row.last_name || "").trim();
    if (!first && !last) return "Player";
    if (!last) return first;
    return `${first} ${last.charAt(0)}.`;
  };
  const isMe = (row) => isGroupMode ? (Number(row.group_id || 0) === Number(myGroupId || 0) || (myGroup?.display_name && row.group_name === myGroup.display_name)) : Number(row.participant_id) === Number(participantId);
  // Normal points by default; tap any score or the chip to see competitive.
  const [scoreMode, setScoreMode] = useState("normal");
  const toggleScoreMode = () => setScoreMode((mode) => (mode === "competitive" ? "normal" : "competitive"));
  const pts = (row) => Math.round(Number(scoreMode === "competitive" ? row.competitive_points : row.total_points) || 0).toLocaleString();
  return (
    <div className={`sp-final-page ${dark ? "theme-dark" : "theme-light"}`} style={{ minHeight: "100vh", ...experienceBgStyle, "--sp-template-accent": gameplayAccent, "--host-accent": gameplayAccent, fontFamily: "Inter,'Segoe UI',system-ui,sans-serif", transition: "background 0.45s, opacity 0.26s", opacity: exiting ? 0 : 1 }}>
      {experienceControls}{antiCheatOverlay}
      <div className={`sp-final-wrap sp-page-enter columns-${leaderboardColumns}`}>
        <section className="sp-final-leaderboard-card" style={{ background: cardBg, borderColor: gameplayAccent }}>
          <div className="sp-final-summary sp-final-summary-compact">
            {myScore && <p style={{ color: mutedC }}>You scored <b style={{ color: gameplayAccent }}>{pts(myScore)} pts</b>{myRank > 0 && <> · Rank #{myRank}</>}</p>}
          </div>
          <h3 className="sp-final-heading" style={{ color: textC }}><TwIcon name="trophy" size={21}/> Leaderboard</h3>
          <div style={{ display: "flex", justifyContent: "center", margin: "0 0 10px" }}><button type="button" onClick={toggleScoreMode} title="Switch between normal and competitive points" style={{ border: `1px solid ${gameplayAccent}`, background: "transparent", color: gameplayAccent, borderRadius: 999, padding: "5px 14px", fontSize: 12, fontWeight: 800, fontFamily: "inherit", cursor: "pointer" }}>{scoreMode === "competitive" ? "Competitive points" : "Normal points"}</button></div>
          <div className="tw-host-podium sp-final-host-podium">
            {podiumOrder.map((row) => {
              const rank = rankOf(row);
              return <div key={row.participant_id || row.group_id || rank} className={`tw-host-podium-place place-${rank}${isMe(row) ? " is-me" : ""}`}>
                <div className="tw-host-trophy"><TwIcon name="trophy" size={54} strokeWidth={2.2}/><span>{rank}</span></div>
                <div className="tw-host-podium-platform">
                  <div className="tw-host-podium-person">
                    <div className="tw-host-podium-avatar" aria-hidden="true">{row?.profile_image ? <img src={row.profile_image} alt=""/> : <TwIcon name={isGroupMode ? "users" : "user"} size={18}/>}</div>
                    <b title={displayName(row)}>{shortDisplayName(row)}</b>
                  </div>
                  <button type="button" onClick={toggleScoreMode} title="Click to switch point type" className="tw-host-podium-points tw-host-score-click" style={{ background: "transparent", border: "none", cursor: "pointer", font: "inherit" }}>{pts(row)} pts</button>
                </div>
              </div>;
            })}
          </div>
          <div className="sp-final-rank-grid" style={{ gridTemplateColumns: `repeat(${leaderboardColumns}, minmax(0, 1fr))` }}>
            {rankGroups.map((rows, columnIndex) => <div className="sp-final-rank-column" key={columnIndex}>{rows.map((row) => {
              const rank = rankOf(row);
              return <div key={row.participant_id || row.group_id || rank} className={`tw-student-leader-row${isMe(row) ? " is-me" : ""}`}>
                <span className="tw-student-leader-rank">#{rank}</span>
                <span className="tw-student-leader-name" style={{ color: textC }}>{displayName(row)}</span>
                <button type="button" onClick={toggleScoreMode} title="Click to switch point type" className="tw-student-leader-points" style={{ background: "transparent", border: "none", cursor: "pointer", font: "inherit", color: "inherit", padding: 0 }}>{pts(row)} pts</button>
              </div>;
            })}</div>)}
          </div>
          {leaderboardColumns <= 2 && <div className="sp-final-dashboard-row"><button className="tw-admin-press tw-admin-press-blue tw-teacher-press tw-student-final-nav" onClick={() => onExit(isGuestParticipant ? "/" : "/student")}><span>{isGuestParticipant ? "Back to Landing" : "Dashboard"}</span></button>{isGuestParticipant && <button className="sp-join-another-session" onClick={() => onExit("/?join=guest")}>Join another session?</button>}</div>}
        </section>
        {leaderboardColumns >= 3 && <div className="sp-final-dashboard-top-wrap"><button className="tw-admin-press tw-admin-press-blue tw-teacher-press tw-student-final-nav sp-final-dashboard-top" onClick={() => onExit(isGuestParticipant ? "/" : "/student")}><span>{isGuestParticipant ? "Back to Landing" : "Dashboard"}</span></button>{isGuestParticipant && <button className="sp-join-another-session" onClick={() => onExit("/?join=guest")}>Join another session?</button>}</div>}
      </div>
    </div>
  );
}
