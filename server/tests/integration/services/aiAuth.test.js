import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("axios", () => ({ default: { post: vi.fn(), get: vi.fn() } }));
vi.mock("../../../utils/logger.js", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../../utils/adminEndpoints.js", () => ({
  resolveAdminEndpoints: vi.fn(async () => ({
    detectionUrl: "http://object.test",
    attendanceUrl: "http://face.test/face-auth",
  })),
}));
vi.mock("../../../utils/rtspStream.js", () => ({
  default: vi.fn(), buildRTSPUrl: vi.fn(), buildStreamingUrl: vi.fn(), resolveHost: vi.fn(),
}));

// Set placeholders before imports so dotenv cannot load real credentials.
vi.stubEnv("API_AUTH_BEARER", "test-ai-token");
vi.stubEnv("ADMIN_API_SECRET", "test-admin-secret");
const axios = (await import("axios")).default;
const { aiAuthHeaders } = await import("../../../utils/aiAuthHeaders.js");
const python = (await import("../../../services/python.service.js")).default;
const authV1 = (await import("../../../core/v1/Auth/auth.service.js")).default;
const { resolveAdminEndpoints } = await import("../../../utils/adminEndpoints.js");

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("API_AUTH_BEARER", "test-ai-token");
  vi.stubEnv("ADMIN_API_SECRET", "test-admin-secret");
  axios.post.mockResolvedValue({ data: { status: "ok" } });
  axios.get.mockResolvedValue({ data: { active_logics: [] } });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("AI credentials", () => {
  it("supports unconfigured off/observe installations without sending empty credentials", () => {
    vi.stubEnv("API_AUTH_BEARER", undefined);
    vi.stubEnv("ADMIN_API_SECRET", undefined);
    expect(aiAuthHeaders({ admin: true })).toEqual({});
  });

  it("reads current credentials and restricts the admin secret to provisioning", () => {
    expect(aiAuthHeaders()).toEqual({ Authorization: "Bearer test-ai-token" });
    vi.stubEnv("API_AUTH_BEARER", " rotated-token ");
    expect(aiAuthHeaders({ admin: true })).toEqual({
      Authorization: "Bearer rotated-token", "X-Admin-Secret": "test-admin-secret",
    });
  });

  it.each([
    ["startDetection", [{ camera_id: "camera" }, "admin"]],
    ["stopDetection", ["camera", "admin"]],
    ["startNewDetection", [{ camera_id: "camera", admin_id: "admin", detection_modes: ["helmet"] }]],
    ["updateNewDetection", [{ camera_id: "camera", admin_id: "admin", detection_modes: ["helmet"] }]],
    ["resetDetectionConfidence", [{ camera_id: "camera", admin_id: "admin", detectors: [] }]],
    ["stopNewDetection", ["camera", "nvr", [], "admin"]],
  ])("authenticates %s without the admin secret", async (method, args) => {
    await python[method](...args);
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(axios.post.mock.calls[0][2].headers).toEqual({
      "Content-Type": "application/json", Authorization: "Bearer test-ai-token",
    });
  });

  it("propagates a 401 without retrying the request", async () => {
    const error = Object.assign(new Error("Unauthorized"), { response: { status: 401 } });
    axios.post.mockRejectedValueOnce(error);
    await expect(python.startDetection({ camera_id: "camera" }, "admin")).rejects.toBe(error);
    expect(axios.post).toHaveBeenCalledTimes(1);
  });
});

function checkProvisioning(label, auth) {
  describe(label, () => {
    it("registers on each configured host with both credentials", async () => {
      resolveAdminEndpoints.mockResolvedValueOnce({
        detectionUrl: "http://custom-object.test/",
        attendanceUrl: "http://custom-face.test/face-auth/",
      });
      await auth.registerAdminLicense({ _id: "admin" }, { subscriptions: { plan: "2099-01-01" } });
      expect(fetch.mock.calls.map(([url]) => url)).toEqual([
        "http://custom-object.test/admins/register",
        "http://custom-face.test/face-auth/api/v1/admins/register",
      ]);
      for (const [, options] of fetch.mock.calls) {
        expect(options.headers).toMatchObject({
          Authorization: "Bearer test-ai-token", "X-Admin-Secret": "test-admin-secret",
        });
        expect(JSON.parse(options.body).admin_id).toBe("admin");
      }
    });

    it("does not send AI credentials to aMember", async () => {
      await auth.getAmemberAccessByUserId("user");
      expect(fetch.mock.calls[0][1].headers).toEqual({ Accept: "application/json" });
    });

    it("preserves the existing revoke secret alongside bearer auth", async () => {
      await auth.revokeAttendanceService("revoke-secret");
      expect(axios.post.mock.calls[0][2].headers).toEqual({
        "Content-Type": "application/json",
        Authorization: "Bearer test-ai-token",
        "X-Revoke-Secret": "revoke-secret",
      });
    });
  });
}
checkProvisioning("v1 provisioning", authV1);

const authV2 = (await import("../../../core/v2/Auth/auth.service.js")).default;
checkProvisioning("v2 provisioning", authV2);

describe("Additional AI callers", () => {
  it.each([false, true])("authenticates both bulk stop/resume requests (enable=%s)", async (enable) => {
    await python.toggleCamerasBulk("admin", ["camera"], enable);
    expect(axios.post).toHaveBeenCalledTimes(2);
    for (const [, , options] of axios.post.mock.calls) {
      expect(options.headers.Authorization).toBe("Bearer test-ai-token");
      expect(options.headers).not.toHaveProperty("X-Admin-Secret");
    }
  });

  it.each(["detections", "camera-types"])("authenticates %s reset", async (target) => {
    await python.stopAdminPipelines("admin", target);
    expect(axios.post.mock.calls[0][2].headers.Authorization).toBe("Bearer test-ai-token");
  });

  it("authenticates status reads and the catalog fallback", async () => {
    await python.getCameraActiveLogics("camera", "admin");
    await python.fetchDsDetectorNames("admin");
    expect(axios.get).toHaveBeenCalledTimes(3);
    for (const [, options] of axios.get.mock.calls) {
      expect(options.headers).toEqual({ Authorization: "Bearer test-ai-token" });
    }
  });

  it("authenticates plan-expiry stop calls to both services", async () => {
    const { stopAllStreams } = await import("../../../utils/stopStreams.js");
    stopAllStreams("admin");
    await vi.waitFor(() => expect(axios.post).toHaveBeenCalledTimes(2));
    for (const [, , options] of axios.post.mock.calls) {
      expect(options.headers.Authorization).toBe("Bearer test-ai-token");
      expect(options.headers).not.toHaveProperty("X-Admin-Secret");
    }
  });

  it("keeps the standalone video-processing service's credentials separate", async () => {
    await python.processVideoJob({ video_id: "video" });
    expect(axios.post.mock.calls[0][2].headers).not.toHaveProperty("Authorization");
    expect(axios.post.mock.calls[0][2].headers).not.toHaveProperty("X-Admin-Secret");
  });

  it.each(["v1", "v2"])("does not retry 401s when %s applies a detection schedule", async (version) => {
    const { default: settings } = await import(`../../../core/${version}/detectionSettings/detectionSettings.service.js`);
    const { default: Admin } = await import(`../../../core/${version}/admin/admin.model.js`);
    vi.spyOn(Admin, "exists").mockResolvedValue(null);
    const toggle = vi.spyOn(python, "handleDetectionStartStop").mockRejectedValue(
      Object.assign(new Error("Unauthorized"), { response: { status: 401 } }),
    );
    const channel = {
      _id: "camera",
      detections: { personalProtectiveEquipmentSettings: { id: "setting", enabled: false } },
      save: vi.fn(),
    };
    await settings.applyDetectionScheduleState(
      { verified: { userData: { adminId: "0123456789abcdef01234567" } } },
      channel,
      { _id: "setting", settingType: "personalProtectiveEquipmentSettings", settings: {} },
      true,
    );
    const { default: logger } = await import("../../../utils/logger.js");
    expect(toggle, logger.error.mock.calls.flat().map((arg) => arg?.stack || String(arg)).join("\n")).toHaveBeenCalledTimes(1);
    expect(channel.save).not.toHaveBeenCalled();
  });
});
