/**
 * ChannelsService — extra update / toggle paths the original
 * channels.service.test.js didn't reach. python.service and delete.service
 * are mocked the same way as in the original file.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

vi.mock("../../../services/python.service.js", () => ({
  default: {
    handleDetectionStartStop: vi.fn().mockResolvedValue({ ok: true }),
    registerChannel: vi.fn().mockResolvedValue({}),
    stopDetection: vi.fn().mockResolvedValue({}),
  },
}));
vi.mock("../../../services/delete.service.js", () => ({
  default: { deleteChannel: vi.fn().mockResolvedValue(true) },
}));

const { default: ChannelsService } = await import(
  "../../../core/v1/channels/channels.service.js"
);
const { default: Channel } = await import(
  "../../../core/v1/channels/channels.model.js"
);
const { default: pythonService } = await import(
  "../../../services/python.service.js"
);
await import("../../../core/v1/NVR/nvr.model.js");
await import("../../../core/v1/profiles/profiles.model.js");
const { CountPersonsDetectionSetting } = await import(
  "../../../core/v1/detectionSettings/detectionSettings.model.js"
);
await import("../../../core/v1/authorizedUsers/authorizedUsers.model.js");
await import("../../../core/v1/users/users.model.js");

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
  pythonService.handleDetectionStartStop.mockClear();
  pythonService.registerChannel.mockClear();
  pythonService.stopDetection.mockClear();
});

function makeChannel(over = {}) {
  return Channel.create({
    nvrId: new mongoose.Types.ObjectId(),
    userId: "u1",
    streamingPath: "/Streaming/Channels/101",
    localChannelId: "1",
    name: "Cam",
    isAdded: true,
    ...over,
  });
}

describe("ChannelsService.updateChannel", () => {
  it("returns 404 when the channel does not exist", async () => {
    const { req, res, next } = serviceCtx({
      params: { id: new mongoose.Types.ObjectId().toString() },
      body: { customName: "x" },
    });
    await ChannelsService.updateChannel(req, res, next);
    expect(res.statusCode).toBe(404);
  });

  it("sets customName when provided", async () => {
    const channel = await makeChannel();
    const { req, res, next } = serviceCtx({
      params: { id: channel._id.toString() },
      body: { customName: "Lobby West" },
    });
    await ChannelsService.updateChannel(req, res, next);
    expect(res.statusCode).toBe(200);
    expect((await Channel.findById(channel._id)).customName).toBe("Lobby West");
  });

  it("clears customName when an empty string is provided", async () => {
    const channel = await makeChannel({ customName: "old" });
    const { req, res, next } = serviceCtx({
      params: { id: channel._id.toString() },
      body: { customName: "" },
    });
    await ChannelsService.updateChannel(req, res, next);
    expect(res.statusCode).toBe(200);
    expect((await Channel.findById(channel._id)).customName).toBeUndefined();
  });

  it("rejects an invalid checkType", async () => {
    const channel = await makeChannel();
    const { req, res, next } = serviceCtx({
      params: { id: channel._id.toString() },
      body: { checkType: "not-a-mode" },
    });
    await ChannelsService.updateChannel(req, res, next);
    expect(res.statusCode).toBe(400);
    expect(payload(res).status).toBe("failed");
  });

  it("forbids checkType updates for the reserved userId '32'", async () => {
    const channel = await makeChannel({ userId: "32" });
    const { req, res, next } = serviceCtx({
      params: { id: channel._id.toString() },
      body: { checkType: "checkin" },
    });
    await ChannelsService.updateChannel(req, res, next);
    expect(res.statusCode).toBe(403);
  });

  it("sets checkType=checkin and registers with the python service", async () => {
    const channel = await makeChannel();
    const { req, res, next } = serviceCtx({
      params: { id: channel._id.toString() },
      body: { checkType: "checkin" },
    });
    await ChannelsService.updateChannel(req, res, next);
    expect(res.statusCode).toBe(200);
    expect((await Channel.findById(channel._id)).checkType).toBe("checkin");
    expect(pythonService.registerChannel).toHaveBeenCalledTimes(1);
  });

  it("sets checkType=none and calls stopDetection", async () => {
    const channel = await makeChannel({ checkType: "checkin" });
    const { req, res, next } = serviceCtx({
      params: { id: channel._id.toString() },
      body: { checkType: "none" },
    });
    await ChannelsService.updateChannel(req, res, next);
    expect(res.statusCode).toBe(200);
    expect((await Channel.findById(channel._id)).checkType).toBe("none");
    expect(pythonService.stopDetection).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid alert IDs (no matching Recipient)", async () => {
    const channel = await makeChannel();
    const { req, res, next } = serviceCtx({
      params: { id: channel._id.toString() },
      body: { alerts: [new mongoose.Types.ObjectId().toString()] },
    });
    await ChannelsService.updateChannel(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("rejects enabling a detection without a linked setting", async () => {
    // unauthorizedAccessSettings IS in DETECTION_TYPES (channels.service iterates
    // over those keys when applying detections updates).
    const channel = await makeChannel();
    const { req, res, next } = serviceCtx({
      params: { id: channel._id.toString() },
      body: { detections: { unauthorizedAccessSettings: { enabled: true } } },
    });
    await ChannelsService.updateChannel(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("turns control=1 on for a channel that has a linked detection", async () => {
    const settingId = new mongoose.Types.ObjectId();
    const channel = await makeChannel({
      detections: {
        unauthorizedAccessSettings: { id: settingId, enabled: false },
      },
    });
    const { req, res, next } = serviceCtx({
      params: { id: channel._id.toString() },
      body: { control: 1 },
    });
    await ChannelsService.updateChannel(req, res, next);
    expect(res.statusCode).toBe(200);
    const reloaded = await Channel.findById(channel._id);
    expect(reloaded.detections.unauthorizedAccessSettings.enabled).toBe(true);
  });
});

describe("ChannelsService.toggleDetection", () => {
  it("returns 400 when required parameters are missing", async () => {
    const { req, res, next } = serviceCtx({ body: {} });
    await ChannelsService.toggleDetection(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 when the channel does not exist", async () => {
    const { req, res, next } = serviceCtx({
      body: {
        channelId: new mongoose.Types.ObjectId().toString(),
        detectionType: "countPersonsSettings",
        enable: true,
      },
    });
    await ChannelsService.toggleDetection(req, res, next);
    expect(res.statusCode).toBe(404);
  });

  it("404s when the channel has no detection setting linked", async () => {
    const channel = await makeChannel();
    const { req, res, next } = serviceCtx({
      body: {
        channelId: channel._id.toString(),
        detectionType: "countPersonsSettings",
        enable: true,
      },
    });
    await ChannelsService.toggleDetection(req, res, next);
    expect(res.statusCode).toBe(404);
  });

  it("returns success early when detection is already in the desired state", async () => {
    // A real DetectionSetting must exist so populate(toPopulateDetections)
    // resolves the link; otherwise the populated `.id` becomes null and
    // toggleDetection's "not linked" branch fires (404) instead.
    const setting = await CountPersonsDetectionSetting.create({
      userId: "u1",
      settingType: "countPersonsSettings",
      name: "default",
      enabled: true,
      settings: { metricType: "gauge" },
    });
    const channel = await makeChannel({
      detections: {
        countPersonsSettings: { id: setting._id, enabled: true },
      },
    });
    const { req, res, next } = serviceCtx({
      body: {
        channelId: channel._id.toString(),
        detectionType: "countPersonsSettings",
        enable: true,
      },
    });
    await ChannelsService.toggleDetection(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).message).toMatch(/already enabled/);
    // No python call when nothing changes.
    expect(pythonService.handleDetectionStartStop).not.toHaveBeenCalled();
  });
});
