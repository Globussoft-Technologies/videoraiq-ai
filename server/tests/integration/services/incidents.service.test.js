/**
 * Integration test for IncidentsService — the tractable update/delete/report
 * paths against in-memory MongoDB. SFTP, sockets, alerts, and jobs are mocked.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

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
vi.mock("../../../core/v1/alerts/alert.events.js", () => ({
  triggerAlertOnIncident: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../core/v1/jobs/jobs.service.js", () => ({
  default: { handleProfileNotification: vi.fn().mockResolvedValue(false) },
}));

const incidents = await import(
  "../../../core/v1/incidents/incidents.model.js"
);
const { Incident, CountPersonIncident } = incidents;
const { default: IncidentsService } = await import(
  "../../../core/v1/incidents/incidents.service.js"
);

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
});

function makeIncident(over = {}) {
  return CountPersonIncident.create({
    timeOfIncident: new Date(),
    nvrId: new mongoose.Types.ObjectId(),
    channelId: new mongoose.Types.ObjectId(),
    userId: "u1",
    count: 3,
    ...over,
  });
}

describe("IncidentsService.updateIncident", () => {
  it("updates an existing incident", async () => {
    const inc = await makeIncident();
    const { req, res, next } = serviceCtx({
      params: { id: inc._id.toString() },
      body: { description: "edited" },
    });
    await IncidentsService.updateIncident(req, res, next);
    expect(res.statusCode).toBe(200);
    expect((await Incident.findById(inc._id)).description).toBe("edited");
  });

  it("returns 404 for an unknown incident", async () => {
    const { req, res, next } = serviceCtx({
      params: { id: new mongoose.Types.ObjectId().toString() },
      body: { description: "x" },
    });
    await IncidentsService.updateIncident(req, res, next);
    expect(res.statusCode).toBe(404);
  });
});

describe("IncidentsService.deleteIncident", () => {
  it("returns 404 for an unknown incident", async () => {
    const { req, res, next } = serviceCtx({
      params: { id: new mongoose.Types.ObjectId().toString() },
    });
    await IncidentsService.deleteIncident(req, res, next);
    expect(res.statusCode).toBe(404);
  });

  it("deletes an incident (no image → SFTP skipped)", async () => {
    const inc = await makeIncident();
    const { req, res, next } = serviceCtx({
      params: { id: inc._id.toString() },
    });
    await IncidentsService.deleteIncident(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(await Incident.findById(inc._id)).toBeNull();
  });

  it("rejects an image path containing '..'", async () => {
    const inc = await makeIncident({ Image: "../../etc/passwd" });
    const { req, res, next } = serviceCtx({
      params: { id: inc._id.toString() },
    });
    await IncidentsService.deleteIncident(req, res, next);
    expect(res.statusCode).toBe(400);
  });
});

describe("IncidentsService.deleteIncidentsByIds", () => {
  it("returns 400 when incidentIds is missing/empty", async () => {
    const { req, res, next } = serviceCtx({ body: { incidentIds: [] } });
    await IncidentsService.deleteIncidentsByIds(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("deletes the listed incidents", async () => {
    const a = await makeIncident();
    const b = await makeIncident();
    const { req, res, next } = serviceCtx({
      body: { incidentIds: [a._id.toString(), b._id.toString()] },
    });
    await IncidentsService.deleteIncidentsByIds(req, res, next);
    expect(await Incident.countDocuments()).toBe(0);
  });
});

describe("IncidentsService.updateReportStatus", () => {
  it("marks a report as reported (status true)", async () => {
    const inc = await makeIncident();
    const { req, res, next } = serviceCtx({
      body: { incidentId: inc._id.toString(), status: true, description: "d" },
    });
    await IncidentsService.updateReportStatus(req, res, next);
    expect(res.statusCode).toBe(200);
    const reloaded = await Incident.findById(inc._id);
    expect(reloaded.report.status).toBe(true);
    expect(reloaded.report.reportedAt).toBeInstanceOf(Date);
  });

  it("marks a report as resolved (status false)", async () => {
    const inc = await makeIncident();
    const { req, res, next } = serviceCtx({
      body: { incidentId: inc._id.toString(), status: false },
    });
    await IncidentsService.updateReportStatus(req, res, next);
    expect(res.statusCode).toBe(200);
    expect((await Incident.findById(inc._id)).report.resolvedAt).toBeInstanceOf(
      Date
    );
  });

  it("returns 404 for an unknown incident", async () => {
    const { req, res, next } = serviceCtx({
      body: { incidentId: new mongoose.Types.ObjectId().toString(), status: true },
    });
    await IncidentsService.updateReportStatus(req, res, next);
    expect(res.statusCode).toBe(404);
  });
});
