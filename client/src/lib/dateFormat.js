/* FILE GUIDE:
 * client/src/lib/dateFormat.js
 * Purpose: The one place every displayed timestamp goes through, pinned to
 * Asia/Manila. `toLocaleString("en-PH", ...)` on its own only sets the
 * locale (date format conventions) - without an explicit `timeZone` it still
 * renders using whichever timezone the viewer's device happens to be set
 * to, which silently produces the wrong wall-clock time for anyone whose
 * device isn't already on Philippine time. Every value here is an absolute
 * instant (an ISO string or Date) already correctly stored server-side
 * (see server/src/db.js) - only the display step needs pinning.
 */

const MANILA_TZ = "Asia/Manila";

export function manilaDateTime(value, options) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("en-PH", { timeZone: MANILA_TZ, ...options });
}

export function manilaDate(value, options) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-PH", { timeZone: MANILA_TZ, ...options });
}

export function manilaTime(value, options) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleTimeString("en-PH", { timeZone: MANILA_TZ, ...options });
}
