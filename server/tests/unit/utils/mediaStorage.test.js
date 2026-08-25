import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  s3Send: vi.fn(),
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
    get: vi.fn(() => ({
      provider: "nas",
      oracle: {
        region: "test-region",
        namespace: "test-namespace",
        bucket: "test-bucket",
        accessKeyId: "test-access-key",
        secretAccessKey: "test-secret-key",
        endpoint: "https://object-storage.test",
      },
    })),
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

const { deleteMedia } = await import("../../../utils/mediaStorage.js");
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

    expect(mocks.s3Send).toHaveBeenCalledTimes(1);
    expect(mocks.s3Send.mock.calls[0][0].input).toEqual({
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
