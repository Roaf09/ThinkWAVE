/* FILE GUIDE:
 * server/src/modules/admin/admin_dashboard.controller.js
 * Purpose: Admin dashboard data for institution setup, overview, teacher management, and invitation handling.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import { pool } from "../../db.js";
import { makeJoinCode } from "../../utils/codes.js";

async function getAdminInstitution(adminId) {
  const [[row]] = await pool.query(
    `SELECT id, first_name, last_name, email, institution_name, institution_setup_done, created_at, is_active
     FROM users
     WHERE id = :id AND role = 'ADMIN'`,
    { id: adminId }
  );
  return row || null;
}

async function buildInstitutionActivity(inst, limit = 8) {
  if (!inst) return [];

  const [rows] = await pool.query(
    `(
       SELECT
         'SESSION_ENDED' AS kind,
         COALESCE(q.title, 'Quiz Session') AS title,
         CONCAT(u.first_name, ' ', u.last_name) AS subtitle,
         CASE
           WHEN s.end_reason = 'TEACHER_DISCONNECTED' THEN 'Session auto-ended after a teacher disconnect.'
           ELSE CONCAT('Finished with ', (SELECT COUNT(*) FROM session_participants sp WHERE sp.session_id = s.id), ' participant(s).')
         END AS detail,
         COALESCE(s.ended_at, s.created_at) AS event_at
       FROM sessions s
       JOIN users u ON u.id = s.teacher_id
       LEFT JOIN quizzes q ON q.id = s.quiz_id
       WHERE u.institution_name = :inst
     )
     UNION ALL
     (
       SELECT
         'TEACHER_ADDED' AS kind,
         CONCAT(first_name, ' ', last_name) AS title,
         email AS subtitle,
         'Teacher account is part of this institution.' AS detail,
         created_at AS event_at
       FROM users
       WHERE role = 'TEACHER'
         AND institution_name = :inst
         AND deleted_at IS NULL
     )
     ORDER BY event_at DESC
     LIMIT :lim`,
    { inst, lim: Number(limit) }
  );

  return rows;
}

// institution setup
export async function setupInstitution(req, res) {
  const { institutionName } = req.body;
  if (!institutionName?.trim()) {
    return res.status(400).json({ message: "Institution name is required." });
  }

  const [[adminRow]] = await pool.query(
    `SELECT first_name, last_name, email FROM users WHERE id = :id`,
    { id: req.user.sub }
  );

  await pool.query(
    `UPDATE users
     SET institution_name = :name,
         institution_setup_done = 1
     WHERE id = :id AND role = 'ADMIN'`,
    { name: institutionName.trim(), id: req.user.sub }
  );

  try {
    await pool.query(
      `INSERT INTO activity_log (type, user_id, name, email, role, institution_name)
       VALUES ('INSTITUTION_SETUP', :uid, :name, :email, 'ADMIN', :inst)`,
      {
        uid: req.user.sub,
        name: `${adminRow.first_name} ${adminRow.last_name}`,
        email: adminRow.email,
        inst: institutionName.trim(),
      }
    );
  } catch (_) {}
  try {
    await pool.query(`INSERT INTO system_notifications(type,user_id,name,email,role,institution_name,payload_json) VALUES('INSTITUTION_SETUP',:uid,:name,:email,'ADMIN',:inst,:payload)`, {
      uid: req.user.sub, name: `${adminRow.first_name} ${adminRow.last_name}`, email: adminRow.email, inst: institutionName.trim(), payload: JSON.stringify({ institutionName: institutionName.trim() })
    });
  } catch (_) {}

  res.json({ ok: true });
}

export async function getSetupStatus(req, res) {
  const admin = await getAdminInstitution(req.user.sub);
  res.json({
    setupDone: !!admin?.institution_setup_done,
    institutionName: admin?.institution_name || null,
  });
}

export async function getStats(req, res) {
  const admin = await getAdminInstitution(req.user.sub);
  const inst = admin?.institution_name || null;
  const [[counts]] = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM users WHERE role='TEACHER' AND institution_name=:inst AND deleted_at IS NULL AND is_active=1) AS active_teachers,
       (SELECT COUNT(*) FROM sessions s JOIN users u ON u.id=s.teacher_id WHERE u.institution_name=:inst2 AND s.status IN ('LOBBY','LIVE','PAUSED')) AS active_live_sessions,
       (SELECT COUNT(*) FROM quizzes q JOIN users u ON u.id=q.teacher_id WHERE u.institution_name=:inst3 AND q.delivery_mode='ASYNCHRONOUS' AND q.deleted_at IS NULL AND (q.available_until IS NULL OR q.available_until>=NOW())) AS active_assigned_sessions,
       (SELECT COUNT(DISTINCT ce.student_user_id) FROM class_enrollments ce JOIN classes c ON c.id=ce.class_id JOIN users u ON u.id=c.teacher_id WHERE u.institution_name=:inst4 AND ce.removed_at IS NULL) AS active_students`,
    { inst, inst2:inst, inst3:inst, inst4:inst }
  );
  const [weeklySessions] = await pool.query(
    `SELECT week_key, MIN(week_start) AS week_start,
            SUM(live_total) AS live_total,
            SUM(assigned_total) AS assigned_total
       FROM (
         SELECT YEARWEEK(s.created_at,1) AS week_key,
                DATE_SUB(DATE(s.created_at),INTERVAL WEEKDAY(s.created_at) DAY) AS week_start,
                COUNT(*) AS live_total, 0 AS assigned_total
           FROM sessions s
           JOIN users u ON u.id=s.teacher_id
          WHERE u.institution_name=:inst
            AND s.created_at>=DATE_SUB(CURDATE(),INTERVAL 11 WEEK)
          GROUP BY YEARWEEK(s.created_at,1), DATE_SUB(DATE(s.created_at),INTERVAL WEEKDAY(s.created_at) DAY)
         UNION ALL
         SELECT YEARWEEK(q.created_at,1) AS week_key,
                DATE_SUB(DATE(q.created_at),INTERVAL WEEKDAY(q.created_at) DAY) AS week_start,
                0 AS live_total, COUNT(*) AS assigned_total
           FROM quizzes q
           JOIN users u ON u.id=q.teacher_id
          WHERE u.institution_name=:inst2
            AND q.delivery_mode='ASYNCHRONOUS'
            AND q.deleted_at IS NULL
            AND q.created_at>=DATE_SUB(CURDATE(),INTERVAL 11 WEEK)
          GROUP BY YEARWEEK(q.created_at,1), DATE_SUB(DATE(q.created_at),INTERVAL WEEKDAY(q.created_at) DAY)
       ) weekly
      GROUP BY week_key
      ORDER BY week_start`, { inst, inst2: inst }
  );
  const [[distribution]] = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM users WHERE role='TEACHER' AND institution_name=:inst AND deleted_at IS NULL) AS teachers,
       (SELECT COUNT(DISTINCT ce.student_user_id) FROM class_enrollments ce JOIN classes c ON c.id=ce.class_id JOIN users u ON u.id=c.teacher_id WHERE u.institution_name=:inst2 AND ce.removed_at IS NULL) AS students`, { inst, inst2:inst }
  );
  const [templates] = await pool.query(
    `SELECT q.template_type AS label,COUNT(*) AS value FROM sessions s JOIN quizzes q ON q.id=s.quiz_id JOIN users u ON u.id=s.teacher_id WHERE u.institution_name=:inst GROUP BY q.template_type ORDER BY value DESC LIMIT 6`, { inst }
  );
  res.json({institutionName:inst,activeTeachers:Number(counts.active_teachers||0),activeLiveSessions:Number(counts.active_live_sessions||0),activeAssignedSessions:Number(counts.active_assigned_sessions||0),activeStudents:Number(counts.active_students||0),weeklySessions:weeklySessions.map(x=>({weekStart:x.week_start,live:Number(x.live_total||0),assigned:Number(x.assigned_total||0)})),accountDistribution:[{label:'Teachers',value:Number(distribution.teachers||0)},{label:'Students',value:Number(distribution.students||0)}],templateUsage:templates.map(x=>({label:x.label,value:Number(x.value||0)}) )});
}

export async function listTeachers(req, res) {
  const admin = await getAdminInstitution(req.user.sub);
  const inst = admin?.institution_name || null;
  let rows=[];
  try {
    [rows]=await pool.query(`SELECT u.id,u.email,u.first_name,u.last_name,u.is_active,u.contact_number,u.created_at,u.last_active_at,u.approval_status,
      (SELECT COUNT(*) FROM sessions s WHERE s.teacher_id=u.id) hosted_sessions_count,
      (SELECT COUNT(*) FROM quizzes q WHERE q.teacher_id=u.id AND q.delivery_mode='ASYNCHRONOUS' AND q.deleted_at IS NULL) assigned_sessions_count,
      (SELECT MAX(COALESCE(s.ended_at,s.created_at)) FROM sessions s WHERE s.teacher_id=u.id) last_session_at,
      (SELECT COUNT(*) FROM classes c WHERE c.teacher_id=u.id AND c.deleted_at IS NULL AND c.parent_id IS NOT NULL) classes_handled_count
      FROM users u WHERE u.role='TEACHER' AND u.institution_name=:inst AND u.deleted_at IS NULL ORDER BY u.last_name,u.first_name`,{inst});
  } catch (error) {
    console.warn('Admin teacher detail fallback:', error?.message || error);
    [rows]=await pool.query(`SELECT id,email,first_name,last_name,is_active,contact_number,created_at,last_active_at,approval_status,0 hosted_sessions_count,0 assigned_sessions_count,NULL last_session_at,0 classes_handled_count FROM users WHERE role='TEACHER' AND institution_name=:inst AND deleted_at IS NULL ORDER BY last_name,first_name`,{inst});
  }
  res.json(rows);
}


export async function setTeacherActive(req, res) {
  const [[teacher]] = await pool.query(
    `SELECT id FROM users
     WHERE id = :id
       AND role = 'TEACHER'
       AND institution_name = (
         SELECT institution_name FROM users WHERE id = :adminId
       )`,
    { id: req.params.id, adminId: req.user.sub }
  );
  if (!teacher) return res.status(404).json({ message: "Teacher not found." });

  const active = req.body?.active ? 1 : 0;
  await pool.query(`UPDATE users SET is_active = :a WHERE id = :id`, { a: active, id: req.params.id });
  res.json({ ok: true });
}

export async function deleteTeacher(req, res) {
  const [[teacher]] = await pool.query(`SELECT id,first_name,last_name,email,role,institution_name FROM users WHERE id=:id AND role='TEACHER'`, { id:req.params.id });
  await pool.query(`UPDATE users SET deleted_at=NOW() WHERE id=:id AND role='TEACHER'`, { id:req.params.id });
  if (teacher) { try { await pool.query(`INSERT INTO system_notifications(type,user_id,name,email,role,institution_name,payload_json) VALUES('ACCOUNT_DELETED',:uid,:name,:email,:role,:inst,:payload)`, { uid:teacher.id,name:`${teacher.first_name} ${teacher.last_name}`.trim(),email:teacher.email,role:teacher.role,inst:teacher.institution_name,payload:JSON.stringify({deletedBy:'ADMIN'}) }); } catch (_) {} }
  res.json({ ok: true });
}

export async function getInstitutionDetails(req, res) {
  const admin=await getAdminInstitution(req.user.sub); const inst=admin?.institution_name||null;
  const teachers=inst?(await pool.query(`SELECT id,email,first_name,last_name,is_active,created_at,last_active_at FROM users WHERE role='TEACHER' AND institution_name=:inst AND deleted_at IS NULL ORDER BY last_name,first_name`,{inst}))[0]:[];
  const [[summary]]=await pool.query(`SELECT
    (SELECT COUNT(*) FROM sessions s JOIN users u ON u.id=s.teacher_id WHERE u.institution_name=:inst) total_hosted_sessions,
    (SELECT COUNT(*) FROM quizzes q JOIN users u ON u.id=q.teacher_id WHERE u.institution_name=:inst2 AND q.delivery_mode='ASYNCHRONOUS' AND q.deleted_at IS NULL) total_assigned_sessions,
    (SELECT COUNT(*) FROM sessions s JOIN users u ON u.id=s.teacher_id WHERE u.institution_name=:inst3 AND COALESCE(s.ended_at,s.created_at)>=DATE_SUB(NOW(),INTERVAL 7 DAY)) hosted_this_week,
    (SELECT COUNT(*) FROM quizzes q JOIN users u ON u.id=q.teacher_id WHERE u.institution_name=:inst4 AND q.delivery_mode='ASYNCHRONOUS' AND q.created_at>=DATE_SUB(NOW(),INTERVAL 7 DAY) AND q.deleted_at IS NULL) assigned_this_week,
    (SELECT COUNT(DISTINCT ce.student_user_id) FROM class_enrollments ce JOIN classes c ON c.id=ce.class_id JOIN users u ON u.id=c.teacher_id WHERE u.institution_name=:inst5 AND ce.removed_at IS NULL) total_students,
    (SELECT MAX(COALESCE(s.ended_at,s.created_at)) FROM sessions s JOIN users u ON u.id=s.teacher_id WHERE u.institution_name=:inst6) last_activity`,{inst,inst2:inst,inst3:inst,inst4:inst,inst5:inst,inst6:inst});
  const activity=await buildInstitutionActivity(inst,8);
  res.json({institution:{name:inst,adminName:admin?`${admin.first_name} ${admin.last_name}`:null,adminEmail:admin?.email||null,createdAt:admin?.created_at||null,totalTeachers:teachers.length,totalStudents:Number(summary.total_students||0),totalHostedSessions:Number(summary.total_hosted_sessions||0),totalAssignedSessions:Number(summary.total_assigned_sessions||0),hostedSessionsThisWeek:Number(summary.hosted_this_week||0),assignedSessionsThisWeek:Number(summary.assigned_this_week||0),lastActivity:summary.last_activity||null},teachers,recentActivity:activity});
}

export async function getActivity(req, res) {
  const admin = await getAdminInstitution(req.user.sub);
  const inst = admin?.institution_name || null;
  const activity = await buildInstitutionActivity(inst, 10);
  res.json(activity);
}

export async function getInvitation(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT id, invite_code, institution_name, is_active, created_at
       FROM teacher_invitations
       WHERE admin_id = :aid AND is_active = 1
       ORDER BY created_at DESC LIMIT 1`,
      { aid: req.user.sub }
    );
    res.json(rows[0] || null);
  } catch (error) {
    console.warn('Invitation lookup unavailable:', error?.message || error);
    res.json(null);
  }
}


export async function createInvitation(req, res) {
  const admin = await getAdminInstitution(req.user.sub);
  if (!admin?.institution_name) {
    return res.status(400).json({ message: "Please complete institution setup first." });
  }

  await pool.query(
    `UPDATE teacher_invitations
     SET is_active = 0, revoked_at = NOW()
     WHERE admin_id = :aid AND is_active = 1`,
    { aid: req.user.sub }
  );

  const code = makeJoinCode();
  const [r] = await pool.query(
    `INSERT INTO teacher_invitations(admin_id, invite_code, institution_name)
     VALUES(:aid, :code, :inst)`,
    { aid: req.user.sub, code, inst: admin.institution_name }
  );
  res.status(201).json({ id: r.insertId, invite_code: code, institution_name: admin.institution_name });
}

export async function revokeInvitation(req, res) {
  await pool.query(
    `UPDATE teacher_invitations
     SET is_active = 0, revoked_at = NOW()
     WHERE id = :id AND admin_id = :aid`,
    { id: req.params.id, aid: req.user.sub }
  );
  res.json({ ok: true });
}

export async function joinViaInvitation(req, res) {
  const { code } = req.body;
  if (!code) return res.status(400).json({ message: "Code is required." });

  const [[invite]] = await pool.query(
    `SELECT id, institution_name, admin_id
     FROM teacher_invitations
     WHERE invite_code = :code AND is_active = 1`,
    { code: code.trim().toUpperCase() }
  );
  if (!invite) {
    return res.status(404).json({ message: "Invalid or expired invitation code." });
  }

  await pool.query(
    `UPDATE users
     SET institution_name = :inst
     WHERE id = :tid AND role = 'TEACHER'`,
    { inst: invite.institution_name, tid: req.user.sub }
  );

  res.json({ ok: true, institutionName: invite.institution_name });
}
