import React,{useEffect,useMemo,useState}from"react";
import{createPortal}from"react-dom";
import{useLocation}from"react-router-dom";

const PUBLIC_STAR_PATHS=["/","/plan","/login","/register","/student-login","/superadmin-login","/superadmin-register","/verify","/forgot-password"];

export default function StarField(){
 const loc=useLocation();
 const enabled=PUBLIC_STAR_PATHS.includes(loc.pathname);
 const[target,setTarget]=useState(null);
 const stars=useMemo(()=>Array.from({length:92},(_,i)=>{
  const rand=(n)=>{const x=Math.sin((i+1)*n)*43758.5453;return x-Math.floor(x)};
  return {id:i,x:rand(12.9898)*100,y:rand(78.233)*100,size:.7+rand(31.41)*2.25,delay:-rand(19.19)*12,duration:4.5+rand(47.77)*9,driftX:(rand(8.13)-.5)*70,driftY:18+rand(22.71)*85,depth:.18+rand(61.3)*.95};
 }),[]);
 const[scroll,setScroll]=useState(0);const[fade,setFade]=useState(1);
 useEffect(()=>{if(!enabled){setTarget(null);return;}let raf=requestAnimationFrame(()=>setTarget(document.querySelector(".tw-starry-page")));return()=>cancelAnimationFrame(raf)},[enabled,loc.pathname,loc.search]);
 useEffect(()=>{if(!enabled)return;const update=()=>{const y=window.scrollY||0;setScroll(y);if(loc.pathname!=="/"){setFade(1);return;}const templates=document.getElementById("templates");const start=templates?Math.max(280,templates.offsetTop-window.innerHeight*.35):700;const end=templates?templates.offsetTop+templates.offsetHeight*.9:1300;setFade(y<=start?1:Math.max(0,1-(y-start)/Math.max(220,end-start)));};update();window.addEventListener("scroll",update,{passive:true});window.addEventListener("resize",update);return()=>{window.removeEventListener("scroll",update);window.removeEventListener("resize",update)}} ,[enabled,loc.pathname]);
 if(!enabled||!target)return null;
 return createPortal(<div className="tw-star-field" aria-hidden="true" style={{"--star-fade":fade}}>{stars.map(s=><i key={s.id} style={{left:`${s.x}%`,top:`${s.y}%`,width:s.size,height:s.size,"--delay":`${s.delay}s`,"--duration":`${s.duration}s`,"--drift-x":`${s.driftX}px`,"--drift-y":`${s.driftY}px`,"--parallax":`${scroll*s.depth*.1}px`}}/>)}</div>,target);
}
