import { useEffect, useRef, useState } from "react";
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
  return <button type="button" onClick={onClick} title={label} aria-label={label} style={{border:`1px solid ${c.sidebarBorder}`,background:"rgba(255,255,255,.08)",color:c.navColor,transition:"transform .2s ease, background .2s ease"}} className="tw-avatar-button grid place-items-center overflow-hidden rounded-full cursor-pointer p-0 w-[38px] h-[38px]">
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
  return <div className="tw-profile-modal-backdrop fixed inset-0 z-[800] grid place-items-center p-5 bg-[rgba(2,8,23,0.58)] backdrop-blur-[8px]"><form onSubmit={submit} className="tw-profile-modal-card w-[min(94vw,620px)] rounded-[22px] p-7 relative border border-solid shadow-[0_28px_90px_rgba(0,0,0,0.35)]" style={{background:c.cardBg3,borderColor:c.border,color:c.text}}>
    <button type="button" onClick={onClose} className="tw-profile-modal-close absolute right-[14px] top-[14px] w-[38px] h-[38px] grid place-items-center rounded-[11px] cursor-pointer border border-solid" style={{color:c.text,borderColor:c.border,background:c.cardBg2}}><TwIcon name="close" size={18}/></button>
    <h3>{roleLabel} Info</h3>
    <div className="tw-profile-modal-head tw-profile-modal-head-centered flex items-center gap-[18px] flex-wrap mb-[22px]">
      <div className="tw-profile-avatar-picker relative inline-grid place-items-center">
        <button type="button" className="tw-profile-modal-avatar tw-profile-modal-avatar-button w-[106px] h-[106px] rounded-full grid place-items-center overflow-hidden" onClick={()=>fileRef.current?.click()} aria-label="Upload profile picture" title="Upload profile picture" style={{border:`3px solid ${c.accent}`,background:c.cardBg2,color:c.text}}>
          {profile.profileImage?<img src={profile.profileImage} alt="Profile" className="w-full h-full object-cover"/>:<TwIcon name="user" size={48}/>}
        </button>
        {profile.profileImage&&<button type="button" className="tw-profile-avatar-remove absolute top-0 right-0 translate-x-[28%] -translate-y-[28%] w-[29px] h-[29px] p-0 rounded-full grid place-items-center cursor-pointer shadow-[0_6px_18px_rgba(0,0,0,0.22)]" onClick={()=>setProfile(p=>({...p,profileImage:""}))} aria-label="Remove profile picture" title="Remove profile picture" style={{background:c.cardBg3,color:c.redFg,border:`1px solid ${c.redBorder}`}}><TwIcon name="close" size={15} strokeWidth={3}/></button>}
      </div>
    </div>
    <input ref={fileRef} type="file" hidden accept="image/*" onChange={e=>{pickFile(e.target.files?.[0]);e.target.value=""}}/>
    <h4>{roleLabel} Details</h4>
    <div className="tw-profile-fields grid grid-cols-[repeat(2,minmax(0,1fr))] gap-3">
      <label className="grid gap-[7px] text-xs font-[850]">First name *<input required value={profile.firstName} onChange={e=>setProfile(p=>({...p,firstName:e.target.value}))} style={fieldStyle(c)}/></label>
      <label className="grid gap-[7px] text-xs font-[850]">Last name *<input required value={profile.lastName} onChange={e=>setProfile(p=>({...p,lastName:e.target.value}))} style={fieldStyle(c)}/></label>
      <label className="grid gap-[7px] text-xs font-[850]">Email<input disabled value={profile.email} style={{...fieldStyle(c),opacity:.72}}/></label>
      <label className="grid gap-[7px] text-xs font-[850]">Contact number<input value={profile.contactNumber} onChange={e=>setProfile(p=>({...p,contactNumber:e.target.value}))} style={fieldStyle(c)}/></label>
      {showInstitution && <label className="tw-profile-field-wide col-span-full grid gap-[7px] text-xs font-[850]">Institution<input disabled value={profile.institutionName||"Not linked"} style={{...fieldStyle(c),opacity:.72}}/></label>}
    </div>
    {error&&<div className="tw-profile-error mt-3.5 p-3 border border-solid rounded-xl font-extrabold" style={{background:c.redBg,borderColor:c.redBorder,color:c.redFg}}>{error}</div>}
    <div className="tw-profile-submit-row flex justify-end mt-5"><button className="btn" disabled={saving}>{saving?"Saving…":"Save"}</button></div>
  </form></div>;
}

export function ProfileSavedOverlay(){return <div className="tw-profile-success-backdrop"><div className="tw-profile-success-box"><TwIcon name="check" size={58} strokeWidth={3.4}/></div></div>}

export function profileFromUser(user={}){return {firstName:user.first_name||"",lastName:user.last_name||"",contactNumber:user.contact_number||"",email:user.email||"",institutionName:user.institution_name||"",profileImage:user.profile_image||""}}
function fieldStyle(c){return {width:"100%",boxSizing:"border-box",padding:"11px 12px",borderRadius:12,border:`1px solid ${c.inputBorder}`,background:c.inputBg,color:c.text}}
