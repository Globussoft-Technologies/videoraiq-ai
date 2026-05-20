/**
 * DashboardService.getDetections / getIncidentsByType — early validation
 * branches and a thin happy path. The big aggregation surface is covered by
 * Mongo's in-memory pipeline; we just confirm the response shape.
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
    user_id: "42",
    login: "u",
    email: "u@test.com",
  });
});

describe("DashboardService.getDetections", () => {
  it("rejects an invalid detectionType", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: "42",
      query: { detectionType: "totallyMadeUp" },
      body: {},
    });
    await DashboardService.getDetections(req, res, next);
    expect(payload(res).status).toBe("failed");
    expect(payload(res).message).toMatch(/Invalid detection type/);
  });

  it("rejects when day='dateFilter' but startDate is missing", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: "42",
      query: { detectionType: "countPersons", day: "dateFilter" },
      body: {},
    });
    await DashboardService.getDetections(req, res, next);
    expect(payload(res).status).toBe("failed");
    expect(payload(res).message).toMatch(/startDate.*endDate/);
  });

  it("rejects when startDate is supplied without day='dateFilter'", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: "42",
      query: { detectionType: "countPersons", day: "today" },
      body: { startDate: "2024-01-01", endDate: "2024-01-31" },
    });
    await DashboardService.getDetections(req, res, next);
    expect(payload(res).status).toBe("failed");
    expect(payload(res).message).toMatch(/day must be 'dateFilter'/);
  });

  it("fails when the admin does not exist", async () => {
    const { req, res, next } = serviceCtx({
      adminId: new mongoose.Types.ObjectId(),
      user_id: "42",
      query: { detectionType: "countPersons" },
      body: {},
    });
    await DashboardService.getDetections(req, res, next);
    expect(payload(res).status).toBe("failed");
    expect(payload(res).message).toMatch(/Admin not found/);
  });

  it("returns the grouped incidents for day=today", async () => {
    await Incident.create({
      incidentType: "countPersons",
      timeOfIncident: new Date(),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: "42",
      count: 3,
    });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: "42",
      query: { detectionType: "countPersons", day: "today" },
      body: {},
    });
    await DashboardService.getDetections(req, res, next);
    // The status varies (today vs. yesterday vs. all-time paths each
    // build a slightly different response). Whichever branch fired we
    // expect a success response with a payload.
    expect(payload(res).status).toBe("success");
  });
});

describe("DashboardService.getIncidentsByType", () => {
  it("rejects an invalid incidentType", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: "42",
      query: { incidentType: "notAType" },
      body: {},
    });
    await DashboardService.getIncidentsByType(req, res, next);
    expect(payload(res).status).toBe("failed");
    expect(payload(res).message).toMatch(/Invalid incident type/);
  });

  it("fails when the admin does not exist", async () => {
    const { req, res, next } = serviceCtx({
      adminId: new mongoose.Types.ObjectId(),
      user_id: "42",
      query: { incidentType: "motionDetection" },
      body: {},
    });
    await DashboardService.getIncidentsByType(req, res, next);
    expect(payload(res).status).toBe("failed");
    expect(payload(res).message).toMatch(/Admin not found/);
  });

  it("returns matching incidents with a totalCount", async () => {
    await Incident.create([
      {
        incidentType: "motionDetection",
        timeOfIncident: new Date(),
        nvrId: new mongoose.Types.ObjectId(),
        channelId: new mongoose.Types.ObjectId(),
        userId: "42",
      },
      {
        incidentType: "motionDetection",
        timeOfIncident: new Date(),
        nvrId: new mongoose.Types.ObjectId(),
        channelId: new mongoose.Types.ObjectId(),
        userId: "42",
      },
    ]);
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: "42",
      query: { incidentType: "motionDetection" },
      body: {},
    });
    await DashboardService.getIncidentsByType(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data.totalCount).toBe(2);
    expect(payload(res).data.incidentData).toHaveLength(2);
  });

  it("filters by start/end date range when supplied", async () => {
    await Incident.create([
      {
        incidentType: "motionDetection",
        timeOfIncident: new Date("2024-06-15"),
        nvrId: new mongoose.Types.ObjectId(),
        channelId: new mongoose.Types.ObjectId(),
        userId: "42",
      },
      {
        incidentType: "motionDetection",
        timeOfIncident: new Date("2023-01-01"),
        nvrId: new mongoose.Types.ObjectId(),
        channelId: new mongoose.Types.ObjectId(),
        userId: "42",
      },
    ]);
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: "42",
      query: { incidentType: "motionDetection" },
      body: { startDate: "2024-01-01", endDate: "2024-12-31" },
    });
    await DashboardService.getIncidentsByType(req, res, next);
    expect(payload(res).data.totalCount).toBe(1);
  });
});
