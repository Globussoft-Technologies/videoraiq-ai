/**
 * DashboardService.getDetections — branch coverage for the day=yesterday
 * filter, day=dateFilter (custom date range with $unwind timeSeries), and the
 * fallback "Invalid filter combination" path. The day=today path and the
 * early validation guards are covered by dashboard.service.detections.test.js.
 *
 * Mocks: 0
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

const USER_ID = "43";
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
    login: "det",
    email: "det@test.com",
  });
});

function ctx(overrides = {}) {
  return serviceCtx({
    adminId: admin._id,
    user_id: USER_ID,
    body: {},
    query: {},
    ...overrides,
  });
}

describe("DashboardService.getDetections — day=yesterday", () => {
  it("returns grouped detections for yesterday", async () => {
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    yesterday.setUTCHours(12, 0, 0, 0);
    await Incident.create({
      incidentType: "countPersons",
      timeOfIncident: yesterday,
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: USER_ID,
      count: 5,
    });
    // Also seed a today-incident that should be excluded.
    await Incident.create({
      incidentType: "countPersons",
      timeOfIncident: new Date(),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: USER_ID,
      count: 99,
    });
    const { req, res, next } = ctx({
      query: { detectionType: "countPersons", day: "yesterday" },
    });
    await DashboardService.getDetections(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data.totalCount).toBe(1);
    expect(payload(res).data.incidentData).toHaveLength(1);
  });
});

describe("DashboardService.getDetections — day=dateFilter", () => {
  it("returns grouped detections with timeSeries unwound", async () => {
    const inWindow = new Date("2024-06-15T10:00:00.000Z");
    await Incident.create({
      incidentType: "countPersons",
      timeOfIncident: inWindow,
      createdAt: inWindow,
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: USER_ID,
      timeSeries: [
        { timestamp: inWindow, count: 3, objectsDetected: 3 },
        { timestamp: inWindow, count: 5, objectsDetected: 5 },
      ],
    });
    // Outside the window — should be excluded.
    await Incident.create({
      incidentType: "countPersons",
      timeOfIncident: new Date("2023-01-01T00:00:00.000Z"),
      createdAt: new Date("2023-01-01T00:00:00.000Z"),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: USER_ID,
      timeSeries: [{ timestamp: new Date("2023-01-01"), count: 1 }],
    });
    const { req, res, next } = ctx({
      query: { detectionType: "countPersons", day: "dateFilter" },
      body: { startDate: "2024-01-01", endDate: "2024-12-31" },
    });
    await DashboardService.getDetections(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data.totalCount).toBe(2);
    expect(payload(res).data.detectionData).toHaveLength(2);
  });

  it("returns 0/empty when no incidents match the date window", async () => {
    const { req, res, next } = ctx({
      query: { detectionType: "lineCrossing", day: "dateFilter" },
      body: { startDate: "2024-01-01", endDate: "2024-12-31" },
    });
    await DashboardService.getDetections(req, res, next);
    expect(payload(res).status).toBe("success");
    expect(payload(res).data.totalCount).toBe(0);
    expect(payload(res).data.detectionData).toEqual([]);
  });
});

describe("DashboardService.getDetections — invalid filter combo", () => {
  it("returns the fallback validation failure when day is unknown and no dates supplied", async () => {
    const { req, res, next } = ctx({
      query: { detectionType: "countPersons", day: "lastWeek" },
    });
    await DashboardService.getDetections(req, res, next);
    expect(payload(res).status).toBe("failed");
    expect(payload(res).message).toMatch(/Invalid filter combination/);
  });
});
