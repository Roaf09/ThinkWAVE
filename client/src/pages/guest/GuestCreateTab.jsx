/* FILE GUIDE:
 * client/src/pages/guest/GuestCreateTab.jsx
 * Purpose: Project source file. Read the file name and exports first, then follow the imported helpers to understand the flow.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000/api";

const ALL_TEMPLATES = [
  { value:"MCQ",              label:"Multiple-choice",  icon:"🔤" },
  { value:"TRUE_FALSE",       label:"True / False",     icon:"✅" },
  { value:"MATCHING",         label:"Matching",         icon:"🔗" },
  { value:"TYPE_ANSWER",      label:"Identification",      icon:"✏️" },
  { value:"GUESS_WORD_4PICS", label:"4Pics 1Word",      icon:"🖼️" },
  { value:"DRAW_IT",          label:"Draw-it",          icon:"🎨" },
  { value:"GRIP_GUESS",       label:"Grip-and-Guess",   icon:"🤝" },
  { value:"THINK_SPELL",      label:"Think-and-Spell",  icon:"🔡" },
];

async function getGuestApi() {
  let token = sessionStorage.getItem("guest_token");
  if (!token) {
    const { data } = await axios.post(`${API_BASE}/auth/guest-token`);
    token = data.token;
    sessionStorage.setItem("guest_token", token);
  }
  localStorage.setItem("qz_token", token);
  localStorage.setItem("qz_role", "TEACHER");
  return axios.create({
    baseURL: API_BASE,
    headers: { Authorization: `Bearer ${token}` },
  });
}

export default function GuestCreateTab({ setActiveTab }) {
  const navigate = useNavigate();
  const [title,        setTitle]        = useState("");
  const [templateType, setTemplateType] = useState("MCQ");
  const [msg,          setMsg]          = useState("");
  const [loading,      setLoading]      = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg(""); setLoading(true);
    try {
      const gApi = await getGuestApi();
      // Store token into regular auth so GuestBuilder works
      const token = sessionStorage.getItem("guest_token");
      localStorage.setItem("qz_token", token);
      localStorage.setItem("qz_role",  "TEACHER");

      const { data } = await gApi.post("/quizzes", {
        title, category:"K12", templateType,
        classId:null, timeLimitSec:30, pointsPerQuestion:1,
        randomizeQuestions:false, shuffleAnswers:false,
      });
      navigate(`/guest/quizzes/${data.id}/builder`);
    } catch (err) {
      setMsg(err?.response?.data?.message || "Failed to create quiz.");
    } finally { setLoading(false); }
  }

  return (
    <div style={s.page}>
      <div style={s.content}>
        <div style={s.header}>
          <h2 style={s.title}>Create a Quiz</h2>
          <p style={s.subtitle}>Give it a name and pick a format — no account needed.</p>
        </div>
        <div style={s.card}>
          <form onSubmit={handleSubmit} style={s.form}>
            <div style={s.field}>
              <label style={s.label}>Quiz Title</label>
              <input value={title} onChange={(e)=>setTitle(e.target.value)}
                placeholder="e.g. Family Trivia Night" required style={s.input} />
            </div>
            <div style={s.field}>
              <label style={s.label}>Question Type</label>
              <div style={s.templateGrid}>
                {ALL_TEMPLATES.map((t)=>(
                  <button key={t.value} type="button"
                    style={{ ...s.templateBtn, ...(templateType===t.value?s.templateBtnActive:{}) }}
                    onClick={()=>setTemplateType(t.value)}>
                    <span style={{ fontSize:18 }}>{t.icon}</span>
                    <span style={{ fontSize:12, fontWeight:600 }}>{t.label}</span>
                  </button>
                ))}
              </div>
            </div>
            {msg && <p style={s.msg}>{msg}</p>}
            <button type="submit" style={s.submitBtn} disabled={loading}>
              {loading ? "Creating…" : "Create & Open Builder →"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

const s = {
  page:    { minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", padding:"40px 24px" },
  content: { width:"100%", maxWidth:520, display:"flex", flexDirection:"column", gap:24 },
  header:  { textAlign:"center" },
  title:   { fontSize:28, fontWeight:900, margin:"0 0 8px", letterSpacing:"-0.5px", color:"#e7e9ee" },
  subtitle:{ fontSize:14, opacity:0.6, margin:0, lineHeight:1.7, color:"#8a9bc4" },
  card:    { background:"#0e1733", border:"1px solid #1e2d55", borderRadius:20, padding:"36px 36px 32px", boxShadow:"0 16px 50px rgba(0,0,0,0.35)" },
  form:    { display:"flex", flexDirection:"column", gap:22 },
  field:   { display:"flex", flexDirection:"column", gap:10 },
  label:   { fontSize:13, fontWeight:700, color:"#8a9bc4" },
  input:   { padding:"13px 16px", borderRadius:12, border:"1px solid #2a3b73", background:"#0d1b2e", color:"#e7e9ee", fontSize:15, width:"100%", boxSizing:"border-box" },
  templateGrid: { display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 },
  templateBtn:  { display:"flex", flexDirection:"column", alignItems:"center", gap:6, padding:"14px 10px", borderRadius:12, border:"1px solid #2a3b73", background:"#121f3d", color:"#8a9bc4", cursor:"pointer", transition:"all 0.15s" },
  templateBtnActive: { border:"1px solid #2b6cff", background:"#1a2952", color:"#e7e9ee" },
  msg:       { fontSize:13, color:"#f87171", background:"#2a0f0f", borderRadius:8, padding:"10px 14px", margin:0 },
  submitBtn: { padding:"15px", borderRadius:14, border:"none", background:"#2b6cff", color:"#fff", fontSize:16, fontWeight:800, cursor:"pointer", boxShadow:"0 4px 20px rgba(43,108,255,0.35)" },
};
