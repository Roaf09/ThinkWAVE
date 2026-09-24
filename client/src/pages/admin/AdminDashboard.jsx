import {Component,useEffect,useMemo,useState} from "react";
import {useNavigate} from "react-router-dom";
import {api,setAuthToken} from "../../lib/api";
import {clearRole,clearToken} from "../../lib/auth";
import {clearLastRoute} from "../../lib/lastRoute";
import {clearPersistentTabs,usePersistentTab} from "../../lib/persistentTab";
import {ThemedModal,useColors,useTheme} from "../../context/ThemeContext";
import {TwIcon} from "../../components/TwUI";
import DashboardShell from "../../components/DashboardShell";
import {ProfileSettingsModal,ProfileSavedOverlay,useDashboardProfile} from "../../components/ProfileSettings";
import {DualLineChart,DonutChart,BarChart} from "../../components/SimpleCharts";
import {manilaDateTime} from "../../lib/dateFormat";
import { TwLogoLoader } from "../../components/TwLogoLoader";

const ADMIN_TABS=["overview","teachers","institution"];
const NAV=[{id:"overview",label:"Overview",icon:"home"},{id:"teachers",label:"Teachers",icon:"teacher"},{id:"institution",label:"Institution",icon:"classes"}];
const card=(c,extra={})=>({background:c.cardBg,border:`1px solid ${c.border}`,borderRadius:18,padding:18,boxShadow:"0 18px 40px rgba(15,23,42,.07)",...extra});
const quiet=(c,extra={})=>({background:c.cardBg2,border:`1px solid ${c.border}`,borderRadius:14,padding:14,...extra});
const fmt=d=>d?manilaDateTime(d,{dateStyle:"medium",timeStyle:"short"}):"—";

export default function AdminDashboard(){const nav=useNavigate();const c=useColors();const {dark,toggleTheme}=useTheme();const [activeTab,setActiveTab]=usePersistentTab("tw_admin_tab","overview",ADMIN_TABS);const [setupDone,setSetupDone]=useState(true);const [setupName,setSetupName]=useState("");const [setupError,setSetupError]=useState("");const [logout,setLogout]=useState(false);const profileState=useDashboardProfile();
useEffect(()=>{api.get("/admin-dashboard/setup-status").then(({data})=>{setSetupDone(data.setupDone??true);if(data.institutionName)setSetupName(data.institutionName)}).catch(()=>{})},[]);
async function saveSetup(){if(!setupName.trim())return;try{await api.post("/admin-dashboard/setup-institution",{institutionName:setupName.trim()});setSetupDone(true)}catch(e){setSetupError(e?.response?.data?.message||"Failed to save institution name.")}}
function doLogout(){clearToken();clearRole();setAuthToken("");clearLastRoute();clearPersistentTabs();nav("/")}
if(!setupDone)return <div style={{minHeight:"100vh",display:"grid",placeItems:"center",background:c.pageBg,padding:24}}><div style={card(c,{width:"min(100%,470px)",padding:34,textAlign:"center"})}><TwIcon name="classes" size={42} style={{color:c.accent}}/><h2 style={{color:c.text}}>Confirm your institution</h2><p style={{color:c.textMuted,lineHeight:1.6}}>This name came from your approved application and is already filled in. Correct it if needed, then confirm to organize teachers, students, and activity under one shared profile.</p><input value={setupName} onChange={e=>setSetupName(e.target.value)} placeholder="Institution name" style={{width:"100%",boxSizing:"border-box",padding:14,borderRadius:13,border:`1px solid ${c.inputBorder}`,background:c.inputBg,color:c.text}}/>{setupError&&<p style={{color:c.redFg}}>{setupError}</p>}<button className="btn" style={{width:"100%",marginTop:14}} onClick={saveSetup}>Confirm and Continue</button></div></div>;
return <><AdminDashboardBoundary c={c}><DashboardShell navItems={NAV} activeTab={activeTab} setActiveTab={setActiveTab} dark={dark} toggleTheme={toggleTheme} onLogout={()=>setLogout(true)} profile={profileState.profile} onProfile={()=>profileState.setProfileOpen(true)}><AdminTabBoundary c={c} key={activeTab}>{activeTab==="overview"&&<Overview onNavigate={setActiveTab}/>}{activeTab==="teachers"&&<Teachers/>}{activeTab==="institution"&&<Institution/>}</AdminTabBoundary></DashboardShell></AdminDashboardBoundary>
{profileState.profileOpen&&<ProfileSettingsModal roleLabel="Admin" profile={profileState.profile} setProfile={profileState.setProfile} onClose={()=>profileState.setProfileOpen(false)} onSaved={()=>{profileState.setSaved(true);setTimeout(()=>profileState.setSaved(false),2000)}}/>}{profileState.saved&&<ProfileSavedOverlay/>}{logout&&<><div className="tw-admin-logout-backdrop" onClick={()=>setLogout(false)}/><div className="tw-admin-logout-layer" onClick={()=>setLogout(false)}><section className="tw-admin-logout-modal is-compact-confirm" onClick={event=>event.stopPropagation()} style={{background:c.cardBg,borderColor:c.border,color:c.text}}><header><TwIcon name="logout" size={24}/><strong>Logout</strong></header><p style={{color:c.textMuted}}>Are you sure you want to log out of the admin dashboard?</p><div className="tw-admin-logout-actions"><AdminPressButton tone="red" onClick={doLogout}>Yes, Logout</AdminPressButton></div></section></div></>}</>}

function Heading({title}){const c=useColors();return <h2 style={{margin:"0 0 22px",color:c.text,fontSize:28,letterSpacing:"-.035em"}}>{title}</h2>}
const METRIC_PALETTES={
  "#2b6cff":{light:{background:"#a8c1ff",border:"#2555c7"},dark:{background:"#1d4fb8",border:"#102d75"}},
  "#14b8a6":{light:{background:"#8fe3da",border:"#0f8176"},dark:{background:"#0f766e",border:"#064e47"}},
  "#8b5cf6":{light:{background:"#c5b5ff",border:"#7040d8"},dark:{background:"#6d28d9",border:"#421786"}},
  "#f59e0b":{light:{background:"#ffd37b",border:"#c87800"},dark:{background:"#a94f08",border:"#6f3105"}},
  "#22c55e":{light:{background:"#9ee6b6",border:"#178c43"},dark:{background:"#16753a",border:"#0d4d27"}},
  "#ec4899":{light:{background:"#f7a9d0",border:"#c62a75"},dark:{background:"#a91d5b",border:"#70113b"}},
};
function metricPalette(tone,dark){const palette=METRIC_PALETTES[String(tone||"#2b6cff").toLowerCase()]||METRIC_PALETTES["#2b6cff"];return dark?palette.dark:palette.light}
function AdminPressButton({tone="blue",className="",children,...props}){return <button {...props} className={`tw-admin-press tw-admin-press-${tone} ${className}`.trim()}><span>{children}</span></button>}
function Metric({ label, value, icon, tone = "#2b6cff", onNavigate }) {
  const c = useColors();
  const { dark } = useTheme();
  const palette = metricPalette(tone, dark);
  const ink = dark ? "#ffffff" : "#0f172a";
  const cls = `tw-admin-card tw-admin-metric tw-tone-${icon}`;
  const style = { ...card(c), display: "flex", alignItems: "center", gap: 14, padding: 15, font: "inherit", textAlign: "left", width: "100%", boxSizing: "border-box", "--metric-tone": palette.background, "--metric-border": palette.border, "--metric-ink": ink, border: `4px solid ${palette.border}`, background: palette.background, color: ink, ...(onNavigate ? { cursor: "pointer" } : {}) };
  const body = <><span style={{ width: 44, height: 44, borderRadius: 14, display: "grid", placeItems: "center", background: dark ? "rgba(255,255,255,.15)" : "rgba(255,255,255,.52)", color: ink, border: dark ? "1px solid rgba(255,255,255,.24)" : "1px solid rgba(15,23,42,.15)" }}><TwIcon name={icon} size={22} /></span><div><b style={{ display: "block", fontSize: 27, color: ink }}>{Number(value || 0).toLocaleString()}</b><small style={{ color: ink, fontWeight: 850, opacity: 0.86 }}>{label}</small></div></>;
  return onNavigate
    ? <button type="button" aria-label={`${label} — view details`} className={cls} style={style} onClick={onNavigate}>{body}</button>
    : <div className={cls} style={style}>{body}</div>;
}
function ChartTitle({title,icon}){const c=useColors();return <div style={{display:"flex",alignItems:"center",gap:9,fontWeight:900,fontSize:17,color:c.text,marginBottom:14}}><TwIcon name={icon} size={20}/>{title}</div>}
function Info({label,value}){const c=useColors();return <div style={{display:"flex",justifyContent:"space-between",gap:12,padding:"12px 0",borderBottom:`1px solid ${c.border}`}}><span style={{color:c.textMuted}}>{label}</span><b style={{color:c.text,textAlign:"right"}}>{value??"—"}</b></div>}
function Empty({text,action}){const c=useColors();return <div style={{...quiet(c),color:c.textMuted,textAlign:"center"}}>{text}{action&&<div style={{marginTop:12}}>{action}</div>}</div>}

function Overview({onNavigate}){
  const c=useColors();
  const [data,setData]=useState(null);
  const [invite,setInvite]=useState(undefined);
  const [error,setError]=useState("");
  useEffect(()=>{let alive=true;api.get("/admin-dashboard/stats").then(r=>{if(alive)setData(r.data||{})}).catch(err=>{if(alive)setError(err?.response?.data?.message||"Unable to load the admin overview.")});api.get("/admin-dashboard/invitation").then(r=>{if(alive)setInvite(r.data||null)}).catch(()=>{if(alive)setInvite(null)});return()=>{alive=false}},[]);
  const rawDaily=Array.isArray(data?.weeklySessions)?data.weeklySessions:[];
  const daily=useMemo(()=>normalizeDailySessions(rawDaily),[rawDaily]);
  const totalTeachers=Number((data?.accountDistribution||[]).find(x=>String(x.label||"").toLowerCase()==="teachers")?.value||0);
  const inactiveTeachers=Math.max(0,totalTeachers-Number(data?.activeTeachers||0));
  const weekSessions=(data?.weeklySessions||[]).reduce((s,x)=>s+Number(x.live||x.live_total||0)+Number(x.assigned||x.assigned_total||0),0);
  const attention=[];
  if(invite===null)attention.push({icon:"invitation",text:"No active teacher invite code",tab:"institution"});
  if(inactiveTeachers>0)attention.push({icon:"teacher",text:inactiveTeachers+(inactiveTeachers===1?" inactive teacher":" inactive teachers"),tab:"teachers"});
  if(data&&weekSessions===0)attention.push({icon:"live",text:"No sessions this week",tab:"teachers"});
  if(data&&Number(data?.activeStudents||0)===0&&totalTeachers>0)attention.push({icon:"student",text:"No active students yet",tab:"institution"});
  return <div className="container"><Heading title="Admin Overview"/>{error&&<ApiMessage text={error}/>}{attention.length>0&&<div className="tw-attention-strip">{attention.map(a=><button key={a.text} type="button" className="tw-attention-item" onClick={()=>{if(onNavigate)onNavigate(a.tab)}}><TwIcon name={a.icon} size={18}/><span>{a.text}</span><TwIcon name="arrowRight" size={16}/></button>)}</div>}<div className="tw-overview-layout"><div className="tw-overview-metrics"><Metric label="Active Teachers" value={data?.activeTeachers} icon="teacher" onNavigate={()=>onNavigate("teachers")}/><Metric label="Active Live Sessions" value={data?.activeLiveSessions} icon="live" tone="#14b8a6" onNavigate={()=>onNavigate("teachers")}/><Metric label="Active Assigned Sessions" value={data?.activeAssignedSessions} icon="calendar" tone="#8b5cf6" onNavigate={()=>onNavigate("teachers")}/><Metric label="Active Students" value={data?.activeStudents} icon="student" tone="#f59e0b" onNavigate={()=>onNavigate("institution")}/></div><div className="tw-overview-charts"><section style={card(c)}><ChartTitle title="Live and Assigned Sessions: Monday to Sunday" icon="chart"/><DualLineChart seriesA={daily.map(x=>x.live)} seriesB={daily.map(x=>x.assigned)} labels={daily.map(x=>x.label)} labelA="Live sessions" labelB="Assigned sessions"/></section><section style={card(c)}><ChartTitle title="Institution Account Mix" icon="user"/><DonutChart data={Array.isArray(data?.accountDistribution)?data.accountDistribution:[]} centerLabel="Members"/></section><section style={card(c)}><ChartTitle title="Template Usage" icon="bank"/><BarChart data={(Array.isArray(data?.templateUsage)?data.templateUsage:[]).map(x=>({label:String(x.label||"").replaceAll("_"," "),value:Number(x.value||0)}))}/></section></div></div></div>
}

function teacherStatus(t){if(String(t?.approval_status||"").toUpperCase()==="PENDING")return"pending";return t?.is_active?"active":"inactive"}
function teacherRelTime(v){if(!v)return"Never";const t=new Date(v).getTime();if(!Number.isFinite(t))return"—";const s=Math.max(0,(Date.now()-t)/1e3);if(s<60)return"just now";if(s<3600)return`${Math.floor(s/60)}m ago`;if(s<86400)return`${Math.floor(s/3600)}h ago`;const d=Math.floor(s/86400);if(d===1)return"yesterday";if(d<30)return`${d}d ago`;return new Date(t).toLocaleDateString([],{month:"short",day:"numeric",year:"numeric"})}
function Teachers(){
  const c=useColors();
  const [items,setItems]=useState([]);
  const [search,setSearch]=useState("");
  const [statusFilter,setStatusFilter]=useState("ALL");
  const [sortBy,setSortBy]=useState("name");
  const [filterOpen,setFilterOpen]=useState(false);
  const [selected,setSelected]=useState(null);
  const [confirm,setConfirm]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const hasActiveTeacherFilters=statusFilter!=="ALL"||sortBy!=="name";
  const emptyText=items.length?"No teachers match the current filters.":"No teachers found.";
  const load=()=>{setLoading(true);setError("");return api.get("/admin-dashboard/teachers").then(r=>{const rows=Array.isArray(r.data)?r.data:[];setItems(rows);setSelected(cur=>cur?(rows.find(x=>Number(x.id)===Number(cur.id))||null):null)}).catch(err=>{setItems([]);setSelected(null);setError(err?.response?.data?.message||"Unable to load teachers.")}).finally(()=>setLoading(false))};
  useEffect(()=>{load()},[]);
  const filtered=useMemo(()=>{const q=search.trim().toLowerCase();const rows=items.filter(x=>{const st=teacherStatus(x);if(statusFilter!=="ALL"&&st!==statusFilter.toLowerCase())return false;if(!q)return true;return`${x?.first_name||""} ${x?.last_name||""} ${x?.email||""}`.toLowerCase().includes(q)});rows.sort((a,b)=>{if(sortBy==="active")return new Date(b.last_active_at||0).getTime()-new Date(a.last_active_at||0).getTime();if(sortBy==="sessions")return Number(b.hosted_sessions_count||0)-Number(a.hosted_sessions_count||0);return String(a.last_name||"").localeCompare(String(b.last_name||""))||String(a.first_name||"").localeCompare(String(b.first_name||""))});return rows},[items,search,statusFilter,sortBy]);
  async function toggle(){if(!confirm)return;try{await api.post(`/admin-dashboard/teachers/${confirm.teacher.id}/active`,{active:confirm.action==="activate"});setConfirm(null);await load()}catch(err){setError(err?.response?.data?.message||"Unable to update this teacher.");setConfirm(null)}}
  return <div className="container"><Heading title="Teachers"/><p className="tw-notif-sub" style={{color:c.textMuted}}>Review teacher access, activity, and workload for your institution.</p><div className="tw-filter-row tw-teacher-filter" style={{...card(c),position:"relative",overflow:"visible"}}><div className="tw-search-input"><TwIcon name="search" size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search teacher" style={{background:c.inputBg,color:c.text,borderColor:c.inputBorder}}/></div><AdminPressButton tone="blue" className={`tw-filter-toggle-btn${filterOpen?" is-selected":""}${hasActiveTeacherFilters?" has-active-filters":""}`} onClick={()=>setFilterOpen(v=>!v)}><TwIcon name="filter" size={17}/>Filter</AdminPressButton>{filterOpen&&<div className="tw-filter-panel" style={{...card(c),position:"absolute",top:"calc(100% + 8px)",right:12,left:12,zIndex:40}}><div className="tw-filter-panel-group"><label style={{fontSize:11,fontWeight:900,textTransform:"uppercase",letterSpacing:".06em",color:c.textMuted}}>Status</label><div className="tw-filter-chip-row">{["ALL","ACTIVE","INACTIVE","PENDING"].map(s=><button key={s} type="button" className={`tw-filter-chip${statusFilter===s?" is-active":""}`} onClick={()=>setStatusFilter(s)}>{s==="ALL"?"All":s==="ACTIVE"?"Active":s==="INACTIVE"?"Inactive":"Pending"}</button>)}</div></div><div className="tw-filter-panel-group"><label style={{fontSize:11,fontWeight:900,textTransform:"uppercase",letterSpacing:".06em",color:c.textMuted}}>Sort by</label><select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{background:c.inputBg,color:c.text,borderColor:c.inputBorder,borderRadius:12,padding:"12px 14px",font:"inherit",fontWeight:700}}><option value="name">Name A–Z</option><option value="active">Recently active</option><option value="sessions">Most sessions</option></select></div></div>}</div>{error&&<ApiMessage text={error}/>}<div className="tw-admin-two-panel"><section style={card(c)}>{loading?<LoadingCard text="Loading teachers…"/>:<div style={{display:"grid",gap:10}}>{filtered.map(t=>{const st=teacherStatus(t);return<button key={t.id} className={`tw-teacher-row ${selected?.id===t.id?"selected":""}`} onClick={()=>setSelected(t)} style={{...quiet(c),color:c.text,borderColor:selected?.id===t.id?c.accent:c.border}}><div><b>{t.last_name||""}, {t.first_name||""}</b><small style={{color:c.textMuted}}>{t.email||"No email"}</small></div><span className="tw-teacher-row-meta"><span className={`tw-status-pill is-${st}`}>{st==="active"?"Active":st==="inactive"?"Inactive":"Pending"}</span><small style={{color:c.textMuted}}>{teacherRelTime(t.last_active_at)}</small><small className="tw-teacher-row-sessions" style={{color:c.textMuted}}>{Number(t.hosted_sessions_count||0)} sessions</small></span></button>})}{!filtered.length&&<Empty text={emptyText} action={items.length>0&&<button type="button" className="tw-audit-action-btn" onClick={()=>{setSearch("");setStatusFilter("ALL");setSortBy("name")}}>Clear filters</button>}/>}</div>}</section><section className="tw-admin-teacher-details" style={card(c)}><ChartTitle title="Teacher Details" icon="teacher"/>{selected?<><div style={quiet(c)}><div className="tw-teacher-detail-head"><div><h3 style={{color:c.text,margin:"0 0 5px"}}>{selected.first_name} {selected.last_name}</h3><p style={{color:c.textMuted,margin:0}}>{selected.email}</p></div><span className={`tw-status-pill is-${teacherStatus(selected)}`}>{teacherStatus(selected)==="active"?"Active":teacherStatus(selected)==="inactive"?"Inactive":"Pending"}</span></div></div><div className="tw-teacher-detail-section"><ChartTitle title="Access" icon="lock"/><Info label="Status" value={teacherStatus(selected)==="active"?"Active":teacherStatus(selected)==="inactive"?"Inactive":"Pending approval"}/><Info label="Joined" value={fmt(selected.created_at)}/><Info label="Last active" value={`${fmt(selected.last_active_at)} (${teacherRelTime(selected.last_active_at)})`}/></div><div className="tw-teacher-detail-section"><ChartTitle title="Workload" icon="chart"/><Info label="Hosted sessions" value={selected.hosted_sessions_count||0}/><Info label="Assigned sessions" value={selected.assigned_sessions_count||0}/><Info label="Last hosted session" value={fmt(selected.last_session_at)}/><Info label="Classes handled" value={selected.classes_handled_count||0}/></div><div style={{display:"flex",justifyContent:"center",gap:10,marginTop:18}}><AdminPressButton tone={selected.is_active?"red":"blue"} onClick={()=>setConfirm({teacher:selected,action:selected.is_active?"deactivate":"activate"})}>{selected.is_active?"Remove Teacher":"Activate Teacher"}</AdminPressButton></div></>:<Empty text="Select a teacher to view details."/>}</section></div>{selected&&<div className="tw-admin-detail-backdrop" onClick={()=>setSelected(null)}/>}{confirm&&<ThemedModal icon={<TwIcon name="alert" size={30}/>} title={confirm.action==="deactivate"?"Remove Teacher?":"Activate Teacher?"} message={confirm.action==="deactivate"?`Remove ${confirm.teacher.first_name} ${confirm.teacher.last_name}? They will be unable to host new sessions. Their ${Number(confirm.teacher.classes_handled_count||0)} classes and ${Number(confirm.teacher.hosted_sessions_count||0)} past sessions are kept.`:`Activate ${confirm.teacher.first_name} ${confirm.teacher.last_name}? They will be able to host sessions again.`} onClose={()=>setConfirm(null)}><button className="btn secondary" onClick={()=>setConfirm(null)}>Cancel</button><button className="btn" onClick={toggle}>Confirm</button></ThemedModal>}</div>
}

function Institution(){
  const c=useColors();
  const [data,setData]=useState(null);
  const [invite,setInvite]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [confirmInvite,setConfirmInvite]=useState(null);
  const [copiedCode,setCopiedCode]=useState(false);
  const [inviteBusy,setInviteBusy]=useState(false);
  const load=()=>{
    setLoading(true); setError("");
    return Promise.allSettled([api.get("/admin-dashboard/institution"),api.get("/admin-dashboard/invitation")]).then(([institutionResult,inviteResult])=>{
      if(institutionResult.status==="fulfilled") setData(institutionResult.value.data||{});
      else { setData({institution:{},teacherActivity:[],sessionTotalsThisWeek:[]}); setError(institutionResult.reason?.response?.data?.message||"Unable to load institution details."); }
      setInvite(inviteResult.status==="fulfilled"?(inviteResult.value.data||null):null);
    }).finally(()=>setLoading(false));
  };
  useEffect(()=>{load()},[]);
  // Success notices confirm then get out of the way; errors persist with recovery text.
  useEffect(()=>{if(!notice)return undefined;const id=setTimeout(()=>setNotice(""),4500);return()=>clearTimeout(id)},[notice]);
  async function generate(){setInviteBusy(true);try{setError("");const {data:next}=await api.post("/admin-dashboard/invitation",{});setInvite(next||null);setNotice("A fresh invitation code is now active.")}catch(e){setError(e?.response?.data?.message||"Failed to generate invitation code.")}finally{setInviteBusy(false);setConfirmInvite(null)}}
  async function revoke(){if(!invite)return;setInviteBusy(true);try{await api.delete(`/admin-dashboard/invitation/${invite.id}`);setInvite(null);setNotice("Invitation code revoked.")}catch(e){setError(e?.response?.data?.message||"Failed to revoke invitation code.")}finally{setInviteBusy(false);setConfirmInvite(null)}}
  async function copyCode(){const code=invite?.invite_code||"";if(!code)return;try{await navigator.clipboard.writeText(code)}catch{const ta=document.createElement("textarea");ta.value=code;document.body.appendChild(ta);ta.select();try{document.execCommand("copy")}catch{}ta.remove()}setCopiedCode(true);setTimeout(()=>setCopiedCode(false),1600)}
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
      <section style={card(c)} className="tw-admin-invite-card tw-admin-institution-panel"><ChartTitle title="Teacher Invitation" icon="invitation"/>{invite?<><div style={{...quiet(c),textAlign:"center",padding:24,background:"linear-gradient(135deg,rgba(43,108,255,.18),rgba(59,130,246,.08))"}}><small style={{color:c.textMuted}}>Active code</small><div className="tw-admin-invite-code" style={{color:c.accent}}>{invite.invite_code}</div><small style={{display:"block",marginTop:10,color:c.textMuted}}>Active since {fmt(invite.created_at)} · stays active until regenerated or revoked</small><button type="button" className="tw-audit-action-btn" style={{marginTop:10}} onClick={copyCode}>{copiedCode?"Copied":"Copy code"}</button></div><div className="tw-admin-invite-actions"><AdminPressButton tone="blue" onClick={()=>setConfirmInvite("regenerate")} disabled={inviteBusy}>Regenerate</AdminPressButton><AdminPressButton tone="red" onClick={()=>setConfirmInvite("revoke")} disabled={inviteBusy}>Revoke</AdminPressButton></div>{notice&&<div className="tw-admin-invite-notice" style={{...quiet(c),color:c.greenFg,borderColor:c.greenBorder}}>{notice}</div>}</>:<div style={{...quiet(c),textAlign:"center",padding:28}}><p style={{color:c.textMuted}}>No active invitation code yet.</p><AdminPressButton tone="blue" onClick={generate} disabled={inviteBusy}>{inviteBusy?"Working…":"Generate Code"}</AdminPressButton>{notice&&<div className="tw-admin-invite-notice" style={{color:c.greenFg}}>{notice}</div>}</div>}{confirmInvite&&<ThemedModal icon={<TwIcon name="alert" size={30}/>} title={confirmInvite==="revoke"?"Revoke invitation code?":"Regenerate invitation code?"} message={confirmInvite==="revoke"?"No new teachers will be able to join with the current code until you generate a fresh one.":"The current code stops working immediately. Teachers who have not joined yet will need the new code."} onClose={()=>{if(!inviteBusy)setConfirmInvite(null)}}><button className="btn secondary" onClick={()=>setConfirmInvite(null)} disabled={inviteBusy}>Cancel</button><button className="btn" onClick={confirmInvite==="revoke"?revoke:generate} disabled={inviteBusy}>{inviteBusy?"Working…":"Confirm"}</button></ThemedModal>}</section>
      <section className="tw-admin-institution-panel" style={card(c)}><ChartTitle title="Institution Profile" icon="classes"/><Info label="Institution" value={inst.name}/><Info label="Administrator" value={inst.adminName}/><Info label="Admin email" value={inst.adminEmail}/><Info label="Created" value={fmt(inst.createdAt)}/></section>
      <section style={card(c)} className="tw-admin-institution-stats tw-admin-institution-panel"><ChartTitle title="Institution Totals" icon="chart"/><div className="tw-admin-stat-grid">{stats.map(([label,value,icon,tone])=><Metric key={label} label={label} value={value} icon={icon} tone={tone}/>)}</div></section>
    </div>
    <div className="tw-admin-institution-charts"><section className="tw-admin-teacher-activity tw-admin-institution-panel" style={card(c)}><ChartTitle title="Teacher Activity" icon="teacher"/><DonutChart data={teacherActivity} centerLabel="Teachers"/></section><section className="tw-admin-institution-panel" style={card(c)}><ChartTitle title="Session Totals This Week" icon="live"/><BarChart data={sessionTotals} height={220}/></section></div>
  </>}</div>;
}

class AdminDashboardBoundary extends Component{constructor(props){super(props);this.state={failed:false}}static getDerivedStateFromError(){return{failed:true}}componentDidCatch(error,info){console.error("Admin dashboard failed:",error,info)}render(){if(this.state.failed)return <div style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:24,background:this.props.c.pageBg,color:this.props.c.text}}><div style={{background:this.props.c.cardBg,border:`1px solid ${this.props.c.border}`,borderRadius:20,padding:28,width:"min(92vw,620px)",boxShadow:"0 24px 60px rgba(15,23,42,.14)"}}><h2 style={{marginTop:0}}>The admin dashboard could not display this page.</h2><p style={{color:this.props.c.textMuted,lineHeight:1.6}}>Refresh the browser once. If the problem continues, check the server terminal for the failed admin-dashboard request instead of seeing an empty blue screen.</p><button className="btn" onClick={()=>window.location.reload()}>Refresh Dashboard</button></div></div>;return this.props.children}}

class AdminTabBoundary extends Component{constructor(props){super(props);this.state={failed:false}}static getDerivedStateFromError(){return{failed:true}}componentDidCatch(error,info){console.error("Admin dashboard tab failed:",error,info)}render(){if(this.state.failed)return <div className="container"><div style={{background:this.props.c.cardBg,border:`1px solid ${this.props.c.border}`,borderRadius:18,padding:24,color:this.props.c.text}}><h2 style={{marginTop:0}}>This tab could not be displayed.</h2><p style={{color:this.props.c.textMuted}}>Refresh the page. If the issue continues, check the server terminal for the matching admin-dashboard request.</p></div></div>;return this.props.children}}
function normalizeDailySessions(rows){const normalized=(rows||[]).map(row=>({dayStart:row.dayStart||row.day_start||row.day_key,live:Number(row.live??row.live_total??0),assigned:Number(row.assigned??row.assigned_total??0)}));const map=new Map(normalized.map(row=>[String(row.dayStart||"").slice(0,10),row]));const now=new Date();const monday=new Date(now);monday.setHours(0,0,0,0);monday.setDate(now.getDate()-((now.getDay()+6)%7));return Array.from({length:7},(_,index)=>{const date=new Date(monday);date.setDate(monday.getDate()+index);const key=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;const row=map.get(key)||{};return{dayStart:key,label:["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][index],live:Number(row.live||0),assigned:Number(row.assigned||0)}})}
function ApiMessage({text}){const c=useColors();return <div style={{...quiet(c),margin:"0 0 16px",color:c.redFg,borderColor:c.redBorder,background:c.redBg}}><TwIcon name="alert" size={18}/> <span>{text}</span></div>}
function LoadingCard({text}){return <TwLogoLoader minHeight="20vh" label={text || "Loading"} />}
