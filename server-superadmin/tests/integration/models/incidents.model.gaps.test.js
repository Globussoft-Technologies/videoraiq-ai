/**
 * Gap-fill for incidents.model.js function coverage — exercises the two
 * `objectsDetected` validator callbacks (top-level + timeSeries entry) on
 * the GenericObjectIncident discriminator. The baseline model test never
 * creates a GenericObjectIncident with an objectsDetected array, so these
 * validator function bodies are never executed.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";

const incidents = await import(
  "../../../core/v1/incidents/incidents.model.js"
);
const { GenericObjectIncident } = incidents;

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

describe("GenericObjectIncident objectsDetected validators", () => {
  it("accepts an objectsDetected array of {key: number} objects", async () => {
    const inc = await GenericObjectIncident.create(
      baseFields({
        objectsDetected: [{ bag: 3 }, { box: 2 }],
        timeSeries: [
          { objectsDetected: [{ bag: 1 }] },
          { objectsDetected: [{ box: 4 }, { hat: 7 }] },
        ],
      })
    );
    expect(inc.objectsDetected.length).toBe(2);
    expect(inc.timeSeries.length).toBe(2);
    expect(inc.incidentType).toBe("genericObjectDetection");
  });

  it("rejects when an objectsDetected entry has non-numeric values (top-level validator)", async () => {
    await expect(
      GenericObjectIncident.create(
        baseFields({
          objectsDetected: [{ bag: "many" }], // string, not number
        })
      )
    ).rejects.toThrow(/numeric/);
  });

  it("rejects when a timeSeries.objectsDetected entry has non-numeric values (nested validator)", async () => {
    await expect(
      GenericObjectIncident.create(
        baseFields({
          objectsDetected: [{ bag: 1 }],
          timeSeries: [{ objectsDetected: [{ box: null }] }], // null, not number
        })
      )
    ).rejects.toThrow(/numeric/);
  });
});
