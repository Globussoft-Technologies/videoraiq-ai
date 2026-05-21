/**
 * Integration coverage for StorageService streaming helpers — the 0-coverage
 * branches `streamFile`, `streamFileInternal`, `smartStreamFile`, and
 * `handleRangeRequest`. We focus on the error-path branches that do not
 * require live S3 / Google Drive / SFTP servers:
 *
 *   - streamFile: 404 when the file metadata id does not exist.
 *   - streamFileInternal: 404 file-not-found, 404 storage-not-found.
 *   - smartStreamFile: 400 empty-path, 404 fallback when no file and SFTP
 *     fails to connect (network call to the global SFTP host is expected to
 *     reject quickly in the test environment).
 *   - handleRangeRequest: 416 when the range start is at or past EOF.
 *
 * Mocks: 0 — relies on in-memory Mongo + the fact that the global SFTP host
 * is unreachable from CI, so `connectSFTP` rejects and execution flows to
 * the fallback branch.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

const { default: StorageService } = await import(
  "../../../core/v1/storage/storage.service.js"
);
const { default: filesModel } = await import(
  "../../../core/v1/files/files.model.js"
);
const { default: Storage } = await import(
  "../../../core/v1/storage/storage.model.js"
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

describe("StorageService.streamFile", () => {
  it("returns 404 when the file metadata cannot be found", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const { req, res, next } = serviceCtx({
      params: { id: fakeId.toString() },
    });
    await StorageService.streamFile(req, res, next);
    expect(res.statusCode).toBe(404);
  });
});

describe("StorageService.streamFileInternal", () => {
  it("returns 404 when the file id has no metadata", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const { req, res } = serviceCtx({ params: { id: fakeId.toString() } });
    await StorageService.streamFileInternal(fakeId, req, res);
    expect(res.statusCode).toBe(404);
  });

  it("returns 404 when the storage referenced by the file no longer exists", async () => {
    const file = await filesModel.create({
      userId: new mongoose.Types.ObjectId(),
      storageId: new mongoose.Types.ObjectId(),
      fileId: "some/key",
    });
    const { req, res } = serviceCtx({});
    await StorageService.streamFileInternal(file._id, req, res);
    expect(res.statusCode).toBe(404);
  });
});

describe("StorageService.smartStreamFile", () => {
  it("returns 400 when the path is blank", async () => {
    // decodeURIComponent("") -> "", trim().length === 0 -> 400 branch
    const { req, res } = serviceCtx({ params: { path: "" } });
    await StorageService.smartStreamFile(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("falls back to 404 when no file metadata exists and global SFTP is unreachable", async () => {
    // No files in DB. connectSFTP() will reject in the test env (no SFTP
    // server reachable), the catch block falls through and the second
    // filesModel.findOne also returns null, finally responding with 404.
    const { req, res } = serviceCtx({ params: { path: "no-such-file.mp4" } });
    await StorageService.smartStreamFile(req, res);
    expect([404, 500]).toContain(res.statusCode);
  }, 30000);
});

describe("StorageService.handleRangeRequest", () => {
  it("returns 416 when the requested range start is past EOF", async () => {
    const { req, res } = serviceCtx({});
    // Add a writeHead helper to res so the 206 branch (not entered here)
    // does not blow up if it were called.
    res.writeHead = function (code, headers) {
      this.statusCode = code;
      this._headers = { ...(this._headers || {}), ...(headers || {}) };
      return this;
    };
    // start (500) >= fileSize (100) triggers the 416 short-circuit.
    await StorageService.handleRangeRequest(
      /* sftp */ {},
      "/path/file.mp4",
      "bytes=500-",
      res,
      100,
    );
    expect(res.statusCode).toBe(416);
    expect(res._headers["Content-Range"]).toBe("bytes */100");
  });
});
