import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { payload, serviceCtx } from "../../helpers/service.js";

vi.mock("../../../services/python.service.js", () => ({
  default: {
    handleDetectionStartStop: vi.fn().mockResolvedValue({ ok: true }),
    handleDetectionUpdate: vi.fn().mockResolvedValue({}),
    getCameraActiveLogics: vi.fn().mockResolvedValue([]),
  },
}));

const { default: DetectionSettingsService } = await import(
  "../../../core/v2/detectionSettings/detectionSettings.service.js"
);
const { DetectionSetting, MobilePhoneDetectionSetting } = await import(
  "../../../core/v2/detectionSettings/detectionSettings.model.js"
);
const { default: Channel } = await import(
  "../../../core/v2/channels/channels.model.js"
);
const { default: NVR } = await import("../../../core/v2/NVR/nvr.model.js");
const { default: pythonService } = await import(
  "../../../services/python.service.js"
);

const USER_ID = "reset-stop-user";
const ADMIN_ID = new mongoose.Types.ObjectId().toString();

beforeAll(async () => {
  await connectMongo();
});

afterAll(async () => {
  await disconnectMongo();
});

beforeEach(async () => {
  await clearCollections();
  vi.clearAllMocks();
  pythonService.handleDetectionStartStop.mockResolvedValue({ ok: true });
});

const makeNvr = () =>
  NVR.create({
    userId: USER_ID,
    nvrName: "Reset Test NVR",
    brand: "hikvision",
    domain: "http://nvr.local",
    location: "HQ",
    localNvrId: `reset-nvr-${new mongoose.Types.ObjectId()}`,
  });

const makeSetting = () =>
  MobilePhoneDetectionSetting.create({
    userId: USER_ID,
    settingType: "mobilePhoneDetectionSettings",
    name: "Mobile Phone Zone",
    enabled: true,
    alerts: [],
    settings: {
      referencePoints: {},
      mobile_phone_confidence: 0.5,
      metricType: "gauge",
    },
  });

const makeChannel = (nvrId, settingId, enabled) =>
  Channel.create({
    nvrId,
    userId: USER_ID,
    streamingPath: "/Streaming/Channels/101",
    localChannelId: String(new mongoose.Types.ObjectId()),
    name: "Reset Test Camera",
    isAdded: true,
    detections: {
      mobilePhoneDetectionSettings: { id: settingId, enabled },
    },
  });

describe("DetectionSettingsService.deleteDetectionSettings runtime cleanup", () => {
  it("stops and resets only the requested camera", async () => {
    const [nvr, setting] = await Promise.all([makeNvr(), makeSetting()]);
    const enabledA = await makeChannel(nvr._id, setting._id, true);
    const enabledB = await makeChannel(nvr._id, setting._id, true);
    const disabled = await makeChannel(nvr._id, setting._id, false);
    const { req, res, next } = serviceCtx({
      adminId: ADMIN_ID,
      user_id: USER_ID,
      params: { id: setting._id.toString() },
      query: { channelId: enabledA._id.toString() },
    });

    await DetectionSettingsService.deleteDetectionSettings(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(pythonService.handleDetectionStartStop).toHaveBeenCalledTimes(1);
    const [stoppedChannel, adminId, enable, settingType] =
      pythonService.handleDetectionStartStop.mock.calls[0];
    expect(String(stoppedChannel._id)).toBe(String(enabledA._id));
    expect(adminId).toBe(ADMIN_ID);
    expect(enable).toBe(false);
    expect(settingType).toBe("mobilePhoneDetectionSettings");
    expect(await DetectionSetting.findById(setting._id)).not.toBeNull();
    expect(
      (await Channel.findById(enabledA._id)).detections?.mobilePhoneDetectionSettings,
    ).toBeFalsy();
    expect(
      (await Channel.findById(enabledB._id)).detections.mobilePhoneDetectionSettings.id.toString(),
    ).toBe(setting._id.toString());
    expect(
      (await Channel.findById(disabled._id)).detections.mobilePhoneDetectionSettings.id.toString(),
    ).toBe(setting._id.toString());
  });

  it("keeps the setting and camera link when a running detector cannot stop", async () => {
    const [nvr, setting] = await Promise.all([makeNvr(), makeSetting()]);
    const channel = await makeChannel(nvr._id, setting._id, true);
    pythonService.handleDetectionStartStop.mockRejectedValueOnce(
      new Error("DS unavailable"),
    );
    const { req, res, next } = serviceCtx({
      adminId: ADMIN_ID,
      user_id: USER_ID,
      params: { id: setting._id.toString() },
      query: { channelId: channel._id.toString() },
    });

    await DetectionSettingsService.deleteDetectionSettings(req, res, next);

    expect(res.statusCode).toBe(502);
    expect(payload(res).message).toMatch(/were not deleted/i);
    expect(await DetectionSetting.findById(setting._id)).not.toBeNull();
    const savedChannel = await Channel.findById(channel._id);
    expect(
      savedChannel.detections.mobilePhoneDetectionSettings.id.toString(),
    ).toBe(setting._id.toString());
    expect(savedChannel.detections.mobilePhoneDetectionSettings.enabled).toBe(true);
  });

  it("deletes the shared setting after its final camera is reset", async () => {
    const [nvr, setting] = await Promise.all([makeNvr(), makeSetting()]);
    const channel = await makeChannel(nvr._id, setting._id, true);
    const { req, res, next } = serviceCtx({
      adminId: ADMIN_ID,
      user_id: USER_ID,
      params: { id: setting._id.toString() },
      query: { channelId: channel._id.toString() },
    });

    await DetectionSettingsService.deleteDetectionSettings(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(pythonService.handleDetectionStartStop).toHaveBeenCalledTimes(1);
    expect(await DetectionSetting.findById(setting._id)).toBeNull();
    expect(
      (await Channel.findById(channel._id)).detections?.mobilePhoneDetectionSettings,
    ).toBeFalsy();
  });
});
