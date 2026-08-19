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
const { default: NVR } = await import("../../../core/v1/NVR/nvr.model.js");
await import("../../../core/v1/profiles/profiles.model.js");
await import("../../../core/v1/detectionSettings/detectionSettings.model.js");
await import("../../../core/v1/authorizedUsers/authorizedUsers.model.js");
const { default: Department } = await import(
  "../../../core/v1/departments/departments.model.js"
);
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
    isAdded: true,
    ...over,
  });
}

function makeNvr(over = {}) {
  return NVR.create({
    userId: "1",
    nvrName: "NVR-1",
    brand: "hikvision",
    domain: "http://nvr.local",
    location: "HQ",
    localNvrId: "loc-1",
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
    expect((await Channel.findById(c1._id).setOptions({ includeInactive: true })).control).toBe(1);
  });
});

describe("ChannelsService.getAllChannels", () => {
  it("returns 400 when the admin has no user_id", async () => {
    // adminId resolves to no admin → user_id undefined → 400.
    const { req, res, next } = serviceCtx({
      adminId: new mongoose.Types.ObjectId(),
      query: {},
    });
    await ChannelsService.getAllChannels(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("returns the admin's channels with total", async () => {
    const admin = await Admin.create({
      user_id: "42",
      login: "a",
      email: "a@test.com",
    });
    await makeChannel({ userId: "42" });
    await makeChannel({ userId: "42", localChannelId: "2", name: "Gate" });
    // Different userId → must NOT appear.
    await makeChannel({ userId: "999", name: "Other Org" });

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: {},
    });
    await ChannelsService.getAllChannels(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.total).toBe(2);
    expect(payload(res).data.channels).toHaveLength(2);
  });

  it("filters by camType when provided", async () => {
    const admin = await Admin.create({
      user_id: "42",
      login: "a",
      email: "a@test.com",
    });
    await makeChannel({ userId: "42", checkType: "checkin" });
    await makeChannel({
      userId: "42",
      localChannelId: "2",
      checkType: "checkout",
    });

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { camType: "checkin" },
    });
    await ChannelsService.getAllChannels(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.total).toBe(1);
  });

  it("returns empty when location has no matching NVRs", async () => {
    const admin = await Admin.create({
      user_id: "42",
      login: "a",
      email: "a@test.com",
    });
    await makeChannel({ userId: "42" });

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { location: "Mars" },
    });
    await ChannelsService.getAllChannels(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.total).toBe(0);
    expect(payload(res).data.channels).toEqual([]);
  });
});

describe("ChannelsService.getNvrCameraDetections", () => {
  it("groups cameras under their NVR and returns enabled detection names", async () => {
    const admin = await Admin.create({
      user_id: "42",
      login: "a",
      email: "a@test.com",
    });
    const nvr1 = await makeNvr({
      userId: "42",
      nvrName: "NVR-A",
      localNvrId: "nvr-a",
    });
    const nvr2 = await makeNvr({
      userId: "42",
      nvrName: "NVR-B",
      localNvrId: "nvr-b",
    });

    await makeChannel({
      userId: "42",
      nvrId: nvr1._id,
      name: "Front Gate",
      control: 1,
      detections: {
        countPersonsSettings: { enabled: true },
        motionDetectionSettings: { enabled: false },
      },
    });
    await makeChannel({
      userId: "42",
      nvrId: nvr1._id,
      name: "Lobby",
      customName: "Lobby Custom",
      localChannelId: "2",
      control: 1,
      detections: {
        vehicleDetectionSettings: { enabled: true },
      },
    });
    await makeChannel({
      userId: "42",
      nvrId: nvr2._id,
      name: "Warehouse",
      localChannelId: "3",
      control: 1,
      detections: {
        crowdDetectionSettings: { enabled: true },
        lightDetectionSettings: { enabled: true },
      },
    });
    const stoppedCamera = await makeChannel({
      userId: "42",
      nvrId: nvr2._id,
      name: "Stopped Camera",
      localChannelId: "4",
      detections: {
        crowdDetectionSettings: { enabled: true },
      },
    });
    await Channel.updateOne({ _id: stoppedCamera._id }, { $set: { control: 0 } });
    await makeChannel({
      userId: "42",
      nvrId: nvr2._id,
      name: "No Detection Camera",
      localChannelId: "5",
      control: 1,
      detections: {
        crowdDetectionSettings: { enabled: false },
      },
    });

    const { req, res, next } = serviceCtx({
      params: { adminId: admin._id.toString() },
    });
    await ChannelsService.getNvrCameraDetections(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(payload(res).data.totalNvrs).toBe(2);
    expect(payload(res).data.nvrs).toHaveLength(2);

    expect(payload(res).data.nvrs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nvrName: "NVR-A",
          cameras: expect.arrayContaining([
            expect.objectContaining({
              cameraName: "Front Gate",
              detections: ["Count Persons Detection"],
            }),
            expect.objectContaining({
              cameraName: "Lobby Custom",
              detections: ["ANPR Detection"],
            }),
          ]),
        }),
        expect.objectContaining({
          nvrName: "NVR-B",
          cameras: [
            expect.objectContaining({
              cameraName: "Warehouse",
              detections: ["Crowd Detection", "Light Detection"],
            }),
          ],
        }),
      ])
    );
  });

  it("restricts grouped cameras to authorized channels for members", async () => {
    const admin = await Admin.create({
      user_id: "55",
      login: "a",
      email: "a@test.com",
    });
    const nvr = await makeNvr({
      userId: "55",
      nvrName: "Member NVR",
      localNvrId: "member-nvr",
    });
    const allowedChannel = await makeChannel({
      userId: "55",
      nvrId: nvr._id,
      name: "Allowed Cam",
      control: 1,
      detections: {
        countVehiclesSettings: { enabled: true },
      },
    });
    await makeChannel({
      userId: "55",
      nvrId: nvr._id,
      localChannelId: "2",
      name: "Blocked Cam",
      control: 1,
      detections: {
        countVehiclesSettings: { enabled: true },
      },
    });

    const { req, res, next } = serviceCtx({
      params: { adminId: admin._id.toString() },
      memberId: "member-1",
      authorizedChannel: {
        channels: [allowedChannel._id],
      },
    });
    await ChannelsService.getNvrCameraDetections(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(payload(res).data.totalNvrs).toBe(1);
    expect(payload(res).data.nvrs[0].cameras).toHaveLength(1);
    expect(payload(res).data.nvrs[0].cameras[0].cameraName).toBe(
      "Allowed Cam"
    );
    expect(payload(res).data.nvrs[0].cameras[0].detections).toEqual([
      "Count Vehicles Detection",
    ]);
  });

  it("excludes cameras that are stopped or have no enabled detections", async () => {
    const admin = await Admin.create({
      user_id: "77",
      login: "a",
      email: "a@test.com",
    });
    const nvr = await makeNvr({
      userId: "77",
      nvrName: "Filtered NVR",
      localNvrId: "filtered-nvr",
    });
    await makeChannel({
      userId: "77",
      nvrId: nvr._id,
      name: "Running Camera",
      control: 1,
      detections: {
        countPersonsSettings: { enabled: true },
      },
    });
    const stoppedMemberCamera = await makeChannel({
      userId: "77",
      nvrId: nvr._id,
      localChannelId: "2",
      name: "Stopped Camera",
      detections: {
        countPersonsSettings: { enabled: true },
      },
    });
    await Channel.updateOne(
      { _id: stoppedMemberCamera._id },
      { $set: { control: 0 } }
    );
    await makeChannel({
      userId: "77",
      nvrId: nvr._id,
      localChannelId: "3",
      name: "No Enabled Detection",
      control: 1,
      detections: {
        countPersonsSettings: { enabled: false },
      },
    });

    const { req, res, next } = serviceCtx({
      params: { adminId: admin._id.toString() },
    });
    await ChannelsService.getNvrCameraDetections(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(payload(res).data.totalNvrs).toBe(1);
    expect(payload(res).data.nvrs[0].cameras).toHaveLength(1);
    expect(payload(res).data.nvrs[0].cameras[0].cameraName).toBe(
      "Running Camera"
    );
  });

  it("returns 400 when adminId is missing", async () => {
    const { req, res, next } = serviceCtx({});
    await ChannelsService.getNvrCameraDetections(req, res, next);

    expect(res.statusCode).toBe(400);
    expect(payload(res).message).toBe("Missing required adminId");
  });

  it("returns 404 when adminId does not exist", async () => {
    const { req, res, next } = serviceCtx({
      params: { adminId: new mongoose.Types.ObjectId().toString() },
    });
    await ChannelsService.getNvrCameraDetections(req, res, next);

    expect(res.statusCode).toBe(404);
    expect(payload(res).message).toBe("Admin not found");
  });
});

describe("ChannelsService.getFilterAllChannels", () => {
  it("returns 400 when the admin has no user_id", async () => {
    const { req, res, next } = serviceCtx({
      adminId: new mongoose.Types.ObjectId(),
      query: {},
    });
    await ChannelsService.getFilterAllChannels(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("returns the channels list (slim projection)", async () => {
    const admin = await Admin.create({
      user_id: "55",
      login: "a",
      email: "a@test.com",
    });
    await makeChannel({ userId: "55" });
    await makeChannel({ userId: "55", localChannelId: "2", name: "Gate" });

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: {},
    });
    await ChannelsService.getFilterAllChannels(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.total).toBe(2);
    // Slim projection — channels include name + nvrId only (no streamingPath).
    expect(payload(res).data.channels[0]).toHaveProperty("name");
  });
});

describe("ChannelsService.getPlaybackWithFilters", () => {
  it("returns 400 when filter is missing", async () => {
    const { req, res, next } = serviceCtx({ query: {} });
    await ChannelsService.getPlaybackWithFilters(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("returns NVR locations for an admin (no memberId)", async () => {
    await makeNvr({ userId: "1", location: "HQ" });
    await makeNvr({
      userId: "1",
      localNvrId: "loc-2",
      location: "Branch",
    });
    const { req, res, next } = serviceCtx({
      user_id: "1",
      query: { filter: "locations" },
    });
    await ChannelsService.getPlaybackWithFilters(req, res, next);
    // .send() with SuccessResp; statusCode defaults to 200.
    expect(res.statusCode).toBe(200);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data).toHaveLength(2);
  });

  it("returns NVRs for an admin (no memberId)", async () => {
    await makeNvr({ userId: "7" });
    const { req, res, next } = serviceCtx({
      user_id: "7",
      query: { filter: "nvrs" },
    });
    await ChannelsService.getPlaybackWithFilters(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data).toHaveLength(1);
  });

  it("returns channels for an admin (no memberId)", async () => {
    await makeChannel({ userId: "9" });
    const { req, res, next } = serviceCtx({
      user_id: "9",
      query: { filter: "channels" },
    });
    await ChannelsService.getPlaybackWithFilters(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data).toHaveLength(1);
  });

  it("scopes to authorizedNVRs when memberId is present", async () => {
    const nvr1 = await makeNvr({ userId: "1", location: "Open" });
    await makeNvr({
      userId: "1",
      localNvrId: "loc-2",
      location: "Hidden",
    });
    const { req, res, next } = serviceCtx({
      memberId: "member-1",
      authorizedChannel: { nvrIds: [nvr1._id] },
      query: { filter: "locations" },
    });
    await ChannelsService.getPlaybackWithFilters(req, res, next);
    expect(payload(res).status).toBe("success");
    // Only the authorized NVR's location should come back.
    expect(payload(res).data).toHaveLength(1);
    expect(payload(res).data[0].location).toBe("Open");
  });
});

describe("ChannelsService.getPlaybackUrl", () => {
  it("returns 400 when required fields are missing", async () => {
    const { req, res, next } = serviceCtx({ body: {} });
    await ChannelsService.getPlaybackUrl(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for an invalid ObjectId", async () => {
    const { req, res, next } = serviceCtx({
      body: {
        channelId: "not-an-id",
        startTime: "2024-01-01",
        sessionId: "sess-1",
      },
    });
    await ChannelsService.getPlaybackUrl(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 when the channel does not exist", async () => {
    const { req, res, next } = serviceCtx({
      body: {
        channelId: new mongoose.Types.ObjectId().toString(),
        startTime: "2024-01-01",
        sessionId: "sess-1",
      },
    });
    await ChannelsService.getPlaybackUrl(req, res, next);
    expect(res.statusCode).toBe(404);
  });
});

describe("ChannelsService.updateChannelConfiguration", () => {
  it("fails validation for an invalid camera ID", async () => {
    const { req, res, next } = serviceCtx({
      query: { id: "not-an-id", detectionKey: "loiteringWithAuth" },
      body: { enabled: true, settings: {} },
    });
    await ChannelsService.updateChannelConfiguration(req, res, next);
    // Service uses res.send + userFailResp; status stays at default 200,
    // but payload.status should be failed.
    expect(payload(res).status).toBe("failed");
  });

  it("fails when channel is not found", async () => {
    const { req, res, next } = serviceCtx({
      query: {
        id: new mongoose.Types.ObjectId().toString(),
        detectionKey: "loiteringWithAuth",
      },
      body: { enabled: true, settings: {} },
    });
    await ChannelsService.updateChannelConfiguration(req, res, next);
    expect(payload(res).status).toBe("failed");
  });
});
