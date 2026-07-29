import { pool } from "../../db.js";
import crypto from "crypto";
import { getSystemMetrics } from "../../metrics.js";
import { env } from "../../env.js";
import { sendMail, thinkwaveEmailTemplate } from "../../utils/mailer.js";

const n=v=>Number(v||0);
const safeJson=v=>{if(!v)return null;if(typeof v==="object")return v;try{return JSON.parse(v)}catch{return null}};

export async function getStats(_req,res){
  const [[counts]]=await pool.query(`SELECT COUNT(DISTINCT CASE WHEN role='ADMIN' AND institution_name IS NOT NULL AND TRIM(institution_name)<>'' AND deleted_at IS NULL THEN institution_name END) total_institutions,COUNT(DISTINCT CASE WHEN role='ADMIN' AND institution_name IS NOT NULL AND TRIM(institution_name)<>'' AND deleted_at IS NULL AND is_active=1 THEN institution_name END) active_institutions,SUM(role='ADMIN' AND deleted_at IS NULL) total_admins,SUM(role='ADMIN' AND deleted_at IS NULL AND is_active=1) active_admins,SUM(role='TEACHER' AND deleted_at IS NULL) total_teachers,SUM(role='TEACHER' AND deleted_at IS NULL AND is_active=1) active_teachers,SUM(role='STUDENT' AND deleted_at IS NULL) total_students,SUM(role='STUDENT' AND deleted_at IS NULL AND is_active=1) active_students FROM users`);
  const [timeline]=await pool.query(`SELECT DATE_SUB(DATE(created_at),INTERVAL WEEKDAY(created_at) DAY) week_start,COUNT(*) total FROM users WHERE created_at>=DATE_SUB(CURDATE(),INTERVAL 11 WEEK) GROUP BY DATE_SUB(DATE(created_at),INTERVAL WEEKDAY(created_at) DAY) ORDER BY week_start`);
  const [sessionTrend]=await pool.query(`SELECT DATE_FORMAT(COALESCE(ended_at,created_at),'%Y-%m') month,COUNT(*) total FROM sessions WHERE COALESCE(ended_at,created_at)>=DATE_SUB(CURDATE(),INTERVAL 11 MONTH) GROUP BY DATE_FORMAT(COALESCE(ended_at,created_at),'%Y-%m') ORDER BY month`);
  const [[sessions]]=await pool.query(`SELECT SUM(status='LIVE') active_live,SUM(status='PAUSED') paused_live,SUM(status='ENDED' AND COALESCE(ended_at,created_at)>=DATE_SUB(NOW(),INTERVAL 7 DAY)) completed_week FROM sessions`);
  res.json({totalInstitutions:n(counts.total_institutions),activeInstitutions:n(counts.active_institutions),totalAdmins:n(counts.total_admins),activeAdmins:n(counts.active_admins),totalTeachers:n(counts.total_teachers),activeTeachers:n(counts.active_teachers),totalStudents:n(counts.total_students),activeStudents:n(counts.active_students),activeLive:n(sessions.active_live),pausedLive:n(sessions.paused_live),completedThisWeek:n(sessions.completed_week),accountTimeline:timeline.map(x=>({weekStart:x.week_start,total:n(x.total)})),sessionTimeline:sessionTrend.map(x=>({month:x.month,total:n(x.total)})),accountDistribution:[{label:'Admins',value:n(counts.total_admins)},{label:'Teachers',value:n(counts.total_teachers)},{label:'Students',value:n(counts.total_students)}]});
}

export async function listAccounts(_req,res){
  const [admins]=await pool.query(`SELECT id,email,first_name,last_name,is_active,contact_number,institution_name,created_at,last_active_at FROM users WHERE role='ADMIN' AND deleted_at IS NULL AND institution_name IS NOT NULL AND TRIM(institution_name)<>'' ORDER BY institution_name,created_at`);
  const [teachers]=await pool.query(`SELECT id,email,first_name,last_name,is_active,contact_number,institution_name,created_at,last_active_at FROM users WHERE role='TEACHER' AND deleted_at IS NULL AND institution_name IS NOT NULL AND TRIM(institution_name)<>'' ORDER BY institution_name,last_name,first_name`);
  let stats=[];
  try{
    [stats]=await pool.query(`SELECT inst.institution_name,
      COUNT(DISTINCT t.id) teacher_count,
      COUNT(DISTINCT CASE WHEN t.is_active=1 THEN t.id END) active_teacher_count,
      COUNT(DISTINCT ce.student_user_id) student_count,
      COUNT(DISTINCT c.id) class_count,
      COUNT(DISTINCT s.id) live_session_count,
      COUNT(DISTINCT CASE WHEN aq.delivery_mode='ASYNCHRONOUS' AND aq.deleted_at IS NULL THEN aq.id END) assigned_session_count,
      MAX(GREATEST(COALESCE(s.ended_at,'1970-01-01'),COALESCE(s.created_at,'1970-01-01'),COALESCE(aq.created_at,'1970-01-01'))) last_activity
      FROM (SELECT DISTINCT institution_name FROM users WHERE institution_name IS NOT NULL AND TRIM(institution_name)<>'' AND deleted_at IS NULL) inst
      LEFT JOIN users t ON t.institution_name=inst.institution_name AND t.role='TEACHER' AND t.deleted_at IS NULL
      LEFT JOIN classes c ON c.teacher_id=t.id AND c.deleted_at IS NULL
      LEFT JOIN class_enrollments ce ON ce.class_id=c.id AND ce.removed_at IS NULL
      LEFT JOIN sessions s ON s.teacher_id=t.id
      LEFT JOIN quizzes aq ON aq.teacher_id=t.id
      GROUP BY inst.institution_name`);
  }catch(error){console.warn('Superadmin institution statistics fallback:',error?.message||error);}
  const map={};const sm=Object.fromEntries(stats.map(row=>[row.institution_name,row]));
  for(const admin of admins){const name=String(admin.institution_name||'').trim();if(!name)continue;const row=sm[name]||{};map[name]={name,admin,teachers:[],teacherCount:n(row.teacher_count),activeTeacherCount:n(row.active_teacher_count),studentCount:n(row.student_count),classCount:n(row.class_count),liveSessionCount:n(row.live_session_count),assignedSessionCount:n(row.assigned_session_count),lastActivity:row.last_activity||admin.last_active_at||admin.created_at};}
  for(const teacher of teachers){const name=String(teacher.institution_name||'').trim();if(!name)continue;const row=sm[name]||{};map[name] ||= {name,admin:null,teachers:[],teacherCount:n(row.teacher_count),activeTeacherCount:n(row.active_teacher_count),studentCount:n(row.student_count),classCount:n(row.class_count),liveSessionCount:n(row.live_session_count),assignedSessionCount:n(row.assigned_session_count),lastActivity:row.last_activity||teacher.last_active_at||teacher.created_at};map[name].teachers.push(teacher);}
  res.json(Object.values(map).sort((a,b)=>String(a.name).localeCompare(String(b.name))));
}

export async function listPending(_req,res){const [rows]=await pool.query(`SELECT id,role,email,first_name,last_name,contact_number,institution_name,created_at FROM users WHERE approval_status='PENDING' AND deleted_at IS NULL ORDER BY created_at`);res.json(rows)}
export async function approveAccount(req,res){const [[user]]=await pool.query(`SELECT * FROM users WHERE id=:id AND deleted_at IS NULL`,{id:req.params.id});await pool.query(`UPDATE users SET approval_status='APPROVED' WHERE id=:id AND deleted_at IS NULL`,{id:req.params.id});if(user){try{await pool.query(`INSERT INTO system_notifications(type,user_id,name,email,role,institution_name,payload_json) VALUES('ADMIN_APPROVED',:uid,:name,:email,:role,:inst,:payload)`,{uid:user.id,name:`${user.first_name||''} ${user.last_name||''}`.trim(),email:user.email,role:user.role,inst:user.institution_name,payload:JSON.stringify({performedBy:req.user.sub})})}catch{}}res.json({ok:true})}
export async function rejectAccount(req,res){const [[user]]=await pool.query(`SELECT * FROM users WHERE id=:id AND deleted_at IS NULL`,{id:req.params.id});await pool.query(`UPDATE users SET approval_status='REJECTED' WHERE id=:id AND deleted_at IS NULL`,{id:req.params.id});if(user){try{await pool.query(`INSERT INTO system_notifications(type,user_id,name,email,role,institution_name,payload_json) VALUES('ADMIN_DISAPPROVED',:uid,:name,:email,:role,:inst,:payload)`,{uid:user.id,name:`${user.first_name||''} ${user.last_name||''}`.trim(),email:user.email,role:user.role,inst:user.institution_name,payload:JSON.stringify({performedBy:req.user.sub})})}catch{}}res.json({ok:true})}
export async function setActive(req,res){const [[user]]=await pool.query(`SELECT * FROM users WHERE id=:id AND deleted_at IS NULL`,{id:req.params.id});const active=req.body?.active?1:0;await pool.query(`UPDATE users SET is_active=:a WHERE id=:id AND deleted_at IS NULL`,{a:active,id:req.params.id});if(user&&!active){try{await pool.query(`INSERT INTO system_notifications(type,user_id,name,email,role,institution_name,payload_json) VALUES('ADMIN_DEACTIVATED',:uid,:name,:email,:role,:inst,:payload)`,{uid:user.id,name:`${user.first_name||''} ${user.last_name||''}`.trim(),email:user.email,role:user.role,inst:user.institution_name,payload:JSON.stringify({performedBy:req.user.sub})})}catch{}}res.json({ok:true})}
export async function deleteAccount(req,res){const [[user]]=await pool.query(`SELECT * FROM users WHERE id=:id`,{id:req.params.id});await pool.query(`UPDATE users SET deleted_at=NOW() WHERE id=:id`,{id:req.params.id});if(user){try{await pool.query(`INSERT INTO system_notifications(type,user_id,name,email,role,institution_name,payload_json) VALUES('ACCOUNT_DELETED',:uid,:name,:email,:role,:inst,:payload)`,{uid:user.id,name:`${user.first_name} ${user.last_name}`.trim(),email:user.email,role:user.role,inst:user.institution_name,payload:JSON.stringify({deletedBy:'SUPERADMIN'})})}catch{}}res.json({ok:true})}

export async function getNotifications(req,res){
  const search=String(req.query.search||"").trim(); const type=String(req.query.type||"ALL").trim();
  const params={search:`%${search}%`,type};
  const [rows]=await pool.query(`SELECT id,type,user_id,name,email,role,institution_name,payload_json,status,created_at FROM system_notifications WHERE (:type='ALL' OR type=:type2) AND (:search='%%' OR COALESCE(name,'') LIKE :search2 OR COALESCE(email,'') LIKE :search3 OR COALESCE(institution_name,'') LIKE :search4) ORDER BY created_at DESC LIMIT 250`,{type,type2:type,search:params.search,search2:params.search,search3:params.search,search4:params.search});
  let legacy=[]; if(type==='ALL'||['USER_REGISTERED','INSTITUTION_SETUP'].includes(type)){try{const [old]=await pool.query(`SELECT id,IF(type='REGISTERED','USER_REGISTERED',type) type,user_id,name,email,role,institution_name,NULL payload_json,'READ' status,created_at FROM activity_log WHERE (:search='%%' OR COALESCE(name,'') LIKE :search2 OR COALESCE(email,'') LIKE :search3 OR COALESCE(institution_name,'') LIKE :search4) ORDER BY created_at DESC LIMIT 100`,{search:params.search,search2:params.search,search3:params.search,search4:params.search});legacy=old}catch{}}
  res.json([...rows.map(x=>({...x,payload:safeJson(x.payload_json)})),...legacy.map(x=>({...x,payload:null,legacy:true}))].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,250));
}

export async function reviewApplication(req,res){
  const id=Number(req.params.id); const decision=String(req.body?.decision||'').toUpperCase(); if(!['APPROVED','DISAPPROVED'].includes(decision))return res.status(400).json({message:'Invalid decision.'});
  const [[app]]=await pool.query(`SELECT * FROM institution_applications WHERE id=:id`,{id}); if(!app)return res.status(404).json({message:'Application not found.'});
  if(!['PENDING','APPROVED_FOR_PAYMENT'].includes(app.status) && decision==='APPROVED') return res.status(409).json({message:'This application has already been processed.'});
  let status='DISAPPROVED', emailSent=false;
  if(decision==='APPROVED'){
    const rawToken=crypto.randomBytes(32).toString('hex'); const tokenHash=crypto.createHash('sha256').update(rawToken).digest('hex');
    await pool.query(`UPDATE admin_invitations SET used_at=COALESCE(used_at,NOW()) WHERE application_id=:id AND used_at IS NULL`,{id});
    await pool.query(`INSERT INTO admin_invitations(application_id,institution_name,email,token_hash,expires_at,created_by) VALUES(:id,:institution,:email,:hash,DATE_ADD(NOW(),INTERVAL 7 DAY),:uid)`,{id,institution:app.institution_name,email:app.work_email,hash:tokenHash,uid:req.user.sub});
    status='PAYMENT_CONFIRMED';
    await pool.query(`UPDATE institution_applications SET status=:status,reviewed_by=:uid,reviewed_at=NOW(),payment_confirmed_by=:uid,payment_confirmed_at=NOW() WHERE id=:id`,{status,uid:req.user.sub,id});
    const registrationUrl=`${String(env.CLIENT_ORIGIN).replace(/\/$/,'')}/register?adminInvite=${rawToken}`;
    const html=thinkwaveEmailTemplate({eyebrow:'Institution Plan approved',title:'Create your ThinkWAVE Admin account',intro:`Your application for <strong>${app.institution_name}</strong> has been approved and the submitted GCash transaction has been confirmed.`,bodyHtml:'<p style="font-size:14px;line-height:1.7;color:#4b5563">Use the secure link below to create the first Admin account. The link is tied to this work email, can be used once, and expires in seven days.</p>',actionLabel:'Create Admin account',actionUrl:registrationUrl,footer:'Do not forward this link. If you did not submit this application, contact ThinkWAVE support.'});
    const mail=await sendMail({to:app.work_email,subject:'Your ThinkWAVE Institution Plan was approved',text:`Your application was approved. Create your Admin account: ${registrationUrl}`,html}); emailSent=mail.sent;
  } else {
    await pool.query(`UPDATE institution_applications SET status=:status,reviewed_by=:uid,reviewed_at=NOW() WHERE id=:id`,{status,uid:req.user.sub,id});
    await pool.query(`UPDATE admin_invitations SET used_at=COALESCE(used_at,NOW()) WHERE application_id=:id AND used_at IS NULL`,{id});
    const html=thinkwaveEmailTemplate({eyebrow:'Institution Plan update',title:'Application not approved',intro:`Thank you for applying for the ThinkWAVE Institution Plan for <strong>${app.institution_name}</strong>.`,bodyHtml:'<p style="font-size:14px;line-height:1.7;color:#4b5563">After reviewing the submitted details, we are unable to approve the application at this time.</p>',footer:'You may contact ThinkWAVE support if you need clarification or want to submit a new application.'});
    const mail=await sendMail({to:app.work_email,subject:'Update on your ThinkWAVE Institution Plan application',text:'Your ThinkWAVE Institution Plan application was not approved.',html}); emailSent=mail.sent;
  }
  await pool.query(`UPDATE system_notifications SET status=:status WHERE type='PLAN_APPLICATION' AND JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.applicationId'))=:idText`,{status,idText:String(id)});
  res.json({ok:true,status,emailSent});
}

export async function confirmApplicationPayment(req,res){
  const id=Number(req.params.id); const [[app]]=await pool.query(`SELECT * FROM institution_applications WHERE id=:id`,{id});
  if(!app)return res.status(404).json({message:'Application not found.'});
  if(app.status!=='APPROVED_FOR_PAYMENT'&&app.status!=='PAYMENT_CONFIRMED')return res.status(409).json({message:'Approve the institution before confirming payment.'});
  const rawToken=crypto.randomBytes(32).toString('hex'); const tokenHash=crypto.createHash('sha256').update(rawToken).digest('hex');
  await pool.query(`UPDATE institution_applications SET status='PAYMENT_CONFIRMED',payment_confirmed_by=:uid,payment_confirmed_at=NOW() WHERE id=:id`,{uid:req.user.sub,id});
  await pool.query(`UPDATE admin_invitations SET used_at=COALESCE(used_at,NOW()) WHERE application_id=:id AND used_at IS NULL`,{id});
  await pool.query(`INSERT INTO admin_invitations(application_id,institution_name,email,token_hash,expires_at,created_by) VALUES(:id,:institution,:email,:hash,DATE_ADD(NOW(),INTERVAL 7 DAY),:uid)`,{id,institution:app.institution_name,email:app.work_email,hash:tokenHash,uid:req.user.sub});
  await pool.query(`UPDATE system_notifications SET status='PAYMENT_CONFIRMED' WHERE type='PLAN_APPLICATION' AND JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.applicationId'))=:idText`,{idText:String(id)});
  res.json({ok:true,status:'PAYMENT_CONFIRMED',adminInviteToken:rawToken,registrationPath:`/register?adminInvite=${rawToken}`});
}

export async function getHealth(_req,res){
  const system=getSystemMetrics();
  let db={connected:true,users:0,sessions:0,classes:0};
  try{const [[row]]=await pool.query(`SELECT (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL) users,(SELECT COUNT(*) FROM sessions) sessions,(SELECT COUNT(*) FROM classes WHERE deleted_at IS NULL) classes`);db={connected:true,users:n(row.users),sessions:n(row.sessions),classes:n(row.classes)}}catch{db.connected=false}
  res.json({...system,database:db});
}
