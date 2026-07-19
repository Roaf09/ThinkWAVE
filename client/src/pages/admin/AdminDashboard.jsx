import React,{Component,useEffect,useMemo,useState} from "react";
import {useNavigate} from "react-router-dom";
import {api,setAuthToken} from "../../lib/api";
import {clearRole,clearToken} from "../../lib/auth";
import {ThemedModal,useColors,useTheme} from "../../context/ThemeContext";
import {TwIcon} from "../../components/TwUI";
import DashboardShell from "../../components/DashboardShell";
import {ProfileSettingsModal,ProfileSavedOverlay,useDashboardProfile} from "../../components/ProfileSettings";
import {DualLineChart,DonutChart,BarChart} from "../../components/SimpleCharts";

const NAV=[{id:"overview",label:"Overview",icon:"home"},{id:"teachers",label:"Teachers",icon:"teacher"},{id:"institution",label:"Institution",icon:"classes"}];
const card=(c,extra={})=>({background:c.cardBg,border:`1px solid ${c.border}`,borderRadius:18,padding:18,boxShadow:"0 18px 40px rgba(15,23,42,.07)",...extra});
const quiet=(c,extra={})=>({background:c.cardBg2,border:`1px solid ${c.border}`,borderRadius:14,padding:14,...extra});
const fmt=d=>d?new Date(d).toLocaleString("en-PH",{dateStyle:"medium",timeStyle:"short"}):"—";
const weekLabel=value=>value?new Date(value).toLocaleDateString("en-PH",{month:"short",day:"numeric"}):"";

export default function AdminDashboard(){const nav=useNavigate();const c=useColors();const {dark,toggleTheme}=useTheme();const [activeTab,setActiveTab]=useState("overview");const [setupDone,setSetupDone]=useState(true);const [institution,setInstitution]=useState("");const [setupName,setSetupName]=useState("");const [setupError,setSetupError]=useState("");const [logout,setLogout]=useState(false);const profileState=useDashboardProfile();
useEffect(()=>{api.get("/admin-dashboard/setup-status").then(({data})=>{setSetupDone(data.setupDone??true);setInstitution(data.institutionName||"")}).catch(()=>{})},[]);
async function saveSetup(){if(!setupName.trim())return;try{await api.post("/admin-dashboard/setup-institution",{institutionName:setupName.trim()});setInstitution(setupName.trim());setSetupDone(true)}catch(e){setSetupError(e?.response?.data?.message||"Failed to save institution name.")}}
function doLogout(){clearToken();clearRole();setAuthToken("");nav("/")}
if(!setupDone)return <div style={{minHeight:"100vh",display:"grid",placeItems:"center",background:c.pageBg,padding:24}}><div style={card(c,{width:"min(100%,470px)",padding:34,textAlign:"center"})}><TwIcon name="classes" size={42} style={{color:c.accent}}/><h2 style={{color:c.text}}>Complete your institution setup</h2><p style={{color:c.textMuted,lineHeight:1.6}}>Enter your school or institution name to organize teachers, students, and activity under one shared profile.</p><input value={setupName} onChange={e=>setSetupName(e.target.value)} placeholder="Institution name" style={{width:"100%",boxSizing:"border-box",padding:14,borderRadius:13,border:`1px solid ${c.inputBorder}`,background:c.inputBg,color:c.text}}/>{setupError&&<p style={{color:c.redFg}}>{setupError}</p>}<button className="btn" style={{width:"100%",marginTop:14}} onClick={saveSetup}>Save and Continue</button></div></div>;
return <><AdminDashboardBoundary c={c}><DashboardShell navItems={NAV} activeTab={activeTab} setActiveTab={setActiveTab} dark={dark} toggleTheme={toggleTheme} onLogout={()=>setLogout(true)} profile={profileState.profile} onProfile={()=>profileState.setProfileOpen(true)}><AdminTabBoundary c={c} key={activeTab}>{activeTab==="overview"&&<Overview/>}{activeTab==="teachers"&&<Teachers/>}{activeTab==="institution"&&<Institution/>}</AdminTabBoundary></DashboardShell></AdminDashboardBoundary>
{profileState.profileOpen&&<ProfileSettingsModal roleLabel="Admin" profile={profileState.profile} setProfile={profileState.setProfile} onClose={()=>profileState.setProfileOpen(false)} onSaved={()=>{profileState.setSaved(true);setTimeout(()=>profileState.setSaved(false),2000)}}/>}{profileState.saved&&<ProfileSavedOverlay/>}{logout&&<ThemedModal icon={<TwIcon name="logout" size={30}/>} title="Log out?" message="Are you sure you want to log out of the admin dashboard?" onClose={()=>setLogout(false)}><button className="btn secondary" onClick={()=>setLogout(false)}>Cancel</button><button className="btn" style={{background:dark?"#7f1d1d":"#dc2626",color:"#fff"}} onClick={doLogout}>Yes, Log Out</button></ThemedModal>}</>}

function Heading({title}){const c=useColors();return <h2 style={{margin:"0 0 22px",color:c.text,fontSize:28,letterSpacing:"-.035em"}}>{title}</h2>}
function Metric({label,value,icon,tone="#2b6cff"}){const c=useColors();return <div className="tw-admin-card" style={{...card(c),display:"flex",alignItems:"center",gap:14,padding:15}}><span style={{width:44,height:44,borderRadius:14,display:"grid",placeItems:"center",background:`${tone}18`,color:tone}}><TwIcon name={icon} size={22}/></span><div><b style={{display:"block",fontSize:27,color:c.text}}>{Number(value||0).toLocaleString()}</b><small style={{color:c.textMuted,fontWeight:800}}>{label}</small></div></div>}
function ChartTitle({title,icon}){const c=useColors();return <div style={{display:"flex",alignItems:"center",gap:9,fontWeight:900,fontSize:17,color:c.text,marginBottom:14}}><TwIcon name={icon} size={20}/>{title}</div>}
function Info({label,value}){const c=useColors();return <div style={{display:"flex",justifyContent:"space-between",gap:12,padding:"12px 0",borderBottom:`1px solid ${c.border}`}}><span style={{color:c.textMuted}}>{label}</span><b style={{color:c.text,textAlign:"right"}}>{value??"—"}</b></div>}
function Empty({text}){const c=useColors();return <div style={{...quiet(c),color:c.textMuted,textAlign:"center"}}>{text}</div>}

function Overview(){
  const c=useColors();
  const [data,setData]=useState(null);
  const [error,setError]=useState("");
  useEffect(()=>{let alive=true;api.get("/admin-dashboard/stats").then(r=>{if(alive)setData(r.data||{})}).catch(err=>{if(alive)setError(err?.response?.data?.message||"Unable to load the admin overview.")});return()=>{alive=false}},[]);
  const rawDaily=Array.isArray(data?.weeklySessions)?data.weeklySessions:[];
  const daily=useMemo(()=>normalizeDailySessions(rawDaily),[rawDaily]);
  return <div className="container"><Heading title="Admin Overview"/>{error&&<ApiMessage text={error}/>}<div className="tw-overview-layout"><div className="tw-overview-metrics"><Metric label="Active Teachers" value={data?.activeTeachers} icon="teacher"/><Metric label="Active Live Sessions" value={data?.activeLiveSessions} icon="live" tone="#14b8a6"/><Metric label="Active Assigned Sessions" value={data?.activeAssignedSessions} icon="calendar" tone="#8b5cf6"/><Metric label="Active Students" value={data?.activeStudents} icon="student" tone="#f59e0b"/></div><div className="tw-overview-charts"><section style={card(c)}><ChartTitle title="Live and Assigned Sessions: Monday to Sunday" icon="chart"/><DualLineChart seriesA={daily.map(x=>x.live)} seriesB={daily.map(x=>x.assigned)} labels={daily.map(x=>x.label)} labelA="Live sessions" labelB="Assigned sessions"/></section><section style={card(c)}><ChartTitle title="Institution Account Mix" icon="user"/><DonutChart data={Array.isArray(data?.accountDistribution)?data.accountDistribution:[]} centerLabel="Members"/></section><section style={card(c)}><ChartTitle title="Template Usage" icon="bank"/><BarChart data={(Array.isArray(data?.templateUsage)?data.templateUsage:[]).map(x=>({label:String(x.label||"").replaceAll("_"," "),value:Number(x.value||0)}))}/></section></div></div></div>
}

function Teachers(){
  const c=useColors();
  const [items,setItems]=useState([]);
  const [search,setSearch]=useState("");
  const [selected,setSelected]=useState(null);
  const [confirm,setConfirm]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const load=()=>{setLoading(true);setError("");return api.get("/admin-dashboard/teachers").then(r=>{const rows=Array.isArray(r.data)?r.data:[];setItems(rows);setSelected(cur=>cur?(rows.find(x=>Number(x.id)===Number(cur.id))||null):null)}).catch(err=>{setItems([]);setSelected(null);setError(err?.response?.data?.message||"Unable to load teachers.")}).finally(()=>setLoading(false))};
  useEffect(()=>{load()},[]);
  const filtered=useMemo(()=>items.filter(x=>`${x?.first_name||""} ${x?.last_name||""} ${x?.email||""}`.toLowerCase().includes(search.toLowerCase())),[items,search]);
  async function toggle(){if(!confirm)return;try{await api.post(`/admin-dashboard/teachers/${confirm.teacher.id}/active`,{active:confirm.action==="activate"});setConfirm(null);await load()}catch(err){setError(err?.response?.data?.message||"Unable to update this teacher.");setConfirm(null)}}
  return <div className="container"><Heading title="Teachers"/><div className="tw-filter-row" style={card(c)}><div className="tw-search-input"><TwIcon name="search" size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search teacher" style={{background:c.inputBg,color:c.text,borderColor:c.inputBorder}}/></div></div>{error&&<ApiMessage text={error}/>}<div className="tw-admin-two-panel"><section style={card(c)}>{loading?<LoadingCard text="Loading teachers…"/>:<div style={{display:"grid",gap:10}}>{filtered.map(t=><button key={t.id} className="tw-teacher-row" onClick={()=>setSelected(t)} style={{...quiet(c),color:c.text,borderColor:selected?.id===t.id?c.accent:c.border}}><div><b>{t.last_name||""}, {t.first_name||""}</b><small style={{color:c.textMuted}}>{t.email||"No email"}</small></div><span style={{color:t.is_active?c.greenFg:c.textMuted}}>{t.is_active?"Active":"Inactive"}</span></button>)}{!filtered.length&&<Empty text="No teachers found."/>}</div>}</section><section style={card(c)}><ChartTitle title="Teacher Details" icon="teacher"/>{selected?<><div style={quiet(c)}><h3 style={{color:c.text,margin:"0 0 5px"}}>{selected.first_name} {selected.last_name}</h3><p style={{color:c.textMuted,margin:0}}>{selected.email}</p></div><Info label="Joined" value={fmt(selected.created_at)}/><Info label="Last active" value={fmt(selected.last_active_at)}/><Info label="Hosted sessions" value={selected.hosted_sessions_count||0}/><Info label="Assigned sessions" value={selected.assigned_sessions_count||0}/><Info label="Last hosted session" value={fmt(selected.last_session_at)}/><Info label="Classes handled" value={selected.classes_handled_count||0}/><div style={{display:"flex",justifyContent:"center",gap:10,marginTop:18}}><button className="btn secondary" onClick={()=>setConfirm({teacher:selected,action:selected.is_active?"deactivate":"activate"})}>{selected.is_active?"Deactivate Teacher":"Activate Teacher"}</button></div></>:<Empty text="Select a teacher to view details."/>}</section></div>{confirm&&<ThemedModal icon={<TwIcon name="alert" size={30}/>} title={confirm.action==="deactivate"?"Deactivate Teacher?":"Activate Teacher?"} message={`${confirm.action==="deactivate"?"Deactivate":"Activate"} ${confirm.teacher.first_name} ${confirm.teacher.last_name}?`} onClose={()=>setConfirm(null)}><button className="btn secondary" onClick={()=>setConfirm(null)}>Cancel</button><button className="btn" onClick={toggle}>Confirm</button></ThemedModal>}</div>
}

function Institution(){
  const c=useColors();
  const [data,setData]=useState(null);
  const [invite,setInvite]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const load=()=>{
    setLoading(true); setError("");
    return Promise.allSettled([api.get("/admin-dashboard/institution"),api.get("/admin-dashboard/invitation")]).then(([institutionResult,inviteResult])=>{
      if(institutionResult.status==="fulfilled") setData(institutionResult.value.data||{});
      else { setData({institution:{},teacherActivity:[],sessionTotalsThisWeek:[]}); setError(institutionResult.reason?.response?.data?.message||"Unable to load institution details."); }
      setInvite(inviteResult.status==="fulfilled"?(inviteResult.value.data||null):null);
    }).finally(()=>setLoading(false));
  };
  useEffect(()=>{load()},[]);
  useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(""),2000);return()=>clearTimeout(t)},[notice]);
  async function generate(){try{setError("");const {data:next}=await api.post("/admin-dashboard/invitation",{});setInvite(next||null);setNotice("A fresh invitation code is now active.")}catch(e){setError(e?.response?.data?.message||"Failed to generate invitation code.")}}
  async function revoke(){if(!invite)return;try{await api.delete(`/admin-dashboard/invitation/${invite.id}`);setInvite(null);setNotice("Invitation code revoked.")}catch(e){setError(e?.response?.data?.message||"Failed to revoke invitation code.")}}
  const inst=data?.institution||{};
  const teacherActivity=Array.isArray(data?.teacherActivity)?data.teacherActivity:[];
  const sessionTotals=Array.isArray(data?.sessionTotalsThisWeek)?data.sessionTotalsThisWeek:[];
  const stats=[
    ["Total Teachers",inst.totalTeachers,"teacher","#2b6cff"],
    ["Active Teachers",inst.activeTeachers,"check","#14b8a6"],
    ["Total Students",inst.totalStudents,"student","#8b5cf6"],
    ["Active Students",inst.activeStudents,"spark","#22c55e"],
    ["Total Classes",inst.totalClasses,"classes","#f59e0b"],
    ["Total Sessions",inst.totalSessions,"live","#ec4899"],
  ];
  return <div className="container"><Heading title="Institution"/>{error&&<ApiMessage text={error}/>} {loading?<LoadingCard text="Loading institution dashboard…"/>:<>
    <div className="tw-admin-institution-v251">
      <section style={card(c)} className="tw-admin-invite-card"><ChartTitle title="Teacher Invitation" icon="invitation"/>{notice&&<div className="tw-fade-notice" style={{...quiet(c),color:c.greenFg,borderColor:c.greenBorder}}>{notice}</div>}{invite?<><div style={{...quiet(c),textAlign:"center",padding:24,background:"linear-gradient(135deg,rgba(43,108,255,.18),rgba(59,130,246,.08))"}}><small style={{color:c.textMuted}}>Active code</small><div className="tw-admin-invite-code" style={{color:c.accent}}>{invite.invite_code}</div></div><div style={{display:"flex",gap:10,marginTop:14}}><button className="btn secondary" style={{flex:1}} onClick={generate}>Regenerate</button><button className="btn" style={{flex:1,background:c.redBg,color:c.redFg,border:`1px solid ${c.redBorder}`}} onClick={revoke}>Revoke</button></div></>:<div style={{...quiet(c),textAlign:"center",padding:28}}><p style={{color:c.textMuted}}>No active invitation code yet.</p><button className="btn" onClick={generate}>Generate Code</button></div>}</section>
      <section style={card(c)}><ChartTitle title="Institution Profile" icon="classes"/><Info label="Institution" value={inst.name}/><Info label="Administrator" value={inst.adminName}/><Info label="Admin email" value={inst.adminEmail}/><Info label="Created" value={fmt(inst.createdAt)}/></section>
      <section style={card(c)} className="tw-admin-institution-stats"><ChartTitle title="Institution Totals" icon="chart"/><div className="tw-admin-stat-grid">{stats.map(([label,value,icon,tone])=><Metric key={label} label={label} value={value} icon={icon} tone={tone}/>)}</div></section>
    </div>
    <div className="tw-admin-institution-charts"><section className="tw-admin-teacher-activity" style={card(c)}><ChartTitle title="Teacher Activity" icon="teacher"/><DonutChart data={teacherActivity} centerLabel="Teachers"/></section><section style={card(c)}><ChartTitle title="Session Totals This Week" icon="live"/><BarChart data={sessionTotals} height={220}/></section></div>
  </>}</div>;
}

class AdminDashboardBoundary extends Component{constructor(props){super(props);this.state={failed:false}}static getDerivedStateFromError(){return{failed:true}}componentDidCatch(error,info){console.error("Admin dashboard failed:",error,info)}render(){if(this.state.failed)return <div style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:24,background:this.props.c.pageBg,color:this.props.c.text}}><div style={{background:this.props.c.cardBg,border:`1px solid ${this.props.c.border}`,borderRadius:20,padding:28,width:"min(92vw,620px)",boxShadow:"0 24px 60px rgba(15,23,42,.14)"}}><h2 style={{marginTop:0}}>The admin dashboard could not display this page.</h2><p style={{color:this.props.c.textMuted,lineHeight:1.6}}>Refresh the browser once. If the problem continues, check the server terminal for the failed admin-dashboard request instead of seeing an empty blue screen.</p><button className="btn" onClick={()=>window.location.reload()}>Refresh Dashboard</button></div></div>;return this.props.children}}

class AdminTabBoundary extends Component{constructor(props){super(props);this.state={failed:false}}static getDerivedStateFromError(){return{failed:true}}componentDidCatch(error,info){console.error("Admin dashboard tab failed:",error,info)}render(){if(this.state.failed)return <div className="container"><div style={{background:this.props.c.cardBg,border:`1px solid ${this.props.c.border}`,borderRadius:18,padding:24,color:this.props.c.text}}><h2 style={{marginTop:0}}>This tab could not be displayed.</h2><p style={{color:this.props.c.textMuted}}>Refresh the page. If the issue continues, check the server terminal for the matching admin-dashboard request.</p></div></div>;return this.props.children}}
function normalizeDailySessions(rows){const normalized=(rows||[]).map(row=>({dayStart:row.dayStart||row.day_start||row.day_key,live:Number(row.live??row.live_total??0),assigned:Number(row.assigned??row.assigned_total??0)}));const map=new Map(normalized.map(row=>[String(row.dayStart||"").slice(0,10),row]));const now=new Date();const monday=new Date(now);monday.setHours(0,0,0,0);monday.setDate(now.getDate()-((now.getDay()+6)%7));return Array.from({length:7},(_,index)=>{const date=new Date(monday);date.setDate(monday.getDate()+index);const key=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;const row=map.get(key)||{};return{dayStart:key,label:["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][index],live:Number(row.live||0),assigned:Number(row.assigned||0)}})}
function ApiMessage({text}){const c=useColors();return <div style={{...quiet(c),margin:"0 0 16px",color:c.redFg,borderColor:c.redBorder,background:c.redBg}}><TwIcon name="alert" size={18}/> <span>{text}</span></div>}
function LoadingCard({text}){const c=useColors();return <div style={{...quiet(c),color:c.textMuted,textAlign:"center"}}>{text}</div>}
