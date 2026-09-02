/**
 * VideoRecordsService.getLiveDemoAnalytics — the admin-scoped Live Demo
 * analytics rollup.
 *
 * Exercised against the real in-memory Mongo because the interesting parts are
 * all aggregation: the $objectToArray facet that turns the LiveDemo.detections
 * map into per-detection run counts, the incidentType lookup (settingType ->
 * discriminator), and the two separate event sources — incidents for every
 * engine, access-log sessions for Face Recognition/attendance.
 *
 * The rule under test throughout: only `liveDemoData: true` rows count, and
 * only rows belonging to the requesting admin.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

vi.mock("../../../socket.js", () => ({
  sendPayloadToUser: vi.fn().mockResolvedValue(undefined),
}));

const { default: VideoRecordsService } = await import(
  "../../../core/v2/videoRecords/videoRecords.service.js"
);
const { default: LiveDemo } = await import(
  "../../../core/v2/videoRecords/videoRecords.model.js"
);
const { default: Admin } = await import("../../../core/v1/admin/admin.model.js");
const { Incident } = await import("../../../core/v1/incidents/incidents.model.js");
const { default: OptimizedAccessLogs } = await import(
  "../../../core/v1/accesslogs/newAccessLogs.model.js"
);

const OWNER_USER_ID = "9001";

let admin;
let otherAdmin;

const makeRecord = (adminId, detections, extra = {}) =>
  LiveDemo.create({
    videos: [{ videoUrl: "uploads/videos/clip.mp4" }],
    adminId,
    userId: adminId,
    plan: { name: "trial", expiryDate: new Date("2030-01-01") },
    detections,
    ...extra,
  });

const makeIncident = (overrides = {}) =>
  Incident.create({
    incidentType: "crowdDetection",
    timeOfIncident: new Date("2026-08-10T10:00:00Z"),
    userId: OWNER_USER_ID,
    nvrId: new mongoose.Types.ObjectId(),
    channelId: new mongoose.Types.ObjectId(),
    liveDemoData: true,
    ...overrides,
  });

const makeAccessLog = (overrides = {}) =>
  OptimizedAccessLogs.create({
    admin: admin._id,
    liveDemoData: true,
    sessions: [
      {
        nvr: new mongoose.Types.ObjectId(),
        channel: new mongoose.Types.ObjectId(),
        personName: "Asha",
        confidenceScore: 0.91,
        timestamp: new Date("2026-08-10T09:00:00Z"),
      },
    ],
    ...overrides,
  });

const run = async (body = {}, asAdmin = admin) => {
  const { req, res, next } = serviceCtx({ adminId: asAdmin._id, body });
  await VideoRecordsService.getLiveDemoAnalytics(req, res, next);
  return { res, data: payload(res)?.data, body: payload(res) };
};

const rowFor = (data, settingType) =>
  data.byDetection.find((row) => row.settingType === settingType);

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
  admin = await Admin.create({
    user_id: OWNER_USER_ID,
    login: "demo-admin",
    email: "demo@test.com",
  });
  otherAdmin = await Admin.create({
    user_id: "9002",
    login: "other-admin",
    email: "other@test.com",
  });
});

describe("getLiveDemoAnalytics — scoping", () => {
  it("rejects an unknown detection type instead of silently returning zeros", async () => {
    const { res } = await run({ detectionTypes: ["notARealDetection"] });
    expect(res.statusCode).toBe(400);
  });

  it("404s when the session's admin no longer exists", async () => {
    const ghost = { _id: new mongoose.Types.ObjectId() };
    const { res } = await run({}, ghost);
    expect(res.statusCode).toBe(404);
  });

  it("counts only the requesting admin's demo records", async () => {
    await makeRecord(admin._id, { attendanceSettings: true });
    await makeRecord(otherAdmin._id, { attendanceSettings: true });

    const { data } = await run({ detectionTypes: ["attendanceSettings"] });
    expect(data.demosRun).toBe(1);
  });

  it("ignores real (non-demo) incidents", async () => {
    await makeRecord(admin._id, { crowdDetectionSettings: true });
    await makeIncident({ liveDemoData: true });
    await makeIncident({ liveDemoData: false });

    const { data } = await run({ detectionTypes: ["crowdDetectionSettings"] });
    expect(data.eventsDetected).toBe(1);
  });

  it("ignores another admin's demo incidents", async () => {
    await makeRecord(admin._id, { crowdDetectionSettings: true });
    await makeIncident({ userId: OWNER_USER_ID });
    await makeIncident({ userId: "9002" });

    const { data } = await run({ detectionTypes: ["crowdDetectionSettings"] });
    expect(data.eventsDetected).toBe(1);
  });
});

describe("getLiveDemoAnalytics — detection filtering", () => {
  it("counts runs off the detections map, not off every record", async () => {
    await makeRecord(admin._id, { crowdDetectionSettings: true });
    await makeRecord(admin._id, { crowdDetectionSettings: true });
    await makeRecord(admin._id, { doorDetectionSettings: true });

    const { data } = await run({ detectionTypes: ["crowdDetectionSettings"] });
    expect(data.demosRun).toBe(2);
    expect(rowFor(data, "crowdDetectionSettings").runs).toBe(2);
  });

  it("maps settingType to the incident discriminator", async () => {
    await makeRecord(admin._id, { crowdDetectionSettings: true });
    await makeIncident({ incidentType: "crowdDetection" });
    await makeIncident({ incidentType: "doorDetection", currentStatus: "OPEN" });

    const { data } = await run({ detectionTypes: ["crowdDetectionSettings"] });
    expect(data.eventsDetected).toBe(1);
    expect(rowFor(data, "crowdDetectionSettings").incidentType).toBe("crowdDetection");
  });

  it("resolves Table Occupancy despite the TYPE_MAP drift", async () => {
    // TYPE_MAP says "tableOccupancySettings"; the discriminator is
    // "tableOccupancyDetection". Matching the TYPE_MAP value would give 0.
    await makeRecord(admin._id, { tableOccupancyDetectionSettings: true });
    await makeIncident({ incidentType: "tableOccupancyDetection", count: 3 });

    const { data } = await run({ detectionTypes: ["tableOccupancyDetectionSettings"] });
    expect(data.eventsDetected).toBe(1);
  });

  it("accepts several detection types in one array", async () => {
    await makeRecord(admin._id, { crowdDetectionSettings: true });
    await makeRecord(admin._id, { loiteringDetectionSettings: true });
    await makeIncident({ incidentType: "crowdDetection" });
    await makeIncident({ incidentType: "loiteringDetection" });

    const { data } = await run({
      detectionTypes: ["crowdDetectionSettings", "loiteringDetectionSettings"],
    });
    expect(data.demosRun).toBe(2);
    expect(data.eventsDetected).toBe(2);
    expect(data.detectionsTested).toBe(2);
  });

  it("still accepts a comma-separated string, and the settingType alias", async () => {
    await makeRecord(admin._id, { crowdDetectionSettings: true });
    await makeRecord(admin._id, { loiteringDetectionSettings: true });

    const csv = await run({
      detectionTypes: "crowdDetectionSettings,loiteringDetectionSettings",
    });
    expect(csv.data.demosRun).toBe(2);

    const alias = await run({ settingType: "crowdDetectionSettings" });
    expect(alias.data.demosRun).toBe(1);
  });

  it("reports every tested detection when no detection type is given", async () => {
    await makeRecord(admin._id, { crowdDetectionSettings: true, doorDetectionSettings: true });
    await makeIncident({ incidentType: "crowdDetection" });

    const { data } = await run();
    expect(data.demosRun).toBe(1);
    expect(data.detectionsTested).toBe(2);
    expect(rowFor(data, "doorDetectionSettings").events).toBe(0);
  });
});

describe("getLiveDemoAnalytics — search", () => {
  it("matches on the detection's display name", async () => {
    await makeRecord(admin._id, { crowdDetectionSettings: true, doorDetectionSettings: true });

    // "Crowd Detection" is the display name; the key is crowdDetectionSettings.
    const { data } = await run({ search: "crowd" });
    expect(data.byDetection.map((row) => row.settingType)).toEqual(["crowdDetectionSettings"]);
  });

  it("matches on the settingType key too", async () => {
    await makeRecord(admin._id, { crowdDetectionSettings: true, doorDetectionSettings: true });

    const { data } = await run({ search: "doorDetectionSettings" });
    expect(data.byDetection.map((row) => row.settingType)).toEqual(["doorDetectionSettings"]);
  });

  it("can match several detections at once", async () => {
    await makeRecord(admin._id, {
      vehicleDetectionSettings: true,
      vehicleTypeDetectionSettings: true,
      crowdDetectionSettings: true,
    });

    const { data } = await run({ search: "vehicle" });
    const found = data.byDetection.map((row) => row.settingType).sort();
    expect(found).toContain("vehicleDetectionSettings");
    expect(found).toContain("vehicleTypeDetectionSettings");
    expect(found).not.toContain("crowdDetectionSettings");
  });

  it("narrows the totals, not just the rows", async () => {
    await makeRecord(admin._id, { crowdDetectionSettings: true });
    await makeRecord(admin._id, { doorDetectionSettings: true });
    await makeIncident({ incidentType: "crowdDetection" });
    await makeIncident({ incidentType: "doorDetection", currentStatus: "OPEN" });

    const { data } = await run({ search: "crowd" });
    expect(data.demosRun).toBe(1);
    expect(data.eventsDetected).toBe(1);
    expect(data.detectionsTested).toBe(1);
  });

  it("intersects with an explicit detectionTypes list", async () => {
    await makeRecord(admin._id, { crowdDetectionSettings: true, doorDetectionSettings: true });

    const { data } = await run({
      detectionTypes: ["crowdDetectionSettings", "doorDetectionSettings"],
      search: "door",
    });
    expect(data.byDetection.map((row) => row.settingType)).toEqual(["doorDetectionSettings"]);
  });

  it("returns an empty result when the search matches nothing", async () => {
    await makeRecord(admin._id, { crowdDetectionSettings: true });
    await makeIncident({ incidentType: "crowdDetection" });

    const { res, data } = await run({ search: "zzzznotadetection" });
    expect(res.statusCode).toBe(200);
    expect(data.byDetection).toEqual([]);
    expect(data.demosRun).toBe(0);
    expect(data.eventsDetected).toBe(0);
  });

  it("finds Face Recognition by its 'attendance' key", async () => {
    await makeRecord(admin._id, { attendanceSettings: true });
    await makeAccessLog();

    const { data } = await run({ search: "attendance" });
    expect(data.eventsDetected).toBe(1);
    expect(rowFor(data, "attendanceSettings").source).toBe("accessLogs");
  });
});

describe("getLiveDemoAnalytics — Face Recognition reads the access logs", () => {
  it("counts access-log sessions as attendance events", async () => {
    await makeRecord(admin._id, { attendanceSettings: true });
    await makeAccessLog();
    await makeAccessLog();

    const { data } = await run({ detectionTypes: ["attendanceSettings"] });
    expect(data.eventsDetected).toBe(2);
    expect(rowFor(data, "attendanceSettings").source).toBe("accessLogs");
  });

  it("ignores real attendance logs", async () => {
    await makeRecord(admin._id, { attendanceSettings: true });
    await makeAccessLog({ liveDemoData: true });
    await makeAccessLog({ liveDemoData: false });

    const { data } = await run({ detectionTypes: ["attendanceSettings"] });
    expect(data.eventsDetected).toBe(1);
  });

  it("normalizes the 0-1 face confidence to a percentage", async () => {
    await makeRecord(admin._id, { attendanceSettings: true });
    await makeAccessLog();

    const { data } = await run({ detectionTypes: ["attendanceSettings"] });
    expect(data.avgConfidence).toBe(91);
  });

  it("reports distinct people recognized", async () => {
    await makeRecord(admin._id, { attendanceSettings: true });
    await makeAccessLog();
    await makeAccessLog({
      sessions: [
        {
          nvr: new mongoose.Types.ObjectId(),
          channel: new mongoose.Types.ObjectId(),
          personName: "Ravi",
          confidenceScore: 0.8,
          timestamp: new Date("2026-08-10T09:30:00Z"),
        },
      ],
    });

    const { data } = await run({ detectionTypes: ["attendanceSettings"] });
    expect(rowFor(data, "attendanceSettings").peopleRecognized).toBe(2);
  });
});

describe("getLiveDemoAnalytics — confidence and DS counters", () => {
  it("averages the incident percentages as-is", async () => {
    await makeRecord(admin._id, { crowdDetectionSettings: true });
    await makeIncident({ ConfidenceScoreInPercentage: 80 });
    await makeIncident({ ConfidenceScoreInPercentage: 90 });

    const { data } = await run({ detectionTypes: ["crowdDetectionSettings"] });
    expect(data.avgConfidence).toBe(85);
  });

  it("excludes events with no confidence from the average", async () => {
    await makeRecord(admin._id, { crowdDetectionSettings: true });
    await makeIncident({ ConfidenceScoreInPercentage: 90 });
    await makeIncident({ ConfidenceScoreInPercentage: null });

    const { data } = await run({ detectionTypes: ["crowdDetectionSettings"] });
    expect(data.eventsDetected).toBe(2);
    expect(data.avgConfidence).toBe(90);
  });

  it("reports the DS-written counters separately from the derived ones", async () => {
    await makeRecord(
      admin._id,
      { crowdDetectionSettings: true },
      { sessionAnalytics: { demosRun: 5, eventsDetected: 42 } }
    );
    await makeIncident();

    const { data } = await run({ detectionTypes: ["crowdDetectionSettings"] });
    expect(data.demosRun).toBe(1);
    expect(data.eventsDetected).toBe(1);
    expect(data.reportedByDs).toEqual({ demosRun: 5, eventsDetected: 42 });
  });
});

describe("getLiveDemoAnalytics — date window", () => {
  it("keeps only events inside the requested range", async () => {
    await makeRecord(admin._id, { crowdDetectionSettings: true });
    await makeIncident({ timeOfIncident: new Date("2026-08-10T10:00:00Z") });
    await makeIncident({ timeOfIncident: new Date("2026-07-01T10:00:00Z") });

    const { data } = await run({
      detectionTypes: ["crowdDetectionSettings"],
      startDate: "2026-08-01",
      endDate: "2026-08-31",
    });
    expect(data.eventsDetected).toBe(1);
  });
});
