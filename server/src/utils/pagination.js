/* FILE GUIDE:
 * server/src/utils/pagination.js
 * Purpose: Shared ?page=&limit= parsing. Caps cost so lists stay fast forever.
 * Backward compat: if client sends no page/limit, we still apply a safe
 * default LIMIT and return a plain array (old shape). If page/limit is sent,
 * we return { rows, page, limit, hasMore } so new UI can page.
 */
export function parsePagination(req, { defaultLimit = 20, maxLimit = 100 } = {}) {
  let page = Number(req.query?.page ?? 1);
  let limit = Number(req.query?.limit ?? defaultLimit);
  if (!Number.isFinite(page) || page < 1) page = 1;
  if (!Number.isFinite(limit) || limit < 1) limit = defaultLimit;
  limit = Math.min(limit, maxLimit);
  page = Math.min(page, 1000);
  const offset = (page - 1) * limit;
  const paged = req.query?.page !== undefined || req.query?.limit !== undefined;
  return { page, limit, offset, paged };
}

export function pagedOrArray(res, rows, { page, limit, paged }) {
  if (!paged) return res.json(rows);
  const hasMore = rows.length === limit;
  return res.json({ rows, page, limit, hasMore });
}
