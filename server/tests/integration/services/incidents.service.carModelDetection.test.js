import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx } from "../../helpers/service.js";

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
const { default: IncidentsService } = await import("../../../core/v1/incidents/incidents.service.js");
const { triggerAlertOnIncident } = await import("../../../core/v1/alerts/alert.events.js");
const { default: Admin } = await import("../../../core/v1/admin/admin.model.js");
const { default: Channel } = await import("../../../core/v1/channels/channels.model.js");
const { carModelDetectionSchemaSetting } = await import("../../../core/v1/detectionSettings/detectionSettings.model.js");
await import("../../../core/v1/NVR/nvr.model.js");

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

describe("IncidentsService.createIncidents carModelDetection", () => {
  it("creates a carModelDetection incident and fires the alert pipeline", async () => {
    const admin = await Admin.create({
      user_id: "777",
      login: "car-model",
      email: "car-model@test.com",
    });
    const setting = await carModelDetectionSchemaSetting.create({
      userId: admin.user_id,
      settingType: "carModelDetectionSettings",
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
      name: "Cam-Car",
      isAdded: true,
      detections: {
        carModelDetectionSettings: { id: setting._id, enabled: true },
      },
    });

    const { req, res, next } = serviceCtx({
      body: {
        incidentType: "carModelDetection",
        incidentName: "Car model detected",
        nvrId: nvrId.toString(),
        channelId: channel._id.toString(),
        adminId: admin._id.toString(),
        Image: "img/car-model.jpg",
        model_name: "Toyota Corolla",
        timeOfIncident: new Date(),
      },
    });

    await IncidentsService.createIncidents(req, res, next);

    expect(res.statusCode).toBe(200);
    const stored = await Incident.findOne({ channelId: channel._id });
    expect(stored.incidentType).toBe("carModelDetection");
    expect(stored.Image).toBe("img/car-model.jpg");
    expect(stored.model_name).toBe("Toyota Corolla");
    expect(triggerAlertOnIncident).toHaveBeenCalledTimes(1);
  });
});
