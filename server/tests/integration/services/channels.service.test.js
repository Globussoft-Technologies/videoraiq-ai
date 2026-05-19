/**
 * Integration test for ChannelsService — the tractable CRUD / lookup paths
 * against in-memory MongoDB. Device-I/O methods (playback, detection toggle
 * via pythonService) are not exercised here.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

vi.mock("../../../services/python.service.js", () => ({
  default: {
    handleDetectionStartStop: vi.fn().mockResolvedValue({}),
    registerChannel: vi.fn().mockResolvedValue({}),
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
const { default: Admin } = await import(
  "../../../core/v1/admin/admin.model.js"
);
// Register the schemas the populate() chains reference.
await import("../../../core/v1/NVR/nvr.model.js");
await import("../../../core/v1/profiles/profiles.model.js");
await import("../../../core/v1/detectionSettings/detectionSettings.model.js");
await import("../../../core/v1/authorizedUsers/authorizedUsers.model.js");
await import("../../../core/v1/departments/departments.model.js");
await import("../../../core/v1/users/users.model.js");

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
});

function makeChannel(over = {}) {
  return Channel.create({
    nvrId: new mongoose.Types.ObjectId(),
    userId: "u1",
    streamingPath: "/Streaming/Channels/101",
    localChannelId: "1",
    name: "Lobby Cam",
    ...over,
  });
}

describe("ChannelsService.getChannelById", () => {
  it("returns 400 when the id is missing", async () => {
    const { req, res, next } = serviceCtx({ params: {} });
    await ChannelsService.getChannelById(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 for an unknown channel", async () => {
    const admin = await Admin.create({
      user_id: "1",
      login: "a",
      email: "a@test.com",
    });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      params: { id: new mongoose.Types.ObjectId().toString() },
    });
    await ChannelsService.getChannelById(req, res, next);
    expect(res.statusCode).toBe(404);
  });

  it("returns the channel when it exists", async () => {
    const admin = await Admin.create({
      user_id: "1",
      login: "a",
      email: "a@test.com",
    });
    const channel = await makeChannel();
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      params: { id: channel._id.toString() },
    });
    await ChannelsService.getChannelById(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.channel._id.toString()).toBe(
      channel._id.toString()
    );
  });
});

describe("ChannelsService.getChannelsByNvr", () => {
  it("returns 400 when nvrId is missing", async () => {
    const { req, res, next } = serviceCtx({ params: {} });
    await ChannelsService.getChannelsByNvr(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("returns the channels for an NVR", async () => {
    const nvrId = new mongoose.Types.ObjectId();
    await makeChannel({ nvrId });
    await makeChannel({ nvrId, localChannelId: "2" });
    const { req, res, next } = serviceCtx({
      params: { nvrId: nvrId.toString() },
    });
    await ChannelsService.getChannelsByNvr(req, res, next);
    expect(res.statusCode).toBe(200);
  });
});

describe("ChannelsService.deleteChannel", () => {
  it("returns 404 for an unknown channel", async () => {
    const { req, res, next } = serviceCtx({
      params: { id: new mongoose.Types.ObjectId().toString() },
    });
    await ChannelsService.deleteChannel(req, res, next);
    expect(res.statusCode).toBe(404);
  });

  it("deletes an existing channel", async () => {
    const channel = await makeChannel();
    const { req, res, next } = serviceCtx({
      params: { id: channel._id.toString() },
    });
    await ChannelsService.deleteChannel(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(await Channel.findById(channel._id)).toBeNull();
  });
});

describe("ChannelsService.bulkUpdateChannels", () => {
  it("returns 400 when ids is not a non-empty array", async () => {
    const { req, res, next } = serviceCtx({ body: { ids: [] } });
    await ChannelsService.bulkUpdateChannels(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when no updatable fields are provided", async () => {
    const channel = await makeChannel();
    const { req, res, next } = serviceCtx({
      body: { ids: [channel._id.toString()] },
    });
    await ChannelsService.bulkUpdateChannels(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 when no channels match the ids", async () => {
    const { req, res, next } = serviceCtx({
      body: { ids: [new mongoose.Types.ObjectId().toString()], control: 1 },
    });
    await ChannelsService.bulkUpdateChannels(req, res, next);
    expect(res.statusCode).toBe(404);
  });

  it("bulk-updates the control flag on matching channels", async () => {
    const c1 = await makeChannel();
    const c2 = await makeChannel({ localChannelId: "2" });
    const { req, res, next } = serviceCtx({
      body: { ids: [c1._id.toString(), c2._id.toString()], control: 1 },
    });
    await ChannelsService.bulkUpdateChannels(req, res, next);
    expect(res.statusCode).toBe(200);
    expect((await Channel.findById(c1._id)).control).toBe(1);
  });
});
