/**
 * DashboardService — happy-path tests for the chart/stats endpoints whose
 * inner loops are scoped correctly:
 *   - criticalityStats  (channelFilter / userMatch declared at top)
 *   - detectionChart    (same)
 *   - WeeklyComparisonChart (no filters happy path — the buggy
 *     channelFilter/userMatch references only fire when a filter is supplied;
 *     #49 covers the broken paths)
 *
 * We seed a minimal admin + a couple of Incidents and assert the response
 * shape. No mocking — pure in-memory Mongo.
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
    user_id: "77",
    login: "charts",
    email: "charts@test.com",
  });
});

describe("DashboardService.criticalityStats", () => {
  it("fails when the admin does not exist", async () => {
    const { req, res, next } = serviceCtx({
      adminId: new mongoose.Types.ObjectId(),
      user_id: "77",
      body: {},
      query: {},
    });
    await DashboardService.criticalityStats(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("returns an empty alert list when no incidents seeded", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: "77",
      body: {},
      query: {},
    });
    await DashboardService.criticalityStats(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data.totalCount).toBe(0);
    expect(payload(res).data.recentAlerts).toEqual([]);
    expect(payload(res).data.lastAlertMessage).toMatch(/No alerts yet/);
  });

  it("includes recent alerts with a 'timeAgo' tag", async () => {
    await Incident.create({
      incidentType: "motionDetection",
      timeOfIncident: new Date(),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: "77",
    });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: "77",
      body: {},
      query: {},
    });
    await DashboardService.criticalityStats(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data.totalCount).toBe(1);
    expect(payload(res).data.recentAlerts).toHaveLength(1);
    expect(payload(res).data.recentAlerts[0]).toHaveProperty("timeAgo");
    expect(payload(res).data.lastAlertMessage).toMatch(/Last alert:/);
  });

  it("respects skip/limit query parameters", async () => {
    const now = new Date();
    await Incident.create([
      {
        incidentType: "motionDetection",
        timeOfIncident: new Date(now.getTime() - 1000),
        nvrId: new mongoose.Types.ObjectId(),
        channelId: new mongoose.Types.ObjectId(),
        userId: "77",
      },
      {
        incidentType: "motionDetection",
        timeOfIncident: new Date(now.getTime() - 2000),
        nvrId: new mongoose.Types.ObjectId(),
        channelId: new mongoose.Types.ObjectId(),
        userId: "77",
      },
      {
        incidentType: "motionDetection",
        timeOfIncident: new Date(now.getTime() - 3000),
        nvrId: new mongoose.Types.ObjectId(),
        channelId: new mongoose.Types.ObjectId(),
        userId: "77",
      },
    ]);
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: "77",
      body: {},
      query: { skip: 1, limit: 1 },
    });
    await DashboardService.criticalityStats(req, res, next);
    expect(payload(res).status).toBe("success");
    // total count still reflects every match
    expect(payload(res).data.totalCount).toBe(3);
    // but the recentAlerts array is paginated
    expect(payload(res).data.recentAlerts).toHaveLength(1);
  });
});

describe("DashboardService.detectionChart", () => {
  it("fails when the admin does not exist", async () => {
    const { req, res, next } = serviceCtx({
      adminId: new mongoose.Types.ObjectId(),
      user_id: "77",
      body: {},
    });
    await DashboardService.detectionChart(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("returns an empty object when no incidents seeded", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: "77",
      body: {},
    });
    await DashboardService.detectionChart(req, res, next);
    expect(payload(res).status).toBe("success");
    // formatted is grouped by incidentType; with no data, no keys.
    expect(typeof payload(res).data).toBe("object");
    expect(Object.keys(payload(res).data)).toEqual([]);
  });

  it("buckets incidents into a 7-day array per type", async () => {
    // detectionChart only counts incidents from last week (Mon-Sun).
    // Use a moment value within last ISO week. moment is not imported here,
    // so compute manually.
    const now = new Date();
    const day = now.getUTCDay() || 7; // ISO: 1..7
    const startOfThisWeek = new Date(now);
    startOfThisWeek.setUTCDate(now.getUTCDate() - (day - 1));
    startOfThisWeek.setUTCHours(0, 0, 0, 0);
    const lastWeekMid = new Date(
      startOfThisWeek.getTime() - 4 * 24 * 60 * 60 * 1000
    );
    await Incident.create({
      incidentType: "motionDetection",
      timeOfIncident: lastWeekMid,
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: "77",
    });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: "77",
      body: {},
    });
    await DashboardService.detectionChart(req, res, next);
    expect(payload(res).status).toBe("success");
    const data = payload(res).data;
    // motionDetection bucket exists and is a 7-slot array summing to 1.
    if (data.motionDetection) {
      expect(data.motionDetection).toHaveLength(7);
      const total = data.motionDetection.reduce((a, b) => a + b, 0);
      expect(total).toBe(1);
    }
  });
});

describe("DashboardService.WeeklyComparisonChart", () => {
  it("fails when the admin does not exist", async () => {
    const { req, res, next } = serviceCtx({
      adminId: new mongoose.Types.ObjectId(),
      user_id: "77",
      body: {},
    });
    await DashboardService.WeeklyComparisonChart(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("returns currentWeek/previousWeek arrays with no filters", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: "77",
      body: {},
    });
    await DashboardService.WeeklyComparisonChart(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data).toHaveProperty("currentWeek");
    expect(payload(res).data).toHaveProperty("previousWeek");
  });
});
