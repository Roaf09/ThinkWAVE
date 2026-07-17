/* FILE GUIDE:
 * client/src/pages/teacher/HostLive.jsx
 * Purpose: Teacher host panel used during active live sessions.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { makeSocket } from "../../lib/socket";
import { QRCodeCanvas } from "qrcode.react";
import { useTheme } from "../../context/ThemeContext";
import ActionDialog, { primaryBtn, secondaryBtn } from "../../components/ActionDialog";
import { normalizeTemplateType } from "../../lib/templateTypes";
import ThemeIconButton from "../../components/ThemeIconButton";
import { TwIcon } from "../../components/TwUI";
import { isInstitutionPlan } from "../../lib/planLimits";

// HostLive is the teacher's live-control screen. It manages session status, question flow, roster/groups, and analytics.
export default function HostLive() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { dark, toggleTheme } = useTheme();
  const [state,setState]=useState(null); const [questions,setQuestions]=useState([]); const [roster,setRoster]=useState([]); const [groups,setGroups]=useState([]); const [scores,setScores]=useState([]);
  const [msg,setMsg]=useState(""); const [starting,setStarting]=useState(false); const [countdown,setCountdown]=useState(0); const [nowMs,setNowMs]=useState(Date.now()); const [answeredCount,setAnsweredCount]=useState(0); const [clockOffsetMs,setClockOffsetMs]=useState(0);
  const [confirmAction,setConfirmAction]=useState(null); const [deleteGroupTarget,setDeleteGroupTarget]=useState(null); const [reviewTarget,setReviewTarget]=useState(null); const [kickTarget,setKickTarget]=useState(null); const [allAnsweredPrompt,setAllAnsweredPrompt]=useState(false); const [finishedPrompt,setFinishedPrompt]=useState(false); const [autoNextCount,setAutoNextCount]=useState(5); const [institutionPlan,setInstitutionPlan]=useState(false);
  const socketRef=useRef(null);
  const C=dark?{pageBg:"radial-gradient(circle at top left,rgba(43,108,255,.18),transparent 32%),linear-gradient(180deg,#07111f,#0e1733)",cardBg:"rgba(12,23,45,.94)",cardBg2:"rgba(9,19,37,.92)",border:"#203154",text:"#e7e9ee",muted:"#8a9bc4",sub:"#6b7db3",accent:"#2b6cff",headerBg:"#0d1428"}:{pageBg:"radial-gradient(circle at top left,rgba(43,108,255,.15),transparent 34%),linear-gradient(180deg,#f8fbff,#e6eeff)",cardBg:"rgba(255,255,255,.92)",cardBg2:"rgba(241,246,255,.96)",border:"#c8d5f4",text:"#0f172a",muted:"#4b5f92",sub:"#5a6a9a",accent:"#2b6cff",headerBg:"#f5f8ff"};

  useEffect(()=>{Promise.all([api.get(`/sessions/${id}/state`),api.get("/auth/me")]).then(([sessionRes,meRes])=>{const data=sessionRes.data;setState(data.session);setQuestions(data.questions||[]);setRoster(data.participants||[]);setGroups(data.groups||[]);setScores(data.scores||[]);setInstitutionPlan(isInstitutionPlan(meRes.data))}).catch(()=>setMsg("Could not load session."));},[id]);
  useEffect(()=>{const t=setInterval(()=>setNowMs(Date.now()),200);return()=>clearInterval(t)},[]);
  useEffect(()=>{
    const s=makeSocket(); socketRef.current=s;
    s.on("connect",()=>s.emit("teacher:join",{sessionId:Number(id)}));
    s.on("teacher:error",p=>setMsg(p?.message||"Action could not be completed."));
    s.on("session:state",p=>{setState(p.state);setQuestions(p.questions||[]);if(p.state?.server_now)setClockOffsetMs(Date.now()-new Date(p.state.server_now).getTime());setAnsweredCount(0);setAllAnsweredPrompt(false);setFinishedPrompt(false);setAutoNextCount(5)});
    s.on("roster:update",r=>setRoster(r||[])); s.on("groups:update",g=>setGroups(g||[])); s.on("scores:update",sc=>setScores(sc||[])); s.on("answer:received",()=>setAnsweredCount(v=>v+1));
    s.on("tab:updated",({participantId,count})=>setRoster(rows=>rows.map(row=>Number(row.id)===Number(participantId)?{...row,tab_out_count:count}:row)));
    s.on("antiCheat:review",payload=>setReviewTarget(payload));
    const hb=setInterval(()=>s.emit("teacher:heartbeat",{sessionId:Number(id)}),5000);
    return()=>{clearInterval(hb);s.disconnect()};
  },[id]);

  const currentQ=useMemo(()=>state?questions[state.current_question_index||0]||null:null,[state,questions]);
  const isEnded=state?.status==="ENDED"; const isLive=state?.status==="LIVE"; const joinMode=state?.join_mode||"SOLO"; const connectedStudents=roster.filter(p=>p.connected&&!p.kicked_at).length;
  const unassignedStudents=roster.filter(p=>!p.group_id&&!p.kicked_at); const groupsLocked=state?.status!=="LOBBY"; const canStartGroup=joinMode!=="GROUP"||(groups.length>0&&unassignedStudents.length===0); const isLastQuestion=!!state&&Number(state.current_question_index||0)>=Math.max(0,questions.length-1);
  const expectedAnswerCount=joinMode==="GROUP"?groups.filter(g=>(g.members||[]).some(m=>Number(m.connected)===1)).length:connectedStudents;
  useEffect(()=>{if(!isLive||expectedAnswerCount<=0||answeredCount<expectedAnswerCount)return;if(isLastQuestion)setFinishedPrompt(true);else{setAutoNextCount(5);setAllAnsweredPrompt(true)}},[answeredCount,expectedAnswerCount,isLive,isLastQuestion]);
  useEffect(()=>{if(!allAnsweredPrompt)return;if(autoNextCount<=0){setAllAnsweredPrompt(false);next();return}const t=setTimeout(()=>setAutoNextCount(v=>v-1),1000);return()=>clearTimeout(t)},[allAnsweredPrompt,autoNextCount]);

  const timer=useMemo(()=>{const total=Number(currentQ?.config_json?.timeLimitSec||state?.time_limit_sec||0);if(!currentQ||!isLive)return{remainingSec:0,progress:0,total};const deadline=state?.question_deadline_at?new Date(state.question_deadline_at).getTime():state?.question_started_at?new Date(state.question_started_at).getTime()+total*1000:0;const remaining=Math.max(0,Math.ceil((deadline-(nowMs-clockOffsetMs))/1000));return{remainingSec:remaining,progress:total?remaining/total:0,total}},[currentQ,state,isLive,nowMs,clockOffsetMs]);

  async function startWithCountdown(){if(starting)return;if(joinMode==="GROUP"&&!canStartGroup){setMsg("Create groups and assign all joined students before starting.");return}setStarting(true);for(let i=3;i>=1;i--){setCountdown(i);await new Promise(r=>setTimeout(r,1000))}setCountdown(0);socketRef.current?.emit("teacher:setStatus",{sessionId:Number(id),status:"LIVE"});setStarting(false)}
  function next(){if(!isLive||isLastQuestion)return;socketRef.current?.emit("teacher:nextQuestion",{sessionId:Number(id)})}
  async function runConfirmedAction(){const kind=confirmAction;setConfirmAction(null);if(kind==="toggle"){if(state.status==="LIVE")socketRef.current?.emit("teacher:setStatus",{sessionId:Number(id),status:"PAUSED"});else await startWithCountdown()}if(kind==="end")socketRef.current?.emit("teacher:setStatus",{sessionId:Number(id),status:"ENDED"})}
  function allowStudent(){if(!reviewTarget)return;socketRef.current?.emit("teacher:allowStudent",{sessionId:Number(id),participantId:reviewTarget.participantId});setReviewTarget(null)}
  function kickStudent(target){socketRef.current?.emit("teacher:kickStudent",{sessionId:Number(id),participantId:target.participantId||target.id});setReviewTarget(null);setKickTarget(null)}
  async function download(format){if(!isEnded)return;try{const resp=await api.get(`/analytics/sessions/${id}/export/${format}`,{responseType:"blob"});const url=URL.createObjectURL(resp.data);const a=document.createElement("a");a.href=url;a.download=`session-${id}-records.${format}`;a.click();URL.revokeObjectURL(url)}catch{setMsg("Export failed.")}}
  if(!state)return <div style={{minHeight:"100vh",background:C.pageBg,display:"grid",placeItems:"center",color:C.muted}}>Loading session…</div>;
  const toggleLabel=starting?`Starting in ${countdown}…`:state.status==="LIVE"?"Pause":state.status==="PAUSED"?"Resume":"Start";

  return <div className="tw-host-live" style={{minHeight:"100vh",background:C.pageBg,fontFamily:"'Segoe UI',system-ui,sans-serif",color:C.text}}>
    <header className="tw-host-header" style={{background:C.headerBg,borderColor:C.border}}><div><div className="tw-host-brand"><span>Think</span><span>WAVE</span><small>Host Panel</small></div><div className="tw-host-status"><StatusPill label={state.status} kind={isLive?"green":isEnded?"neutral":"yellow"}/><StatusPill label={joinMode==="GROUP"?"Group Mode":"Solo Mode"} kind="blue"/>{state.max_participants?<StatusPill label={`Capacity ${state.max_participants}`} kind="blue"/>:null}{msg?<span>{msg}</span>:null}</div></div><div className="tw-host-actions"><ThemeIconButton dark={dark} onClick={toggleTheme} style={btnStyle(C,"ghost")}/>{isEnded?<button onClick={()=>navigate("/teacher",{state:{tab:"home"}})} style={btnStyle(C,"secondary")}><TwIcon name="home" size={17}/> Dashboard</button>:<><button onClick={()=>setConfirmAction("toggle")} disabled={starting} style={btnStyle(C,"primary")}><TwIcon name={state.status==="LIVE"?"pause":"play"} size={17}/>{toggleLabel}</button><button onClick={()=>setConfirmAction("end")} style={btnStyle(C,"danger")}><TwIcon name="stop" size={17}/> End</button></>}</div></header>

    <main className="tw-host-main">
      {!isEnded&&<section style={{...card(C),padding:0,overflow:"hidden"}}><div className="tw-host-question-head"><div className="qn-subject">{state.quiz_title||"ThinkWAVE"}</div><div><StatusPill label={`${answeredCount}/${expectedAnswerCount} answered`} kind="blue"/><StatusPill label={fmtTime(timer.remainingSec)} kind={timer.remainingSec<=5&&isLive?"red":"neutral"}/></div></div><div className="tw-host-progress" style={{background:C.border}}><div style={{width:`${Math.round(timer.progress*100)}%`,background:timer.remainingSec<=5?"#ef4444":C.accent}}/></div><div className="tw-host-question-body"><div className="tw-host-question-row"><span>{state.template_type==="MATCHING"?"Batch":"Question"} {(state.current_question_index||0)+1} / {questions.length}</span><button className={`tw-host-next ${isLastQuestion?"is-hidden":""}`} onClick={()=>next()} disabled={!isLive||isLastQuestion} style={btnStyle(C,"primary")}><TwIcon name="arrowRight" size={17}/> Next</button><div><StatusPill label={`${currentQ?.config_json?.timeLimitSec||state.time_limit_sec||30}s`} kind="blue"/><StatusPill label={`${currentQ?.config_json?.points||1} pts`} kind="yellow"/></div></div>{currentQ?<><div className="tw-host-prompt" style={{background:C.cardBg2,borderColor:C.border}}>{currentQ?.config_json?.showPromptImage!==false&&currentQ?.config_json?.promptImage?<img src={currentQ.config_json.promptImage} alt=""/>:null}<div>{currentQ.prompt}</div></div><QuestionPreview q={currentQ} templateType={normalizeTemplateType(state.template_type)} C={C}/></>:<div style={{padding:30,textAlign:"center",color:C.muted}}>You have reached the end.</div>}</div></section>}

      <section style={card(C)}><div className="tw-host-section-title"><h3><TwIcon name="trophy" size={21}/>{isEnded?"Scores":"Live Scores"}</h3><div><button onClick={()=>navigate(`/teacher/analytics/${id}`)} style={btnStyle(C,"ghost")}><TwIcon name="analytics" size={16}/> Open Analytics</button>{institutionPlan?<><button onClick={()=>download("pdf")} disabled={!isEnded} style={{...btnStyle(C,"ghost"),opacity:isEnded?1:.45}}><TwIcon name="download" size={16}/> PDF</button><button onClick={()=>download("xlsx")} disabled={!isEnded} style={{...btnStyle(C,"ghost"),opacity:isEnded?1:.45}}><TwIcon name="download" size={16}/> XLSX</button></>:null}</div></div><div className="tw-host-score-list">{scores.length?scores.map((score,index)=><div key={score.participant_id} style={{background:index===0?"rgba(251,191,36,.08)":C.cardBg2,borderColor:C.border}}><span className="tw-host-rank">#{index+1}</span><strong>{joinMode==="GROUP"?(score.group_name||`${score.first_name} ${score.last_name}`):`${score.first_name} ${score.last_name}`}</strong><b>{score.total_points} pts</b></div>):<p style={{color:C.muted,textAlign:"center"}}>No answers yet.</p>}</div></section>

      {!isEnded&&<div className="tw-host-lower-grid"><section style={card(C)}><div className="tw-host-section-title"><h3><TwIcon name="users" size={21}/> Students</h3>{joinMode==="GROUP"?<button disabled={groupsLocked} onClick={()=>socketRef.current?.emit("teacher:addGroup",{sessionId:Number(id)})} style={{...btnStyle(C,"ghost"),opacity:groupsLocked?.5:1}}><TwIcon name="plus" size={16}/> Add Group</button>:null}</div><div className="tw-host-student-list">{roster.filter(p=>!p.kicked_at).map(p=><div key={p.id} style={{background:C.cardBg2,borderColor:C.border}}><div><strong>{p.first_name} {p.last_name}</strong><small>{p.connected?"Online":"Offline"} · Tab outs: {Number(p.tab_out_count||0)}</small></div>{Number(p.tab_out_count||0)>=2?<button onClick={()=>setKickTarget(p)} style={btnStyle(C,"danger")}><TwIcon name="logout" size={15}/> Kick</button>:null}</div>)}{!roster.length?<p style={{color:C.muted,textAlign:"center"}}>No students yet.</p>:null}</div>{joinMode==="GROUP"?<div className="tw-host-group-list"><div style={{...card(C),background:C.cardBg2,boxShadow:"none"}}><b>Waiting for assignment</b><div>{unassignedStudents.map(p=><StudentChip key={p.id} name={`${p.first_name} ${p.last_name}`.trim()} connected={p.connected} C={C}/>)}</div></div>{groups.map(group=><div key={group.id} style={{...card(C),background:C.cardBg2,boxShadow:"none"}}><div className="tw-host-section-title"><div><b>{group.display_name}</b><small>{group.members?.length||0} members</small></div><button disabled={groupsLocked} onClick={()=>setDeleteGroupTarget(group)} style={{...btnStyle(C,"ghost"),opacity:groupsLocked?.45:1}}><TwIcon name="trash" size={15}/></button></div><div>{group.members?.map(member=><StudentChip key={member.id} name={`${member.first_name} ${member.last_name}`.trim()} connected={member.connected} C={C}/>)}</div></div>)}</div>:null}</section>
      <section style={card(C)}><h3 style={{margin:"0 0 10px",display:"flex",gap:8,alignItems:"center"}}><TwIcon name="link" size={21}/> Guest Join</h3><p style={{color:C.muted}}>Share the QR code or join code with guests.</p><div className="tw-host-qr"><div><QRCodeCanvas value={`${window.location.origin}/play?code=${state.join_code||""}`} size={160}/></div></div><div className="tw-host-code" style={{background:C.cardBg2,borderColor:C.border}}><small>Join Code</small><strong>{state.join_code||"—"}</strong></div></section></div>}
    </main>

    <ActionDialog open={!!confirmAction} tone={confirmAction==="end"?"red":"blue"} icon={<TwIcon name={confirmAction==="end"?"stop":state.status==="LIVE"?"pause":"play"} size={28}/>} title={confirmAction==="end"?"End session?":state.status==="LIVE"?"Pause session?":state.status==="PAUSED"?"Resume session?":"Start session?"} message={confirmAction==="end"?"This will finish the live session and save its results.":state.status==="LIVE"?"Students will stop progressing until you resume.":"The live question countdown will begin."} onClose={()=>setConfirmAction(null)}><button onClick={()=>setConfirmAction(null)} style={secondaryBtn(C,dark)}>Cancel</button><button onClick={runConfirmedAction} style={primaryBtn(confirmAction==="end"?{bg:"#fee2e2",fg:"#dc2626",border:"#fca5a5"}:{bg:"#dbeafe",fg:"#1d4ed8",border:"#93c5fd"})}>Confirm</button></ActionDialog>
    <ActionDialog open={allAnsweredPrompt} tone="green" icon={<TwIcon name="check" size={28}/>} title="Everyone has answered" message={null} closeOnBackdrop={false} onClose={()=>{}}><button onClick={()=>{setAllAnsweredPrompt(false);next()}} style={primaryBtn({bg:"#dcfce7",fg:"#15803d",border:"#86efac"})}>Go to next ({autoNextCount})</button></ActionDialog>
    <ActionDialog open={finishedPrompt} tone="green" icon={<TwIcon name="check" size={28}/>} title="Everyone has finished answering" message={null} onClose={()=>setFinishedPrompt(false)}><button onClick={()=>setFinishedPrompt(false)} style={secondaryBtn(C,dark)}>Wait</button><button onClick={()=>{setFinishedPrompt(false);setConfirmAction("end")}} style={primaryBtn({bg:"#dcfce7",fg:"#15803d",border:"#86efac"})}>End Session</button></ActionDialog>
    <ActionDialog open={!!reviewTarget} tone="yellow" icon={<TwIcon name="warning" size={28}/>} title="Suspicious activity" message="Suspicious activities: a student have left the live session twice" closeOnBackdrop={false} onClose={()=>{}}><button onClick={allowStudent} style={secondaryBtn(C,dark)}>Wait</button><button onClick={()=>kickStudent(reviewTarget)} style={primaryBtn({bg:"#fee2e2",fg:"#dc2626",border:"#fca5a5"})}>Kick</button></ActionDialog>
    <ActionDialog open={!!kickTarget} tone="red" icon={<TwIcon name="logout" size={28}/>} title="Kick this student?" message={kickTarget?`${kickTarget.first_name} ${kickTarget.last_name} will be removed from the live session.`:""} onClose={()=>setKickTarget(null)}><button onClick={()=>setKickTarget(null)} style={secondaryBtn(C,dark)}>No</button><button onClick={()=>kickStudent(kickTarget)} style={primaryBtn({bg:"#fee2e2",fg:"#dc2626",border:"#fca5a5"})}>Yes</button></ActionDialog>
    <ActionDialog open={!!deleteGroupTarget} tone="red" icon={<TwIcon name="trash" size={28}/>} title="Delete group?" message={deleteGroupTarget?`Delete ${deleteGroupTarget.display_name}? Its students will return to the waiting list.`:""} onClose={()=>setDeleteGroupTarget(null)}><button onClick={()=>setDeleteGroupTarget(null)} style={secondaryBtn(C,dark)}>Cancel</button><button onClick={()=>{socketRef.current?.emit("teacher:deleteGroup",{sessionId:Number(id),groupId:deleteGroupTarget.id});setDeleteGroupTarget(null)}} style={primaryBtn({bg:"#fee2e2",fg:"#dc2626",border:"#fca5a5"})}>Delete</button></ActionDialog>
  </div>;
}

function AnalyticsPanel({ C, analytics, tabMonitoring, joinMode }) {
  const summary = analytics.summary || {};
  const students = analytics.students || [];
  const questions = analytics.questions || [];
  const groupedAttendance = joinMode === "GROUP" ? Object.values(students.reduce((acc, student) => {
    const key = student.group_name || `${student.first_name} ${student.last_name}`.trim();
    if (!acc[key]) acc[key] = { name: key, members: [] };
    acc[key].members.push(student);
    return acc;
  }, {})) : [];
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 12 }}>
        <MetricCard C={C} label="Average" value={summary.avg_score ?? 0} />
        <MetricCard C={C} label="Min" value={summary.min_score ?? 0} />
        <MetricCard C={C} label="Max" value={summary.max_score ?? 0} />
        <MetricCard C={C} label="Attendance" value={summary.participant_count ?? students.length} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div style={{ ...card(C), boxShadow: "none", padding: 16, background: C.cardBg2 }}>
          <div style={{ color: C.text, fontWeight: 900, marginBottom: 10 }}>Attendance</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {joinMode === "GROUP" ? groupedAttendance.map((group) => (
              <details key={group.name} style={{ width: "100%", background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 14, padding: "10px 12px" }}>
                <summary style={{ cursor: "pointer", color: C.text, fontWeight: 800 }}>{group.name} <span style={{ color: C.muted, fontWeight: 700 }}>({group.members.length})</span></summary>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                  {group.members.map((member) => <StudentChip key={member.participant_id} name={`${member.first_name} ${member.last_name}`.trim()} connected={true} C={C} />)}
                </div>
              </details>
            )) : students.map((student) => <StudentChip key={student.participant_id} name={`${student.first_name} ${student.last_name}`.trim()} connected={true} C={C} />)}
            {students.length === 0 && <span style={{ color: C.muted }}>No joined students.</span>}
          </div>
        </div>
        <div style={{ ...card(C), boxShadow: "none", padding: 16, background: C.cardBg2 }}>
          <div style={{ color: C.text, fontWeight: 900, marginBottom: 10 }}>Tab Monitoring</div>
          <div style={{ display: "grid", gap: 8 }}>
            {tabMonitoring.map((row) => (
              <div key={row.participant_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", borderRadius: 12, background: C.cardBg, border: `1px solid ${C.border}` }}>
                <span style={{ color: C.text, fontWeight: 700 }}>{row.assigned_group_name || row.group_name || `${row.first_name} ${row.last_name}`}</span>
                <StatusPill label={`${row.tab_out_count || 0} tab out`} kind={(row.tab_out_count || 0) > 0 ? "red" : "green"} />
              </div>
            ))}
            {tabMonitoring.length === 0 && <span style={{ color: C.muted }}>No tab events recorded.</span>}
          </div>
        </div>
      </div>
      <div style={{ ...card(C), boxShadow: "none", padding: 16, background: C.cardBg2 }}>
        <div style={{ color: C.text, fontWeight: 900, marginBottom: 12 }}>Per-question Percentage</div>
        <div style={{ display: "grid", gap: 10 }}>
          {questions.map((q) => (
            <div key={q.question_id} style={{ display: "grid", gridTemplateColumns: "72px 1fr 110px 120px", gap: 12, alignItems: "center", padding: "10px 12px", borderRadius: 14, background: C.cardBg, border: `1px solid ${C.border}` }}>
              <div style={{ color: C.muted, fontWeight: 800 }}>Q{Number(q.question_order || 0) + 1}</div>
              <div style={{ color: C.text, fontWeight: 700 }}>{q.prompt}</div>
              <div style={{ color: C.text, fontWeight: 900 }}>{q.pct_correct ?? 0}%</div>
              <StatusPill label={`${q.pct_correct ?? 0}% correct / ${q.pct_incorrect ?? Math.max(0, 100 - Number(q.pct_correct || 0))}% incorrect`} kind="blue" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ C, label, value }) {
  return (
    <div style={{ ...card(C), boxShadow: "none", padding: 16, background: C.cardBg2 }}>
      <div style={{ color: C.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800 }}>{label}</div>
      <div style={{ color: C.text, fontSize: 28, fontWeight: 900, marginTop: 8 }}>{value}</div>
    </div>
  );
}

function QuestionPreview({ q, templateType, C }) {
  const cfg = q?.config_json || {};
  const labels = "ABCDEFGHIJ".split("");
  const tt = normalizeTemplateType(templateType);
  if (tt === "MCQ" || tt === "TRUE_FALSE") {
    const opts = Array.isArray(cfg.options) ? cfg.options : [];
    return (
      <div style={{ display: "grid", gap: 10 }}>
        {opts.map((opt, i) => {
          const optText = typeof opt === "object" ? (opt?.text || "") : String(opt || "");
          const optImage = typeof opt === "object" ? (opt?.image || "") : "";
          const optLabel = optText || (optImage ? "Image option" : `Option ${i + 1}`);
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 16, background: C.cardBg2, border: `1px solid ${C.border}` }}>
              <span style={{ width: 34, height: 34, borderRadius: 10, display: "grid", placeItems: "center", flexShrink: 0, background: C.cardBg, border: `1px solid ${C.border}`, color: C.accent, fontWeight: 900 }}>{labels[i] || ""}</span>
              {optImage ? <img src={optImage} alt={optText || `Option ${i + 1}`} style={{ height: 52, maxWidth: 90, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} /> : null}
              {optLabel ? <span style={{ color: C.text, fontWeight: 700, minWidth: 0, wordBreak: "break-word" }}>{optLabel}</span> : null}
            </div>
          );
        })}
      </div>
    );
  }
  if (tt === "MATCHING") {
    const colA = Array.isArray(cfg.colA) ? cfg.colA : [];
    const colB = Array.isArray(cfg.colB) ? cfg.colB : [];
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ display: "grid", gap: 10 }}>
          {colA.map((item, i) => (
            <div key={`a-${i}`} style={{ padding: "14px 16px", borderRadius: 16, background: C.cardBg2, border: `1px solid ${C.border}` }}>
              <div style={{ color: C.accent, fontSize: 12, fontWeight: 900, marginBottom: 8 }}>Column A · {i + 1}</div>
              {item?.image ? <img src={item.image} alt={item.text || `A${i + 1}`} style={{ maxWidth: "100%", maxHeight: 84, borderRadius: 12, display: "block", marginBottom: item?.text ? 8 : 0 }} /> : null}
              <div style={{ color: C.text, fontWeight: 700 }}>{item?.text || (item?.image ? "Image prompt" : `Item ${i + 1}`)}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          {colB.map((item, i) => (
            <div key={`b-${i}`} style={{ padding: "14px 16px", borderRadius: 16, background: C.cardBg2, border: `1px solid ${C.border}` }}>
              <div style={{ color: C.accent, fontSize: 12, fontWeight: 900, marginBottom: 8 }}>Column B · {i + 1}</div>
              {item?.image ? <img src={item.image} alt={item.text || `B${i + 1}`} style={{ maxWidth: "100%", maxHeight: 84, borderRadius: 12, display: "block", marginBottom: item?.text ? 8 : 0 }} /> : null}
              <div style={{ color: C.text, fontWeight: 700 }}>{item?.text || (item?.image ? "Image answer" : `Match ${i + 1}`)}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (tt === "GUESS_WORD_4PICS") {
    const images = Array.isArray(cfg.images) ? cfg.images : [];
    return (
      <div>
        <div style={{ color: C.muted, fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Students see a 2×2 image board and type the word.</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, maxWidth: 360 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ aspectRatio: "1", borderRadius: 14, overflow: "hidden", background: C.cardBg2, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {images[i] ? (
                <img src={images[i]} alt={`Clue ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <span style={{ color: C.muted, fontWeight: 900, fontSize: 24 }}>?</span>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }
  return <div style={{ padding: "14px 16px", borderRadius: 16, background: C.cardBg2, border: `1px solid ${C.border}`, color: C.muted, fontWeight: 700 }}>Student interaction preview matches the live player for this template.</div>;
}

function fmtTime(sec) {
  const s = Math.max(0, Number(sec || 0));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function card(C) {
  return { background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 20, padding: 24, boxShadow: darkShadow(C), transition: "background 0.3s" };
}

function darkShadow(C) {
  return C.pageBg === "#080e1f" ? "0 4px 24px rgba(0,0,0,0.15)" : "0 18px 42px rgba(43,108,255,0.10)";
}

function btnStyle(C, variant) {
  const base = { padding: "9px 18px", borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: "pointer", border: "none", transition: "all 0.2s" };
  if (variant === "primary") return { ...base, background: C.accent, color: "#fff", boxShadow: "0 4px 16px rgba(43,108,255,0.3)" };
  if (variant === "secondary") return { ...base, background: "transparent", border: `1px solid ${C.border}`, color: C.muted };
  if (variant === "danger") return { ...base, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171" };
  if (variant === "ghost") return { ...base, background: C.cardBg2, border: `1px solid ${C.border}`, color: C.muted };
  return base;
}

function StatusPill({ label, kind = "neutral" }) {
  const palette = kind === "green"
    ? { bg: "rgba(34,197,94,0.15)", fg: "#22c55e", br: "rgba(34,197,94,0.3)" }
    : kind === "yellow"
      ? { bg: "rgba(251,191,36,0.15)", fg: "#fbbf24", br: "rgba(251,191,36,0.28)" }
      : kind === "red"
        ? { bg: "rgba(239,68,68,0.16)", fg: "#f87171", br: "rgba(239,68,68,0.3)" }
        : kind === "blue"
          ? { bg: "rgba(43,108,255,0.14)", fg: "#7da4ff", br: "rgba(43,108,255,0.25)" }
          : { bg: "rgba(148,163,184,0.12)", fg: "#94a3b8", br: "rgba(148,163,184,0.2)" };
  return <span style={{ padding: "4px 12px", borderRadius: 999, fontSize: 12, fontWeight: 800, background: palette.bg, color: palette.fg, border: `1px solid ${palette.br}` }}>{label}</span>;
}

function StudentChip({ name, connected, C }) {
  return <span style={{ padding: "6px 12px", borderRadius: 999, background: C.cardBg, color: C.text, border: `1px solid ${connected ? "rgba(34,197,94,0.25)" : C.border}`, fontSize: 12, fontWeight: 700 }}>{connected ? "●" : "○"} {name}</span>;
}
