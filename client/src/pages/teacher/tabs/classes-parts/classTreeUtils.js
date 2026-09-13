// Pure folder-tree helpers. Extracted verbatim from ClassesTab.jsx.
export function buildTree(rows) {
  const byId = new Map();
  const roots = [];
  (rows || []).forEach((row) => byId.set(Number(row.id), { ...row, children: [] }));
  (rows || []).forEach((row) => {
    const node = byId.get(Number(row.id));
    if (row.parent_id && byId.has(Number(row.parent_id))) byId.get(Number(row.parent_id)).children.push(node);
    else roots.push(node);
  });
  const sort = (items) => items.sort((a, b) => String(a.name).localeCompare(String(b.name))).forEach((n) => sort(n.children || []));
  sort(roots);
  return roots;
}

export function buildPath(rows, id) {
  const byId = new Map((rows || []).map((row) => [Number(row.id), row]));
  const trail = [];
  let cursor = byId.get(Number(id));
  while (cursor) {
    trail.unshift(cursor);
    cursor = cursor.parent_id ? byId.get(Number(cursor.parent_id)) : null;
  }
  return trail;
}

export function findNode(tree, id) {
  for (const node of tree) {
    if (Number(node.id) === Number(id)) return node;
    const child = findNode(node.children || [], id);
    if (child) return child;
  }
  return null;
}
