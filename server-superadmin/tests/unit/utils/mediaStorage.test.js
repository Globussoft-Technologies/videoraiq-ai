import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PassThrough, Readable } from "stream";

const mocks = vi.hoisted(() => ({
  s3Send: vi.fn(),
  s3Clients: [],
  sftpDelete: vi.fn(),
  withSFTPConnection: vi.fn(),
  StorageCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    constructor(options) {
      mocks.s3Clients.push(options);
    }
    send(command) {
      return mocks.s3Send(command);
    }
  },
  PutObjectCommand: mocks.StorageCommand,
  GetObjectCommand: mocks.StorageCommand,
  HeadObjectCommand: mocks.StorageCommand,
  DeleteObjectCommand: mocks.StorageCommand,
}));

vi.mock("config", () => ({
  default: {
    has: vi.fn(() => true),
    get: vi.fn((key) => key === "MediaStorage" ? ({
      provider: "nas",
      aws: {
        region: "ap-south-1",
        bucket: "aws-bucket",
        accessKeyId: "aws-access-key",
        secretAccessKey: "aws-secret-key",
      },
      gcp: {
        region: "auto",
        bucket: "gcp-bucket",
        accessKeyId: "gcp-hmac-key",
        secretAccessKey: "gcp-hmac-secret",
        endpoint: "https://storage.googleapis.com",
      },
      oracle: {
        region: "test-region",
        namespace: "test-namespace",
        bucket: "test-bucket",
        accessKeyId: "test-access-key",
        secretAccessKey: "test-secret-key",
        endpoint: "https://object-storage.test",
      },
    }) : "/nas"),
  },
}));

vi.mock("../../../utils/logger.js", () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock("../../../utils/newSFTPConnectionCheck.js", () => ({
  withSFTPConnection: mocks.withSFTPConnection,
}));

const { deleteMedia, getActiveProvider, putMedia, streamMedia } = await import(
  "../../../utils/mediaStorage.js"
);
const originalProvider = process.env.MEDIA_STORAGE_PROVIDER;

beforeEach(() => {
  mocks.s3Send.mockReset().mockResolvedValue({});
  mocks.sftpDelete.mockReset().mockResolvedValue(undefined);
  mocks.withSFTPConnection
    .mockReset()
    .mockImplementation((callback) => callback({ delete: mocks.sftpDelete }));
  delete process.env.MEDIA_STORAGE_PROVIDER;
});

afterAll(() => {
  if (originalProvider === undefined) {
    delete process.env.MEDIA_STORAGE_PROVIDER;
  } else {
    process.env.MEDIA_STORAGE_PROVIDER = originalProvider;
  }
});

describe("deleteMedia storage routing", () => {
  it("deletes a normal media path from NAS when NAS is active", async () => {
    process.env.MEDIA_STORAGE_PROVIDER = "nas";

    await deleteMedia("/uploads/images/camera-1/image.jpg");

    expect(mocks.sftpDelete).toHaveBeenCalledWith(
      "/uploads/images/camera-1/image.jpg"
    );
    expect(mocks.s3Send).not.toHaveBeenCalled();
  });

  it("deletes a migrated, non-prefixed media path from Oracle when Oracle is active", async () => {
    process.env.MEDIA_STORAGE_PROVIDER = "oracle";

    await deleteMedia("/uploads/images/camera-1/image.jpg");

    expect(mocks.s3Send).toHaveBeenCalledTimes(2);
    expect(mocks.s3Send.mock.calls[1][0].input).toEqual({
      Bucket: "test-bucket",
      Key: "uploads/images/camera-1/image.jpg",
    });
    expect(mocks.withSFTPConnection).not.toHaveBeenCalled();
  });

  it("honours an explicit Oracle path even when NAS is active", async () => {
    process.env.MEDIA_STORAGE_PROVIDER = "nas";

    await deleteMedia("oracle/uploads/images/camera-1/image.jpg");

    expect(mocks.s3Send.mock.calls[0][0].input).toEqual({
      Bucket: "test-bucket",
      Key: "oracle/uploads/images/camera-1/image.jpg",
    });
    expect(mocks.withSFTPConnection).not.toHaveBeenCalled();
  });
});

describe("global cloud providers", () => {
  it("uploads to native AWS S3 and marks the stored path", async () => {
    process.env.MEDIA_STORAGE_PROVIDER = "aws";

    const storedPath = await putMedia({
      buffer: Buffer.from("image"),
      mediaType: "image",
      folderName: "camera-1",
      originalName: "photo.jpg",
    });

    expect(storedPath).toMatch(/^\/aws\/uploads\/images\/camera-1\/.+-photo\.jpg$/);
    expect(mocks.s3Send.mock.calls[0][0].input).toMatchObject({
      Bucket: "aws-bucket",
      Key: storedPath.slice(1),
      ContentType: "image/jpeg",
    });
  });

  it("uploads to GCP through its S3-compatible endpoint with HMAC credentials", async () => {
    process.env.MEDIA_STORAGE_PROVIDER = "gcp";

    const storedPath = await putMedia({
      buffer: Buffer.from("report"),
      mediaType: "report",
      folderName: "admin-1",
      originalName: "report.pdf",
    });

    expect(storedPath).toMatch(/^\/gcp\/uploads\/reports\/admin-1\/.+-report\.pdf$/);
    expect(mocks.s3Send.mock.calls[0][0].input).toMatchObject({
      Bucket: "gcp-bucket",
      Key: storedPath.slice(1),
      ContentType: "application/pdf",
    });
    expect(mocks.s3Clients).toContainEqual({
      region: "auto",
      endpoint: "https://storage.googleapis.com",
      forcePathStyle: true,
      credentials: {
        accessKeyId: "gcp-hmac-key",
        secretAccessKey: "gcp-hmac-secret",
      },
    });
  });

  it("reads a marked AWS object even when NAS is the active provider", async () => {
    process.env.MEDIA_STORAGE_PROVIDER = "nas";
    mocks.s3Send.mockResolvedValueOnce({
      Body: Readable.from(["stored-image"]),
      ContentLength: 12,
      ContentType: "image/jpeg",
    });
    const response = new PassThrough();
    response.setHeader = vi.fn();
    const chunks = [];
    response.on("data", (chunk) => chunks.push(chunk));

    await streamMedia("/aws/uploads/images/camera-1/photo.jpg", response);

    expect(Buffer.concat(chunks).toString()).toBe("stored-image");
    expect(mocks.s3Send.mock.calls[0][0].input).toEqual({
      Bucket: "aws-bucket",
      Key: "aws/uploads/images/camera-1/photo.jpg",
    });
    expect(mocks.withSFTPConnection).not.toHaveBeenCalled();
  });

  it.each([
    ["s3", "aws"],
    ["gcs", "gcp"],
    ["oci", "oracle"],
    ["sftp", "nas"],
  ])("accepts the %s provider alias", (configured, expected) => {
    process.env.MEDIA_STORAGE_PROVIDER = configured;
    expect(getActiveProvider()).toBe(expected);
  });

  it("rejects provider typos instead of silently writing to NAS", () => {
    process.env.MEDIA_STORAGE_PROVIDER = "amazn";
    expect(() => getActiveProvider()).toThrow("Unsupported MediaStorage provider");
  });

  it("rejects unsupported media types before uploading", async () => {
    process.env.MEDIA_STORAGE_PROVIDER = "aws";
    await expect(
      putMedia({
        buffer: Buffer.from("x"),
        mediaType: "archive",
        folderName: "x",
        originalName: "x.zip",
      })
    ).rejects.toThrow("Invalid media type");
    expect(mocks.s3Send).not.toHaveBeenCalled();
  });
});
