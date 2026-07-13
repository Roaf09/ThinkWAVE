/* FILE GUIDE:
 * client/src/pages/AdminRegister.jsx
 * Purpose: Project source file. Read the file name and exports first, then follow the imported helpers to understand the flow.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */



import React, { useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "../lib/api";

const INPUT_BG = "#0d1b2e";
const BORDER_C = "#1e3050";
const CARD_BG  = "#111e33";
const PAGE_BG  = "#080e1f";

function pwChecks(p) {
  return {
    length:  p.length >= 8,
    upper:   /[A-Z]/.test(p),
    lower:   /[a-z]/.test(p),
    number:  /[0-9]/.test(p),
    special: /[^A-Za-z0-9]/.test(p),
  };
}

export default function AdminRegister() {
  const nav = useNavigate();
  const [form, setForm] = useState({ firstName:"", lastName:"", email:"", password:"", confirm:"" });
  const [showPw,  setShowPw]  = useState(false);
  const [showCon, setShowCon] = useState(false);
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);

  const checks   = useMemo(() => pwChecks(form.password), [form.password]);
  const isStrong = Object.values(checks).every(Boolean);
  const matches  = form.password && form.password === form.confirm;
  const set = p => setForm(f => ({ ...f, ...p }));

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!isStrong) return setError("Please use a stronger password.");
    if (!matches)  return setError("Passwords do not match.");
    setLoading(true);
    try {
      const { data } = await api.post("/auth/register", {
        email:     form.email,
        password:  form.password,
        firstName: form.firstName,
        lastName:  form.lastName,
        role:      "ADMIN",  // ← this is key
      });
      if (!data.emailSent) setError(data.devOtp ? `✓ Registered. Use dev OTP: ${data.devOtp}` : `✓ Registered. OTP email was not sent. ${data.deliveryWarning || "Check server email settings."}`);
      setTimeout(() => nav("/verify", { state: { email: form.email, adminPending: true } }), data.emailSent ? 0 : 2600);
    } catch (err) {
      setError(err?.response?.data?.message || "Registration failed.");
    } finally { setLoading(false); }
  }

  const isSuccess = error.startsWith("✓");

  return (
    <div style={s.page}>
      <div style={s.glow} />
      <header style={s.header}>
        <Link to="/" style={s.logo}>
          <span style={s.think}>Think</span><span style={s.wave}>WAVE</span>
          <span style={s.adminTag}>ADMIN</span>
        </Link>
        <Link to="/login" style={s.headerBtn}>Login</Link>
      </header>

      <main style={s.main}>
        <div style={s.card}>
          <div style={s.cardTop}>
            <h1 style={s.title}>Register as Administrator</h1>
            <p style={s.subtitle}>
              Create your admin account. You can log in right after verifying your email.
            </p>
          </div>

          <form onSubmit={submit} style={s.form}>
            <div style={s.row}>
              <div style={s.field}>
                <label style={s.label}>First name</label>
                <input style={s.input} value={form.firstName} onChange={e=>set({firstName:e.target.value})} placeholder="Juan" required />
              </div>
              <div style={s.field}>
                <label style={s.label}>Last name</label>
                <input style={s.input} value={form.lastName} onChange={e=>set({lastName:e.target.value})} placeholder="Dela Cruz" required />
              </div>
            </div>

            <div style={s.field}>
              <label style={s.label}>Email address</label>
              <input type="email" style={s.input} value={form.email} onChange={e=>set({email:e.target.value})} placeholder="admin@school.edu" required />
            </div>

            <div style={s.field}>
              <label style={s.label}>Password</label>
              <div style={s.pwWrap}>
                <input type={showPw?"text":"password"} style={{...s.input,paddingRight:64}} value={form.password} onChange={e=>set({password:e.target.value})} placeholder="••••••••" required />
                <button type="button" style={s.showBtn} onClick={()=>setShowPw(v=>!v)}>{showPw?"Hide":"Show"}</button>
              </div>
            </div>

            {/* Strength indicators */}
            <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
              {Object.entries({
                "8+ chars":checks.length,"Uppercase":checks.upper,"Lowercase":checks.lower,"Number":checks.number,"Symbol":checks.special
              }).map(([lbl,ok])=>(
                <span key={lbl} style={{ fontSize:12, color:ok?"#22c55e":"#4a5a8a", fontWeight:600 }}>{ok?"✓":"○"} {lbl}</span>
              ))}
            </div>

            <div style={s.field}>
              <label style={s.label}>Confirm password</label>
              <div style={s.pwWrap}>
                <input type={showCon?"text":"password"} style={{...s.input,paddingRight:64,borderColor:form.confirm?(matches?"#22c55e":"#ef4444"):BORDER_C}} value={form.confirm} onChange={e=>set({confirm:e.target.value})} placeholder="••••••••" required />
                <button type="button" style={s.showBtn} onClick={()=>setShowCon(v=>!v)}>{showCon?"Hide":"Show"}</button>
              </div>
              {form.confirm && <span style={{fontSize:12,color:matches?"#22c55e":"#f87171",marginTop:4}}>{matches?"✓ Passwords match":"✗ Passwords do not match"}</span>}
            </div>

            {error && (
              <div style={{...s.errBox,...(isSuccess?s.sucBox:{})}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <span style={{...s.errTitle,color:isSuccess?"#86efac":"#f87171"}}>{isSuccess?"Success!":"Need help?"}</span>
                  {!isSuccess && <button type="button" style={s.errClose} onClick={()=>setError("")}>×</button>}
                </div>
                <p style={{...s.errMsg,color:isSuccess?"#bbf7d0":"#fca5a5"}}>{error}</p>
              </div>
            )}

            <div style={{display:"flex",justifyContent:"center",marginTop:4}}>
              <button type="submit" disabled={loading} style={{padding:"14px 56px",borderRadius:50,border:"none",background:"#164e63",color:"#67e8f9",fontSize:16,fontWeight:800,cursor:"pointer"}}>
                {loading?"Registering…":"Register as Admin"}
              </button>
            </div>

            <p style={{textAlign:"center",fontSize:13,opacity:0.6,margin:0}}>
              Already have an account? <Link to="/login" style={{color:"#2b6cff",fontWeight:700,textDecoration:"underline"}}>Log in here</Link>
            </p>
          </form>
        </div>
      </main>
    </div>
  );
}

const s = {
  page:    { minHeight:"100vh", background:PAGE_BG, display:"flex", flexDirection:"column", fontFamily:"'Segoe UI',system-ui,sans-serif", color:"#e7e9ee", position:"relative", overflow:"hidden" },
  glow:    { position:"absolute", top:-200, left:"50%", transform:"translateX(-50%)", width:600, height:600, background:"radial-gradient(circle,rgba(22,78,99,0.2) 0%,transparent 70%)", pointerEvents:"none", zIndex:0 },
  header:  { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"18px 40px", zIndex:1, borderBottom:"1px solid #1a2540" },
  logo:    { display:"flex", alignItems:"baseline", gap:4, textDecoration:"none" },
  think:   { fontSize:20, fontWeight:900, color:"#e7e9ee" },
  wave:    { fontSize:20, fontWeight:900, color:"#2b6cff" },
  adminTag:{ fontSize:10, fontWeight:900, letterSpacing:"0.08em", background:"#164e63", color:"#67e8f9", padding:"2px 6px", borderRadius:4, marginLeft:4 },
  headerBtn:{ padding:"8px 20px", borderRadius:20, border:"1px solid #2a3b73", color:"#e7e9ee", fontSize:13, fontWeight:700, textDecoration:"none" },
  main:    { flex:1, display:"flex", alignItems:"center", justifyContent:"center", padding:"36px 20px", zIndex:1 },
  card:    { background:CARD_BG, border:"1px solid #1a2d4a", borderRadius:20, padding:"40px 44px 36px", width:"min(100%,560px)", boxShadow:"0 24px 80px rgba(0,0,0,0.45)" },
  cardTop: { marginBottom:28, textAlign:"center" },
  title:   { margin:"0 0 8px", fontSize:24, fontWeight:900, letterSpacing:"-0.5px" },
  subtitle:{ margin:0, fontSize:13, opacity:0.55, lineHeight:1.6 },
  form:    { display:"flex", flexDirection:"column", gap:16 },
  row:     { display:"flex", gap:12 },
  field:   { display:"flex", flexDirection:"column", gap:6, flex:1 },
  label:   { fontSize:13, fontWeight:600, opacity:0.85 },
  input:   { padding:"12px 16px", borderRadius:12, border:`1px solid ${BORDER_C}`, background:INPUT_BG, color:"#e7e9ee", fontSize:14, width:"100%", boxSizing:"border-box" },
  pwWrap:  { position:"relative" },
  showBtn: { position:"absolute", right:14, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:"#2b6cff", fontSize:13, fontWeight:700, cursor:"pointer", padding:0 },
  errBox:  { background:"rgba(220,38,38,0.12)", border:"1px solid rgba(220,38,38,0.4)", borderRadius:10, padding:"12px 14px" },
  sucBox:  { background:"rgba(34,197,94,0.10)", border:"1px solid rgba(34,197,94,0.35)" },
  errTitle:{ fontSize:14, fontWeight:800 },
  errClose:{ background:"none", border:"none", color:"#f87171", fontSize:18, fontWeight:700, cursor:"pointer", padding:0, lineHeight:1 },
  errMsg:  { margin:"6px 0 0", fontSize:13, lineHeight:1.5 },
};