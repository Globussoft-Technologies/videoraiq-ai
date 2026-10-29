import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCollections, connectMongo, disconnectMongo } from "../dbSetup.js";
import { payload, serviceCtx } from "../../helpers/service.js";
import mongoose from "mongoose";
import express from "express";
import request from "supertest";

// All writes go to MongoMemoryServer. No Redis, DS, alerts, or job workers.
vi.mock("../../../utils/database.js", () => ({ redis: {} }));
vi.mock("../../../core/v2/jobs/utils/deletionQueue.js", () => ({ deletionQueue: {} }));
vi.mock("../../../core/v1/jobs/utils/deletionQueue.js", () => ({ deletionQueue: {} }));
vi.mock("../../../core/v1/jobs/jobs.service.js", () => ({ default: {} }));
vi.mock("../../../utils/newSFTPConnectionCheck.js", () => ({ withSFTPConnection: vi.fn() }));
vi.mock("../../../socket.js", () => ({ sendPayloadToUser: vi.fn() }));
vi.mock("../../../core/v2/alerts/alert.events.js", () => ({ triggerAlertOnIncident: vi.fn() }));
vi.mock("../../../core/v1/alerts/alert.events.js", () => ({ triggerAlertOnIncident: vi.fn() }));
vi.mock("../../../core/v2/jobs/jobs.service.js", () => ({ default: {} }));
vi.mock("../../../services/push.service.js", () => ({ sendIncidentPush: vi.fn() }));
vi.mock("../../../utils/logger.js", () => ({ default: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));
vi.mock("../../../services/delete.service.js", () => ({ default: { deleteChannel: vi.fn() } }));
vi.mock("../../../services/python.service.js", () => ({ default: {
  handleDetectionStartStop: vi.fn().mockResolvedValue({ success: true }),
  handleDetectionUpdate: vi.fn().mockResolvedValue({ success: true }),
  stopNewDetection: vi.fn().mockResolvedValue({ success: true }),
  registerChannel: vi.fn(),
} }));

const { default: Settings } = await import("../../../core/v2/detectionSettings/detectionSettings.service.js");
const { default: Channels } = await import("../../../core/v2/channels/channels.service.js");
const { default: Incidents } = await import("../../../core/v2/incidents/incidents.service.js");
const { default: incidentRoutes } = await import("../../../core/v2/incidents/incidents.routes.js");
const { default: IncidentsV1 } = await import("../../../core/v1/incidents/incidents.service.js");
const { default: Admin } = await import("../../../core/v2/admin/admin.model.js");
const { default: NVR } = await import("../../../core/v2/NVR/nvr.model.js");
const { default: Channel } = await import("../../../core/v2/channels/channels.model.js");
const { UniformDetectionSetting } = await import("../../../core/v2/detectionSettings/detectionSettings.model.js");
const { UniformDetectionIncident } = await import("../../../core/v2/incidents/incidents.model.js");
const { default: Allocation } = await import("../../../core/v2/clientConfig/clientDetectionAllocation.model.js");
const { default: python } = await import("../../../services/python.service.js");
const { default: logger } = await import("../../../utils/logger.js");
const { revokeDetectionEverywhere } = await import("../../../core/v2/clientConfig/detectionLicense.service.js");
const { triggerAlertOnIncident } = await import("../../../core/v2/alerts/alert.events.js");
const { uniformDetectionSettings: example } = await import("../../../constants/detectionTypes.js");

let admin, nvr, camera, setting;
const type = "uniformDetectionSettings";
const time = "2026-10-29T09:35:10.000Z";
beforeAll(connectMongo);
afterAll(disconnectMongo);
beforeEach(async () => {
  await clearCollections();
  vi.clearAllMocks();
  admin = await Admin.create({ user_id: "500", login: "uniform", email: "uniform@test.com", purchasedCameras: 2 });
  await Allocation.create({ adminId: admin._id, settingType: type, enabled: true, cameraAllocation: 2 });
  nvr = await NVR.create({ userId: "500", nvrName: "Warehouse NVR", brand: "hikvision", domain: "http://nvr.test", location: "HQ", localNvrId: "uniform-nvr" });
  camera = await Channel.create({ userId: "500", nvrId: nvr._id, streamingPath: "/stream", localChannelId: "1", name: "Main Gate", isAdded: true });
});

async function call(service, method, options = {}) {
  const ctx = serviceCtx({ user_id: "500", adminId: admin._id, ...options });
  ctx.next = vi.fn();
  await service[method](ctx.req, ctx.res, ctx.next);
  expect(ctx.next, logger.error.mock.calls.map(args => args.map(a => a?.stack || JSON.stringify(a)).join(" ")).join("\n")).not.toHaveBeenCalled();
  return ctx.res;
}
async function save() {
  const settings = structuredClone(example.settings);
  settings.referencePoints = { [camera._id]: Object.values(settings.referencePoints)[0] };
  const res = await call(Settings, "createDetectionSettings", { body: {
    name: "Uniform areas", settingType: type, enabled: true, channelId: [String(camera._id)], NVRId: String(nvr._id), settings,
  } });
  expect(res.statusCode, JSON.stringify(res._body)).toBe(201);
  setting = await UniformDetectionSetting.findOne();
  return setting;
}
const incident = (extra = {}) => ({
  incidentType: "uniformDetection", adminId: String(admin._id), nvrId: String(nvr._id), channelId: String(camera._id),
  timeOfIncident: time, image: "/oracle/uploads/uniform.jpg", triggerNotification: false, ...extra,
});

describe("Uniform Detection workflow", () => {
  it("saves multiple named zones while OFF, starts on toggle, and updates active zones immediately", async () => {
    await save();
    expect((await Channel.findById(camera._id)).detections[type].enabled).toBe(false);
    expect(python.handleDetectionStartStop).not.toHaveBeenCalled();
    expect(python.handleDetectionUpdate).not.toHaveBeenCalled();
    const res = await call(Channels, "toggleDetection", { body: { channelId: String(camera._id), detectionType: type, enable: true } });
    expect(res.statusCode, JSON.stringify(res._body)).toBe(200);
    const start = python.handleDetectionStartStop.mock.calls[0];
    expect(start.slice(2, 5)).toEqual([true, type, setting.settings.referencePoints[String(camera._id)]]);
    expect(start[5].map(z => z.name)).toEqual(["Main Gate", "Back Gate"]);
    const zone_configs = [{ name: "Updated Gate" }, { name: "Back Gate" }];
    const updated = await call(Settings, "updateDetectionSettings", { params: { id: String(setting._id) }, body: { settings: { zone_configs } } });
    expect(updated.statusCode, JSON.stringify(updated._body)).toBe(200);
    expect(python.handleDetectionUpdate).toHaveBeenCalledOnce();
    expect(python.handleDetectionUpdate.mock.calls[0][5].map(z => z.name)).toEqual(["Updated Gate", "Back Gate"]);
    expect((await Channel.findById(camera._id)).detections[type].enabled).toBe(true);
    const invalid = await call(Settings, "updateDetectionSettings", { params: { id: String(setting._id) }, body: { settings: { zone_configs: [{ name: "Only one" }] } } });
    expect(invalid.statusCode).toBe(400);
    expect((await UniformDetectionSetting.findById(setting._id)).settings.zone_configs).toHaveLength(2);
    expect(python.handleDetectionUpdate).toHaveBeenCalledOnce();
  });

  it("applies Super Admin disable, revokes running Uniform Detection, and refuses re-enabling it", async () => {
    await save();
    await call(Channels, "toggleDetection", { body: { channelId: String(camera._id), detectionType: type, enable: true } });
    await Allocation.updateOne({ adminId: admin._id, settingType: type }, { enabled: false });
    await revokeDetectionEverywhere({ adminId: String(admin._id), userId: "500", settingType: type });
    expect((await Channel.findById(camera._id)).detections[type].enabled).toBe(false);
    expect(python.handleDetectionStartStop.mock.calls.at(-1).slice(2, 4)).toEqual([false, type]);
    const res = await call(Channels, "toggleDetection", { body: { channelId: String(camera._id), detectionType: type, enable: true } });
    expect(res.statusCode).toBe(403);
  });

  it("stores the snapshot and exact DS incident time, inheriting configured severity", async () => {
    await save();
    await UniformDetectionSetting.updateOne({ _id: setting._id }, { "settings.levelOfImportance": "high" });
    const res = await call(Incidents, "createIncidents", { body: incident() });
    expect(res.statusCode, JSON.stringify(res._body)).toBe(200);
    const saved = await UniformDetectionIncident.findOne().lean();
    expect(saved).toMatchObject({ Image: "/oracle/uploads/uniform.jpg", severity: "high", incidentName: "Uniform Detection", userId: "500" });
    expect(saved.timeOfIncident.toISOString()).toBe(time);
    expect(triggerAlertOnIncident).not.toHaveBeenCalled();
    const invalid = await call(Incidents, "createIncidents", { body: incident({ image: "" }) });
    expect(invalid.statusCode).toBe(400);
    expect(await UniformDetectionIncident.countDocuments()).toBe(1);
  });

  it("accepts the minimal event through the v1 DS endpoint too", async () => {
    await save();
    const res = await call(IncidentsV1, "createIncidents", { body: incident() });
    expect(res.statusCode, JSON.stringify(res._body)).toBe(200);
    const saved = await UniformDetectionIncident.findOne().lean();
    expect(saved.timeOfIncident.toISOString()).toBe(time);
    expect(saved.Image).toBe("/oracle/uploads/uniform.jpg");
  });

  it("returns populated log fields and filters NVR, camera, severity, date, tenant, and authorized cameras", async () => {
    const otherNvr = new mongoose.Types.ObjectId(), otherCamera = new mongoose.Types.ObjectId();
    await UniformDetectionIncident.create([
      { userId: "500", nvrId: nvr._id, channelId: camera._id, severity: "high", timeOfIncident: time, Image: "snapshot.jpg" },
      { userId: "500", nvrId: nvr._id, channelId: camera._id, severity: "low", timeOfIncident: time, Image: "low.jpg" },
      { userId: "other", nvrId: nvr._id, channelId: camera._id, severity: "high", timeOfIncident: time, Image: "other.jpg" },
      { userId: "500", nvrId: otherNvr, channelId: otherCamera, severity: "high", timeOfIncident: time, Image: "another-camera.jpg" },
    ]);
    const query = { nvrIds: String(nvr._id), channelIds: String(camera._id), severity: "high", startDate: "2026-10-29", endDate: "2026-10-29" };
    const res = await call(Incidents, "getUniformDetectionLogs", { query });
    const logs = payload(res).data;
    expect(logs.totalCount).toBe(1);
    expect(logs.data[0]).toMatchObject({ Image: "snapshot.jpg", severity: "high", nvrData: { nvrName: "Warehouse NVR" }, channelData: { name: "Main Gate" } });
    expect(logs.data[0].timeOfIncident.toISOString()).toBe(time);
    for (const filter of [{ nvrIds: String(nvr._id) }, { channelIds: String(camera._id) }]) {
      const filtered = await call(Incidents, "getUniformDetectionLogs", { query: { ...filter, severity: "high" } });
      expect(payload(filtered).data.totalCount).toBe(1);
    }
    const app = express();
    app.use((req, _res, next) => { req.verified = { userData: { user_id: "500", adminId: String(admin._id) } }; next(); });
    app.use('/api/v2/incidents', incidentRoutes);
    const http = await request(app).get('/api/v2/incidents/logs/uniform-detection').query(query);
    expect(http.status).toBe(200);
    expect(http.headers['content-type']).toContain('application/json');
    expect(http.body.body.data.data[0]).toMatchObject({ timeOfIncident: time, Image: "snapshot.jpg", channelData: { name: "Main Gate" } });
    const empty = await call(Incidents, "getUniformDetectionLogs", { query, authorizedChannel: { channels: [] } });
    expect(payload(empty).data).toMatchObject({ totalCount: 0, data: [] });
    const outside = await call(Incidents, "getUniformDetectionLogs", { query: { ...query, startDate: "2020-01-01", endDate: "2020-01-01" } });
    expect(payload(outside).data.totalCount).toBe(0);
  });
});
