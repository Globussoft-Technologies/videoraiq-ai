/**
 * Additional ChannelsService coverage rounding out branches missed by the
 * existing channels.service.{,extras,update}.test.js. Targets the largest
 * remaining uncovered chunks in channels.service.js:
 *   - getFilterAllChannels: camType, _id filter, nvrId filter, search by
 *     NVR/department name, location filter (no match + intersect with nvrId
 *     + happy path with locationNvrIds), department filter, authorizedChannel
 *     intersect.
 *   - getChannelsByNvr: isSystem=true with a linked detection setting so the
 *     detection-mapping branch (562-578) actually fires.
 *   - getPlaybackUrl: happy path returning a playback URL.
 *   - toggleDetection: linked + status-change path (calls python service, 1254-1291).
 *   - bulkUpdateChannels: profile-only update (no control), updates profile.
 *
 * Mocks: 3
 *   - services/python.service.js
 *   - services/delete.service.js
 *   - utils/rtspStream.js (generatePlayBackUrl only — buildStreamingUrl still
 *     uses real local-mode behavior via partial mock)
 *
 * NB: APP_ENV is "local" in tests/setup.js, so buildStreamingUrl returns
 *     `${nvr.domain}/${channel.streamingPath}` without going through any
 *     cloud / redis path. We keep buildStreamingUrl real to avoid mock churn.
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
    handleDetectionStartStop: vi.fn().mockResolvedValue({ ok: true }),
    registerChannel: vi.fn().mockResolvedValue({}),
    stopDetection: vi.fn().mockResolvedValue({}),
  },
}));
vi.mock("../../../services/delete.service.js", () => ({
  default: { deleteChannel: vi.fn().mockResolvedValue(true) },
}));

// Partial-mock rtspStream so generatePlayBackUrl is deterministic, while
// keeping buildStreamingUrl real (local-mode = simple template, no network).
vi.mock("../../../utils/rtspStream.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    generatePlayBackUrl: vi.fn().mockResolvedValue("session-1/playback.m3u8"),
  };
});

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
const { default: pythonService } = await import(
  "../../../services/python.service.js"
);
const { CountPersonsDetectionSetting } = await import(
  "../../../core/v1/detectionSettings/detectionSettings.model.js"
);
await import("../../../core/v1/profiles/profiles.model.js");
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
});

function makeChannel(over = {}) {
  return Channel.create({
    nvrId: new mongoose.Types.ObjectId(),
    userId: "1",
    streamingPath: "/Streaming/Channels/101",
    localChannelId: "1",
    name: "Lobby Cam",
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
// getFilterAllChannels — branch coverage for the filter pipeline (uncovered
// lines 1052-1170 in channels.service.js).
// ---------------------------------------------------------------------------

describe("ChannelsService.getFilterAllChannels — filter branches", () => {
  it("filters by camType (single value)", async () => {
    const admin = await Admin.create({
      user_id: "1",
      login: "a",
      email: "a@test.com",
    });
    await makeChannel({ userId: "1", checkType: "checkin" });
    await makeChannel({
      userId: "1",
      localChannelId: "2",
      name: "Y",
      checkType: "checkout",
    });

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { camType: "checkin" },
    });
    await ChannelsService.getFilterAllChannels(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.total).toBe(1);
  });

  it("filters by camType (comma-separated list)", async () => {
    const admin = await Admin.create({
      user_id: "1",
      login: "a",
      email: "a@test.com",
    });
    await makeChannel({ userId: "1", checkType: "checkin" });
    await makeChannel({
      userId: "1",
      localChannelId: "2",
      name: "Y",
      checkType: "checkout",
    });
    await makeChannel({
      userId: "1",
      localChannelId: "3",
      name: "Z",
      checkType: "none",
    });

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { camType: "checkin, checkout" },
    });
    await ChannelsService.getFilterAllChannels(req, res, next);
    expect(payload(res).data.total).toBe(2);
  });

  it("filters by _id (comma-separated)", async () => {
    const admin = await Admin.create({
      user_id: "1",
      login: "a",
      email: "a@test.com",
    });
    const c1 = await makeChannel({ userId: "1" });
    await makeChannel({ userId: "1", localChannelId: "2", name: "Y" });

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { _id: `${c1._id}` },
    });
    await ChannelsService.getFilterAllChannels(req, res, next);
    expect(payload(res).data.total).toBe(1);
  });

  it("filters by nvrId (comma-separated)", async () => {
    const admin = await Admin.create({
      user_id: "1",
      login: "a",
      email: "a@test.com",
    });
    const nvr = await makeNvr({ userId: "1" });
    await makeChannel({ userId: "1", nvrId: nvr._id });
    await makeChannel({
      userId: "1",
      localChannelId: "2",
      name: "Other",
    });

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { nvrId: `${nvr._id}` },
    });
    await ChannelsService.getFilterAllChannels(req, res, next);
    expect(payload(res).data.total).toBe(1);
  });

  it("search: finds channels via matching NVR name", async () => {
    const admin = await Admin.create({
      user_id: "1",
      login: "a",
      email: "a@test.com",
    });
    const nvr = await makeNvr({ userId: "1", nvrName: "MainBuilding" });
    await makeChannel({ userId: "1", nvrId: nvr._id, name: "X" });

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { search: "MainBuilding" },
    });
    await ChannelsService.getFilterAllChannels(req, res, next);
    expect(payload(res).data.total).toBe(1);
  });

  it("search: finds channels via matching department name", async () => {
    const admin = await Admin.create({
      user_id: "1",
      login: "a",
      email: "a@test.com",
    });
    const dept = await Department.create({
      adminId: admin._id,
      userId: "1",
      departmentName: "SecurityOps",
    });
    await makeChannel({ userId: "1", department: [dept._id] });

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { search: "SecurityOps" },
    });
    await ChannelsService.getFilterAllChannels(req, res, next);
    expect(payload(res).data.total).toBe(1);
  });

  it("location filter: returns empty when no NVRs match the location", async () => {
    const admin = await Admin.create({
      user_id: "1",
      login: "a",
      email: "a@test.com",
    });
    await makeChannel({ userId: "1" });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { location: "Mars" },
    });
    await ChannelsService.getFilterAllChannels(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.total).toBe(0);
    expect(payload(res).message).toMatch(/No channels found for this location/);
  });

  it("location filter happy path: limits channels to NVRs in that location", async () => {
    const admin = await Admin.create({
      user_id: "1",
      login: "a",
      email: "a@test.com",
    });
    const nvr = await makeNvr({ userId: "1", location: "HQ" });
    await makeChannel({ userId: "1", nvrId: nvr._id });

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { location: "HQ" },
    });
    await ChannelsService.getFilterAllChannels(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.total).toBe(1);
  });

  it("location + nvrId intersect: returns empty when nvrId not in location", async () => {
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
    await ChannelsService.getFilterAllChannels(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.total).toBe(0);
    expect(payload(res).message).toMatch(/given NVR and location/);
  });

  it("location + nvrId intersect: keeps matching nvrIds", async () => {
    const admin = await Admin.create({
      user_id: "1",
      login: "a",
      email: "a@test.com",
    });
    const nvr = await makeNvr({ userId: "1", location: "HQ" });
    await makeChannel({ userId: "1", nvrId: nvr._id });

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: { location: "HQ", nvrId: nvr._id.toString() },
    });
    await ChannelsService.getFilterAllChannels(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.total).toBe(1);
  });

  it("department filter narrows to channels in given department", async () => {
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
    await ChannelsService.getFilterAllChannels(req, res, next);
    expect(payload(res).data.total).toBe(1);
  });

  it("authorizedChannel + memberId intersects with _id filter", async () => {
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
      authorizedChannel: { channels: [c1._id.toString()] },
      query: { _id: `${c1._id},${c2._id}` },
    });
    await ChannelsService.getFilterAllChannels(req, res, next);
    expect(res.statusCode).toBe(200);
    // Intersection logic uses includes() on strings → only c1 should remain.
    expect(payload(res).data.total).toBe(1);
  });

  it("authorizedChannel + memberId alone: scopes to authorized list", async () => {
    const admin = await Admin.create({
      user_id: "1",
      login: "a",
      email: "a@test.com",
    });
    const c1 = await makeChannel({ userId: "1" });
    await makeChannel({ userId: "1", localChannelId: "2", name: "Y" });

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      memberId: "m1",
      authorizedChannel: { channels: [c1._id] },
      query: {},
    });
    await ChannelsService.getFilterAllChannels(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.total).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// getChannelsByNvr — isSystem=true path with a linked detection setting,
// so the detection-mapping branch (562-578) runs.
// ---------------------------------------------------------------------------

describe("ChannelsService.getChannelsByNvr — isSystem detection mapping", () => {
  it("returns flattened detections (with referencePoints) for system users", async () => {
    const nvr = await makeNvr({ userId: "1" });
    const setting = await CountPersonsDetectionSetting.create({
      userId: "1",
      settingType: "countPersonsSettings",
      name: "default",
      enabled: true,
      settings: {
        metricType: "gauge",
        // referencePoints is keyed by channelId → channel mapping should pick
        // the matching key out and flatten it into detection.settings.
      },
    });
    const channel = await makeChannel({
      userId: "1",
      nvrId: nvr._id,
      detections: {
        countPersonsSettings: { id: setting._id, enabled: true },
      },
    });

    const { req, res, next } = serviceCtx({
      params: { nvrId: nvr._id.toString() },
    });
    req.verified.userData.system = true;
    await ChannelsService.getChannelsByNvr(req, res, next);
    expect(res.statusCode).toBe(200);
    const data = payload(res).data;
    expect(data.nvr).toBeUndefined();
    expect(data.channels).toHaveLength(1);
    expect(data.channels[0].cameraId.toString()).toBe(channel._id.toString());
    // Detection should be flattened (no .id wrapper) with .enabled forwarded.
    const det = data.channels[0].detections.find(
      (d) => d.settingType === "countPersonsSettings",
    );
    expect(det).toBeTruthy();
    expect(det.enabled).toBe(true);
    // referencePoints is normalized to an object even when source has no
    // channel-keyed entry.
    expect(det.settings.referencePoints).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// getPlaybackUrl — happy path (rtspStream.generatePlayBackUrl mocked).
// ---------------------------------------------------------------------------

describe("ChannelsService.getPlaybackUrl — happy path", () => {
  it("returns a playback URL when channel + nvr exist", async () => {
    const nvr = await makeNvr({ userId: "1" });
    const channel = await makeChannel({ userId: "1", nvrId: nvr._id });
    const { req, res, next } = serviceCtx({
      body: {
        channelId: channel._id.toString(),
        startTime: "2024-01-01T00:00:00Z",
        endTime: "2024-01-01T01:00:00Z",
        sessionId: "session-1",
      },
    });
    await ChannelsService.getPlaybackUrl(req, res, next);
    expect(res.statusCode).toBe(200);
    // APP_ENV=local in tests/setup.js → playbackUrl is prefixed with rtsp_host.
    expect(payload(res).data.playbackUrl).toContain("session-1/playback.m3u8");
  });
});

// ---------------------------------------------------------------------------
// getPlaybackTimeline — happy path (hikvision branch, DigestFetch mocked).
// Also covers dahua (501) + unsupported brand branches.
// ---------------------------------------------------------------------------

// getPlaybackTimeline brand-branch tests are intentionally omitted: in
// APP_ENV=local mode (tests/setup.js), the NVR localSchema does not declare
// ip/password/port/username, so Mongoose strips them on both save and
// hydration. The decrypt(...) calls in getPlaybackTimeline (channels.service
// lines 852-853) therefore throw before the brand switch can run. Those
// branches are exercised by routes-contract suites instead.

// ---------------------------------------------------------------------------
// toggleDetection — linked + status-change happy path (1254-1291).
// ---------------------------------------------------------------------------

describe("ChannelsService.toggleDetection — linked status change", () => {
  it("toggles a linked detection from disabled→enabled and pings python", async () => {
    const setting = await CountPersonsDetectionSetting.create({
      userId: "1",
      settingType: "countPersonsSettings",
      name: "default",
      enabled: false,
      settings: { metricType: "gauge", levelOfImportance: "low" },
    });
    const channel = await makeChannel({
      userId: "1",
      detections: {
        countPersonsSettings: { id: setting._id, enabled: false },
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
    expect(payload(res).message).toMatch(/Detection updated successfully/);
    expect(pythonService.handleDetectionStartStop).toHaveBeenCalledTimes(1);
    const reloaded = await Channel.findById(channel._id);
    expect(reloaded.detections.countPersonsSettings.enabled).toBe(true);
  });

  it("returns 403 for reserved userId '32' even when detection is linked", async () => {
    const setting = await CountPersonsDetectionSetting.create({
      userId: "32",
      settingType: "countPersonsSettings",
      name: "default",
      enabled: false,
      settings: { metricType: "gauge" },
    });
    const channel = await makeChannel({
      userId: "32",
      detections: {
        countPersonsSettings: { id: setting._id, enabled: false },
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
    expect(res.statusCode).toBe(403);
    expect(pythonService.handleDetectionStartStop).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// bulkUpdateChannels — profile-only update branch.
// ---------------------------------------------------------------------------

describe("ChannelsService.bulkUpdateChannels — profile branch", () => {
  it("sets profile on matching channels (no control change)", async () => {
    const profileId = new mongoose.Types.ObjectId();
    const c1 = await makeChannel();
    const c2 = await makeChannel({ localChannelId: "2", name: "Y" });
    const { req, res, next } = serviceCtx({
      body: {
        ids: [c1._id.toString(), c2._id.toString()],
        profile: profileId.toString(),
      },
    });
    await ChannelsService.bulkUpdateChannels(req, res, next);
    expect(res.statusCode).toBe(200);
    const reloaded = await Channel.find({ _id: { $in: [c1._id, c2._id] } });
    for (const r of reloaded) {
      expect(r.profile?.toString()).toBe(profileId.toString());
    }
  });
});
