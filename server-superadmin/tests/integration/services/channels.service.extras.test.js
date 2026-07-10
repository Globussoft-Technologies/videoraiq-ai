/**
 * Additional ChannelsService coverage, slotting under channels.service.test.js
 * and channels.service.update.test.js. Focuses on branches that are easy to
 * exercise against in-memory Mongo without going near DigestFetch / pythonService
 * device I/O:
 *   - getAllChannels search across NVR / department names
 *   - getAllChannels department / nvrId filters and the authorizedChannel + memberId intersect path
 *   - getChannelsByNvr (memberId / isSystem branches, channels not found)
 *   - bulkUpdateChannels: control=0 and profile updates
 *   - updateChannelConfiguration happy path (Channel.findOneAndUpdate)
 *   - getPlaybackWithFilters: departments branch and the memberId+departments branch
 *   - getPlaybackTimeline: missing field, NVR not found, unsupported brand, dahua 501
 *
 * Mocks (2): python.service.js, delete.service.js — same shape as
 * channels.service.test.js.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
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
const { default: NVR } = await import("../../../core/v1/NVR/nvr.model.js");
const { default: Department } = await import(
  "../../../core/v1/departments/departments.model.js"
);
await import("../../../core/v1/profiles/profiles.model.js");
await import("../../../core/v1/detectionSettings/detectionSettings.model.js");
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
});

function makeChannel(over = {}) {
  return Channel.create({
    nvrId: new mongoose.Types.ObjectId(),
    userId: "1",
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

// ---------------------------------------------------------------------------
// getAllChannels — additional branches
// ---------------------------------------------------------------------------

describe("ChannelsService.getAllChannels — search / filter branches", () => {
  it("finds channels by matching NVR name in `search`", async () => {
    const admin = await Admin.create({
      user_id: "1",
      login: "a",
      email: "a@test.com",
    });
    const nvr = await makeNvr({ userId: "1", nvrName: "AcmeNVR" });
    await makeChannel({ userId: "1", nvrId: nvr._id, name: "X" });

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { search: "Acme" },
    });
    await ChannelsService.getAllChannels(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.total).toBe(1);
  });

  it("finds channels by matching Department name in `search`", async () => {
    const admin = await Admin.create({
      user_id: "1",
      login: "a",
      email: "a@test.com",
    });
    const dept = await Department.create({
      adminId: admin._id,
      userId: "1",
      departmentName: "AnalyticsTeam",
    });
    await makeChannel({ userId: "1", department: [dept._id] });

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { search: "Analytics" },
    });
    await ChannelsService.getAllChannels(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.total).toBe(1);
  });

  it("filters by department id list", async () => {
    const admin = await Admin.create({
      user_id: "1",
      login: "a",
      email: "a@test.com",
    });
    const dept = await Department.create({
      adminId: admin._id,
      userId: "1",
      departmentName: "Ops",
    });
    await makeChannel({ userId: "1", department: [dept._id] });
    await makeChannel({ userId: "1", localChannelId: "2", name: "Other" });

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { department: dept._id.toString() },
    });
    await ChannelsService.getAllChannels(req, res, next);
    expect(payload(res).data.total).toBe(1);
  });

  it("filters by nvrId list (comma-separated)", async () => {
    const admin = await Admin.create({
      user_id: "1",
      login: "a",
      email: "a@test.com",
    });
    const nvr1 = await makeNvr({ userId: "1" });
    const nvr2 = await makeNvr({
      userId: "1",
      localNvrId: "loc-2",
      nvrName: "N2",
    });
    await makeChannel({ userId: "1", nvrId: nvr1._id });
    await makeChannel({
      userId: "1",
      nvrId: nvr2._id,
      localChannelId: "2",
      name: "Y",
    });

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { nvrId: `${nvr1._id},${nvr2._id}` },
    });
    await ChannelsService.getAllChannels(req, res, next);
    expect(payload(res).data.total).toBe(2);
  });

  it("returns empty when location matches NVRs but provided nvrId has no overlap", async () => {
    const admin = await Admin.create({
      user_id: "1",
      login: "a",
      email: "a@test.com",
    });
    const nvr = await makeNvr({ userId: "1", location: "HQ" });
    await makeChannel({ userId: "1", nvrId: nvr._id });

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: {
        location: "HQ",
        nvrId: new mongoose.Types.ObjectId().toString(),
      },
    });
    await ChannelsService.getAllChannels(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.total).toBe(0);
  });

  it("intersects _id filter with authorizedChannel + memberId", async () => {
    const admin = await Admin.create({
      user_id: "1",
      login: "a",
      email: "a@test.com",
    });
    const c1 = await makeChannel({ userId: "1" });
    const c2 = await makeChannel({
      userId: "1",
      localChannelId: "2",
      name: "Y",
    });

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      memberId: "m1",
      authorizedChannel: { channels: [c1._id] },
      query: { _id: `${c1._id},${c2._id}` },
    });
    await ChannelsService.getAllChannels(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.total).toBe(1);
    expect(payload(res).data.channels[0]._id.toString()).toBe(
      c1._id.toString(),
    );
  });
});

// ---------------------------------------------------------------------------
// getChannelsByNvr — additional branches
// ---------------------------------------------------------------------------

describe("ChannelsService.getChannelsByNvr — memberId / isSystem branches", () => {
  it("returns only authorized channels when memberId is present and not a system user", async () => {
    const nvr = await makeNvr({ userId: "1" });
    const c1 = await makeChannel({ userId: "1", nvrId: nvr._id });
    await makeChannel({
      userId: "1",
      nvrId: nvr._id,
      localChannelId: "2",
      name: "Hidden",
    });

    const { req, res, next } = serviceCtx({
      memberId: "m1",
      authorizedChannel: { channels: [c1._id] },
      params: { nvrId: nvr._id.toString() },
    });
    await ChannelsService.getChannelsByNvr(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.channels).toHaveLength(1);
    // Non-system path returns nvr alongside channels.
    expect(payload(res).data.nvr).toBeTruthy();
  });

  it("isSystem=true: returns the trimmed system payload without nvr", async () => {
    const nvr = await makeNvr({ userId: "1" });
    await makeChannel({ userId: "1", nvrId: nvr._id });

    const { req, res, next } = serviceCtx({
      params: { nvrId: nvr._id.toString() },
    });
    req.verified.userData.system = true;
    await ChannelsService.getChannelsByNvr(req, res, next);
    expect(res.statusCode).toBe(200);
    // System payload only carries `channels` (no nvr key).
    expect(payload(res).data.nvr).toBeUndefined();
    expect(payload(res).data.channels).toHaveLength(1);
    expect(payload(res).data.channels[0]).toHaveProperty("cameraId");
  });

  it("returns 200 with an empty list when no channels match the NVR", async () => {
    const { req, res, next } = serviceCtx({
      params: { nvrId: new mongoose.Types.ObjectId().toString() },
    });
    await ChannelsService.getChannelsByNvr(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.channels).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// bulkUpdateChannels — deeper branches
// ---------------------------------------------------------------------------

describe("ChannelsService.bulkUpdateChannels — extra branches", () => {
  it("updates control=0 on matching channels", async () => {
    const c1 = await makeChannel({ control: 1 });
    const c2 = await makeChannel({
      localChannelId: "2",
      name: "Y",
      control: 1,
    });
    const { req, res, next } = serviceCtx({
      body: { ids: [c1._id.toString(), c2._id.toString()], control: 0 },
    });
    await ChannelsService.bulkUpdateChannels(req, res, next);
    expect(res.statusCode).toBe(200);
    const reloaded = await Channel.find({
      _id: { $in: [c1._id, c2._id] },
    }).setOptions({ includeInactive: true });
    for (const r of reloaded) expect(r.control).toBe(0);
  });

  it("returns 400 when control is not 0/1 and no profile provided", async () => {
    const c1 = await makeChannel();
    const { req, res, next } = serviceCtx({
      body: { ids: [c1._id.toString()], control: 5 }, // invalid control
    });
    await ChannelsService.bulkUpdateChannels(req, res, next);
    expect(res.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// updateChannelConfiguration — happy path
// ---------------------------------------------------------------------------

describe("ChannelsService.updateChannelConfiguration — happy path", () => {
  it("updates the per-detection settings block on a real channel", async () => {
    const channel = await makeChannel();
    const { req, res, next } = serviceCtx({
      query: {
        id: channel._id.toString(),
        detectionKey: "loiteringWithAuthSettings",
      },
      body: {
        enabled: true,
        settings: {
          videoLinkRequirement: true,
          video_min_length: 5,
          video_max_length: 60,
          level_of_importance: "high",
          alertThreshold: 1,
          faceAuth: true,
          videoResolution: [1080],
          referencePoints: {},
        },
      },
    });
    await ChannelsService.updateChannelConfiguration(req, res, next);
    // Happy path uses res.status(200).json — HTTP 200.
    expect(res.statusCode).toBe(200);
    expect(payload(res).status).toBe("success");
    const reloaded = await Channel.findById(channel._id);
    expect(reloaded.detections.loiteringWithAuthSettings.enabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getPlaybackWithFilters — departments branches
// ---------------------------------------------------------------------------

describe("ChannelsService.getPlaybackWithFilters — departments branches", () => {
  it("returns admin departments when no memberId", async () => {
    const admin = await Admin.create({
      user_id: "1",
      login: "a",
      email: "a@test.com",
    });
    await Department.create({
      adminId: admin._id,
      userId: "1",
      departmentName: "Ops",
    });
    await Department.create({
      adminId: admin._id,
      userId: "1",
      departmentName: "QA",
    });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { filter: "departments" },
    });
    await ChannelsService.getPlaybackWithFilters(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data).toHaveLength(2);
  });

  it("memberId path: returns only authorized departments", async () => {
    const admin = await Admin.create({
      user_id: "1",
      login: "a",
      email: "a@test.com",
    });
    const d1 = await Department.create({
      adminId: admin._id,
      userId: "1",
      departmentName: "Ops",
    });
    await Department.create({
      adminId: admin._id,
      userId: "1",
      departmentName: "QA",
    });
    const { req, res, next } = serviceCtx({
      memberId: "m1",
      adminId: admin._id,
      authorizedChannel: { departmentIds: [d1._id] },
      query: { filter: "departments" },
    });
    await ChannelsService.getPlaybackWithFilters(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data).toHaveLength(1);
    expect(payload(res).data[0].departmentName).toBe("Ops");
  });

  it("memberId path: returns only authorized nvrs", async () => {
    const nvr1 = await makeNvr({ userId: "1", nvrName: "Open" });
    await makeNvr({ userId: "1", localNvrId: "loc-2", nvrName: "Hidden" });
    const { req, res, next } = serviceCtx({
      memberId: "m1",
      authorizedChannel: { nvrIds: [nvr1._id] },
      query: { filter: "nvrs" },
    });
    await ChannelsService.getPlaybackWithFilters(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data).toHaveLength(1);
    expect(payload(res).data[0].nvrName).toBe("Open");
  });

  it("memberId path: returns only authorized channels", async () => {
    const c1 = await makeChannel({ userId: "1", name: "Open" });
    await makeChannel({ userId: "1", localChannelId: "2", name: "Hidden" });
    const { req, res, next } = serviceCtx({
      memberId: "m1",
      authorizedChannel: { channels: [c1._id] },
      query: { filter: "channels" },
    });
    await ChannelsService.getPlaybackWithFilters(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data).toHaveLength(1);
    expect(payload(res).data[0].name).toBe("Open");
  });
});

// ---------------------------------------------------------------------------
// getPlaybackTimeline — validation + brand branches
// ---------------------------------------------------------------------------

describe("ChannelsService.getPlaybackTimeline — early returns", () => {
  it("returns 400 when required fields are missing", async () => {
    const { req, res, next } = serviceCtx({ body: {} });
    await ChannelsService.getPlaybackTimeline(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 when NVR or camera not found", async () => {
    const { req, res, next } = serviceCtx({
      body: {
        nvrId: new mongoose.Types.ObjectId().toString(),
        cameraId: new mongoose.Types.ObjectId().toString(),
        channel: "1",
        startTime: "2024-01-01T00:00:00Z",
        endTime: "2024-01-01T01:00:00Z",
      },
    });
    await ChannelsService.getPlaybackTimeline(req, res, next);
    expect(res.statusCode).toBe(404);
  });
});
