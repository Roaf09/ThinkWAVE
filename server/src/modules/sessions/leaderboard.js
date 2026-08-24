import { normalizeTemplateType, TEMPLATE_TYPES } from "../quizzes/templates.js";

const SIMPLE_SPEED_TEMPLATES = new Set([
  TEMPLATE_TYPES.MCQ,
  TEMPLATE_TYPES.TRUE_FALSE,
  TEMPLATE_TYPES.TYPE_ANSWER,
  TEMPLATE_TYPES.GUESS_WORD_4PICS,
]);
const PARTIAL_SPEED_TEMPLATES = new Set([
  TEMPLATE_TYPES.MATCHING,
  TEMPLATE_TYPES.THINK_SPELL,
]);

export function competitiveSpeedMultiplier(remainingRatio) {
  const remaining = Math.max(0, Math.min(1, Number(remainingRatio) || 0));
  if (remaining >= 0.5) return 0.6 + (0.4 * remaining); // 100% left => 100%, 50% left => 80%
  if (remaining >= 0.25) return 0.4 + (0.8 * remaining); // 50% left => 80%, 25% left => 60%
  return 0.6; // last quarter still keeps roughly 60% for a correct in-time answer
}

export function calculateCompetitivePoints({ templateType, scored, basePoints, elapsedMs, timeLimitMs, timeExpired = false }) {
  if (timeExpired || Number(timeLimitMs || 0) <= 0 || Number(elapsedMs || 0) > Number(timeLimitMs || 0) + 300) return 0;
  const maxCompetitive = Math.max(1, Math.min(3, Number(basePoints) || 1)) * 1000;
  const remainingRatio = Math.max(0, Math.min(1, 1 - (Math.max(0, Number(elapsedMs || 0)) / Number(timeLimitMs || 1))));
  const speed = competitiveSpeedMultiplier(remainingRatio);
  const tt = normalizeTemplateType(templateType);

  if (SIMPLE_SPEED_TEMPLATES.has(tt)) {
    return scored?.isCorrect ? Math.round(maxCompetitive * speed) : 0;
  }
  if (PARTIAL_SPEED_TEMPLATES.has(tt)) {
    const correctCount = Number(scored?.correctCount ?? scored?.totalWords ?? 0);
    const total = Number(scored?.totalCorrect ?? scored?.totalPairs ?? scored?.totalItems ?? scored?.requiredWords ?? 0);
    const correctness = total > 0 ? Math.max(0, Math.min(1, correctCount / total)) : (scored?.isCorrect ? 1 : 0);
    return Math.round(maxCompetitive * correctness * speed);
  }
  return scored?.isCorrect ? Math.round(maxCompetitive * speed) : 0;
}

export function withCompetitiveMeta(answer, meta = {}) {
  const body = answer && typeof answer === "object" && !Array.isArray(answer) ? { ...answer } : { value: answer ?? null };
  body.__tw_live = {
    competitivePoints: Math.max(0, Math.round(Number(meta.competitivePoints || 0))),
    responseMs: Math.max(0, Math.round(Number(meta.responseMs || 0))),
    timeExpired: !!meta.timeExpired,
  };
  return body;
}

function readJson(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return {}; }
}

export async function attachCompetitiveTotals(pool, sessionId, rows, { groupMode = false } = {}) {
  const [responses] = await pool.query(
    `SELECT participant_id, answer_json FROM responses WHERE session_id=:sid`,
    { sid: sessionId }
  );
  const totals = new Map();
  const responseTimes = new Map();
  for (const response of responses) {
    const payload = readJson(response.answer_json);
    const meta = payload?.__tw_live || {};
    const pid = Number(response.participant_id);
    totals.set(pid, Number(totals.get(pid) || 0) + Number(meta.competitivePoints || 0));
    responseTimes.set(pid, Number(responseTimes.get(pid) || 0) + Number(meta.responseMs || 0));
  }

  return rows.map((row) => {
    if (!groupMode) {
      const pid = Number(row.participant_id);
      return { ...row, competitive_points: Math.round(Number(totals.get(pid) || 0)), response_time_ms: Math.round(Number(responseTimes.get(pid) || 0)) };
    }
    const memberIds = String(row.member_ids || "").split(",").map(Number).filter(Boolean);
    let competitive = 0;
    let responseMs = 0;
    for (const pid of memberIds) {
      competitive = Math.max(competitive, Number(totals.get(pid) || 0));
      const candidateTime = Number(responseTimes.get(pid) || 0);
      if (candidateTime > 0 && (responseMs === 0 || candidateTime < responseMs)) responseMs = candidateTime;
    }
    return { ...row, competitive_points: Math.round(competitive), response_time_ms: Math.round(responseMs) };
  });
}

export function sortCompetitiveRows(rows) {
  return [...rows].sort((a, b) => {
    const competitive = Number(b.competitive_points || 0) - Number(a.competitive_points || 0);
    if (competitive) return competitive;
    const correctness = Number(b.total_points || 0) - Number(a.total_points || 0);
    if (correctness) return correctness;
    const aTime = Number(a.response_time_ms || a.completion_ms || Number.MAX_SAFE_INTEGER);
    const bTime = Number(b.response_time_ms || b.completion_ms || Number.MAX_SAFE_INTEGER);
    if (aTime !== bTime) return aTime - bTime;
    return Number(a.participant_id || a.group_id || Number.MAX_SAFE_INTEGER) - Number(b.participant_id || b.group_id || Number.MAX_SAFE_INTEGER);
  });
}
