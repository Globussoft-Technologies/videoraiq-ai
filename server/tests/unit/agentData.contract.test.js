import { describe, expect, it, vi } from "vitest";
import { runtimeIsStale, RUNTIME_STALE_AFTER_SECONDS } from "../../core/v2/agentData/runtimeFreshness.js";
import service from "../../core/v2/agentData/agentData.service.js";
import { AgentIncidentReview } from "../../core/v2/agentData/agentData.model.js";

const adminId = "507f1f77bcf86cd799439011";
const cameraId = "507f191e810c19729de860ea";
const req = (body, member = false) => ({
  body, query: {},
  verified: {
    userData: { adminId, ...(member ? { memberId: "507f191e810c19729de860eb" } : {}) },
    permissionConfig: [{ permissionConfig: { channels: { view: true } } }],
    authorizedChannel: { channels: [cameraId] },
  },
});
const res = () => ({ status(code) { this.code = code; return this; }, json(payload) { this.payload = payload; return this; } });

describe("agent data contract", () => {
  it("keeps collection routes read-only for agent credentials", async () => {
    const request = req({ channelId: cameraId, runtimeState: "running", detectionType: "ppe" });
    request.verified.userData.credentialType = "agent";
    const response = res();
    await service.create(request, response, "runtime");
    expect(response.code).toBe(403);
    expect(response.payload.body.errorCode).toBe("AGENT_DATA_WRITE_FORBIDDEN");
  });
  it("marks observations older than 120 seconds stale at read time", () => {
    const now = Date.parse("2026-10-16T12:00:00.000Z");
    expect(RUNTIME_STALE_AFTER_SECONDS).toBe(120);
    expect(runtimeIsStale("2026-10-16T11:58:00.000Z", now)).toBe(false);
    expect(runtimeIsStale("2026-10-16T11:57:59.999Z", now)).toBe(true);
    expect(runtimeIsStale(null, now)).toBe(true);
  });

  it("rejects unsupported groupings rather than silently dropping them", async () => {
    const response = res();
    await service.analytics(req({ metric: "coverage", groupBy: ["detectionType"] }), response);
    expect(response.code).toBe(400);
    expect(response.payload.body.errorCode).toBe("UNSUPPORTED_GROUP_BY");
  });

  it("requires timezone-qualified range timestamps", async () => {
    const response = res();
    await service.analytics(req({ metric: "coverage", from: "2026-10-16" }), response);
    expect(response.code).toBe(400);
    expect(response.payload.body.errorCode).toBe("INVALID_DATE_RANGE");
  });

  it("rejects filters not supported by the selected metric", async () => {
    const response = res();
    await service.analytics(req({ metric: "coverage", detectionType: "ppe" }), response);
    expect(response.code).toBe(400);
    expect(response.payload.body.errorCode).toBe("UNSUPPORTED_FILTER");
  });

  it("maps detectionType and limits member analytics to assigned cameras", async () => {
    const find = vi.spyOn(AgentIncidentReview, "find").mockReturnValue({ lean: async () => [] });
    try {
      const response = res();
      await service.analytics(req({ metric: "confirmed_rate", detectionType: "ppe", groupBy: ["detectionType"] }, true), response);
      expect(response.code).toBe(200);
      expect(find.mock.calls[0][0].detectorType).toBe("ppe");
      expect(find.mock.calls[0][0].channelId).toEqual({ $in: [cameraId] });
      expect(response.payload.body.data.appliedFilters.groupBy).toEqual(["detectorType"]);
    } finally { find.mockRestore(); }
  });
});
