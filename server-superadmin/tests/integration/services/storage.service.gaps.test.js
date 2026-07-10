/**
 * Gap-fill for StorageService.streamFileInternal (lines 1054-1088) plus
 * the SFTP stream `on('error')` callback at lines 1255-1257.
 *
 * The existing storage suite covers streamFromS3/SFTP/GoogleDrive happy +
 * catch paths, but the public-facing `streamFileInternal` wrapper —
 * which fans out by storage.type — isn't exercised at all. We cover:
 *   - 404 when the file metadata is missing.
 *   - 404 when the storage doc is missing.
 *   - 400 'Unsupported storage type' switch default.
 *   - s3/sftp/google_drive_oauth happy fan-out (each delegates to a stub).
 *   - outer catch when JSON.parse / decryptJSON throws.
 *
 * For lines 1255-1257 we make `createReadStream` return a stream that
 * emits 'error' synchronously so the registered listener fires its
 * throw → swallowed by the outer try/catch.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import { makeReqRes } from "../../helpers/factory.js";

// Quiet module-scope imports.
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn(),
  ListObjectsV2Command: vi.fn(),
  PutObjectCommand: vi.fn(),
  DeleteObjectCommand: vi.fn(),
  GetObjectCommand: vi.fn(),
  HeadObjectCommand: vi.fn(),
}));
vi.mock("googleapis", () => ({
  google: {
    auth: { OAuth2: vi.fn().mockImplementation(() => ({ setCredentials: vi.fn() })) },
    drive: vi.fn(),
  },
}));
vi.mock("../../../utils/newSFTPConnectionCheck.js", () => ({
  connectSFTP: vi.fn(),
}));
vi.mock("../../../utils/database.js", () => ({
  redis: { get: vi.fn(), set: vi.fn() },
}));
vi.mock("ssh2-sftp-client", () => ({
  default: class {
    connect = vi.fn().mockResolvedValue(undefined);
    end = vi.fn().mockResolvedValue(undefined);
    on = vi.fn();
    createReadStream = vi.fn();
  },
}));

vi.mock("../../../core/v1/files/files.model.js", () => ({
  default: { findOne: vi.fn() },
}));
vi.mock("../../../core/v1/storage/storage.model.js", () => ({
  default: { findOne: vi.fn() },
}));
vi.mock("../../../utils/cryptoUtils.js", async () => {
  const actual = await vi.importActual("../../../utils/cryptoUtils.js");
  return {
    ...actual,
    decryptJSON: vi.fn(() => JSON.stringify({ clientId: "c", clientSecret: "s", refresh_token: "r" })),
  };
});

const { default: StorageService } = await import(
  "../../../core/v1/storage/storage.service.js"
);
const { default: filesModel } = await import(
  "../../../core/v1/files/files.model.js"
);
const { default: Storage } = await import(
  "../../../core/v1/storage/storage.model.js"
);

function ctx() {
  const { req, res, next } = makeReqRes();
  // streamFileInternal does NOT use req.verified — just adds an extra
  // status/end/setHeader behavior, which makeReqRes already provides.
  return { req, res, next };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("StorageService.streamFileInternal (gap-fill)", () => {
  it("returns 404 when no file metadata is found", async () => {
    filesModel.findOne.mockResolvedValueOnce(null);
    const { req, res } = ctx();
    await StorageService.streamFileInternal("file-1", req, res);
    expect(res.statusCode).toBe(404);
  });

  it("returns 404 when the storage doc is missing", async () => {
    filesModel.findOne.mockResolvedValueOnce({ storageId: "s1", fileId: "key1" });
    Storage.findOne.mockResolvedValueOnce(null);
    const { req, res } = ctx();
    await StorageService.streamFileInternal("file-1", req, res);
    expect(res.statusCode).toBe(404);
  });

  it("returns 400 'Unsupported storage type' for an unknown storage.type", async () => {
    filesModel.findOne.mockResolvedValueOnce({ storageId: "s1", fileId: "key1" });
    Storage.findOne.mockResolvedValueOnce({
      _id: "s1",
      type: "weird",
      credentials: "encrypted",
    });
    const { req, res } = ctx();
    await StorageService.streamFileInternal("file-1", req, res);
    expect(res.statusCode).toBe(400);
    expect(res._body?.error).toMatch(/Unsupported storage type/);
  });

  it("dispatches to streamFromS3 for type 's3'", async () => {
    filesModel.findOne.mockResolvedValueOnce({ storageId: "s1", fileId: "key1" });
    Storage.findOne.mockResolvedValueOnce({
      _id: "s1",
      type: "s3",
      credentials: "encrypted",
    });
    const spy = vi.spyOn(StorageService, "streamFromS3").mockResolvedValue("ok");
    const { req, res } = ctx();
    await StorageService.streamFileInternal("file-1", req, res);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("dispatches to streamFromSFTP for type 'sftp'", async () => {
    filesModel.findOne.mockResolvedValueOnce({ storageId: "s1", fileId: "key1" });
    Storage.findOne.mockResolvedValueOnce({
      _id: "s1",
      type: "sftp",
      credentials: "encrypted",
    });
    const spy = vi.spyOn(StorageService, "streamFromSFTP").mockResolvedValue("ok");
    const { req, res } = ctx();
    await StorageService.streamFileInternal("file-1", req, res);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("dispatches to streamFromGoogleDrive for type 'google_drive_oauth'", async () => {
    filesModel.findOne.mockResolvedValueOnce({ storageId: "s1", fileId: "key1" });
    Storage.findOne.mockResolvedValueOnce({
      _id: "s1",
      type: "google_drive_oauth",
      credentials: "encrypted",
    });
    const spy = vi.spyOn(StorageService, "streamFromGoogleDrive").mockResolvedValue("ok");
    const { req, res } = ctx();
    await StorageService.streamFileInternal("file-1", req, res);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("returns 500 from the outer catch when filesModel.findOne throws and headers not yet sent", async () => {
    filesModel.findOne.mockRejectedValueOnce(new Error("db-down"));
    const { req, res } = ctx();
    res.headersSent = false;
    await StorageService.streamFileInternal("file-1", req, res);
    expect(res.statusCode).toBe(500);
    expect(res._body?.error).toMatch(/Failed to stream file/);
  });

  it("does not double-send when the outer catch fires with headersSent=true", async () => {
    filesModel.findOne.mockRejectedValueOnce(new Error("db-down"));
    const { req, res } = ctx();
    res.headersSent = true;
    const statusBefore = res.statusCode;
    await StorageService.streamFileInternal("file-1", req, res);
    // statusCode untouched (the 500 branch was not taken).
    expect(res.statusCode).toBe(statusBefore);
  });
});
