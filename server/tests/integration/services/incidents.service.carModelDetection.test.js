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

/** Admin + enabled detection setting + channel — the minimum for a create. */
const seedTarget = async () => {
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
  return { admin, nvrId, channel };
};

/** POST one carModelDetection incident and return the stored document. */
const createCarIncident = async (extraBody = {}) => {
  const { admin, nvrId, channel } = await seedTarget();
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
      ...extraBody,
    },
  });

  await IncidentsService.createIncidents(req, res, next);

  return { res, stored: await Incident.findOne({ channelId: channel._id }) };
};

describe("IncidentsService.createIncidents carModelDetection", () => {
  it("creates a carModelDetection incident and fires the alert pipeline", async () => {
    const { res, stored } = await createCarIncident({
      vehicleNumber: "KA01AB1234",
    });

    expect(res.statusCode).toBe(200);
    expect(stored.incidentType).toBe("carModelDetection");
    expect(stored.Image).toBe("img/car-model.jpg");
    expect(stored.model_name).toBe("Toyota Corolla");
    expect(stored.vehicleNumber).toBe("KA01AB1234");
    expect(triggerAlertOnIncident).toHaveBeenCalledTimes(1);
    expect(triggerAlertOnIncident.mock.calls[0][0].saved.vehicleNumber).toBe(
      "KA01AB1234",
    );
  });

  it("stores the vehicle attributes Car Logs renders", async () => {
    const { stored } = await createCarIncident({
      color: "white",
      company: "Honda",
      year: 2021,
    });

    expect(stored.color).toBe("white");
    expect(stored.company).toBe("Honda");
    expect(stored.year).toBe(2021);
  });

  it("accepts the alternate DS spellings colour / make / model_year", async () => {
    const { stored } = await createCarIncident({
      colour: "silver",
      make: "Maruti",
      model_year: "2018",
    });

    expect(stored.color).toBe("silver");
    expect(stored.company).toBe("Maruti");
    expect(stored.year).toBe(2018);
  });

  it("accepts brand and manufacturer as company", async () => {
    const fromBrand = await createCarIncident({ brand: "Hyundai" });
    expect(fromBrand.stored.company).toBe("Hyundai");

    await clearCollections();

    const fromManufacturer = await createCarIncident({ manufacturer: "Kia" });
    expect(fromManufacturer.stored.company).toBe("Kia");
  });

  it("stores placeholder attributes as null so the UI shows -- not 'unknown'", async () => {
    const { stored } = await createCarIncident({
      color: "unknown",
      company: "  ",
      year: "N/A",
    });

    expect(stored.color).toBeNull();
    expect(stored.company).toBeNull();
    expect(stored.year).toBeNull();
  });

  it("stores every attribute of a real DS payload verbatim", async () => {
    // Copied from a face_auth_worker_prod "[INCIDENT DISPATCH] OUTGOING
    // PAYLOAD" log line. The worker sends the canonical keys and gets a 200,
    // but a server build whose discriminator predates these fields drops them
    // silently -- Mongoose strict mode ignores unknown paths instead of
    // erroring, so the incident saves fine and the columns render "--".
    const { res, stored } = await createCarIncident({
      timeOfIncident: "2026-08-20T13:43:19Z",
      zone: "Workstation 1",
      severity: "low",
      description: "Car model detected in monitored area.",
      type: "gauge",
      triggerNotification: false,
      model_name: "CR V",
      color: "Blue",
      company: "Honda",
      year: 2022,
    });

    expect(res.statusCode).toBe(200);
    expect(stored.model_name).toBe("CR V");
    expect(stored.color).toBe("Blue");
    expect(stored.company).toBe("Honda");
    expect(stored.year).toBe(2022);
  });

  it("prefers the canonical key when both spellings are present", async () => {
    const { stored } = await createCarIncident({
      color: "red",
      colour: "blue",
      company: "Honda",
      make: "Maruti",
    });

    expect(stored.color).toBe("red");
    expect(stored.company).toBe("Honda");
  });
});
