/**
 * Unit coverage for core/v1/Uploads/uploads.controller.js.
 *
 * The controller is a thin pass-through to uploadsService — each handler
 * simply `return await uploadsService.<method>(req, res, next)`. We mock
 * the service module so the controller's own delegation logic is what
 * gets executed (the service itself is integration-tested elsewhere).
 *
 * Confirms that every controller method:
 *   - forwards the same (req, res, next) it received,
 *   - returns whatever the service returned,
 *   - propagates rejections from the service.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../core/v1/Uploads/uploads.service.js", () => ({
  default: {
    uploadMedia: vi.fn(),
    fetchMedia: vi.fn(),
    deleteMedia: vi.fn(),
    deleteUserMedia: vi.fn(),
  },
}));

import uploadsService from "../../../core/v1/Uploads/uploads.service.js";
const { default: uploadController } = await import(
  "../../../core/v1/Uploads/uploads.controller.js"
);
import { makeReqRes } from "../../helpers/factory.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("UploadController", () => {
  describe("uploadMedia", () => {
    it("delegates to uploadsService.uploadMedia and returns its result", async () => {
      uploadsService.uploadMedia.mockResolvedValueOnce("upload-ok");
      const { req, res, next } = makeReqRes();
      req.query = { mediaType: "image", folderName: "incidents" };

      const out = await uploadController.uploadMedia(req, res, next);

      expect(out).toBe("upload-ok");
      expect(uploadsService.uploadMedia).toHaveBeenCalledTimes(1);
      expect(uploadsService.uploadMedia).toHaveBeenCalledWith(req, res, next);
    });

    it("propagates rejections from the service", async () => {
      uploadsService.uploadMedia.mockRejectedValueOnce(new Error("disk full"));
      const { req, res, next } = makeReqRes();
      await expect(
        uploadController.uploadMedia(req, res, next)
      ).rejects.toThrow("disk full");
    });
  });

  describe("fetchMedia", () => {
    it("delegates to uploadsService.fetchMedia and returns its result", async () => {
      uploadsService.fetchMedia.mockResolvedValueOnce("media-stream");
      const { req, res, next } = makeReqRes();
      req.params = { mediaPath: "images/photo.jpg" };

      const out = await uploadController.fetchMedia(req, res, next);

      expect(out).toBe("media-stream");
      expect(uploadsService.fetchMedia).toHaveBeenCalledTimes(1);
      expect(uploadsService.fetchMedia).toHaveBeenCalledWith(req, res, next);
    });

    it("propagates rejections from the service", async () => {
      uploadsService.fetchMedia.mockRejectedValueOnce(new Error("not found"));
      const { req, res, next } = makeReqRes();
      await expect(
        uploadController.fetchMedia(req, res, next)
      ).rejects.toThrow("not found");
    });
  });

  describe("deleteMedia", () => {
    it("delegates to uploadsService.deleteMedia and returns its result", async () => {
      uploadsService.deleteMedia.mockResolvedValueOnce({ deleted: true });
      const { req, res, next } = makeReqRes();
      req.query = { mediaPath: "images/photo.jpg" };

      const out = await uploadController.deleteMedia(req, res, next);

      expect(out).toEqual({ deleted: true });
      expect(uploadsService.deleteMedia).toHaveBeenCalledTimes(1);
      expect(uploadsService.deleteMedia).toHaveBeenCalledWith(req, res, next);
    });

    it("propagates rejections from the service", async () => {
      uploadsService.deleteMedia.mockRejectedValueOnce(new Error("denied"));
      const { req, res, next } = makeReqRes();
      await expect(
        uploadController.deleteMedia(req, res, next)
      ).rejects.toThrow("denied");
    });
  });

  describe("deleteUserMedia", () => {
    it("delegates to uploadsService.deleteUserMedia and returns its result", async () => {
      uploadsService.deleteUserMedia.mockResolvedValueOnce({ ok: true });
      const { req, res, next } = makeReqRes();
      req.query = { userId: "u1", mediaPath: "u1/profile.jpg" };

      const out = await uploadController.deleteUserMedia(req, res, next);

      expect(out).toEqual({ ok: true });
      expect(uploadsService.deleteUserMedia).toHaveBeenCalledTimes(1);
      expect(uploadsService.deleteUserMedia).toHaveBeenCalledWith(
        req,
        res,
        next
      );
    });

    it("propagates rejections from the service", async () => {
      uploadsService.deleteUserMedia.mockRejectedValueOnce(
        new Error("missing user")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        uploadController.deleteUserMedia(req, res, next)
      ).rejects.toThrow("missing user");
    });

    it("each method is independent — calling one does not invoke the others", async () => {
      uploadsService.deleteUserMedia.mockResolvedValueOnce(null);
      const { req, res, next } = makeReqRes();
      await uploadController.deleteUserMedia(req, res, next);

      expect(uploadsService.uploadMedia).not.toHaveBeenCalled();
      expect(uploadsService.fetchMedia).not.toHaveBeenCalled();
      expect(uploadsService.deleteMedia).not.toHaveBeenCalled();
    });
  });
});
