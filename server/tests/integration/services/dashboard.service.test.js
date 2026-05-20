/**
 * Integration test for DashboardService — the sidebar-config methods against
 * in-memory MongoDB. The heavy aggregation methods (headerStats,
 * criticalityStats, charts) are not exercised here.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

const { default: DashboardService } = await import(
  "../../../core/v1/dashboard/dashboard.service.js"
);
const { default: Admin } = await import(
  "../../../core/v1/admin/admin.model.js"
);
const { default: DashboardSidebar } = await import(
  "../../../core/v1/dashboard/dashboardSidebar.model.js"
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
    user_id: "1",
    login: "a",
    email: "a@test.com",
  });
});

describe("DashboardService.getSidebarConfig", () => {
  it("fails when the admin does not exist", async () => {
    const { req, res, next } = serviceCtx({
      adminId: new mongoose.Types.ObjectId(),
    });
    await DashboardService.getSidebarConfig(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("returns notFound when no sidebar config exists", async () => {
    const { req, res, next } = serviceCtx({ adminId: admin._id });
    await DashboardService.getSidebarConfig(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("returns the sidebar config when it exists", async () => {
    await DashboardSidebar.create({
      adminId: admin._id,
      detectionConfigs: [{ detectionType: "countPersons" }],
    });
    const { req, res, next } = serviceCtx({ adminId: admin._id });
    await DashboardService.getSidebarConfig(req, res, next);
    expect(payload(res).status).toBe("success");
  });
});

describe("DashboardService.updateSidebarConfig", () => {
  it("fails when the admin does not exist", async () => {
    const { req, res, next } = serviceCtx({
      adminId: new mongoose.Types.ObjectId(),
      body: { detectionConfigs: [] },
    });
    await DashboardService.updateSidebarConfig(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("returns notFound when no sidebar config exists", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: { detectionConfigs: [] },
    });
    await DashboardService.updateSidebarConfig(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("updates a detection config's isEnabled flag", async () => {
    await DashboardSidebar.create({
      adminId: admin._id,
      detectionConfigs: [
        { detectionType: "countPersons", isEnabled: false },
      ],
    });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: {
        detectionConfigs: [{ detectionType: "countPersons", isEnabled: true }],
      },
    });
    await DashboardService.updateSidebarConfig(req, res, next);
    expect(payload(res).status).toBe("success");
    const cfg = await DashboardSidebar.findOne({ adminId: admin._id });
    expect(cfg.detectionConfigs[0].isEnabled).toBe(true);
  });
});

describe("DashboardService.getIncidentsByType", () => {
  it("fails validation for an unknown incident type", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: "1",
      query: { incidentType: "notARealType" },
      body: {},
    });
    await DashboardService.getIncidentsByType(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("fails when admin does not exist", async () => {
    const { req, res, next } = serviceCtx({
      adminId: new mongoose.Types.ObjectId(),
      user_id: "1",
      query: { incidentType: "lineCrossing" },
      body: {},
    });
    await DashboardService.getIncidentsByType(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("returns matching incidents grouped + counted", async () => {
    await Incident.create({
      timeOfIncident: new Date("2024-01-15T10:00:00Z"),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: "1",
      incidentType: "lineCrossing",
      triggerNotification: false,
    });
    // Non-matching: different incident type
    await Incident.create({
      timeOfIncident: new Date("2024-01-15T10:01:00Z"),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: "1",
      incidentType: "motionDetection",
      triggerNotification: false,
    });

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: "1",
      query: { incidentType: "lineCrossing" },
      body: {},
    });
    await DashboardService.getIncidentsByType(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data.totalCount).toBe(1);
    expect(payload(res).data.incidentData).toHaveLength(1);
  });

  it("filters by startDate / endDate when provided", async () => {
    await Incident.create({
      timeOfIncident: new Date("2024-01-15T10:00:00Z"),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: "1",
      incidentType: "lineCrossing",
      triggerNotification: false,
    });
    await Incident.create({
      timeOfIncident: new Date("2023-12-01T10:00:00Z"),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: "1",
      incidentType: "lineCrossing",
      triggerNotification: false,
    });

    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: "1",
      query: { incidentType: "lineCrossing" },
      body: { startDate: "2024-01-01", endDate: "2024-01-31" },
    });
    await DashboardService.getIncidentsByType(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data.totalCount).toBe(1);
  });
});

describe("DashboardService.getDetections", () => {
  it("fails validation for an unknown detection type", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: "1",
      query: { detectionType: "bogus" },
      body: {},
    });
    await DashboardService.getDetections(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("fails when day=dateFilter without start/end", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: "1",
      query: { detectionType: "countPersons", day: "dateFilter" },
      body: {},
    });
    await DashboardService.getDetections(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("fails when startDate provided but day is not dateFilter", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: "1",
      query: { detectionType: "countPersons", day: "today" },
      body: { startDate: "2024-01-01", endDate: "2024-01-31" },
    });
    await DashboardService.getDetections(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("fails when admin does not exist", async () => {
    const { req, res, next } = serviceCtx({
      adminId: new mongoose.Types.ObjectId(),
      user_id: "1",
      query: { detectionType: "countPersons" },
      body: {},
    });
    await DashboardService.getDetections(req, res, next);
    expect(payload(res).status).toBe("failed");
  });
});

describe("DashboardService.recentIncidents", () => {
  it("fails when admin does not exist", async () => {
    const { req, res, next } = serviceCtx({
      adminId: new mongoose.Types.ObjectId(),
      user_id: "1",
      query: {},
    });
    await DashboardService.recentIncidents(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("succeeds with empty data when no sidebar config", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: "1",
      query: {},
    });
    await DashboardService.recentIncidents(req, res, next);
    expect(payload(res).status).toBe("success");
  });

  it("succeeds with empty data when no detection types enabled", async () => {
    await DashboardSidebar.create({
      adminId: admin._id,
      detectionConfigs: [
        { detectionType: "countPersons", isEnabled: false },
        { detectionType: "lineCrossing", isEnabled: false },
      ],
    });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: "1",
      query: {},
    });
    await DashboardService.recentIncidents(req, res, next);
    expect(payload(res).status).toBe("success");
  });
});
