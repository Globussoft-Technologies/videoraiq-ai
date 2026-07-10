/**
 * Integration test for the Location Mongoose model.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";

const { default: Location } = await import(
  "../../../core/v1/locations/location.model.js"
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

describe("Location model", () => {
  const adminId = new mongoose.Types.ObjectId();

  it("requires locationName and adminId", async () => {
    await expect(Location.create({ adminId })).rejects.toThrow();
    await expect(
      Location.create({ locationName: "HQ" })
    ).rejects.toThrow();
  });

  it("creates with defaults", async () => {
    const loc = await Location.create({ adminId, locationName: "Head Office" });
    expect(loc.isImportedFromEMP).toBe(false);
    expect(loc.createdAt).toBeInstanceOf(Date);
  });

  it("trims locationName", async () => {
    const loc = await Location.create({
      adminId,
      locationName: "  Warehouse  ",
    });
    expect(loc.locationName).toBe("Warehouse");
  });

  it("a plain find returns all docs (access hook skipped without memberId)", async () => {
    await Location.create({ adminId, locationName: "A" });
    await Location.create({ adminId, locationName: "B" });
    expect(await Location.find({})).toHaveLength(2);
  });
});
