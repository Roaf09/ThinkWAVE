/* FILE GUIDE:
 * server/tests/scoring.test.mjs
 * Purpose: Regression tests for pure logic (no DB). Run: npm test
 * Covers the exact formulas live + assignment scoring share, so a refactor
 * can never silently change points, ranks, or cache/pagination behavior.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scoreAnswer } from "../src/modules/quizzes/templates.js";
import {
  calculateCompetitivePoints,
  sortCompetitiveRows,
} from "../src/modules/sessions/leaderboard.js";
import { createTTLCache } from "../src/utils/ttlCache.js";
import { parsePagination } from "../src/utils/pagination.js";

describe("scoreAnswer MCQ", () => {
  it("full marks for the exact correct choice", () => {
    const r = scoreAnswer({
      templateType: "MCQ",
      correct: { choice: "Paris" },
      answer: { choice: "Paris" },
      config: {},
      basePoints: 2,
    });
    assert.equal(r.isCorrect, true);
    assert.equal(r.pointsAwarded, 2);
  });

  it("zero for a wrong choice, flags hasWrongSelected", () => {
    const r = scoreAnswer({
      templateType: "MCQ",
      correct: { choice: "Paris" },
      answer: { choice: "Rome" },
      config: {},
      basePoints: 2,
    });
    assert.equal(r.isCorrect, false);
    assert.equal(r.pointsAwarded, 0);
    assert.equal(r.hasWrongSelected, true);
  });

  it("partial credit for 1 of 2 correct choices", () => {
    const r = scoreAnswer({
      templateType: "MCQ",
      correct: { choices: ["A", "B"] },
      answer: { choices: ["A"] },
      config: {},
      basePoints: 2,
    });
    assert.equal(r.isCorrect, false);
    assert.equal(r.pointsAwarded, 1);
  });
});

describe("scoreAnswer other templates", () => {
  it("TRUE_FALSE is case-insensitive", () => {
    const r = scoreAnswer({
      templateType: "TRUE_FALSE",
      correct: { choice: "True" },
      answer: { choice: "true" },
      config: {},
      basePoints: 1,
    });
    assert.equal(r.isCorrect, true);
  });

  it("TYPE_ANSWER accepts alternate answers", () => {
    const r = scoreAnswer({
      templateType: "TYPE_ANSWER",
      correct: { text: "Manila", answers: ["Maynila"] },
      answer: { text: "maynila" },
      config: {},
      basePoints: 1,
    });
    assert.equal(r.isCorrect, true);
  });

  it("MATCHING scores per correct pair", () => {
    const r = scoreAnswer({
      templateType: "MATCHING",
      correct: { pairs: [{ aIndex: 0, bIndex: 1 }, { aIndex: 1, bIndex: 0 }] },
      answer: { pairs: [{ aIndex: 0, bIndex: 1 }, { aIndex: 1, bIndex: 2 }] },
      config: {},
      basePoints: 1,
    });
    assert.equal(r.correctCount, 1);
    assert.equal(r.pointsAwarded, 1);
  });

  it("missing correct returns zero, never throws", () => {
    const r = scoreAnswer({ templateType: "MCQ", correct: null, answer: { choice: "A" }, config: {}, basePoints: 1 });
    assert.equal(r.pointsAwarded, 0);
  });
});

describe("calculateCompetitivePoints", () => {
  const base = { templateType: "MCQ", scored: { isCorrect: true, pointsAwarded: 2, correctCount: 1, totalCorrect: 1 }, basePoints: 2, timeLimitMs: 30000 };
  it("faster correct answer beats slower correct answer", () => {
    const fast = calculateCompetitivePoints({ ...base, elapsedMs: 2000 });
    const slow = calculateCompetitivePoints({ ...base, elapsedMs: 25000 });
    assert.ok(fast > slow, `fast=${fast} slow=${slow}`);
  });

  it("expired submission scores competitive zero", () => {
    const r = calculateCompetitivePoints({ ...base, elapsedMs: 29000, timeExpired: true });
    assert.equal(r, 0);
  });

  it("wrong answer scores competitive zero", () => {
    const r = calculateCompetitivePoints({
      ...base,
      scored: { isCorrect: false, pointsAwarded: 0, correctCount: 0, totalCorrect: 1 },
      elapsedMs: 1000,
    });
    assert.equal(r, 0);
  });
});

describe("sortCompetitiveRows", () => {
  it("orders by competitive desc, then points desc", () => {
    const rows = sortCompetitiveRows([
      { participant_id: 1, total_points: 10, competitive_points: 100 },
      { participant_id: 2, total_points: 10, competitive_points: 300 },
      { participant_id: 3, total_points: 20, competitive_points: 100 },
    ]);
    assert.deepEqual(rows.map((r) => r.participant_id), [2, 3, 1]);
  });
});

describe("createTTLCache", () => {
  it("evicts oldest past max", () => {
    const c = createTTLCache({ max: 2, ttlMs: 60000 });
    c.set("a", 1);
    c.set("b", 2);
    c.set("c", 3);
    assert.equal(c.size, 2);
    assert.equal(c.has("a"), false);
  });

  it("expires entries after ttl", async () => {
    const c = createTTLCache({ max: 10, ttlMs: 20 });
    c.set("x", 1);
    assert.equal(c.get("x"), 1);
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(c.get("x"), undefined);
  });
});

describe("parsePagination", () => {
  it("defaults page 1 limit 20", () => {
    const p = parsePagination({ query: {} }, { defaultLimit: 20, maxLimit: 100 });
    assert.deepEqual([p.page, p.limit, p.offset, p.paged], [1, 20, 0, false]);
  });

  it("caps limit at max and floors page at 1", () => {
    const p = parsePagination({ query: { page: "0", limit: "9999" } }, { defaultLimit: 20, maxLimit: 100 });
    assert.deepEqual([p.page, p.limit, p.offset], [1, 100, 0]);
  });

  it("page 3 offset is 2x limit and marks paged", () => {
    const p = parsePagination({ query: { page: "3", limit: "20" } }, { defaultLimit: 20, maxLimit: 100 });
    assert.deepEqual([p.page, p.limit, p.offset, p.paged], [3, 20, 40, true]);
  });
});
