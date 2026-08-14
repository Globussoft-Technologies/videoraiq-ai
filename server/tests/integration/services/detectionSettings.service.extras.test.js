/**
 * DetectionSettingsService — extras targeting the get / list / attach / detach
 * paths that the base detectionSettings.service.test.js doesn't reach.
 *
 * No mocks. We seed Channel + DetectionSetting documents directly and let the
 * service do the joins against in-memory mongo.
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

const { default: DetectionSettingsService } = await import(
  "../../../core/v1/detectionSettings/detectionSettings.service.js"
);
const { default: Channel } = await import(
  "../../../core/v1/channels/channels.model.js"
);
const detectionModels = await import(
  "../../../core/v1/detectionSettings/detectionSettings.model.js"
);
const {
  MotionDetectionSetting,
  DetectionSetting,
  PersonalProtectiveEquipmentSetting,
  VehiclDetectionSetting,
} = detectionModels;
const { default: pythonService } = await import("../../../services/python.service.js");
await import("../../../core/v1/NVR/nvr.model.js");
await import("../../../core/v1/verifyRecipients/recipients.model.js");
await import("../../../core/v1/authorizedUsers/authorizedUsers.model.js");

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
});

async function makeMotionSetting(over = {}) {
  return MotionDetectionSetting.create({
    name: "motion-1",
    settingType: "motionDetectionSettings",
    userId: "u1",
    enabled: true,
    settings: { metricType: "gauge" },
    alerts: [],
    ...over,
  });
}

async function makePpeSetting(over = {}) {
  return PersonalProtectiveEquipmentSetting.create({
    name: "ppe-1",
    settingType: "personalProtectiveEquipmentSettings",
    userId: "u1",
    enabled: true,
    settings: {
      person_threshold: 0.65,
      vest_threshold: 0.25,
      helmet_threshold: 0.15,
    },
    alerts: [],
    ...over,
  });
}

function makeChannel(over = {}) {
  return Channel.create({
    nvrId: new mongoose.Types.ObjectId(),
    userId: "u1",
    streamingPath: "/Streaming/Channels/101",
    localChannelId: "1",
    name: "Cam-A",
    isAdded: true,
    ...over,
  });
}

async function makeVehicleSetting(over = {}) {
  return VehiclDetectionSetting.create({
    name: "number-plate-1",
    settingType: "vehicleDetectionSettings",
    userId: "u1",
    enabled: true,
    settings: { plate_confidence: 0.8, ocr_min_confidence: 0.7 },
    alerts: [],
    ...over,
  });
}

// --------------------------------------------------------------------------
// getDetectionSettings (single by id)
// --------------------------------------------------------------------------

describe("DetectionSettingsService.getDetectionSettings", () => {
  it("returns 404 for a missing id", async () => {
    const { req, res, next } = serviceCtx({
      user_id: "u1",
      params: { id: new mongoose.Types.ObjectId().toString() },
    });
    await DetectionSettingsService.getDetectionSettings(req, res, next);
    expect(res.statusCode).toBe(404);
  });

  it("returns the detection setting with linked cameras when found", async () => {
    const setting = await makeMotionSetting();
    const channel = await makeChannel({
      detections: {
        motionDetectionSettings: { id: setting._id, enabled: true },
      },
    });

    const { req, res, next } = serviceCtx({
      user_id: "u1",
      params: { id: setting._id.toString() },
    });
    await DetectionSettingsService.getDetectionSettings(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.detectionSetting._id.toString()).toBe(
      setting._id.toString(),
    );
    expect(payload(res).data.linkedCameras).toHaveLength(1);
    expect(payload(res).data.linkedCameras[0]._id.toString()).toBe(
      channel._id.toString(),
    );
  });

  it("scopes results to the user_id (foreign user's setting → 404)", async () => {
    const setting = await makeMotionSetting({ userId: "other-user" });
    const { req, res, next } = serviceCtx({
      user_id: "u1",
      params: { id: setting._id.toString() },
    });
    await DetectionSettingsService.getDetectionSettings(req, res, next);
    expect(res.statusCode).toBe(404);
  });
});

// --------------------------------------------------------------------------
// getAllDetectionSettings (list, filters)
// --------------------------------------------------------------------------

describe("DetectionSettingsService.getAllDetectionSettings", () => {
  it("returns all settings for the user with linkedCameras shape", async () => {
    await makeMotionSetting({ name: "alpha" });
    await makeMotionSetting({ name: "beta" });
    const { req, res, next } = serviceCtx({ user_id: "u1", query: {} });
    await DetectionSettingsService.getAllDetectionSettings(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.count).toBe(2);
    expect(payload(res).data.detectionSettings).toHaveLength(2);
    expect(payload(res).data.detectionSettings[0]).toHaveProperty(
      "detectionSetting",
    );
    expect(payload(res).data.detectionSettings[0]).toHaveProperty(
      "linkedCameras",
    );
  });

  it("filters by name (case-insensitive regex)", async () => {
    await makeMotionSetting({ name: "Lobby-Motion" });
    await makeMotionSetting({ name: "Gate-Motion" });
    const { req, res, next } = serviceCtx({
      user_id: "u1",
      query: { name: "lobby" },
    });
    await DetectionSettingsService.getAllDetectionSettings(req, res, next);
    expect(payload(res).data.count).toBe(1);
    expect(payload(res).data.detectionSettings[0].detectionSetting.name).toBe(
      "Lobby-Motion",
    );
  });

  it("filters by ids list", async () => {
    const s1 = await makeMotionSetting({ name: "s1" });
    await makeMotionSetting({ name: "s2" });
    const { req, res, next } = serviceCtx({
      user_id: "u1",
      query: { ids: s1._id.toString() },
    });
    await DetectionSettingsService.getAllDetectionSettings(req, res, next);
    expect(payload(res).data.count).toBe(1);
  });

  it("filters by settingType", async () => {
    await makeMotionSetting({
      name: "motion-only",
      settingType: "motionDetectionSettings",
    });
    const { req, res, next } = serviceCtx({
      user_id: "u1",
      query: { settingType: "motionDetectionSettings" },
    });
    await DetectionSettingsService.getAllDetectionSettings(req, res, next);
    expect(payload(res).data.count).toBe(1);
  });

  it("filters out settings with no linked channels when channelIds is given", async () => {
    const setting1 = await makeMotionSetting({ name: "with-channel" });
    await makeMotionSetting({ name: "without-channel" });
    const ch = await makeChannel({
      detections: {
        motionDetectionSettings: { id: setting1._id, enabled: true },
      },
    });
    const { req, res, next } = serviceCtx({
      user_id: "u1",
      query: { channelIds: ch._id.toString() },
    });
    await DetectionSettingsService.getAllDetectionSettings(req, res, next);
    // total count still reflects the filter result before the cameras filter;
    // resultsWithCamera should only include the one with a real link.
    expect(payload(res).data.detectionSettings).toHaveLength(1);
    expect(
      payload(res).data.detectionSettings[0].detectionSetting.name,
    ).toBe("with-channel");
  });

  it("supports skip/limit pagination", async () => {
    for (let i = 0; i < 4; i++) {
      await makeMotionSetting({ name: `s${i}` });
    }
    const { req, res, next } = serviceCtx({
      user_id: "u1",
      query: { skip: "1", limit: "2" },
    });
    await DetectionSettingsService.getAllDetectionSettings(req, res, next);
    expect(payload(res).data.count).toBe(4);
    expect(payload(res).data.detectionSettings).toHaveLength(2);
  });
});

// --------------------------------------------------------------------------
// attachDetectionSetting
// --------------------------------------------------------------------------

describe("DetectionSettingsService.attachDetectionSetting", () => {
  it("returns 400 when channelId or detectionSettingId is missing", async () => {
    const { req, res, next } = serviceCtx({
      user_id: "u1",
      body: { channelId: null, detectionSettingId: null },
    });
    await DetectionSettingsService.attachDetectionSetting(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 when detection setting is not found", async () => {
    const ch = await makeChannel();
    const { req, res, next } = serviceCtx({
      user_id: "u1",
      body: {
        channelId: ch._id.toString(),
        detectionSettingId: new mongoose.Types.ObjectId().toString(),
      },
    });
    await DetectionSettingsService.attachDetectionSetting(req, res, next);
    expect(res.statusCode).toBe(404);
  });

  it("returns 404 when channel is not found", async () => {
    const setting = await makeMotionSetting();
    const { req, res, next } = serviceCtx({
      user_id: "u1",
      body: {
        channelId: new mongoose.Types.ObjectId().toString(),
        detectionSettingId: setting._id.toString(),
      },
    });
    await DetectionSettingsService.attachDetectionSetting(req, res, next);
    expect(res.statusCode).toBe(404);
  });

  it("returns 400 when the detection type is already attached to the channel", async () => {
    const setting = await makeMotionSetting();
    const ch = await makeChannel({
      detections: {
        motionDetectionSettings: { id: setting._id, enabled: true },
      },
    });
    const { req, res, next } = serviceCtx({
      user_id: "u1",
      body: {
        channelId: ch._id.toString(),
        detectionSettingId: setting._id.toString(),
      },
    });
    await DetectionSettingsService.attachDetectionSetting(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("attaches the setting to the channel (200)", async () => {
    const setting = await makeMotionSetting();
    const ch = await makeChannel();
    const { req, res, next } = serviceCtx({
      user_id: "u1",
      body: {
        channelId: ch._id.toString(),
        detectionSettingId: setting._id.toString(),
      },
    });
    await DetectionSettingsService.attachDetectionSetting(req, res, next);
    expect(res.statusCode).toBe(200);
    const reloaded = await Channel.findById(ch._id).setOptions({ includeInactive: true });
    expect(
      reloaded.detections?.motionDetectionSettings?.id?.toString() ||
        reloaded.detections?.motionDetectionSettings?.toString(),
    ).toBeTruthy();
  });
});

// --------------------------------------------------------------------------
// resetDetectionThresholds
// --------------------------------------------------------------------------

describe("DetectionSettingsService.resetDetectionThresholds", () => {
  it("uses saved settings thresholds when modelThresholds is empty", async () => {
    const setting = await makePpeSetting({
      modelThresholds: {},
      settings: {
        person_threshold: 0.65,
        vest_threshold: 0.25,
        helmet_threshold: 0.15,
      },
    });

    const { req, res, next } = serviceCtx({
      user_id: "u1",
      params: { id: setting._id.toString() },
    });

    await DetectionSettingsService.resetDetectionThresholds(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(payload(res).data.resetThresholds).toEqual({
      person_threshold: 0.65,
      vest_threshold: 0.25,
      helmet_threshold: 0.15,
    });
  });

  it("prefers saved model thresholds over current settings", async () => {
    const setting = await makePpeSetting({
      modelThresholds: {
        person_threshold: 0.8,
        vest_threshold: 0.7,
        helmet_threshold: 0.6,
      },
      settings: {
        person_threshold: 0.4,
        vest_threshold: 0.3,
        helmet_threshold: 0.2,
      },
    });

    const { req, res, next } = serviceCtx({
      user_id: "u1",
      params: { id: setting._id.toString() },
    });

    await DetectionSettingsService.resetDetectionThresholds(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(payload(res).data.resetThresholds).toEqual({
      person_threshold: 0.8,
      vest_threshold: 0.7,
      helmet_threshold: 0.6,
    });
  });
});

describe("DetectionSettingsService.resetCameraDetectionThresholds", () => {
  it("uses one DS request for multiple enabled settings and saves each returned default", async () => {
    const ppe = await makePpeSetting({
      modelThresholds: { person_threshold: 0.8, vest_threshold: 0.7, helmet_threshold: 0.6 },
    });
    const numberPlate = await makeVehicleSetting({
      modelThresholds: { plate_confidence: 0.8, ocr_min_confidence: 0.7 },
    });
    const channel = await makeChannel({
      detections: {
        personalProtectiveEquipmentSettings: { id: ppe._id, enabled: true },
        vehicleDetectionSettings: { id: numberPlate._id, enabled: true },
      },
    });
    const resetSpy = vi.spyOn(pythonService, "resetDetectionConfidence").mockResolvedValue({
      model_thresholds: {
        personalProtectiveEquipmentSettings: { person_threshold: 0.4, vest_threshold: 0.25, helmet_threshold: 0.25 },
        numberPlateDetectionSettings: { plate_confidence: 0.25, ocr_min_confidence: 0.5 },
      },
    });
    const { req, res, next } = serviceCtx({
      user_id: "u1",
      adminId: new mongoose.Types.ObjectId(),
      body: { channelId: channel._id.toString(), detectionSettingIds: [ppe._id.toString(), numberPlate._id.toString()] },
    });

    await DetectionSettingsService.resetCameraDetectionThresholds(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(resetSpy).toHaveBeenCalledTimes(1);
    expect(resetSpy).toHaveBeenCalledWith(expect.objectContaining({
      camera_id: channel._id.toString(),
      detectors: ["personalProtectiveEquipmentSettings", "numberPlateDetectionSettings"],
    }));
    expect(payload(res).data.resetSettings).toHaveLength(2);
    expect((await DetectionSetting.findById(ppe._id)).modelThresholds).toMatchObject({ person_threshold: 0.4, vest_threshold: 0.25, helmet_threshold: 0.25 });
    expect((await DetectionSetting.findById(numberPlate._id)).modelThresholds).toMatchObject({ plate_confidence: 0.25, ocr_min_confidence: 0.5 });
    resetSpy.mockRestore();
  });

  it("rejects a setting that is not enabled on the selected camera", async () => {
    const ppe = await makePpeSetting();
    const channel = await makeChannel({
      detections: { personalProtectiveEquipmentSettings: { id: ppe._id, enabled: false } },
    });
    const { req, res, next } = serviceCtx({
      user_id: "u1",
      body: { channelId: channel._id.toString(), detectionSettingIds: [ppe._id.toString()] },
    });

    await DetectionSettingsService.resetCameraDetectionThresholds(req, res, next);

    expect(res.statusCode).toBe(400);
  });
});

// --------------------------------------------------------------------------
// detachDetectionSetting
// --------------------------------------------------------------------------

describe("DetectionSettingsService.detachDetectionSetting", () => {
  it("returns 400 when channelId or detectionSettingId is missing", async () => {
    const { req, res, next } = serviceCtx({
      user_id: "u1",
      body: {},
    });
    await DetectionSettingsService.detachDetectionSetting(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 when detection setting is not found", async () => {
    const ch = await makeChannel();
    const { req, res, next } = serviceCtx({
      user_id: "u1",
      body: {
        channelId: ch._id.toString(),
        detectionSettingId: new mongoose.Types.ObjectId().toString(),
      },
    });
    await DetectionSettingsService.detachDetectionSetting(req, res, next);
    expect(res.statusCode).toBe(404);
  });

  it("returns 404 when channel does not exist", async () => {
    const setting = await makeMotionSetting();
    const { req, res, next } = serviceCtx({
      user_id: "u1",
      body: {
        channelId: new mongoose.Types.ObjectId().toString(),
        detectionSettingId: setting._id.toString(),
      },
    });
    await DetectionSettingsService.detachDetectionSetting(req, res, next);
    expect(res.statusCode).toBe(404);
  });

  it("returns 404 when channel does not have this setting linked", async () => {
    const setting = await makeMotionSetting();
    const ch = await makeChannel(); // no detections at all
    const { req, res, next } = serviceCtx({
      user_id: "u1",
      body: {
        channelId: ch._id.toString(),
        detectionSettingId: setting._id.toString(),
      },
    });
    await DetectionSettingsService.detachDetectionSetting(req, res, next);
    expect(res.statusCode).toBe(404);
  });

  it("detaches the setting (200)", async () => {
    const setting = await makeMotionSetting();
    const ch = await makeChannel({
      detections: {
        motionDetectionSettings: { id: setting._id, enabled: true },
      },
    });
    const { req, res, next } = serviceCtx({
      user_id: "u1",
      body: {
        channelId: ch._id.toString(),
        detectionSettingId: setting._id.toString(),
      },
    });
    await DetectionSettingsService.detachDetectionSetting(req, res, next);
    expect(res.statusCode).toBe(200);
    const reloaded = await Channel.findById(ch._id).setOptions({ includeInactive: true });
    expect(reloaded.detections?.motionDetectionSettings).toBeFalsy();
  });
});
