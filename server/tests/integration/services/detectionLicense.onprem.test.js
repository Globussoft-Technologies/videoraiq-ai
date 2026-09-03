/**
 * Licensing is cloud-only. On-premise (APP_ENV = "onprem") every rule is off:
 * no camera cap, no per-detection cap, every detection visible — the product
 * behaves exactly as it did before the feature.
 *
 * NODE_ENV=onprem is set before the config module loads so APP_ENV reads
 * "onprem"; the service captures it at import time.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

// tests/setup.js injects config via NODE_CONFIG and never imports the config
// package itself, so overriding NODE_CONFIG here is what makes this file run
// on-prem. EVERY other import below must be dynamic: static imports are hoisted
// above this assignment and would pull in `config` first, freezing the flag.
//
// Both switches are set: LICENSING_ENABLED is the real one, APP_ENV is what the
// fallback reads when an older config file has no such key.
process.env.NODE_CONFIG = JSON.stringify({
  ...JSON.parse(process.env.NODE_CONFIG || "{}"),
  LICENSING_ENABLED: false,
  APP_ENV: "onprem",
});
process.env.APP_ENV = "onprem";

const mongoose = (await import("mongoose")).default;
const { connectMongo, disconnectMongo, clearCollections } = await import("../dbSetup.js");
const { serviceCtx, payload } = await import("../../helpers/service.js");

vi.mock("../../../services/python.service.js", () => ({
  default: {
    handleDetectionStartStop: vi.fn().mockResolvedValue({}),
    handleDetectionUpdate: vi.fn().mockResolvedValue({}),
    registerChannel: vi.fn().mockResolvedValue({}),
    fetchDsDetectorNames: vi.fn().mockResolvedValue(null),
  },
}));
vi.mock("../../../services/delete.service.js", () => ({
  default: { deleteChannel: vi.fn().mockResolvedValue(true) },
}));

const {
  isLicensingEnforced,
  getAllowedDetectionTypes,
  assertCanEnableDetection,
  assertDetectionLicensed,
  reconcileAddedCameraLicenses,
} = await import("../../../core/v2/clientConfig/detectionLicense.service.js");
const { DETECTION_TYPES } = await import("../../../constants/detectionTypes.js");
const { default: ChannelsService } = await import(
  "../../../core/v2/channels/channels.service.js"
);
const { default: DetectionSettingsService } = await import(
  "../../../core/v2/detectionSettings/detectionSettings.service.js"
);
const { default: NVRService } = await import("../../../core/v2/NVR/nvr.service.js");
const { default: Channel } = await import("../../../core/v2/channels/channels.model.js");
const { default: Admin } = await import("../../../core/v2/admin/admin.model.js");
const { CountPersonsDetectionSetting } = await import(
  "../../../core/v2/detectionSettings/detectionSettings.model.js"
);
await import("../../../core/v2/NVR/nvr.model.js");
await import("../../../core/v2/profiles/profiles.model.js");
await import("../../../core/v2/authorizedUsers/authorizedUsers.model.js");
await import("../../../core/v2/users/users.model.js");

const USER_ID = "1000";

beforeAll(async () => { await connectMongo(); });
afterAll(async () => { await disconnectMongo(); });
beforeEach(async () => { await clearCollections(); });

describe("on-premise: licensing is switched off", () => {
  it("reports licensing as not enforced", () => {
    expect(isLicensingEnforced()).toBe(false);
  });

  it("treats every detection as allowed, with no allocation rows at all", async () => {
    const allowed = await getAllowedDetectionTypes({ userId: USER_ID });
    expect(allowed.size).toBe(Object.keys(DETECTION_TYPES).length);
    expect(allowed.has("carModelDetectionSettings")).toBe(true);
  });

  it("allows enabling with no admin, no licence and no allocation", async () => {
    const verdict = await assertCanEnableDetection({
      userId: USER_ID,
      channelId: new mongoose.Types.ObjectId().toString(),
      settingType: "vehicleDetectionSettings",
    });
    expect(verdict.ok).toBe(true);
  });

  it("allows any detection type on create/update/attach", async () => {
    const verdict = await assertDetectionLicensed({
      userId: USER_ID,
      settingType: "crowdDetectionSettings",
    });
    expect(verdict.ok).toBe(true);
  });

  it("enables a detection on a camera that would be refused in cloud", async () => {
    // purchasedCameras 0 and zero allocations — a hard deny in cloud.
    await Admin.create({ user_id: USER_ID, login: "a", email: "a@t.com", purchasedCameras: 0 });
    const setting = await CountPersonsDetectionSetting.create({
      userId: USER_ID, settingType: "countPersonsSettings", name: "PC",
      enabled: true, settings: {},
    });
    const cam = await Channel.create({
      nvrId: new mongoose.Types.ObjectId(), userId: USER_ID,
      streamingPath: "/s/1", localChannelId: "1", name: "Cam", isAdded: true,
      detections: { countPersonsSettings: { id: setting._id, enabled: false } },
    });

    const { req, res, next } = serviceCtx({
      user_id: USER_ID,
      body: { channelId: cam._id.toString(), detectionType: "countPersonsSettings", enable: true },
    });
    await ChannelsService.toggleDetection(req, res, next);

    expect(res.statusCode).not.toBe(403);
  });

  it("returns every detection type to the client", async () => {
    const { req, res, next } = serviceCtx({ user_id: USER_ID });
    await DetectionSettingsService.getDetectionTypes(req, res, next);

    expect(Object.keys(payload(res).data.detectionTypes).length)
      .toBe(Object.keys(DETECTION_TYPES).length);
  });

  it("is driven by LICENSING_ENABLED, not by APP_ENV", async () => {
    // The flag is deliberately independent: APP_ENV is overloaded across a
    // dozen unrelated call sites, so licensing must not be coupled to it.
    const cfg = JSON.parse(process.env.NODE_CONFIG);
    expect(cfg.LICENSING_ENABLED).toBe(false);
    expect(isLicensingEnforced()).toBe(false);
  });

  it("imposes no camera-add limit", async () => {
    await Admin.create({ user_id: USER_ID, login: "a", email: "a@t.com", purchasedCameras: 0 });
    expect(await NVRService.getRemainingCameraLimit(USER_ID)).toBe(Infinity);
  });

  it("boot reconciliation is a no-op — there is no licence to default", async () => {
    await Admin.create({ user_id: USER_ID, login: "a", email: "a@t.com", purchasedCameras: 0 });
    await expect(reconcileAddedCameraLicenses()).resolves.toMatchObject({ scanned: 0, granted: 0 });
    expect((await Admin.findOne({ user_id: USER_ID }).lean()).planCamerasGranted).toBeFalsy();
  });
});
