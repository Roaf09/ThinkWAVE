import { pool } from "../../db.js";

export async function getPublicStats(_req,res){try{const [[row]]=await pool.query(`SELECT (SELECT COUNT(*) FROM sessions WHERE status='ENDED')+(SELECT COUNT(*) FROM async_quiz_submissions) AS sessions_completed,(SELECT COUNT(DISTINCT institution_name) FROM users WHERE role='ADMIN' AND institution_name IS NOT NULL AND TRIM(institution_name)<>'' AND deleted_at IS NULL) AS institutions_count,(SELECT COUNT(*) FROM classes WHERE deleted_at IS NULL) AS classes_created`);return res.json({sessionsCompleted:Number(row?.sessions_completed||0),institutionsEmpowered:Number(row?.institutions_count||0),classesCreated:Number(row?.classes_created||0)});}catch(error){console.warn("Public statistics unavailable:",error?.code||error?.message||error);return res.json({sessionsCompleted:0,institutionsEmpowered:0,classesCreated:0});}}

export async function createPlanApplication(req,res){
  const {planType,institutionName,firstName,lastName,workEmail,country,role,phone,paymentMethod,gcashReference}=req.body||{};
  const type=String(planType||"INSTITUTION").toUpperCase();
  if(!["PRO","INSTITUTION"].includes(type)) return res.status(400).json({message:"Invalid plan type."});
  if(!firstName?.trim()||!lastName?.trim()||!workEmail?.trim()||!country?.trim()||!phone?.trim()) return res.status(400).json({message:"All required application fields must be completed."});
  if(type==="INSTITUTION"&&(!institutionName?.trim()||!role?.trim())) return res.status(400).json({message:"Institution name and role are required."});
  if(!/^9\d{9}$/.test(String(phone).trim())) return res.status(400).json({message:"Enter a valid Philippine mobile number after +63."});
  if(!/^\d{13}$/.test(String(gcashReference||"").trim())) return res.status(400).json({message:"Enter the 13-digit GCash transaction reference."});
  if(paymentMethod!=="GCASH") return res.status(400).json({message:"Please choose GCash as the payment method."});
  const email=workEmail.trim().toLowerCase();
  let userId=null;
  if(type==="PRO"){
    const [[teacher]]=await pool.query(`SELECT id,role FROM users WHERE email=:email AND deleted_at IS NULL LIMIT 1`,{email});
    if(!teacher||teacher.role!=="TEACHER") return res.status(400).json({message:"ThinkWAVE Pro requires an existing registered Teacher account using this email."});
    userId=teacher.id;
  }
  try{
    const [result]=await pool.query(`INSERT INTO institution_applications(plan_type,user_id,institution_name,first_name,last_name,work_email,country,role_description,phone_number,estimated_teachers,estimated_students,gcash_reference) VALUES(:planType,:userId,:institution,:fn,:ln,:email,:country,:role,:phone,1,0,:reference)`,{planType:type,userId,institution:type==="INSTITUTION"?institutionName.trim():null,fn:firstName.trim(),ln:lastName.trim(),email,country:country.trim(),role:type==="PRO"?"Individual Teacher":role.trim(),phone:`+63${phone.trim()}`,reference:String(gcashReference).trim()});
    await pool.query(`INSERT INTO system_notifications(type,user_id,name,email,role,institution_name,payload_json) VALUES('PLAN_APPLICATION',:userId,:name,:email,:role,:institution,:payload)`,{userId,name:`${firstName.trim()} ${lastName.trim()}`,email,role:type==="PRO"?"TEACHER":role.trim(),institution:type==="INSTITUTION"?institutionName.trim():null,payload:JSON.stringify({applicationId:result.insertId,planType:type,userId,institutionName:type==="INSTITUTION"?institutionName.trim():null,firstName:firstName.trim(),lastName:lastName.trim(),workEmail:email,country:country.trim(),role:type==="PRO"?"Individual Teacher":role.trim(),phone:`+63${phone.trim()}`,paymentMethod:"GCASH",gcashReference:String(gcashReference).trim(),durationDays:30})});
    res.status(201).json({ok:true,id:result.insertId,status:"PENDING"});
  }catch(error){console.error(error);res.status(500).json({message:"Unable to submit the plan request."});}
}
export const createInstitutionApplication=createPlanApplication;
export async function submitFeedback(req,res){const {name,email,message}=req.body||{};if(!message?.trim())return res.status(400).json({message:"Feedback message is required."});try{await pool.query(`INSERT INTO system_notifications(type,name,email,payload_json) VALUES('FEEDBACK',:name,:email,:payload)`,{name:String(name||"Anonymous").trim(),email:String(email||"").trim()||null,payload:JSON.stringify({message:String(message).trim()})});res.status(201).json({ok:true});}catch{res.status(500).json({message:"Unable to submit feedback."});}}
