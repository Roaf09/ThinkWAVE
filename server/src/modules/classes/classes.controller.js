/* FILE GUIDE:
 * server/src/modules/classes/classes.controller.js
 * Purpose: Folder/classes tree logic plus analytics cards grouped under classes.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

import { pool } from "../../db.js";

async function getTeacherFolders(teacherId) {
  const [rows] = await pool.query(
    `SELECT id, parent_id, teacher_id
     FROM classes
     WHERE teacher_id=:tid AND deleted_at IS NULL
     ORDER BY id ASC`,
    { tid: teacherId }
  );
  return rows;
}

function collectFolderAndDescendants(rows, rootId) {
  const byParent = rows.reduce((acc, row) => {
    const key = row.parent_id ?? 0;
    if (!acc[key]) acc[key] = [];
    acc[key].push(row.id);
    return acc;
  }, {});

  const found = [];
  const stack = [Number(rootId)];
  const seen = new Set();

  while (stack.length) {
    const id = stack.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    found.push(id);
    const kids = byParent[id] || [];
    for (const childId of kids) stack.push(childId);
  }

  return found;
}

export async function listClasses(req, res) {
  const [rows] = await pool.query(
    `SELECT id, teacher_id, name, parent_id, created_at, updated_at
     FROM classes
     WHERE teacher_id=:tid AND deleted_at IS NULL
     ORDER BY COALESCE(parent_id, 0) ASC, name ASC, id ASC`,
    { tid: req.user.sub }
  );
  res.json(rows);
}

export async function createClass(req, res) {
  const { name, parentId } = req.body;
  const normalizedParentId = parentId ? Number(parentId) : null;

  if (normalizedParentId) {
    const [[parent]] = await pool.query(
      `SELECT id FROM classes WHERE id=:id AND teacher_id=:tid AND deleted_at IS NULL`,
      { id: normalizedParentId, tid: req.user.sub }
    );
    if (!parent) return res.status(400).json({ message: "Parent folder not found." });
  }

  const [r] = await pool.query(
    `INSERT INTO classes(teacher_id,name,parent_id) VALUES(:tid,:name,:parentId)`,
    { tid: req.user.sub, name: name.trim(), parentId: normalizedParentId }
  );
  res.status(201).json({ id: r.insertId });
}

export async function updateClass(req, res) {
  const folderId = Number(req.params.id);
  const { name, parentId } = req.body;
  const normalizedParentId = parentId ? Number(parentId) : null;

  const [[folder]] = await pool.query(
    `SELECT id FROM classes WHERE id=:id AND teacher_id=:tid AND deleted_at IS NULL`,
    { id: folderId, tid: req.user.sub }
  );
  if (!folder) return res.status(404).json({ message: "Folder not found." });

  if (normalizedParentId === folderId) {
    return res.status(400).json({ message: "A folder cannot be its own parent." });
  }

  const allRows = await getTeacherFolders(req.user.sub);
  const descendants = new Set(collectFolderAndDescendants(allRows, folderId));
  if (normalizedParentId && descendants.has(normalizedParentId)) {
    return res.status(400).json({ message: "You cannot move a folder inside its own subtree." });
  }

  if (normalizedParentId) {
    const [[parent]] = await pool.query(
      `SELECT id FROM classes WHERE id=:id AND teacher_id=:tid AND deleted_at IS NULL`,
      { id: normalizedParentId, tid: req.user.sub }
    );
    if (!parent) return res.status(400).json({ message: "Parent folder not found." });
  }

  await pool.query(
    `UPDATE classes
     SET name=:name, parent_id=:parentId
     WHERE id=:id AND teacher_id=:tid AND deleted_at IS NULL`,
    { id: folderId, tid: req.user.sub, name: name.trim(), parentId: normalizedParentId }
  );
  res.json({ ok: true });
}

export async function softDeleteClass(req, res) {
  const folderId = Number(req.params.id);
  const rows = await getTeacherFolders(req.user.sub);
  const ids = collectFolderAndDescendants(rows, folderId);
  if (!ids.length) return res.json({ ok: true });

  await pool.query(
    `UPDATE classes SET deleted_at=NOW() WHERE teacher_id=:tid AND id IN (:ids)`,
    { tid: req.user.sub, ids }
  );
  res.json({ ok: true, deletedIds: ids });
}

export async function restoreClass(req, res) {
  const where = req.user.role === "ADMIN" ? "id=:id" : "id=:id AND teacher_id=:tid";
  await pool.query(`UPDATE classes SET deleted_at=NULL WHERE ${where}`, { id: req.params.id, tid: req.user.sub });
  res.json({ ok: true });
}
