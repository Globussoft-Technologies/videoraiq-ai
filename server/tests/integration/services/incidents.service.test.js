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
const { sendPayloadToUser } = await import("../../../socket.js");
const { triggerAlertOnIncident } = await import(
  "../../../core/v1/alerts/alert.events.js"
);
const { default: Admin } = await import(
  "../../../core/v1/admin/admin.model.js"
);
const { default: Channel } = await import(
  "../../../core/v1/channels/channels.model.js"
);
const { CountPersonsDetectionSetting } = await import(
  "../../../core/v1/detectionSettings/detectionSettings.model.js"
);
await import("../../../core/v1/NVR/nvr.model.js");

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
  sendPayloadToUser.mockClear();
  triggerAlertOnIncident.mockClear();
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

describe("IncidentsService.createIncidents — happy path", () => {
  /**
   * Seed Admin + NVR-id + Channel (with a wired-up countPersons detection
   * setting) so a genuine countPersons body can flow end-to-end.
   */
  async function seedCountPersonsScene() {
    const admin = await Admin.create({
      user_id: "777",
      login: "owner",
      email: "owner@test.com",
    });
    const detectionSetting = await CountPersonsDetectionSetting.create({
      userId: admin.user_id,
      settingType: "countPersonsSettings",
      name: "default",
      enabled: true,
      settings: { metricType: "gauge", detectionTimeGap: 30 },
    });
    const nvrId = new mongoose.Types.ObjectId();
    const channel = await Channel.create({
      nvrId,
      userId: admin.user_id,
      streamingPath: "/Streaming/Channels/101",
      localChannelId: "1",
      name: "Front Door",
      detections: {
        countPersonsSettings: { id: detectionSetting._id, enabled: true },
      },
    });
    return { admin, nvrId, channel, detectionSetting };
  }

  it("creates a new countPersons incident, persists it, and fans out the socket payload", async () => {
    const { admin, nvrId, channel, detectionSetting } =
      await seedCountPersonsScene();

    const { req, res, next } = serviceCtx({
      body: {
        incidentType: "countPersons",
        incidentName: "People counted",
        nvrId: nvrId.toString(),
        channelId: channel._id.toString(),
        adminId: admin._id.toString(),
        triggerNotification: true,
        count: 5,
        timeOfIncident: new Date(),
        severity: "low",
      },
    });

    await IncidentsService.createIncidents(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(payload(res).status).toBe("success");
    expect(payload(res).message).toBe("Incident created successfully");
    expect(payload(res).data.Incident.count).toBe(5);
    expect(payload(res).data.Incident.channelName).toBe("Front Door");

    // Persisted as a countPersons discriminator with the admin's user_id.
    const stored = await Incident.findOne({ channelId: channel._id });
    expect(stored).not.toBeNull();
    expect(stored.incidentType).toBe("countPersons");
    expect(stored.userId).toBe(admin.user_id);
    const cp = await CountPersonIncident.findById(stored._id);
    expect(cp.count).toBe(5);
    expect(cp.timeSeries).toHaveLength(1);
    expect(cp.timeSeries[0].count).toBe(5);

    // Socket fan-out is scoped to the admin and carries the detection setting.
    expect(sendPayloadToUser).toHaveBeenCalledTimes(1);
    const [socketUserId, socketTopic, socketBody] =
      sendPayloadToUser.mock.calls[0];
    expect(socketUserId).toBe(admin.user_id);
    expect(socketTopic).toBe(`cameradetection_${admin._id}`);
    expect(socketBody.channelName).toBe("Front Door");
    expect(socketBody.detectionSetting._id.toString()).toBe(
      detectionSetting._id.toString()
    );

    // countPersons is explicitly excluded from triggerAlertOnIncident.
    expect(triggerAlertOnIncident).not.toHaveBeenCalled();
  });

  it("updates the same day's countPersons incident in place on a second post", async () => {
    const { admin, nvrId, channel } = await seedCountPersonsScene();

    const buildBody = (count) => ({
      incidentType: "countPersons",
      incidentName: "People counted",
      nvrId: nvrId.toString(),
      channelId: channel._id.toString(),
      adminId: admin._id.toString(),
      triggerNotification: true,
      count,
      timeOfIncident: new Date(),
    });

    const first = serviceCtx({ body: buildBody(2) });
    await IncidentsService.createIncidents(first.req, first.res, first.next);
    expect(first.res.statusCode).toBe(200);

    const second = serviceCtx({ body: buildBody(9) });
    await IncidentsService.createIncidents(second.req, second.res, second.next);
    expect(second.res.statusCode).toBe(200);
    expect(payload(second.res).message).toBe("Incident updated successfully");

    // Still a single document on disk — same-day countPersons updates in place.
    expect(await Incident.countDocuments()).toBe(1);
    const stored = await CountPersonIncident.findOne({ channelId: channel._id });
    expect(stored.count).toBe(9);
    expect(stored.timeSeries).toHaveLength(2);
    expect(stored.timeSeries.map((t) => t.count)).toEqual([2, 9]);
  });

  it("returns 400 when adminId does not resolve to a real admin", async () => {
    const { nvrId, channel } = await seedCountPersonsScene();
    const { req, res, next } = serviceCtx({
      body: {
        incidentType: "countPersons",
        nvrId: nvrId.toString(),
        channelId: channel._id.toString(),
        adminId: new mongoose.Types.ObjectId().toString(),
        count: 1,
        timeOfIncident: new Date(),
      },
    });

    await IncidentsService.createIncidents(req, res, next);
    // Service uses res.send(Response.validationFailResp(...)) — no statusCode shift.
    expect(payload(res).status).toBe("failed");
    expect(payload(res).message).toMatch(/Admin not found/i);
    expect(await Incident.countDocuments()).toBe(0);
    expect(sendPayloadToUser).not.toHaveBeenCalled();
  });
});
