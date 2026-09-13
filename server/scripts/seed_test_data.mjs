/**
 * DEV-ONLY seed script: creates one teacher + one student + one class with an
 * enrollment for local testing.
 *
 * NEVER run against production (it refuses when NODE_ENV=production).
 *
 * USAGE (from the server/ directory):
 *   node scripts/seed_test_data.mjs
 *
 * Uses the same DB env vars as the running server (via src/db.js).
 * Test password: SEED_PASSWORD env var, or the dev default below.
 */
import bcrypt from "bcryptjs";
import { pool } from "../src/db.js";
import { env } from "../src/env.js";

if (env.NODE_ENV === "production") {
  console.error("REFUSING to seed: NODE_ENV=production. This script is dev-only.");
  process.exit(1);
}

const SEED_PASSWORD = process.env.SEED_PASSWORD || "Password123!";

async function insertUser({ role, email, firstName, lastName }, passwordHash) {
  const [r] = await pool.query(
    `INSERT INTO users (role, email, password_hash, first_name, last_name, is_verified, is_active, approval_status)
     VALUES (:role, :email, :ph, :fn, :ln, 1, 1, 'APPROVED')`,
    { role, email, ph: passwordHash, fn: firstName, ln: lastName }
  );
  return r.insertId;
}

async function main() {
  const pass = await bcrypt.hash(SEED_PASSWORD, 12);

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
    password: process.env.SEED_PASSWORD ? "(from SEED_PASSWORD)" : "Password123!",
  }, null, 2));

  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
