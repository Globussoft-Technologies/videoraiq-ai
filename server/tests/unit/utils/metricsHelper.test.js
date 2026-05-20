/**
 * Unit tests for utils/metricsHelper.js — thin facade over prom-client. We
 * mock the underlying metrics and assert the helpers pass through the right
 * labels + values (ms → seconds conversion for histograms).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

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
const proms = await import("../../../utils/prometheus.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("metricsHelper", () => {
  it("recordDbQuery converts ms → seconds and passes labels", () => {
    helper.recordDbQuery("find", "users", 250);
    expect(proms.dbQueryDuration.observe).toHaveBeenCalledWith(
      { operation: "find", collection: "users" },
      0.25,
    );
  });

  it("recordCacheHit increments with the cache name label", () => {
    helper.recordCacheHit("user-cache");
    expect(proms.cacheHits.inc).toHaveBeenCalledWith({
      cache_name: "user-cache",
    });
  });

  it("recordCacheMiss increments with the cache name label", () => {
    helper.recordCacheMiss("session-cache");
    expect(proms.cacheMisses.inc).toHaveBeenCalledWith({
      cache_name: "session-cache",
    });
  });

  it("recordJobCompletion defaults status to 'success'", () => {
    helper.recordJobCompletion("sendEmail", 1000);
    expect(proms.jobDuration.observe).toHaveBeenCalledWith(
      { job_name: "sendEmail", status: "success" },
      1,
    );
  });

  it("recordJobCompletion accepts an explicit status", () => {
    helper.recordJobCompletion("sendEmail", 500, "failed");
    expect(proms.jobDuration.observe).toHaveBeenCalledWith(
      { job_name: "sendEmail", status: "failed" },
      0.5,
    );
  });

  it("updateActiveConnections sets a gauge with type label", () => {
    helper.updateActiveConnections("websocket", 42);
    expect(proms.activeConnections.set).toHaveBeenCalledWith(
      { type: "websocket" },
      42,
    );
  });

  it("recordVideoProcessing converts ms → seconds", () => {
    helper.recordVideoProcessing("transcode", 2000);
    expect(proms.videoProcessingDuration.observe).toHaveBeenCalledWith(
      { processing_type: "transcode" },
      2,
    );
  });

  it("recordDetectionEvent increments with detection_type + channel", () => {
    helper.recordDetectionEvent("person", "cam1");
    expect(proms.detectionEvents.inc).toHaveBeenCalledWith({
      detection_type: "person",
      channel: "cam1",
    });
  });

  it("recordIncidentAlert increments with alert_type + severity", () => {
    helper.recordIncidentAlert("intrusion", "high");
    expect(proms.incidentAlerts.inc).toHaveBeenCalledWith({
      alert_type: "intrusion",
      severity: "high",
    });
  });
});

describe("MetricsTimer", () => {
  it("calls metricRecord with labels and a duration ≥ 0", () => {
    const fn = vi.fn();
    const timer = new helper.MetricsTimer(fn);
    timer.end({ op: "x" });
    expect(fn).toHaveBeenCalledTimes(1);
    const [labels, duration] = fn.mock.calls[0];
    expect(labels).toEqual({ op: "x" });
    expect(typeof duration).toBe("number");
    expect(duration).toBeGreaterThanOrEqual(0);
  });
});
