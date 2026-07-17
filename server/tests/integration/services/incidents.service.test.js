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
vi.mock("../../../utils/newSFTPConnectionCheck.js", () => {
  const sftpClient = {
    exists: vi.fn().mockResolvedValue(false),
    delete: vi.fn().mockResolvedValue(undefined),
    end: vi.fn().mockResolvedValue(undefined),
  };
  return {
    connectSFTP: vi.fn().mockResolvedValue(sftpClient),
    checkSftpConnection: vi.fn().mockResolvedValue(sftpClient),
    withSFTPConnection: vi.fn(async (callback) => callback(sftpClient)),
    disconnectSFTP: vi.fn().mockResolvedValue(undefined),
    getPoolStats: vi.fn().mockReturnValue({}),
    debugPool: vi.fn().mockReturnValue({}),
  };
});
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
const {
  CountPersonsDetectionSetting,
  CountVehiclesSetting,
  MotionDetectionSetting,
  LineCrossingSetting,
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
      isAdded: true,
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

describe("IncidentsService.createIncidents — additional discriminators", () => {
  /**
   * Seed an admin, an nvrId, and a Channel pointed at the requested
   * discriminator setting. `settingType` follows the channel.detections key
   * convention (e.g. "countVehiclesSettings").
   */
  async function seedScene({ SettingModel, settingType, channelDetections }) {
    const admin = await Admin.create({
      user_id: "888",
      login: "scene",
      email: "scene@test.com",
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
      name: "Front Door",
      isAdded: true,
      detections: channelDetections(setting),
    });
    return { admin, nvrId, channel, setting };
  }

  it("creates a countVehicles incident with a single timeSeries entry and triggers an alert", async () => {
    const { admin, nvrId, channel } = await seedScene({
      SettingModel: CountVehiclesSetting,
      settingType: "countVehiclesSettings",
      channelDetections: (s) => ({
        countVehiclesSettings: { id: s._id, enabled: true },
      }),
    });

    const { req, res, next } = serviceCtx({
      body: {
        incidentType: "countVehicles",
        incidentName: "Vehicles counted",
        nvrId: nvrId.toString(),
        channelId: channel._id.toString(),
        adminId: admin._id.toString(),
        count: 4,
        timeOfIncident: new Date(),
      },
    });

    await IncidentsService.createIncidents(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(payload(res).message).toBe("Incident created successfully");

    const stored = await Incident.findOne({ channelId: channel._id });
    expect(stored).not.toBeNull();
    expect(stored.incidentType).toBe("countVehicles");
    expect(stored.count).toBe(4);
    expect(stored.timeSeries).toHaveLength(1);

    // countVehicles is also excluded from triggerAlertOnIncident.
    expect(triggerAlertOnIncident).not.toHaveBeenCalled();
    expect(sendPayloadToUser).toHaveBeenCalledTimes(1);
  });

  it("creates a motionDetection incident and triggers the alert", async () => {
    const { admin, nvrId, channel } = await seedScene({
      SettingModel: MotionDetectionSetting,
      settingType: "motionDetectionSettings",
      channelDetections: (s) => ({
        motionDetectionSettings: { id: s._id, enabled: true },
      }),
    });

    const { req, res, next } = serviceCtx({
      body: {
        incidentType: "motionDetection",
        incidentName: "Motion detected",
        nvrId: nvrId.toString(),
        channelId: channel._id.toString(),
        adminId: admin._id.toString(),
        timeOfIncident: new Date(),
        severity: "moderate",
      },
    });

    await IncidentsService.createIncidents(req, res, next);

    expect(res.statusCode).toBe(200);

    const stored = await Incident.findOne({ channelId: channel._id });
    expect(stored).not.toBeNull();
    expect(stored.incidentType).toBe("motionDetection");

    // motionDetection is NOT in the create-or-update list, so a fresh row
    // is always inserted and the alert pipeline runs.
    expect(triggerAlertOnIncident).toHaveBeenCalledTimes(1);
    expect(sendPayloadToUser).toHaveBeenCalledTimes(1);
  });

  it("creates a lineCrossing incident with atoB/btoA and a timeSeries entry", async () => {
    const { admin, nvrId, channel } = await seedScene({
      SettingModel: LineCrossingSetting,
      settingType: "lineCrossingSettings",
      channelDetections: (s) => ({
        lineCrossingSettings: { id: s._id, enabled: true },
      }),
    });

    const { req, res, next } = serviceCtx({
      body: {
        incidentType: "lineCrossing",
        incidentName: "Line crossed",
        nvrId: nvrId.toString(),
        channelId: channel._id.toString(),
        adminId: admin._id.toString(),
        atoB: 3,
        btoA: 1,
        timeOfIncident: new Date(),
      },
    });

    await IncidentsService.createIncidents(req, res, next);

    expect(res.statusCode).toBe(200);
    const stored = await Incident.findOne({ channelId: channel._id });
    expect(stored.incidentType).toBe("lineCrossing");
    expect(stored.atoB).toBe(3);
    expect(stored.btoA).toBe(1);
    expect(stored.timeSeries).toHaveLength(1);
    expect(stored.timeSeries[0].atoB).toBe(3);
    expect(triggerAlertOnIncident).toHaveBeenCalledTimes(1);
  });

  it("returns 400 when the channelId/nvrId pair is invalid", async () => {
    const admin = await Admin.create({
      user_id: "999",
      login: "bad",
      email: "bad@test.com",
    });

    const { req, res, next } = serviceCtx({
      body: {
        incidentType: "motionDetection",
        nvrId: new mongoose.Types.ObjectId().toString(),
        channelId: new mongoose.Types.ObjectId().toString(),
        adminId: admin._id.toString(),
        timeOfIncident: new Date(),
      },
    });
    await IncidentsService.createIncidents(req, res, next);

    expect(res.statusCode).toBe(400);
    expect(await Incident.countDocuments()).toBe(0);
  });

  it("returns 400 for an unknown incidentType", async () => {
    const admin = await Admin.create({
      user_id: "1000",
      login: "u",
      email: "u@test.com",
    });
    const channel = await Channel.create({
      nvrId: new mongoose.Types.ObjectId(),
      userId: admin.user_id,
      streamingPath: "/Streaming/Channels/101",
      localChannelId: "1",
      name: "Cam",
      isAdded: true,
      detections: {},
    });
    const { req, res, next } = serviceCtx({
      body: {
        incidentType: "thisIsNotARealIncidentType",
        nvrId: channel.nvrId.toString(),
        channelId: channel._id.toString(),
        adminId: admin._id.toString(),
        timeOfIncident: new Date(),
      },
    });
    await IncidentsService.createIncidents(req, res, next);
    expect(res.statusCode).toBe(400);
  });
});

describe("IncidentsService log-fetching endpoints (_fetchIncidentLogs)", () => {
  /**
   * The log-fetch helpers all require `userData.user_id`; without it they
   * short-circuit to a 'failed' Response via `res.send(...)` with no
   * statusCode flip. With it they should hit the aggregation pipeline and
   * return 200 + a totalCount.
   */
  it("getVehicleDetectionLogs returns 401-shape when user is unauthenticated", async () => {
    const { req, res, next } = serviceCtx({ query: {} });
    await IncidentsService.getVehicleDetectionLogs(req, res, next);
    expect(payload(res).status).toBe("failed");
  });

  it("getVehicleDetectionLogs returns the matching logs", async () => {
    const userId = "uvlogs";
    const nvrId = new mongoose.Types.ObjectId();
    const channelId = new mongoose.Types.ObjectId();
    // Seed two vehicleDetection incidents.
    await Incident.create([
      {
        incidentType: "vehicleDetection",
        timeOfIncident: new Date(),
        nvrId,
        channelId,
        userId,
        count: 1,
        vehicleNumber: "KA01AB1234",
      },
      {
        incidentType: "vehicleDetection",
        timeOfIncident: new Date(),
        nvrId,
        channelId,
        userId,
        count: 2,
        vehicleNumber: "MH02CD5678",
      },
    ]);

    const { req, res, next } = serviceCtx({
      user_id: userId,
      query: { vehicleNumber: "KA01" },
    });
    await IncidentsService.getVehicleDetectionLogs(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.totalCount).toBe(1);
    expect(payload(res).data.data[0].vehicleNumber).toBe("KA01AB1234");
  });

  it("getConveyorDetectionLogs filters by current status", async () => {
    const userId = "uconv";
    const nvrId = new mongoose.Types.ObjectId();
    const channelId = new mongoose.Types.ObjectId();
    await Incident.create([
      {
        incidentType: "conveyorDetection",
        timeOfIncident: new Date(),
        nvrId,
        channelId,
        userId,
        currentStatus: "ON",
      },
      {
        incidentType: "conveyorDetection",
        timeOfIncident: new Date(),
        nvrId,
        channelId,
        userId,
        currentStatus: "OFF",
      },
    ]);
    const { req, res, next } = serviceCtx({
      user_id: userId,
      query: { status: "ON" },
    });
    await IncidentsService.getConveyorDetectionLogs(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.totalCount).toBe(1);
  });

  it("getCrusherDetectionLogs returns all rows when no filter", async () => {
    const userId = "ucrush";
    await Incident.create([
      {
        incidentType: "crusherDetection",
        timeOfIncident: new Date(),
        nvrId: new mongoose.Types.ObjectId(),
        channelId: new mongoose.Types.ObjectId(),
        userId,
        currentStatus: "ON",
      },
    ]);
    const { req, res, next } = serviceCtx({
      user_id: userId,
      query: {},
    });
    await IncidentsService.getCrusherDetectionLogs(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.totalCount).toBe(1);
  });

  it("getWaterSpillageDetectionLogs filters by DETECTED/CLEAR status", async () => {
    const userId = "uwater";
    await Incident.create([
      {
        incidentType: "waterSpillageDetection",
        timeOfIncident: new Date(),
        nvrId: new mongoose.Types.ObjectId(),
        channelId: new mongoose.Types.ObjectId(),
        userId,
        currentStatus: "DETECTED",
      },
      {
        incidentType: "waterSpillageDetection",
        timeOfIncident: new Date(),
        nvrId: new mongoose.Types.ObjectId(),
        channelId: new mongoose.Types.ObjectId(),
        userId,
        currentStatus: "CLEAR",
      },
    ]);
    const { req, res, next } = serviceCtx({
      user_id: userId,
      query: { status: "DETECTED" },
    });
    await IncidentsService.getWaterSpillageDetectionLogs(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.totalCount).toBe(1);
  });

  it("getVehicleCountLogs filters by min/max count", async () => {
    const userId = "uvc";
    await Incident.create([
      {
        incidentType: "countVehicles",
        timeOfIncident: new Date(),
        nvrId: new mongoose.Types.ObjectId(),
        channelId: new mongoose.Types.ObjectId(),
        userId,
        count: 3,
      },
      {
        incidentType: "countVehicles",
        timeOfIncident: new Date(),
        nvrId: new mongoose.Types.ObjectId(),
        channelId: new mongoose.Types.ObjectId(),
        userId,
        count: 9,
      },
    ]);
    const { req, res, next } = serviceCtx({
      user_id: userId,
      query: { minCount: "5" },
    });
    await IncidentsService.getVehicleCountLogs(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.totalCount).toBe(1);
  });

  it("getLineCrossingLogs filters by atoB/btoA ranges", async () => {
    const userId = "ulc";
    await Incident.create([
      {
        incidentType: "lineCrossing",
        timeOfIncident: new Date(),
        nvrId: new mongoose.Types.ObjectId(),
        channelId: new mongoose.Types.ObjectId(),
        userId,
        atoB: 2,
        btoA: 0,
      },
      {
        incidentType: "lineCrossing",
        timeOfIncident: new Date(),
        nvrId: new mongoose.Types.ObjectId(),
        channelId: new mongoose.Types.ObjectId(),
        userId,
        atoB: 8,
        btoA: 0,
      },
    ]);
    const { req, res, next } = serviceCtx({
      user_id: userId,
      query: { minAtoB: "5" },
    });
    await IncidentsService.getLineCrossingLogs(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.totalCount).toBe(1);
  });

  it("getVehicleNumbers returns the distinct vehicle numbers for the user", async () => {
    const userId = "uvn";
    await Incident.create([
      {
        incidentType: "vehicleDetection",
        timeOfIncident: new Date(),
        nvrId: new mongoose.Types.ObjectId(),
        channelId: new mongoose.Types.ObjectId(),
        userId,
        vehicleNumber: "KA01AB1234",
      },
      {
        incidentType: "vehicleDetection",
        timeOfIncident: new Date(),
        nvrId: new mongoose.Types.ObjectId(),
        channelId: new mongoose.Types.ObjectId(),
        userId,
        vehicleNumber: "KA01AB1234", // dup
      },
      {
        incidentType: "vehicleDetection",
        timeOfIncident: new Date(),
        nvrId: new mongoose.Types.ObjectId(),
        channelId: new mongoose.Types.ObjectId(),
        userId,
        vehicleNumber: "MH02CD5678",
      },
    ]);
    const { req, res, next } = serviceCtx({ user_id: userId, query: {} });
    await IncidentsService.getVehicleNumbers(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(payload(res).data.totalCount).toBe(2);
    expect(payload(res).data.vehicleNumbers).toEqual(
      expect.arrayContaining(["KA01AB1234", "MH02CD5678"])
    );
  });

  it("getVehicleNumbers returns auth-failed without a user_id", async () => {
    const { req, res, next } = serviceCtx({ query: {} });
    await IncidentsService.getVehicleNumbers(req, res, next);
    expect(payload(res).status).toBe("failed");
  });
});
