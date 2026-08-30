/**
 * One-time repair script for the "no choices on assignments" bug.
 *
 * WHAT HAPPENED:
 * assignQuiz/duplicateQuiz/copyQuizToBank copied quiz_questions.config_json
 * and correct_json by re-running JSON.stringify() on a value that MariaDB
 * already returns as a JSON *string* (MariaDB has no native JSON type, so
 * mysql2 never auto-parses it). That double-encoded the column: instead of
 * storing a JSON object, it stored a JSON string containing escaped JSON
 * text, e.g.  "{\"options\":[...]}"  instead of  {"options":[...]}.
 * This has already been fixed in code (see src/modules/quizzes/quizzes.controller.js,
 * function reencodeJsonColumn and its three call sites), but any
 * quiz_questions rows created BEFORE the fix are still broken in the
 * database and need to be repaired directly.
 *
 * WHAT THIS SCRIPT DOES:
 * Scans every quiz_questions row, and for any config_json/correct_json that
 * is double-encoded (i.e. JSON.parse() of it yields a STRING instead of an
 * object/array), unwraps it back to the real object and writes it back with
 * a single, correct encoding. Rows that are already correct are left alone.
 * Safe to re-run - it only touches rows it detects as broken.
 *
 * USAGE (from the server/ directory):
 *   node scripts/repair_double_encoded_json.js            # dry run, reports what it WOULD fix
 *   node scripts/repair_double_encoded_json.js --apply     # actually writes the fixes
 *
 * Uses the same DB env vars as the running server (via src/db.js), so no
 * separate DB config is needed - run it wherever/however you'd normally run
 * a one-off server script (e.g. against the Render production DB).
 */

import { pool } from "../src/db.js";

const APPLY = process.argv.includes("--apply");

function isDoubleEncoded(raw) {
  if (raw == null) return false;
  if (typeof raw !== "string") return false; // already an object - fine
  let once;
  try {
    once = JSON.parse(raw);
  } catch {
    return false; // not valid JSON at all - leave alone, don't touch
  }
  // Correctly-encoded columns parse straight to an object/array.
  // Double-encoded columns parse to a STRING that itself contains JSON text.
  return typeof once === "string";
}

function unwrap(raw) {
  // raw -> parse once (still a string containing JSON text) -> parse again (real object) -> re-stringify once.
  const innerText = JSON.parse(raw);
  const real = JSON.parse(innerText);
  return JSON.stringify(real);
}

async function main() {
  console.log(APPLY ? "Running in APPLY mode - changes will be written." : "Running in DRY-RUN mode - no changes will be written (pass --apply to fix).");

  const [rows] = await pool.query(
    `SELECT id, quiz_id, config_json, correct_json FROM quiz_questions WHERE deleted_at IS NULL`
  );

  let scanned = 0;
  let brokenConfig = 0;
  let brokenCorrect = 0;
  const affectedQuizIds = new Set();

  for (const row of rows) {
    scanned += 1;
    const configBroken = isDoubleEncoded(row.config_json);
    const correctBroken = isDoubleEncoded(row.correct_json);
    if (!configBroken && !correctBroken) continue;

    affectedQuizIds.add(row.quiz_id);
    if (configBroken) brokenConfig += 1;
    if (correctBroken) brokenCorrect += 1;

    console.log(
      `quiz_question id=${row.id} (quiz_id=${row.quiz_id}): ` +
      `${configBroken ? "config_json BROKEN" : "config_json ok"}, ` +
      `${correctBroken ? "correct_json BROKEN" : "correct_json ok"}`
    );

    if (APPLY) {
      const newConfig = configBroken ? unwrap(row.config_json) : row.config_json;
      const newCorrect = correctBroken ? unwrap(row.correct_json) : row.correct_json;
      await pool.query(
        `UPDATE quiz_questions SET config_json=:cfg, correct_json=:corr WHERE id=:id`,
        { id: row.id, cfg: newConfig, corr: newCorrect }
      );
    }
  }

  console.log("");
  console.log(`Scanned ${scanned} question rows.`);
  console.log(`Broken config_json: ${brokenConfig}`);
  console.log(`Broken correct_json: ${brokenCorrect}`);
  console.log(`Affected quiz ids: ${[...affectedQuizIds].join(", ") || "(none)"}`);
  console.log(APPLY ? "Done - changes written." : "Dry run complete - re-run with --apply to write these fixes.");

  await pool.end();
}

main().catch((err) => {
  console.error("Repair script failed:", err);
  process.exit(1);
});
