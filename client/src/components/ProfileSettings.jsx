import React, { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { useColors } from "../context/ThemeContext";
import { TwIcon } from "./TwUI";

const emptyProfile = { firstName:"", lastName:"", contactNumber:"", email:"", institutionName:"", profileImage:"" };

export function useDashboardProfile() {
  const [profile, setProfile] = useState(emptyProfile);
  const [profileOpen, setProfileOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { api.get("/auth/me").then(({data}) => setProfile(profileFromUser(data))).catch(() => {}); }, []);
  return { profile, setProfile, profileOpen, setProfileOpen, saved, setSaved };
}

export function DashboardAvatarButton({ profile, onClick, label = "Profile settings" }) {
  const c = useColors();
  return <button type="button" onClick={onClick} title={label} aria-label={label} style={{width:38,height:38,borderRadius:"50%",border:`1px solid ${c.sidebarBorder}`,background:"rgba(255,255,255,.08)",color:c.navColor,display:"grid",placeItems:"center",padding:0,overflow:"hidden",cursor:"pointer",transition:"transform .2s ease, background .2s ease"}} className="tw-avatar-button">
    {profile?.profileImage ? <img src={profile.profileImage} alt="Profile" style={{width:"100%",height:"100%",objectFit:"cover"}}/> : <TwIcon name="user" size={20}/>} 
  </button>;
}

export function ProfileSettingsModal({ roleLabel="User", profile, setProfile, onClose, onSaved, showInstitution = true }) {
  const c = useColors();
  const fileRef = useRef(null);
  const [error,setError] = useState("");
  const [saving,setSaving] = useState(false);

  function pickFile(file){
    if(!file) return;
    if(!String(file.type||"").startsWith("image/")) return setError("Please choose an image file.");
    if(file.size>2_500_000) return setError("Profile image must be 2.5 MB or smaller.");
    const reader=new FileReader();
    reader.onload=()=>setProfile(p=>({...p,profileImage:String(reader.result||"")}));
    reader.readAsDataURL(file);
  }
  async function submit(e){
    e.preventDefault(); setError(""); setSaving(true);
    try{
      const {data}=await api.patch("/auth/me",{firstName:profile.firstName,lastName:profile.lastName,contactNumber:profile.contactNumber||null,profileImage:profile.profileImage||null});
      setProfile(profileFromUser(data)); onClose(); onSaved?.();
    }catch(err){setError(err?.response?.data?.message||"Unable to save profile settings.");}
    finally{setSaving(false);}
  }
  return <div className="tw-profile-modal-backdrop"><form onSubmit={submit} className="tw-profile-modal-card" style={{background:c.cardBg3,borderColor:c.border,color:c.text}}>
    <button type="button" onClick={onClose} className="tw-profile-modal-close" style={{color:c.text,borderColor:c.border,background:c.cardBg2}}><TwIcon name="close" size={18}/></button>
    <h3>{roleLabel} Info</h3>
    <div className="tw-profile-modal-head">
      <div className="tw-profile-modal-avatar" style={{borderColor:c.accent,background:c.cardBg2}}>{profile.profileImage?<img src={profile.profileImage} alt="Profile"/>:<TwIcon name="user" size={48}/>}</div>
      <div className="tw-profile-modal-actions"><button type="button" className="btn" onClick={()=>fileRef.current?.click()}><TwIcon name="upload" size={16}/> Upload Profile</button><button type="button" className="btn secondary" onClick={()=>setProfile(p=>({...p,profileImage:""}))} style={{color:c.redFg,borderColor:c.redBorder}}><TwIcon name="trash" size={16}/> Delete Profile</button></div>
    </div>
    <input ref={fileRef} type="file" hidden accept="image/*" onChange={e=>{pickFile(e.target.files?.[0]);e.target.value=""}}/>
    <h4>{roleLabel} Details</h4>
    <div className="tw-profile-fields">
      <label>First name *<input required value={profile.firstName} onChange={e=>setProfile(p=>({...p,firstName:e.target.value}))} style={fieldStyle(c)}/></label>
      <label>Last name *<input required value={profile.lastName} onChange={e=>setProfile(p=>({...p,lastName:e.target.value}))} style={fieldStyle(c)}/></label>
      <label>Email<input disabled value={profile.email} style={{...fieldStyle(c),opacity:.72}}/></label>
      <label>Contact number<input value={profile.contactNumber} onChange={e=>setProfile(p=>({...p,contactNumber:e.target.value}))} style={fieldStyle(c)}/></label>
      {showInstitution && <label className="tw-profile-field-wide">Institution<input disabled value={profile.institutionName||"Not linked"} style={{...fieldStyle(c),opacity:.72}}/></label>}
    </div>
    {error&&<div className="tw-profile-error" style={{background:c.redBg,borderColor:c.redBorder,color:c.redFg}}>{error}</div>}
    <div className="tw-profile-submit-row"><button className="btn" disabled={saving}>{saving?"Saving…":"Save"}</button></div>
  </form></div>;
}

export function ProfileSavedOverlay(){return <div className="tw-profile-success-backdrop"><div className="tw-profile-success-box"><TwIcon name="check" size={58} strokeWidth={3.4}/></div></div>}

export function profileFromUser(user={}){return {firstName:user.first_name||"",lastName:user.last_name||"",contactNumber:user.contact_number||"",email:user.email||"",institutionName:user.institution_name||"",profileImage:user.profile_image||""}}
function fieldStyle(c){return {width:"100%",boxSizing:"border-box",padding:"11px 12px",borderRadius:12,border:`1px solid ${c.inputBorder}`,background:c.inputBg,color:c.text}}
