import React, { useEffect, useRef, useState } from "react";
import { TwIcon } from "./TwUI";

export function AudioPlayButton({ src, className="", style }){
  const [playing,setPlaying]=useState(false); const audioRef=useRef(null);
  if(!src) return null;
  function toggle(e){e?.stopPropagation?.(); if(!audioRef.current){audioRef.current=new Audio(src);audioRef.current.onended=()=>setPlaying(false);} if(playing){audioRef.current.pause();audioRef.current.currentTime=0;setPlaying(false);}else{audioRef.current.play().then(()=>setPlaying(true)).catch(()=>{});}}
  useEffect(()=>()=>{audioRef.current?.pause?.()},[]);
  return <button type="button" className={`tw-audio-icon ${className}`.trim()} onClick={toggle} title={playing?"Stop audio":"Play audio"} aria-label={playing?"Stop audio":"Play audio"} style={style}><TwIcon name={playing?"stop":"volume"} size={18}/></button>;
}

export function VoiceRecorderButton({ value, onChange, holdToRecord=false, style }){
  const [recording,setRecording]=useState(false); const recorderRef=useRef(null); const streamRef=useRef(null); const chunksRef=useRef([]);
  async function start(e){e?.preventDefault?.(); if(recording)return; try{const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1}});streamRef.current=stream; const preferred=["audio/webm;codecs=opus","audio/webm","audio/mp4"].find(t=>window.MediaRecorder?.isTypeSupported?.(t)); const rec=new MediaRecorder(stream,preferred?{mimeType:preferred}:undefined);chunksRef.current=[];rec.ondataavailable=event=>{if(event.data?.size)chunksRef.current.push(event.data)};rec.onstop=()=>{const blob=new Blob(chunksRef.current,{type:rec.mimeType||"audio/webm"});const reader=new FileReader();reader.onload=()=>onChange?.(String(reader.result||""));reader.readAsDataURL(blob);stream.getTracks().forEach(t=>t.stop());setRecording(false)};rec.start();recorderRef.current=rec;setRecording(true);}catch{setRecording(false);}}
  function stop(e){e?.preventDefault?.(); if(recorderRef.current?.state==="recording") recorderRef.current.stop();}
  function click(e){if(holdToRecord)return; recording?stop(e):start(e)}
  return <div className="tw-voice-control" style={style}><button type="button" className={`tw-voice-record ${recording?"recording":""} ${value?"has-recording":""}`} onClick={click} onPointerDown={holdToRecord?start:undefined} onPointerUp={holdToRecord?stop:undefined} onPointerCancel={holdToRecord?stop:undefined} title={recording?"Stop recording":value?"Record again":"Record voice"} aria-label={recording?"Stop recording":value?"Record again":"Record voice"}><TwIcon name={recording?"stop":"volume"} size={20}/></button></div>
}
