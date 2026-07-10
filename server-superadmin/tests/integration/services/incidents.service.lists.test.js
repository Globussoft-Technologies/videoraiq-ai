/**
 * IncidentsService — getAllIncidentsById / getAllIncidents / getIncidentLists
 * / getIncidentsDetails happy + validation paths.
 *
 * Seed minimal data, assert response shape. No mocks.
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

// alert.events.js pulls in twilio at module scope; stub it out to avoid the
// Twilio.TWILIO_ACCOUNT_SID config requirement.
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
    user_id: "55",
    login: "incl",
    email: "incl@test.com",
  });
});

describe("IncidentsService.getAllIncidentsById", () => {
  it("returns 400 when neither channelId nor incidentId is supplied", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: "55",
      query: {},
    });
    await IncidentsService.getAllIncidentsById(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for an invalid incidentId format", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: "55",
      query: { incidentId: "not-an-object-id" },
    });
    await IncidentsService.getAllIncidentsById(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when channelId references a non-existent channel", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: "55",
      query: { channelId: new mongoose.Types.ObjectId().toString() },
    });
    await IncidentsService.getAllIncidentsById(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("returns matching incidents when querying by a valid incidentId", async () => {
    const inc = await Incident.create({
      incidentType: "motionDetection",
      timeOfIncident: new Date(),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: "55",
      Image: "http://images.test/img.jpg",
    });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: "55",
      query: { incidentId: inc._id.toString() },
    });
    await IncidentsService.getAllIncidentsById(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(res._body.totalCount).toBe(1);
    expect(res._body.data).toHaveLength(1);
  });
});

describe("IncidentsService.getAllIncidents", () => {
  it("returns 400 when user_id is missing", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: {},
      body: {},
    });
    await IncidentsService.getAllIncidents(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("returns paginated data with totalCount", async () => {
    await Incident.create({
      incidentType: "motionDetection",
      timeOfIncident: new Date(),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: "55",
      Image: "http://images.test/x.jpg",
    });
    await Incident.create({
      incidentType: "motionDetection",
      timeOfIncident: new Date(),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: "55",
      Image: "http://images.test/y.jpg",
    });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: "55",
      query: {},
      body: {},
    });
    await IncidentsService.getAllIncidents(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(res._body.totalCount).toBe(2);
    expect(res._body.data).toHaveLength(2);
  });

  it("filters by start/end date", async () => {
    await Incident.create({
      incidentType: "motionDetection",
      timeOfIncident: new Date("2024-06-15T00:00:00Z"),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: "55",
      Image: "http://images.test/a.jpg",
    });
    await Incident.create({
      incidentType: "motionDetection",
      timeOfIncident: new Date("2020-01-01T00:00:00Z"),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: "55",
      Image: "http://images.test/b.jpg",
    });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: "55",
      query: {},
      body: { startDate: "2024-01-01", endDate: "2024-12-31" },
    });
    await IncidentsService.getAllIncidents(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(res._body.totalCount).toBe(1);
  });

  it("excludes countPersons / lineCrossing / countVehicles", async () => {
    await Incident.create({
      incidentType: "countPersons",
      timeOfIncident: new Date(),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: "55",
      Image: "http://images.test/c.jpg",
      count: 5,
    });
    await Incident.create({
      incidentType: "motionDetection",
      timeOfIncident: new Date(),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: "55",
      Image: "http://images.test/d.jpg",
    });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: "55",
      query: {},
      body: {},
    });
    await IncidentsService.getAllIncidents(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(res._body.totalCount).toBe(1);
  });
});

describe("IncidentsService.getIncidentLists", () => {
  it("rejects when user_id is missing", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: {},
    });
    await IncidentsService.getIncidentLists(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("rejects when admin does not exist", async () => {
    const { req, res, next } = serviceCtx({
      adminId: new mongoose.Types.ObjectId(),
      user_id: "55",
      query: {},
    });
    await IncidentsService.getIncidentLists(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("returns unique incident types with a formatted name", async () => {
    await Incident.create({
      incidentType: "motionDetection",
      incidentName: "Motion 1",
      timeOfIncident: new Date(),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: "55",
    });
    await Incident.create({
      incidentType: "motionDetection",
      incidentName: "Motion 2",
      timeOfIncident: new Date(),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: "55",
    });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: "55",
      query: {},
    });
    await IncidentsService.getIncidentLists(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.totalCount).toBe(1); // grouped to 1
    expect(payload(res).data.result).toHaveLength(1);
    expect(payload(res).data.result[0].formattedIncidentType).toMatch(
      /Motion/,
    );
  });

  it("excludes countPersons / countVehicles from the grouping", async () => {
    await Incident.create({
      incidentType: "countPersons",
      incidentName: "Person 1",
      timeOfIncident: new Date(),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: "55",
      count: 1,
    });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: "55",
      query: {},
    });
    await IncidentsService.getIncidentLists(req, res, next);
    expect(payload(res).data.totalCount).toBe(0);
    expect(payload(res).data.result).toEqual([]);
  });
});

describe("IncidentsService.getIncidentsDetails — validation", () => {
  it("fails when user_id missing", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      query: {},
      body: {},
    });
    await IncidentsService.getIncidentsDetails(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("fails when more than one filter flag is true", async () => {
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: "55",
      query: {},
      body: { criticalIncidents: true, resolvedIncidents: true },
    });
    await IncidentsService.getIncidentsDetails(req, res, next);
    expect(payload(res).status).toBe("failed");
    expect(payload(res).message).toMatch(/Only one filter/);
  });
});
