import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("axios", () => ({ default: { post: vi.fn() } }));
vi.mock("../../../utils/database.js", () => ({ redis: {} }));
vi.mock("../../../utils/adminEndpoints.js", () => ({ resolveAdminEndpoints: vi.fn().mockResolvedValue({ detectionUrl: "http://ds.test" }) }));
const axios = (await import("axios")).default;
const python = (await import("../../../services/python.service.js")).default;
const zones = [[[120, 300], [780, 300], [780, 950], [120, 950]], [[0, 0], [100, 0], [100, 100], [0, 100]]];
const payload = { camera_id: "cam", nvr_id: "nvr", admin_id: "admin", stream_url: "http://stream.test/live.m3u8",
  detection_modes: ["uniformDetectionSettings"], zones, zone_configs: [{ name: "Main Gate", telegramChatIds: ["x"] }, { name: "Back Gate" }],
  videoResolution: [1000, 1000], severity: "moderate", confidence_thresholds: { person_threshold: 0.45, uniform_confidence: 0.60 } };
beforeEach(() => { vi.clearAllMocks(); axios.post.mockResolvedValue({ data: { status: "ok" } }); });
describe("Uniform Detection requests to DS", () => {
  it.each([["startNewDetection", "/stream"], ["updateNewDetection", "/detectors/update"]])("%s sends one detector with all named zones", async (method, endpoint) => {
    await python[method](payload);
    expect(axios.post.mock.calls[0][0]).toBe("http://ds.test" + endpoint);
    expect(axios.post.mock.calls[0][1].detectors).toEqual([{
      name: "uniformDetectionSettings", zones: [[[0.12, 0.3], [0.78, 0.3], [0.78, 0.95], [0.12, 0.95]], [[0, 0], [0.1, 0], [0.1, 0.1], [0, 0.1]]],
      zone_configs: [{ name: "Main Gate" }, { name: "Back Gate" }], severity: "moderate", person_threshold: 0.45, uniform_confidence: 0.60,
    }]);
  });
  it("stops only Uniform Detection", async () => {
    await python.stopNewDetection("cam", "nvr", ["uniformDetectionSettings"], "admin");
    expect(axios.post.mock.calls[0][0]).toBe("http://ds.test/stream/stop");
    expect(axios.post.mock.calls[0][1]).toEqual({ camera_id: "cam", nvr_id: "nvr", detectors: ["uniformDetectionSettings"] });
  });
});
