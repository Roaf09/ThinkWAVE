/* FILE GUIDE:
 * server/src/modules/tutorial_state/tutorial_state.controller.js
 * Purpose: Persist per-user tutorial/walkthrough progress so completing or
 * skipping a tour on one device (desktop) carries over to the other (mobile).
 * Tip: The client keeps localStorage as a fast cache and syncs here.
 */

import { pool } from "../../db.js";

function parseState(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

// Lazy table creation (same pattern as the gamification tables): existing
// deployments get the table on first use without a manual migration.
async function ensureTutorialStateTable() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS user_tutorial_state (
      user_id    BIGINT PRIMARY KEY,
      state_json JSON NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_user_tutorial_state_user FOREIGN KEY (user_id) REFERENCES users(id)
    )`
  );
}

export async function getTutorialState(req, res) {
  await ensureTutorialStateTable();
  const [[row]] = await pool.query(
    `SELECT state_json, updated_at FROM user_tutorial_state WHERE user_id=:uid`,
    { uid: req.user.sub }
  );
  if (!row) return res.json({ state: {}, updatedAt: 0 });
  res.json({
    state: parseState(row.state_json),
    updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : 0,
  });
}

export async function putTutorialState(req, res) {
  const state = req.body?.state;
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    return res.status(400).json({ message: "Tutorial state must be an object." });
  }
  const json = JSON.stringify(state);
  if (json.length > 200000) {
    return res.status(413).json({ message: "Tutorial state is too large." });
  }
  const updatedAt = Number(req.body?.updatedAt) > 0 ? Number(req.body.updatedAt) : Date.now();
  await ensureTutorialStateTable();
  await pool.query(
    `INSERT INTO user_tutorial_state(user_id, state_json, updated_at)
     VALUES(:uid, :json, :dt)
     ON DUPLICATE KEY UPDATE state_json=VALUES(state_json), updated_at=VALUES(updated_at)`,
    { uid: req.user.sub, json, dt: new Date(updatedAt) }
  );
  res.json({ ok: true });
}
