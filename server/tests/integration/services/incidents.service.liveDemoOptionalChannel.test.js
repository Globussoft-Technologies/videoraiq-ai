/**
 * createIncidents — nvrId/channelId become optional when liveDemoData is true.
 *
 * Real incidents still require a real channelId (400 otherwise). A live-demo
 * incident has no camera behind it: it must save without nvrId/channelId,
 * skip the channel-derived enrichment (detectionSetting/alert dispatch), and
 * still 200 with the saved doc.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
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

const { Incident } = await import("../../../core/v1/incidents/incidents.model.js");
const { default: IncidentsService } = await import(
  "../../../core/v1/incidents/incidents.service.js"
);
const { triggerAlertOnIncident } = await import(
  "../../../core/v1/alerts/alert.events.js"
);
const { default: Admin } = await import("../../../core/v1/admin/admin.model.js");

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
  triggerAlertOnIncident.mockClear();
});

describe("IncidentsService.createIncidents — liveDemoData without channelId/nvrId", () => {
  it("creates a liveDemoData incident with no channelId/nvrId and skips alert dispatch", async () => {
    const admin = await Admin.create({ user_id: "demo-1", login: "d", email: "d@test.com" });
    const { req, res, next } = serviceCtx({
      body: {
        incidentType: "deskAbsence",
        incidentName: "Demo desk absence",
        adminId: admin._id.toString(),
        liveDemoData: true,
        personPresent: false,
        Image: "img/demo.jpg",
        timeOfIncident: new Date(),
      },
    });

    await IncidentsService.createIncidents(req, res, next);

    expect(res.statusCode).toBe(200);
    const stored = await Incident.findOne({ userId: admin.user_id });
    expect(stored).not.toBeNull();
    expect(stored.liveDemoData).toBe(true);
    expect(stored.nvrId).toBeUndefined();
    expect(stored.channelId).toBeUndefined();
    // No real channel to derive a detection setting / recipients from.
    expect(triggerAlertOnIncident).not.toHaveBeenCalled();
  });

  it("rejects a non-demo incident missing channelId", async () => {
    const admin = await Admin.create({ user_id: "demo-2", login: "d2", email: "d2@test.com" });
    const { req, res, next } = serviceCtx({
      body: {
        incidentType: "deskAbsence",
        incidentName: "Missing channel",
        adminId: admin._id.toString(),
        personPresent: false,
        timeOfIncident: new Date(),
      },
    });

    await IncidentsService.createIncidents(req, res, next);
    expect(res.statusCode).toBe(400);
    const stored = await Incident.findOne({ userId: admin.user_id });
    expect(stored).toBeNull();
  });
});
