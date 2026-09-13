/**
 * Portable syntax check for every server JS file (works on Windows + CI).
 * Usage: node scripts/check_all.mjs
 */
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const roots = [path.resolve(__dirname, "../src"), __dirname];

function collect(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      collect(full, out);
    } else if (entry.name.endsWith(".js") || entry.name.endsWith(".mjs")) {
      out.push(full);
    }
  }
  return out;
}

function check(file) {
  return new Promise((resolve) => {
    execFile(process.execPath, ["--check", file], (error) => resolve({ file, ok: !error }));
  });
}

const files = [...new Set(roots.flatMap((r) => collect(r)))].sort();
const results = await Promise.all(files.map(check));
const failed = results.filter((r) => !r.ok);
for (const { file } of failed) console.error(`FAIL: ${file}`);
console.log(`${results.length - failed.length}/${results.length} files passed node --check.`);
process.exit(failed.length ? 1 : 0);
