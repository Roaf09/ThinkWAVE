import { pool } from "./db.js";

async function hasColumn(table,column){const [[row]]=await pool.query(`SELECT COUNT(*) AS total FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=:table AND COLUMN_NAME=:column`,{table,column});return Number(row?.total||0)>0;}
async function columnLength(table,column){const [[row]]=await pool.query(`SELECT CHARACTER_MAXIMUM_LENGTH AS max_len FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=:table AND COLUMN_NAME=:column`,{table,column});return Number(row?.max_len||0);}
async function hasTable(table){const [[row]]=await pool.query(`SELECT COUNT(*) AS total FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=:table`,{table});return Number(row?.total||0)>0;}
async function hasIndex(table,index){const [[row]]=await pool.query(`SELECT COUNT(*) AS total FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=:table AND INDEX_NAME=:index`,{table,index});return Number(row?.total||0)>0;}

export async function ensureRevision19Schema(){
  if(!(await hasColumn("users","profile_image"))) await pool.query(`ALTER TABLE users ADD COLUMN profile_image LONGTEXT NULL AFTER contact_number`);
  if(!(await hasColumn("student_profiles","birth_date"))) await pool.query(`ALTER TABLE student_profiles ADD COLUMN birth_date DATE NULL AFTER student_id`);
  if(!(await hasColumn("student_profiles","profile_image"))) await pool.query(`ALTER TABLE student_profiles ADD COLUMN profile_image LONGTEXT NULL AFTER birth_date`);
  if(!(await hasColumn("session_participants","student_user_id"))){await pool.query(`ALTER TABLE session_participants ADD COLUMN student_user_id BIGINT NULL AFTER reconnect_key`);await pool.query(`CREATE INDEX idx_session_participants_student ON session_participants(student_user_id,session_id)`);}
  if(!(await hasColumn("session_participants","kicked_at"))) await pool.query(`ALTER TABLE session_participants ADD COLUMN kicked_at TIMESTAMP NULL AFTER left_at`);
  if(!(await hasColumn("session_participants","kick_reason"))) await pool.query(`ALTER TABLE session_participants ADD COLUMN kick_reason VARCHAR(255) NULL AFTER kicked_at`);
  else if((await columnLength("session_participants","kick_reason"))<255) await pool.query(`ALTER TABLE session_participants MODIFY COLUMN kick_reason VARCHAR(255) NULL`);
  if(!(await hasTable("institution_applications"))) await pool.query(`CREATE TABLE institution_applications(id BIGINT PRIMARY KEY AUTO_INCREMENT,first_name VARCHAR(100) NOT NULL,last_name VARCHAR(100) NOT NULL,work_email VARCHAR(190) NOT NULL,country VARCHAR(100) NOT NULL,role_description VARCHAR(160) NOT NULL,phone_number VARCHAR(50) NOT NULL,status ENUM('PENDING','APPROVED','DISAPPROVED') NOT NULL DEFAULT 'PENDING',reviewed_by BIGINT NULL,reviewed_at TIMESTAMP NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,INDEX idx_institution_app_status(status,created_at))`);
  if(!(await hasTable("system_notifications"))) {
    await pool.query(`CREATE TABLE system_notifications(id BIGINT PRIMARY KEY AUTO_INCREMENT,type VARCHAR(60) NOT NULL,user_id BIGINT NULL,name VARCHAR(180) NULL,email VARCHAR(190) NULL,role VARCHAR(30) NULL,institution_name VARCHAR(200) NULL,payload_json JSON NULL,status VARCHAR(30) NOT NULL DEFAULT 'NEW',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,INDEX idx_system_notification_type(type,created_at),INDEX idx_system_notification_user(user_id))`);
  } else {
    // Revision 22 compatibility: early Revision 22 drafts used title/message/actor_user_id.
    // Add the fields used by the notification feed without discarding existing records.
    if(!(await hasColumn("system_notifications","user_id"))) await pool.query(`ALTER TABLE system_notifications ADD COLUMN user_id BIGINT NULL AFTER type`);
    if(!(await hasColumn("system_notifications","name"))) await pool.query(`ALTER TABLE system_notifications ADD COLUMN name VARCHAR(180) NULL AFTER user_id`);
    if(!(await hasColumn("system_notifications","email"))) await pool.query(`ALTER TABLE system_notifications ADD COLUMN email VARCHAR(190) NULL AFTER name`);
    if(!(await hasColumn("system_notifications","role"))) await pool.query(`ALTER TABLE system_notifications ADD COLUMN role VARCHAR(30) NULL AFTER email`);
    if(!(await hasColumn("system_notifications","institution_name"))) await pool.query(`ALTER TABLE system_notifications ADD COLUMN institution_name VARCHAR(200) NULL AFTER role`);
    if(!(await hasColumn("system_notifications","payload_json"))) await pool.query(`ALTER TABLE system_notifications ADD COLUMN payload_json JSON NULL AFTER institution_name`);
    if(!(await hasColumn("system_notifications","status"))) await pool.query(`ALTER TABLE system_notifications ADD COLUMN status VARCHAR(30) NOT NULL DEFAULT 'NEW' AFTER payload_json`);
    if(await hasColumn("system_notifications","title")) await pool.query(`ALTER TABLE system_notifications MODIFY COLUMN title VARCHAR(255) NULL`);
    if(!(await hasIndex("system_notifications","idx_system_notification_type"))) await pool.query(`CREATE INDEX idx_system_notification_type ON system_notifications(type,created_at)`);
    if(!(await hasIndex("system_notifications","idx_system_notification_user"))) await pool.query(`CREATE INDEX idx_system_notification_user ON system_notifications(user_id)`);
  }
}
