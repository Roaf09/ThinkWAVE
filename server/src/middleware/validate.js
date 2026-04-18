/* FILE GUIDE:
 * server/src/middleware/validate.js
 * Purpose: Project source file. Read the file name and exports first, then follow the imported helpers to understand the flow.
 * Tip: Start with exported functions/components first, then read helper functions underneath.
 */

export function validateBody(schema) {
  return (req, res, next) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Validation error", issues: parsed.error.issues });
    }
    req.body = parsed.data;
    next();
  };
}
