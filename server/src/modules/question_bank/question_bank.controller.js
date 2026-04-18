/* FILE GUIDE:
 * server/src/modules/question_bank/question_bank.controller.js
 * Purpose: Project source file. Read the file name and exports first, then follow the imported helpers to understand the flow.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import { pool } from "../../db.js";

// ireturn mga saved questions sa teacher, dipa soft delete
export async function listBankQuestions(req, res) {
  const [rows] = await pool.query(
    `SELECT id, template_type, category, prompt, config_json, correct_json, saved_at
     FROM question_bank
     WHERE teacher_id = :tid AND deleted_at IS NULL
     ORDER BY saved_at DESC`,
    { tid: req.user.sub }
  );
  // parse json fields para object tanggapin ni client hindi string
  const parsed = rows.map((r) => ({
    ...r,
    config_json:  safeJson(r.config_json),
    correct_json: safeJson(r.correct_json),
  }));
  res.json(parsed);
}


// save question sa bank
export async function saveToBank(req, res) {
  const { templateType, category, prompt, config, correct } = req.body;
  const [r] = await pool.query(
    `INSERT INTO question_bank(teacher_id, template_type, category, prompt, config_json, correct_json)
     VALUES(:tid, :tt, :cat, :prompt, :cfg, :corr)`,
    {
      tid:    req.user.sub,
      tt:     templateType,
      cat:    category,
      prompt,
      cfg:    config  ? JSON.stringify(config)  : null,
      corr:   correct ? JSON.stringify(correct) : null,
    }
  );
  res.status(201).json({ id: r.insertId, message: "Saved to question bank." });
}


// soft delete
export async function deleteFromBank(req, res) {
  await pool.query(
    `UPDATE question_bank
     SET deleted_at = NOW()
     WHERE id = :id AND teacher_id = :tid AND deleted_at IS NULL`,
    { id: req.params.id, tid: req.user.sub }
  );
  res.json({ ok: true });
}

function safeJson(v) {
  if (!v) return null;
  if (typeof v === "object") return v;
  try { return JSON.parse(v); } catch { return null; }
}
