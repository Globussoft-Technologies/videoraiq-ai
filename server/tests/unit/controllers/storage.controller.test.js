/**
 * Unit coverage for core/v1/storage/storage.controller.js.
 *
 * Every handler is a thin pass-through to StorageService — the controller
 * simply does `return StorageService.<method>(req, res, next)`. We mock
 * the service so we exercise only the controller's own delegation wiring
 * and catch any swapped method names.
 *
 * Style mirrors authorizedUsers.controller.test.js (R36 family) and the
 * other thin-controller unit suites.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../core/v1/storage/storage.service.js", () => ({
  default: {
    addStorage: vi.fn(),
    googleAuthCallback: vi.fn(),
    getStorages: vi.fn(),
    uploadFile: vi.fn(),
    deleteStorage: vi.fn(),
    updateStorage: vi.fn(),
    activateStorage: vi.fn(),
    streamFile: vi.fn(),
    smartStreamFile: vi.fn(),
  },
}));

import StorageService from "../../../core/v1/storage/storage.service.js";
const { default: storageController } = await import(
  "../../../core/v1/storage/storage.controller.js"
);
import { makeReqRes } from "../../helpers/factory.js";

const SERVICE_METHODS = [
  "addStorage",
  "googleAuthCallback",
  "getStorages",
  "uploadFile",
  "deleteStorage",
  "updateStorage",
  "activateStorage",
  "streamFile",
  "smartStreamFile",
];

function expectOnlyCalled(method) {
  for (const m of SERVICE_METHODS) {
    if (m === method) continue;
    expect(StorageService[m]).not.toHaveBeenCalled();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("storageController", () => {
  describe("addStorage", () => {
    it("delegates to StorageService.addStorage and returns its result", async () => {
      StorageService.addStorage.mockResolvedValueOnce({
        success: true,
        id: "storage_new",
      });
      const { req, res, next } = makeReqRes();
      req.body = { name: "Primary S3", type: "s3", bucket: "vids" };

      const out = await storageController.addStorage(req, res, next);

      expect(out).toEqual({ success: true, id: "storage_new" });
      expect(StorageService.addStorage).toHaveBeenCalledTimes(1);
      expect(StorageService.addStorage).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("addStorage");
    });

    it("propagates rejections from the service", async () => {
      StorageService.addStorage.mockRejectedValueOnce(
        new Error("duplicate storage name")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        storageController.addStorage(req, res, next)
      ).rejects.toThrow("duplicate storage name");
    });
  });

  describe("googleAuthCallback", () => {
    it("delegates to StorageService.googleAuthCallback and returns its result", async () => {
      StorageService.googleAuthCallback.mockResolvedValueOnce({
        success: true,
        token: "g-token",
      });
      const { req, res, next } = makeReqRes();
      req.query = { code: "google-auth-code" };

      const out = await storageController.googleAuthCallback(req, res, next);

      expect(out).toEqual({ success: true, token: "g-token" });
      expect(StorageService.googleAuthCallback).toHaveBeenCalledTimes(1);
      expect(StorageService.googleAuthCallback).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("googleAuthCallback");
    });

    it("propagates rejections from the service", async () => {
      StorageService.googleAuthCallback.mockRejectedValueOnce(
        new Error("google oauth failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        storageController.googleAuthCallback(req, res, next)
      ).rejects.toThrow("google oauth failed");
    });
  });

  describe("getStorages", () => {
    it("delegates to StorageService.getStorages and returns its result", async () => {
      StorageService.getStorages.mockResolvedValueOnce({
        data: [{ _id: "s1" }, { _id: "s2" }],
        total: 2,
      });
      const { req, res, next } = makeReqRes();
      req.query = { skip: 0, limit: 10, sortField: "name", sortOrder: "asc" };

      const out = await storageController.getStorages(req, res, next);

      expect(out).toEqual({ data: [{ _id: "s1" }, { _id: "s2" }], total: 2 });
      expect(StorageService.getStorages).toHaveBeenCalledTimes(1);
      expect(StorageService.getStorages).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("getStorages");
    });

    it("propagates rejections from the service", async () => {
      StorageService.getStorages.mockRejectedValueOnce(
        new Error("query failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        storageController.getStorages(req, res, next)
      ).rejects.toThrow("query failed");
    });
  });

  describe("uploadFile", () => {
    it("delegates to StorageService.uploadFile and returns its result", async () => {
      StorageService.uploadFile.mockResolvedValueOnce({
        success: true,
        url: "https://cdn/x/file.mp4",
      });
      const { req, res, next } = makeReqRes();
      req.body = { adminId: "admin1", folderName: "incidents" };
      req.file = {
        originalname: "clip.mp4",
        path: "/tmp/clip.mp4",
        size: 1024,
      };

      const out = await storageController.uploadFile(req, res, next);

      expect(out).toEqual({ success: true, url: "https://cdn/x/file.mp4" });
      expect(StorageService.uploadFile).toHaveBeenCalledTimes(1);
      expect(StorageService.uploadFile).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("uploadFile");
    });

    it("propagates rejections from the service", async () => {
      StorageService.uploadFile.mockRejectedValueOnce(
        new Error("upload failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        storageController.uploadFile(req, res, next)
      ).rejects.toThrow("upload failed");
    });
  });

  describe("deleteStorage", () => {
    it("delegates to StorageService.deleteStorage and returns its result", async () => {
      StorageService.deleteStorage.mockResolvedValueOnce({
        success: true,
        deleted: 1,
      });
      const { req, res, next } = makeReqRes();
      req.params = { id: "6881d0279df7d83a343bfa72" };

      const out = await storageController.deleteStorage(req, res, next);

      expect(out).toEqual({ success: true, deleted: 1 });
      expect(StorageService.deleteStorage).toHaveBeenCalledTimes(1);
      expect(StorageService.deleteStorage).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("deleteStorage");
    });

    it("propagates rejections from the service", async () => {
      StorageService.deleteStorage.mockRejectedValueOnce(
        new Error("storage not found")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        storageController.deleteStorage(req, res, next)
      ).rejects.toThrow("storage not found");
    });
  });

  describe("updateStorage", () => {
    it("delegates to StorageService.updateStorage and returns its result", async () => {
      StorageService.updateStorage.mockResolvedValueOnce({
        success: true,
        updated: 1,
      });
      const { req, res, next } = makeReqRes();
      req.params = { id: "6881d0279df7d83a343bfa72" };
      req.body = { name: "Renamed S3", note: "updated note" };

      const out = await storageController.updateStorage(req, res, next);

      expect(out).toEqual({ success: true, updated: 1 });
      expect(StorageService.updateStorage).toHaveBeenCalledTimes(1);
      expect(StorageService.updateStorage).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("updateStorage");
    });

    it("propagates rejections from the service", async () => {
      StorageService.updateStorage.mockRejectedValueOnce(
        new Error("update failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        storageController.updateStorage(req, res, next)
      ).rejects.toThrow("update failed");
    });
  });

  describe("activateStorage", () => {
    it("delegates to StorageService.activateStorage and returns its result", async () => {
      StorageService.activateStorage.mockResolvedValueOnce({
        success: true,
        activated: "s1",
      });
      const { req, res, next } = makeReqRes();
      req.body = { storageId: "s1" };

      const out = await storageController.activateStorage(req, res, next);

      expect(out).toEqual({ success: true, activated: "s1" });
      expect(StorageService.activateStorage).toHaveBeenCalledTimes(1);
      expect(StorageService.activateStorage).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("activateStorage");
    });

    it("propagates rejections from the service", async () => {
      StorageService.activateStorage.mockRejectedValueOnce(
        new Error("activate failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        storageController.activateStorage(req, res, next)
      ).rejects.toThrow("activate failed");
    });
  });

  describe("streamFile", () => {
    it("delegates to StorageService.streamFile and returns its result", async () => {
      StorageService.streamFile.mockResolvedValueOnce({
        success: true,
        streaming: true,
      });
      const { req, res, next } = makeReqRes();
      req.params = { id: "file_abc" };

      const out = await storageController.streamFile(req, res, next);

      expect(out).toEqual({ success: true, streaming: true });
      expect(StorageService.streamFile).toHaveBeenCalledTimes(1);
      expect(StorageService.streamFile).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("streamFile");
    });

    it("propagates rejections from the service", async () => {
      StorageService.streamFile.mockRejectedValueOnce(
        new Error("file not found")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        storageController.streamFile(req, res, next)
      ).rejects.toThrow("file not found");
    });
  });

  describe("smartStreamFile", () => {
    it("delegates to StorageService.smartStreamFile and returns its result", async () => {
      StorageService.smartStreamFile.mockResolvedValueOnce({
        success: true,
        source: "sftp",
      });
      const { req, res, next } = makeReqRes();
      req.params = { path: "incidents/2024/clip.mp4" };

      const out = await storageController.smartStreamFile(req, res, next);

      expect(out).toEqual({ success: true, source: "sftp" });
      expect(StorageService.smartStreamFile).toHaveBeenCalledTimes(1);
      expect(StorageService.smartStreamFile).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("smartStreamFile");
    });

    it("propagates rejections from the service", async () => {
      StorageService.smartStreamFile.mockRejectedValueOnce(
        new Error("smart stream failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        storageController.smartStreamFile(req, res, next)
      ).rejects.toThrow("smart stream failed");
    });
  });
});
