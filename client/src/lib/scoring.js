// Shared scorer bridge: single source of truth with the server.
// Both files are pure JS (no node builtins, no DB) so Vite can bundle them.
// Do NOT import attachCompetitiveTotals from leaderboard.js — it needs `pool`.
export {
  scoreAnswer,
  scoreCrosswordBatch,
  normalizeTemplateType,
  TEMPLATE_TYPES,
} from "../../../server/src/modules/quizzes/templates.js";
export {
  calculateCompetitivePoints,
  competitiveSpeedMultiplier,
  withCompetitiveMeta,
} from "../../../server/src/modules/sessions/leaderboard.js";
