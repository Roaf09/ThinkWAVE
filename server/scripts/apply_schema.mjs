/**
 * Applies server/schema.sql using the server's own DB config (src/env.js).
 *
 * Dry run by default (parses + reports only):
 *   node scripts/apply_schema.mjs            # dry run
 *   node scripts/apply_schema.mjs --apply    # execute
 *   node scripts/apply_schema.mjs --status   # drift check only
 *
 * The DROP DATABASE / CREATE DATABASE / USE header in schema.sql is skipped:
 * the script ensures the database exists and runs the remaining statements
 * against it. On success it records a SHA-256 of schema.sql in the
 * `schema_version` table, so `--status` (and CI) can detect when the live
 * database was built from a different schema file. Re-running --apply
 * against a populated DB errors on the first existing table — intentional:
 * this script targets fresh/test databases, matching what schema.sql
 * documents.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";
import { env } from "../src/env.js";
import { pool } from "../src/db.js";

const APPLY = process.argv.includes("--apply");
const STATUS = process.argv.includes("--status");
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function splitStatements(sql) {
  const statements = [];
  let current = "";
  let quote = null;
  let lineComment = false;
  let blockComment = false;
  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (lineComment) {
      if (ch === "\n") {
        current += ch;
        lineComment = false;
      }
      continue;
    }
    if (blockComment) {
      if (ch === "*" && next === "/") {
        i += 1;
        blockComment = false;
      }
      continue;
    }
    if (!quote && ch === "-" && next === "-" && /[\s]/.test(sql[i + 2] || " ")) {
      lineComment = true;
      current += " ";
      continue;
    }
    if (!quote && ch === "#") {
      lineComment = true;
      current += " ";
      continue;
    }
    if (!quote && ch === "/" && next === "*") {
      blockComment = true;
      current += " ";
      continue;
    }
    if ((ch === "'" || ch === '"' || ch === "`") && !quote) {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === quote) {
      if (next === quote && (quote === "'" || quote === '"')) {
        current += ch + next; // doubled-quote escape inside string
        i += 1;
        continue;
      }
      if (sql[i - 1] === "\\") {
        current += ch; // backslash-escaped quote stays inside string
        continue;
      }
      quote = null;
      current += ch;
      continue;
    }
    if (ch === ";" && !quote) {
      statements.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) statements.push(current);
  return statements
    .map((s) => s.trim())
    .filter((s) => s && !/^(--|\#|\/\*)/.test(s.replace(/\s+/g, " ").trim()) && /[A-Za-z]/.test(s.replace(/^(-|\#|\/\*).*$/gm, "")));
}

function isBootstrapStatement(statement) {
  return /^(DROP\s+DATABASE|CREATE\s+DATABASE|USE)\b/i.test(statement.trim());
}

export function parseSchema(sql) {
  const all = splitStatements(sql);
  return {
    all,
    skipped: all.filter(isBootstrapStatement),
    statements: all.filter((s) => !isBootstrapStatement(s)),
  };
}

export function schemaChecksum(sql) {
  return crypto.createHash("sha256").update(sql, "utf8").digest("hex");
}

async function readRecordedChecksum() {
  try {
    const [[row]] = await pool.query(
      `SELECT checksum FROM schema_version WHERE id = 1 LIMIT 1`
    );
    return row?.checksum || null;
  } catch (err) {
    if (err?.code === "ER_NO_SUCH_TABLE") return null;
    throw err;
  }
}

async function recordChecksum(checksum, count) {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_version (
       id INT PRIMARY KEY,
       checksum CHAR(64) NOT NULL,
       statements INT NOT NULL,
       applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
     ) ENGINE=InnoDB`
  );
  await pool.query(
    `INSERT INTO schema_version (id, checksum, statements) VALUES (1, :checksum, :count)
     ON DUPLICATE KEY UPDATE checksum = :checksum2, statements = :count2, applied_at = CURRENT_TIMESTAMP`,
    { checksum, count, checksum2: checksum, count2: count }
  );
}

export async function applySchema({ apply, status = false }) {
  if (!/^[A-Za-z0-9_]+$/.test(env.DB_NAME)) throw new Error(`Refusing to apply: DB_NAME looks unsafe (${env.DB_NAME}).`);
  const raw = fs.readFileSync(path.resolve(__dirname, "../schema.sql"), "utf8");
  const { skipped, statements: stmts } = parseSchema(raw);
  const checksum = schemaChecksum(raw);
  console.log(`schema.sql: ${stmts.length} statements (${skipped.length} DB-bootstrap statements handled separately), sha256 ${checksum.slice(0, 12)}…`);
  if (status) {
    const recorded = await readRecordedChecksum();
    if (!recorded) {
      console.log("status: no schema_version record — database was not built by this script (or predates it).");
      return { applied: 0, total: stmts.length, status: "unknown" };
    }
    const match = recorded === checksum;
    console.log(match
      ? "status: MATCH — live database matches schema.sql."
      : `status: DRIFT — live database was built from a different schema file (recorded ${String(recorded).slice(0, 12)}…).`);
    return { applied: 0, total: stmts.length, status: match ? "match" : "drift" };
  }
  if (!apply) {
    console.log("Dry run — nothing executed. Pass --apply to execute against "
      + `${env.DB_USER}@${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}.`);
    return { applied: 0, total: stmts.length };
  }
  if (env.NODE_ENV === "production") {
    console.warn("WARNING: applying schema with NODE_ENV=production. Continuing because --apply was explicit.");
  }
  const admin = mysql.createPool({
    host: env.DB_HOST, port: env.DB_PORT, user: env.DB_USER, password: env.DB_PASS, connectionLimit: 1,
  });
  try {
    // Preflight: fail fast with a clear message instead of dying mid-apply.
    let version = "";
    try {
      const [[row]] = await admin.query(`SELECT VERSION() AS v`);
      version = String(row?.v || "");
    } catch (err) {
      throw new Error(`Cannot connect to MySQL at ${env.DB_HOST}:${env.DB_PORT} as ${env.DB_USER} (${err?.code || err?.message}). Check DB_* in server/.env.`);
    }
    const major = Number((version.match(/^(\d+)\./) || [])[1] || 0);
    if (major < 8) throw new Error(`MySQL ${version} is too old — schema.sql requires MySQL 8+.`);
    const recorded = await readRecordedChecksum().catch(() => null);
    if (recorded && recorded !== checksum) {
      console.warn("WARNING: schema_version records a different schema.sql checksum — the file changed since this database was built. Continuing because --apply was explicit.");
    }
    await admin.query(`CREATE DATABASE IF NOT EXISTS \`${env.DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    for (const [index, stmt] of stmts.entries()) {
      try {
        await pool.query(stmt);
      } catch (err) {
        const preview = stmt.replace(/\s+/g, " ").trim().slice(0, 80);
        throw new Error(`Statement ${index + 1}/${stmts.length} failed [${err?.code || "error"}]: ${preview}… (${err?.message || err})`);
      }
      if ((index + 1) % 25 === 0) console.log(`  ... ${index + 1}/${stmts.length}`);
    }
    await recordChecksum(checksum, stmts.length);
    console.log(`Done: ${stmts.length} statements applied to ${env.DB_NAME}; version recorded.`);
    return { applied: stmts.length, total: stmts.length };
  } finally {
    await admin.end().catch(() => {});
    await pool.end().catch(() => {});
  }
}

async function main() {
  const result = await applySchema({ apply: APPLY, status: STATUS });
  if (STATUS && result?.status === "drift") process.exit(2);
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    console.error("apply_schema failed:", err?.message || err);
    process.exit(1);
  });
}
