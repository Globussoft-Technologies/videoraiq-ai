/**
 * Unit test for prometheusMiddleware — covers the `finish` callback recording
 * histogram + counter labels on the prom-client mocks. The middleware does not
 * touch any external services, so we mock the metric instruments and assert
 * the labels handed to them.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "events";

const observeSpy = vi.fn();
const incSpy = vi.fn();

vi.mock("../../../utils/prometheus.js", () => ({
  httpRequestDuration: { observe: observeSpy },
  httpRequestTotal: { inc: incSpy },
}));

const { prometheusMiddleware } = await import(
  "../../../middlewares/prometheusMiddleware.js"
);

function makeRes() {
  const res = new EventEmitter();
  res.statusCode = 200;
  return res;
}

beforeEach(() => {
  observeSpy.mockClear();
  incSpy.mockClear();
});

describe("prometheusMiddleware", () => {
  it("calls next() synchronously", () => {
    const req = { method: "GET", path: "/x" };
    const res = makeRes();
    const next = vi.fn();
    prometheusMiddleware(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("records duration + count on response finish", () => {
    const req = { method: "GET", path: "/widgets" };
    const res = makeRes();
    prometheusMiddleware(req, res, () => {});
    res.emit("finish");
    expect(observeSpy).toHaveBeenCalledOnce();
    expect(incSpy).toHaveBeenCalledOnce();
    const labels = incSpy.mock.calls[0][0];
    expect(labels.method).toBe("GET");
    expect(labels.route).toBe("/widgets");
    expect(labels.status_code).toBe(200);
  });

  it("prefers req.route.path over req.path when present", () => {
    const req = { method: "POST", path: "/raw", route: { path: "/api/x" } };
    const res = makeRes();
    prometheusMiddleware(req, res, () => {});
    res.emit("finish");
    expect(incSpy.mock.calls[0][0].route).toBe("/api/x");
  });

  it("falls back to 'unknown' route when neither path is available", () => {
    const req = { method: "DELETE" };
    const res = makeRes();
    res.statusCode = 404;
    prometheusMiddleware(req, res, () => {});
    res.emit("finish");
    const labels = incSpy.mock.calls[0][0];
    expect(labels.route).toBe("unknown");
    expect(labels.status_code).toBe(404);
  });
});
