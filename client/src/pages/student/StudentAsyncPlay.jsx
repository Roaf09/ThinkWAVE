/* FILE GUIDE:
 * client/src/pages/student/StudentAsyncPlay.jsx
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { useTheme } from "../../context/ThemeContext";
import ThemeIconButton from "../../components/ThemeIconButton";
import { TwIcon } from "../../components/TwUI";
import { getSessionBackground } from "../../lib/sessionBackgrounds";
import { QuestionAudioButton } from "../../components/AudioControls";
import MatchingConnectorGame from "../../components/MatchingConnectorGame";
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
} from "../../templates/thinkspell/thinkSpell";
import soundManager from "../../utils/soundmanager";
import "./StudentPlay.css";

function LoadingDots({ color = "currentColor" }) {
  return <span className="tw-loading-dots" aria-hidden="true" style={{ color }}><span>.</span><span>.</span><span>.</span></span>;
}

function asyncFeedbackCopy(payload) {
  const status = payload?.feedbackType === "almost" || (!payload?.isCorrect && Number(payload?.points || 0) > 0)
    ? "almost"
    : payload?.isCorrect ? "correct" : "wrong";
  if (status === "correct") return { status, title: `Correct! +${payload.points || 0} pts`, subtitle: "Nice one — keep going!", icon: "check" };
  if (status === "almost") return { status, title: `Almost! +${payload.points || 0} pts`, subtitle: Number(payload?.totalCorrect || 0) > 0 ? `${Number(payload.correctCount || 0)} of ${Number(payload.totalCorrect)} correct` : "Some of your answers were correct.", icon: "warning" };
  return { status, title: "Incorrect", subtitle: "Keep going — you can still finish strong.", icon: "close" };
}

function ThemeTogglePill({ dark, onClick, style }) {
  return <ThemeIconButton dark={dark} onClick={onClick} className="sp-inline-theme-toggle" style={style} size={18}/>;
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
  const [isMuted, setIsMuted] = useState(() => soundManager.isMuted());
  const [remainingSec,setRemainingSec]=useState(null);
  const [introOpen,setIntroOpen]=useState(true);
  const [antiCheat,setAntiCheat]=useState(null);
  const [awayBlur,setAwayBlur]=useState(false);
  const [submittingUi,setSubmittingUi]=useState(false);
  const [feedback,setFeedback]=useState(null);
  const tabCountRef=useRef(0); const awayRef=useRef(false); const submittingRef=useRef(false);

  const pageBg = dark ? "#0a4eb4" : "#6db9f1";
  const cardBg = dark ? "#0e1733" : "#ffffff";
  const cardBor = dark ? "#1e2d55" : "#c7d2fe";
  const textC = dark ? "#e7e9ee" : "#0f172a";
  const mutedC = dark ? "#8a9bc4" : "#5a6a9a";
  const selectedBackground = getSessionBackground(quiz?.background_key);
  const assignmentBgStyle = selectedBackground
    ? {
        backgroundImage: `url("${selectedBackground.src}")`,
        backgroundColor: pageBg,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
      }
    : { background: pageBg };

  useEffect(() => {
    let alive = true;
    api.get(`/student/quizzes/${quizId}`).then(({ data }) => {
      if (!alive) return;
      setQuiz(data.quiz); setQuestions(data.questions || []); setIntroOpen(true);
    }).catch((err) => setMsg(err?.response?.data?.message || "Quiz unavailable."));
    return () => { alive = false; };
  }, [quizId]);

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
    setRemainingSec(activeLocked?0:activeTimeLimit);
  },[activeIdx,activeQ?.id,done,introOpen]);
  useEffect(()=>{
    if(!activeQ||done||introOpen||activeLocked||remainingSec==null||remainingSec<=0)return;
    const timer=setTimeout(()=>setRemainingSec(v=>Math.max(0,Number(v||0)-1)),1000);
    return()=>clearTimeout(timer);
  },[activeIdx,done,introOpen,activeLocked,remainingSec,activeQ]);
  useEffect(()=>{
    if(!activeQ||done||introOpen||activeLocked||remainingSec!==0)return;
    setAnswers(prev=>({...prev,[activeIdx]:prev[activeIdx]&&hasAnswer(tt,prev[activeIdx],activeQ)?prev[activeIdx]:{timedOut:true}}));
    setLocked(prev=>({...prev,[activeIdx]:true}));
    setMsg("Time's up, you can no longer answer this question.");
  },[remainingSec,activeIdx,activeLocked,done,introOpen,tt,activeQ]);

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
      const payload=questions.map((item,itemIndex)=>({questionId:Number(item.id),answer:completed[itemIndex]??{timedOut:true}}));
      setRemainingSec(0);
      setSubmittingUi(true);
      const {data}=await api.post(`/student/quizzes/${quizId}/submit`,{answers:payload});
      await new Promise(resolve=>setTimeout(resolve,2000));
      setResult(data);soundManager.play("correct").catch(()=>{});return data;
    }catch(err){setMsg(err?.response?.data?.message||"Submit failed.");soundManager.play("wrong").catch(()=>{});return null;}
    finally{setSubmittingUi(false);submittingRef.current=false;}
  }

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
    let feedbackData=null;
    try{
      const response=await api.post(`/student/quizzes/${quizId}/check-answer`,{questionId:Number(q.id),answer:currentAnswer});
      feedbackData=response.data;
      setFeedback(asyncFeedbackCopy(feedbackData));
      void soundManager.play(feedbackData?.isCorrect?"correct":"wrong");
      setTimeout(()=>setFeedback(null),1500);
    }catch(err){
      setMsg(err?.response?.data?.message||"Could not check this answer.");
      return;
    }
    const completed={...answers,[idx]:currentAnswer};
    setAnswers(completed);
    setLocked(prev=>({...prev,[idx]:true}));
    setRemainingSec(0);
    setMsg("");
    if(activeIsLast){
      const allReady=questions.every((item,itemIndex)=>itemIndex===idx||hasAnswer(tt,completed[itemIndex],item)||locked[itemIndex]);
      if(!allReady){setMsg("Complete every question before submitting the assignment.");return;}
      await new Promise(resolve=>setTimeout(resolve,1500));
      await submitAssignment({completedOverride:completed});
    }
  }
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

  if(msg&&!quiz)return <AsyncShell dark={dark} pageBg={pageBg} backgroundStyle={assignmentBgStyle} cardBg={cardBg} cardBor={cardBor} textC={textC} mutedC={mutedC} title="ThinkWAVE Assignment" isMuted={isMuted} onMute={handleToggleMute} onTheme={toggleTheme}><div className="sp-wait-card sp-page-enter" style={{maxWidth:520,background:cardBg,borderColor:cardBor,textAlign:"center"}}><h3 className="sp-wait-title" style={{color:textC}}>Assignment unavailable</h3><p className="sp-wait-subtitle" style={{color:mutedC}}>{msg}</p><button className="submit-btn" type="button" onClick={()=>nav('/student')}>Back to Dashboard</button></div></AsyncShell>;
  if(!quiz||!q)return <AsyncShell dark={dark} pageBg={pageBg} backgroundStyle={assignmentBgStyle} cardBg={cardBg} cardBor={cardBor} textC={textC} mutedC={mutedC} title="ThinkWAVE Assignment" isMuted={isMuted} onMute={handleToggleMute} onTheme={toggleTheme}><div className="sp-wait-card sp-page-enter" style={{maxWidth:520,background:cardBg,borderColor:cardBor,textAlign:"center"}}><h3 className="sp-wait-title" style={{color:textC}}>Loading assignment<LoadingDots color={mutedC}/></h3></div></AsyncShell>;

  return <div className={awayBlur?"sp-assignment-away":""} style={{minHeight:"100vh",...assignmentBgStyle,color:textC,fontFamily:"'Segoe UI', system-ui, sans-serif"}}>
    <div className="sp-experience-controls"><SoundTogglePill muted={isMuted} onClick={handleToggleMute}/><ThemeTogglePill dark={dark} onClick={toggleTheme}/></div>
    {feedback&&<div className={`sp-feedback-overlay is-${feedback.status}`}><div className={`sp-feedback-card is-${feedback.status}`}><div className="sp-feedback-icon"><TwIcon name={feedback.icon} size={44}/></div><div className="sp-feedback-title">{feedback.title}</div><div className="sp-feedback-subtitle">{feedback.subtitle}</div></div></div>}
    {introOpen&&<div className="sp-anticheat-backdrop"><div className="sp-assignment-intro" style={{background:cardBg,borderColor:cardBor,color:textC}}><div className="sp-anticheat-icon sp-assignment-intro-icon"><TwIcon name="calendar" size={42}/></div><h1>{quiz.title||"Assignment"}</h1><p style={{color:mutedC}}>You have a total of <b style={{color:textC}}>{formatDuration(totalAssignmentSec)}</b> to answer.</p><button type="button" className="tw-student-dashboard-press sp-assignment-start" onClick={()=>{setRemainingSec(null);setActiveIdx(0);setIdx(0);setIntroOpen(false)}}><span>Start</span></button><div className="sp-assignment-warning">BEWARE: CHEATING IS NOT PROHIBITED</div></div></div>}
    {antiCheat&&<div className="sp-anticheat-backdrop"><div className="sp-anticheat-card"><div className={`sp-anticheat-icon ${antiCheat.type==="ended"?"danger":"warning"}`}><TwIcon name={antiCheat.type==="ended"?"logout":"warning"} size={38}/></div><h3>{antiCheat.type==="ended"?"Assignment ended":"Activity warning"}</h3><p>{antiCheat.message}</p><button type="button" className="tw-dialog-press is-blue" onClick={()=>{if(antiCheat.type==="ended")nav('/student');else setAntiCheat(null)}}><span>{antiCheat.type==="ended"?"Back to Dashboard":"Confirm"}</span></button></div></div>}
    <div className={`quiz-shell-new sp-assigned-shell ${dark?"theme-dark":"theme-light"} ${selectedBackground ? "has-session-background" : ""}`} style={{width:"100%",minHeight:"100vh",margin:0,display:"flex",flexDirection:"column"}}>
      <div className="qn-header"><div className="qn-title-cluster"><div className="qn-brand"><span>Think</span><span>WAVE</span></div><div className="qn-subject">{quiz.title||"Assignment"}</div></div><div className="qn-meta"><div className="qn-qcount">Q {idx+1}/{questions.length}</div><div className={`qn-timer qn-pixel-timer ${quiz.category==="K12"?"is-k12":""}`}><TwIcon name="clock" size={17}/> {fmtTime(done||submittingUi?0:(remainingSec??activeTimeLimit))}</div></div></div>
      <div className="qn-question-progress" aria-label={`${answeredCount} of ${questions.length} questions answered`}><div className="qn-question-progress-bar" style={{width:`${questionProgress}%`}}/></div>
      <div className="qn-progress qn-timer-progress"><div className="qn-progress-bar" style={{width:`${Math.round(activeLocked?0:((remainingSec??activeTimeLimit)/activeTimeLimit)*100)}%`}}/></div>
      <div className="qn-body" style={{flex:1}}>{submittingUi?<div className="sp-wait-card sp-page-enter sp-submitting-card" style={{background:cardBg,borderColor:cardBor,textAlign:"center"}}><h2 className="sp-wait-title" style={{color:textC}}>Submitting answers<LoadingDots color={cAccent(dark)}/></h2></div>:done?<div className="sp-wait-card sp-page-enter sp-submitted-card" style={{background:cardBg,borderColor:cardBor,textAlign:"center"}}><div style={{color:"#16a34a",marginBottom:12}}><TwIcon name="check" size={70}/></div><h2 className="sp-wait-title" style={{color:textC,marginBottom:8}}>Submitted!</h2><p className="sp-wait-subtitle sp-final-score" style={{color:mutedC}}>You scored: <b style={{color:"#2b6cff"}}>{result.score}/{result.maxScore}</b></p><button className="tw-student-dashboard-press sp-dashboard-return" type="button" onClick={()=>nav('/student')}><span><TwIcon name="home" size={18}/> Dashboard</span></button></div>:<>
        <div className="qn-prompt-box">{q?.config_json?.showPromptImage!==false&&q?.config_json?.promptImage?<img src={q.config_json.promptImage} alt="" className="qn-prompt-img"/>:null}<span className="qn-prompt-text">{q.prompt}</span><QuestionAudioButton config={q?.config_json} prompt={q.prompt} templateType={tt}/></div>
        <TemplateBody templateType={tt} q={q} value={currentAnswer} onChange={setAnswer} disabled={done||currentLocked||idx!==activeIdx}/>
        {msg&&<div style={{textAlign:"center",color:"#ef4444",fontWeight:700,marginTop:12}}>{msg}</div>}
        <div className="sp-assigned-navigation">
          <button type="button" className="sp-assigned-arrow is-left" aria-label="Previous question" onClick={goPrevious} disabled={!canGoPrevious}><TwIcon name="arrow" size={24}/></button>
          <button type="button" className="tw-assignment-submit-press" onClick={submitCurrent} disabled={currentLocked||!currentAnswered||idx!==activeIdx}><span>{currentLocked?"Submitted":"Submit"}</span></button>
          <button type="button" className="sp-assigned-arrow" aria-label="Next question" onClick={goNext} disabled={!canGoNext}><TwIcon name="arrow" size={24}/></button>
        </div>
      </>}</div>
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
function cAccent(dark){return dark?"#6ea0ff":"#2b6cff";}
function fmtTime(sec){const s=Math.max(0,Number(sec||0));return `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;}

function AsyncShell({ dark, pageBg, backgroundStyle, cardBg, cardBor, textC, mutedC, title, isMuted, onMute, onTheme, children }) {
  const hasBackground = Boolean(backgroundStyle?.backgroundImage);
  return (
    <div style={{ minHeight: "100vh", ...(backgroundStyle || { background: pageBg }), color: textC, fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <div className="sp-experience-controls"><SoundTogglePill muted={isMuted} onClick={onMute}/><ThemeTogglePill dark={dark} onClick={onTheme}/></div>
      <div className={`quiz-shell-new sp-assigned-shell ${dark ? "theme-dark" : "theme-light"} ${hasBackground ? "has-session-background" : ""}`} style={{ width: "100%", minHeight: "100vh", margin: 0, display: "flex", flexDirection: "column" }}>
        <div className="qn-header"><div style={{display:"flex",alignItems:"center",gap:10}}><div className="qn-brand"><span>Think</span><span>WAVE</span></div><div className="qn-subject">{title}</div></div><div className="qn-meta"><div className="qn-timer"><TwIcon name="clock" size={17}/> Assignment</div></div></div>
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
  if (templateType === TEMPLATE_TYPES.MATCHING) return <MatchingTemplate q={q} cfg={cfg} value={value} onChange={onChange} disabled={disabled} />;
  if (templateType === TEMPLATE_TYPES.GUESS_WORD_4PICS) return <GuessWord4PicsTemplate cfg={cfg} value={value} onChange={onChange} disabled={disabled} />;
  if (templateType === TEMPLATE_TYPES.THINK_SPELL) return <BookwormThinkSpellTemplate cfg={cfg} value={value} onChange={onChange} disabled={disabled} questionId={q?.id} />;
  return <TypeAnswerTemplate value={value} onChange={onChange} disabled={disabled} />;
}

function McqTemplate({ cfg, value, onChange, disabled }) {
  const opts = Array.isArray(cfg.options) ? cfg.options.map(normalizeChoiceOption) : [];
  const labels = "ABCDEFGHIJ".split("");
  const isModifiedMcq = cfg.mcqMode === "MODIFIED";
  const twoMode = cfg.answerMode === "TWO";
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

function matchingOrder(length, shouldShuffle, seedText) {
  const order = Array.from({ length }, (_, index) => index);
  if (!shouldShuffle || length < 2) return order;
  let seed = 2166136261;
  for (const ch of String(seedText || "matching")) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619) >>> 0;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  if (order.every((value, index) => value === index)) order.push(order.shift());
  return order;
}

function MatchingTemplate({ q, cfg, value, onChange, disabled }) {
  const map = Object.fromEntries((Array.isArray(value?.pairs) ? value.pairs : []).map((pair) => [Number(pair.aIndex), Number(pair.bIndex)]));
  function updateMap(nextMap) {
    const pairs = Object.entries(nextMap).map(([aIndex, bIndex]) => ({ aIndex: Number(aIndex), bIndex: Number(bIndex) })).sort((a, b) => a.aIndex - b.aIndex);
    onChange({ ...(value || {}), pairs });
  }
  return <MatchingConnectorGame config={cfg} valueMap={map} onChange={updateMap} disabled={disabled} questionKey={q?.id || q?.prompt || "assigned-matching"} />;
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
  const foundLines = foundEntries
    .map((entry) => Array.isArray(entry?.path) && entry.path.length > 1 ? getPathLinePoints(entry.path.map(Number), activeGridSize, 48, cellGap) : [])
    .filter((points) => points.length > 1);
  const previewStatus = !built ? "" : built.length < minWordLength ? `Need at least ${minWordLength} letters` : foundSet.has(matchThinkSpellWord(built, wordBank)) ? "Already found" : matchThinkSpellWord(built, wordBank) ? "Release to add this word" : "Not on the word list";
  return <div className="bword-wrap"><div className="bword-hud"><div className="bword-hud-stat"><span className="bword-hud-label">Found</span><span className="bword-hud-value">{foundEntries.length}/{wordBank.length}</span></div></div>{cfg.showWordList !== false && wordBank.length > 0 && <div className="bword-quest-panel"><div className="bword-quest-title">Word goals</div><div className="bword-quest-list">{wordBank.map((word) => { const key = normalizeThinkWordKey(word); const done = foundSet.has(key); return <span key={key} className={`bword-quest-chip${done ? " done" : ""}`}>{done ? "✓ " : ""}{word.toUpperCase()}</span>; })}</div></div>}<div className="bword-grid-shell" onPointerMove={handleGridPointerMove} onPointerLeave={() => draggingRef.current && finishSelection()}><div className="bword-grid" style={{ gridTemplateColumns: `repeat(${activeGridSize}, minmax(0, 1fr))`, gap: cellGap }}>{grid.map((ch, cell) => <button key={`${sig}-${cell}`} type="button" className={`bword-cell${selectedSet.has(cell) ? " selected" : ""}${foundPathSet.has(cell) ? " found" : ""}`} onPointerDown={(e) => { if (disabled) return; e.preventDefault(); draggingRef.current = true; patch({ selected: [cell], built: String(grid[cell] || "") }); }} onPointerEnter={() => draggingRef.current && addIndex(cell)} onPointerUp={finishSelection} disabled={disabled} data-bword-index={cell}>{ch}</button>)}</div>{(foundLines.length > 0 || linePoints.length > 1) && <svg className="bword-path-line" viewBox={`0 0 ${activeGridSize * 56} ${activeGridSize * 56}`} preserveAspectRatio="none">{foundLines.map((points, index) => <polyline key={`found-line-${index}`} className="is-found" points={points.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="rgba(34,197,94,.98)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />)}{linePoints.length > 1 && <polyline points={linePoints.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="rgba(134, 239, 172, 0.95)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />}</svg>}</div><div className="bword-built-row"><div className="spell-display bword-current-word">{(built || "•").split("").map((letter, i) => <div key={i} className="spell-char" style={{ width: 32, height: 34, background: letter === "•" ? "rgba(255,255,255,0.08)" : "var(--sp-spell-char-bg)" }}>{letter}</div>)}</div><div className={`bword-preview-status${previewStatus.includes("Release") ? " ok" : ""}`}>{previewStatus}</div></div>{foundEntries.length > 0 && <div className="bword-found-panel"><div className="bword-found-title">Words found:</div><div className="bword-found-list">{foundEntries.map((entry, index) => <span key={`${entry.text}-${index}`} className="bword-found-chip">{(entry.text || "").toUpperCase()}{!disabled && <button type="button" onClick={() => { const nextFound = foundEntries.filter((_, i) => i !== index); patch({ foundEntries: nextFound, words: nextFound }); }} style={{ marginLeft: 6, border: 0, background: "transparent", color: "inherit", cursor: "pointer", fontWeight: 900 }}>×</button>}</span>)}</div></div>}</div>;
}
