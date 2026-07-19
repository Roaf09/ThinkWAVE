import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useColors, useTheme } from "../context/ThemeContext";
import { IconBubble, TwIcon } from "../components/TwUI";
import PublicHeader from "../components/PublicHeader";
import { TEMPLATE_PALETTES } from "../lib/templatePalette";

/* Replace these image files in client/public/media/landing/ without changing this code. */
const HERO_SLIDES = [
  { src: "/media/landing/core-quiz-builder.svg", alt: "ThinkWAVE quiz builder" },
  { src: "/media/landing/core-live-session.svg", alt: "ThinkWAVE live session" },
  { src: "/media/landing/core-analytics.svg", alt: "ThinkWAVE classroom analytics" },
  { src: "/media/landing/core-classes.svg", alt: "ThinkWAVE class organization" },
];
/* Replace the files in client/public/media/templates/ to show your own gameplay screenshots. */
const TEMPLATE_IMAGES = {
  MCQ: { landscape: "/media/templates/multiple-choice.svg", mobile: "/media/templates/multiple-choice-mobile.svg" },
  TRUE_FALSE: { landscape: "/media/templates/true-false.svg", mobile: "/media/templates/true-false-mobile.svg" },
  TYPE_ANSWER: { landscape: "/media/templates/identification.svg", mobile: "/media/templates/identification-mobile.svg" },
  MATCHING: { landscape: "/media/templates/matching.svg", mobile: "/media/templates/matching-mobile.svg" },
  GUESS_WORD_4PICS: { landscape: "/media/templates/guess-word.svg", mobile: "/media/templates/guess-word-mobile.svg" },
  THINK_SPELL: { landscape: "/media/templates/think-and-spell.svg", mobile: "/media/templates/think-and-spell-mobile.svg" },
};

const benefits = [
  ["create","Build faster","Turn lesson ideas into engaging activities without starting from scratch."],
  ["live","Keep learners involved","Run lively classroom sessions where every learner can participate."],
  ["classes","Stay organized","Keep quizzes, classes, schedules, and results together in one workspace."],
  ["chart","Understand progress","See who participated, how the class performed, and where support is needed."],
];
const templateCopy = {
  MCQ:"Create quick checks with one or two correct answers.", TRUE_FALSE:"Make quick understanding checks with two clear choices.",
  TYPE_ANSWER:"Let learners recall and type the answer themselves.", MATCHING:"Connect ideas, images, terms, and meanings side by side.",
  GUESS_WORD_4PICS:"Use four visual clues to reveal one meaningful word.", THINK_SPELL:"Challenge learners to discover valid words inside a letter grid.",
};

export default function Landing(){
  const c=useColors(); const {dark}=useTheme(); const nav=useNavigate();
  const [isFirstRun,setIsFirstRun]=useState(true); const [stats,setStats]=useState({sessionsCompleted:0,institutionsEmpowered:0,classesCreated:0});
  const [modalOpen,setModalOpen]=useState(false); const [modalStep,setModalStep]=useState("root"); const [entryMode,setEntryMode]=useState(""); const [joinCode,setJoinCode]=useState(""); const [modalMsg,setModalMsg]=useState(""); const [checking,setChecking]=useState(false);
  const [slide,setSlide]=useState(0); const [templatePreview,setTemplatePreview]=useState(null); const [previewClosing,setPreviewClosing]=useState(false); const hoverTimer=useRef(null); const closeTimer=useRef(null);
  useEffect(()=>{
    api.get("/auth/setup-status").then(({data})=>setIsFirstRun(data.isFirstRun)).catch(()=>setIsFirstRun(false));
    const refreshStats=()=>api.get("/public/stats").then(({data})=>setStats(data)).catch(()=>{});
    refreshStats(); const timer=setInterval(refreshStats,10000); return()=>clearInterval(timer);
  },[]);
  useEffect(()=>{const timer=setInterval(()=>setSlide(v=>(v+1)%HERO_SLIDES.length),5500);return()=>clearInterval(timer)},[]);
  useEffect(()=>()=>{clearTimeout(hoverTimer.current);clearTimeout(closeTimer.current)},[]);
  useEffect(()=>{ const id=window.location.hash?.slice(1); if(id) setTimeout(()=>document.getElementById(id)?.scrollIntoView({behavior:"smooth"}),50); },[]);
  const scroll=id=>document.getElementById(id)?.scrollIntoView({behavior:"smooth",block:"start"});
  function openModal(){setModalMsg("");setEntryMode("");setJoinCode("");setModalStep("root");setModalOpen(true)}
  async function getStarted(){setChecking(true);try{const {data}=await api.get("/auth/setup-status");if(data.isFirstRun)nav("/superadmin-register");else openModal()}catch{openModal()}finally{setChecking(false)}}
  function chooseJoin(mode){ if(mode==="student"){setModalOpen(false);nav("/student-login");return;} setEntryMode(mode);setModalStep("joinCode"); }
  function continueJoin(e){e.preventDefault();const code=joinCode.trim().toUpperCase();if(code.length<4)return setModalMsg("Please enter a valid session code first.");setModalOpen(false);nav(`/play?code=${encodeURIComponent(code)}&entry=${encodeURIComponent(entryMode||"guest")}`)}
  function beginTemplateHover(key){
    clearTimeout(hoverTimer.current); clearTimeout(closeTimer.current); setPreviewClosing(false);
    hoverTimer.current=setTimeout(()=>setTemplatePreview(key),1000);
  }
  function cancelTemplateHover(){
    clearTimeout(hoverTimer.current);
    if(templatePreview){
      clearTimeout(closeTimer.current);
      closeTimer.current=setTimeout(closeTemplatePreview,140);
    }
  }
  function keepTemplatePreview(){clearTimeout(closeTimer.current);setPreviewClosing(false)}
  function closeTemplatePreview(){
    setPreviewClosing(true);
    clearTimeout(closeTimer.current);
    closeTimer.current=setTimeout(()=>{setTemplatePreview(null);setPreviewClosing(false)},260);
  }
  const modalTitle=useMemo(()=>modalStep==="joinRole"?"Join Session":modalStep==="hostRole"?"Host Session":modalStep==="joinCode"?"Enter Session Code":"Get Started",[modalStep]);
  return <div id="home" className="tw-landing-page" style={{background:c.pageBg,color:c.text}}>
    <PublicHeader onSection={scroll} showSuper={!isFirstRun}/>
    <main>
      <section className="tw-landing-hero">
        <div className="tw-landing-hero-copy"><div className="tw-eyebrow">Playful learning. Clear progress.</div><h1>Turn every lesson into a learning experience students want to join.</h1><div className="tw-landing-cta"><button className="tw-cta-primary tw-landing-highlight-action" onClick={getStarted} disabled={checking}>{checking?"Please wait…":"Get Started"}</button>{!isFirstRun&&<button className="tw-cta-secondary tw-landing-highlight-action" style={{color:c.text,borderColor:c.accent}} onClick={()=>nav("/login?role=admin")}>Join as Admin</button>}</div></div>
        <div className="tw-landing-carousel" style={{background:c.cardBg,borderColor:c.border}}>
          <div className="tw-carousel-stage">{HERO_SLIDES.map((item,index)=><img key={item.src} src={item.src} alt={item.alt} className={index===slide?"active":""}/>)}</div>
          <div className="tw-carousel-dots">{HERO_SLIDES.map((_,i)=><button key={i} aria-label={`Show image ${i+1}`} className={i===slide?"active":""} onClick={()=>setSlide(i)}/>)}</div>
        </div>
      </section>

      <section className="tw-rounded-section" style={{background:dark?"rgba(255,255,255,.035)":"rgba(255,255,255,.55)"}}><div className="tw-section-intro tw-why-heading"><h2>Why ThinkWAVE?</h2><p className="tw-three-line-copy"><span>Make preparation lighter.</span><span>Participation stronger.</span><span>Classroom decisions more informed.</span></p></div><div className="tw-benefit-grid">{benefits.map(([icon,title,copy])=><article key={title} className="tw-hover-card" style={{background:c.cardBg,borderColor:c.border}}><IconBubble name={icon} c={c} size={50}/><h3>{title}</h3><p style={{color:c.textMuted}}>{copy}</p></article>)}</div></section>

      <section id="templates" className="tw-flat-section"><div className="tw-centered-heading"><span className="tw-eyebrow">Designed for different ways of learning</span><h2>Our Templates</h2><p style={{color:c.textMuted}}>Pick a format, add your content, and make each classroom activity feel fresh.</p></div><div className="tw-template-grid">{Object.entries(TEMPLATE_PALETTES).map(([key,t])=><article key={key} className="tw-template-landing-card" onMouseEnter={()=>beginTemplateHover(key)} onMouseLeave={cancelTemplateHover} style={{background:`linear-gradient(145deg,${t.accent}20,${c.cardBg})`,borderColor:`${t.accent}70`}}><span style={{background:`${t.accent}24`,color:t.accent}}><TwIcon name={t.icon} size={26}/></span><h3 style={{color:t.accent}}>{t.label}</h3><p style={{color:c.textMuted}}>{templateCopy[key]}</p></article>)}</div></section>

      <section id="analytics" className="tw-rounded-section tw-analytics-section" style={{background:dark?"rgba(255,255,255,.035)":"rgba(255,255,255,.55)"}}><div><span className="tw-eyebrow">Results you can act on</span><h2>See the learning behind every answer.</h2><p style={{color:c.textMuted}}>See who joined, how the class performed, and which questions may need another look. Schools can also explore more detailed insights and download reports whenever they need them.</p></div><div className="tw-analytics-visual" style={{background:c.cardBg,borderColor:c.border}}><div className="tw-analytics-metrics"><div><small>Average</small><b>84%</b></div><div><small>Submitted</small><b>42</b></div><div><small>Highest</small><b>98</b></div></div><div className="tw-analytics-chart">{[42,66,54,84,72,94].map((v,i)=><span key={i} style={{height:`${v}%`}}/>)}</div><div className="tw-plan-badges"><span>Basic overview</span><span>Institution insights</span></div></div></section>

      <section className="tw-flat-section tw-stat-section"><div className="tw-centered-heading"><p className="tw-stat-lead">ThinkWAVE is an interactive learning space that brings engaging activities and meaningful results together for <b>teachers and institutions</b>. Every completed session helps build a clearer picture of learning.</p></div><div className="tw-stat-grid"><Stat value={stats.sessionsCompleted} label="Sessions Completed" c={c}/><Stat value={stats.institutionsEmpowered} label="Institutions Empowered" c={c}/><Stat value={stats.classesCreated} label="Classes Created" c={c}/></div></section>

      <section id="plans" className="tw-flat-section"><div className="tw-centered-heading"><span className="tw-eyebrow">Start where you are</span><h2>Choose your plan</h2></div><div className="tw-plan-grid"><PlanCard c={c} title="Basic" subtitle="Explore core features with essential access" price="₱0" features={["All six templates with Basic question and time limits","Save up to 5 Question Bank items per template","Solo live sessions for up to 45 students","Class folders, assigned work, and core analytics"]} action="Get Started" basic onClick={()=>nav("/register")}/><PlanCard c={c} title="Institution" subtitle="Bring full classroom tools to your institution" price="₱50000" highlighted features={["Everything in Basic without template limits","Modified choices, image tools, and full Question Bank access","Solo or group live sessions with expanded capacity","Advanced analytics, tab monitoring, PDF and XLSX reports"]} action="Contact Us" onClick={()=>nav("/plan")}/></div></section>
    </main>
    <footer id="footer" className="tw-landing-footer" style={{background:c.cardBg3,borderColor:c.border}}><div><div className="tw-footer-logo"><span style={{color:c.text}}>Think</span><span>WAVE</span></div><p style={{color:c.textMuted}}>Create moments of learning that move with your classroom.</p></div><div className="tw-footer-links"><div><b>Legal</b><span>Privacy</span><span>Terms</span></div><div><b>Links</b><button onClick={()=>scroll("templates")}>Templates</button><button onClick={()=>scroll("plans")}>Plans</button></div><div><b>Contacts</b><span>ThinkWAVE Support</span><span>Philippines</span></div></div><div className="tw-footer-copy" style={{borderColor:c.border,color:c.textMuted}}>© 2026 ThinkWAVE · All Rights Reserved.</div></footer>

    {templatePreview&&<div className={`tw-template-preview-backdrop ${previewClosing?"closing":""}`}><div className="tw-template-preview-modal tw-template-preview-simple" style={{background:c.cardBg3,borderColor:c.border,color:c.text}} onMouseEnter={keepTemplatePreview} onMouseLeave={closeTemplatePreview}><h2>{TEMPLATE_PALETTES[templatePreview]?.label}</h2><div className="tw-template-preview-images tw-template-preview-dual"><div className="tw-template-preview-landscape"><img src={TEMPLATE_IMAGES[templatePreview]?.landscape} alt={`${TEMPLATE_PALETTES[templatePreview]?.label} landscape gameplay preview`}/></div><div className="tw-template-preview-mobile"><img src={TEMPLATE_IMAGES[templatePreview]?.mobile} alt={`${TEMPLATE_PALETTES[templatePreview]?.label} mobile gameplay preview`}/></div></div></div></div>}
    {modalOpen&&<><div className="tw-modal-backdrop" onClick={()=>setModalOpen(false)}/><div className="tw-start-modal" style={{background:c.cardBg3,borderColor:c.border,color:c.text}}><button className="tw-modal-x" onClick={()=>setModalOpen(false)}><TwIcon name="close"/></button>{modalStep!=="root"&&<button className="tw-modal-back" onClick={()=>{setModalMsg("");setModalStep("root")}}>← Back</button>}<h2>{modalTitle}</h2><p style={{color:c.textMuted}}>{modalStep==="root"?"Choose how you want to enter ThinkWAVE.":modalStep==="joinCode"?"Enter the live session code shared by the host.":"Choose the option that fits you."}</p>{modalStep==="root"&&<div className="tw-modal-options"><button onClick={()=>setModalStep("joinRole")}><IconBubble name="join" c={c}/><b>Join Session</b><small>Enter a live activity</small></button><button onClick={()=>setModalStep("hostRole")}><IconBubble name="host" c={c}/><b>Host Session</b><small>Create and lead an activity</small></button></div>}{modalStep==="joinRole"&&<div className="tw-modal-options"><button onClick={()=>chooseJoin("guest")}><IconBubble name="guest" c={c}/><b>Guest Join</b><small>Join without an account</small></button><button onClick={()=>chooseJoin("student")}><IconBubble name="student" c={c}/><b>Student</b><small>Use your student account</small></button></div>}{modalStep==="hostRole"&&<div className="tw-modal-options"><button onClick={()=>{setModalOpen(false);nav("/login")}}><IconBubble name="teacher" c={c}/><b>Teacher</b><small>Open your teacher workspace</small></button><button onClick={()=>{setModalOpen(false);nav("/guest")}}><IconBubble name="guest" c={c}/><b>Guest Host</b><small>Try a temporary workspace</small></button></div>}{modalStep==="joinCode"&&<form onSubmit={continueJoin} className="tw-code-form"><input value={joinCode} onChange={e=>setJoinCode(e.target.value.toUpperCase())} placeholder="SESSION CODE" autoFocus style={{background:c.inputBg,color:c.text,borderColor:c.inputBorder}}/>{modalMsg&&<div className="tw-form-error">{modalMsg}</div>}<button className="tw-cta-primary">Continue</button></form>}</div></>}
  </div>
}
function Stat({value,label,c}){return <div className="tw-stat-item"><b style={{color:c.text}}>{Number(value||0).toLocaleString()}</b><span style={{color:c.textMuted}}>{label}</span></div>}
function PlanCard({c,title,subtitle,price,features,action,onClick,highlighted,basic}){return <article className={`tw-plan-card ${highlighted?"featured":""}`} style={{background:c.cardBg,borderColor:highlighted?c.accent:c.border}}><div className="tw-plan-top"><div><h3>{title}</h3><p style={{color:c.textMuted}}>{subtitle}</p></div><strong>{price}</strong></div><hr style={{borderColor:c.border}}/><b>Includes:</b><ul>{features.map(x=><li key={x}><TwIcon name="check" size={17}/>{x}</li>)}</ul><button className={basic?"tw-plan-basic-action":""} onClick={onClick}>{action} <TwIcon name="arrow" size={17}/></button></article>}
