/**
 * DashboardService.detectionChart — body-filter branches at the top of the
 * method (lines ~707-883 of dashboard.service.js). Mirrors the structure of
 * dashboard.service.headerStats.bodyFilters.test.js but pinned against
 * detectionChart, which exposes the same nvrId / channelId / location /
 * department arms (with and without memberId + authorizedChannel scoping).
 *
 * detectionChart declares `channelFilter` and `userMatch` before the filter
 * arms run, so unlike WeeklyComparisonChart (bug #49) it does NOT 500 when a
 * body filter is supplied. We cover the live happy paths and the
 * memberId-scoped branches.
 *
 * Branches covered:
 *   - nvrId as comma-string + array, no memberId
 *   - nvrId with memberId but no authorizedNVRs → filteredNVRIds=[] skipped
 *   - nvrId with memberId and a matching authorizedNVRs entry
 *   - channelId comma-string + array, no memberId
 *   - channelId with memberId but no authorizedChannel → skipped
 *   - channelId with memberId and matching authorizedChannel
 *   - location → NVR lookup, no memberId
 *   - location with memberId + no authorizedNVRs → skipped
 *   - location with memberId + matching authorizedNVRs
 *   - department → channel lookup, no memberId, array form
 *   - department with memberId + no authorizedChannel → skipped
 *   - department with memberId + matching authorizedChannel
 *   - outer catch — userData.user_id undefined trips .toString() on undefined.
 *
 * The outer catch in detectionChart returns a 500 JSON body via
 * res.status(500).json(Response.errorResp(...)) — note that this is different
 * from headerStats which sends the same shape.
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

const USER_ID = "778";
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
    login: "dc-bodyf",
    email: "dc-bodyf@test.com",
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
describe("DashboardService.detectionChart — nvrId body filter", () => {
  it("accepts nvrId as a comma-string with one valid + one invalid id (no memberId)", async () => {
    const validId = new mongoose.Types.ObjectId().toString();
    const { req, res, next } = ctx({
      body: { nvrId: `${validId}, not-an-id` },
    });
    await DashboardService.detectionChart(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).status).toBe("success");
  });

  it("accepts nvrId as an array (no memberId)", async () => {
    const validId = new mongoose.Types.ObjectId().toString();
    const { req, res, next } = ctx({
      body: { nvrId: [validId] },
    });
    await DashboardService.detectionChart(req, res, next);
    expect(res.statusCode).toBe(200);
  });

  it("memberId set but no authorizedNVRs → filteredNVRIds=[] skipped path", async () => {
    const validId = new mongoose.Types.ObjectId().toString();
    const { req, res, next } = ctx({
      memberId: new mongoose.Types.ObjectId().toString(),
      body: { nvrId: validId },
    });
    req.verified.authorizedChannel = { channels: [], nvrIds: [] };
    await DashboardService.detectionChart(req, res, next);
    expect(res.statusCode).toBe(200);
  });

  it("memberId set with matching authorizedNVRs → filtered $in applied", async () => {
    const authorizedId = new mongoose.Types.ObjectId();
    const { req, res, next } = ctx({
      memberId: new mongoose.Types.ObjectId().toString(),
      body: { nvrId: authorizedId.toString() },
    });
    req.verified.authorizedChannel = {
      channels: [],
      nvrIds: [authorizedId],
    };
    await DashboardService.detectionChart(req, res, next);
    expect(res.statusCode).toBe(200);
  });
});

// ----------------------------------------------------------------------------
// channelId branches
// ----------------------------------------------------------------------------
describe("DashboardService.detectionChart — channelId body filter", () => {
  it("accepts channelId comma-string (no memberId)", async () => {
    const validId = new mongoose.Types.ObjectId().toString();
    const { req, res, next } = ctx({
      body: { channelId: `${validId},bad-channel` },
    });
    await DashboardService.detectionChart(req, res, next);
    expect(res.statusCode).toBe(200);
  });

  it("accepts channelId as an array (no memberId)", async () => {
    const validId = new mongoose.Types.ObjectId().toString();
    const { req, res, next } = ctx({
      body: { channelId: [validId] },
    });
    await DashboardService.detectionChart(req, res, next);
    expect(res.statusCode).toBe(200);
  });

  it("memberId set without authorizedChannel → filteredChannelIds=[] skipped", async () => {
    const validId = new mongoose.Types.ObjectId().toString();
    const { req, res, next } = ctx({
      memberId: new mongoose.Types.ObjectId().toString(),
      body: { channelId: validId },
    });
    req.verified.authorizedChannel = { channels: [], nvrIds: [] };
    await DashboardService.detectionChart(req, res, next);
    expect(res.statusCode).toBe(200);
  });

  it("memberId set with matching authorizedChannel → filtered _id $in", async () => {
    const authorizedId = new mongoose.Types.ObjectId();
    const { req, res, next } = ctx({
      memberId: new mongoose.Types.ObjectId().toString(),
      body: { channelId: authorizedId.toString() },
    });
    req.verified.authorizedChannel = {
      channels: [authorizedId],
      nvrIds: [],
    };
    await DashboardService.detectionChart(req, res, next);
    expect(res.statusCode).toBe(200);
  });
});

// ----------------------------------------------------------------------------
// location branches (NVR lookup gate)
// ----------------------------------------------------------------------------
describe("DashboardService.detectionChart — location body filter", () => {
  it("matches NVRs by location and applies $in (no memberId)", async () => {
    await NVR.create({
      userId: USER_ID,
      nvrName: "HQ-NVR",
      brand: "hikvision",
      domain: "http://nvr.local",
      location: "HQ",
      localNvrId: "dc-loc-1",
    });
    const { req, res, next } = ctx({
      body: { location: "HQ,branch-2" },
    });
    await DashboardService.detectionChart(req, res, next);
    expect(res.statusCode).toBe(200);
  });

  it("location with memberId + no authorizedNVRs → filteredNVRIds=[] skipped", async () => {
    await NVR.create({
      userId: USER_ID,
      nvrName: "HQ-NVR",
      brand: "hikvision",
      domain: "http://nvr.local",
      location: "HQ",
      localNvrId: "dc-loc-2",
    });
    const { req, res, next } = ctx({
      memberId: new mongoose.Types.ObjectId().toString(),
      body: { location: ["HQ"] },
    });
    req.verified.authorizedChannel = { channels: [], nvrIds: [] };
    await DashboardService.detectionChart(req, res, next);
    expect(res.statusCode).toBe(200);
  });

  it("location with memberId + matching authorizedNVRs → filtered $in applied", async () => {
    const nvr = await NVR.create({
      userId: USER_ID,
      nvrName: "HQ-NVR",
      brand: "hikvision",
      domain: "http://nvr.local",
      location: "HQ",
      localNvrId: "dc-loc-3",
    });
    const { req, res, next } = ctx({
      memberId: new mongoose.Types.ObjectId().toString(),
      body: { location: ["HQ"] },
    });
    req.verified.authorizedChannel = {
      channels: [],
      nvrIds: [nvr._id],
    };
    await DashboardService.detectionChart(req, res, next);
    expect(res.statusCode).toBe(200);
  });
});

// ----------------------------------------------------------------------------
// department branches (channel lookup gate)
// ----------------------------------------------------------------------------
describe("DashboardService.detectionChart — department body filter", () => {
  it("matches channels by department and applies $in (no memberId)", async () => {
    const deptId = new mongoose.Types.ObjectId();
    await Channel.create({
      userId: USER_ID,
      name: "cam-dept",
      channelId: 191,
      nvrId: new mongoose.Types.ObjectId(),
      localChannelId: "dc-dept-1",
      streamingPath: "/s/dc-dept-1",
      department: [deptId],
    });
    const { req, res, next } = ctx({
      body: { department: deptId.toString() },
    });
    await DashboardService.detectionChart(req, res, next);
    expect(res.statusCode).toBe(200);
  });

  it("department as an array (no memberId)", async () => {
    const deptId = new mongoose.Types.ObjectId();
    await Channel.create({
      userId: USER_ID,
      name: "cam-dept",
      channelId: 192,
      nvrId: new mongoose.Types.ObjectId(),
      localChannelId: "dc-dept-2",
      streamingPath: "/s/dc-dept-2",
      department: [deptId],
    });
    const { req, res, next } = ctx({
      body: { department: [deptId.toString()] },
    });
    await DashboardService.detectionChart(req, res, next);
    expect(res.statusCode).toBe(200);
  });

  it("department with memberId + no authorizedChannel → filteredChannelIds=[] skipped", async () => {
    const deptId = new mongoose.Types.ObjectId();
    await Channel.create({
      userId: USER_ID,
      name: "cam-dept",
      channelId: 193,
      nvrId: new mongoose.Types.ObjectId(),
      localChannelId: "dc-dept-3",
      streamingPath: "/s/dc-dept-3",
      department: [deptId],
    });
    const { req, res, next } = ctx({
      memberId: new mongoose.Types.ObjectId().toString(),
      body: { department: deptId.toString() },
    });
    req.verified.authorizedChannel = { channels: [], nvrIds: [] };
    await DashboardService.detectionChart(req, res, next);
    expect(res.statusCode).toBe(200);
  });

  it("department with memberId + matching authorizedChannel → filtered _id $in", async () => {
    const deptId = new mongoose.Types.ObjectId();
    const channelOid = new mongoose.Types.ObjectId();
    await Channel.create({
      _id: channelOid,
      userId: USER_ID,
      name: "cam-dept",
      channelId: 194,
      nvrId: new mongoose.Types.ObjectId(),
      localChannelId: "dc-dept-4",
      streamingPath: "/s/dc-dept-4",
      department: [deptId],
    });
    const { req, res, next } = ctx({
      memberId: new mongoose.Types.ObjectId().toString(),
      body: { department: deptId.toString() },
    });
    req.verified.authorizedChannel = {
      channels: [channelOid],
      nvrIds: [],
    };
    await DashboardService.detectionChart(req, res, next);
    expect(res.statusCode).toBe(200);
  });
});

// ----------------------------------------------------------------------------
// memberId alone (no body filter) → exercises the `!channelFilter._id`
// and `!userMatch.channelId` fall-through at lines 877-883.
// ----------------------------------------------------------------------------
describe("DashboardService.detectionChart — memberId fall-through", () => {
  it("memberId with authorizedChannel and no body filter → channelFilter._id := authorizedChannel", async () => {
    const authorizedId = new mongoose.Types.ObjectId();
    const { req, res, next } = ctx({
      memberId: new mongoose.Types.ObjectId().toString(),
      body: {},
    });
    req.verified.authorizedChannel = {
      channels: [authorizedId],
      nvrIds: [],
    };
    await DashboardService.detectionChart(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).status).toBe("success");
  });
});

// ----------------------------------------------------------------------------
// Outer catch — userData.user_id undefined triggers a TypeError on .toString().
// ----------------------------------------------------------------------------
describe("DashboardService.detectionChart — outer catch", () => {
  it("returns 500 when userData.user_id is undefined (TypeError on toString)", async () => {
    const { req, res, next } = ctx({
      user_id: undefined,
      body: {},
    });
    await DashboardService.detectionChart(req, res, next);
    expect(res.statusCode).toBe(500);
    expect(payload(res).status).toBe("failed");
  });
});
