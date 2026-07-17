import React from "react";
import { useColors } from "../context/ThemeContext";
import { TwIcon } from "./TwUI";
import ThemeIconButton from "./ThemeIconButton";
import { DashboardAvatarButton } from "./ProfileSettings";

export default function DashboardShell({ navItems, activeTab, setActiveTab, dark, toggleTheme, onLogout, profile, onProfile, children }){
  const c=useColors();
  return <div style={{display:"flex",minHeight:"100vh",background:c.pageBg}}>
    <aside data-sidebar="true" className="tw-standard-sidebar" style={{background:c.sidebarBg,borderColor:c.sidebarBorder}}>
      <div className="tw-standard-sidebar-head" style={{borderColor:c.sidebarBorder}}><div><span>Think</span><span>WAVE</span></div><DashboardAvatarButton profile={profile} onClick={onProfile}/></div>
      <nav>{navItems.map(item=><button key={item.id} onClick={()=>setActiveTab(item.id)} className={activeTab===item.id?"active":""} style={{color:activeTab===item.id?"#fff":c.navColor}}><TwIcon name={item.icon} size={18}/><span>{item.label}</span></button>)}</nav>
      <div className="tw-standard-sidebar-bottom">
        <ThemeIconButton dark={dark} onClick={toggleTheme} style={{color:c.navColor,borderColor:c.sidebarBorder,background:"transparent"}}/>
        <button onClick={onLogout} style={{color:c.navColor,borderColor:c.sidebarBorder}}><TwIcon name="logout" size={17}/><span>Logout</span></button>
      </div>
    </aside>
    <main className="tw-standard-dashboard-main"><div key={activeTab} className="dashboard-tab-panel">{children}</div></main>
  </div>
}
