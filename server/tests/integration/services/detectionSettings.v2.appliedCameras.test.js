/**
 * v2 DetectionSettingsService.getAllDetectionSettings — appliedCameras/activeCameras.
 *
 * These stats must reflect every camera on the account with the given
 * detection TYPE turned on, regardless of whether those cameras share one
 * DetectionSetting document or each own an independent document (both are
 * valid: attachDetectionSetting links one document to many channels, but a
 * channel can also get its own document when toggled independently).
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

const { default: DetectionSettingsService } = await import(
  "../../../core/v2/detectionSettings/detectionSettings.service.js"
);
const { default: Channel } = await import(
  "../../../core/v2/channels/channels.model.js"
);
const detectionModels = await import(
  "../../../core/v2/detectionSettings/detectionSettings.model.js"
);
const { PersonalProtectiveEquipmentSetting } = detectionModels;
const { default: Admin } = await import("../../../core/v2/admin/admin.model.js");
const { default: DetectionAllocation } = await import(
  "../../../core/v2/clientConfig/clientDetectionAllocation.model.js"
);
await import("../../../core/v1/NVR/nvr.model.js").catch(() => {});
await import("../../../core/v1/verifyRecipients/recipients.model.js").catch(() => {});
await import("../../../core/v1/authorizedUsers/authorizedUsers.model.js").catch(() => {});

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
  // getAllDetectionSettings only lists detections the superadmin has licensed
  // for the client (detection-visibility restriction), so the tenant these
  // fixtures belong to needs PPE allocated before it shows up at all.
  const admin = await Admin.create({
    user_id: "u1",
    login: "u1",
    email: "u1@test.com",
    purchasedCameras: 10,
  });
  await DetectionAllocation.create({
    adminId: admin._id,
    settingType: "personalProtectiveEquipmentSettings",
    enabled: true,
    cameraAllocation: 10,
  });
});

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

function makePpeSetting(over = {}) {
  return PersonalProtectiveEquipmentSetting.create({
    name: "ppe",
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

describe("v2 DetectionSettingsService.getAllDetectionSettings appliedCameras", () => {
  it("counts all linked cameras when they share one document, even filtered to one camera", async () => {
    const setting = await makePpeSetting();

    const camA = await makeChannel({
      name: "Cam-A",
      detections: { personalProtectiveEquipmentSettings: { id: setting._id, enabled: true } },
    });
    await makeChannel({
      name: "Cam-B",
      detections: { personalProtectiveEquipmentSettings: { id: setting._id, enabled: true } },
    });

    const { req, res, next } = serviceCtx({
      user_id: "u1",
      query: {
        settingType: "personalProtectiveEquipmentSettings",
        channelIds: camA._id.toString(),
      },
    });
    await DetectionSettingsService.getAllDetectionSettings(req, res, next);

    expect(res.statusCode).toBe(200);
    const results = payload(res).data.detectionSettings;
    expect(results).toHaveLength(1);
    expect(results[0].linkedCameras).toHaveLength(1);
    expect(results[0].uiData.appliedCameras).toBe(2);
    expect(results[0].uiData.activeCameras).toBe(2);
  });

  it("counts cameras with independent documents of the same type as one applied total", async () => {
    // Two cameras, each with its OWN separate PPE settings document — this is
    // the real-world shape seen in prod: each camera got its own document
    // because they were configured independently, not attached together.
    const settingForCamA = await makePpeSetting({ name: "ppe-cam-a" });
    const settingForCamB = await makePpeSetting({ name: "ppe-cam-b" });

    const camA = await makeChannel({
      name: "Cam-A",
      detections: { personalProtectiveEquipmentSettings: { id: settingForCamA._id, enabled: true } },
    });
    await makeChannel({
      name: "Cam-B",
      detections: { personalProtectiveEquipmentSettings: { id: settingForCamB._id, enabled: true } },
    });

    // Viewing Cam-A's own document should still report 2 applied cameras
    // account-wide for this detection type, not 1 (its own document only).
    const { req, res, next } = serviceCtx({
      user_id: "u1",
      query: {
        settingType: "personalProtectiveEquipmentSettings",
        channelIds: camA._id.toString(),
      },
    });
    await DetectionSettingsService.getAllDetectionSettings(req, res, next);

    expect(res.statusCode).toBe(200);
    const results = payload(res).data.detectionSettings;
    expect(results).toHaveLength(1);
    // linkedCameras stays scoped to Cam-A's own document
    expect(results[0].linkedCameras).toHaveLength(1);
    // but appliedCameras/activeCameras count BOTH cameras for this type
    expect(results[0].uiData.appliedCameras).toBe(2);
    expect(results[0].uiData.activeCameras).toBe(2);
  });

  it("does not count a disabled-but-linked camera toward activeCameras", async () => {
    const setting = await makePpeSetting();
    const camA = await makeChannel({
      name: "Cam-A",
      detections: { personalProtectiveEquipmentSettings: { id: setting._id, enabled: true } },
    });
    await makeChannel({
      name: "Cam-B",
      detections: { personalProtectiveEquipmentSettings: { id: setting._id, enabled: false } },
    });

    const { req, res, next } = serviceCtx({
      user_id: "u1",
      query: {
        settingType: "personalProtectiveEquipmentSettings",
        channelIds: camA._id.toString(),
      },
    });
    await DetectionSettingsService.getAllDetectionSettings(req, res, next);

    const results = payload(res).data.detectionSettings;
    expect(results[0].uiData.appliedCameras).toBe(2);
    expect(results[0].uiData.activeCameras).toBe(1);
  });
});
