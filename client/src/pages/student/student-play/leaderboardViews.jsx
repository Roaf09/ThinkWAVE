import { useLayoutEffect, useRef, useState } from "react";
import { TwIcon } from "../../../components/TwUI";

function scoreName(row, groupMode = false) {
  return groupMode ? (row?.group_name || `${row?.first_name || ""} ${row?.last_name || ""}`.trim()) : `${row?.first_name || ""} ${row?.last_name || ""}`.trim();
}

export function LiveLeaderboardPanel({ leaderboard, participantId, groupMode = false }) {
  // Only affects layout below the mobile breakpoint (see StudentPlay.css) -
  // above it the panel always renders in full regardless of this state.
  // Starts minimized so it never opens on top of the question by default;
  // the toggle button lets the student pull it out deliberately instead.
  const [minimized, setMinimized] = useState(true);
  const top5 = Array.isArray(leaderboard?.top5) ? leaderboard.top5.slice(0, 5) : [];
  const itemRefs = useRef(new Map());
  const previousTops = useRef(new Map());
  const signature = top5.map((row) => row?.group_id || row?.participant_id || scoreName(row, groupMode)).join("|");

  useLayoutEffect(() => {
    const next = new Map();
    itemRefs.current.forEach((node, key) => {
      if (!node) return;
      const top = node.getBoundingClientRect().top;
      next.set(key, top);
      const previous = previousTops.current.get(key);
      if (Number.isFinite(previous) && Math.abs(previous - top) > 1 && node.animate) {
        node.animate([
          { transform: `translateY(${previous - top}px)`, opacity: .78 },
          { transform: "translateY(0)", opacity: 1 },
        ], { duration: 430, easing: "cubic-bezier(.22,1,.36,1)" });
      }
    });
    previousTops.current = next;
  }, [signature]);

  const meInTop5 = top5.some((row) => groupMode ? Number(row?.group_id || 0) === Number(leaderboard?.myScore?.group_id || 0) : Number(row?.participant_id || 0) === Number(participantId));
  return <aside className={`sp-live-top5${minimized ? " is-minimized" : ""}`} aria-label="Live top five leaderboard">
    <button type="button" className="sp-live-top5-toggle" aria-label={minimized ? "Show live leaderboard" : "Hide live leaderboard"} aria-expanded={!minimized} onClick={() => setMinimized((value) => !value)}>
      <TwIcon name={minimized ? "trophy" : "close"} size={16}/>
    </button>
    <div className="sp-live-top5-panel">
      <div className="sp-live-top5-title"><TwIcon name="trophy" size={16}/> Live Top 5</div>
      <div className="sp-live-top5-list">
        {Array.from({ length: 5 }).map((_, index) => {
          const row = top5[index];
          const key = row ? String(row.group_id || row.participant_id || scoreName(row, groupMode)) : `empty-${index}`;
          const trophyClass = index < 3 ? ` rank-${index + 1}` : "";
          return <div className="sp-live-top5-row" key={`rank-${index + 1}`}>
            <span className="sp-live-top5-rank">{index + 1}</span>
            <span className={`sp-live-top5-trophy${trophyClass}`} aria-hidden="true">{index < 3 ? <TwIcon name="trophy" size={14}/> : null}</span>
            {row ? <div className="sp-live-top5-person" key={key} ref={(node) => node ? itemRefs.current.set(key, node) : itemRefs.current.delete(key)}>
              <span className="sp-live-top5-identity">
                <span className="sp-live-top5-avatar">{row.profile_image ? <img src={row.profile_image} alt=""/> : <TwIcon name={groupMode ? "users" : "user"} size={15}/>}</span>
                <span className="sp-live-top5-name">{scoreName(row, groupMode) || "Player"}</span>
              </span>
              <b>{Math.round(Number(row.competitive_points || 0)).toLocaleString()}</b>
            </div> : <div className="sp-live-top5-empty">—</div>}
          </div>;
        })}
      </div>
      {!meInTop5 && leaderboard?.myScore && Number(leaderboard?.myRank || 0) > 0 ? <>
        <div className="sp-live-top5-separator"/>
        <div className="sp-live-top5-me"><span>{leaderboard.myRank}</span><b>You</b><strong>{Math.round(Number(leaderboard.myScore?.competitive_points || 0)).toLocaleString()} pts</strong></div>
      </> : null}
    </div>
  </aside>;
}
