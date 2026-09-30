/* FILE GUIDE:
 * server/src/jobs/prune.js
 * Purpose: Daily cleanup so tables + caches don't grow forever.
 * Free single-service: node-cron in-process, runs 3AM daily + once at boot.
 * Long-run: keeps otp_codes / rate_limit_hits / assignment_tab_events bounded.
 */
import cron from "node-cron";
import { pool } from "../db.js";
import { pruneOldExports } from "../modules/exports/exportStore.js";

export async function runPruneOnce() {
  const results = {};
  try {
    const [r1] = await pool.query(`DELETE FROM otp_codes WHERE expires_at < DATE_SUB(NOW(), INTERVAL 1 DAY) LIMIT 1000`);
    results.otp_codes = r1?.affectedRows ?? 0;
  } catch (err) {
    console.warn("[prune] otp_codes failed:", err?.message || err);
  }
  try {
    const [r2] = await pool.query(`DELETE FROM rate_limit_hits WHERE hit_at < DATE_SUB(NOW(3), INTERVAL 2 HOUR) LIMIT 2000`);
    results.rate_limit_hits = r2?.affectedRows ?? 0;
  } catch (err) {
    console.warn("[prune] rate_limit_hits failed:", err?.message || err);
  }
  try {
    // assignment_tab_events is created at runtime (not in schema.sql) and is
    // never deleted today. Keep 90 days to bound growth, keep recent for reports.
    const [r3] = await pool.query(
      `DELETE FROM assignment_tab_events WHERE created_at < DATE_SUB(NOW(), INTERVAL 90 DAY) LIMIT 2000`
    );
    results.assignment_tab_events = r3?.affectedRows ?? 0;
  } catch (err) {
    // Table may not exist on old DBs — ignore, don't crash boot.
    if (err?.code !== "ER_NO_SUCH_TABLE") console.warn("[prune] assignment_tab_events failed:", err?.message || err);
  }
  if (results.otp_codes || results.rate_limit_hits || results.assignment_tab_events) {
    console.log("[prune] cleaned:", results);
  }
  await pruneOldExports({ maxAgeDays: 7 });
  try {
    // Single-use OAuth codes + stale X email-link rows. Short expiries mean
    // this is normally near-empty; the sweep is just hygiene.
    await pool.query(`DELETE FROM oauth_pending WHERE expires_at < NOW() LIMIT 1000`);
  } catch (err) {
    if (err?.code !== "ER_NO_SUCH_TABLE") console.warn("[prune] oauth_pending failed:", err?.message || err);
  }
  return results;
}

let started = false;
export function startPruneJobs() {
  if (started) return;
  started = true;
  // Clean once at boot (catch up after downtime), then daily 3AM.
  runPruneOnce().catch(() => {});
  cron.schedule("0 3 * * *", () => {
    runPruneOnce().catch((err) => console.error("[prune] cron failed:", err?.message || err));
  });
}
