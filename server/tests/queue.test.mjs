/* FILE GUIDE:
 * server/tests/queue.test.mjs
 * Purpose: Regression tests for the mail queue waiter (no SMTP). Run: npm test
 * Locks in: true only on confirmed delivery, false on provider failure or
 * timeout — never a throw, never a false "delivered".
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { enqueueMailWait } from "../src/queue.js";

describe("enqueueMailWait", () => {
  it("resolves true when the provider confirms delivery", async () => {
    const ok = await enqueueMailWait(async () => ({ sent: true, messageId: "x" }), { timeoutMs: 3000 });
    assert.equal(ok, true);
  });

  it("resolves false when the provider reports failure", async () => {
    const ok = await enqueueMailWait(async () => ({ sent: false, reason: "SMTP_SEND_FAILED" }), { timeoutMs: 5000 });
    assert.equal(ok, false);
  });

  it("resolves false on timeout instead of hanging", async () => {
    const start = Date.now();
    const ok = await enqueueMailWait(() => new Promise(() => {}), { timeoutMs: 300 });
    assert.equal(ok, false);
    assert.ok(Date.now() - start < 2000);
  });

  it("never throws when the sender throws", async () => {
    const ok = await enqueueMailWait(
      async () => {
        throw new Error("connection reset");
      },
      { timeoutMs: 5000 }
    );
    assert.equal(ok, false);
  });
});
