/* FILE GUIDE:
 * client/src/pages/student/StudentAsyncPlay.jsx
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { getToken } from "../../lib/auth";
import { useTheme } from "../../context/ThemeContext";
import ThemeIconButton from "../../components/ThemeIconButton";
import { TwIcon, LoadingDots, gameSurfaceColors } from "../../components/TwUI";
import { GameMcq } from "../../components/game/GameMcq";
import { GameTrueFalse } from "../../components/game/GameTrueFalse";
import { GameTypeAnswer } from "../../components/game/GameTypeAnswer";
import { GameGuessWord } from "../../components/game/GameGuessWord";
import { GameMatching } from "../../components/game/GameMatching";
import { GameCrossword } from "../../components/game/GameCrossword";
import { getSessionBackground } from "../../lib/sessionBackgrounds";
import { makeSocket } from "../../lib/socket";
import { QuestionAudioButton } from "../../components/AudioControls";
import thinkBotLogo from "../../assets/thinkbot-logo.png";
import { templateAccent } from "../../lib/templatePalette";
import { normalizeTemplateType, TEMPLATE_TYPES } from "../../lib/templateTypes";

import soundManager from "../../utils/soundmanager";
import "./StudentPlay.css";

// Assignment progress is persisted to localStorage so that if a student
// closes/loses the tab mid-assignment and comes back later via "Answer Now",
// they resume exactly where they left off instead of restarting from
// question 1. The timer resumes from a real deadline timestamp rather than a
// plain countdown, so it reflects actual elapsed time instead of resetting.
function assignmentProgressKey(quizId) { return `tw:assignment-progress:${quizId}`; }
function loadAssignmentProgress(quizId) {
  try {
    const raw = localStorage.getItem(assignmentProgressKey(quizId));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function saveAssignmentProgress(quizId, data) {
  try { localStorage.setItem(assignmentProgressKey(quizId), JSON.stringify(data)); } catch {}
}
function clearAssignmentProgress(quizId) {
  try { localStorage.removeItem(assignmentProgressKey(quizId)); } catch {}
}

// The JWT payload isn't sensitive here - just reading the already-trusted
// "sub" claim client-side to know which leaderboard row is "me", since it
// isn't otherwise available on this page.
function currentStudentUserId() {
  try {
    const token = getToken();
    const payload = token.split(".")[1];
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return json?.sub != null ? Number(json.sub) : null;
  } catch { return null; }
}

function ThemeTogglePill({ dark, onClick, style }) {
  return <ThemeIconButton dark={dark} onClick={onClick} className="sp-inline-theme-toggle" style={style} size={22}/>;
}

function SoundTogglePill({ muted, onClick, style }) {
  return <button className="sp-inline-sound-toggle" onClick={onClick} type="button" style={style} title={muted ? "Unmute sounds" : "Mute sounds"} aria-label={muted ? "Unmute sounds" : "Mute sounds"}><span key={muted?"off":"on"} className="tw-theme-icon-swap"><TwIcon name={muted?"volumeOff":"volume"} size={19}/></span></button>;
}


export default function StudentAsyncPlay() {
  const { quizId } = useParams();
  const nav = useNavigate();
  const { dark, toggleTheme } = useTheme();
  const [quiz, setQuiz] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [idx, setIdx] = useState(0);
  const [activeIdx, setActiveIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [locked, setLocked] = useState({});
  const [msg, setMsg] = useState("");
  const [result, setResult] = useState(null);
  const [leaderboardRows,setLeaderboardRows]=useState([]);
  const [newlyArrivedIds,setNewlyArrivedIds]=useState(()=>new Set());
  const knownLeaderboardIdsRef=useRef(new Set());
  const [isMuted, setIsMuted] = useState(() => soundManager.isMuted());
  const [remainingSec,setRemainingSec]=useState(null);
  const [entryStage,setEntryStage]=useState("lobby"); // "lobby" -> "beware" -> "beware-exit" -> "playing"
  const [lobbyPhase,setLobbyPhase]=useState("loading"); // "loading" -> "title" -> "ready"
  const [bgBlurred,setBgBlurred]=useState(true);
  const introOpen=entryStage!=="playing";
  const [antiCheat,setAntiCheat]=useState(null);
  const [awayBlur,setAwayBlur]=useState(false);
  const [submittingUi,setSubmittingUi]=useState(false);
  const tabCountRef=useRef(0); const awayRef=useRef(false); const submittingRef=useRef(false);
  const transientTimersRef=useRef(new Set());
  const mountedRef=useRef(true);
  const restoredRef=useRef(false);
  const deadlineRef=useRef(null);
  const responseMsRef=useRef({});
  const scheduleTransient=useCallback((callback,delayMs)=>{const timer=setTimeout(()=>{transientTimersRef.current.delete(timer);if(mountedRef.current)callback();},delayMs);transientTimersRef.current.add(timer);return timer;},[]);
  useEffect(()=>{mountedRef.current=true;return()=>{mountedRef.current=false;for(const timer of transientTimersRef.current)clearTimeout(timer);transientTimersRef.current.clear();};},[]);

  const { pageBg, cardBg, cardBor, textC, mutedC } = gameSurfaceColors(dark);
  const selectedBackground = useMemo(() => getSessionBackground(quiz?.background_key), [quiz?.background_key]);
  const assignmentBgStyle = useMemo(() => selectedBackground
    ? {
        backgroundImage: `url("${selectedBackground.src}")`,
        backgroundColor: pageBg,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "scroll",
      }
    : { background: pageBg }, [selectedBackground, pageBg]);

  useEffect(() => {
    let alive = true;
    api.get(`/student/quizzes/${quizId}`).then(({ data }) => {
      if (!alive) return;
      const fetchedQuestions = data.questions || [];
      setQuiz(data.quiz); setQuestions(fetchedQuestions);
      const saved = loadAssignmentProgress(quizId);
      if (saved && saved.questionCount === fetchedQuestions.length) {
        // Resume exactly where the student left off instead of restarting -
        // skip the intro/beware sequence since they've already started once.
        setAnswers(saved.answers || {});
        setLocked(saved.locked || {});
        const restoredActiveIdx = Math.max(0, Math.min(fetchedQuestions.length - 1, Number(saved.activeIdx || 0)));
        setActiveIdx(restoredActiveIdx);
        setIdx(Math.max(0, Math.min(fetchedQuestions.length - 1, Number(saved.idx ?? restoredActiveIdx))));
        deadlineRef.current = saved.activeDeadlineAt || null;
        restoredRef.current = true;
        setBgBlurred(false);
        setEntryStage("playing");
      } else {
        setEntryStage("lobby");
      }
    }).catch((err) => setMsg(err?.response?.data?.message || "Quiz unavailable."));
    return () => { alive = false; };
  }, [quizId]);

  // Entry sequence: ThinkBot loading logo -> quiz title -> Start button, each
  // staggered in. Clicking Start swaps to the "beware" warning card, which
  // auto-dismisses after 2s, then the blurred background smoothly clears and
  // the timer begins - matching the live-session lobby's staged reveal.
  useEffect(() => {
    if (entryStage !== "lobby") return undefined;
    setLobbyPhase("loading");
    scheduleTransient(() => setLobbyPhase("title"), 900);
    scheduleTransient(() => setLobbyPhase("ready"), 1700);
    return undefined;
  }, [entryStage, scheduleTransient]);

  function handleStartAssignment() {
    if (lobbyPhase !== "ready") return;
    setEntryStage("beware");
    scheduleTransient(() => {
      setEntryStage("beware-exit");
      scheduleTransient(() => {
        setBgBlurred(false);
        setEntryStage("playing");
        scheduleTransient(() => { setRemainingSec(null); setActiveIdx(0); setIdx(0); }, 500);
      }, 380);
    }, 2000);
  }

  useEffect(() => {
    function unlockAudio() { void soundManager.unlock().then(() => soundManager.startBGM("playing")); }
    void soundManager.startBGM("playing");
    window.addEventListener("pointerdown", unlockAudio, { passive: true }); window.addEventListener("keydown", unlockAudio);
    return () => { window.removeEventListener("pointerdown", unlockAudio); window.removeEventListener("keydown", unlockAudio); soundManager.stopBGM(); };
  }, []);
  useEffect(() => { void soundManager.startBGM("playing"); }, [isMuted]);

  const q = questions[idx];
  const activeQ = questions[activeIdx];
  const tt = normalizeTemplateType(quiz?.template_type);
  const gameplayAccent = templateAccent(tt);
  // Keep each question's answer and lock state independent, even when an older API payload omits or repeats an id.
  const currentAnswer = answers[idx] || {};
  const activeAnswer = answers[activeIdx] || {};
  const activeTimeLimit=Math.max(1,Number(activeQ?.config_json?.timeLimitSec || quiz?.time_limit_sec || 30));
  const totalAssignmentSec=useMemo(()=>questions.reduce((sum,item)=>sum+Math.max(1,Number(item?.config_json?.timeLimitSec||quiz?.time_limit_sec||30)),0),[questions,quiz?.time_limit_sec]);
  const activeIsLast = activeIdx >= questions.length - 1;
  const done = !!result;
  const currentLocked=!!locked[idx];
  const activeLocked=!!locked[activeIdx];
  const currentAnswered=hasAnswer(tt,currentAnswer,q);
  const activeAnswered=hasAnswer(tt,activeAnswer,activeQ);
  const answeredCount=Object.keys(locked).filter((key) => locked[key]).length;
  const questionProgress=questions.length ? Math.round((answeredCount/questions.length)*100) : 0;

  useEffect(()=>{
    if(!activeQ||done||introOpen)return;
    setMsg("");
    if(activeLocked){deadlineRef.current=null;setRemainingSec(0);return;}
    // On a resumed question, keep the deadline that was restored from
    // localStorage (so time elapsed while the tab was gone still counts).
    // Otherwise this is a genuinely new question - give it a fresh deadline.
    if(restoredRef.current){restoredRef.current=false;}
    else deadlineRef.current=Date.now()+activeTimeLimit*1000;
    const deadline=deadlineRef.current;
    setRemainingSec(deadline?Math.max(0,Math.round((deadline-Date.now())/1000)):activeTimeLimit);
  },[activeIdx,activeQ?.id,done,introOpen]);
  useEffect(()=>{
    if(!activeQ||done||introOpen||activeLocked||remainingSec==null||remainingSec<=0)return;
    const timer=setTimeout(()=>{
      const deadline=deadlineRef.current;
      if(deadline)setRemainingSec(Math.max(0,Math.round((deadline-Date.now())/1000)));
      else setRemainingSec((v)=>Math.max(0,Number(v||0)-1));
    },1000);
    return()=>clearTimeout(timer);
  },[activeIdx,done,introOpen,activeLocked,remainingSec,activeQ]);
  useEffect(()=>{
    if(!activeQ||done||introOpen||activeLocked||remainingSec!==0)return;
    responseMsRef.current[activeIdx]=activeTimeLimit*1000;
    setAnswers(prev=>({...prev,[activeIdx]:prev[activeIdx]&&hasAnswer(tt,prev[activeIdx],activeQ)?prev[activeIdx]:{timedOut:true}}));
    setLocked(prev=>({...prev,[activeIdx]:true}));
    setMsg("Time's up, you can no longer answer this question.");
  },[remainingSec,activeIdx,activeLocked,done,introOpen,tt,activeQ,activeTimeLimit]);

  // Persist progress after every meaningful change so a lost/closed tab can
  // resume exactly where the student left off, including the timer.
  useEffect(()=>{
    if(!quiz||introOpen||done)return;
    saveAssignmentProgress(quizId,{
      questionCount:questions.length,
      answers,locked,activeIdx,idx,
      activeDeadlineAt:deadlineRef.current,
    });
  },[quiz,introOpen,done,answers,locked,activeIdx,idx,questions.length,quizId]);
  useEffect(()=>{ if(done) clearAssignmentProgress(quizId); },[done,quizId]);

  useEffect(()=>{
    if(!activeQ||done||introOpen||!activeIsLast||!activeLocked||!answers[activeIdx]?.timedOut)return undefined;
    setMsg("Time's up. Your assignment will finish in 3 seconds.");
    const timeout=setTimeout(()=>submitAssignment({forced:true}),3000);
    return()=>clearTimeout(timeout);
  },[activeQ?.id,activeIdx,activeIsLast,activeLocked,answers,done,introOpen]);

  async function submitAssignment({forced=false,completedOverride=null}={}){
    if(submittingRef.current)return null; submittingRef.current=true;
    const completed=completedOverride ? {...completedOverride} : {...answers}; if(activeQ&&activeAnswered)completed[activeIdx]=answers[activeIdx];
    if(!forced){
      if(!activeLocked&&!activeAnswered){setMsg("Answer this question before submitting.");submittingRef.current=false;return null;}
      const allReady=questions.every((item,itemIndex)=>hasAnswer(tt,completed[itemIndex],item)||locked[itemIndex]||itemIndex===activeIdx);
      if(!allReady){setMsg("Complete every question before submitting.");submittingRef.current=false;return null;}
    }
    try{
      const payload=questions.map((item,itemIndex)=>({questionId:Number(item.id),answer:completed[itemIndex]??{timedOut:true},responseMs:responseMsRef.current[itemIndex]||0}));
      setRemainingSec(0);
      setSubmittingUi(true);
      const {data}=await api.post(`/student/quizzes/${quizId}/submit`,{answers:payload});
      await new Promise(resolve=>scheduleTransient(resolve,2000));
      if(!mountedRef.current)return data;
      const initialRows=Array.isArray(data.leaderboard)?data.leaderboard:[];
      knownLeaderboardIdsRef.current=new Set(initialRows.map(row=>row.student_user_id));
      setLeaderboardRows(initialRows);
      setResult(data);soundManager.play("correct").catch(()=>{});return data;
    }catch(err){setMsg(err?.response?.data?.message||"Submit failed.");soundManager.play("wrong").catch(()=>{});return null;}
    finally{if(mountedRef.current)setSubmittingUi(false);submittingRef.current=false;}
  }

  // Once this student's own result is in, join a lightweight realtime room so
  // that when classmates finish later, their name/rank pops onto this same
  // leaderboard screen live instead of requiring a refresh.
  useEffect(()=>{
    if(!done)return undefined;
    const socket=makeSocket();
    socket.emit("assignment:join-leaderboard",{quizId:Number(quizId)});
    socket.on("assignment:leaderboard-update",(payload)=>{
      if(Number(payload?.quizId)!==Number(quizId)||!Array.isArray(payload?.leaderboard))return;
      const incomingIds=new Set(payload.leaderboard.map(row=>row.student_user_id));
      const freshIds=[...incomingIds].filter(id=>!knownLeaderboardIdsRef.current.has(id));
      knownLeaderboardIdsRef.current=incomingIds;
      setLeaderboardRows(payload.leaderboard);
      if(freshIds.length){
        setNewlyArrivedIds(prev=>new Set([...prev,...freshIds]));
        scheduleTransient(()=>setNewlyArrivedIds(prev=>{const next=new Set(prev);for(const id of freshIds)next.delete(id);return next;}),900);
      }
    });
    return()=>{socket.emit("assignment:leave-leaderboard",{quizId:Number(quizId)});socket.disconnect();};
  },[done,quizId,scheduleTransient]);

  useEffect(()=>{
    if(!quiz||done||introOpen)return;
    function leave(){if(awayRef.current||done)return;awayRef.current=true;setAwayBlur(true);tabCountRef.current+=1;}
    async function returnToPage(){if(!awayRef.current)return;awayRef.current=false;setAwayBlur(false);const count=tabCountRef.current;if(count>=2)setAntiCheat({type:"warning",message:"We noticed that you tabbed out during the assigned session. Automatic removal is temporarily disabled for testing."});}
    const onVisibility=()=>document.hidden?leave():returnToPage();
    const onBlur=()=>{if(!document.hasFocus())leave()};
    document.addEventListener("visibilitychange",onVisibility);window.addEventListener("blur",onBlur);window.addEventListener("focus",returnToPage);window.addEventListener("pagehide",leave);
    return()=>{document.removeEventListener("visibilitychange",onVisibility);window.removeEventListener("blur",onBlur);window.removeEventListener("focus",returnToPage);window.removeEventListener("pagehide",leave)};
  },[quiz,done,introOpen,answers,locked,idx]);

  function handleToggleMute(){const next=soundManager.toggleMute();setIsMuted(next);if(!next)void soundManager.startBGM("playing");}
  function setAnswer(answer){if(!q||done||currentLocked||idx!==activeIdx)return;setMsg("");setAnswers(prev=>({...prev,[idx]:answer}));}
  async function submitCurrent(){
    if(!q||done||currentLocked||idx!==activeIdx)return;
    if(!currentAnswered){setMsg("Answer this question before submitting.");return;}
    // Assignments don't reveal per-question correctness - lock the answer in
    // immediately with no correct/incorrect/almost popup, unlike live sessions.
    const activatedAt=(deadlineRef.current||Date.now())-activeTimeLimit*1000;
    responseMsRef.current[idx]=Math.max(0,Date.now()-activatedAt);
    const completed={...answers,[idx]:currentAnswer};
    setAnswers(completed);
    setLocked(prev=>({...prev,[idx]:true}));
    setRemainingSec(0);
    setMsg("");
    if(activeIsLast){
      const allReady=questions.every((item,itemIndex)=>itemIndex===idx||hasAnswer(tt,completed[itemIndex],item)||locked[itemIndex]);
      if(!allReady){setMsg("Complete every question before submitting the assignment.");return;}
      await new Promise(resolve=>scheduleTransient(resolve,600));
      await submitAssignment({completedOverride:completed});
    }
  }
  useEffect(()=>{
    const onKeyDown=(event)=>{
      if(event.key!=="Enter"||event.repeat||event.isComposing||event.target?.tagName==="TEXTAREA")return;
      if(done||introOpen||submittingUi||currentLocked||!currentAnswered||idx!==activeIdx)return;
      event.preventDefault();
      void submitCurrent();
    };
    window.addEventListener("keydown",onKeyDown);
    return()=>window.removeEventListener("keydown",onKeyDown);
  },[done,introOpen,submittingUi,currentLocked,currentAnswered,idx,activeIdx,currentAnswer,q?.id]);
  function viewQuestion(nextIndex){setIdx(Math.max(0,Math.min(questions.length-1,nextIndex)));setMsg("");}
  function goPrevious(){
    viewQuestion(idx-1);
  }
  function goNext(){
    if(idx<activeIdx){viewQuestion(idx+1);return;}
    if(!activeLocked){setMsg("Submit this answer before moving to the next question.");return;}
    if(activeIdx<questions.length-1){const next=activeIdx+1;setActiveIdx(next);setIdx(next);setRemainingSec(null);setMsg("");}
  }
  const canGoPrevious=idx>0;
  const canGoNext=idx<questions.length-1&&(idx<activeIdx||(idx===activeIdx&&activeLocked));
  const prevHidden=idx<=0;
  const nextHidden=idx>=questions.length-1;
  const [nextJustEnabled,setNextJustEnabled]=useState(false);
  const prevCanGoNextRef=useRef(canGoNext);
  useEffect(()=>{
    if(!prevCanGoNextRef.current&&canGoNext){
      setNextJustEnabled(true);
      scheduleTransient(()=>setNextJustEnabled(false),550);
    }
    prevCanGoNextRef.current=canGoNext;
  },[canGoNext,scheduleTransient]);

  if(msg&&!quiz)return <AsyncShell dark={dark} pageBg={pageBg} backgroundStyle={assignmentBgStyle} cardBg={cardBg} cardBor={cardBor} textC={textC} mutedC={mutedC} title="ThinkWAVE Assignment" isMuted={isMuted} onMute={handleToggleMute} onTheme={toggleTheme}><div className="sp-wait-card sp-page-enter" style={{maxWidth:520,background:cardBg,borderColor:cardBor,textAlign:"center"}}><h3 className="sp-wait-title" style={{color:textC}}>Assignment unavailable</h3><p className="sp-wait-subtitle" style={{color:mutedC}}>{msg}</p><button className="submit-btn" type="button" onClick={()=>nav('/student')}>Back to Dashboard</button></div></AsyncShell>;
  if(!quiz||!q)return <AsyncShell dark={dark} pageBg={pageBg} backgroundStyle={assignmentBgStyle} cardBg={cardBg} cardBor={cardBor} textC={textC} mutedC={mutedC} title="ThinkWAVE Assignment" isMuted={isMuted} onMute={handleToggleMute} onTheme={toggleTheme}><div className="sp-wait-card sp-page-enter" style={{maxWidth:520,background:cardBg,borderColor:cardBor,textAlign:"center"}}><h3 className="sp-wait-title" style={{color:textC}}>Loading assignment<LoadingDots color={mutedC}/></h3></div></AsyncShell>;

  if(submittingUi&&!done){
    return <AsyncShell dark={dark} pageBg={pageBg} backgroundStyle={assignmentBgStyle} cardBg={cardBg} cardBor={cardBor} textC={textC} mutedC={mutedC} title="ThinkWAVE Assignment" isMuted={isMuted} onMute={handleToggleMute} onTheme={toggleTheme}>
      <div className="sp-wait-card sp-page-enter sp-submitting-card" style={{maxWidth:520,background:cardBg,borderColor:cardBor,textAlign:"center"}}>
        <div className="sp-wait-icon-wrap sp-thinkbot-loading" style={{margin:"0 auto 16px",background:dark?"rgba(8,22,50,.88)":"rgba(255,255,255,.92)",borderColor:cardBor}}>
          <span className="sp-thinkbot-loading-ring" aria-hidden="true"/>
          <img src={thinkBotLogo} alt="ThinkBot" className="sp-thinkbot-loading-logo"/>
        </div>
        <h3 className="sp-wait-title" style={{color:textC}}>Submitting answers<LoadingDots color={mutedC}/></h3>
      </div>
    </AsyncShell>;
  }

  if(done){
    const myUserId=currentStudentUserId();
    const myRow=leaderboardRows.find(row=>Number(row.student_user_id)===Number(myUserId))||null;
    const myRank=myRow?.rank||result?.rank||0;
    const myPoints=myRow?myRow.competitive_points:result?.competitivePoints||0;
    const podiumOrder=[leaderboardRows[1],leaderboardRows[0],leaderboardRows[2]].filter(Boolean);
    const leaderboardColumns=Math.max(1,Math.min(4,Math.ceil(leaderboardRows.length/10)));
    const rankGroups=[leaderboardRows.slice(3,10),leaderboardRows.slice(10,20),leaderboardRows.slice(20,30),leaderboardRows.slice(30,40)].slice(0,leaderboardColumns);
    const displayName=(row)=>`${row.first_name||""} ${row.last_name||""}`.trim()||"Student";
    const isMe=(row)=>Number(row.student_user_id)===Number(myUserId);
    return (
      <div className={`sp-final-page ${dark?"theme-dark":"theme-light"}`} style={{minHeight:"100vh",...assignmentBgStyle,"--sp-template-accent":gameplayAccent,"--host-accent":gameplayAccent,fontFamily:"'Segoe UI',system-ui,sans-serif"}}>
        <div className="sp-experience-controls"><SoundTogglePill muted={isMuted} onClick={handleToggleMute}/><ThemeTogglePill dark={dark} onClick={toggleTheme}/></div>
        <div className={`sp-final-wrap sp-page-enter columns-${leaderboardColumns}`}>
          <section className="sp-final-leaderboard-card" style={{background:cardBg,borderColor:gameplayAccent}}>
            <div className="sp-final-summary sp-final-summary-compact">
              <p style={{color:mutedC}}>You scored <b style={{color:gameplayAccent}}>{Math.round(Number(myPoints||0)).toLocaleString()} pts</b>{myRank>0&&<> · Rank #{myRank}</>}</p>
            </div>
            <h3 className="sp-final-heading" style={{color:textC}}><TwIcon name="trophy" size={21}/> Leaderboard</h3>
            <div className="tw-host-podium sp-final-host-podium">
              {podiumOrder.map((row)=>{
                const rank=row.rank;
                const arriving=newlyArrivedIds.has(row.student_user_id);
                return <div key={row.student_user_id} className={`tw-host-podium-place place-${rank}${isMe(row)?" is-me":""}${arriving?" sp-leaderboard-row-enter":""}`}>
                  <div className="tw-host-trophy"><TwIcon name="trophy" size={54} strokeWidth={2.2}/><span>{rank}</span></div>
                  <div className="tw-host-podium-platform">
                    <div className="tw-host-podium-person">
                      <div className="tw-host-podium-avatar" aria-hidden="true">{row.profile_image?<img src={row.profile_image} alt=""/>:<TwIcon name="user" size={18}/>}</div>
                      <b>{displayName(row)}</b>
                    </div>
                    <div className="tw-host-podium-points">{Math.round(Number(row.competitive_points||0)).toLocaleString()} pts</div>
                  </div>
                </div>;
              })}
            </div>
            <div className="sp-final-rank-grid" style={{gridTemplateColumns:`repeat(${leaderboardColumns}, minmax(0, 1fr))`}}>
              {rankGroups.map((rows,columnIndex)=><div className="sp-final-rank-column" key={columnIndex}>{rows.map((row)=>{
                const arriving=newlyArrivedIds.has(row.student_user_id);
                return <div key={row.student_user_id} className={`tw-student-leader-row${isMe(row)?" is-me":""}${arriving?" sp-leaderboard-row-enter":""}`}>
                  <span className="tw-student-leader-rank">#{row.rank}</span>
                  <span className="tw-student-leader-name" style={{color:textC}}>{displayName(row)}</span>
                  <span className="tw-student-leader-points">{Math.round(Number(row.competitive_points||0)).toLocaleString()} pts</span>
                </div>;
              })}</div>)}
            </div>
            {leaderboardColumns<=2&&<div className="sp-final-dashboard-row"><button className="tw-admin-press tw-admin-press-blue tw-teacher-press tw-student-final-nav" onClick={()=>nav('/student')}><span>Dashboard</span></button></div>}
          </section>
          {leaderboardColumns>=3&&<div className="sp-final-dashboard-top-wrap"><button className="tw-admin-press tw-admin-press-blue tw-teacher-press tw-student-final-nav sp-final-dashboard-top" onClick={()=>nav('/student')}><span>Dashboard</span></button></div>}
        </div>
      </div>
    );
  }

  return <div className={awayBlur?"sp-assignment-away":""} style={{minHeight:"100vh",...assignmentBgStyle,color:textC,fontFamily:"'Segoe UI', system-ui, sans-serif"}}>
    <div className="sp-experience-controls"><SoundTogglePill muted={isMuted} onClick={handleToggleMute}/><ThemeTogglePill dark={dark} onClick={toggleTheme}/></div>
    {entryStage==="lobby"&&<div className="sp-anticheat-backdrop">
      <div className="sp-wait-card sp-page-enter sp-assignment-lobby-card" style={{background:cardBg,borderColor:cardBor,textAlign:"center"}}>
        <div className="sp-wait-icon-wrap sp-thinkbot-loading" style={{margin:"0 auto 16px",background:dark?"rgba(8,22,50,.88)":"rgba(255,255,255,.92)",borderColor:cardBor}}>
          <span className="sp-thinkbot-loading-ring" aria-hidden="true"/>
          <img src={thinkBotLogo} alt="ThinkBot" className="sp-thinkbot-loading-logo"/>
        </div>
        {lobbyPhase==="loading"
          ? <h3 className="sp-wait-title" style={{color:textC}}>Please wait<LoadingDots color={mutedC}/></h3>
          : <h1 className="sp-assignment-lobby-title tw-tutorial-fade-line" style={{color:textC}}>{quiz.title||"Assignment"}</h1>}
        {lobbyPhase==="ready"&&<button type="button" className="tw-student-dashboard-press sp-assignment-start tw-tutorial-fade-line" onClick={handleStartAssignment}><span>Start</span></button>}
      </div>
    </div>}
    {(entryStage==="beware"||entryStage==="beware-exit")&&<div className="sp-anticheat-backdrop">
      <div className={`sp-assignment-intro sp-page-enter${entryStage==="beware-exit"?" is-leaving":""}`} style={{background:cardBg,borderColor:cardBor,color:textC}}>
        <div className="sp-anticheat-icon sp-assignment-intro-icon"><TwIcon name="calendar" size={42}/></div>
        <p style={{color:mutedC}}>You have a total of <b style={{color:textC}}>{formatDuration(totalAssignmentSec)}</b> to answer.</p>
        <div className="sp-assignment-warning">BEWARE: CHEATING IS NOT PROHIBITED</div>
      </div>
    </div>}
    {antiCheat&&<div className="sp-anticheat-backdrop"><div className="sp-anticheat-card"><div className={`sp-anticheat-icon ${antiCheat.type==="ended"?"danger":"warning"}`}><TwIcon name={antiCheat.type==="ended"?"logout":"warning"} size={38}/></div><h3>{antiCheat.type==="ended"?"Assignment ended":"Activity warning"}</h3><p>{antiCheat.message}</p><button type="button" className="tw-dialog-press is-blue" onClick={()=>{if(antiCheat.type==="ended")nav('/student');else setAntiCheat(null)}}><span>{antiCheat.type==="ended"?"Back to Dashboard":"Confirm"}</span></button></div></div>}
    <div className={`quiz-shell-new sp-assigned-shell ${dark?"theme-dark":"theme-light"} ${selectedBackground ? "has-session-background" : ""}`} style={{width:"100%",minHeight:"100vh",margin:0,display:"flex",flexDirection:"column","--sp-template-accent":gameplayAccent,filter:bgBlurred?"blur(22px)":awayBlur?"blur(12px)":"none",transition:"filter .6s ease",pointerEvents:entryStage==="playing"&&!awayBlur?"auto":"none",userSelect:awayBlur?"none":undefined}}>
      <div className="qn-header"><div className="qn-title-cluster"><div className="qn-brand"><img src={thinkBotLogo} alt="ThinkBot" className="qn-brand-bot"/><span>Think</span><span>WAVE</span></div><div className="qn-subject">{quiz.title||"Assignment"}</div></div><div className="qn-meta"><div className="qn-qcount">{tt === "MATCHING" ? `Batch ${idx+1}/${questions.length}` : `${idx+1}/${questions.length}`}</div><div className={`qn-timer qn-pixel-timer ${quiz.category==="K12"?"is-k12":""}${(remainingSec ?? activeTimeLimit) <= 3 ? " is-danger" : (remainingSec ?? activeTimeLimit) <= 4 ? " is-warning" : ""}`}><TwIcon name="clock" size={20}/> {fmtTime(remainingSec??activeTimeLimit)}</div></div></div>
      <div className="qn-question-progress" aria-label={`${answeredCount} of ${questions.length} questions answered`}><div className="qn-question-progress-bar" style={{width:`${questionProgress}%`}}/></div>
      <div className={`qn-progress qn-timer-progress${!activeLocked && (remainingSec ?? activeTimeLimit) <= 3 ? " is-danger" : !activeLocked && (remainingSec ?? activeTimeLimit) <= 4 ? " is-warning" : ""}`}><div className="qn-progress-bar" style={{width:`${Math.round(activeLocked?0:((remainingSec??activeTimeLimit)/activeTimeLimit)*100)}%`}}/></div>
      <div className="qn-body" style={{flex:1}}>
        <div className="qn-prompt-box">{q?.config_json?.showPromptImage!==false&&q?.config_json?.promptImage?<img src={q.config_json.promptImage} alt="" className="qn-prompt-img"/>:null}<span className="qn-prompt-text">{q.prompt}</span><QuestionAudioButton config={q?.config_json} prompt={q.prompt} templateType={tt}/></div>
        <TemplateBody templateType={tt} q={q} value={currentAnswer} onChange={setAnswer} disabled={done||currentLocked||idx!==activeIdx} timeUp={tt === TEMPLATE_TYPES.THINK_SPELL && idx === activeIdx && remainingSec === 0}/>
        {msg&&<div style={{textAlign:"center",color:"#ef4444",fontWeight:700,marginTop:12}}>{msg}</div>}
        <div className="sp-assigned-navigation">
          <button type="button" className={`sp-assigned-nav-btn is-prev${prevHidden?" is-hidden":""}`} aria-label="Previous question" aria-hidden={prevHidden} onClick={goPrevious} disabled={!canGoPrevious||prevHidden} tabIndex={prevHidden?-1:0}><TwIcon name="arrow" size={16}/><span>Previous</span></button>
          <button type="button" className="submit-btn" style={{"--sp-submit-accent":gameplayAccent,opacity:(currentLocked||!currentAnswered||idx!==activeIdx)?0.72:1,cursor:(currentLocked||!currentAnswered||idx!==activeIdx)?"not-allowed":"pointer",background:currentLocked?(dark?"linear-gradient(180deg, #27457c 0%, #1b3260 100%)":"linear-gradient(180deg, #8ec9ff 0%, #73b3f4 100%)"):undefined,boxShadow:currentLocked?"none":undefined}} onClick={submitCurrent} disabled={currentLocked||!currentAnswered||idx!==activeIdx}>{currentLocked?"Submitted":"Submit"}</button>
          <button type="button" className={`sp-assigned-nav-btn is-next${nextHidden?" is-hidden":""}${nextJustEnabled?" is-just-enabled":""}`} style={{"--sp-submit-accent":gameplayAccent}} aria-label="Next question" aria-hidden={nextHidden} onClick={goNext} disabled={!canGoNext||nextHidden} tabIndex={nextHidden?-1:0}><span>Next</span><TwIcon name="arrow" size={16}/></button>
        </div>
      </div>
    </div>
  </div>;
}
function formatDuration(seconds){const total=Math.max(0,Number(seconds||0));const mins=Math.floor(total/60);const secs=total%60;if(mins&&secs)return `${mins} minute${mins===1?"":"s"} and ${secs} second${secs===1?"":"s"}`;if(mins)return `${mins} minute${mins===1?"":"s"}`;return `${secs} second${secs===1?"":"s"}`;}

function hasAnswer(templateType,answer,q){
  if(!answer||answer.timedOut) return !!answer?.timedOut;
  const tt=normalizeTemplateType(templateType);
  if(tt==="MCQ") return !!answer.choice || (Array.isArray(answer.choices)&&answer.choices.length>0);
  if(tt==="TRUE_FALSE") return answer.choice!==undefined&&answer.choice!==null&&answer.choice!=="";
  if(tt==="MATCHING") return Array.isArray(answer.pairs)&&answer.pairs.length>=Number(q?.config_json?.colA?.length||1);
  if(tt==="THINK_SPELL") return Array.isArray(answer.words||answer.foundEntries)&&(answer.words||answer.foundEntries).length>0;
  return String(answer.text||"").trim().length>0;
}
function fmtTime(sec){const s=Math.max(0,Number(sec||0));return `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;}

function AsyncShell({ dark, pageBg, backgroundStyle, textC, title, isMuted, onMute, onTheme, children }) {
  const hasBackground = Boolean(backgroundStyle?.backgroundImage);
  return (
    <div style={{ minHeight: "100vh", ...(backgroundStyle || { background: pageBg }), color: textC, fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <div className="sp-experience-controls"><SoundTogglePill muted={isMuted} onClick={onMute}/><ThemeTogglePill dark={dark} onClick={onTheme}/></div>
      <div className={`quiz-shell-new sp-assigned-shell ${dark ? "theme-dark" : "theme-light"} ${hasBackground ? "has-session-background" : ""}`} style={{ width: "100%", minHeight: "100vh", margin: 0, display: "flex", flexDirection: "column" }}>
        <div className="qn-header"><div style={{display:"flex",alignItems:"center",gap:10}}><div className="qn-brand"><img src={thinkBotLogo} alt="ThinkBot" className="qn-brand-bot"/><span>Think</span><span>WAVE</span></div><div className="qn-subject">{title}</div></div><div className="qn-meta"><div className="qn-timer"><TwIcon name="clock" size={17}/> Assignment</div></div></div>
        <div className="qn-body" style={{ flex: 1, display: "grid", placeItems: "center" }}>{children}</div>
      </div>
    </div>
  );
}

function TemplateBody({ templateType, q, value, onChange, disabled, timeUp = false }) {
  const cfg = q?.config_json || {};
  if (templateType === TEMPLATE_TYPES.MCQ) return <McqTemplate cfg={cfg} value={value} onChange={onChange} disabled={disabled} />;
  if (templateType === TEMPLATE_TYPES.TRUE_FALSE) return <TrueFalseTemplate cfg={cfg} value={value} onChange={onChange} disabled={disabled} />;
  if (templateType === TEMPLATE_TYPES.MATCHING) return <MatchingTemplate q={q} cfg={cfg} value={value} onChange={onChange} disabled={disabled} />;
  if (templateType === TEMPLATE_TYPES.GUESS_WORD_4PICS) return <GuessWord4PicsTemplate cfg={cfg} value={value} onChange={onChange} disabled={disabled} />;
  if (templateType === TEMPLATE_TYPES.THINK_SPELL) return <GameCrossword config={cfg} correct={{}} store={value} onStore={onChange} disabled={disabled} questionId={q?.id} timeUp={timeUp} initExtra={{ words: [] }} summaryHint="Continue when the next question unlocks." totalPoints={null} />;
  return <TypeAnswerTemplate value={value} onChange={onChange} disabled={disabled} />;
}

function McqTemplate({ cfg, value, onChange, disabled }) {
  return (
    <GameMcq
      options={cfg.options}
      mcqMode={cfg.mcqMode}
      answerMode={cfg.answerMode}
      value={value}
      onChange={onChange}
      disabled={disabled}
      lock="lock-all"
      shuffleSeed={null}
    />
  );
}

function TrueFalseTemplate({ cfg, value, onChange, disabled }) {
  return <GameTrueFalse options={cfg.options} value={value} onChange={onChange} disabled={disabled} lock="lock-all" />;
}

function TypeAnswerTemplate({ value, onChange, disabled }) {
  return <GameTypeAnswer value={value.text} onChange={(text) => onChange({ text })} disabled={disabled} />;
}

function MatchingTemplate({ q, cfg, value, onChange, disabled }) {
  return (
    <GameMatching
      config={cfg}
      pairs={value?.pairs}
      onPairs={(pairs) => onChange({ ...(value || {}), pairs })}
      disabled={disabled}
      shuffleKey={`${q?.id || q?.prompt || "assigned-matching"}:${cfg?.shuffleSeed || "assigned"}`}
    />
  );
}
function GuessWord4PicsTemplate({ cfg, value, onChange, disabled }) {
  return (
    <GameGuessWord
      images={cfg.images}
      target={String(cfg.target ?? "")}
      dummyLetters={cfg.dummyLetters}
      value={value}
      onChange={onChange}
      disabled={disabled}
    />
  );
}

