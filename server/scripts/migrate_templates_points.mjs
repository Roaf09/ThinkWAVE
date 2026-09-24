/**
 * One-time data migration for the Crossword standardization + strict 1/2/3 points.
 *
 *   node scripts/migrate_templates_points.mjs            # dry run (reports only)
 *   node scripts/migrate_templates_points.mjs --apply    # execute
 *
 * 1. Template values stored before the rename:
 *      THINK_SPELL / THINK_AND_SPELL  ->  CROSSWORD
 *      DRAW_IT / GRIP_GUESS           ->  TYPE_ANSWER
 *    in quizzes.template_type and question_bank.template_type.
 *    (Old values remain accepted as aliases in normalizeTemplateType, so this
 *    is cosmetic/consistency — the app works with or without it.)
 * 2. Question points coerced to {1, 2, 3}:
 *      - quiz_questions.config_json $.points and top-level $.points
 *      - question_bank.config_json $.points and top-level $.points
 *      - quizzes.points_per_question clamped to 1..3
 *    Rounding mirrors clampQuestionPoints: round half up, >3 -> 3, else 1.
 */
import { pool } from "../src/db.js";

const APPLY = process.argv.includes("--apply");

function coercePoints(value) {
  const n = Math.round(Number(value));
  if (n === 2 || n === 3) return n;
  if (n === 1) return 1;
  if (Number.isFinite(n) && n > 3) return 3;
  return 1;
}

function safeJson(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return null; }
}

const TEMPLATE_MAP = {
  THINK_SPELL: "CROSSWORD",
  THINK_AND_SPELL: "CROSSWORD",
  DRAW_IT: "TYPE_ANSWER",
  GRIP_GUESS: "TYPE_ANSWER",
};

async function migrateTemplateColumn(table) {
  const report = [];
  for (const [from, to] of Object.entries(TEMPLATE_MAP)) {
    const [[row]] = await pool.query(
      `SELECT COUNT(*) AS total FROM ${table} WHERE template_type=:from`,
      { from }
    );
    const total = Number(row?.total || 0);
    report.push({ from, to, total });
    if (total && APPLY) {
      await pool.query(`UPDATE ${table} SET template_type=:to WHERE template_type=:from`, { to, from });
    }
  }
  return report;
}

async function coerceConfigPoints(table) {
  const [rows] = await pool.query(`SELECT id, config_json FROM ${table} WHERE deleted_at IS NULL`);
  let changed = 0;
  for (const row of rows) {
    const config = safeJson(row.config_json);
    if (!config || typeof config !== "object" || Array.isArray(config)) continue;
    if (config.points === undefined) continue;
    const next = coercePoints(config.points);
    if (Number(config.points) === next) continue;
    changed += 1;
    if (APPLY) {
      await pool.query(`UPDATE ${table} SET config_json=:cfg WHERE id=:id`, { cfg: JSON.stringify({ ...config, points: next }), id: row.id });
    }
  }
  return { scanned: rows.length, changed };
}

async function main() {
  console.log(`Template + points migration (${APPLY ? "APPLY" : "dry run — pass --apply to execute"}).`);
  for (const table of ["quizzes", "question_bank"]) {
    const report = await migrateTemplateColumn(table);
    for (const { from, to, total } of report) {
      console.log(`  ${table}.template_type ${from} -> ${to}: ${total} row(s)`);
    }
  }
  // quiz_questions has no points column; points live inside config_json only.
  const qq = await (async () => {
    const [rows] = await pool.query(`SELECT id, config_json FROM quiz_questions WHERE deleted_at IS NULL`);
    let changed = 0;
    for (const row of rows) {
      const config = safeJson(row.config_json);
      if (!config || typeof config !== "object" || Array.isArray(config)) continue;
      if (config.points === undefined) continue;
      const next = coercePoints(config.points);
      if (Number(config.points) === next) continue;
      changed += 1;
      if (APPLY) {
        await pool.query(`UPDATE quiz_questions SET config_json=:cfg WHERE id=:id`, { cfg: JSON.stringify({ ...config, points: next }), id: row.id });
      }
    }
    return { scanned: rows.length, changed };
  })();
  console.log(`  quiz_questions.config_json $.points coerced: ${qq.changed}/${qq.scanned} row(s)`);
  const qb = await coerceConfigPoints("question_bank");
  console.log(`  question_bank.config_json $.points coerced: ${qb.changed}/${qb.scanned} row(s)`);
  const [[ppq]] = await pool.query(
    `SELECT COUNT(*) AS total FROM quizzes WHERE points_per_question < 1 OR points_per_question > 3`
  );
  console.log(`  quizzes.points_per_question outside 1..3: ${Number(ppq?.total || 0)} row(s)`);
  if (APPLY && Number(ppq?.total || 0)) {
    await pool.query(`UPDATE quizzes SET points_per_question = LEAST(3, GREATEST(1, points_per_question)) WHERE points_per_question < 1 OR points_per_question > 3`);
  }
  console.log(APPLY ? "Done." : "Dry run — nothing changed.");
  await pool.end().catch(() => {});
}

main().catch((err) => {
  console.error("Migration failed:", err?.message || err);
  process.exit(1);
});
