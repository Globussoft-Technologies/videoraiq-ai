/**
 * Integration test for the alerts Mongoose model.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";

const { default: Alerts } = await import(
  "../../../core/v1/alerts/alerts.model.js"
);

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
});

describe("alerts model", () => {
  const adminId = new mongoose.Types.ObjectId();

  it("requires adminId and alertBasedOn", async () => {
    await expect(Alerts.create({ alertBasedOn: "NVR" })).rejects.toThrow();
    await expect(Alerts.create({ adminId })).rejects.toThrow();
  });

  it("only allows alertBasedOn of NVR or Camera", async () => {
    await expect(
      Alerts.create({ adminId, alertBasedOn: "Drone" })
    ).rejects.toThrow();
    await expect(
      Alerts.create({ adminId, alertBasedOn: "NVR" })
    ).resolves.toBeDefined();
  });

  it("defaults emails / phoneNumbers / detectionTypes to empty arrays", async () => {
    const a = await Alerts.create({ adminId, alertBasedOn: "Camera" });
    expect(a.emails).toEqual([]);
    expect(a.phoneNumbers).toEqual([]);
    expect(a.detectionTypes).toEqual([]);
  });

  it("validates detectionTypes against the enum", async () => {
    await expect(
      Alerts.create({
        adminId,
        alertBasedOn: "NVR",
        detectionTypes: ["countPersons"],
      })
    ).resolves.toBeDefined();
    await expect(
      Alerts.create({
        adminId,
        alertBasedOn: "NVR",
        detectionTypes: ["notARealType"],
      })
    ).rejects.toThrow();
  });

  it("accepts selectedNVRs / selectedCameras as ObjectId arrays", async () => {
    const a = await Alerts.create({
      adminId,
      alertBasedOn: "NVR",
      selectedNVRs: [new mongoose.Types.ObjectId()],
      selectedCameras: [new mongoose.Types.ObjectId()],
    });
    expect(a.selectedNVRs).toHaveLength(1);
    expect(a.selectedCameras).toHaveLength(1);
  });
});
