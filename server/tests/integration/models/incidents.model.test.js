/**
 * Integration test for the Incident model and its 19 discriminators.
 * Verifies the shared base schema constraints plus a sample of the
 * discriminator-specific fields and validators.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";

const incidents = await import(
  "../../../core/v1/incidents/incidents.model.js"
);
const {
  Incident,
  CountPersonIncident,
  LineCrossingAuthIncident,
  DoorStatusIncident,
  ConveyorDetectionIncident,
  VehicleDetectionIncident,
} = incidents;

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
});

function baseFields(overrides = {}) {
  return {
    timeOfIncident: new Date(),
    nvrId: new mongoose.Types.ObjectId(),
    channelId: new mongoose.Types.ObjectId(),
    userId: "user-1",
    ...overrides,
  };
}

describe("Incident base schema", () => {
  it("requires timeOfIncident, nvrId, channelId, userId", async () => {
    for (const key of ["timeOfIncident", "nvrId", "channelId", "userId"]) {
      const body = baseFields();
      delete body[key];
      await expect(CountPersonIncident.create(body)).rejects.toThrow();
    }
  });

  it("applies report + resolved defaults", async () => {
    const inc = await CountPersonIncident.create(baseFields({ count: 3 }));
    expect(inc.resolved).toBe(false);
    expect(inc.report.status).toBe(false);
    expect(inc.report.description).toBe("");
  });

  it("validates severity against the enum", async () => {
    await expect(
      CountPersonIncident.create(baseFields({ severity: "catastrophic" }))
    ).rejects.toThrow();
    await expect(
      CountPersonIncident.create(baseFields({ severity: "high" }))
    ).resolves.toBeDefined();
  });
});

describe("Incident discriminators", () => {
  it("countPersons stores count + timeSeries and tags incidentType", async () => {
    const inc = await CountPersonIncident.create(
      baseFields({ count: 5, timeSeries: [{ count: 5 }] })
    );
    expect(inc.count).toBe(5);
    expect(inc.incidentType).toBe("countPersons");
    expect(inc.triggerNotification).toBe(true);
  });

  it("all discriminator docs land in the shared 'incidents' collection", async () => {
    await CountPersonIncident.create(baseFields({ count: 1 }));
    await VehicleDetectionIncident.create(baseFields({ count: 1 }));
    // The base model sees every discriminator's documents.
    expect(await Incident.countDocuments()).toBe(2);
  });

  it("lineCrossing rejects a non-integer atoB", async () => {
    await expect(
      LineCrossingAuthIncident.create(baseFields({ atoB: 1.5 }))
    ).rejects.toThrow(/integer/);
  });

  it("lineCrossing rejects a negative count", async () => {
    await expect(
      LineCrossingAuthIncident.create(baseFields({ btoA: -1 }))
    ).rejects.toThrow();
  });

  it("doorDetection requires currentStatus and validates the enum", async () => {
    await expect(
      DoorStatusIncident.create(baseFields())
    ).rejects.toThrow();
    await expect(
      DoorStatusIncident.create(baseFields({ currentStatus: "AJAR" }))
    ).rejects.toThrow();
    await expect(
      DoorStatusIncident.create(baseFields({ currentStatus: "OPEN" }))
    ).resolves.toBeDefined();
  });

  it("conveyorDetection requires currentStatus ON/OFF", async () => {
    await expect(
      ConveyorDetectionIncident.create(baseFields({ currentStatus: "ON" }))
    ).resolves.toBeDefined();
    await expect(
      ConveyorDetectionIncident.create(baseFields({ currentStatus: "PAUSED" }))
    ).rejects.toThrow();
  });

  it("vehicleDetection defaults count to 0 and vehicleNumber to null", async () => {
    const inc = await VehicleDetectionIncident.create(baseFields());
    expect(inc.count).toBe(0);
    expect(inc.vehicleNumber).toBeNull();
  });
});
