/* FILE GUIDE:
 * client/src/pages/guest/GuestBuilder.jsx
 * Purpose: Project source file. Read the file name and exports first, then follow the imported helpers to understand the flow.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000/api";

async function getGuestApi() {
  let token = sessionStorage.getItem("guest_token");
  if (!token) {
    const { data } = await axios.post(`${API_BASE}/auth/guest-token`);
    token = data.token;
    sessionStorage.setItem("guest_token", token);
  }
  return axios.create({ baseURL: API_BASE, headers: { Authorization: `Bearer ${token}` } });
}

// Duplicate detector
function similarity(a, b) {
  const wa = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const wb = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  if (!wa.size || !wb.size) return 0;
  const inter = [...wa].filter(w => wb.has(w));
  return inter.length / Math.max(wa.size, wb.size);
}
function findDuplicates(questions) {
  const dupes = [];
  for (let i=0;i<questions.length;i++)
    for (let j=i+1;j<questions.length;j++) {
      const score = similarity(questions[i].prompt||"", questions[j].prompt||"");
      if (score >= 0.70) dupes.push({i:i+1,j:j+1,score:Math.round(score*100)});
    }
  return dupes;
}

export default function GuestBuilder() {
  const { id }   = useParams();
  const navigate = useNavigate();

  const [quiz,         setQuiz]         = useState(null);
  const [questions,    setQuestions]    = useState([]);
  const [qIndex,       setQIndex]       = useState(0);
  const [settings,     setSettings]     = useState({ randomizeQuestions:false, shuffleAnswers:false });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modal,        setModal]        = useState(null);
  const [msg,          setMsg]          = useState("");
  const [dupeList,     setDupeList]     = useState([]);

  const load = useCallback(async () => {
    try {
      const gApi = await getGuestApi();
      const { data } = await gApi.get(`/quizzes/${id}`);
      setQuiz(data.quiz);
      setSettings({ randomizeQuestions:!!data.quiz.randomize_questions, shuffleAnswers:!!data.quiz.shuffle_answers });
      setQuestions((data.questions||[]).map(q=>({
        id:q.id, order:q.question_order, prompt:q.prompt,
        config:safeJson(q.config_json)||{}, correct:safeJson(q.correct_json)||{},
        timeLimitSec: (safeJson(q.config_json)||{}).timeLimitSec ?? (data.quiz.time_limit_sec||30),
        points:       (safeJson(q.config_json)||{}).points       ?? 1,
      })));
    } catch {}
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function saveSettingsApi(next) {
    try {
      const gApi = await getGuestApi();
      await gApi.put(`/quizzes/${id}/settings`, { timeLimitSec:30, pointsPerQuestion:1, ...next });
    } catch {}
  }

  function addQuestion() {
    const newQ = { order:questions.length, prompt:"", config:defaultConfig(quiz?.template_type,quiz?.category), correct:defaultCorrect(quiz?.template_type), timeLimitSec:30, points:1 };
    setQuestions(qs=>[...qs,newQ]);
    setQIndex(questions.length);
  }

  function deleteCurrentQuestion() {
    if (!questions.length) return;
    if (!window.confirm("Delete this question?")) return;
    setQuestions(qs=>qs.filter((_,i)=>i!==qIndex).map((q,i)=>({...q,order:i})));
    setQIndex(i=>Math.max(0,i-1));
  }

  function updateQ(patch) {
    setQuestions(qs=>{ const next=[...qs]; next[qIndex]={...next[qIndex],...patch}; return next; });
  }

  function prepareForSave() {
    return questions.map(q=>({ ...q, config:{ ...q.config, timeLimitSec:q.timeLimitSec, points:q.points } }));
  }

  async function save() {
    const dupes = findDuplicates(questions);
    if (dupes.length) { setDupeList(dupes); setModal("duplicates"); return; }
    await _doSave();
  }

  async function _doSave() {
    try {
      const gApi = await getGuestApi();
      await gApi.put(`/quizzes/${id}/questions`, { questions:prepareForSave() });
      setModal("saved");
    } catch (e) { setMsg(e?.response?.data?.message||"Save failed."); }
  }

  async function publish() {
    const dupes = findDuplicates(questions);
    if (dupes.length) { setDupeList(dupes); setModal("duplicates"); return; }
    try {
      const gApi = await getGuestApi();
      await gApi.put(`/quizzes/${id}/questions`, { questions:prepareForSave() });
      await gApi.post(`/quizzes/${id}/publish`);
      setModal("published"); load();
    } catch (e) { setMsg(e?.response?.data?.message||"Publish failed."); }
  }

  async function deleteQuiz() {
    try {
      const gApi = await getGuestApi();
      await gApi.delete(`/quizzes/${id}`);
      setModal("deleted");
      setTimeout(()=>navigate("/guest"),1800);
    } catch { setMsg("Delete failed."); }
  }

  if (!quiz||!settings) return <div className="container"><div className="card">Loading...</div></div>;

  const currentQ = questions[qIndex]||null;
  const totalQ   = questions.length;

  return (
    <>
      {modal && <div style={styles.blurOverlay}/>}
      <div style={styles.page}>
        {/* Top bar */}
        <div style={styles.topBar}>
          <div style={{ display:"flex", alignItems:"center", gap:14 }}>
            <button style={styles.backBtn} onClick={()=>navigate("/guest")}>← Back</button>
            <div>
              <div style={{ fontWeight:800, fontSize:17 }}>{quiz.title}</div>
              <div style={{ fontSize:12, opacity:0.5 }}>{quiz.template_type} · {quiz.status}</div>
            </div>
          </div>
          <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
            <button className="btn secondary" style={{ color:"#f87171", borderColor:"#7f1d1d" }}
              onClick={()=>setModal("confirmDelete")}>🗑 Delete Quiz</button>
            <button className="btn secondary"
              style={settingsOpen?{background:"#1a2a52",color:"#e7e9ee"}:{}}
              onClick={()=>setSettingsOpen(v=>!v)}>
              ⚙ Settings {settingsOpen?"▲":"▼"}
            </button>
            <button className="btn secondary" onClick={addQuestion}>＋ Add Question</button>
            <button className="btn secondary" onClick={save}>💾 Save</button>
            <button className="btn" onClick={publish} disabled={quiz.status==="PUBLISHED"}>✓ Publish</button>
          </div>
        </div>

        {msg && <div style={{ padding:"6px 24px", fontSize:13, opacity:0.7 }}>{msg}</div>}

        {/* Settings — only randomize + shuffle */}
        {settingsOpen && (
          <div style={styles.settingsPanel}>
            <div style={styles.settingsPanelInner}>
              <label style={styles.checkLabel}>
                <input type="checkbox" checked={settings.randomizeQuestions}
                  onChange={e=>{ const next={...settings,randomizeQuestions:e.target.checked}; setSettings(next); saveSettingsApi(next); }} />
                Randomize question order
              </label>
              <label style={styles.checkLabel}>
                <input type="checkbox" checked={settings.shuffleAnswers}
                  onChange={e=>{ const next={...settings,shuffleAnswers:e.target.checked}; setSettings(next); saveSettingsApi(next); }} />
                Shuffle answer choices
              </label>
            </div>
          </div>
        )}

        {/* Pager */}
        <div style={styles.pagerBar}>
          <button style={{ ...styles.pagerBtn, visibility:qIndex===0?"hidden":"visible" }} onClick={()=>setQIndex(i=>i-1)}>‹ Previous</button>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:15, fontWeight:700 }}>{totalQ===0?"No questions yet":`Question ${qIndex+1} of ${totalQ}`}</div>
          </div>
          <button style={{ ...styles.pagerBtn, visibility:qIndex===totalQ-1?"hidden":"visible" }} onClick={()=>setQIndex(i=>i+1)}>Next ›</button>
        </div>

        {/* Editor */}
        <div style={styles.editorArea}>
          {totalQ===0 && (
            <div style={styles.emptyCard}>
              <div style={{ fontSize:40, marginBottom:12 }}>📝</div>
              <div style={{ fontWeight:700, fontSize:16, marginBottom:6 }}>No questions yet</div>
              <div style={{ fontSize:14, opacity:0.55 }}>Click <b>＋ Add Question</b> above to get started.</div>
            </div>
          )}
          {currentQ && (
            <div style={styles.questionCard}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                <span style={{ fontWeight:800, fontSize:16, color:"#60a5fa" }}>Question {qIndex+1}</span>
                <button className="btn secondary"
                  style={{ padding:"6px 12px", fontSize:12, color:"#f87171", borderColor:"#7f1d1d" }}
                  onClick={deleteCurrentQuestion}>🗑 Delete</button>
              </div>

              {/* Per-question timer + points */}
              <div style={{ display:"flex", gap:16, marginBottom:16, flexWrap:"wrap" }}>
                <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                  <label style={{ fontSize:12, opacity:0.7, fontWeight:600 }}>Time limit (sec)</label>
                  <input type="number" min={5} max={600} value={currentQ.timeLimitSec??30}
                    onChange={e=>updateQ({timeLimitSec:Number(e.target.value)})}
                    style={{ width:90, padding:"8px 10px", borderRadius:10, border:"1px solid #2a3b73", background:"#0d1b2e", color:"#e7e9ee", fontSize:14 }} />
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                  <label style={{ fontSize:12, opacity:0.7, fontWeight:600 }}>Points <span style={{ opacity:0.5 }}>(1–10)</span></label>
                  <input type="number" min={1} max={10} value={currentQ.points??1}
                    onChange={e=>updateQ({points:Math.min(10,Math.max(1,Number(e.target.value)))})}
                    style={{ width:80, padding:"8px 10px", borderRadius:10, border:"1px solid #2a3b73", background:"#0d1b2e", color:"#e7e9ee", fontSize:14 }} />
                </div>
              </div>

              <label style={styles.fieldLabel}>
                Prompt <span style={{ fontSize:11, opacity:0.45, marginLeft:8 }}>{(currentQ.prompt||"").length}/255</span>
              </label>
              <textarea rows={4} maxLength={255} value={currentQ.prompt}
                onChange={e=>updateQ({prompt:e.target.value})}
                style={styles.textarea} />

              <SimpleTemplateEditor
                templateType={quiz.template_type} category={quiz.category}
                q={currentQ} onChange={updateQ} />
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {modal==="saved"         && <GModal icon="💾" title="Progress Saved"  message="Saved successfully." onClose={()=>setModal(null)} />}
      {modal==="published"     && <GModal icon="✓"  title="Quiz Published!" message="Your quiz is ready to host live." onClose={()=>setModal(null)} />}
      {modal==="deleted"       && <GModal icon="🗑" title="Quiz Deleted"    message="Returning to guest dashboard…" onClose={()=>{}} />}
      {modal==="confirmDelete" && (
        <GModal icon="⚠" title="Delete Quiz?" message={`Delete "${quiz.title}"? Cannot be undone.`} onClose={()=>setModal(null)}
          actions={<><button className="btn secondary" onClick={()=>setModal(null)}>Cancel</button><button className="btn" style={{background:"#dc2626"}} onClick={deleteQuiz}>Yes, Delete</button></>} />
      )}
      {modal==="duplicates" && (
        <GModal icon="⚠" title="Duplicate Questions Detected"
          message={<div>{dupeList.map((d,i)=><div key={i} style={{ background:"#2a2010",borderRadius:8,padding:"8px 12px",marginBottom:8,fontSize:13 }}><strong style={{ color:"#fcd34d" }}>Q{d.i} and Q{d.j}</strong><span style={{ opacity:0.65 }}> — {d.score}% similar</span></div>)}</div>}
          onClose={()=>setModal(null)}
          actions={<><button className="btn secondary" onClick={()=>setModal(null)}>Review Questions</button><button className="btn" onClick={()=>{ setModal(null); _doSave(); }}>Save Anyway</button></>} />
      )}
    </>
  );
}

function GModal({ icon, title, message, onClose, actions }) {
  return (
    <div style={styles.modalWrap}>
      <div style={styles.modalCard}>
        <div style={{ fontSize:36, marginBottom:12 }}>{icon}</div>
        <h3 style={{ margin:"0 0 10px" }}>{title}</h3>
        <div style={{ margin:"0 0 20px" }}>
          {typeof message==="string" ? <p style={{ opacity:0.75, fontSize:14, lineHeight:1.6, margin:0 }}>{message}</p> : message}
        </div>
        {actions||<button className="btn" onClick={onClose} style={{ width:"100%" }}>OK</button>}
      </div>
    </div>
  );
}

// Minimal template editor — same logic as teacher QuizBuilder's TemplateEditor
function SimpleTemplateEditor({ templateType, category, q, onChange }) {
  const cfg = q.config||{};
  const cor = q.correct||{};
  if (templateType==="MCQ") {
    const opts = Array.isArray(cfg.options)?cfg.options:(category==="K12"?["","",""]:["","","",""]);
    return (
      <div style={{ marginTop:16 }} className="card">
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
          <h4 style={{ margin:0 }}>Multiple Choice ({opts.length})</h4>
          <div style={{ display:"flex",gap:8 }}>
            <button className="btn secondary" style={{ padding:"4px 10px",fontSize:12 }} disabled={opts.length<=2}
              onClick={()=>onChange({config:{...cfg,options:opts.slice(0,-1)},correct:{...cor,choice:opts.slice(0,-1).includes(cor.choice)?cor.choice:opts[0]}})}>− Remove</button>
            <button className="btn secondary" style={{ padding:"4px 10px",fontSize:12 }} disabled={opts.length>=10}
              onClick={()=>onChange({config:{...cfg,options:[...opts,""]},correct:cor})}>+ Add</button>
          </div>
        </div>
        {opts.map((o,i)=>(
          <div key={i} style={{ display:"flex",gap:8,alignItems:"center",marginBottom:8 }}>
            <span style={{ fontSize:13,fontWeight:700,color:"#60a5fa",width:24,textAlign:"center" }}>{String.fromCharCode(65+i)}</span>
            <input maxLength={255} value={o} placeholder={`Option ${String.fromCharCode(65+i)}`}
              onChange={e=>{const next=[...opts];next[i]=e.target.value;onChange({config:{...cfg,options:next},correct:{...cor,choice:cor.choice||next[0]}});}}
              style={{ flex:1,padding:"9px 12px",borderRadius:10,border:"1px solid #2a3b73",background:"#0b1530",color:"#e7e9ee",fontSize:14 }} />
          </div>
        ))}
        <label style={{ fontSize:12,opacity:0.7,display:"block",marginBottom:6 }}>Correct answer</label>
        <select value={cor.choice??""} onChange={e=>onChange({correct:{...cor,choice:e.target.value}})}
          style={{ padding:"8px 12px",borderRadius:10,border:"1px solid #2a3b73",background:"#0b1530",color:"#e7e9ee",fontSize:14 }}>
          {opts.map((o,i)=><option key={i} value={o}>{String.fromCharCode(65+i)}: {o||"(empty)"}</option>)}
        </select>
      </div>
    );
  }
  if (templateType==="TRUE_FALSE") {
    return (
      <div style={{ marginTop:16 }} className="card">
        <h4 style={{ margin:"0 0 10px" }}>True / False</h4>
        <select value={cor.choice??"True"} onChange={e=>onChange({config:{...cfg,options:["True","False"]},correct:{...cor,choice:e.target.value}})}
          style={{ padding:"8px 12px",borderRadius:10,border:"1px solid #2a3b73",background:"#0b1530",color:"#e7e9ee",fontSize:14 }}>
          <option>True</option><option>False</option>
        </select>
      </div>
    );
  }
  return (
    <div style={{ marginTop:16 }} className="card">
      <h4 style={{ margin:"0 0 10px" }}>Answer</h4>
      <input maxLength={255} value={cor.text??""} placeholder="Correct answer"
        onChange={e=>onChange({correct:{...cor,text:e.target.value}})}
        style={{ padding:"10px 13px",borderRadius:11,border:"1px solid #2a3b73",background:"#0b1530",color:"#e7e9ee",fontSize:14,width:"100%",boxSizing:"border-box" }} />
    </div>
  );
}

function safeJson(v){if(!v)return null;if(typeof v==="object")return v;try{return JSON.parse(v);}catch{return null;}}
function defaultConfig(t,c){switch(t){case"MCQ":return{options:c==="K12"?["","",""]:["","","",""]};case"TRUE_FALSE":return{options:["True","False"]};case"MATCHING":return{colA:[{text:"A1"}],colB:[{text:"B1"}]};case"GUESS_WORD_4PICS":return{images:["","","",""]};case"THINK_SPELL":return{dummyLetters:6,target:""};default:return{};}}
function defaultCorrect(t){switch(t){case"MCQ":case"TRUE_FALSE":return{choice:""};case"MATCHING":return{pairs:[]};default:return{text:""};}}

const styles = {
  page:       { display:"flex",flexDirection:"column",minHeight:"100vh",background:"#0b1020" },
  topBar:     { display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12,padding:"14px 28px",background:"#0d1428",borderBottom:"1px solid #1e2d55",position:"sticky",top:0,zIndex:10 },
  backBtn:    { padding:"8px 16px",borderRadius:10,border:"1px solid #2a3b73",background:"transparent",color:"#8a9bc4",fontSize:13,fontWeight:700,cursor:"pointer" },
  settingsPanel:      { background:"#0f1a35",borderBottom:"1px solid #1e2d55" },
  settingsPanelInner: { display:"flex",gap:24,alignItems:"flex-end",flexWrap:"wrap",padding:"14px 28px" },
  checkLabel:  { display:"flex",alignItems:"center",gap:8,fontSize:13,color:"#8a9bc4",fontWeight:600,paddingBottom:6 },
  pagerBar:    { display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 40px",borderBottom:"1px solid #1e2d55",background:"#0b1020" },
  pagerBtn:    { padding:"12px 28px",borderRadius:12,border:"1px solid #2a3b73",background:"#121f3d",color:"#e7e9ee",fontSize:15,fontWeight:700,cursor:"pointer" },
  editorArea:  { flex:1,padding:"28px 40px",maxWidth:860,width:"100%",margin:"0 auto",boxSizing:"border-box" },
  questionCard:{ background:"#0e1733",border:"1px solid #1e2d55",borderRadius:18,padding:"28px 32px",boxShadow:"0 8px 30px rgba(0,0,0,0.3)" },
  emptyCard:   { background:"#0e1733",border:"1px solid #1e2d55",borderRadius:18,padding:"60px 40px",textAlign:"center",color:"#e7e9ee" },
  fieldLabel:  { fontSize:13,fontWeight:700,opacity:0.8,display:"block",marginBottom:8 },
  textarea:    { padding:"12px 14px",borderRadius:12,border:"1px solid #2a3b73",background:"#0b1530",color:"#e7e9ee",fontSize:14,width:"100%",boxSizing:"border-box",resize:"vertical",minHeight:90 },
  blurOverlay: { position:"fixed",inset:0,backdropFilter:"blur(4px)",background:"rgba(0,0,0,0.55)",zIndex:200 },
  modalWrap:   { position:"fixed",inset:0,display:"flex",alignItems:"center",justifyContent:"center",zIndex:201,padding:20 },
  modalCard:   { background:"#121a33",border:"1px solid #23305d",borderRadius:18,padding:"32px 28px",width:"min(100%,440px)",textAlign:"center",boxShadow:"0 20px 60px rgba(0,0,0,0.5)" },
};
