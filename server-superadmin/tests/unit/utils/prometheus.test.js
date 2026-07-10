/**
 * Unit tests for utils/prometheus.js — the metrics module that wraps
 * prom-client. The product imports prom-client at module load and
 * registers default metrics + several custom collectors. In CI the
 * prom-client package is not installed, so we mock it out at the
 * import-graph level (matching the pattern used by metricsHelper.test.js
 * which mocks utils/prometheus.js itself).
 *
 * With the mock in place we can drive `metricsHandler` through its
 * success + failure branches without depending on the real registry.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const metricsMock = vi.fn();
const registerStub = {
  metrics: metricsMock,
  get contentType() {
    return "text/plain; version=0.0.4; charset=utf-8";
  },
};

// Constructor stubs return objects that expose the methods the product
// reaches for elsewhere; the prometheus.js module itself only constructs
// them, so we just need callable constructors.
function makeMetricStub() {
  return { observe: vi.fn(), inc: vi.fn(), set: vi.fn() };
}

vi.mock("prom-client", () => {
  return {
    default: {
      collectDefaultMetrics: vi.fn(),
      register: registerStub,
      Histogram: vi.fn(() => makeMetricStub()),
      Counter: vi.fn(() => makeMetricStub()),
      Gauge: vi.fn(() => makeMetricStub()),
    },
  };
});

const prometheus = await import("../../../utils/prometheus.js");

function makeRes() {
  return {
    statusCode: 200,
    _body: undefined,
    _headers: {},
    set(name, value) {
      if (typeof name === "object") {
        Object.assign(this._headers, name);
      } else {
        this._headers[name] = value;
      }
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    end(payload) {
      this._body = payload;
      return this;
    },
  };
}

beforeEach(() => {
  metricsMock.mockReset();
});

describe("utils/prometheus exports", () => {
  it("exposes the documented set of metric collectors", () => {
    // Each export should be a constructed metric instance. We don't care
    // about the specific shape (Histogram vs Counter vs Gauge) — only
    // that the module wired one up under each name.
    for (const name of [
      "httpRequestDuration",
      "httpRequestTotal",
      "dbQueryDuration",
      "cacheHits",
      "cacheMisses",
      "jobQueueSize",
      "jobDuration",
      "activeConnections",
      "videoProcessingDuration",
      "detectionEvents",
      "incidentAlerts",
    ]) {
      expect(prometheus[name], `missing export: ${name}`).toBeTypeOf("object");
    }
    expect(prometheus.metricsHandler).toBeTypeOf("function");
  });
});

describe("metricsHandler", () => {
  it("writes the prom-client content-type header and the metrics payload", async () => {
    metricsMock.mockResolvedValueOnce("# fake metrics output");
    const res = makeRes();

    await prometheus.metricsHandler({}, res);

    expect(res._headers["Content-Type"]).toBe(
      "text/plain; version=0.0.4; charset=utf-8",
    );
    expect(res._body).toBe("# fake metrics output");
    // Should not have flipped to an error code on the success path.
    expect(res.statusCode).toBe(200);
  });

  it("responds 500 when prom-client register.metrics() rejects", async () => {
    metricsMock.mockRejectedValueOnce(new Error("registry broken"));
    const res = makeRes();

    await prometheus.metricsHandler({}, res);

    expect(res.statusCode).toBe(500);
    expect(res._body).toBe("Internal Server Error");
  });
});
