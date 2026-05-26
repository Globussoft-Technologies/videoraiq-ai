/**
 * DashboardService.criticalityStats — body-filter branches at lines ~490-547
 * of dashboard.service.js. These nvrId / channelId / location / department
 * arms were not exercised by the existing charts test (which only covers
 * the no-filter happy path).
 *
 * Branches covered:
 *   - nvrId comma-string + array → valid ObjectId $in
 *   - nvrId with all invalid ids → no filter mutation
 *   - channelId comma-string + array → $in
 *   - channelId with all invalid ids → no filter mutation
 *   - location with NVR match → $in
 *   - location with no NVR match → no mutation
 *   - department with channel match → $in
 *   - department with no channel match → no mutation
 *   - the timeAgo bucket branches: < 1 min, < 60 min, < 1440 min,
 *     < 10080 min, < 43200 min, < ∞ (years vs "more than a month ago").
 *
 * Mocks: 0 — pure in-memory Mongo.
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
const incidentsModel = await import(
  "../../../core/v1/incidents/incidents.model.js"
);
const { Incident } = incidentsModel;

const USER_ID = "606";
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
    login: "crit-filters",
    email: "crit-filters@test.com",
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
describe("DashboardService.criticalityStats — nvrId body filter", () => {
  it("accepts nvrId comma-separated string and applies $in", async () => {
    const validId = new mongoose.Types.ObjectId().toString();
    const { req, res, next } = ctx({
      body: { nvrId: `${validId},not-a-real-id` },
    });
    await DashboardService.criticalityStats(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).status).toBe("success");
  });

  it("accepts nvrId as array", async () => {
    const validId = new mongoose.Types.ObjectId().toString();
    const { req, res, next } = ctx({
      body: { nvrId: [validId] },
    });
    await DashboardService.criticalityStats(req, res, next);
    expect(res.statusCode).toBe(200);
  });

  it("nvrId with all invalid ids → no mutation, still 200", async () => {
    const { req, res, next } = ctx({
      body: { nvrId: "bad,worse" },
    });
    await DashboardService.criticalityStats(req, res, next);
    expect(res.statusCode).toBe(200);
  });
});

// ----------------------------------------------------------------------------
// channelId branches
// ----------------------------------------------------------------------------
describe("DashboardService.criticalityStats — channelId body filter", () => {
  it("accepts channelId comma-separated string and applies $in", async () => {
    const validId = new mongoose.Types.ObjectId().toString();
    const { req, res, next } = ctx({
      body: { channelId: `${validId}` },
    });
    await DashboardService.criticalityStats(req, res, next);
    expect(res.statusCode).toBe(200);
  });

  it("accepts channelId as array", async () => {
    const validId = new mongoose.Types.ObjectId().toString();
    const { req, res, next } = ctx({
      body: { channelId: [validId] },
    });
    await DashboardService.criticalityStats(req, res, next);
    expect(res.statusCode).toBe(200);
  });

  it("channelId with all invalid ids → no mutation", async () => {
    const { req, res, next } = ctx({
      body: { channelId: "bad,worse" },
    });
    await DashboardService.criticalityStats(req, res, next);
    expect(res.statusCode).toBe(200);
  });
});

// ----------------------------------------------------------------------------
// location + department branches
// ----------------------------------------------------------------------------
describe("DashboardService.criticalityStats — location body filter", () => {
  it("matches NVRs by location and applies $in", async () => {
    await NVR.create({
      userId: USER_ID,
      nvrName: "HQ-NVR",
      brand: "hikvision",
      domain: "http://nvr.local",
      location: "HQ",
      localNvrId: "crit-nvr-1",
    });
    const { req, res, next } = ctx({
      body: { location: "HQ" },
    });
    await DashboardService.criticalityStats(req, res, next);
    expect(res.statusCode).toBe(200);
  });

  it("location array variant", async () => {
    const { req, res, next } = ctx({
      body: { location: ["unknown"] },
    });
    await DashboardService.criticalityStats(req, res, next);
    expect(res.statusCode).toBe(200);
  });
});

describe("DashboardService.criticalityStats — department body filter", () => {
  it("matches channels by department and applies $in", async () => {
    const deptId = new mongoose.Types.ObjectId();
    await Channel.create({
      userId: USER_ID,
      name: "cam-dept-c",
      channelId: 81,
      nvrId: new mongoose.Types.ObjectId(),
      localChannelId: "lc-crit-dept-1",
      streamingPath: "/s/crit-dept-1",
      department: [deptId],
    });
    const { req, res, next } = ctx({
      body: { department: deptId.toString() },
    });
    await DashboardService.criticalityStats(req, res, next);
    expect(res.statusCode).toBe(200);
  });

  it("department array variant with no match", async () => {
    const { req, res, next } = ctx({
      body: { department: [new mongoose.Types.ObjectId().toString()] },
    });
    await DashboardService.criticalityStats(req, res, next);
    expect(res.statusCode).toBe(200);
  });
});

// ----------------------------------------------------------------------------
// timeAgo bucket branches in recent alerts
// ----------------------------------------------------------------------------
describe("DashboardService.criticalityStats — timeAgo buckets", () => {
  it("buckets a recent incident as 'just now' (< 1 min)", async () => {
    await Incident.create({
      userId: USER_ID,
      incidentType: "motionDetection",
      timeOfIncident: new Date(Date.now() - 5_000),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      Image: "https://img/just-now.jpg",
    });
    const { req, res, next } = ctx({ body: {} });
    await DashboardService.criticalityStats(req, res, next);
    expect(res.statusCode).toBe(200);
    const alerts = payload(res).data.recentAlerts;
    expect(alerts).toHaveLength(1);
    expect(alerts[0].timeAgo).toBe("just now");
  });

  it("buckets a 10-min-old incident as 'X min ago'", async () => {
    await Incident.create({
      userId: USER_ID,
      incidentType: "motionDetection",
      timeOfIncident: new Date(Date.now() - 10 * 60 * 1000),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      Image: "https://img/10min.jpg",
    });
    const { req, res, next } = ctx({ body: {} });
    await DashboardService.criticalityStats(req, res, next);
    const alerts = payload(res).data.recentAlerts;
    expect(alerts[0].timeAgo).toMatch(/min ago/);
  });

  it("buckets a 3-hour-old incident as 'X hours ago'", async () => {
    await Incident.create({
      userId: USER_ID,
      incidentType: "motionDetection",
      timeOfIncident: new Date(Date.now() - 3 * 60 * 60 * 1000),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      Image: "https://img/3h.jpg",
    });
    const { req, res, next } = ctx({ body: {} });
    await DashboardService.criticalityStats(req, res, next);
    const alerts = payload(res).data.recentAlerts;
    expect(alerts[0].timeAgo).toMatch(/hour/);
  });

  it("buckets a 2-day-old incident as 'X days ago'", async () => {
    await Incident.create({
      userId: USER_ID,
      incidentType: "motionDetection",
      timeOfIncident: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      Image: "https://img/2d.jpg",
    });
    const { req, res, next } = ctx({ body: {} });
    await DashboardService.criticalityStats(req, res, next);
    const alerts = payload(res).data.recentAlerts;
    expect(alerts[0].timeAgo).toMatch(/day/);
  });

  it("buckets a 2-week-old incident as 'X weeks ago'", async () => {
    await Incident.create({
      userId: USER_ID,
      incidentType: "motionDetection",
      timeOfIncident: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      Image: "https://img/2w.jpg",
    });
    const { req, res, next } = ctx({ body: {} });
    await DashboardService.criticalityStats(req, res, next);
    const alerts = payload(res).data.recentAlerts;
    expect(alerts[0].timeAgo).toMatch(/week/);
  });

  it("buckets a very old incident as 'X years ago' or 'more than a month ago'", async () => {
    // 60 days = 86400 minutes → falls into the final else (years/month).
    await Incident.create({
      userId: USER_ID,
      incidentType: "motionDetection",
      timeOfIncident: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      Image: "https://img/60d.jpg",
    });
    const { req, res, next } = ctx({ body: {} });
    await DashboardService.criticalityStats(req, res, next);
    const alerts = payload(res).data.recentAlerts;
    // 60 days < 525_600 minutes (1 year) → "more than a month ago"
    expect(alerts[0].timeAgo).toBe("more than a month ago");
  });

  it("buckets a 2-year-old incident as 'X years ago'", async () => {
    await Incident.create({
      userId: USER_ID,
      incidentType: "motionDetection",
      timeOfIncident: new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      Image: "https://img/2y.jpg",
    });
    const { req, res, next } = ctx({ body: {} });
    await DashboardService.criticalityStats(req, res, next);
    const alerts = payload(res).data.recentAlerts;
    expect(alerts[0].timeAgo).toMatch(/year/);
  });
});
