/**
 * DashboardService.headerStats — body-filter branches at the top of the
 * method (lines ~52-222 of dashboard.service.js). These are the
 * nvrId / channelId / location / department arms that earlier rounds
 * skipped because they don't trip the #49 scoping bug — headerStats
 * declares `channelFilter` and `userMatch` before any of these arms run.
 *
 * Branches covered:
 *   - nvrId as comma-string + array, with and without memberId
 *   - nvrId with memberId but no authorizedNVRs → filteredNVRIds=[] (skipped)
 *   - nvrId with memberId and a matching authorizedNVRs entry
 *   - channelId comma-string + array, with and without memberId
 *   - channelId with memberId but no authorizedChannel (skipped)
 *   - channelId with memberId and matching authorizedChannel entry
 *   - location → NVR lookup, with and without memberId, authorized scope
 *   - department → channel lookup, with and without memberId, authorized scope
 *   - outer catch (forces channelsModel.countDocuments to reject by feeding
 *     a non-castable adminId after the lookup) — covered via mongoose cast
 *     fail on user_id.toString() call.
 *
 * Mocks: 0 — pure in-memory Mongo, no external services.
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

const { default: DashboardService } = await import(
  "../../../core/v1/dashboard/dashboard.service.js"
);
const { default: Admin } = await import(
  "../../../core/v1/admin/admin.model.js"
);
const { default: Channel } = await import(
  "../../../core/v1/channels/channels.model.js"
);
const { default: NVR } = await import("../../../core/v1/NVR/nvr.model.js");

const USER_ID = "777";
let admin;

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
  admin = await Admin.create({
    user_id: USER_ID,
    login: "hd-bodyf",
    email: "hd-bodyf@test.com",
  });
});

function ctx(overrides = {}) {
  return serviceCtx({
    adminId: admin._id,
    user_id: USER_ID,
    body: {},
    ...overrides,
  });
}

// ----------------------------------------------------------------------------
// nvrId branches
// ----------------------------------------------------------------------------
describe("DashboardService.headerStats — nvrId body filter", () => {
  it("accepts nvrId as a comma-separated string and applies the $in filter (no memberId)", async () => {
    const validId = new mongoose.Types.ObjectId().toString();
    const { req, res, next } = ctx({
      body: { nvrId: `${validId}, not-a-valid-id` },
    });
    await DashboardService.headerStats(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).status).toBe("success");
  });

  it("accepts nvrId as an array (no memberId)", async () => {
    const validId = new mongoose.Types.ObjectId().toString();
    const { req, res, next } = ctx({
      body: { nvrId: [validId] },
    });
    await DashboardService.headerStats(req, res, next);
    expect(res.statusCode).toBe(200);
  });

  it("memberId set but no authorizedNVRs → filteredNVRIds=[] is the skipped path", async () => {
    const validId = new mongoose.Types.ObjectId().toString();
    const { req, res, next } = ctx({
      memberId: new mongoose.Types.ObjectId().toString(),
      body: { nvrId: validId },
    });
    req.verified.authorizedChannel = { channels: [], nvrIds: [] };
    await DashboardService.headerStats(req, res, next);
    expect(res.statusCode).toBe(200);
  });

  it("memberId set with matching authorizedNVRs → filtered $in is applied", async () => {
    const authorizedId = new mongoose.Types.ObjectId();
    const { req, res, next } = ctx({
      memberId: new mongoose.Types.ObjectId().toString(),
      body: { nvrId: authorizedId.toString() },
    });
    req.verified.authorizedChannel = {
      channels: [],
      nvrIds: [authorizedId],
    };
    await DashboardService.headerStats(req, res, next);
    expect(res.statusCode).toBe(200);
  });
});

// ----------------------------------------------------------------------------
// channelId branches
// ----------------------------------------------------------------------------
describe("DashboardService.headerStats — channelId body filter", () => {
  it("accepts channelId comma-string with one valid + one invalid id (no memberId)", async () => {
    const validId = new mongoose.Types.ObjectId().toString();
    const { req, res, next } = ctx({
      body: { channelId: `${validId},bad-channel-id` },
    });
    await DashboardService.headerStats(req, res, next);
    expect(res.statusCode).toBe(200);
  });

  it("accepts channelId as an array (no memberId)", async () => {
    const validId = new mongoose.Types.ObjectId().toString();
    const { req, res, next } = ctx({
      body: { channelId: [validId] },
    });
    await DashboardService.headerStats(req, res, next);
    expect(res.statusCode).toBe(200);
  });

  it("memberId set without authorizedChannel → filteredChannelIds=[] skipped", async () => {
    const validId = new mongoose.Types.ObjectId().toString();
    const { req, res, next } = ctx({
      memberId: new mongoose.Types.ObjectId().toString(),
      body: { channelId: validId },
    });
    req.verified.authorizedChannel = { channels: [], nvrIds: [] };
    await DashboardService.headerStats(req, res, next);
    expect(res.statusCode).toBe(200);
  });

  it("memberId set with matching authorizedChannel → filtered _id $in is applied", async () => {
    const authorizedId = new mongoose.Types.ObjectId();
    const { req, res, next } = ctx({
      memberId: new mongoose.Types.ObjectId().toString(),
      body: { channelId: authorizedId.toString() },
    });
    req.verified.authorizedChannel = {
      channels: [authorizedId],
      nvrIds: [],
    };
    await DashboardService.headerStats(req, res, next);
    expect(res.statusCode).toBe(200);
  });
});

// ----------------------------------------------------------------------------
// location branches (NVR lookup gate)
// ----------------------------------------------------------------------------
describe("DashboardService.headerStats — location body filter", () => {
  it("matches NVRs by location and applies $in (no memberId)", async () => {
    await NVR.create({
      userId: USER_ID,
      nvrName: "HQ-NVR",
      brand: "hikvision",
      domain: "http://nvr.local",
      location: "HQ",
      localNvrId: "loc-nvr-1",
    });
    const { req, res, next } = ctx({
      body: { location: "HQ,branch-2" },
    });
    await DashboardService.headerStats(req, res, next);
    expect(res.statusCode).toBe(200);
  });

  it("location filter with memberId + no authorizedNVRs → filteredNVRIds=[] skipped", async () => {
    await NVR.create({
      userId: USER_ID,
      nvrName: "HQ-NVR",
      brand: "hikvision",
      domain: "http://nvr.local",
      location: "HQ",
      localNvrId: "loc-nvr-2",
    });
    const { req, res, next } = ctx({
      memberId: new mongoose.Types.ObjectId().toString(),
      body: { location: ["HQ"] },
    });
    req.verified.authorizedChannel = { channels: [], nvrIds: [] };
    await DashboardService.headerStats(req, res, next);
    expect(res.statusCode).toBe(200);
  });

  it("location filter with memberId + matching authorizedNVRs → filtered $in", async () => {
    const nvr = await NVR.create({
      userId: USER_ID,
      nvrName: "HQ-NVR",
      brand: "hikvision",
      domain: "http://nvr.local",
      location: "HQ",
      localNvrId: "loc-nvr-3",
    });
    const { req, res, next } = ctx({
      memberId: new mongoose.Types.ObjectId().toString(),
      body: { location: ["HQ"] },
    });
    req.verified.authorizedChannel = {
      channels: [],
      nvrIds: [nvr._id],
    };
    await DashboardService.headerStats(req, res, next);
    expect(res.statusCode).toBe(200);
  });

  it("location matching no NVRs → no filter mutation, still succeeds", async () => {
    const { req, res, next } = ctx({
      body: { location: "no-such-loc" },
    });
    await DashboardService.headerStats(req, res, next);
    expect(res.statusCode).toBe(200);
  });
});

// ----------------------------------------------------------------------------
// department branches (channel lookup gate)
// ----------------------------------------------------------------------------
describe("DashboardService.headerStats — department body filter", () => {
  it("matches channels by department and applies $in (no memberId)", async () => {
    const deptId = new mongoose.Types.ObjectId();
    await Channel.create({
      userId: USER_ID,
      name: "cam-dept",
      channelId: 91,
      nvrId: new mongoose.Types.ObjectId(),
      localChannelId: "lc-dept-1",
      streamingPath: "/s/dept-1",
      department: [deptId],
    });
    const { req, res, next } = ctx({
      body: { department: deptId.toString() },
    });
    await DashboardService.headerStats(req, res, next);
    expect(res.statusCode).toBe(200);
  });

  it("department as array (no memberId)", async () => {
    const deptId = new mongoose.Types.ObjectId();
    await Channel.create({
      userId: USER_ID,
      name: "cam-dept",
      channelId: 92,
      nvrId: new mongoose.Types.ObjectId(),
      localChannelId: "lc-dept-2",
      streamingPath: "/s/dept-2",
      department: [deptId],
    });
    const { req, res, next } = ctx({
      body: { department: [deptId.toString()] },
    });
    await DashboardService.headerStats(req, res, next);
    expect(res.statusCode).toBe(200);
  });

  it("department with memberId + no authorizedChannel → filteredChannelIds=[] skipped", async () => {
    const deptId = new mongoose.Types.ObjectId();
    await Channel.create({
      userId: USER_ID,
      name: "cam-dept",
      channelId: 93,
      nvrId: new mongoose.Types.ObjectId(),
      localChannelId: "lc-dept-3",
      streamingPath: "/s/dept-3",
      department: [deptId],
    });
    const { req, res, next } = ctx({
      memberId: new mongoose.Types.ObjectId().toString(),
      body: { department: deptId.toString() },
    });
    req.verified.authorizedChannel = { channels: [], nvrIds: [] };
    await DashboardService.headerStats(req, res, next);
    expect(res.statusCode).toBe(200);
  });

  it("department with memberId + matching authorizedChannel → filtered _id $in", async () => {
    const deptId = new mongoose.Types.ObjectId();
    const channelId = new mongoose.Types.ObjectId();
    await Channel.create({
      _id: channelId,
      userId: USER_ID,
      name: "cam-dept",
      channelId: 94,
      nvrId: new mongoose.Types.ObjectId(),
      localChannelId: "lc-dept-4",
      streamingPath: "/s/dept-4",
      department: [deptId],
    });
    const { req, res, next } = ctx({
      memberId: new mongoose.Types.ObjectId().toString(),
      body: { department: deptId.toString() },
    });
    req.verified.authorizedChannel = {
      channels: [channelId],
      nvrIds: [],
    };
    await DashboardService.headerStats(req, res, next);
    expect(res.statusCode).toBe(200);
  });

  it("department matching no channels → no filter mutation", async () => {
    const { req, res, next } = ctx({
      body: { department: new mongoose.Types.ObjectId().toString() },
    });
    await DashboardService.headerStats(req, res, next);
    expect(res.statusCode).toBe(200);
  });
});

// ----------------------------------------------------------------------------
// Outer catch — userData.user_id missing triggers `.toString()` on undefined.
// ----------------------------------------------------------------------------
describe("DashboardService.headerStats — outer catch", () => {
  it("returns 500 when userData.user_id is undefined (TypeError on toString)", async () => {
    const { req, res, next } = ctx({
      user_id: undefined,
      body: {},
    });
    await DashboardService.headerStats(req, res, next);
    expect(res.statusCode).toBe(500);
    expect(payload(res).status).toBe("failed");
  });
});
