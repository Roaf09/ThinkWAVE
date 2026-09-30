/* FILE GUIDE:
 * client/src/pages/guest/GuestHomeTab.jsx
 * Purpose: Guest dashboard home — a join-code card (same flow as the enter
 * code page) plus the guest's recent live sessions (same data as History,
 * previewed like the teacher home's recent list).
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { useColors } from "../../context/ThemeContext";
import { EmptyState, TwIcon } from "../../components/TwUI";
import { TeacherPressButton } from "../teacher/TeacherUI";
import { templateCardChrome, templateLabel, templateTone } from "../../lib/templatePalette";
import { manilaDateTime } from "../../lib/dateFormat";
import { TwLogoLoader } from "../../components/TwLogoLoader";

const shellCard = (c, extra = {}) => ({
  background: c.cardBg,
  border: `3px solid ${c.border}`,
  boxShadow: c.pageBg === "#eef2ff" ? "0 16px 34px rgba(43,108,255,0.08)" : "0 16px 34px rgba(0,0,0,0.14)",
  transition: "background 0.3s, border-color 0.3s, transform 0.25s, box-shadow 0.3s",
  ...extra,
});

const pill = (c, extra = {}) => ({
  background: c.cardBg2,
  border: `1px solid ${c.border}`,
  color: c.text,
  ...extra,
});

export default function GuestHomeTab({ setActiveTab }) {
  const c = useColors();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [joinMsg, setJoinMsg] = useState("");
  const [joining, setJoining] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get("/sessions/history");
        if (alive) setSessions((data || []).slice(0, 5));
      } catch (e) {
        console.error(e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Same flow as the enter code page: validate first, then hand off to play.
  async function continueJoin(event) {
    event.preventDefault();
    const clean = code.trim().toUpperCase();
    if (clean.length < 4) return setJoinMsg("Please enter a valid session code first.");
    if (joining) return;
    setJoining(true);
    setJoinMsg("");
    try {
      await api.post("/sessions/validate-code", { code: clean });
      navigate(`/play?code=${encodeURIComponent(clean)}&entry=guest`);
    } catch (err) {
      setJoinMsg(err?.response?.data?.message || "Invalid code / session not active");
    } finally {
      setJoining(false);
    }
  }

  if (loading) {
    return <div className="tw-guest-tab-page"><div className="rounded-[18px] p-[18px]" style={shellCard(c)}><TwLogoLoader minHeight="60vh" /></div></div>;
  }

  return (
    <div className="tw-guest-tab-page grid gap-[18px]">
      <section>
        <h2 style={{ marginBottom: 4, color: c.text }}>Home</h2>
      </section>

      <section className="rounded-[18px] p-[28px]" style={shellCard(c)}>
        <div className="font-[950] text-[22px] mb-[8px]" style={{ color: c.text }}>Join a live session</div>
        <div className="text-[14px] mb-[16px]" style={{ color: c.textMuted }}>Enter session codes to join.</div>
        <form onSubmit={continueJoin} className="tw-enter-codeform tw-guest-codeform">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Enter join code"
            aria-label="Join code"
            autoComplete="off"
            maxLength={12}
          />
          <button type="submit" className="tw-enter-role is-blue is-submit" disabled={joining || code.trim().length < 4}>{joining ? "Checking…" : "Join"}</button>
        </form>
        {joinMsg && <p role="alert" className="tw-enter-msg">{joinMsg}</p>}
      </section>

      <section className="rounded-[18px] p-[18px]" style={shellCard(c)}>
        <div className="flex items-center justify-between gap-[12px] flex-wrap mb-[12px]">
          <div className="font-[900] text-[17px]" style={{ color: c.text }}>Recent Sessions</div>
          <TeacherPressButton tone="blue" onClick={() => setActiveTab?.("history")}>Open History</TeacherPressButton>
        </div>
        {sessions.length === 0 ? (
          <EmptyState c={c} icon="history" title="No completed sessions yet" message="Sessions you host will appear here with a quick report shortcut." />
        ) : (
          <div className="grid gap-[10px]">
            {sessions.map((session) => {
              const tone = templateTone(session.template_type, c, false);
              return (
                <div
                  key={session.id}
                  className="grid gap-[10px] p-[14px] rounded-[14px] cursor-pointer"
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/guest/analytics/${session.id}`)}
                  onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); navigate(`/guest/analytics/${session.id}`); } }}
                  style={{ ...templateCardChrome(session.template_type, c, false, { borderWidth: 4, transition: "transform 220ms ease" }) }}
                >
                  <div className="flex items-center justify-between gap-[12px] flex-wrap">
                    <div>
                      <div className="font-[900]" style={{ color: c.text }}>{session.quiz_title}</div>
                      <div className="text-[12px] mt-[4px]" style={{ color: c.textMuted }}>
                        {manilaDateTime(session.ended_at || session.started_at, { dateStyle: "medium", timeStyle: "short" })}
                      </div>
                    </div>
                    <div className="flex gap-[8px] flex-wrap">
                      <span className="inline-flex items-center gap-[6px] px-[10px] py-[5px] rounded-[999px] text-[12px] font-[800]" style={pill(c, { borderColor: tone.border, background: tone.softBg, color: tone.accent })}>{templateLabel(session.template_type)}</span>
                      <span className="inline-flex items-center gap-[6px] px-[10px] py-[5px] rounded-[999px] text-[12px] font-[800]" style={pill(c)}>
                        <TwIcon name="student" size={13} /> {session.participant_count || 0} participants
                      </span>
                      <span className="inline-flex items-center gap-[6px] px-[10px] py-[5px] rounded-[999px] text-[12px] font-[800]" style={pill(c)}>
                        <TwIcon name="chart" size={13} /> {session.question_count || 0} questions
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
