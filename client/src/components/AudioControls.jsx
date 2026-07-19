import React, { useEffect, useRef, useState } from "react";
import { TwIcon } from "./TwUI";

export function AudioPlayButton({ src, className="", style, title }){
  const [playing,setPlaying]=useState(false); const audioRef=useRef(null);
  if(!src) return null;
  function toggle(e){e?.stopPropagation?.(); if(!audioRef.current){audioRef.current=new Audio(src);audioRef.current.onended=()=>setPlaying(false);} if(playing){audioRef.current.pause();audioRef.current.currentTime=0;setPlaying(false);}else{audioRef.current.play().then(()=>setPlaying(true)).catch(()=>{});}}
  useEffect(()=>()=>{audioRef.current?.pause?.()},[]);
  return <button type="button" className={`tw-audio-icon ${className}`.trim()} onClick={toggle} title={title||(playing?"Stop audio":"Play audio")} aria-label={playing?"Stop audio":"Play audio"} style={style}><span key={playing?"stop":"play"} className="tw-theme-icon-swap"><TwIcon name={playing?"stop":"volume"} size={18}/></span></button>;
}

function visibleText(config={}, prompt="", templateType=""){
  const parts=[String(prompt||"").trim()].filter(Boolean);
  const type=String(templateType||"").toUpperCase();
  if(type==="MCQ"||type==="TRUE_FALSE") (Array.isArray(config.options)?config.options:[]).forEach((row,i)=>{const text=typeof row==="object"?row?.text:row;if(String(text||"").trim())parts.push(`Choice ${i+1}: ${text}`)});
  if(type==="MATCHING"){
    (Array.isArray(config.colA)?config.colA:[]).forEach((row,i)=>{if(row?.text)parts.push(`Column A ${i+1}: ${row.text}`)});
    [...(Array.isArray(config.colB)?config.colB:[]),...(Array.isArray(config.dummyB)?config.dummyB:[])].forEach((row,i)=>{if(row?.text)parts.push(`Column B ${i+1}: ${row.text}`)});
  }
  return parts.join(". ");
}

export function QuestionAudioButton({ config={}, prompt="", templateType="", className="", style }){
  const [playing,setPlaying]=useState(false); const indexRef=useRef(0); const currentRef=useRef(null); const queueRef=useRef([]);
  const recordings=[config.voicePrompt,...(Array.isArray(config.voiceAnswers)?config.voiceAnswers:[])].filter(Boolean);
  const enabled=!!config.textToSpeech||recordings.length>0;
  function stop(){
    window.speechSynthesis?.cancel?.();
    if(currentRef.current){currentRef.current.pause?.();currentRef.current.currentTime=0;currentRef.current=null;}
    queueRef.current=[];indexRef.current=0;setPlaying(false);
  }
  function playNext(){
    const src=queueRef.current[indexRef.current++];
    if(!src){setPlaying(false);currentRef.current=null;return;}
    const audio=new Audio(src);currentRef.current=audio;audio.onended=playNext;audio.onerror=playNext;audio.play().catch(playNext);
  }
  function toggle(e){
    e?.stopPropagation?.(); if(playing){stop();return;}
    setPlaying(true);
    if(config.voiceRecord&&recordings.length){queueRef.current=recordings;indexRef.current=0;playNext();return;}
    const text=visibleText(config,prompt,templateType); if(!text||!window.speechSynthesis){setPlaying(false);return;}
    const utterance=new SpeechSynthesisUtterance(text);currentRef.current=utterance;utterance.rate=.95;utterance.onend=()=>setPlaying(false);utterance.onerror=()=>setPlaying(false);window.speechSynthesis.cancel();window.speechSynthesis.speak(utterance);
  }
  useEffect(()=>stop,[]);
  if(!enabled)return null;
  return <button type="button" className={`tw-audio-icon tw-question-audio ${className}`.trim()} style={style} onClick={toggle} title={playing?"Stop question audio":"Play question audio"} aria-label={playing?"Stop question audio":"Play question audio"}><span key={playing?"stop":"volume"} className="tw-theme-icon-swap"><TwIcon name={playing?"stop":"volume"} size={19}/></span></button>;
}

export function VoiceRecorderButton({ value, onChange, holdToRecord=false, style }){
  const [recording,setRecording]=useState(false); const recorderRef=useRef(null); const streamRef=useRef(null); const chunksRef=useRef([]);
  async function start(e){e?.preventDefault?.(); if(recording)return; try{const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1}});streamRef.current=stream; const preferred=["audio/webm;codecs=opus","audio/webm","audio/mp4"].find(t=>window.MediaRecorder?.isTypeSupported?.(t)); const rec=new MediaRecorder(stream,preferred?{mimeType:preferred}:undefined);chunksRef.current=[];rec.ondataavailable=event=>{if(event.data?.size)chunksRef.current.push(event.data)};rec.onstop=()=>{const blob=new Blob(chunksRef.current,{type:rec.mimeType||"audio/webm"});const reader=new FileReader();reader.onload=()=>onChange?.(String(reader.result||""));reader.readAsDataURL(blob);stream.getTracks().forEach(t=>t.stop());setRecording(false)};rec.start();recorderRef.current=rec;setRecording(true);}catch{setRecording(false);}}
  function stop(e){e?.preventDefault?.(); if(recorderRef.current?.state==="recording") recorderRef.current.stop();}
  function click(e){if(holdToRecord)return; recording?stop(e):start(e)}
  return <div className="tw-voice-control" style={style}><button type="button" className={`tw-voice-record ${recording?"recording":""} ${value?"has-recording":""}`} onClick={click} onPointerDown={holdToRecord?start:undefined} onPointerUp={holdToRecord?stop:undefined} onPointerCancel={holdToRecord?stop:undefined} title={recording?"Stop recording":value?"Record again":"Record voice"} aria-label={recording?"Stop recording":value?"Record again":"Record voice"}><TwIcon name={recording?"stop":"volume"} size={20}/></button></div>
}
