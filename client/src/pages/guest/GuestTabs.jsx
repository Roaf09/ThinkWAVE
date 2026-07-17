/* FILE GUIDE:
 * client/src/pages/guest/GuestTabs.jsx
 * Purpose: Project source file. Read the file name and exports first, then follow the imported helpers to understand the flow.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API_BASE } from "../../lib/api";

const ALL_TEMPLATES = [
  { value:"MCQ",              label:"Multiple-choice", icon:"🔤" },
  { value:"TRUE_FALSE",       label:"True / False",    icon:"✅" },
  { value:"MATCHING",         label:"Matching",        icon:"🔗" },
  { value:"TYPE_ANSWER",      label:"Identification",     icon:"✏️" },
  { value:"GUESS_WORD_4PICS", label:"4Pics 1Word",     icon:"🖼️" },
  { value:"DRAW_IT",          label:"Draw-it",         icon:"🎨" },
  { value:"GRIP_GUESS",       label:"Grip-and-Guess",  icon:"🤝" },
  { value:"THINK_SPELL",      label:"Think and Spell", icon:"🔡" },
];

// Get or create a guest API client with a temporary token
async function getGuestApi() {
  let token = sessionStorage.getItem("guest_token");
  if (!token) {
    const { data } = await axios.post(`${API_BASE}/api/auth/guest-token`);
    token = data.token;
    sessionStorage.setItem("guest_token", token);
  }
  return axios.create({
    baseURL: `${API_BASE}/api`,
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
      const guestApi = await getGuestApi();
      const { data } = await guestApi.post("/quizzes", {
        title, category:"K12", templateType,
        classId:null, timeLimitSec:30,
        pointsPerQuestion:1, randomizeQuestions:false, shuffleAnswers:false,
      });
      // Store the guest token in regular auth so QuizBuilder works
      const token = sessionStorage.getItem("guest_token");
      localStorage.setItem("qz_token",  token);
      localStorage.setItem("qz_role",   "TEACHER"); // treated as teacher for builder
      navigate(`/teacher/quizzes/${data.id}/builder`);
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

// ─── GuestLiveTab ─────────────────────────────────────────────────────────────
export function GuestLiveTab({ setActiveTab }) {
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createdSession, setCreatedSession] = useState(null);
  const [msg, setMsg] = useState("");
  const { QRCodeCanvas } = require("qrcode.react");

  useEffect(() => {
    (async () => {
      try {
        const gApi = await getGuestApi();
        const { data } = await gApi.get("/quizzes");
        setQuizzes(data || []);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  async function hostLive(quizId) {
    setMsg(""); setCreatedSession(null);
    try {
      const gApi = await getGuestApi();
      const { data } = await gApi.post("/sessions", { quizId });
      setCreatedSession(data);
      setMsg("Session ready!");
    } catch (err) { setMsg(err?.response?.data?.message || "Failed."); }
  }

  if (loading) return <div className="container"><div className="card">Loading…</div></div>;

  return (
    <div className="container">
      <h2 style={{ marginBottom:4 }}>Live Sessions</h2>
      <p style={{ opacity:0.55, marginTop:0, marginBottom:20, fontSize:14 }}>
        Publish a quiz to host it live.
      </p>
      {msg && <p><small>{msg}</small></p>}
      {createdSession && (
        <div className="card" style={{ marginBottom:16, background:"#0f2a1a", borderColor:"#14532d" }}>
          <h3 style={{ margin:"0 0 10px", color:"#86efac" }}>Session Ready</h3>
          <div style={{ display:"flex", alignItems:"center", gap:20, flexWrap:"wrap" }}>
            <div>
              <div>Join Code: <span className="badge">{createdSession.joinCode}</span></div>
              <div style={{ marginTop:8 }}>
                <a className="badge" href={`/teacher/sessions/${createdSession.id}/live`}>Open Host Panel →</a>
              </div>
            </div>
            <div style={{ background:"white", padding:10, borderRadius:12 }}>
              <QRCodeCanvas value={`${window.location.origin}/play?code=${createdSession.joinCode}`} size={96} />
            </div>
          </div>
        </div>
      )}
      {quizzes.length===0 && (
        <div className="card" style={{ opacity:0.6 }}>
          No quizzes yet. Go to <button className="btn secondary" style={{ padding:"2px 8px", fontSize:13 }} onClick={()=>setActiveTab("create")}>Create</button> to make one.
        </div>
      )}
      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
        {quizzes.map((q)=>(
          <div key={q.id} className="card">
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <div style={{ fontWeight:700 }}>{q.title}</div>
                <div style={{ fontSize:12, opacity:0.55 }}>{q.template_type} · {q.status}</div>
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <button className="btn secondary" onClick={()=>navigate(`/teacher/quizzes/${q.id}/builder`)}>✏ Edit</button>
                <button className="btn" disabled={q.status!=="PUBLISHED"}
                  style={q.status!=="PUBLISHED"?{background:"#1a2540",color:"#4a5a8a",cursor:"not-allowed",boxShadow:"none"}:{}}
                  onClick={()=>hostLive(q.id)}>▶ Host Live</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── GuestHistoryTab ──────────────────────────────────────────────────────────
export function GuestHistoryTab() {
  const [sessions, setSessions] = useState([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const gApi = await getGuestApi();
        const { data } = await gApi.get("/sessions/history");
        setSessions(data || []);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  const fmtDate=(d)=>d?new Date(d).toLocaleString("en-PH",{dateStyle:"medium",timeStyle:"short"}):"—";

  if (loading) return <div className="container"><div className="card">Loading…</div></div>;

  return (
    <div className="container">
      <h2>Session History</h2>
      {sessions.length===0 && <div className="card" style={{ opacity:0.6 }}>No completed sessions yet.</div>}
      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
        {sessions.map((s)=>(
          <div key={s.id} className="card">
            <div style={{ fontWeight:700 }}>{s.quiz_title}</div>
            <div style={{ marginTop:6, display:"flex", gap:8, flexWrap:"wrap" }}>
              <span className="badge">👥 {s.participant_count}</span>
              <span className="badge">❓ {s.question_count} questions</span>
              <span className="badge">🕒 {fmtDate(s.ended_at)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const s = {
  page:    { minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", padding:"40px 24px" },
  content: { width:"100%", maxWidth:520, display:"flex", flexDirection:"column", gap:24 },
  header:  { textAlign:"center" },
  title:   { fontSize:28, fontWeight:900, margin:"0 0 8px", letterSpacing:"-0.5px" },
  subtitle:{ fontSize:14, opacity:0.6, margin:0, lineHeight:1.7 },
  card:    { background:"#0e1733", border:"1px solid #1e2d55", borderRadius:20, padding:"36px 36px 32px", boxShadow:"0 16px 50px rgba(0,0,0,0.35)" },
  form:    { display:"flex", flexDirection:"column", gap:22 },
  field:   { display:"flex", flexDirection:"column", gap:10 },
  label:   { fontSize:13, fontWeight:700, opacity:0.8 },
  input:   { padding:"13px 16px", borderRadius:12, border:"1px solid #2a3b73", background:"#0b1530", color:"#e7e9ee", fontSize:15, width:"100%", boxSizing:"border-box" },
  templateGrid: { display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 },
  templateBtn:  { display:"flex", flexDirection:"column", alignItems:"center", gap:6, padding:"14px 10px", borderRadius:12, border:"1px solid #2a3b73", background:"#121f3d", color:"#8a9bc4", fontSize:12, fontWeight:600, cursor:"pointer", transition:"all 0.15s" },
  templateBtnActive: { border:"1px solid #2b6cff", background:"#1a2952", color:"#e7e9ee" },
  msg:       { fontSize:13, color:"#f87171", background:"#2a0f0f", borderRadius:8, padding:"10px 14px", margin:0 },
  submitBtn: { padding:"15px", borderRadius:14, border:"none", background:"#2b6cff", color:"#fff", fontSize:16, fontWeight:800, cursor:"pointer", boxShadow:"0 4px 20px rgba(43,108,255,0.35)" },
};
