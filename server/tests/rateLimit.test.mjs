/* FILE GUIDE:
 * server/tests/rateLimit.test.mjs
 * Purpose: Regression tests for the in-memory limiter (no DB). Run: npm test
 * Locks in: exact budget (max passes, max+1 blocked), Retry-After, per-client
 * isolation, window expiry, skip(), and fail-open behavior.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rateLimit } from "../src/middleware/rateLimit.js";

function mockReq(ip = "1.2.3.4") {
  return { ip, baseUrl: "/api/t", path: "/x" };
}

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
    setHeader(k, v) {
      this.headers[k] = v;
    },
  };
}

async function run(mw, req) {
  const res = mockRes();
  let nexted = false;
  await mw(req, res, () => {
    nexted = true;
  });
  return { res, nexted };
}

describe("rateLimit", () => {
  it("allows exactly max requests, blocks the next with 429 + Retry-After", async () => {
    const mw = rateLimit({ windowMs: 60000, max: 3, key: "t1" });
    for (let i = 0; i < 3; i += 1) {
      const { res, nexted } = await run(mw, mockReq(`10.0.0.${i}`));
      assert.equal(nexted, true);
      assert.equal(res.statusCode, 200);
    }
    // Same client 4th time is blocked (fresh IP per loop above, so use one IP).
    const mw2 = rateLimit({ windowMs: 60000, max: 2, key: "t1b" });
    await run(mw2, mockReq("9.9.9.9"));
    await run(mw2, mockReq("9.9.9.9"));
    const blocked = await run(mw2, mockReq("9.9.9.9"));
    assert.equal(blocked.nexted, false);
    assert.equal(blocked.res.statusCode, 429);
    assert.ok(Number(blocked.res.headers["Retry-After"]) >= 1);
    assert.match(blocked.res.body.message, /Too many/);
  });

  it("isolates budgets per client", async () => {
    const mw = rateLimit({ windowMs: 60000, max: 1, key: "t2" });
    const a1 = await run(mw, mockReq("1.1.1.1"));
    assert.equal(a1.nexted, true);
    const a2 = await run(mw, mockReq("1.1.1.1"));
    assert.equal(a2.nexted, false);
    const b1 = await run(mw, mockReq("2.2.2.2"));
    assert.equal(b1.nexted, true);
  });

  it("resets after the window passes", async () => {
    const mw = rateLimit({ windowMs: 200, max: 1, key: "t3" });
    await run(mw, mockReq("3.3.3.3"));
    const blocked = await run(mw, mockReq("3.3.3.3"));
    assert.equal(blocked.nexted, false);
    await new Promise((r) => setTimeout(r, 250));
    const again = await run(mw, mockReq("3.3.3.3"));
    assert.equal(again.nexted, true);
  });

  it("honors skip() and custom keyGenerator", async () => {
    const mw = rateLimit({
      windowMs: 60000,
      max: 1,
      key: "t4",
      skip: (req) => req.ip === "skip.me",
      keyGenerator: () => "shared",
    });
    await run(mw, mockReq("5.5.5.5"));
    const skipped = await run(mw, mockReq("skip.me"));
    assert.equal(skipped.nexted, true);
    // Different IP, same generated key -> shares budget, blocked.
    const shared = await run(mw, mockReq("6.6.6.6"));
    assert.equal(shared.nexted, false);
  });

  it("fails open when keyGenerator throws", async () => {
    const mw = rateLimit({
      windowMs: 60000,
      max: 1,
      key: "t5",
      keyGenerator: () => {
        throw new Error("boom");
      },
    });
    const { nexted } = await run(mw, mockReq("7.7.7.7"));
    assert.equal(nexted, true);
  });
});
