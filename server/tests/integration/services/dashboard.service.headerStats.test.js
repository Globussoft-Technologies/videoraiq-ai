/**
 * DashboardService.headerStats — happy path tests with NO filters or with
 * filters that don't trip the #49 `channelFilter`/`userMatch` scoping bug.
 *
 * headerStats only crashes (#49) when filter branches run after the
 * `channelFilter` const is declared, i.e. for `nvrId`/`channelId` paths in
 * downstream methods. headerStats' own `channelFilter` is declared at the top
 * of the function and updated in-place, so the simple no-filter path and the
 * checkInOrCheckOutCamera branches are safe.
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
    user_id: "88",
    login: "header",
    email: "header@test.com",
  });
});

describe("DashboardService.headerStats", () => {
  it("fails when the admin does not exist", async () => {
    const { req, res, next } = serviceCtx({
      adminId: new mongoose.Types.ObjectId(),
      user_id: "88",
      body: {},
    });
    await DashboardService.headerStats(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("returns all-zero stats when no incidents / channels exist", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: "88",
      body: {},
    });
    await DashboardService.headerStats(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data).toEqual({
      activeCameras: 0,
      overAllCameraCount: 0,
      incidentsResolved: 0,
      totalAlerts: 0,
      criticalAlerts: 0,
    });
  });

  it("counts seeded incidents (totalAlerts) without filters", async () => {
    await Incident.create([
      {
        userId: "88",
        incidentType: "motionDetection",
        timeOfIncident: new Date(),
        nvrId: new mongoose.Types.ObjectId(),
        channelId: new mongoose.Types.ObjectId(),
        Image: "https://img/1.jpg",
      },
      {
        userId: "88",
        incidentType: "motionDetection",
        timeOfIncident: new Date(),
        nvrId: new mongoose.Types.ObjectId(),
        channelId: new mongoose.Types.ObjectId(),
        Image: "https://img/2.jpg",
        severity: "high",
      },
    ]);
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: "88",
      body: {},
    });
    await DashboardService.headerStats(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data.totalAlerts).toBe(2);
    expect(payload(res).data.criticalAlerts).toBe(1);
  });

  it("counts only resolved incidents under incidentsResolved", async () => {
    await Incident.create([
      {
        userId: "88",
        incidentType: "motionDetection",
        timeOfIncident: new Date(),
        nvrId: new mongoose.Types.ObjectId(),
        channelId: new mongoose.Types.ObjectId(),
        Image: "https://img/1.jpg",
        resolved: true,
      },
      {
        userId: "88",
        incidentType: "motionDetection",
        timeOfIncident: new Date(),
        nvrId: new mongoose.Types.ObjectId(),
        channelId: new mongoose.Types.ObjectId(),
        Image: "https://img/2.jpg",
        resolved: false,
      },
    ]);
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: "88",
      body: {},
    });
    await DashboardService.headerStats(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data.incidentsResolved).toBe(1);
  });

  it("applies startDate/endDate filter to the incident counts", async () => {
    await Incident.create([
      {
        userId: "88",
        incidentType: "motionDetection",
        timeOfIncident: new Date("2024-01-15T10:00:00Z"),
        nvrId: new mongoose.Types.ObjectId(),
        channelId: new mongoose.Types.ObjectId(),
        Image: "https://img/1.jpg",
      },
      {
        userId: "88",
        incidentType: "motionDetection",
        timeOfIncident: new Date("2023-06-15T10:00:00Z"),
        nvrId: new mongoose.Types.ObjectId(),
        channelId: new mongoose.Types.ObjectId(),
        Image: "https://img/2.jpg",
      },
    ]);
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: "88",
      body: { startDate: "2024-01-01", endDate: "2024-01-31" },
    });
    await DashboardService.headerStats(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data.totalAlerts).toBe(1);
  });

  it("excludes countPersons / lineCrossing from totalAlerts via userMatch", async () => {
    await Incident.create([
      {
        userId: "88",
        incidentType: "motionDetection",
        timeOfIncident: new Date(),
        nvrId: new mongoose.Types.ObjectId(),
        channelId: new mongoose.Types.ObjectId(),
        Image: "https://img/1.jpg",
      },
      {
        userId: "88",
        incidentType: "countPersons",
        timeOfIncident: new Date(),
        nvrId: new mongoose.Types.ObjectId(),
        channelId: new mongoose.Types.ObjectId(),
        Image: "https://img/2.jpg",
      },
      {
        userId: "88",
        incidentType: "lineCrossing",
        timeOfIncident: new Date(),
        nvrId: new mongoose.Types.ObjectId(),
        channelId: new mongoose.Types.ObjectId(),
        Image: "https://img/3.jpg",
      },
    ]);
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: "88",
      body: {},
    });
    await DashboardService.headerStats(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data.totalAlerts).toBe(1);
  });

  it("counts active cameras (channels with any detection setting enabled)", async () => {
    await Channel.create([
      {
        userId: "88",
        channelName: "cam-active",
        channelId: 1,
        nvrId: new mongoose.Types.ObjectId(),
        localChannelId: "lc-1",
        streamingPath: "/s1",
        isAdded: true,
        detections: {
          motionDetectionSettings: { enabled: true },
        },
      },
      {
        userId: "88",
        channelName: "cam-idle",
        channelId: 2,
        nvrId: new mongoose.Types.ObjectId(),
        localChannelId: "lc-2",
        streamingPath: "/s2",
        isAdded: true,
        detections: {
          motionDetectionSettings: { enabled: false },
        },
      },
    ]);
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: "88",
      body: {},
    });
    await DashboardService.headerStats(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data.activeCameras).toBe(1);
    expect(payload(res).data.overAllCameraCount).toBe(2);
  });

  it("filters by reportStatus when supplied (truthy report.status)", async () => {
    await Incident.create([
      {
        userId: "88",
        incidentType: "motionDetection",
        timeOfIncident: new Date(),
        nvrId: new mongoose.Types.ObjectId(),
        channelId: new mongoose.Types.ObjectId(),
        Image: "https://img/1.jpg",
        report: { status: true },
      },
      {
        userId: "88",
        incidentType: "motionDetection",
        timeOfIncident: new Date(),
        nvrId: new mongoose.Types.ObjectId(),
        channelId: new mongoose.Types.ObjectId(),
        Image: "https://img/2.jpg",
        report: { status: false },
      },
    ]);
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: "88",
      body: { reportStatus: true },
    });
    await DashboardService.headerStats(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data.totalAlerts).toBe(1);
  });

  it("narrows by incidentTypeFilter when supplied", async () => {
    // Use only base-discriminator incident types to avoid extra discriminator
    // dependency. "motionDetection" is a discriminator, but it's registered
    // by the existing incidents tests; sticking to that single type to test
    // the $nin/$in filter logic.
    await Incident.create([
      {
        userId: "88",
        incidentType: "motionDetection",
        timeOfIncident: new Date(),
        nvrId: new mongoose.Types.ObjectId(),
        channelId: new mongoose.Types.ObjectId(),
        Image: "https://img/1.jpg",
      },
    ]);
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: "88",
      body: { incidentTypeFilter: ["motionDetection"] },
    });
    await DashboardService.headerStats(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data.totalAlerts).toBe(1);
  });

  it("narrows by incidentTypeFilter excluding non-matching types", async () => {
    await Incident.create([
      {
        userId: "88",
        incidentType: "motionDetection",
        timeOfIncident: new Date(),
        nvrId: new mongoose.Types.ObjectId(),
        channelId: new mongoose.Types.ObjectId(),
        Image: "https://img/1.jpg",
      },
    ]);
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: "88",
      body: { incidentTypeFilter: ["crowdDetection"] },
    });
    await DashboardService.headerStats(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data.totalAlerts).toBe(0);
  });

  it("ignores incidents without an Image (userMatch requires Image to exist)", async () => {
    await Incident.create([
      {
        userId: "88",
        incidentType: "motionDetection",
        timeOfIncident: new Date(),
        nvrId: new mongoose.Types.ObjectId(),
        channelId: new mongoose.Types.ObjectId(),
        Image: "https://img/1.jpg",
      },
      {
        userId: "88",
        incidentType: "motionDetection",
        timeOfIncident: new Date(),
        nvrId: new mongoose.Types.ObjectId(),
        channelId: new mongoose.Types.ObjectId(),
        Image: "",
      },
    ]);
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: "88",
      body: {},
    });
    await DashboardService.headerStats(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data.totalAlerts).toBe(1);
  });
});
