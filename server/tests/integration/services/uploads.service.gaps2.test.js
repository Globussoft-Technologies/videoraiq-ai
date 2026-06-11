/**
 * Gap-fill round 2 for Uploads/uploads.service.js.
 *
 * Uncovered ranges per v8:
 *   14-17    module-load cacheDir mkdirSync — runs only when
 *            /tmp/media-cache doesn't exist. Whether covered depends on
 *            CI workspace state; non-deterministic from tests. UNREACHABLE
 *            from a stable test (and inside `if (!exists)` so the success
 *            path with cacheDir already present is the normal case).
 *   101-128  fetchMedia body — header setting + withSFTPConnection +
 *            pipeline streaming. Needs the SFTP helper mocked.
 *   183-184  deleteUserMedia cachedFilePath unlinkSync arm — runs only
 *            when fs.existsSync(cachedFilePath) is true.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

// Mock the SFTP pool so withSFTPConnection invokes our callback with a
// minimal sftp object whose createReadStream + delete + exists are spies.
const withSFTPConnectionMock = vi.fn(async (cb) =>
  cb({
    createReadStream: vi.fn(async () => {
      // Stream of one tiny chunk that ends cleanly.
      const { Readable } = await import("stream");
      const r = Readable.from(["sftp-bytes"]);
      return r;
    }),
    delete: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue("-"),
  }),
);

vi.mock("../../../utils/newSFTPConnectionCheck.js", () => ({
  withSFTPConnection: (cb) => withSFTPConnectionMock(cb),
}));

const { default: UploadService } = await import(
  "../../../core/v1/Uploads/uploads.service.js"
);
const { default: AuthUsers } = await import(
  "../../../core/v1/authorizedUsers/authorizedUsers.model.js"
);

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
  withSFTPConnectionMock.mockClear();
});

async function makeRes() {
  const { Writable } = await import("stream");
  const headers = {};
  // A real Writable lets stream.pipeline() resolve cleanly.
  const res = new Writable({
    write(chunk, enc, cb) {
      cb();
    },
  });
  res.statusCode = 200;
  res._body = undefined;
  res.headersSent = false;
  res.setHeader = (k, v) => {
    headers[k] = v;
  };
  res.getHeader = (k) => headers[k];
  res.status = function (code) {
    this.statusCode = code;
    return this;
  };
  res.json = function (payload) {
    this._body = payload;
    this.headersSent = true;
    return this;
  };
  return { res, headers };
}

describe("UploadService.fetchMedia — happy SFTP stream path (lines 101-121)", () => {
  it("sets the right Content-Type + CORS headers and pipes the SFTP stream", async () => {
    const { res } = await makeRes();
    const req = {
      params: { mediaPath: encodeURIComponent("/uploads/images/test/x.jpg") },
    };
    await UploadService.fetchMedia(req, res);
    expect(withSFTPConnectionMock).toHaveBeenCalledTimes(1);
    expect(res.getHeader("Content-Type")).toBe("image/jpg");
    expect(res.getHeader("Access-Control-Allow-Origin")).toBe("*");
  });
});

describe("UploadService.fetchMedia — outer catch (lines 123-128)", () => {
  it("responds 500 when the SFTP helper rejects before headers are sent", async () => {
    withSFTPConnectionMock.mockImplementationOnce(async () => {
      throw new Error("sftp-helper-blew-up");
    });
    const { res } = await makeRes();
    const req = {
      params: { mediaPath: encodeURIComponent("/uploads/images/x.jpg") },
    };
    await UploadService.fetchMedia(req, res);
    expect(res.statusCode).toBe(500);
    expect(res._body.message).toMatch(/Failed to fetch media/);
  });
});

describe("UploadService.deleteUserMedia — cachedFilePath unlink (lines 181-184)", () => {
  it("calls fs.unlinkSync when the cached file exists for this media", async () => {
    const user = await AuthUsers.create({
      adminId: new mongoose.Types.ObjectId(),
      firstName: "U",
      lastName: "M",
      profilePics: ["/uploads/images/UpDate/2-b.jpg"],
    });
    // Seed the local cache file the service expects.
    const cacheDir = path.join(os.tmpdir(), "..", "tmp", "media-cache");
    // The service hardcodes /tmp/media-cache. Use a stub fs.existsSync via spy.
    const existsSpy = vi.spyOn(fs, "existsSync").mockReturnValue(true);
    const unlinkSpy = vi.spyOn(fs, "unlinkSync").mockImplementation(() => {});

    const { res } = await makeRes();
    const req = {
      query: {
        mediaPath: "/uploads/images/UpDate/2-b.jpg",
        userId: user._id.toString(),
      },
    };
    await UploadService.deleteUserMedia(req, res);
    expect(unlinkSpy).toHaveBeenCalled();
    existsSpy.mockRestore();
    unlinkSpy.mockRestore();
  });
});
