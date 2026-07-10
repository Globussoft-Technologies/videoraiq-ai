/**
 * Integration test for the authorizedObjects + DetectionObjects models.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";

const { default: AuthorizedObjects } = await import(
  "../../../core/v1/authorizedObjects/authorizedObjects.model.js"
);
const { default: DetectionObjects } = await import(
  "../../../core/v1/detectionObjects/objects.model.js"
);

beforeAll(async () => {
  await connectMongo();
  await AuthorizedObjects.syncIndexes();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
});

describe("authorizedObjects model", () => {
  const admin = new mongoose.Types.ObjectId();

  it("requires admin and objectType", async () => {
    await expect(
      AuthorizedObjects.create({ objectType: "ppe" })
    ).rejects.toThrow();
    await expect(AuthorizedObjects.create({ admin })).rejects.toThrow();
  });

  it("trims objectType and objectNames", async () => {
    const o = await AuthorizedObjects.create({
      admin,
      objectType: "  ppe  ",
      objectNames: ["  helmet  "],
    });
    expect(o.objectType).toBe("ppe");
    expect(o.objectNames[0]).toBe("helmet");
  });

  it("enforces unique (admin, objectType)", async () => {
    await AuthorizedObjects.create({ admin, objectType: "ppe" });
    await expect(
      AuthorizedObjects.create({ admin, objectType: "ppe" })
    ).rejects.toThrow();
  });

  it("allows the same objectType under a different admin", async () => {
    await AuthorizedObjects.create({ admin, objectType: "ppe" });
    await expect(
      AuthorizedObjects.create({
        admin: new mongoose.Types.ObjectId(),
        objectType: "ppe",
      })
    ).resolves.toBeDefined();
  });
});

describe("DetectionObjects model", () => {
  it("requires settingType", async () => {
    await expect(
      DetectionObjects.create({ objects: ["helmet"] })
    ).rejects.toThrow();
  });

  it("only allows settingType from the enum", async () => {
    await expect(
      DetectionObjects.create({ settingType: "weaponDetection" })
    ).rejects.toThrow();
    await expect(
      DetectionObjects.create({ settingType: "crowdDetection" })
    ).resolves.toBeDefined();
  });

  it("stores the objects string array", async () => {
    const d = await DetectionObjects.create({
      settingType: "personalProtectiveEquipment",
      objects: ["helmet", "vest"],
    });
    expect(d.objects).toEqual(["helmet", "vest"]);
  });
});
