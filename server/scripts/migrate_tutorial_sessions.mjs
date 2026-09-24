/**
 * One-time schema migration for ThinkBOT-only tutorial demo sessions.
 *
 *   node scripts/migrate_tutorial_sessions.mjs            # dry run (reports only)
 *   node scripts/migrate_tutorial_sessions.mjs --apply    # execute
 *
 * Adds sessions.is_tutorial (TINYINT default 0). Existing rows stay 0, so no
 * reset is needed — run --apply once against the deployed database. Fresh
 * setups already include the column via schema.sql. The app works with or
 * without the column (endpoints probe it via hasDatabaseColumn).
 */
import { pool } from "../src/db.js";

const APPLY = process.argv.includes("--apply");

async function main() {
  const [[row]] = await pool.query(
    `SELECT 1 AS present
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'sessions'
       AND column_name = 'is_tutorial'
     LIMIT 1`
  );
  if (row?.present) {
    console.log("sessions.is_tutorial already exists — nothing to do.");
  } else {
    console.log(`sessions.is_tutorial missing (${APPLY ? "APPLY" : "dry run — pass --apply to execute"}).`);
    if (APPLY) {
      await pool.query(`ALTER TABLE sessions ADD COLUMN is_tutorial TINYINT(1) NOT NULL DEFAULT 0`);
      console.log("Added sessions.is_tutorial.");
    }
  }
  console.log(APPLY ? "Done." : "Dry run — nothing changed.");
  await pool.end().catch(() => {});
}

main().catch((err) => {
  console.error("Migration failed:", err?.message || err);
  process.exit(1);
});
