/**
 * DetectionSettingsService — happy paths for create/update/delete that the
 * existing tests only cover for failure short-circuits.
 *
 * Covers:
 *   - createDetectionSettings: discriminator save + channel linking,
 *     skippedChannels branch for unknown channelId.
 *   - updateDetectionSettings: settings merge + channel unlink/link diff,
 *     including the channel-not-found skip path. The python notify loop is
 *     only entered for enabled-and-linked channels — keeping channels with
 *     `enabled: false` keeps the call out and avoids any network side
 *     effects.
 *   - deleteDetectionSettings: success path that unlinks the channel
 *     reference and deletes the discriminator doc.
 *
 * Mocks: 0 — pure in-memory Mongo. (pythonService is imported by the service
 * but only invoked when a linked channel exists with `enabled: true`. Tests
 * keep the linked detections in the disabled state.)
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
  "../../../core/v1/detectionSettings/detectionSettings.service.js"
);
const { default: Channel } = await import(
  "../../../core/v1/channels/channels.model.js"
);
const detectionModels = await import(
  "../../../core/v1/detectionSettings/detectionSettings.model.js"
);
const { MotionDetectionSetting, DetectionSetting } = detectionModels;
const { default: NVR } = await import("../../../core/v1/NVR/nvr.model.js");
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
    name: "motion-x",
    settingType: "motionDetectionSettings",
    userId: "u1",
    enabled: true,
    settings: { metricType: "gauge" },
    alerts: [],
    ...over,
  });
}

let nvrSeq = 0;
async function makeNVR(over = {}) {
  nvrSeq += 1;
  return NVR.create({
    userId: "u1",
    nvrName: "TestNVR",
    brand: "hikvision",
    domain: "http://nvr.local",
    location: "HQ",
    localNvrId: `local-nvr-${nvrSeq}`,
    ...over,
  });
}

function makeChannel(nvrId, over = {}) {
  return Channel.create({
    nvrId,
    userId: "u1",
    streamingPath: "/Streaming/Channels/101",
    localChannelId: "1",
    name: "Cam-A",
    ...over,
  });
}

describe("DetectionSettingsService.createDetectionSettings — happy path", () => {
  it("creates a discriminator document and links it to every valid channel", async () => {
    const nvr = await makeNVR();
    const ch = await makeChannel(nvr._id);

    const { req, res, next } = serviceCtx({
      user_id: "u1",
      body: {
        name: "motion-new",
        settingType: "motionDetectionSettings",
        NVRId: nvr._id.toString(),
        channelId: [ch._id.toString()],
        enabled: true,
        settings: { metricType: "gauge" },
      },
    });
    await DetectionSettingsService.createDetectionSettings(req, res, next);
    expect(res.statusCode).toBe(201);
    expect(payload(res).status).toBe("success");

    const reloaded = await Channel.findById(ch._id);
    expect(
      reloaded.detections?.motionDetectionSettings?.id?.toString()
    ).toBeTruthy();
    expect(await DetectionSetting.countDocuments()).toBe(1);
  });

  it("returns 400 on validation error (missing required field)", async () => {
    const { req, res, next } = serviceCtx({
      user_id: "u1",
      body: { settingType: "motionDetectionSettings" }, // missing name + others
    });
    await DetectionSettingsService.createDetectionSettings(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("records skippedChannels for an unknown channelId (when other channels are valid)", async () => {
    const nvr = await makeNVR();
    const ghostId = new mongoose.Types.ObjectId();

    const { req, res, next } = serviceCtx({
      user_id: "u1",
      body: {
        name: "motion-with-skip",
        settingType: "motionDetectionSettings",
        NVRId: nvr._id.toString(),
        channelId: [ghostId.toString()],
        enabled: true,
        settings: { metricType: "gauge" },
      },
    });
    await DetectionSettingsService.createDetectionSettings(req, res, next);
    expect(res.statusCode).toBe(201);
    const data = payload(res).data?.savedDetectionSettings;
    // The link loop iterates the supplied channelId list and pushes a
    // skipped entry when the channel can't be found.
    expect(data.skipped).toHaveLength(1);
    expect(data.skipped[0].reason).toMatch(/Channel not found/);
    expect(data.saved).toHaveLength(0);
  });
});

describe("DetectionSettingsService.updateDetectionSettings — happy paths", () => {
  it("merges base + nested settings without touching channel links when channelId not given", async () => {
    const setting = await makeMotionSetting({
      name: "motion-rename",
      settings: { metricType: "gauge", alertThreshold: 1 },
    });
    const { req, res, next } = serviceCtx({
      user_id: "u1",
      params: { id: setting._id.toString() },
      body: {
        name: "motion-renamed",
        settings: { detectionTimeGap: 5 },
      },
    });
    await DetectionSettingsService.updateDetectionSettings(req, res, next);
    expect(res.statusCode).toBe(200);
    const after = await DetectionSetting.findById(setting._id);
    expect(after.name).toBe("motion-renamed");
    // Existing setting value preserved by the spread merge.
    expect(after.settings.alertThreshold).toBe(1);
    // Newly supplied value applied.
    expect(after.settings.detectionTimeGap).toBe(5);
  });

  it("links newly-supplied channelIds and skips unknown ones", async () => {
    const setting = await makeMotionSetting();
    const nvr = await makeNVR();
    const ch = await makeChannel(nvr._id);
    const ghost = new mongoose.Types.ObjectId();

    const { req, res, next } = serviceCtx({
      user_id: "u1",
      adminId: new mongoose.Types.ObjectId(),
      params: { id: setting._id.toString() },
      body: {
        NVRId: nvr._id,
        channelId: [ch._id.toString(), ghost.toString()],
      },
    });
    await DetectionSettingsService.updateDetectionSettings(req, res, next);
    expect(res.statusCode).toBe(200);
    const data = payload(res).data;
    expect(data.saved.length).toBe(1);
    expect(data.skipped.length).toBe(1);
    expect(data.skipped[0].reason).toMatch(/Channel not found/);
  });

  it("unlinks channels that drop out of the new channelId list", async () => {
    const setting = await makeMotionSetting();
    const nvr = await makeNVR();
    const ch = await makeChannel(nvr._id, {
      detections: {
        motionDetectionSettings: { id: setting._id, enabled: false },
      },
    });
    const ch2 = await makeChannel(nvr._id, { localChannelId: "2", name: "Cam-B" });

    const { req, res, next } = serviceCtx({
      user_id: "u1",
      adminId: new mongoose.Types.ObjectId(),
      params: { id: setting._id.toString() },
      body: {
        NVRId: nvr._id,
        channelId: [ch2._id.toString()], // drops ch1
      },
    });
    await DetectionSettingsService.updateDetectionSettings(req, res, next);
    expect(res.statusCode).toBe(200);
    const ch1After = await Channel.findById(ch._id);
    expect(ch1After.detections?.motionDetectionSettings).toBeFalsy();
    const ch2After = await Channel.findById(ch2._id);
    expect(
      ch2After.detections?.motionDetectionSettings?.id?.toString()
    ).toBe(setting._id.toString());
  });
});

describe("DetectionSettingsService.deleteDetectionSettings — happy path", () => {
  it("removes the setting and unlinks all referencing channels (200)", async () => {
    const setting = await makeMotionSetting();
    const nvr = await makeNVR();
    const ch = await makeChannel(nvr._id, {
      detections: {
        motionDetectionSettings: { id: setting._id, enabled: false },
      },
    });
    const { req, res, next } = serviceCtx({
      user_id: "u1",
      params: { id: setting._id.toString() },
    });
    await DetectionSettingsService.deleteDetectionSettings(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(await DetectionSetting.findById(setting._id)).toBeNull();
    const chAfter = await Channel.findById(ch._id);
    expect(chAfter.detections?.motionDetectionSettings).toBeFalsy();
  });

  it("scopes deletion to the user_id (foreign user → 404 untouched)", async () => {
    const setting = await makeMotionSetting({ userId: "owner" });
    const { req, res, next } = serviceCtx({
      user_id: "intruder",
      params: { id: setting._id.toString() },
    });
    await DetectionSettingsService.deleteDetectionSettings(req, res, next);
    expect(res.statusCode).toBe(404);
    expect(await DetectionSetting.findById(setting._id)).not.toBeNull();
  });
});
