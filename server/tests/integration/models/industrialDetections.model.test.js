import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { clearCollections, connectMongo, disconnectMongo } from "../dbSetup.js";
import {
  WorkingAtHeightDetectionIncident,
  OilLeakageDetectionIncident,
  GunnyBagsMaterialsWrongLocationDetectionIncident,
  SandDustWasteScrapDisposalDetectionIncident,
  UnauthorizedAnimalEntryDetectionIncident,
  SpillsDirtyMessyAreasDetectionIncident,
} from "../../../core/v1/incidents/incidents.model.js";

const INCIDENT_MODELS = [
  [WorkingAtHeightDetectionIncident, "workingAtHeightDetection"],
  [OilLeakageDetectionIncident, "oilLeakageDetection"],
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
