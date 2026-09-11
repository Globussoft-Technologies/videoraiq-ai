import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import AdminStorageConfig from "../../../core/v2/adminStorage/adminStorage.model.js";
import { resolveStorageConfig } from "../../../core/v2/adminStorage/adminStorage.resolver.js";
import { encryptData } from "../../../utils/cryptoUtils.js";

const originalFlag = process.env.ADMIN_STORAGE_CONFIG_ENABLED;

beforeAll(connectMongo);
beforeEach(async () => {
  await clearCollections();
  process.env.ADMIN_STORAGE_CONFIG_ENABLED = "true";
});
afterAll(async () => {
  if (originalFlag === undefined) delete process.env.ADMIN_STORAGE_CONFIG_ENABLED;
  else process.env.ADMIN_STORAGE_CONFIG_ENABLED = originalFlag;
  await disconnectMongo();
});

describe("AdminStorageConfig", () => {
  it("resolves an encrypted active version and keeps older versions addressable", async () => {
    const adminId = new mongoose.Types.ObjectId();
    const doc = new AdminStorageConfig({ adminId });
    const first = doc.versions.create({
      provider: "aws",
      encryptedConfig: encryptData({ region: "one", bucket: "old", accessKeyId: "a", secretAccessKey: "s" }),
    });
    const second = doc.versions.create({
      provider: "aws",
      encryptedConfig: encryptData({ region: "two", bucket: "current", accessKeyId: "a", secretAccessKey: "s" }),
    });
    doc.versions.push(first, second);
    doc.activeVersion = second._id;
    await doc.save();

    const active = await resolveStorageConfig({ adminId });
    expect(active.source).toBe("admin");
    expect(active.config.bucket).toBe("current");

    const oldPath = `/v2/${adminId}/${first._id}/aws/uploads/images/x/a.png`;
    const historical = await resolveStorageConfig({ storagePath: oldPath });
    expect(historical.config.bucket).toBe("old");
  });
});
