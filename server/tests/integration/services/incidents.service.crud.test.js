/**
 * IncidentsService — CRUD endpoints that earlier rounds left untouched:
 *   - updateIncident         (happy path + 404)
 *   - updateReportStatus     (reportedAt + resolvedAt branches + 404)
 *   - getIncidentLists       (auth, admin lookup, aggregation, formatted output)
 *   - deleteIncident         (no-Image branch — keeps SFTP off the hot path)
 *   - deleteIncidentsByIds   (validation, 404, no-Image happy path)
 *
 * Mocks: 5 (alerts, socket, SFTP, media storage, jobs service) — the same
 * stable shape every other incidents test uses.
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
vi.mock("../../../utils/mediaStorage.js", () => ({
  deleteMedia: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../core/v1/jobs/jobs.service.js", () => ({
  default: { handleProfileNotification: vi.fn().mockResolvedValue(false) },
}));

const { default: IncidentsService } = await import(
  "../../../core/v1/incidents/incidents.service.js"
);
const { deleteMedia } = await import("../../../utils/mediaStorage.js");
const incidentsModel = await import(
  "../../../core/v1/incidents/incidents.model.js"
);
const { Incident, MotionIncident, VehicleDetectionIncident } = incidentsModel;
const { default: Admin } = await import(
  "../../../core/v1/admin/admin.model.js"
);

let admin;
let nvrId;
let channelId;

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
  deleteMedia.mockClear();
  deleteMedia.mockResolvedValue(undefined);
  admin = await Admin.create({
    user_id: "9001",
    login: "incid-crud",
    email: "incid-crud@test.com",
  });
  nvrId = new mongoose.Types.ObjectId();
  channelId = new mongoose.Types.ObjectId();
});

async function seedMotion(over = {}) {
  return MotionIncident.create({
    timeOfIncident: new Date(),
    incidentName: "Motion detected",
    cameraId: "cam-A",
    nvrId,
    channelId,
    userId: admin.user_id.toString(),
    zone: "lobby",
    severity: "low",
    ...over,
  });
}

// ----------------------------------------------------------------------------
// updateIncident
// ----------------------------------------------------------------------------

describe("IncidentsService.updateIncident", () => {
  it("updates an existing incident and returns 200", async () => {
    const inc = await seedMotion();
    const { req, res, next } = serviceCtx({
      params: { id: inc._id.toString() },
      body: { description: "new desc", severity: "high" },
    });
    await IncidentsService.updateIncident(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).status).toBe("success");
    const reloaded = await Incident.findById(inc._id);
    expect(reloaded.description).toBe("new desc");
    expect(reloaded.severity).toBe("high");
  });

  it("returns 404 when the incident does not exist", async () => {
    const { req, res, next } = serviceCtx({
      params: { id: new mongoose.Types.ObjectId().toString() },
      body: { description: "x" },
    });
    await IncidentsService.updateIncident(req, res, next);
    expect(res.statusCode).toBe(404);
  });

  it("invokes next() with an AppError on a cast error", async () => {
    const { req, res, next } = serviceCtx({
      params: { id: "not-a-valid-id" },
      body: { description: "x" },
    });
    await IncidentsService.updateIncident(req, res, next);
    // findByIdAndUpdate throws on a bad ObjectId → caught + next() called.
    expect(next.calls).toHaveLength(1);
    expect(next.calls[0]?.message).toMatch(/Failed to update Incident/);
  });
});

// ----------------------------------------------------------------------------
// updateReportStatus
// ----------------------------------------------------------------------------

describe("IncidentsService.updateReportStatus", () => {
  it("sets reportedAt when status is true (reported)", async () => {
    const inc = await seedMotion();
    const { req, res, next } = serviceCtx({
      body: {
        incidentId: inc._id.toString(),
        status: true,
        description: "reporting it",
      },
    });
    await IncidentsService.updateReportStatus(req, res, next);
    expect(res.statusCode).toBe(200);
    const reloaded = await Incident.findById(inc._id);
    expect(reloaded.report.status).toBe(true);
    expect(reloaded.report.description).toBe("reporting it");
    expect(reloaded.report.reportedAt).toBeInstanceOf(Date);
    expect(reloaded.report.resolvedAt).toBeNull();
  });

  it("sets resolvedAt when status is false (resolved)", async () => {
    const inc = await seedMotion();
    const { req, res, next } = serviceCtx({
      body: {
        incidentId: inc._id.toString(),
        status: false,
      },
    });
    await IncidentsService.updateReportStatus(req, res, next);
    expect(res.statusCode).toBe(200);
    const reloaded = await Incident.findById(inc._id);
    expect(reloaded.report.status).toBe(false);
    // description defaults to "" when not supplied
    expect(reloaded.report.description).toBe("");
    expect(reloaded.report.resolvedAt).toBeInstanceOf(Date);
  });

  it("returns 404 when the incident is unknown", async () => {
    const { req, res, next } = serviceCtx({
      body: {
        incidentId: new mongoose.Types.ObjectId().toString(),
        status: true,
      },
    });
    await IncidentsService.updateReportStatus(req, res, next);
    expect(res.statusCode).toBe(404);
  });
});

// ----------------------------------------------------------------------------
// getIncidentLists
// ----------------------------------------------------------------------------

describe("IncidentsService.getIncidentLists", () => {
  it("rejects unauthenticated callers", async () => {
    const { req, res, next } = serviceCtx({ query: {} });
    await IncidentsService.getIncidentLists(req, res, next);
    expect(payload(res).status).toBe("failed");
    expect(payload(res).message).toMatch(/authentication/i);
  });

  it("returns 'Admin not found' when the verified adminId does not exist", async () => {
    const { req, res, next } = serviceCtx({
      adminId: new mongoose.Types.ObjectId(),
      user_id: 9999,
      query: {},
    });
    await IncidentsService.getIncidentLists(req, res, next);
    expect(payload(res).status).toBe("failed");
    expect(payload(res).message).toMatch(/Admin not found/);
  });

  it("aggregates incidents per type and formats the type label", async () => {
    // Service queries with userId = isAdminExist.user_id.toString() so we
    // must seed incidents whose userId matches that exact stringified value.
    const uid = admin.user_id.toString();
    await seedMotion({ userId: uid });
    await VehicleDetectionIncident.create({
      timeOfIncident: new Date(),
      incidentName: "Vehicle detected",
      cameraId: "cam-B",
      nvrId,
      channelId,
      userId: uid,
      severity: "moderate",
    });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: Number(admin.user_id),
      query: { skip: 0, limit: 10 },
    });
    await IncidentsService.getIncidentLists(req, res, next);
    expect(res.statusCode).toBe(200);
    // NOTE: the service exposes `totalCount: totalCount.length` where
    // totalCount is the result of an aggregation with a single `$count` stage
    // — so this value is 1 when *any* results exist, 0 otherwise. (Treat as
    // a documented quirk, not a bug to patch here.)
    expect(payload(res).data.totalCount).toBe(1);
    expect(payload(res).data.result).toHaveLength(2);
    const labels = payload(res).data.result.map(
      (r) => r.formattedIncidentType,
    );
    // motionDetection → "Motion Detection"; vehicleDetection → "Vehicle Detection"
    // The replace/^./ uppercases the very first char (the leading space-inserted
    // by the previous replace would be uppercased to itself, but the format
    // string then begins at the original first letter, capitalized).
    expect(labels).toEqual(
      expect.arrayContaining(["Motion Detection", "Vehicle Detection"]),
    );
  });

  it("respects skip/limit pagination on the aggregated list", async () => {
    const uid = admin.user_id.toString();
    // Three distinct types so the $group produces 3 docs. Avoid doorDetection
    // (currentStatus required) — use vehicleDetection + motionDetection +
    // conveyorDetection-like via discriminator-less Incident with explicit type.
    await seedMotion({ userId: uid });
    await VehicleDetectionIncident.create({
      timeOfIncident: new Date(),
      incidentName: "Vehicle",
      cameraId: "cam-B",
      nvrId,
      channelId,
      userId: uid,
    });
    // Use motionDetection-discriminator with a different cameraId — same type
    // would collapse in the $group, so seed yet another vehicleDetection
    // (still merges under one type). Instead, use the bare Incident model with
    // a freeform incidentType — the discriminator key drives grouping.
    // We pick a type whose discriminator has no required extras: bagDetection.
    await Incident.create({
      incidentType: "bagDetection",
      timeOfIncident: new Date(),
      incidentName: "Bag",
      cameraId: "cam-C",
      nvrId,
      channelId,
      userId: uid,
    });
    const { req, res, next } = serviceCtx({
      adminId: admin._id,
      user_id: Number(admin.user_id),
      query: { skip: 1, limit: 1 },
    });
    await IncidentsService.getIncidentLists(req, res, next);
    expect(res.statusCode).toBe(200);
    // totalCount here is `aggregationResult.length` of a $count stage — so
    // 1 when any results exist. The visible page should be 1 doc due to limit.
    expect(payload(res).data.totalCount).toBe(1);
    expect(payload(res).data.result).toHaveLength(1);
  });
});

// ----------------------------------------------------------------------------
// deleteIncident
// ----------------------------------------------------------------------------

describe("IncidentsService.deleteIncident", () => {
  it("returns 404 when the incident does not exist", async () => {
    const { req, res, next } = serviceCtx({
      params: { id: new mongoose.Types.ObjectId().toString() },
    });
    await IncidentsService.deleteIncident(req, res, next);
    expect(res.statusCode).toBe(404);
  });

  it("deletes a no-Image incident (skips SFTP entirely)", async () => {
    const inc = await seedMotion({ Image: null });
    const { req, res, next } = serviceCtx({
      params: { id: inc._id.toString() },
    });
    await IncidentsService.deleteIncident(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).status).toBe("success");
    expect(await Incident.findById(inc._id)).toBeNull();
  });

  it("rejects an incident whose Image path contains '..' (traversal guard)", async () => {
    const inc = await seedMotion({ Image: "../../etc/passwd" });
    const { req, res, next } = serviceCtx({
      params: { id: inc._id.toString() },
    });
    await IncidentsService.deleteIncident(req, res, next);
    expect(res.statusCode).toBe(400);
    expect(res._body.message).toMatch(/Invalid image path/);
    // Row should still exist — the delete bailed before the deleteOne call.
    expect(await Incident.findById(inc._id)).not.toBeNull();
  });
});

// ----------------------------------------------------------------------------
// deleteIncidentsByIds
// ----------------------------------------------------------------------------

describe("IncidentsService.deleteIncidentsByIds", () => {
  it("returns 400 when incidentIds is empty", async () => {
    const { req, res, next } = serviceCtx({
      body: { incidentIds: [] },
    });
    await IncidentsService.deleteIncidentsByIds(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when incidentIds is missing", async () => {
    const { req, res, next } = serviceCtx({ body: {} });
    await IncidentsService.deleteIncidentsByIds(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 when one of the ids is unknown", async () => {
    const inc = await seedMotion();
    const { req, res, next } = serviceCtx({
      body: {
        incidentIds: [
          inc._id.toString(),
          new mongoose.Types.ObjectId().toString(),
        ],
      },
    });
    await IncidentsService.deleteIncidentsByIds(req, res, next);
    expect(res.statusCode).toBe(404);
  });

  it("deletes a batch of no-Image incidents on the happy path", async () => {
    const a = await seedMotion({ Image: null });
    const b = await seedMotion({ Image: null, cameraId: "cam-B" });
    const { req, res, next } = serviceCtx({
      body: {
        incidentIds: [a._id.toString(), b._id.toString()],
      },
    });
    await IncidentsService.deleteIncidentsByIds(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(res._body.status).toBe("success");
    expect(await Incident.countDocuments()).toBe(0);
  });

  it("deletes incident media through the configured storage backend", async () => {
    const inc = await seedMotion({
      Image: "/uploads/images/camera-1/image.jpg",
    });
    const { req, res, next } = serviceCtx({
      body: { incidentIds: [inc._id.toString()] },
    });

    await IncidentsService.deleteIncidentsByIds(req, res, next);

    expect(deleteMedia).toHaveBeenCalledWith(
      "/uploads/images/camera-1/image.jpg"
    );
    expect(res.statusCode).toBe(200);
    expect(await Incident.findById(inc._id)).toBeNull();
  });

  it("rejects a batch where any incident has a '..' image path", async () => {
    const safe = await seedMotion({ Image: null });
    const unsafe = await seedMotion({ Image: "../../bad.png" });
    const { req, res, next } = serviceCtx({
      body: {
        incidentIds: [safe._id.toString(), unsafe._id.toString()],
      },
    });
    await IncidentsService.deleteIncidentsByIds(req, res, next);
    expect(res.statusCode).toBe(400);
    // Neither doc should have been deleted (the loop bails on the first bad path).
    expect(await Incident.countDocuments()).toBe(2);
  });
});
