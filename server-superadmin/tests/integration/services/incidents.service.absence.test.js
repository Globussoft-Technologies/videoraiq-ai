/**
 * IncidentsService — deskAbsenceData / guardAbsenceData
 *
 * Both methods aggregate `deskAbsence` / `guardAbsence` incidents, lookup
 * nvr/channel/department, group by channelId, compute presence/absence times.
 * No external deps (apart from the standard mock cascade other incident tests
 * already use), so this is pure DB+aggregation coverage.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

// Standard mocks — alert.events.js / socket / SFTP / jobs are pulled in via
// the service tree and don't matter for read-side methods.
vi.mock("../../../core/v1/alerts/alert.events.js", () => ({
  triggerAlertOnIncident: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../socket.js", () => ({
  sendPayloadToUser: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../utils/newSFTPConnectionCheck.js", () => ({
  connectSFTP: vi.fn().mockResolvedValue({
    exists: vi.fn().mockResolvedValue(false),
    delete: vi.fn().mockResolvedValue(undefined),
    end: vi.fn().mockResolvedValue(undefined),
  }),
}));
vi.mock("../../../core/v1/jobs/jobs.service.js", () => ({
  default: { handleProfileNotification: vi.fn().mockResolvedValue(false) },
}));

const { default: IncidentsService } = await import(
  "../../../core/v1/incidents/incidents.service.js"
);
const { default: Admin } = await import(
  "../../../core/v1/admin/admin.model.js"
);
const { Incident } = await import(
  "../../../core/v1/incidents/incidents.model.js"
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
    user_id: "10",
    login: "abs",
    email: "abs@test.com",
  });
});

// ---------------------------------------------------------------------------
// deskAbsenceData
// ---------------------------------------------------------------------------
describe("IncidentsService.deskAbsenceData", () => {
  it("returns 'failed' when user_id is missing", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: { date: new Date().toISOString() },
      query: {},
    });
    await IncidentsService.deskAbsenceData(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("returns 'failed' when admin does not exist", async () => {
    const { req, res, next } = serviceCtx({
      adminId: new mongoose.Types.ObjectId(),
      user_id: "10",
      body: { date: new Date().toISOString() },
      query: {},
    });
    await IncidentsService.deskAbsenceData(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("returns 200 with empty result when no incidents", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: "10",
      body: { date: new Date().toISOString() },
      query: {},
    });
    await IncidentsService.deskAbsenceData(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.totalCount).toBe(0);
    expect(payload(res).data.result).toEqual([]);
  });

  it("groups deskAbsence incidents per channel and computes formatted times", async () => {
    const channelId = new mongoose.Types.ObjectId();
    const nvrId = new mongoose.Types.ObjectId();
    const base = new Date("2024-06-15T08:00:00Z");
    // Two incidents: 8:00 present, 9:00 absent → 60 minutes presence
    await Incident.create({
      incidentType: "deskAbsence",
      timeOfIncident: base,
      nvrId,
      channelId,
      userId: "10",
      personPresent: true,
    });
    await Incident.create({
      incidentType: "deskAbsence",
      timeOfIncident: new Date(base.getTime() + 60 * 60 * 1000),
      nvrId,
      channelId,
      userId: "10",
      personPresent: false,
    });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: "10",
      body: { date: base.toISOString() },
      query: {},
    });
    await IncidentsService.deskAbsenceData(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.totalCount).toBe(1);
    expect(payload(res).data.result).toHaveLength(1);
    expect(payload(res).data.result[0].totalPresenceTime).toMatch(/^\d+h \d+m$/);
    expect(payload(res).data.result[0].totalAbsenceTime).toMatch(/^\d+h \d+m$/);
  });

  it("ignores incidents outside the chosen date", async () => {
    const channelId = new mongoose.Types.ObjectId();
    const nvrId = new mongoose.Types.ObjectId();
    await Incident.create({
      incidentType: "deskAbsence",
      timeOfIncident: new Date("2020-01-01T00:00:00Z"),
      nvrId,
      channelId,
      userId: "10",
      personPresent: true,
    });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: "10",
      body: { date: "2024-06-15" },
      query: {},
    });
    await IncidentsService.deskAbsenceData(req, res, next);
    expect(payload(res).data.totalCount).toBe(0);
  });

  it("ignores non-deskAbsence incident types", async () => {
    await Incident.create({
      incidentType: "motionDetection",
      timeOfIncident: new Date("2024-06-15T08:00:00Z"),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: "10",
    });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: "10",
      body: { date: "2024-06-15" },
      query: {},
    });
    await IncidentsService.deskAbsenceData(req, res, next);
    expect(payload(res).data.totalCount).toBe(0);
  });

  it("honours export mode (no pagination applied)", async () => {
    const channelId = new mongoose.Types.ObjectId();
    const nvrId = new mongoose.Types.ObjectId();
    await Incident.create({
      incidentType: "deskAbsence",
      timeOfIncident: new Date("2024-06-15T08:00:00Z"),
      nvrId,
      channelId,
      userId: "10",
      personPresent: true,
    });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: "10",
      body: { date: "2024-06-15" },
      query: { isExport: "true" },
    });
    await IncidentsService.deskAbsenceData(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.result).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// guardAbsenceData
// ---------------------------------------------------------------------------
describe("IncidentsService.guardAbsenceData", () => {
  it("returns 'failed' when user_id is missing", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      body: { date: new Date().toISOString() },
      query: {},
    });
    await IncidentsService.guardAbsenceData(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("returns 'failed' when admin does not exist", async () => {
    const { req, res, next } = serviceCtx({
      adminId: new mongoose.Types.ObjectId(),
      user_id: "10",
      body: { date: new Date().toISOString() },
      query: {},
    });
    await IncidentsService.guardAbsenceData(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("returns 200 with empty result when no incidents", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: "10",
      body: { date: new Date().toISOString() },
      query: {},
    });
    await IncidentsService.guardAbsenceData(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.totalCount).toBe(0);
  });

  it("groups guardAbsence incidents and computes formatted times", async () => {
    const channelId = new mongoose.Types.ObjectId();
    const nvrId = new mongoose.Types.ObjectId();
    const base = new Date("2024-06-15T08:00:00Z");
    await Incident.create({
      incidentType: "guardAbsence",
      timeOfIncident: base,
      nvrId,
      channelId,
      userId: "10",
      personPresent: false,
    });
    await Incident.create({
      incidentType: "guardAbsence",
      timeOfIncident: new Date(base.getTime() + 30 * 60 * 1000),
      nvrId,
      channelId,
      userId: "10",
      personPresent: true,
    });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: "10",
      body: { date: base.toISOString() },
      query: {},
    });
    await IncidentsService.guardAbsenceData(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.totalCount).toBe(1);
    expect(payload(res).data.result).toHaveLength(1);
  });

  it("filters by nvrIds (no match → no results)", async () => {
    const nvrId = new mongoose.Types.ObjectId();
    await Incident.create({
      incidentType: "guardAbsence",
      timeOfIncident: new Date("2024-06-15T08:00:00Z"),
      nvrId,
      channelId: new mongoose.Types.ObjectId(),
      userId: "10",
      personPresent: true,
    });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: "10",
      body: {
        date: "2024-06-15",
        nvrIds: [new mongoose.Types.ObjectId().toString()],
      },
      query: {},
    });
    await IncidentsService.guardAbsenceData(req, res, next);
    expect(payload(res).data.totalCount).toBe(0);
  });

  it("filters by channelIds (matching → returns row)", async () => {
    const channelId = new mongoose.Types.ObjectId();
    await Incident.create({
      incidentType: "guardAbsence",
      timeOfIncident: new Date("2024-06-15T08:00:00Z"),
      nvrId: new mongoose.Types.ObjectId(),
      channelId,
      userId: "10",
      personPresent: true,
    });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: "10",
      body: { date: "2024-06-15", channelIds: [channelId.toString()] },
      query: {},
    });
    await IncidentsService.guardAbsenceData(req, res, next);
    expect(payload(res).data.totalCount).toBe(1);
  });

  it("accepts comma-separated nvrIds strings", async () => {
    const nvrId = new mongoose.Types.ObjectId();
    const channelId = new mongoose.Types.ObjectId();
    await Incident.create({
      incidentType: "guardAbsence",
      timeOfIncident: new Date("2024-06-15T08:00:00Z"),
      nvrId,
      channelId,
      userId: "10",
      personPresent: true,
    });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: "10",
      body: {
        date: "2024-06-15",
        nvrIds: `${nvrId.toString()},${new mongoose.Types.ObjectId().toString()}`,
      },
      query: {},
    });
    await IncidentsService.guardAbsenceData(req, res, next);
    expect(payload(res).data.totalCount).toBe(1);
  });

  it("honours export mode", async () => {
    await Incident.create({
      incidentType: "guardAbsence",
      timeOfIncident: new Date("2024-06-15T08:00:00Z"),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: "10",
      personPresent: true,
    });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: "10",
      body: { date: "2024-06-15" },
      query: { isExport: "true" },
    });
    await IncidentsService.guardAbsenceData(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.result).toHaveLength(1);
  });
});
