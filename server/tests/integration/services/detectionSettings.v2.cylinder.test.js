import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCollections, connectMongo, disconnectMongo } from "../dbSetup.js";
import { payload, serviceCtx } from "../../helpers/service.js";

vi.mock("../../../socket.js", () => ({
  sendPayloadToUser: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../core/v2/alerts/alert.events.js", () => ({
  triggerAlertOnIncident: vi.fn().mockResolvedValue(undefined),
}));

const { default: DetectionSettingsService } = await import(
  "../../../core/v2/detectionSettings/detectionSettings.service.js"
);
const { default: Channel } = await import("../../../core/v2/channels/channels.model.js");
const { CylinderDetectionSetting } = await import(
  "../../../core/v2/detectionSettings/detectionSettings.model.js"
);
const { default: IncidentsService } = await import(
  "../../../core/v2/incidents/incidents.service.js"
);
const { CylinderDetectionIncident } = await import(
  "../../../core/v2/incidents/incidents.model.js"
);
const { triggerAlertOnIncident } = await import(
  "../../../core/v2/alerts/alert.events.js"
);
const { sendPayloadToUser } = await import("../../../socket.js");
const { default: NVR } = await import("../../../core/v1/NVR/nvr.model.js");
const { default: Admin } = await import("../../../core/v2/admin/admin.model.js");
const { default: DetectionAllocation } = await import(
  "../../../core/v2/clientConfig/clientDetectionAllocation.model.js"
);
await import("../../../core/v1/verifyRecipients/recipients.model.js");
await import("../../../core/v1/authorizedUsers/authorizedUsers.model.js");

let admin;

beforeAll(connectMongo);
afterAll(disconnectMongo);
beforeEach(async () => {
  await clearCollections();
  triggerAlertOnIncident.mockClear();
  sendPayloadToUser.mockClear();
  admin = await Admin.create({
    user_id: "u1",
    login: "u1",
    email: "u1@test.com",
    purchasedCameras: 10,
  });
  await DetectionAllocation.create({
    adminId: admin._id,
    settingType: "cylinderDetectionSettings",
    enabled: true,
    cameraAllocation: 10,
  });
});

const makeNvrAndChannel = async () => {
  const nvr = await NVR.create({
    userId: "u1",
    nvrName: "Cylinder NVR",
    brand: "dahua",
    domain: "http://nvr.local",
    location: "HQ",
    localNvrId: "cylinder-nvr-1",
  });
  const channel = await Channel.create({
    nvrId: nvr._id,
    userId: "u1",
    streamingPath: "/Streaming/Channels/101",
    localChannelId: "1",
    name: "Cylinder Camera",
    isAdded: true,
  });
  return { nvr, channel };
};

describe("v2 cylinderDetectionSettings CRUD", () => {
  it("creates the discriminator and links it to a channel", async () => {
    const { nvr, channel } = await makeNvrAndChannel();
    const { req, res, next } = serviceCtx({
      user_id: "u1",
      adminId: admin._id,
      body: {
        name: "Cylinder Area 1",
        settingType: "cylinderDetectionSettings",
        NVRId: nvr._id.toString(),
        channelId: [channel._id.toString()],
        enabled: true,
        settings: { alertThreshold: 2, metricType: "gauge" },
      },
    });

    await DetectionSettingsService.createDetectionSettings(req, res, next);

    expect(res.statusCode).toBe(201);
    expect(payload(res).status).toBe("success");
    expect(await CylinderDetectionSetting.countDocuments()).toBe(1);
    const savedChannel = await Channel.findById(channel._id);
    expect(savedChannel.detections.cylinderDetectionSettings.id).toBeTruthy();
  });

  it("updates cylinder settings through the v2 service", async () => {
    const setting = await CylinderDetectionSetting.create({
      userId: "u1",
      name: "Cylinder Area 1",
      settingType: "cylinderDetectionSettings",
      enabled: true,
      alerts: [],
      settings: { alertThreshold: 1, metricType: "gauge" },
    });
    const { req, res, next } = serviceCtx({
      user_id: "u1",
      adminId: admin._id,
      params: { id: setting._id.toString() },
      body: {
        name: "Cylinder Area 2",
        settings: { alertThreshold: 3 },
      },
    });

    await DetectionSettingsService.updateDetectionSettings(req, res, next);

    expect(res.statusCode).toBe(200);
    const updated = await CylinderDetectionSetting.findById(setting._id);
    expect(updated.name).toBe("Cylinder Area 2");
    expect(updated.settings.alertThreshold).toBe(3);
    expect(updated.settings.metricType).toBe("gauge");
  });
});

describe("v2 cylinderDetection incidents", () => {
  it("stores the incident and sends it through the shared alert fan-out", async () => {
    const { nvr, channel } = await makeNvrAndChannel();
    const setting = await CylinderDetectionSetting.create({
      userId: "u1",
      name: "Cylinder Area 1",
      settingType: "cylinderDetectionSettings",
      enabled: true,
      alerts: [],
      settings: { metricType: "gauge" },
    });
    channel.detections.cylinderDetectionSettings = {
      id: setting._id,
      enabled: true,
    };
    await channel.save();

    const incidentTime = new Date("2026-09-15T10:00:00.000Z");
    const { req, res, next } = serviceCtx({
      body: {
        incidentType: "cylinderDetection",
        incidentName: "Cylinder Stack Alert",
        nvrId: nvr._id.toString(),
        channelId: channel._id.toString(),
        adminId: admin._id.toString(),
        currentStatus: "DETECTED",
        cylinderCount: 4,
        stackHeight: 2.5,
        Image: "/incidents/cylinder.jpg",
        timeOfIncident: incidentTime,
        severity: "high",
      },
    });

    await IncidentsService.createIncidents(req, res, next);

    expect(res.statusCode).toBe(200);
    const incident = await CylinderDetectionIncident.findOne({ channelId: channel._id });
    expect(incident.currentStatus).toBe("DETECTED");
    expect(incident.cylinderCount).toBe(4);
    expect(incident.stackHeight).toBe(2.5);
    expect(incident.timeOfIncident).toEqual(incidentTime);
    expect(triggerAlertOnIncident).toHaveBeenCalledWith(
      expect.objectContaining({
        detectionType: "cylinderDetection",
        channelId: channel._id.toString(),
      }),
    );
    expect(sendPayloadToUser).toHaveBeenCalledWith(
      "u1",
      `cameradetection_${admin._id}`,
      expect.objectContaining({ incidentType: "cylinderDetection" }),
    );
  });
});
