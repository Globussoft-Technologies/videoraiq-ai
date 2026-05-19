/**
 * Integration test for UploadService — the validation branches and the
 * SFTP-delete paths against in-memory MongoDB. The SFTP client is mocked
 * (connectSFTP); fetchMedia's stream pipeline is not exercised.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
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
}));
vi.mock("../../../utils/sftpConnectionCheck.js", () => ({
  checkSftpConnection: vi.fn().mockResolvedValue(sftp),
}));

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
  sftp.exists.mockResolvedValue(false);
});

describe("UploadService.uploadMedia", () => {
  it("returns 400 for an invalid mediaType", async () => {
    const { req, res, next } = serviceCtx({ query: { mediaType: "audio" } });
    await UploadService.uploadMedia(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when folderName is missing", async () => {
    const { req, res, next } = serviceCtx({ query: { mediaType: "image" } });
    await UploadService.uploadMedia(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when no file is uploaded", async () => {
    const { req, res, next } = serviceCtx({
      query: { mediaType: "image", folderName: "avatars" },
    });
    await UploadService.uploadMedia(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for a file extension that does not match mediaType", async () => {
    const { req, res, next } = serviceCtx({
      query: { mediaType: "image", folderName: "avatars" },
    });
    req.file = { originalname: "clip.mp4", buffer: Buffer.from("x") };
    await UploadService.uploadMedia(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("uploads a valid image (200)", async () => {
    const { req, res, next } = serviceCtx({
      query: { mediaType: "image", folderName: "avatars" },
    });
    req.file = { originalname: "photo.png", buffer: Buffer.from("x") };
    await UploadService.uploadMedia(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(res._body.status).toBe("success");
    expect(sftp.put).toHaveBeenCalled();
  });
});

describe("UploadService.fetchMedia", () => {
  it("returns 400 when mediaPath is empty", async () => {
    const { req, res } = serviceCtx({ params: { mediaPath: "" } });
    await UploadService.fetchMedia(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for a path containing '..'", async () => {
    const { req, res } = serviceCtx({
      params: { mediaPath: encodeURIComponent("../../etc/passwd") },
    });
    await UploadService.fetchMedia(req, res);
    expect(res.statusCode).toBe(400);
  });
});

describe("UploadService.deleteMedia", () => {
  it("returns 400 when mediaPath is missing", async () => {
    const { req, res, next } = serviceCtx({ query: {} });
    await UploadService.deleteMedia(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for a path containing '..'", async () => {
    const { req, res, next } = serviceCtx({
      query: { mediaPath: "../../etc/passwd" },
    });
    await UploadService.deleteMedia(req, res, next);
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 when the file is not on SFTP", async () => {
    sftp.exists.mockResolvedValue(false);
    const { req, res, next } = serviceCtx({
      query: { mediaPath: "/uploads/images/avatars/photo.png" },
    });
    await UploadService.deleteMedia(req, res, next);
    expect(res.statusCode).toBe(404);
  });

  it("deletes a file that exists on SFTP (200)", async () => {
    sftp.exists.mockResolvedValue(true);
    const { req, res, next } = serviceCtx({
      query: { mediaPath: "/uploads/images/avatars/photo.png" },
    });
    await UploadService.deleteMedia(req, res, next);
    expect(res.statusCode).toBe(200);
    expect(sftp.delete).toHaveBeenCalled();
  });
});

describe("UploadService.deleteUserMedia", () => {
  it("returns 404 when the user does not exist", async () => {
    const { req, res, next } = serviceCtx({
      query: {
        userId: new mongoose.Types.ObjectId().toString(),
        mediaPath: "/uploads/images/avatars/photo.png",
      },
    });
    await UploadService.deleteUserMedia(req, res, next);
    expect(res.statusCode).toBe(404);
  });

  it("returns 400 when mediaPath is missing for an existing user", async () => {
    const user = await AuthorizedUsers.create({
      adminId: new mongoose.Types.ObjectId(),
      firstName: "Emp",
      lastName: "One",
      email: "emp@test.com",
      profilePics: [],
    });
    const { req, res, next } = serviceCtx({
      query: { userId: user._id.toString() },
    });
    await UploadService.deleteUserMedia(req, res, next);
    expect(res.statusCode).toBe(400);
  });
});

describe("getManualMimeType", () => {
  it("maps known extensions", () => {
    expect(getManualMimeType("clip.mp4")).toBe("video/mp4");
    expect(getManualMimeType("photo.png")).toBe("image/png");
    expect(getManualMimeType("doc.pdf")).toBe("application/pdf");
  });

  it("falls back to octet-stream for unknown extensions", () => {
    expect(getManualMimeType("file.xyz")).toBe("application/octet-stream");
  });
});
