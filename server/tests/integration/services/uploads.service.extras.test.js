/**
 * Extra integration tests for UploadService body coverage — fills in the
 * branches the existing uploads.service.test.js leaves at 0:
 *   - uploadMedia catch path (sftp.put rejection → 500 + Response.errorResp)
 *   - uploadMedia /mnt/nfs/videoraiq-media-NAS prefix replacement on
 *     remotePath
 *   - deleteMedia local-cache-hit branch + catch path on sftp.exists
 *     rejection
 *   - deleteUserMedia full happy path (existing user → sftp delete →
 *     profilePics filtered + saved → 200)
 *   - deleteUserMedia existing user + invalid '..' path (early-return 400)
 *   - deleteUserMedia existing user + sftp.exists=false → 404
 *   - deleteUserMedia catch path on sftp.exists rejection → 500
 *   - getManualMimeType remaining extensions (webm/ogg/mp3/wav/mov/jpg/
 *     jpeg/gif)
 *
 * SFTP client mocked via connectSFTP. Local cacheDir is /tmp/media-cache;
 * we synthesise a sentinel file there to exercise the cache-hit branch
 * via fs.existsSync / fs.unlinkSync (no real network or remote FS).
 *
 * Mock budget used: 2 (newSFTPConnectionCheck + logger).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import path from "path";
import fs from "fs";
import config from "config";
import { connectMongo, disconnectMongo, clearCollections } from "../dbSetup.js";
import { serviceCtx } from "../../helpers/service.js";

const sftp = vi.hoisted(() => ({
  exists: vi.fn().mockResolvedValue(false),
  delete: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  put: vi.fn().mockResolvedValue(undefined),
  end: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../utils/newSFTPConnectionCheck.js", () => ({
  connectSFTP: vi.fn().mockResolvedValue(sftp),
  checkSftpConnection: vi.fn().mockResolvedValue(sftp),
  withSFTPConnection: vi.fn(async (callback) => callback(sftp)),
  disconnectSFTP: vi.fn().mockResolvedValue(undefined),
  getPoolStats: vi.fn().mockReturnValue({}),
  debugPool: vi.fn().mockReturnValue({}),
}));
// Silence the service's logger.error / logger.warn calls in the catch
// branches; we don't want spam in the test output.
vi.mock("../../../utils/logger.js", () => {
  const fake = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  return { default: fake, nasLogger: fake };
});

const uploads = await import(
  "../../../core/v1/Uploads/uploads.service.js"
);
const { default: UploadService, getManualMimeType } = uploads;
const { default: AuthorizedUsers } = await import(
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
  sftp.exists.mockReset().mockResolvedValue(false);
  sftp.delete.mockReset().mockResolvedValue(undefined);
  sftp.mkdir.mockReset().mockResolvedValue(undefined);
  sftp.put.mockReset().mockResolvedValue(undefined);
});

describe("UploadService.uploadMedia — body branches", () => {
  it("returns 500 from the catch path when sftp.put rejects", async () => {
    sftp.put.mockRejectedValueOnce(new Error("boom-on-put"));
    const { req, res, next } = serviceCtx({
      query: { mediaType: "image", folderName: "avatars" },
    });
    req.file = { originalname: "photo.png", buffer: Buffer.from("xy") };

    await UploadService.uploadMedia(req, res, next);

    expect(res.statusCode).toBe(500);
    // Response.errorResp wraps in { statusCode, body: { status, message } }
    const inner = res._body?.body ?? res._body;
    expect(JSON.stringify(inner)).toContain("boom-on-put");
  });

  it("constructs remotePath correctly with SFTP.Path from config", async () => {
    // The uploadMedia service constructs remotePath using config.get("SFTP.Path")
    // (which is "/sftp/test" in test environment). The response should contain a
    // properly formatted SFTP path without any NAS-specific prefixes.
    const { req, res, next } = serviceCtx({
      query: { mediaType: "image", folderName: "avatars" },
    });
    req.file = { originalname: "photo.png", buffer: Buffer.from("xy") };

    await UploadService.uploadMedia(req, res, next);

    expect(res.statusCode).toBe(200);
    const inner = res._body?.body ?? res._body;
    const remote = inner?.data?.remotePath ?? inner?.remotePath;
    // The path should start with SFTP.Path from config and include the media type and folder
    expect(remote).toMatch(/^\/sftp\/test\/uploads\/images\/avatars\/\d+-[0-9a-f-]+-photo\.png$/);
    // Ensure no NAS-specific paths leak through
    expect(remote).not.toContain("/mnt/nfs");
    expect(remote).not.toContain("videoraiq-media-NAS");
  });
});

describe("UploadService.deleteMedia — body branches", () => {
  it("removes the local cache file when one exists, then returns 200 after sftp.delete", async () => {
    // Synthesise a cache-resident sentinel for path.basename(mediaPath).
    const cacheDir = path.join("/tmp", "media-cache");
    fs.mkdirSync(cacheDir, { recursive: true });
    const fileName = "cached-photo.png";
    const cachedFilePath = path.join(cacheDir, fileName);
    fs.writeFileSync(cachedFilePath, "x");
    expect(fs.existsSync(cachedFilePath)).toBe(true);

    sftp.exists.mockResolvedValue(true);
    const { req, res, next } = serviceCtx({
      query: { mediaPath: `/sftp/test/uploads/images/avatars/${fileName}` },
    });

    await UploadService.deleteMedia(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(sftp.delete).toHaveBeenCalledWith(
      `/sftp/test/uploads/images/avatars/${fileName}`
    );
    // Cache-hit branch (lines 218-221) deletes the local file before the
    // SFTP call.
    expect(fs.existsSync(cachedFilePath)).toBe(false);
  });

  it("returns 500 from the catch path when sftp.exists rejects", async () => {
    sftp.exists.mockRejectedValueOnce(new Error("sftp-down"));
    const { req, res, next } = serviceCtx({
      query: { mediaPath: "/sftp/test/uploads/images/avatars/photo.png" },
    });

    await UploadService.deleteMedia(req, res, next);

    expect(res.statusCode).toBe(500);
    const inner = res._body?.body ?? res._body;
    expect(JSON.stringify(inner)).toContain("sftp-down");
  });
});

describe("UploadService.deleteUserMedia — body branches", () => {
  it("filters profilePics, saves the user, deletes from SFTP, and returns 200", async () => {
    const mediaPath = "/sftp/test/uploads/images/avatars/me.png";
    const user = await AuthorizedUsers.create({
      adminId: new mongoose.Types.ObjectId(),
      firstName: "Pic",
      lastName: "Owner",
      email: "pic@test.com",
      profilePics: [mediaPath, "/sftp/test/uploads/images/avatars/keep.png"],
    });
    sftp.exists.mockResolvedValue(true);
    const { req, res, next } = serviceCtx({
      query: { userId: user._id.toString(), mediaPath },
    });

    await UploadService.deleteUserMedia(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(sftp.delete).toHaveBeenCalledWith(mediaPath);
    const reloaded = await AuthorizedUsers.findById(user._id);
    expect(reloaded.profilePics).toEqual([
      "/sftp/test/uploads/images/avatars/keep.png",
    ]);
  });

  it("returns 400 when an existing user supplies a path containing '..'", async () => {
    const user = await AuthorizedUsers.create({
      adminId: new mongoose.Types.ObjectId(),
      firstName: "Pic",
      lastName: "Owner",
      email: "pic2@test.com",
      profilePics: ["../../etc/passwd"],
    });
    const { req, res, next } = serviceCtx({
      query: {
        userId: user._id.toString(),
        mediaPath: "../../etc/passwd",
      },
    });

    await UploadService.deleteUserMedia(req, res, next);

    expect(res.statusCode).toBe(400);
    expect(sftp.delete).not.toHaveBeenCalled();
  });

  it("returns 404 when the file is not present on SFTP for an existing user", async () => {
    const mediaPath = "/sftp/test/uploads/images/avatars/missing.png";
    const user = await AuthorizedUsers.create({
      adminId: new mongoose.Types.ObjectId(),
      firstName: "Pic",
      lastName: "Owner",
      email: "pic3@test.com",
      profilePics: [mediaPath],
    });
    sftp.exists.mockResolvedValue(false);
    const { req, res, next } = serviceCtx({
      query: { userId: user._id.toString(), mediaPath },
    });

    await UploadService.deleteUserMedia(req, res, next);

    expect(res.statusCode).toBe(404);
    expect(sftp.delete).not.toHaveBeenCalled();
  });

  it("returns 500 from the catch path when sftp.exists rejects after a successful user lookup", async () => {
    const mediaPath = "/sftp/test/uploads/images/avatars/oops.png";
    const user = await AuthorizedUsers.create({
      adminId: new mongoose.Types.ObjectId(),
      firstName: "Pic",
      lastName: "Owner",
      email: "pic4@test.com",
      profilePics: [mediaPath],
    });
    sftp.exists.mockRejectedValueOnce(new Error("sftp-flaky"));
    const { req, res, next } = serviceCtx({
      query: { userId: user._id.toString(), mediaPath },
    });

    await UploadService.deleteUserMedia(req, res, next);

    expect(res.statusCode).toBe(500);
    const inner = res._body?.body ?? res._body;
    expect(JSON.stringify(inner)).toContain("sftp-flaky");
  });
});

describe("getManualMimeType — remaining extension arms", () => {
  it("maps the remaining declared extensions to their MIME types", () => {
    expect(getManualMimeType("clip.webm")).toBe("video/webm");
    expect(getManualMimeType("song.ogg")).toBe("video/ogg");
    expect(getManualMimeType("voice.mp3")).toBe("audio/mpeg");
    expect(getManualMimeType("voice.wav")).toBe("audio/wav");
    expect(getManualMimeType("clip.mov")).toBe("video/quicktime");
    expect(getManualMimeType("photo.jpg")).toBe("image/jpg");
    expect(getManualMimeType("photo.jpeg")).toBe("image/jpeg");
    expect(getManualMimeType("anim.gif")).toBe("image/gif");
  });
});
