import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: "127.0.0.1",
  port: 3306,
  user: "root",
  password: "",
  database: "thinkwave",
  namedPlaceholders: true,
});

async function insertUser({ role, email, firstName, lastName }, passwordHash) {
  const [r] = await pool.query(
    `INSERT INTO users (role, email, password_hash, first_name, last_name, is_verified, is_active, approval_status)
     VALUES (:role, :email, :ph, :fn, :ln, 1, 1, 'APPROVED')`,
    { role, email, ph: passwordHash, fn: firstName, ln: lastName }
  );
  return r.insertId;
}

async function main() {
  const pass = await bcrypt.hash("Password123!", 12);

  const teacherId = await insertUser({ role: "TEACHER", email: "teacher@test.local", firstName: "Test", lastName: "Teacher" }, pass);
  const studentId = await insertUser({ role: "STUDENT", email: "student@test.local", firstName: "Test", lastName: "Student" }, pass);

  await pool.query(
    `INSERT INTO student_profiles (user_id, first_name, last_name, student_id)
     VALUES (:uid, 'Test', 'Student', 'TEST-2026-001')`,
    { uid: studentId }
  );

  const [folderResult] = await pool.query(
    `INSERT INTO classes (teacher_id, name, parent_id) VALUES (:tid, 'College', NULL)`,
    { tid: teacherId }
  );
  const folderId = folderResult.insertId;

  const [classResult] = await pool.query(
    `INSERT INTO classes (teacher_id, name, parent_id, class_code) VALUES (:tid, 'BSIT41A', :pid, 'TESTCODE1')`,
    { tid: teacherId, pid: folderId }
  );
  const classId = classResult.insertId;

  await pool.query(
    `INSERT INTO class_enrollments (class_id, teacher_id, student_user_id, student_id, first_name, last_name)
     VALUES (:cid, :tid, :sid, 'TEST-2026-001', 'Test', 'Student')`,
    { cid: classId, tid: teacherId, sid: studentId }
  );

  console.log(JSON.stringify({
    teacherId, studentId, folderId, classId,
    teacherEmail: "teacher@test.local",
    studentEmail: "student@test.local",
    password: "Password123!",
  }, null, 2));

  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
