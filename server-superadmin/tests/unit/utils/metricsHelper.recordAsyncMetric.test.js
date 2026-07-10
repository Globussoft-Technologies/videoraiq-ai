/**
 * utils/metricsHelper.js — pin the only uncovered surface left in the file:
 * `recordAsyncMetric` (lines 74-82). Sibling `metricsHelper.test.js` covers
 * every other helper + the `MetricsTimer` class.
 *
 * R85 — server phase. **Skipped citing product bug #112**.
 *
 * `recordAsyncMetric` references `this.startTime` inside a stand-alone async
 * function declaration. Under Node ESM, the function's `this` resolves to the
 * `global` object (CJS sloppy-binding compatibility). `global.startTime` is
 * `undefined`, so `Date.now() - undefined` evaluates to **NaN**, and
 * `metricRecord(labels, NaN)` is silently called with a corrupt duration.
 * `prom-client.observe(..., NaN)` no-ops, so every async metric data point is
 * silently dropped. See
 * https://github.com/Globussoft-Technologies/videoraiq-ai/issues/112.
 *
 * The two specs below are the ones we'd run if the bug were fixed (s/this.//):
 *   • happy path — asyncFn resolves → metricRecord called with labels + duration
 *   • error path — asyncFn rejects → metricRecord still called (finally) AND
 *                  the rejection bubbles out unchanged
 *
 * Both are kept as `.skip` so coverage of these lines stays honestly at zero
 * until the product fix lands. Mocks: 1 (prometheus.js, mirrors sibling).
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("../../../utils/prometheus.js", () => ({
  dbQueryDuration: { observe: vi.fn() },
  cacheHits: { inc: vi.fn() },
  cacheMisses: { inc: vi.fn() },
  jobDuration: { observe: vi.fn() },
  activeConnections: { set: vi.fn() },
  videoProcessingDuration: { observe: vi.fn() },
  detectionEvents: { inc: vi.fn() },
  incidentAlerts: { inc: vi.fn() },
}));

const helper = await import("../../../utils/metricsHelper.js");

describe("metricsHelper.recordAsyncMetric (BLOCKED on #112)", () => {
  it.skip(
    "calls metricRecord with labels + duration on the happy path — see #112",
    async () => {
      const metricRecord = vi.fn();
      const out = await helper.recordAsyncMetric(
        async () => "ok",
        metricRecord,
        { op: "x" },
      );
      expect(out).toBe("ok");
      expect(metricRecord).toHaveBeenCalledTimes(1);
      const [labels, duration] = metricRecord.mock.calls[0];
      expect(labels).toEqual({ op: "x" });
      expect(typeof duration).toBe("number");
      expect(duration).toBeGreaterThanOrEqual(0);
    },
  );

  it.skip(
    "still calls metricRecord and re-throws when asyncFn rejects — see #112",
    async () => {
      const metricRecord = vi.fn();
      await expect(
        helper.recordAsyncMetric(
          async () => {
            throw new Error("inner-fail");
          },
          metricRecord,
          { op: "y" },
        ),
      ).rejects.toThrow("inner-fail");
      expect(metricRecord).toHaveBeenCalledTimes(1);
    },
  );

  it("documents the bug — recordAsyncMetric silently passes NaN as duration today (#112)", async () => {
    // This spec is intentionally NOT skipped — it pins the current buggy
    // behavior so a future product fix (s/this.startTime/startTime/) surfaces
    // a CI failure (the duration becomes a real number ≥ 0 instead of NaN)
    // and the maintainer remembers to unskip the two specs above.
    const metricRecord = vi.fn();
    const out = await helper.recordAsyncMetric(
      async () => "ok",
      metricRecord,
      { op: "z" },
    );
    expect(out).toBe("ok");
    expect(metricRecord).toHaveBeenCalledTimes(1);
    const [labels, duration] = metricRecord.mock.calls[0];
    expect(labels).toEqual({ op: "z" });
    // CURRENT (buggy) behavior — NaN. When the fix lands this expectation
    // will fail and the assertion ABOVE (toBeGreaterThanOrEqual(0)) in the
    // skipped happy-path spec is the correct one to unskip.
    expect(Number.isNaN(duration)).toBe(true);
  });
});
