import React from "react";
import { useColors } from "../context/ThemeContext";

export function LineChart({ values=[], labels=[], height=190 }){
  const c=useColors(); const clean=(values.length?values:[0]).map(v=>Number(v||0)); const max=Math.max(1,...clean); const w=620,h=height,p=24;
  const points=clean.map((v,i)=>{const x=p+(i*(w-p*2))/Math.max(1,clean.length-1);const y=h-p-(v/max)*(h-p*2);return `${x},${y}`}).join(" ");
  return <div className="tw-chart-wrap"><svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Line chart"><defs><linearGradient id="twLineFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={c.accent} stopOpacity=".28"/><stop offset="1" stopColor={c.accent} stopOpacity="0"/></linearGradient></defs><line x1={p} y1={h-p} x2={w-p} y2={h-p} stroke={c.border}/><polygon points={`${p},${h-p} ${points} ${w-p},${h-p}`} fill="url(#twLineFill)"/><polyline points={points} fill="none" stroke={c.accent} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>{clean.map((v,i)=>{const [x,y]=points.split(" ")[i].split(",");return <circle key={i} cx={x} cy={y} r="5" fill={c.cardBg} stroke={c.accent} strokeWidth="4"/>})}</svg><div className="tw-chart-labels">{labels.map((label,i)=><span key={`${label}-${i}`}>{label}</span>)}</div></div>
}

export function DonutChart({ data=[], centerLabel="Accounts" }){
  const c=useColors(); const total=Math.max(1,data.reduce((s,x)=>s+Number(x.value||0),0)); let offset=0; const colors=[c.accent,"#8b5cf6","#14b8a6","#f59e0b"];
  return <div className="tw-donut-layout"><div className="tw-donut" style={{background:`conic-gradient(${data.map((item,i)=>{const start=offset;offset+=(Number(item.value||0)/total)*100;return `${colors[i%colors.length]} ${start}% ${offset}%`}).join(",")})`}}><div style={{background:c.cardBg}}><b>{total===1&&data.every(x=>!Number(x.value))?0:total}</b><span>{centerLabel}</span></div></div><div className="tw-donut-legend">{data.map((item,i)=><div key={item.label}><span style={{background:colors[i%colors.length]}}/><b>{item.label}</b><em>{Number(item.value||0).toLocaleString()}</em></div>)}</div></div>
}

export function BarChart({ data=[], height=180 }){
  const c=useColors(); const max=Math.max(1,...data.map(x=>Number(x.value||0)));
  return <div className="tw-bar-chart" style={{height}}>{data.map((item,i)=><div key={`${item.label}-${i}`}><span className="tw-bar-value">{item.value}</span><i style={{height:`${Math.max(5,(Number(item.value||0)/max)*100)}%`,background:i%2?"#8b5cf6":c.accent}}/><small>{item.label}</small></div>)}</div>
}

export function DualLineChart({ seriesA=[], seriesB=[], labels=[], labelA="Live", labelB="Assigned", height=190 }){
  const c=useColors();
  const a=(seriesA.length?seriesA:[0]).map(v=>Number(v||0));
  const b=(seriesB.length?seriesB:[0]).map(v=>Number(v||0));
  const count=Math.max(a.length,b.length,1);
  const aa=Array.from({length:count},(_,i)=>a[i]||0);
  const bb=Array.from({length:count},(_,i)=>b[i]||0);
  const max=Math.max(1,...aa,...bb); const w=620,h=height,p=24;
  const allZero=aa.every(v=>v===0)&&bb.every(v=>v===0);
  const makePoints=(values,zeroOffset=0)=>values.map((v,i)=>{const x=p+(i*(w-p*2))/Math.max(1,count-1);const y=allZero?(h-p-zeroOffset):(h-p-(v/max)*(h-p*2));return `${x},${y}`}).join(" ");
  const pa=makePoints(aa,14),pb=makePoints(bb,29);
  return <div className="tw-chart-wrap tw-dual-line-chart"><svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${labelA} and ${labelB} line chart`}><line x1={p} y1={h-p} x2={w-p} y2={h-p} stroke={c.border}/><polyline points={pa} fill="none" stroke={c.accent} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/><polyline points={pb} fill="none" stroke="#8b5cf6" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>{aa.map((_,i)=>{const [x,y]=pa.split(" ")[i].split(",");return <circle key={`a-${i}`} cx={x} cy={y} r="4.5" fill={c.cardBg} stroke={c.accent} strokeWidth="3"/>})}{bb.map((_,i)=>{const [x,y]=pb.split(" ")[i].split(",");return <circle key={`b-${i}`} cx={x} cy={y} r="4.5" fill={c.cardBg} stroke="#8b5cf6" strokeWidth="3"/>})}</svg><div className="tw-chart-labels">{labels.map((label,i)=><span key={`${label}-${i}`}>{label}</span>)}</div><div className="tw-dual-line-legend"><span><i style={{background:c.accent}}/>{labelA}</span><span><i style={{background:"#8b5cf6"}}/>{labelB}</span></div></div>;
}
