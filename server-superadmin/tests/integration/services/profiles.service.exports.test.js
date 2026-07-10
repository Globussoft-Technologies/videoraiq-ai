/**
 * ProfilesService — coverage for the file-export success paths that the
 * existing `profiles.service.extras.test.js` deliberately skips:
 *   - exportProfile success (encrypt + write + res.download), including the
 *     download-callback error arm.
 *   - bulkExportProfiles success (archiver `output.on('close')` + res.download
 *     callback), plus the archive-error arm.
 *
 * The product code writes into `/tmp` and pipes a real `archiver` zip stream.
 * To keep the test hermetic on Windows we:
 *   - vi.mock("archiver", ...) to return a fake archive that fires
 *     `output.emit('close')` from `finalize()` (or `'error'` for the error
 *     test).
 *   - vi.spyOn the fs touch-points (writeFileSync, mkdirSync, createWriteStream,
 *     rmSync, unlinkSync) and no-op them so nothing hits the disk.
 * Then we attach a fake `res.download(...)` (Express adds it but the test
 * `makeReqRes` factory doesn't) and assert it's called with the right args.
 *
 * Mocks: 6 (1 vi.mock + 5 fs vi.spyOn).
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
import { EventEmitter } from "node:events";
import fs from "node:fs";
import mongoose from "mongoose";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx, payload } from "../../helpers/service.js";

// Hoisted: replace `archiver` with a controllable fake. Each invocation of
// `archiver("zip", ...)` returns a new archive whose `finalize()` will fire
// the configured terminal event on the most-recently-piped output stream.
const archiveState = { mode: "close" };
vi.mock("archiver", () => {
  class MockZipArchive {
    constructor() {
      this._output = null;
      this.on = vi.fn();
    }
    pipe(out) { this._output = out; return out; }
    directory = vi.fn();
    async finalize() {
      // Defer to allow the service to attach listeners after piping
      await new Promise((r) => process.nextTick(r));
      await new Promise((r) => process.nextTick(r));
      if (archiveState.mode === "error") {
        this._output?.emit("error", new Error("archive blew up"));
      } else {
        this._output?.emit("close");
      }
    }
  }
  const create = vi.fn(() => new MockZipArchive());
  return {
    ZipArchive: MockZipArchive,
    create,
    default: { create },
  };
});

const { default: ProfilesService } = await import(
  "../../../core/v1/profiles/profiles.service.js"
);
const { default: Profile } = await import(
  "../../../core/v1/profiles/profiles.model.js"
);
await import("../../../core/v1/admin/admin.model.js");
await import("../../../core/v1/users/users.model.js");

const adminId = new mongoose.Types.ObjectId();

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
  vi.restoreAllMocks();
});
beforeEach(async () => {
  await clearCollections();
  archiveState.mode = "close";
});

function seedProfile(over = {}) {
  return Profile.create({
    userType: "Admin",
    createdBy: adminId,
    user: adminId,
    basics: { profileName: "Exported" },
    ...over,
  });
}

/** Attach a Jest-spy res.download (the test factory doesn't supply one). */
function withDownload(res, cbBehavior /* "ok" | "err" */) {
  res.download = vi.fn((filePath, fileName, cb) => {
    if (cbBehavior === "err") {
      cb(new Error("download stream broke"));
    } else {
      cb();
    }
  });
  return res;
}

describe("ProfilesService.exportProfile — success path", () => {
  it("encrypts, writes, and streams the file via res.download (no callback error)", async () => {
    const writeSpy = vi
      .spyOn(fs, "writeFileSync")
      .mockImplementation(() => {});
    const unlinkSpy = vi
      .spyOn(fs, "unlinkSync")
      .mockImplementation(() => {});
    const p = await seedProfile();
    const { req, res, next } = serviceCtx({
      adminId,
      params: { id: p._id.toString() },
    });
    withDownload(res, "ok");

    await ProfilesService.exportProfile(req, res, next);

    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(writeSpy.mock.calls[0][0]).toContain(`profile_${p._id}.enc`);
    // res.download is invoked with (filePath, fileName, cb)
    expect(res.download).toHaveBeenCalledTimes(1);
    const [filePath, fileName] = res.download.mock.calls[0];
    expect(fileName).toBe(`profile_${p._id}.enc`);
    expect(filePath).toContain(`profile_${p._id}.enc`);
    // download success → unlinkSync cleans up the temp file
    expect(unlinkSpy).toHaveBeenCalledWith(filePath);

    writeSpy.mockRestore();
    unlinkSpy.mockRestore();
  });

  it("still cleans up the temp file when the download callback receives an error", async () => {
    const writeSpy = vi
      .spyOn(fs, "writeFileSync")
      .mockImplementation(() => {});
    const unlinkSpy = vi
      .spyOn(fs, "unlinkSync")
      .mockImplementation(() => {});
    const p = await seedProfile();
    const { req, res, next } = serviceCtx({
      adminId,
      params: { id: p._id.toString() },
    });
    withDownload(res, "err");

    await ProfilesService.exportProfile(req, res, next);

    expect(res.download).toHaveBeenCalledTimes(1);
    // Even on a download error the service unlinks the temp file.
    expect(unlinkSpy).toHaveBeenCalledTimes(1);

    writeSpy.mockRestore();
    unlinkSpy.mockRestore();
  });
});

describe("ProfilesService.bulkExportProfiles — success path", () => {
  it("encrypts each profile, builds the zip, and streams it via res.download", async () => {
    const writeSpy = vi
      .spyOn(fs, "writeFileSync")
      .mockImplementation(() => {});
    const mkdirSpy = vi
      .spyOn(fs, "mkdirSync")
      .mockImplementation(() => undefined);
    const rmSpy = vi
      .spyOn(fs, "rmSync")
      .mockImplementation(() => {});
    const unlinkSpy = vi
      .spyOn(fs, "unlinkSync")
      .mockImplementation(() => {});
    const fakeOutput = new EventEmitter();
    const createStreamSpy = vi
      .spyOn(fs, "createWriteStream")
      .mockImplementation(() => fakeOutput);

    const [p1, p2] = await Promise.all([
      seedProfile({ basics: { profileName: "Bulk-A" } }),
      seedProfile({ basics: { profileName: "Bulk-B" } }),
    ]);

    const { req, res, next } = serviceCtx({
      adminId,
      body: { ids: [p1._id.toString(), p2._id.toString()] },
    });
    withDownload(res, "ok");

    await ProfilesService.bulkExportProfiles(req, res, next);

    // mkdirSync once for the tempDir
    expect(mkdirSpy).toHaveBeenCalledTimes(1);
    // writeFileSync once per profile (2 here)
    expect(writeSpy).toHaveBeenCalledTimes(2);
    expect(createStreamSpy).toHaveBeenCalledTimes(1);
    // res.download was triggered from the `output.on('close')` callback
    expect(res.download).toHaveBeenCalledTimes(1);
    const [filePath, fileName] = res.download.mock.calls[0];
    expect(fileName).toMatch(/^profiles_export_\d+\.zip$/);
    expect(filePath).toContain(fileName);
    // download success → tempDir rm + zip unlink
    expect(rmSpy).toHaveBeenCalledTimes(1);
    expect(unlinkSpy).toHaveBeenCalledTimes(1);

    writeSpy.mockRestore();
    mkdirSpy.mockRestore();
    rmSpy.mockRestore();
    unlinkSpy.mockRestore();
    createStreamSpy.mockRestore();
  });

  it("cleans up even when res.download surfaces an error in its callback", async () => {
    const writeSpy = vi
      .spyOn(fs, "writeFileSync")
      .mockImplementation(() => {});
    const mkdirSpy = vi
      .spyOn(fs, "mkdirSync")
      .mockImplementation(() => undefined);
    const rmSpy = vi
      .spyOn(fs, "rmSync")
      .mockImplementation(() => {});
    const unlinkSpy = vi
      .spyOn(fs, "unlinkSync")
      .mockImplementation(() => {});
    const fakeOutput = new EventEmitter();
    const createStreamSpy = vi
      .spyOn(fs, "createWriteStream")
      .mockImplementation(() => fakeOutput);

    const p = await seedProfile();
    const { req, res, next } = serviceCtx({
      adminId,
      body: { ids: [p._id.toString()] },
    });
    withDownload(res, "err");

    await ProfilesService.bulkExportProfiles(req, res, next);

    expect(res.download).toHaveBeenCalledTimes(1);
    expect(rmSpy).toHaveBeenCalledTimes(1);
    expect(unlinkSpy).toHaveBeenCalledTimes(1);

    writeSpy.mockRestore();
    mkdirSpy.mockRestore();
    rmSpy.mockRestore();
    unlinkSpy.mockRestore();
    createStreamSpy.mockRestore();
  });
});

describe("ProfilesService.exportProfile — write failure falls into the catch", () => {
  it("returns 500 when fs.writeFileSync throws", async () => {
    const writeSpy = vi
      .spyOn(fs, "writeFileSync")
      .mockImplementation(() => {
        throw new Error("ENOSPC: disk full");
      });
    const p = await seedProfile();
    const { req, res, next } = serviceCtx({
      adminId,
      params: { id: p._id.toString() },
    });
    // No res.download wired — the catch handles the write throw before
    // res.download is reached, so a 500 JSON response is emitted instead.

    await ProfilesService.exportProfile(req, res, next);

    expect(res.statusCode).toBe(500);
    expect(payload(res).status).toBe("failed");
    writeSpy.mockRestore();
  });
});
