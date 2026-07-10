/**
 * Integration test for the NVR Mongoose model.
 *
 * The test config sets APP_ENV=local, so the model resolves to the *local*
 * schema (domain-based, no encryption hooks). The cloud schema's
 * encrypt-on-save behavior is not exercised here — it would need APP_ENV=cloud.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";

const { default: NVR } = await import("../../../core/v1/NVR/nvr.model.js");

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
});

describe("NVR model (local schema, APP_ENV=local)", () => {
  const base = () => ({
    userId: "user-1",
    nvrName: "Front Lobby NVR",
    brand: "hikvision",
    domain: "http://nvr.local",
    location: "HQ",
    localNvrId: "local-nvr-1",
  });

  it("requires userId, nvrName, brand, domain, location, localNvrId", async () => {
    for (const key of [
      "userId",
      "nvrName",
      "brand",
      "domain",
      "location",
      "localNvrId",
    ]) {
      const body = base();
      delete body[key];
      await expect(NVR.create(body)).rejects.toThrow();
    }
  });

  it("creates a valid local NVR with cameraCount default 0", async () => {
    const nvr = await NVR.create(base());
    expect(nvr.cameraCount).toBe(0);
    expect(nvr.createdAt).toBeInstanceOf(Date);
  });

  it("only accepts brand from the enum", async () => {
    await expect(NVR.create({ ...base(), brand: "axis" })).rejects.toThrow();
    for (const brand of ["hikvision", "dahua", "prama", "cpplus", "camera"]) {
      await expect(
        NVR.create({ ...base(), brand, localNvrId: `id-${brand}` })
      ).resolves.toBeDefined();
    }
  });

  it("a plain find returns all docs (access hook skipped without memberId)", async () => {
    await NVR.create(base());
    await NVR.create({ ...base(), localNvrId: "local-nvr-2" });
    expect(await NVR.find({})).toHaveLength(2);
  });
});
