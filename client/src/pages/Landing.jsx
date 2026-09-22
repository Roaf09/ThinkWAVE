import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { ForcedTheme, useColors, useTheme } from "../context/ThemeContext";
import { IconBubble, TwIcon } from "../components/TwUI";
import PublicHeader from "../components/PublicHeader";
import { TEMPLATE_PALETTES } from "../lib/templatePalette";

/* Revision 10: the landing carousel uses every image supplied in carousel.zip. */
const HERO_SLIDES = [
  { src: "/media/landing/carousel/1.webp", alt: "ThinkWAVE learning experience preview 1" },
  { src: "/media/landing/carousel/2.webp", alt: "ThinkWAVE learning experience preview 2" },
  { src: "/media/landing/carousel/3.webp", alt: "ThinkWAVE learning experience preview 3" },
  { src: "/media/landing/carousel/4.webp", alt: "ThinkWAVE learning experience preview 4" },
  { src: "/media/landing/carousel/5.webp", alt: "ThinkWAVE learning experience preview 5" },
  { src: "/media/landing/carousel/6.webp", alt: "ThinkWAVE learning experience preview 6" },
];
/* Revision 10: desktop/mobile previews supplied in preview.zip. */
const TEMPLATE_IMAGES = {
  MCQ: { landscape: "/media/templates/previews/mcq-landscape.webp", mobile: "/media/templates/previews/mcq-mobile.webp" },
  TRUE_FALSE: { landscape: "/media/templates/previews/tof-landscape.webp", mobile: "/media/templates/previews/tof-mobile.webp" },
  TYPE_ANSWER: { landscape: "/media/templates/previews/identification-landscape.webp", mobile: "/media/templates/previews/identification-mobile.webp" },
  MATCHING: { landscape: "/media/templates/previews/matching-landscape.webp", mobile: "/media/templates/previews/matching-mobile.webp" },
  GUESS_WORD_4PICS: { landscape: "/media/templates/previews/guess-word-landscape.webp", mobile: "/media/templates/previews/guess-word-mobile.webp" },
  THINK_SPELL: { landscape: "/media/templates/previews/think-spell-landscape.webp", mobile: "/media/templates/previews/think-spell-mobile.webp" },
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
  GUESS_WORD_4PICS:"Use four visual clues to reveal one meaningful word.", THINK_SPELL:"Crossword-style word hunts challenge learners to connect valid words inside a letter grid.",
};

const TEMPLATE_ORDER = ["MCQ", "TRUE_FALSE", "TYPE_ANSWER", "MATCHING", "GUESS_WORD_4PICS", "THINK_SPELL"];

export default function Landing(){
  const nav=useNavigate(); const [searchParams]=useSearchParams();
  const [band,setBand]=useState({bg:"rgba(255,255,255,0)",light:false});
  const stopsRef=useRef(null);
  useEffect(()=>{
    if(searchParams.get("join")!=="guest") return;
    const code=searchParams.get("code")||"";
    nav(`/enter?mode=code${code?`&code=${encodeURIComponent(code)}`:""}`,{replace:true});
  },[searchParams,nav]);
  useEffect(()=>{
    const docTop=(el)=>el.getBoundingClientRect().top+(window.scrollY||0);
    // Cheap per-scroll check: boolean flip only, using the baked stops.
    const flip=()=>{
      const stops=stopsRef.current; if(!stops) return;
      const vh=window.innerHeight||800; const y=window.scrollY||0;
      const probe=y+vh*0.4;
      const light=probe>=stops.blendFull&&probe<stops.cut;
      setBand(prev=>prev.light===light?prev:{...prev,light});
    };
    // Baked on layout (NOT per scroll): gradient stops + zone bounds.
    // Static by design: mount + resize only. Hero media is aspect-boxed and
    // text reflow is negligible, so late passes are unnecessary.
    const bake=()=>{
      const templates=document.getElementById("templates"); const plans=document.getElementById("plans");
      if(!templates||!plans) return;
      const vh=window.innerHeight||800;
      const tTop=docTop(templates);
      const pTop=docTop(plans);
      // Fail dark: nonsense measurements must never wash out the hero.
      if(!(tTop>200&&pTop>tTop+200)) return;
      // Desktop starts blending right at Our Templates; mobile starts earlier.
      // The blend spans why→templates for a smooth gradient; the white→dark
      // cut at plans stays razor sharp (double stop).
      const desktop=window.matchMedia("(min-width:761px)").matches;
      const blendStart=desktop?Math.max(0,tTop-480):Math.max(0,tTop-vh*1.1);
      const blendFull=desktop?Math.max(blendStart+1,tTop-20):Math.max(blendStart+1,tTop-80);
      const cut=Math.max(blendFull,pTop-40);
      const bg=`linear-gradient(180deg, rgba(255,255,255,0) ${Math.round(blendStart)}px, #ffffff ${Math.round(blendFull)}px, #ffffff ${Math.round(cut)}px, rgba(255,255,255,0) ${Math.round(cut)}px)`;
      setBand(prev=>prev.bg===bg?{...prev,bg}:prev);
      stopsRef.current={blendFull,cut};
      flip();
    };
    const raf=requestAnimationFrame(bake);
    bake();
    window.addEventListener("scroll",flip,{passive:true});
    window.addEventListener("resize",bake);
    return()=>{cancelAnimationFrame(raf);window.removeEventListener("scroll",flip);window.removeEventListener("resize",bake)};
  },[]);
  return <ForcedTheme dark={!band.light}><LandingPage bandBg={band.bg}/></ForcedTheme>;
}
function LandingPage({bandBg}){
  const c=useColors(); const {dark}=useTheme(); const nav=useNavigate();
  const [isFirstRun,setIsFirstRun]=useState(true); const [stats,setStats]=useState({sessionsCompleted:0,institutionsEmpowered:0,classesCreated:0});
  const [checking,setChecking]=useState(false);
  const [slide,setSlide]=useState(0); const [starOpacity,setStarOpacity]=useState(1); const [showBackTop,setShowBackTop]=useState(false); const [templatePreview,setTemplatePreview]=useState(null); const [previewClosing,setPreviewClosing]=useState(false); const hoverTimer=useRef(null); const closeTimer=useRef(null);
  const [tSlide,setTSlide]=useState(0); const trackRef=useRef(null); const tTimer=useRef(null); const tIndex=useRef(0); const snapRef=useRef(null);
  useEffect(()=>{
    api.get("/auth/setup-status").then(({data})=>setIsFirstRun(data.isFirstRun)).catch(()=>setIsFirstRun(false));
    const refreshStats=()=>api.get("/public/stats").then(({data})=>setStats(data)).catch(()=>{});
    refreshStats(); const timer=setInterval(refreshStats,10000); return()=>clearInterval(timer);
  },[]);
  useEffect(()=>{const timer=setInterval(()=>setSlide(v=>(v+1)%HERO_SLIDES.length),5500);return()=>clearInterval(timer)},[]);
  useEffect(()=>()=>{clearTimeout(hoverTimer.current);clearTimeout(closeTimer.current);if(tTimer.current)clearInterval(tTimer.current);if(snapRef.current)clearTimeout(snapRef.current)},[]);
  useEffect(()=>{const onScroll=()=>{setStarOpacity(Math.max(0,1-window.scrollY/900));const atBottom=window.innerHeight+window.scrollY>=document.documentElement.scrollHeight-8;setShowBackTop(atBottom)};onScroll();window.addEventListener("scroll",onScroll,{passive:true});window.addEventListener("resize",onScroll);return()=>{window.removeEventListener("scroll",onScroll);window.removeEventListener("resize",onScroll)}},[]);
  useEffect(()=>{ const id=window.location.hash?.slice(1); if(id) setTimeout(()=>document.getElementById(id)?.scrollIntoView({behavior:"smooth"}),50); },[]);
  useEffect(()=>{pokeTAuto();return()=>{if(tTimer.current)clearInterval(tTimer.current)}},[]);
  const scroll=id=>document.getElementById(id)?.scrollIntoView({behavior:"smooth",block:"start"});
  async function getStarted(){setChecking(true);try{const {data}=await api.get("/auth/setup-status");if(data.isFirstRun)nav("/superadmin-register");else nav("/enter")}catch{nav("/enter")}finally{setChecking(false)}}
  function joinAsAdmin(){sessionStorage.setItem("tw_public_from","right");nav("/plan?type=institution")}
  function beginTemplateHover(key){
    clearTimeout(hoverTimer.current); clearTimeout(closeTimer.current); setPreviewClosing(false);
    hoverTimer.current=setTimeout(()=>setTemplatePreview(key),350);
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
  function scrollTTo(n){const track=trackRef.current;const el=track?.children?.[n];if(track&&el)track.scrollTo({left:el.offsetLeft-(track.clientWidth-el.clientWidth)/2,behavior:"smooth"})}
  function advanceTSlide(){
    const n=tIndex.current+1;
    // Seamless loop: slide onto a trailing clone of the first card, then snap
    // back to the real first card instantly (identical pixels, no rewind).
    if(n>=TEMPLATE_ORDER.length){
      scrollTTo(TEMPLATE_ORDER.length);
      if(snapRef.current) window.clearTimeout(snapRef.current);
      snapRef.current=window.setTimeout(()=>{trackRef.current?.scrollTo({left:0,behavior:"auto"});tIndex.current=0;setTSlide(0)},450);
      return;
    }
    tIndex.current=n;setTSlide(n);scrollTTo(n);
  }
  function pokeTAuto(){if(tTimer.current)clearInterval(tTimer.current);if(snapRef.current){window.clearTimeout(snapRef.current);snapRef.current=null}if(window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;tTimer.current=setInterval(advanceTSlide,5000)}
  function goTSlide(n){tIndex.current=n;setTSlide(n);scrollTTo(n);pokeTAuto()}
  function syncTSlide(){const track=trackRef.current;if(!track||!track.children.length)return;const x=track.scrollLeft+track.clientWidth/2;let best=0,bestD=Infinity;Array.from(track.children).forEach((el,i)=>{if(i>=TEMPLATE_ORDER.length)return;const d=Math.abs(el.offsetLeft+el.clientWidth/2-x);if(d<bestD){bestD=d;best=i}});if(best!==tIndex.current){tIndex.current=best;setTSlide(best)}}
  return <div id="home" className="tw-landing-page tw-starry-page" style={{"--tw-star-opacity":starOpacity,background:c.pageBg,color:c.text}}>
    <div className="tw-landing-whitewash" aria-hidden="true" style={{background:bandBg}}/>
    <PublicHeader onSection={scroll} setupComplete={!isFirstRun} concealSuper hideTheme minimal/>
    <main>
      <section className="tw-landing-hero">
        <div className="tw-landing-hero-copy"><div className="tw-eyebrow">Playful learning. Clear progress.</div><h1>Turn every lesson into a learning experience students want to join.</h1><div className="tw-landing-cta"><button className="tw-cta-primary tw-landing-highlight-action min-h-[58px] rounded-2xl px-[30px] text-base font-[950] cursor-pointer bg-brand text-white" onClick={getStarted} disabled={checking}>{checking?"Please wait…":"Get Started"}</button>{!isFirstRun&&<button className="tw-cta-secondary tw-landing-highlight-action min-h-[58px] rounded-2xl px-[30px] text-base font-[950] cursor-pointer bg-transparent" style={{color:c.text,borderColor:c.accent}} onClick={joinAsAdmin}>Join as Admin</button>}</div></div>
        <div className="tw-landing-carousel" style={{background:c.cardBg,borderColor:c.border}}>
          <div className="tw-carousel-stage">{HERO_SLIDES.map((item,index)=><img key={item.src} src={item.src} alt={item.alt} className={index===slide?"active":""}/>)}</div>
          <div className="tw-carousel-dots">{HERO_SLIDES.map((_,i)=><button key={i} aria-label={`Show image ${i+1}`} className={i===slide?"active":""} onClick={()=>setSlide(i)}/>)}</div>
        </div>
      </section>

      <section className="tw-rounded-section" style={{background:dark?"rgba(255,255,255,.035)":"rgba(255,255,255,.55)"}}><div className="tw-section-intro tw-why-heading"><h2>Why Think<span style={{ color: c.accent }}>WAVE</span>?</h2><p className="tw-three-line-copy"><span>Make preparation lighter.</span><span>Participation stronger.</span><span>Classroom decisions more informed.</span></p></div><div className="tw-benefit-grid">{benefits.map(([icon,title,copy])=><article key={title} className="tw-hover-card" style={{background:"#0b1830",borderColor:"rgba(132,167,255,0.2)"}}><IconBubble name={icon} c={c} size={50}/><h3 style={{color:"#fff"}}>{title}</h3><p style={{color:"#9aacd8"}}>{copy}</p></article>)}</div></section>

      <section id="templates" className="tw-flat-section"><div className="tw-centered-heading"><span className="tw-eyebrow">Designed for different ways of learning</span><h2>Our Templates</h2><p style={{color:c.textMuted}}>Pick a format, add your content, and make each classroom activity feel fresh.</p></div><div className="tw-template-grid">{Object.entries(TEMPLATE_PALETTES).map(([key,t])=><article key={key} className="tw-template-landing-card" onMouseEnter={()=>beginTemplateHover(key)} onMouseLeave={cancelTemplateHover} onClick={()=>{clearTimeout(hoverTimer.current);setTemplatePreview(key)}} style={{background:`linear-gradient(145deg,${t.accent}20,${c.cardBg})`,borderColor:`${t.accent}70`}}><span style={{background:`${t.accent}24`,color:t.accent}}><TwIcon name={t.icon} size={26}/></span><h3 style={{color:t.accent}}>{t.label}</h3><p style={{color:c.textMuted}}>{templateCopy[key]}</p></article>)}</div><div className="tw-template-carousel" ref={trackRef} onScroll={syncTSlide}>{[...TEMPLATE_ORDER, TEMPLATE_ORDER[0]].map((key,idx)=>{const t=TEMPLATE_PALETTES[key];return <article key={`${key}-${idx}`} className="tw-template-slide" style={{background:t.accent}} onClick={()=>{clearTimeout(hoverTimer.current);setTemplatePreview(key)}}><span><TwIcon name={t.icon} size={26}/></span><h3>{t.label}</h3><p>{templateCopy[key]}</p></article>})}</div><div className="tw-carousel-dots tw-template-dots">{TEMPLATE_ORDER.map((key,i)=><button key={key} type="button" aria-label={`Show ${TEMPLATE_PALETTES[key].label}`} className={i===tSlide?"active":""} onClick={()=>goTSlide(i)}/>)}</div></section>

      <section id="analytics" className="tw-rounded-section tw-analytics-section" style={{background:dark?"rgba(255,255,255,.035)":"rgba(255,255,255,.55)"}}><div><span className="tw-eyebrow">Results you can act on</span><h2>See the learning behind every answer.</h2><p style={{color:c.textMuted}}>See who joined, how the class performed, and which questions may need another look. Schools can also explore more detailed insights and download reports whenever they need them.</p></div><div className="tw-analytics-visual" style={{background:c.cardBg,borderColor:c.border}}><div className="tw-analytics-metrics"><div><small>Average</small><b>84%</b></div><div><small>Submitted</small><b>42</b></div><div><small>Highest</small><b>98</b></div></div><div className="tw-analytics-chart">{[42,66,54,84,72,94].map((v,i)=><span key={i} style={{height:`${v}%`}}/>)}</div><div className="tw-plan-badges"><span>Basic overview</span><span>Institution insights</span></div></div></section>

      <section className="tw-flat-section tw-stat-section"><div className="tw-centered-heading"><p className="tw-stat-lead">ThinkWAVE is an interactive learning space that brings engaging activities and meaningful results together for <b>teachers and institutions</b>. Every completed session helps build a clearer picture of learning.</p></div><div className="tw-stat-grid"><Stat value={stats.sessionsCompleted} label="Sessions Completed" c={c}/><Stat value={stats.institutionsEmpowered} label="Institutions Empowered" c={c}/><Stat value={stats.classesCreated} label="Classes Created" c={c}/></div></section>

      <section id="plans" className="tw-flat-section"><div className="tw-centered-heading"><span className="tw-eyebrow">Start where you are</span><h2>Choose your plan</h2></div><div className="tw-plan-grid tw-plan-grid-three"><PlanCard c={c} title="ThinkWAVE Basic" subtitle="Explore core features with essential access" price="₱0" features={["All six templates with Basic question and time limits","Save up to 5 Question Bank items per template","Solo live sessions for up to 45 students","Class folders, assigned work, and core analytics"]} action="Get Started" basic onClick={()=>nav("/register")}/><PlanCard c={c} title="ThinkWAVE Pro" subtitle="Full classroom tools for one individual teacher" price="₱499" pro priceNote="/per month for 1 person" features={["Everything in Basic without template limits","Modified choices, image tools, and full Question Bank access","Solo or group live sessions with expanded capacity","Advanced analytics, PDF and XLSX reports"]} action="Contact Us" onClick={()=>{sessionStorage.setItem("tw_public_from","right");nav("/plan?type=pro")}}/><PlanCard c={c} title="ThinkWAVE Institution" subtitle="Bring full classroom tools to your institution" price="₱999" priceNote="/per month for an institution" highlighted features={["Everything in Pro for institution members","Shared institution privileges for approved teachers","Institution-level administration and teacher management","Thirty-day access after every approved payment"]} action="Contact Us" onClick={()=>{sessionStorage.setItem("tw_public_from","right");nav("/plan?type=institution")}}/></div></section>
    </main>
    <div className="tw-back-top-wrap"><button type="button" className={`tw-back-top ${showBackTop?"visible":""} w-[42px] h-[42px] border border-solid rounded-full grid place-items-center cursor-pointer shadow-[0_12px_28px_rgba(15,23,42,0.14)]`} aria-label="Back to top" onClick={()=>window.scrollTo({top:0,behavior:"smooth"})} style={{background:c.cardBg3,color:c.text,borderColor:c.border}}><TwIcon name="chevronUp" size={21}/></button></div>
    <footer id="footer" className="tw-landing-footer" style={{background:c.cardBg3,borderColor:c.border}}><div><div className="tw-footer-logo"><span style={{color:c.text}}>Think</span><span>WAVE</span></div><p style={{color:c.textMuted}}>Create moments of learning that move with your classroom.</p></div><div className="tw-footer-links"><div><b>Legal</b><span>Privacy</span><span>Terms</span></div><div><b>Links</b><button onClick={()=>scroll("templates")}>Templates</button><button onClick={()=>scroll("plans")}>Plans</button></div><div><b>Contacts</b><span>ThinkWAVE Support</span><span>Philippines</span></div></div><div className="tw-footer-copy" style={{borderColor:c.border,color:c.textMuted}}>© 2026 ThinkWAVE · All Rights Reserved.</div></footer>

    {templatePreview&&createPortal(<div className={`tw-template-preview-backdrop ${previewClosing?"closing":""}`}><div className="tw-template-preview-modal tw-template-preview-simple" style={{background:c.cardBg3,borderColor:c.border,color:c.text,"--tw-template-accent":TEMPLATE_PALETTES[templatePreview]?.accent}} onMouseEnter={keepTemplatePreview} onMouseLeave={closeTemplatePreview}><h2 style={{color:TEMPLATE_PALETTES[templatePreview]?.accent}}>{TEMPLATE_PALETTES[templatePreview]?.label}</h2><div className="tw-template-preview-images tw-template-preview-dual"><div className="tw-template-preview-landscape"><img src={TEMPLATE_IMAGES[templatePreview]?.landscape} alt={`${TEMPLATE_PALETTES[templatePreview]?.label} landscape gameplay preview`}/></div><div className="tw-template-preview-mobile"><img src={TEMPLATE_IMAGES[templatePreview]?.mobile} alt={`${TEMPLATE_PALETTES[templatePreview]?.label} mobile gameplay preview`}/></div></div></div></div>,document.body)}
  </div>
}
function Stat({value,label,c}){return <div className="tw-stat-item p-[25px_12px] grid gap-[7px] relative"><b className="text-[clamp(42px,6vw,70px)] tracking-[-0.055em]" style={{color:c.text}}>{Number(value||0).toLocaleString()}</b><span className="uppercase tracking-[0.12em] text-xs font-black" style={{color:c.textMuted}}>{label}</span></div>}
function PlanCard({c,title,subtitle,price,priceNote,features,action,onClick,highlighted,basic,pro}){return <article className={`tw-plan-card ${highlighted?"featured":""} ${pro?"pro-featured":""}`.trim()} style={{background:c.cardBg,borderColor:highlighted?c.accent:c.border}}><div className="tw-plan-top"><div><h3>{title}</h3><p style={{color:c.textMuted}}>{subtitle}</p></div><div className="tw-plan-price"><strong>{price}</strong>{priceNote&&<small style={{color:c.textMuted}}>{priceNote}</small>}</div></div><hr style={{borderColor:c.border}}/><b>Includes:</b><ul>{features.map(x=><li key={x}><TwIcon name="check" size={17}/>{x}</li>)}</ul><button className={basic?"tw-plan-basic-action":"tw-plan-contact-action"} onClick={onClick}>{action}</button></article>}
