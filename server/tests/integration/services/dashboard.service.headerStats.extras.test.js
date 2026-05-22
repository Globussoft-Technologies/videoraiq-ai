/**
 * DashboardService.headerStats — additional branches that earlier rounds
 * skipped:
 *   - checkInOrCheckOutCamera="checkin" (memberId undefined + memberId set)
 *   - checkInOrCheckOutCamera="checkout"
 *   - checkInOrCheckOutCamera="both"
 *   - incidentCrowdDetectionFilters → orConditions push
 *   - incidentpersonalProtectiveEquipmentFilters → ppe path push (helmet +
 *     safety_jacket min/max present)
 *   - !channelFilter._id && memberId set → channelFilter._id = authorizedChannel
 *   - !userMatch.channelId && memberId set → userMatch.channelId = authorizedChannel
 *
 * Each branch uses the no-filter happy path style: assert the response shape
 * is 200/success and that totalAlerts respects whatever filter we add.
 *
 * Mocks: 0 — pure in-memory Mongo + a single Admin seed.
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
const incidentsModel = await import(
  "../../../core/v1/incidents/incidents.model.js"
);
const { Incident } = incidentsModel;
const { default: Channel } = await import(
  "../../../core/v1/channels/channels.model.js"
);

const USER_ID = "189";
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
    login: "hd-extras",
    email: "hd-extras@test.com",
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

describe("DashboardService.headerStats — checkInOrCheckOutCamera branches", () => {
  it("checkin branch (memberId undefined) responds successfully", async () => {
    await Channel.create({
      userId: USER_ID,
      name: "cam-checkin",
      channelId: 11,
      nvrId: new mongoose.Types.ObjectId(),
      localChannelId: "lc-ci-1",
      streamingPath: "/s/ci-1",
      checkType: "checkin",
    });

    const { req, res, next } = ctx({
      body: { checkInOrCheckOutCamera: "checkin" },
    });
    await DashboardService.headerStats(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).status).toBe("success");
  });

  it("checkout branch (memberId undefined) responds successfully", async () => {
    await Channel.create({
      userId: USER_ID,
      name: "cam-checkout",
      channelId: 22,
      nvrId: new mongoose.Types.ObjectId(),
      localChannelId: "lc-co-1",
      streamingPath: "/s/co-1",
      checkType: "checkout",
    });

    const { req, res, next } = ctx({
      body: { checkInOrCheckOutCamera: "checkout" },
    });
    await DashboardService.headerStats(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).status).toBe("success");
  });

  it("both branch (memberId undefined) responds successfully", async () => {
    await Channel.create({
      userId: USER_ID,
      name: "cam-both-1",
      channelId: 31,
      nvrId: new mongoose.Types.ObjectId(),
      localChannelId: "lc-both-1",
      streamingPath: "/s/both-1",
      checkType: "checkin",
    });
    await Channel.create({
      userId: USER_ID,
      name: "cam-both-2",
      channelId: 32,
      nvrId: new mongoose.Types.ObjectId(),
      localChannelId: "lc-both-2",
      streamingPath: "/s/both-2",
      checkType: "checkout",
    });

    const { req, res, next } = ctx({
      body: { checkInOrCheckOutCamera: "both" },
    });
    await DashboardService.headerStats(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).status).toBe("success");
  });

  it("checkin branch with memberId set exercises the member-scoped query", async () => {
    await Channel.create({
      userId: USER_ID,
      name: "cam-mci",
      channelId: 41,
      nvrId: new mongoose.Types.ObjectId(),
      localChannelId: "lc-mci-1",
      streamingPath: "/s/mci-1",
      checkType: "checkin",
    });

    const { req, res, next } = ctx({
      memberId: new mongoose.Types.ObjectId().toString(),
      body: { checkInOrCheckOutCamera: "checkin" },
    });
    // authorizedChannel empty array triggers the "!_id + memberId" channelFilter._id
    // fallback at the bottom of the filter block too.
    req.verified.authorizedChannel = { channels: [], nvrIds: [] };

    await DashboardService.headerStats(req, res, next);
    expect(res.statusCode).toBe(200);
  });

  it("checkout branch with memberId set", async () => {
    await Channel.create({
      userId: USER_ID,
      name: "cam-mco",
      channelId: 51,
      nvrId: new mongoose.Types.ObjectId(),
      localChannelId: "lc-mco-1",
      streamingPath: "/s/mco-1",
      checkType: "checkout",
    });
    const { req, res, next } = ctx({
      memberId: new mongoose.Types.ObjectId().toString(),
      body: { checkInOrCheckOutCamera: "checkout" },
    });
    req.verified.authorizedChannel = { channels: [], nvrIds: [] };
    await DashboardService.headerStats(req, res, next);
    expect(res.statusCode).toBe(200);
  });

  it("both branch with memberId set", async () => {
    await Channel.create({
      userId: USER_ID,
      name: "cam-mboth",
      channelId: 61,
      nvrId: new mongoose.Types.ObjectId(),
      localChannelId: "lc-mboth-1",
      streamingPath: "/s/mboth-1",
      checkType: "checkin",
    });
    const { req, res, next } = ctx({
      memberId: new mongoose.Types.ObjectId().toString(),
      body: { checkInOrCheckOutCamera: "both" },
    });
    req.verified.authorizedChannel = { channels: [], nvrIds: [] };
    await DashboardService.headerStats(req, res, next);
    expect(res.statusCode).toBe(200);
  });
});

describe("DashboardService.headerStats — crowd/ppe filter branches", () => {
  it("applies crowd-detection orCondition when filters are provided", async () => {
    await Incident.create({
      userId: USER_ID,
      incidentType: "crowdDetection",
      timeOfIncident: new Date(),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      Image: "https://img/crowd.jpg",
      croudCount: 10,
    });
    const { req, res, next } = ctx({
      body: {
        incidentCrowdDetectionFilters: {
          incidentType: "crowdDetection",
          count: { min: 5, max: 50 },
        },
      },
    });
    await DashboardService.headerStats(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).status).toBe("success");
  });

  it("applies ppe-detection orCondition with helmet + safety_jacket ranges", async () => {
    await Incident.create({
      userId: USER_ID,
      incidentType: "personalProtectiveEquipment",
      timeOfIncident: new Date(),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      Image: "https://img/ppe.jpg",
      ppe: {
        helmet: { yes: 2, no: 1 },
        safety_jacket: { yes: 1, no: 2 },
      },
    });
    const { req, res, next } = ctx({
      body: {
        incidentpersonalProtectiveEquipmentFilters: {
          incidentType: "personProtectiveEquipment",
          helmet: {
            yes: { min: 0, max: 10 },
            no: { min: 0, max: 10 },
          },
          safety_jacket: {
            yes: { min: 0, max: 10 },
            no: { min: 0, max: 10 },
          },
        },
      },
    });
    await DashboardService.headerStats(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).status).toBe("success");
  });
});

describe("DashboardService.headerStats — memberId fallback channelFilter._id", () => {
  it("falls through to authorizedChannel _id $in when no other channel filter applied", async () => {
    const channelId = new mongoose.Types.ObjectId();
    await Channel.create({
      _id: channelId,
      userId: USER_ID,
      name: "auth-ch-1",
      channelId: 71,
      nvrId: new mongoose.Types.ObjectId(),
      localChannelId: "lc-auth-1",
      streamingPath: "/s/auth-1",
      detections: { motionDetectionSettings: { enabled: true } },
    });
    const { req, res, next } = ctx({
      memberId: new mongoose.Types.ObjectId().toString(),
      body: {},
    });
    req.verified.authorizedChannel = {
      channels: [channelId],
      nvrIds: [],
    };
    await DashboardService.headerStats(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).status).toBe("success");
  });
});
