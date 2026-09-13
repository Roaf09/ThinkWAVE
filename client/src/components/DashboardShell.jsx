import { useColors } from "../context/ThemeContext";
import { TwIcon } from "./TwUI";
import ThemeIconButton from "./ThemeIconButton";
import { DashboardAvatarButton } from "./ProfileSettings";

export function sidebarStyle(c) { return { width: 220, minWidth: 220, background: c.sidebarBg, borderRight: `1px solid ${c.sidebarBorder}`, display: "flex", flexDirection: "column", padding: "0 0 24px", position: "fixed", top: 0, left: 0, height: "100vh", overflowY: "auto", zIndex: 100, transition: "background .3s,border-color .3s" }; }
export function dashboardNavButtonStyle(c, active) { return { display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderRadius: 12, border: "none", background: active ? "linear-gradient(135deg,#2b6cff,#5b7cff)" : "transparent", boxShadow: active ? "0 5px 0 rgba(18,54,145,.5),0 10px 20px rgba(43,108,255,.18)" : "none", transform: active ? "translateY(-1px)" : "none", color: active ? "#fff" : c.navColor, fontFamily: "inherit", fontSize: 14, fontWeight: 700, cursor: "pointer", textAlign: "left", width: "100%", transition: "transform .18s ease,background .2s,color .2s,box-shadow .18s ease" }; }
import { MobileTopHeader, MobileTabBar } from "./MobileAppChrome";

export default function DashboardShell({ navItems, activeTab, setActiveTab, dark, toggleTheme, onLogout, profile, onProfile, children, mobileTabIconsOnly = false }){
  const c=useColors();
  const displayName = `${profile?.firstName || ""} ${profile?.lastName || ""}`.trim() || "Admin";
  return <div className="tw-responsive-dashboard" style={{display:"flex",minHeight:"100vh",background:c.pageBg}}>
    <MobileTopHeader
      c={c}
      name={displayName}
      email={profile?.email || ""}
      avatarSrc={profile?.profileImage || ""}
      dark={dark}
      toggleTheme={toggleTheme}
      onSettings={onProfile}
      onLogout={onLogout}
    />
    <aside data-sidebar="true" className="tw-standard-sidebar tw-responsive-sidebar" style={{background:c.sidebarBg,borderColor:c.sidebarBorder}}>
      <div className="tw-standard-sidebar-head" style={{borderColor:c.sidebarBorder}}><div><span>Think</span><span>WAVE</span></div><DashboardAvatarButton profile={profile} onClick={onProfile}/></div>
      <nav>{navItems.map(item=><button key={item.id} onClick={()=>setActiveTab(item.id)} className={activeTab===item.id?"active":""} style={{color:activeTab===item.id?"#fff":c.navColor}}><TwIcon name={item.icon} size={18}/><span>{item.label}</span></button>)}</nav>
      <div className="tw-standard-sidebar-bottom">
        <ThemeIconButton dark={dark} onClick={toggleTheme} style={{color:c.navColor,borderColor:c.sidebarBorder,background:"transparent"}}/>
        <button onClick={onLogout} style={{color:c.navColor,borderColor:c.sidebarBorder}}><TwIcon name="logout" size={17}/><span>Logout</span></button>
      </div>
    </aside>
    <main className="tw-standard-dashboard-main tw-responsive-dashboard-main"><div key={activeTab} className="dashboard-tab-panel">{children}</div></main>
    <MobileTabBar c={c} items={navItems} activeId={activeTab} onSelect={setActiveTab} iconsOnly={mobileTabIconsOnly} />
  </div>
}
