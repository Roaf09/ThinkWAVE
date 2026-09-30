/* FILE GUIDE:
 * server/src/queue.js
 * Purpose: Single-service background queue. Slow work (mail, exports) runs
 * after the HTTP response, so one slow SMTP/PDF never blocks 45 students.
 * Free: in-process via p-queue, no Redis/worker service needed.
 * Later: if REDIS_URL + BullMQ is added, keep same enqueueMail/enqueueExport
 * names and move the internals — callers don't change.
 */
import PQueue from "p-queue";

const mailQueue = new PQueue({ concurrency: 2 });
const exportQueue = new PQueue({ concurrency: 1 });

mailQueue.on("error", (err) => console.error("[queue:mail] failed:", err?.message || err));
exportQueue.on("error", (err) => console.error("[queue:export] failed:", err?.message || err));

async function withRetries(fn, { attempts = 3, baseMs = 1000 } = {}) {
  let lastErr;
  for (let i = 1; i <= attempts; i += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts) await new Promise((r) => setTimeout(r, baseMs * i));
    }
  }
  throw lastErr;
}

export function enqueueMail(sendFn) {
  // Fire-and-forget: caller already responded to user.
  mailQueue.add(() => withRetries(sendFn, { attempts: 3, baseMs: 2000 })).catch((err) =>
    console.error("[queue:mail] giving up:", err?.message || err)
  );
  return { queued: true };
}

// Same as enqueueMail, but waits briefly for the outcome so the caller can
// answer honestly ("delivered" vs "failed/slow — resend"). Used by
// interactive code-entry flows where the user stares at the screen waiting.
// Resolves true only on confirmed delivery; never throws.
export function enqueueMailWait(sendFn, { timeoutMs = 8000 } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => settle(false), Math.max(1000, timeoutMs));
    mailQueue
      .add(() =>
        withRetries(
          async () => {
            // sendMail resolves (never throws) with { sent:false } on
            // provider failure — convert that into a retriable error so a
            // false "delivered" is never reported.
            const result = await sendFn();
            if (result && result.sent === false) {
              throw new Error(result.reason || result.error || "not sent");
            }
            return result;
          },
          { attempts: 2, baseMs: 1500 }
        ).then(
          () => settle(true),
          (err) => {
            console.error("[queue:mail] giving up:", err?.message || err);
            settle(false);
          }
        )
      )
      .catch(() => settle(false));
  });
}

export function enqueueExport(jobFn) {
  return exportQueue.add(() => withRetries(jobFn, { attempts: 2, baseMs: 1000 }));
}

export function queueStats() {
  return {
    mailPending: mailQueue.pending,
    mailSize: mailQueue.size,
    exportPending: exportQueue.pending,
    exportSize: exportQueue.size,
  };
}
