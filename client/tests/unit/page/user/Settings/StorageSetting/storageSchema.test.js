/**
 * src/page/user/Settings/StorageSetting/schema/Storage.jsx — yup schema with
 * conditional `when(storageType, ...)` branches for sftp / google_drive_oauth
 * / s3. Pure schema, no mocks.
 *
 * Goal: exercise each branch (name baseline, sftp branch, google branch,
 * s3 branch) plus the "not required when type doesn't match" path.
 */
import { describe, it, expect } from "vitest";
import { storageSchema } from "../../../../../../src/page/user/Settings/StorageSetting/schema/Storage.jsx";

describe("page/StorageSetting storageSchema", () => {
  it("requires `name` regardless of storageType", async () => {
    // No storageType -> conditional fields are all optional, so the only
    // remaining required field is `name`.
    await expect(
      storageSchema.validate({ name: "" })
    ).rejects.toThrow(/Name is required/);
  });

  it("trims and accepts a non-empty name with no storageType", async () => {
    // No storageType -> all conditional fields are optional.
    const result = await storageSchema.validate({ name: "  primary  " });
    expect(result.name).toBe("primary");
  });

  describe("sftp branch", () => {
    const base = {
      name: "s",
      storageType: "sftp",
      path: "/data",
      port: 22,
      password: "pw",
      username: "u",
      host: "h",
    };

    it("accepts a full sftp payload", async () => {
      await expect(storageSchema.validate(base)).resolves.toMatchObject({
        storageType: "sftp",
        host: "h",
      });
    });

    it("rejects when sftp host is missing", async () => {
      await expect(
        storageSchema.validate({ ...base, host: undefined })
      ).rejects.toThrow(/Host is required/);
    });

    it("rejects when sftp username is missing", async () => {
      await expect(
        storageSchema.validate({ ...base, username: undefined })
      ).rejects.toThrow(/Username is required/);
    });

    it("rejects when sftp password is missing", async () => {
      await expect(
        storageSchema.validate({ ...base, password: undefined })
      ).rejects.toThrow(/Password is required/);
    });

    it("rejects when sftp path is missing", async () => {
      await expect(
        storageSchema.validate({ ...base, path: undefined })
      ).rejects.toThrow(/Path is required/);
    });

    it("rejects when sftp port is missing", async () => {
      await expect(
        storageSchema.validate({ ...base, port: undefined })
      ).rejects.toThrow(/Port is required/);
    });

    it("enforces port lower bound (>= 1)", async () => {
      await expect(
        storageSchema.validate({ ...base, port: 0 })
      ).rejects.toThrow(/Port must be at least 1/);
    });

    it("enforces port upper bound (<= 65535)", async () => {
      await expect(
        storageSchema.validate({ ...base, port: 70000 })
      ).rejects.toThrow(/Port must be at most 65535/);
    });
  });

  describe("google_drive_oauth branch", () => {
    const base = {
      name: "g",
      storageType: "google_drive_oauth",
      clientId: "ci",
      clientSecret: "cs",
      redirectUri: "http://x",
    };

    it("accepts a full google_drive_oauth payload", async () => {
      await expect(storageSchema.validate(base)).resolves.toMatchObject({
        storageType: "google_drive_oauth",
        clientId: "ci",
      });
    });

    it("rejects when clientId is missing", async () => {
      await expect(
        storageSchema.validate({ ...base, clientId: undefined })
      ).rejects.toThrow(/Client ID is required/);
    });

    it("rejects when clientSecret is missing", async () => {
      await expect(
        storageSchema.validate({ ...base, clientSecret: undefined })
      ).rejects.toThrow(/Client Secret is required/);
    });

    it("rejects when redirectUri is missing", async () => {
      await expect(
        storageSchema.validate({ ...base, redirectUri: undefined })
      ).rejects.toThrow(/Redirect URI is required/);
    });
  });

  describe("s3 branch", () => {
    const base = {
      name: "s3",
      storageType: "s3",
      accessKeyId: "ak",
      secretAccessKey: "sk",
      bucketName: "b",
      region: "us-east-1",
    };

    it("accepts a full s3 payload", async () => {
      await expect(storageSchema.validate(base)).resolves.toMatchObject({
        storageType: "s3",
        bucketName: "b",
      });
    });

    it("rejects when accessKeyId is missing", async () => {
      await expect(
        storageSchema.validate({ ...base, accessKeyId: undefined })
      ).rejects.toThrow(/Access Key ID is required/);
    });

    it("rejects when secretAccessKey is missing", async () => {
      await expect(
        storageSchema.validate({ ...base, secretAccessKey: undefined })
      ).rejects.toThrow(/Secret Access Key is required/);
    });

    it("rejects when bucketName is missing", async () => {
      await expect(
        storageSchema.validate({ ...base, bucketName: undefined })
      ).rejects.toThrow(/Bucket Name is required/);
    });

    it("rejects when region is missing", async () => {
      await expect(
        storageSchema.validate({ ...base, region: undefined })
      ).rejects.toThrow(/Region is required/);
    });
  });

  it("treats sftp-only fields as optional when storageType is s3", async () => {
    // No `host`, no `port`, etc — but since storageType is s3, only s3
    // fields are required.
    const result = await storageSchema.validate({
      name: "x",
      storageType: "s3",
      accessKeyId: "ak",
      secretAccessKey: "sk",
      bucketName: "b",
      region: "r",
    });
    expect(result.host).toBeUndefined();
    expect(result.port).toBeUndefined();
  });
});
