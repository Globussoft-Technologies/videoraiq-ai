/**
 * Integration test for the Channel Mongoose model.
 *
 * APP_ENV=local in the test config → the local schema (streamingPath +
 * localChannelId). Notably verifies the pre-save hook that derives `control`
 * from whether any detection is enabled.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";

const { default: Channel } = await import(
  "../../../core/v1/channels/channels.model.js"
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

describe("Channel model (local schema)", () => {
  const base = () => ({
    nvrId: new mongoose.Types.ObjectId(),
    userId: "user-1",
    streamingPath: "/Streaming/Channels/101",
    localChannelId: "1",
    name: "Lobby Cam",
  });

  it("requires nvrId, userId, streamingPath, localChannelId", async () => {
    for (const key of ["nvrId", "userId", "streamingPath", "localChannelId"]) {
      const body = base();
      delete body[key];
      await expect(Channel.create(body)).rejects.toThrow();
    }
  });

  it("creates with defaults — detectionStatus 0, control 0, checkType none", async () => {
    const c = await Channel.create(base());
    expect(c.detectionStatus).toBe(0);
    expect(c.control).toBe(0);
    expect(c.checkType).toBe("none");
    expect(c.alerts).toEqual([]);
  });

  it("pre-save hook sets control=1 when a detection is enabled", async () => {
    const c = await Channel.create({
      ...base(),
      detections: { countPersonsSettings: { enabled: true } },
    });
    expect(c.control).toBe(1);
  });

  it("pre-save hook keeps control=0 when all detections are disabled", async () => {
    const c = await Channel.create({
      ...base(),
      detections: { countPersonsSettings: { enabled: false } },
    });
    expect(c.control).toBe(0);
  });

  it("rejects an invalid checkType", async () => {
    await expect(
      Channel.create({ ...base(), checkType: "sideways" })
    ).rejects.toThrow();
  });

  it("rejects a detectionStatus outside the enum", async () => {
    await expect(
      Channel.create({ ...base(), detectionStatus: 9 })
    ).rejects.toThrow();
  });
});
