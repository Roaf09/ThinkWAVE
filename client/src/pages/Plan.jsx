import React, { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useColors, useTheme } from "../context/ThemeContext";
import { TwIcon } from "../components/TwUI";
import ThemeIconButton from "../components/ThemeIconButton";

const benefits=[
  "Unlimited access to all six interactive templates",
  "Group and solo live sessions with expanded capacity",
  "Full Question Bank, image tools, and modified activities",
  "Detailed analytics, tab monitoring, and downloadable reports",
  "One institution space for administrators and teachers",
];
const countries=["Philippines","Australia","Canada","Germany","India","Indonesia","Japan","Malaysia","New Zealand","Singapore","South Korea","Thailand","United Arab Emirates","United Kingdom","United States","Other"];
const roles=["School administrator","Institution owner or director","Principal or school head","Academic coordinator","Department head","Teacher or instructor","IT or systems administrator","Other"];

export default function Plan(){
  const c=useColors(); const {dark,toggleTheme}=useTheme();
  const [form,setForm]=useState({firstName:"",lastName:"",workEmail:"",country:"Philippines",role:"",phone:""});
  const [status,setStatus]=useState({type:"",message:""}); const [sending,setSending]=useState(false);
  const set=(key,value)=>setForm(f=>({...f,[key]:value}));
  async function submit(e){e.preventDefault();setSending(true);setStatus({type:"",message:""});try{await api.post("/public/institution-applications",form);setStatus({type:"ok",message:"Thank you! Your institution request has been sent to the ThinkWAVE team."});setForm({firstName:"",lastName:"",workEmail:"",country:"Philippines",role:"",phone:""});}catch(err){setStatus({type:"error",message:err?.response?.data?.message||"The request could not be submitted. Please try again."});}finally{setSending(false)}}
  return <div className="tw-plan-page" style={{background:c.pageBg,color:c.text}}>
    <header className="tw-plan-page-header"><Link to="/" className="tw-public-logo"><span style={{color:c.text}}>Think</span><span>WAVE</span></Link><ThemeIconButton dark={dark} onClick={toggleTheme} style={{color:c.text,borderColor:c.border,background:c.cardBg}}/></header>
    <main className="tw-plan-page-main">
      <section className="tw-plan-page-copy"><span className="tw-eyebrow">Institution Plan</span><h1>Unlock ThinkWAVE for your school or institution</h1><p style={{color:c.textMuted}}>Give teachers more ways to create, connect, and understand learning—while keeping your institution organized in one shared space.</p><div className="tw-plan-benefits">{benefits.map(item=><div key={item}><span><TwIcon name="check" size={18}/></span><p>{item}</p></div>)}</div>
      <div className="tw-plan-contact-note" style={{background:c.cardBg,borderColor:c.border}}><TwIcon name="mail"/><div><b>Tell us about your institution</b><small style={{color:c.textMuted}}>A ThinkWAVE representative can review your request and guide you through the next steps.</small></div></div></section>
      <form className="tw-plan-application" onSubmit={submit} style={{background:c.cardBg3,borderColor:c.border}}><div><span className="tw-eyebrow">Contact form</span><h2>Let’s start the conversation.</h2></div><div className="tw-plan-form-grid">
        <Field label="First name" c={c}><input required value={form.firstName} onChange={e=>set("firstName",e.target.value)} /></Field>
        <Field label="Last name" c={c}><input required value={form.lastName} onChange={e=>set("lastName",e.target.value)} /></Field>
        <Field label="Work email" c={c} wide><input type="email" required value={form.workEmail} onChange={e=>set("workEmail",e.target.value)} /></Field>
        <Field label="Country" c={c}><select required value={form.country} onChange={e=>set("country",e.target.value)}>{countries.map(x=><option key={x}>{x}</option>)}</select></Field>
        <Field label="Phone number" c={c}><input type="tel" required value={form.phone} onChange={e=>set("phone",e.target.value)} /></Field>
        <Field label="Which of the following best describes your role?" c={c} wide><select required value={form.role} onChange={e=>set("role",e.target.value)}><option value="">Select your role</option>{roles.map(x=><option key={x}>{x}</option>)}</select></Field>
      </div>{status.message&&<div className={`tw-plan-form-status ${status.type}`} style={{color:status.type==="ok"?c.greenFg:c.redFg,background:status.type==="ok"?c.greenBg:c.redBg,borderColor:status.type==="ok"?c.greenBorder:c.redBorder}}>{status.type==="ok"&&<TwIcon name="check" size={18}/>} {status.message}</div>}<button className="tw-plan-submit" disabled={sending}>{sending?"Submitting…":"Submit"}<TwIcon name="arrow" size={18}/></button></form>
    </main>
  </div>
}
function Field({label,c,wide,children}){return <label className={wide?"wide":""} style={{color:c.textMuted}}><span>{label} *</span>{React.cloneElement(children,{style:{background:c.inputBg,color:c.text,borderColor:c.inputBorder}})}</label>}
