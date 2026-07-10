/**
 * Integration tests for IncidentsService.createIncidents — same-day UPDATE
 * branches (when a recentIncident already exists for the channel within the
 * same calendar day). The R3/R5 tests cover the "new incident" path for
 * countVehicles + genericObjectDetection + doorDetection, plus the
 * countPersons same-day update path. This file covers the remaining
 * same-day update branches that are still uncovered:
 *
 *   • countVehicles            — recentIncident.count + timeSeries push
 *   • genericObjectDetection   — objectsDetected + timeSeries push
 *   • doorDetection            — currentStatus/currentImage + timeSeries push
 *
 * Each test exercises 60+ lines of the "if recentIncident" block, including
 * the post-save fan-out (sendPayloadToUser + triggerAlertOnIncident gate on
 * `Guard Present`/countPersons/countVehicles).
 *
 * Mocks (4, well under the 8-mock ceiling) — same as
 * incidents.service.discriminators.test.js:
 *   1. socket.js / sendPayloadToUser
 *   2. utils/newSFTPConnectionCheck.js / connectSFTP
 *   3. core/v1/alerts/alert.events.js / triggerAlertOnIncident
 *   4. core/v1/jobs/jobs.service.js / JobsService default
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
const {
  Incident,
  CountVehiclesIncident,
  GenericObjectIncident,
  DoorStatusIncident,
} = incidents;
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
const {
  CountVehiclesSetting,
  GenericObjectDetectionSetting,
  DoorDetectionSetting,
} = await import(
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

/** Seed Admin + nvrId + Channel pointed at the supplied detection setting. */
async function seedScene({ SettingModel, settingType, channelDetections }) {
  const admin = await Admin.create({
    user_id: "777",
    login: "same-day",
    email: "sd@test.com",
  });
  const setting = await SettingModel.create({
    userId: admin.user_id,
    settingType,
    name: "default",
    enabled: true,
    settings: { metricType: "gauge" },
  });
  const nvrId = new mongoose.Types.ObjectId();
  const channel = await Channel.create({
    nvrId,
    userId: admin.user_id,
    streamingPath: "/Streaming/Channels/101",
    localChannelId: "1",
    name: "Gate Cam",
    detections: channelDetections(setting),
  });
  return { admin, nvrId, channel, setting };
}

describe("IncidentsService.createIncidents — countVehicles same-day update", () => {
  it("updates the same day's countVehicles incident in place, pushes timeSeries, and does NOT fire an alert", async () => {
    const { admin, nvrId, channel } = await seedScene({
      SettingModel: CountVehiclesSetting,
      settingType: "countVehiclesSettings",
      channelDetections: (s) => ({
        countVehiclesSettings: { id: s._id, enabled: true },
      }),
    });

    const buildBody = (count) => ({
      incidentType: "countVehicles",
      incidentName: "Vehicles counted",
      nvrId: nvrId.toString(),
      channelId: channel._id.toString(),
      adminId: admin._id.toString(),
      count,
      timeOfIncident: new Date(),
    });

    // First post: creates the incident.
    const first = serviceCtx({ body: buildBody(3) });
    await IncidentsService.createIncidents(first.req, first.res, first.next);
    expect(first.res.statusCode).toBe(200);
    expect(payload(first.res).message).toBe("Incident created successfully");

    // Second post (same day): hits the recentIncident update branch.
    const second = serviceCtx({ body: buildBody(11) });
    await IncidentsService.createIncidents(second.req, second.res, second.next);
    expect(second.res.statusCode).toBe(200);
    expect(payload(second.res).message).toBe("Incident updated successfully");

    // Single document on disk; count = 11; timeSeries has BOTH entries.
    expect(await Incident.countDocuments()).toBe(1);
    const stored = await CountVehiclesIncident.findOne({
      channelId: channel._id,
    });
    expect(stored.count).toBe(11);
    expect(stored.timeSeries).toHaveLength(2);
    expect(stored.timeSeries.map((t) => t.count)).toEqual([3, 11]);

    // countVehicles is explicitly excluded from triggerAlertOnIncident.
    expect(triggerAlertOnIncident).not.toHaveBeenCalled();
    // sendPayloadToUser fired for both posts.
    expect(sendPayloadToUser).toHaveBeenCalledTimes(2);
  });
});

describe("IncidentsService.createIncidents — genericObjectDetection same-day update", () => {
  it("updates the same day's genericObjectDetection incident, persists objectsDetected, fires the alert", async () => {
    const { admin, nvrId, channel } = await seedScene({
      SettingModel: GenericObjectDetectionSetting,
      settingType: "genericObjectDetectionSettings",
      channelDetections: (s) => ({
        genericObjectDetectionSettings: { id: s._id, enabled: true },
      }),
    });

    const buildBody = (objectsDetected) => ({
      incidentType: "genericObjectDetection",
      incidentName: "Object spotted",
      nvrId: nvrId.toString(),
      channelId: channel._id.toString(),
      adminId: admin._id.toString(),
      objectsDetected,
      timeOfIncident: new Date(),
    });

    // GenericObjectIncident.objectsDetected is `[Mixed]` (an array of
    // arbitrary objects with numeric values), per the schema.
    const first = serviceCtx({ body: buildBody([{ chair: 1 }]) });
    await IncidentsService.createIncidents(first.req, first.res, first.next);
    expect(first.res.statusCode).toBe(200);

    const second = serviceCtx({
      body: buildBody([{ chair: 2 }, { table: 1 }]),
    });
    await IncidentsService.createIncidents(
      second.req,
      second.res,
      second.next,
    );
    expect(second.res.statusCode).toBe(200);
    expect(payload(second.res).message).toBe("Incident updated successfully");

    // Single document; objectsDetected matches the latest payload.
    expect(await Incident.countDocuments()).toBe(1);
    const stored = await GenericObjectIncident.findOne({
      channelId: channel._id,
    });
    expect(stored.objectsDetected).toEqual([{ chair: 2 }, { table: 1 }]);
    expect(stored.timeSeries).toHaveLength(2);

    // genericObjectDetection IS subject to the alert pipeline (it's only
    // countPersons/countVehicles/Guard Present that are excluded).
    expect(triggerAlertOnIncident).toHaveBeenCalledTimes(2);
    expect(sendPayloadToUser).toHaveBeenCalledTimes(2);
  });
});

describe("IncidentsService.createIncidents — doorDetection same-day update", () => {
  it("updates the same day's doorDetection incident with the latest status/image and fires the alert", async () => {
    const { admin, nvrId, channel } = await seedScene({
      SettingModel: DoorDetectionSetting,
      settingType: "doorDetectionSettings",
      channelDetections: (s) => ({
        doorDetectionSettings: { id: s._id, enabled: true },
      }),
    });

    const buildBody = (status, Image) => ({
      incidentType: "doorDetection",
      incidentName: "Door state",
      nvrId: nvrId.toString(),
      channelId: channel._id.toString(),
      adminId: admin._id.toString(),
      doorDetectionPayload: { status, Image },
      timeOfIncident: new Date(),
    });

    // DoorStatusSchema requires currentStatus to be one of OPEN/CLOSED.
    const first = serviceCtx({ body: buildBody("CLOSED", "img/closed.jpg") });
    await IncidentsService.createIncidents(first.req, first.res, first.next);
    expect(first.res.statusCode).toBe(200);

    const second = serviceCtx({ body: buildBody("OPEN", "img/open.jpg") });
    await IncidentsService.createIncidents(
      second.req,
      second.res,
      second.next,
    );
    expect(second.res.statusCode).toBe(200);
    expect(payload(second.res).message).toBe("Incident updated successfully");

    expect(await Incident.countDocuments()).toBe(1);
    const stored = await DoorStatusIncident.findOne({
      channelId: channel._id,
    });
    expect(stored.currentStatus).toBe("OPEN");
    expect(stored.currentImage).toBe("img/open.jpg");
    expect(stored.timeSeries).toHaveLength(2);
    // doorDetection fires the alert pipeline.
    expect(triggerAlertOnIncident).toHaveBeenCalledTimes(2);
  });
});

describe("IncidentsService.createIncidents — same-day update guards", () => {
  it("returns 400 when nvrId/channelId don't resolve to a real channel", async () => {
    const admin = await Admin.create({
      user_id: "777",
      login: "no-chan",
      email: "nochan@test.com",
    });
    const { req, res, next } = serviceCtx({
      body: {
        incidentType: "countVehicles",
        incidentName: "Vehicles counted",
        nvrId: new mongoose.Types.ObjectId().toString(),
        channelId: new mongoose.Types.ObjectId().toString(),
        adminId: admin._id.toString(),
        count: 1,
        timeOfIncident: new Date(),
      },
    });
    await IncidentsService.createIncidents(req, res, next);
    expect(res.statusCode).toBe(400);
    expect(sendPayloadToUser).not.toHaveBeenCalled();
    expect(triggerAlertOnIncident).not.toHaveBeenCalled();
  });

  it("returns 400 when incidentType is not in modelMap", async () => {
    const admin = await Admin.create({
      user_id: "777",
      login: "bad-type",
      email: "badtype@test.com",
    });
    const nvrId = new mongoose.Types.ObjectId();
    const channel = await Channel.create({
      nvrId,
      userId: admin.user_id,
      streamingPath: "/Streaming/Channels/101",
      localChannelId: "1",
      name: "x",
    });
    const { req, res, next } = serviceCtx({
      body: {
        incidentType: "totallyUnknown",
        incidentName: "Bogus",
        nvrId: nvrId.toString(),
        channelId: channel._id.toString(),
        adminId: admin._id.toString(),
        timeOfIncident: new Date(),
      },
    });
    await IncidentsService.createIncidents(req, res, next);
    expect(res.statusCode).toBe(400);
  });
});
