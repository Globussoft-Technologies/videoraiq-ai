import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { payload, serviceCtx } from "../../helpers/service.js";

vi.mock("../../../services/python.service.js", () => ({
  default: {
    handleDetectionStartStop: vi.fn(),
    handleDetectionUpdate: vi.fn(),
  },
}));
vi.mock("../../../services/delete.service.js", () => ({
  default: { deleteChannel: vi.fn().mockResolvedValue(true) },
}));

const { default: ChannelsService } = await import(
  "../../../core/v2/channels/channels.service.js"
);
const { default: DetectionSettingsService } = await import(
  "../../../core/v2/detectionSettings/detectionSettings.service.js"
);
const { default: Channel } = await import(
  "../../../core/v2/channels/channels.model.js"
);
const { CountPersonsDetectionSetting } = await import(
  "../../../core/v2/detectionSettings/detectionSettings.model.js"
);
const { default: pythonService } = await import(
  "../../../services/python.service.js"
);
const { default: Admin } = await import("../../../core/v2/admin/admin.model.js");
const { default: DetectionAllocation } = await import(
  "../../../core/v2/clientConfig/clientDetectionAllocation.model.js"
);

/**
 * Enabling a detection now goes through the licensing gate
 * (core/v2/clientConfig/detectionLicense.service.js): the client needs a camera
 * licence and an allocation for the detection type, otherwise the toggle is
 * refused with 403. Give the tenant enough headroom that these tests exercise
 * the threshold behaviour rather than the limits.
 */
async function licensedAdmin(userId, settingTypes) {
  const admin = await Admin.create({
    user_id: userId,
    login: `admin-${userId}`,
    email: `admin-${userId}@test.com`,
    purchasedCameras: 10,
  });
  await DetectionAllocation.insertMany(
    settingTypes.map((settingType) => ({
      adminId: admin._id,
      settingType,
      enabled: true,
      cameraAllocation: 10,
    }))
  );
  return admin;
}

beforeAll(async () => {
  await connectMongo();
});

afterAll(async () => {
  await disconnectMongo();
});

beforeEach(async () => {
  await clearCollections();
  vi.clearAllMocks();
});

describe("v2 ChannelsService.toggleDetection model thresholds", () => {
  it("stores DS defaults in modelThresholds without overwriting settings", async () => {
    pythonService.handleDetectionStartStop.mockResolvedValueOnce({
      success: true,
      model_thresholds: {
        countPersonsSettings: {
          person_threshold: 0.37,
        },
      },
    });

    const setting = await CountPersonsDetectionSetting.create({
      userId: "22",
      settingType: "countPersonsSettings",
      name: "People Count",
      enabled: true,
      modelThresholds: {},
      settings: {
        person_threshold: 0.81,
        metricType: "counter",
      },
    });
    const channel = await Channel.create({
      nvrId: new mongoose.Types.ObjectId(),
      userId: "22",
      streamingPath: "/Streaming/Channels/101",
      localChannelId: "1",
      name: "Lobby Camera",
      isAdded: true,
      detections: {
        countPersonsSettings: {
          id: setting._id,
          enabled: false,
        },
      },
    });
    const admin = await licensedAdmin("22", ["countPersonsSettings"]);
    const { req, res, next } = serviceCtx({
      user_id: "22",
      adminId: admin._id.toString(),
      body: {
        channelId: channel._id.toString(),
        detectionType: "countPersonsSettings",
        enable: true,
      },
    });

    await ChannelsService.toggleDetection(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(payload(res).message).toBe("Detection updated successfully");

    const reloadedSetting = await CountPersonsDetectionSetting.findById(setting._id);
    expect(reloadedSetting.modelThresholds).toEqual({
      person_threshold: 0.37,
    });
    expect(reloadedSetting.settings.person_threshold).toBe(0.81);
  });
});

describe("v2 DetectionSettingsService model thresholds", () => {
  it("refreshes modelThresholds when an enabled setting is updated", async () => {
    pythonService.handleDetectionUpdate.mockResolvedValueOnce({
      success: true,
      model_thresholds: {
        countPersonsSettings: {
          person_threshold: 0.44,
        },
      },
    });

    const setting = await CountPersonsDetectionSetting.create({
      userId: "22",
      settingType: "countPersonsSettings",
      name: "People Count",
      enabled: true,
      modelThresholds: {
        person_threshold: 0.37,
      },
      settings: {
        person_threshold: 0.81,
        metricType: "gauge",
      },
    });
    await Channel.create({
      nvrId: new mongoose.Types.ObjectId(),
      userId: "22",
      streamingPath: "/Streaming/Channels/102",
      localChannelId: "2",
      name: "Entrance Camera",
      isAdded: true,
      detections: {
        countPersonsSettings: {
          id: setting._id,
          enabled: true,
        },
      },
    });
    const admin = await licensedAdmin("22", ["countPersonsSettings"]);
    const { req, res, next } = serviceCtx({
      user_id: "22",
      adminId: admin._id.toString(),
      params: { id: setting._id.toString() },
      body: {
        settings: {
          metricType: "counter",
        },
      },
    });

    await DetectionSettingsService.updateDetectionSettings(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(pythonService.handleDetectionUpdate).toHaveBeenCalledTimes(1);

    const reloadedSetting = await CountPersonsDetectionSetting.findById(setting._id);
    expect(reloadedSetting.modelThresholds).toEqual({
      person_threshold: 0.44,
    });
    expect(reloadedSetting.settings.person_threshold).toBe(0.81);
    expect(reloadedSetting.settings.metricType).toBe("counter");
  });
});
