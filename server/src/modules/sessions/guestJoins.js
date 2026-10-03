/* FILE GUIDE:
 * server/src/modules/sessions/guestJoins.js
 * Purpose: Tracks guest (no-account) seats per class so ThinkWAVE can
 *   1) ask a guest to create a student account from their 3rd class session on,
 *   2) show the host which guests keep coming back, and
 *   3) stop a kicked guest from re-entering the same session from the same browser.
 * A guest is identified by browser key + name, so classmates sharing one lab
 * computer are still counted separately.
 */
import crypto from "node:crypto";
import { pool } from "../../db.js";
import { env } from "../../env.js";

// From this many live sessions of the same class as a guest, the guest is
// asked to create an account, and the host sees a "repeat guest" notice.
export const GUEST_REPEAT_THRESHOLD = 3;

let guestJoinTableReady = false;
export async function ensureGuestJoinTable() {
  if (guestJoinTableReady) return;
  await pool.query(`CREATE TABLE IF NOT EXISTS guest_session_joins (
    participant_id BIGINT PRIMARY KEY,
    session_id BIGINT NOT NULL,
    class_id BIGINT NULL,
    device_hash CHAR(64) NULL,
    name_key VARCHAR(200) NOT NULL,
    visit_number INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_guest_class_identity (class_id, device_hash, name_key),
    INDEX idx_guest_session_device (session_id, device_hash)
  )`);
  guestJoinTableReady = true;
}

// The browser key (same localStorage key the Guest dashboard uses) is hashed
// with the server secret, so the raw key is never stored.
export function guestDeviceHash(guestKey) {
  const key = String(guestKey || "");
  if (!/^[a-f0-9]{64}$/i.test(key)) return null;
  return crypto.createHmac("sha256", String(env.JWT_SECRET || "")).update(`guest-device:${key.toLowerCase()}`).digest("hex");
}

export function guestNameKey(firstName, lastName) {
  return `${firstName || ""} ${lastName || ""}`.trim().replace(/\s+/g, " ").toLowerCase().slice(0, 200);
}

// How many OTHER live sessions of this class the same guest already joined.
export async function countPreviousGuestVisits({ classId, sessionId, deviceHash, nameKey }) {
  if (!classId) return 0;
  await ensureGuestJoinTable();
  const [[row]] = await pool.query(
    `SELECT COUNT(DISTINCT session_id) AS visits FROM guest_session_joins
     WHERE class_id=:cid AND name_key=:nk AND device_hash <=> :dh AND session_id<>:sid`,
    { cid: classId, nk: nameKey, dh: deviceHash, sid: sessionId }
  );
  return Number(row?.visits || 0);
}

export async function isGuestDeviceKicked({ sessionId, deviceHash }) {
  if (!deviceHash) return false;
  await ensureGuestJoinTable();
  const [[row]] = await pool.query(
    `SELECT 1 AS kicked FROM guest_session_joins g
     JOIN session_participants p ON p.id=g.participant_id
     WHERE g.session_id=:sid AND g.device_hash=:dh AND p.kicked_at IS NOT NULL
     LIMIT 1`,
    { sid: sessionId, dh: deviceHash }
  );
  return !!row;
}

export async function recordGuestJoin({ participantId, sessionId, classId, deviceHash, nameKey, visitNumber }) {
  await ensureGuestJoinTable();
  await pool.query(
    `INSERT IGNORE INTO guest_session_joins(participant_id, session_id, class_id, device_hash, name_key, visit_number)
     VALUES(:pid, :sid, :cid, :dh, :nk, :vn)`,
    { pid: participantId, sid: sessionId, cid: classId || null, dh: deviceHash, nk: nameKey, vn: visitNumber }
  );
}
