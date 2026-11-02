import { describe, expect, it } from "vitest";
import { runtimeStatus } from "../../core/v2/agentActions/runtimeStatus.js";

const channel = {
  _id: "camera-1", configurationVersion: 7,
  detections: { personalProtectiveEquipmentSettings: { enabled: true, schedule: { mode: "custom", days: {} } } },
};

describe("agent runtime status", () => {
  it("does not claim schedule-derived stopping was observed", () => {
    const result = runtimeStatus(channel, "personalProtectiveEquipmentSettings", null);
    expect(result.runtimeState).toBe("unknown");
    expect(result.observedAt).toBeNull();
    expect(result.appliedConfigurationVersion).toBeNull();
    expect(result.observationReachable).toBe(false);
  });

  it("keeps stale telemetry as historical, not current verification", () => {
    const result = runtimeStatus(channel, "personalProtectiveEquipmentSettings", {
      runtimeState: "running", observedAt: new Date(0), observationReachable: true,
      appliedConfigurationVersion: "7", observationSource: "detection-service",
    });
    expect(result.runtimeState).toBe("unknown");
    expect(result.lastReportedRuntimeState).toBe("running");
    expect(result.appliedConfigurationVersion).toBeNull();
    expect(result.lastReportedAppliedConfigurationVersion).toBe("7");
    expect(result.stale).toBe(true);
  });

  it("reports a fresh reachable observation", () => {
    const result = runtimeStatus(channel, "personalProtectiveEquipmentSettings", {
      runtimeState: "stopped", observedAt: new Date(), observationReachable: true,
      appliedConfigurationVersion: "7", observationSource: "detection-service",
    });
    expect(result.runtimeState).toBe("stopped");
    expect(result.appliedConfigurationVersion).toBe("7");
    expect(result.observationReachable).toBe(true);
  });
});
