import { afterEach, describe, expect, it } from "vitest";
import {
  adminStorageFeatureEnabled,
  parseV2StoragePath,
  publicStorageSummary,
} from "../../../core/v2/adminStorage/adminStorage.resolver.js";
import { storageConfigSchema } from "../../../core/v2/adminStorage/adminStorage.validation.js";

const originalFlag = process.env.ADMIN_STORAGE_CONFIG_ENABLED;

afterEach(() => {
  if (originalFlag === undefined) delete process.env.ADMIN_STORAGE_CONFIG_ENABLED;
  else process.env.ADMIN_STORAGE_CONFIG_ENABLED = originalFlag;
});

describe("admin storage v2", () => {
  it("extracts immutable owner, version and provider identity from object paths", () => {
    const parsed = parseV2StoragePath(
      "/v2/507f1f77bcf86cd799439011/507f191e810c19729de860ea/oracle/uploads/images/a/file.jpg",
    );
    expect(parsed).toEqual({
      adminId: "507f1f77bcf86cd799439011",
      versionId: "507f191e810c19729de860ea",
      provider: "oracle",
      relativeKey: "v2/507f1f77bcf86cd799439011/507f191e810c19729de860ea/oracle/uploads/images/a/file.jpg",
    });
  });

  it("recognises ENV-version NAS paths below an arbitrary base directory", () => {
    expect(parseV2StoragePath(
      "/mnt/media/v2/507f1f77bcf86cd799439011/env/nas/uploads/videos/a/file.mp4",
    )?.versionId).toBe("env");
  });

  it("lets the deployment explicitly disable or enable the feature", () => {
    process.env.ADMIN_STORAGE_CONFIG_ENABLED = "false";
    expect(adminStorageFeatureEnabled()).toBe(false);
    process.env.ADMIN_STORAGE_CONFIG_ENABLED = "true";
    expect(adminStorageFeatureEnabled()).toBe(true);
  });

  it("never returns credentials in the public summary", () => {
    const summary = publicStorageSummary({
      source: "admin",
      provider: "aws",
      config: { bucket: "media", accessKeyId: "access", secretAccessKey: "secret" },
    });
    expect(summary).toMatchObject({ source: "admin", provider: "aws", bucket: "media", hasAccessKey: true, hasSecret: true });
    expect(summary).not.toHaveProperty("accessKeyId");
    expect(summary).not.toHaveProperty("secretAccessKey");
  });

  it("rejects provider fields that belong to another backend", () => {
    const result = storageConfigSchema.validate({
      provider: "nas", host: "nas.local", port: 22, username: "u", password: "p",
      basePath: "/media", bucket: "not-allowed",
    });
    expect(result.error).toBeTruthy();
  });
});
