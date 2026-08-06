/* FILE GUIDE:
 * server/src/utils/schemaCompat.js
 * Purpose: Read-only schema capability checks used to keep upgraded endpoints working
 * against an older local database until the authoritative schema is re-imported.
 */

import { pool } from "../db.js";

const columnCache = new Map();

export async function hasDatabaseColumn(tableName, columnName) {
  const cacheKey = `${tableName}.${columnName}`;
  if (columnCache.has(cacheKey)) return columnCache.get(cacheKey);

  const [[row]] = await pool.query(
    `SELECT 1 AS present
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = :tableName
       AND column_name = :columnName
     LIMIT 1`,
    { tableName, columnName }
  );
  const present = Boolean(row?.present);
  columnCache.set(cacheKey, present);
  return present;
}
