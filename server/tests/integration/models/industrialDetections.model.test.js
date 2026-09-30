import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { clearCollections, connectMongo, disconnectMongo } from "../dbSetup.js";
import {
  WorkingAtHeightDetectionIncident,
  OilLeakageDetectionIncident,
  EquipmentOilLeakageDetectionIncident,
  VehicleFuelOilLeakageDetectionIncident,
  GunnyBagsMaterialsWrongLocationDetectionIncident,
  SandDustWasteScrapDisposalDetectionIncident,
  UnauthorizedAnimalEntryDetectionIncident,
  SpillsDirtyMessyAreasDetectionIncident,
  LoadingUnloadingStockCountingIncident,
  BlurredCameraDetectionIncident,
} from "../../../core/v1/incidents/incidents.model.js";

const INCIDENT_MODELS = [
  [WorkingAtHeightDetectionIncident, "workingAtHeightDetection"],
  [OilLeakageDetectionIncident, "oilLeakageDetection"],
  [EquipmentOilLeakageDetectionIncident, "equipmentOilLeakageDetection"],
  [VehicleFuelOilLeakageDetectionIncident, "vehicleFuelOilLeakageDetection"],
  [GunnyBagsMaterialsWrongLocationDetectionIncident, "gunnyBagsMaterialsWrongLocationDetection"],
  [SandDustWasteScrapDisposalDetectionIncident, "sandDustWasteScrapDisposalDetection"],
  [UnauthorizedAnimalEntryDetectionIncident, "unauthorizedAnimalEntryDetection"],
  [SpillsDirtyMessyAreasDetectionIncident, "spillsDirtyMessyAreasDetection"],
];

beforeAll(connectMongo);
afterAll(disconnectMongo);
beforeEach(clearCollections);

describe("industrial incident discriminators", () => {
  it.each(INCIDENT_MODELS)("persists the %s payload", async (Model, incidentType) => {
    const incident = await Model.create({
      timeOfIncident: new Date("2026-09-21T12:30:45Z"),
      nvrId: new mongoose.Types.ObjectId(),
      channelId: new mongoose.Types.ObjectId(),
      userId: "industrial-user",
      Image: "https://nas.example.com/incidents/industrial.jpg",
      count: 1,
      alertThreshold: 400,
      triggerNotification: true,
      type: "gauge",
      severity: "high",
    });

    expect(incident.incidentType).toBe(incidentType);
    expect(incident.count).toBe(1);
    expect(incident.alertThreshold).toBe(400);
    expect(incident.triggerNotification).toBe(true);
    expect(incident.type).toBe("gauge");
  });
});

it("persists loading/unloading stock movement details", async () => {
  const incident = await LoadingUnloadingStockCountingIncident.create({
    timeOfIncident: new Date("2026-09-30T10:30:00Z"),
    nvrId: new mongoose.Types.ObjectId(),
    channelId: new mongoose.Types.ObjectId(),
    userId: "industrial-user",
    schemaVersion: "1.0",
    eventId: "1da2b7b7-9609-4ac6-aa3b-81d7c8a79287",
    vehicleSessionId: "a8dc38d2-1e95-44fe-98e1-bb1f51bf3902",
    vehicleNumber: "MH12AB1234",
    direction: "loading",
    lineCrossingDirection: "entry",
    boxType: "brown",
    boxCount: 5,
    countMethod: "configured_bundle_size",
    classificationStatus: "classified",
    classificationConfidence: 0.93,
    defaultCountApplied: false,
    truckPresent: true,
    severity: "moderate",
  });

  expect(incident.incidentType).toBe("loadingUnloadingStockCountingDetection");
  expect(incident.eventId).toBe("1da2b7b7-9609-4ac6-aa3b-81d7c8a79287");
  expect(incident.vehicleNumber).toBe("MH12AB1234");
  expect(incident.direction).toBe("loading");
  expect(incident.boxType).toBe("brown");
  expect(incident.boxCount).toBe(5);
  expect(incident.classificationConfidence).toBe(0.93);
  expect(incident.truckPresent).toBe(true);
});

it("accepts a stock-counting incident without optional box metadata", async () => {
  const incident = await LoadingUnloadingStockCountingIncident.create({
    timeOfIncident: new Date("2026-09-30T10:30:00Z"),
    nvrId: new mongoose.Types.ObjectId(),
    channelId: new mongoose.Types.ObjectId(),
    userId: "industrial-user",
    vehicleNumber: "MH12AB1234",
    direction: "loading",
    severity: "moderate",
  });

  expect(incident.boxCount).toBeUndefined();
  expect(incident.boxType).toBeUndefined();
  expect(incident.defaultCountApplied).toBeUndefined();
  expect(incident.truckPresent).toBeUndefined();
});

it("persists blurred-camera incident details", async () => {
  const incident = await BlurredCameraDetectionIncident.create({
    timeOfIncident: new Date("2026-09-28T12:30:45Z"),
    nvrId: new mongoose.Types.ObjectId(),
    channelId: new mongoose.Types.ObjectId(),
    userId: "blur-user",
    Image: "https://nas.example.com/incidents/blurred_camera.jpg",
    count: 1,
    alertThreshold: 80,
    triggerNotification: true,
    type: "gauge",
    severity: "high",
  });

  expect(incident.incidentType).toBe("blurredCameraDetection");
  expect(incident.count).toBe(1);
  expect(incident.alertThreshold).toBe(80);
  expect(incident.triggerNotification).toBe(true);
});
