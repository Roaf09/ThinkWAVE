/**
 * One-time migration: adds the competitive_points column to
 * async_quiz_submissions, needed for the new assignment leaderboard feature.
 *
 * Safe to re-run - it checks whether the column already exists first.
 *
 * USAGE (from the server/ directory):
 *   node scripts/add_assignment_competitive_points_column.js
 */

import { pool } from "../src/db.js";

async function main() {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS c FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'async_quiz_submissions' AND column_name = 'competitive_points'`
  );
  if (Number(rows?.[0]?.c || 0) > 0) {
    console.log("competitive_points already exists on async_quiz_submissions - nothing to do.");
  } else {
    await pool.query(
      `ALTER TABLE async_quiz_submissions ADD COLUMN competitive_points INT NOT NULL DEFAULT 0 AFTER max_score`
    );
    console.log("Added competitive_points column to async_quiz_submissions.");
  }
  await pool.end();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
