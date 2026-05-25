/**
 * Unit coverage for core/v1/profiles/profiles.controller.js.
 *
 * Every handler is a thin pass-through to ProfileService — the controller
 * just does `return ProfileService.<method>(req, res, next)`. We mock the
 * service so we exercise only the controller's own delegation wiring and
 * catch any swapped method names.
 *
 * Style mirrors authorizedObjects.controller.test.js (R32-ish),
 * accesslogs.controller.test.js (R34), alerts.controller.test.js (R33),
 * detectionObjects (R32), permissions (R31), roles (R30), departments (R29).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../core/v1/profiles/profiles.service.js", () => ({
  default: {
    getProfiles: vi.fn(),
    addProfile: vi.fn(),
    editProfile: vi.fn(),
    deleteProfile: vi.fn(),
    getProfileById: vi.fn(),
    exportProfile: vi.fn(),
    bulkExportProfiles: vi.fn(),
    importProfile: vi.fn(),
    bulkDeleteProfiles: vi.fn(),
  },
}));

import ProfileService from "../../../core/v1/profiles/profiles.service.js";
const { default: profilesController } = await import(
  "../../../core/v1/profiles/profiles.controller.js"
);
import { makeReqRes } from "../../helpers/factory.js";

const SERVICE_METHODS = [
  "getProfiles",
  "addProfile",
  "editProfile",
  "deleteProfile",
  "getProfileById",
  "exportProfile",
  "bulkExportProfiles",
  "importProfile",
  "bulkDeleteProfiles",
];

function expectOnlyCalled(method) {
  for (const m of SERVICE_METHODS) {
    if (m === method) continue;
    expect(ProfileService[m]).not.toHaveBeenCalled();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("profilesController", () => {
  describe("getProfiles", () => {
    it("delegates to ProfileService.getProfiles and returns its result", async () => {
      ProfileService.getProfiles.mockResolvedValueOnce({
        data: [{ _id: "profile_1", name: "Day profile" }],
        total: 1,
      });
      const { req, res, next } = makeReqRes();
      req.query = { skip: 0, limit: 10, orderBy: "name", sort: "asc" };

      const out = await profilesController.getProfiles(req, res, next);

      expect(out).toEqual({
        data: [{ _id: "profile_1", name: "Day profile" }],
        total: 1,
      });
      expect(ProfileService.getProfiles).toHaveBeenCalledTimes(1);
      expect(ProfileService.getProfiles).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("getProfiles");
    });

    it("propagates rejections from the service", async () => {
      ProfileService.getProfiles.mockRejectedValueOnce(
        new Error("db unreachable")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        profilesController.getProfiles(req, res, next)
      ).rejects.toThrow("db unreachable");
    });
  });

  describe("addProfile", () => {
    it("delegates to ProfileService.addProfile and returns its result", async () => {
      ProfileService.addProfile.mockResolvedValueOnce({
        success: true,
        id: "profile_1",
      });
      const { req, res, next } = makeReqRes();
      req.body = { name: "Day profile", status: "active" };

      const out = await profilesController.addProfile(req, res, next);

      expect(out).toEqual({ success: true, id: "profile_1" });
      expect(ProfileService.addProfile).toHaveBeenCalledTimes(1);
      expect(ProfileService.addProfile).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("addProfile");
    });

    it("propagates rejections from the service", async () => {
      ProfileService.addProfile.mockRejectedValueOnce(
        new Error("validation failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        profilesController.addProfile(req, res, next)
      ).rejects.toThrow("validation failed");
    });
  });

  describe("editProfile", () => {
    it("delegates to ProfileService.editProfile and returns its result", async () => {
      ProfileService.editProfile.mockResolvedValueOnce({
        success: true,
        updated: 1,
      });
      const { req, res, next } = makeReqRes();
      req.params = { id: "6881d0279df7d83a343bfa72" };
      req.body = { name: "Night profile" };

      const out = await profilesController.editProfile(req, res, next);

      expect(out).toEqual({ success: true, updated: 1 });
      expect(ProfileService.editProfile).toHaveBeenCalledTimes(1);
      expect(ProfileService.editProfile).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("editProfile");
    });

    it("propagates rejections from the service", async () => {
      ProfileService.editProfile.mockRejectedValueOnce(new Error("not found"));
      const { req, res, next } = makeReqRes();
      await expect(
        profilesController.editProfile(req, res, next)
      ).rejects.toThrow("not found");
    });
  });

  describe("deleteProfile", () => {
    it("delegates to ProfileService.deleteProfile and returns its result", async () => {
      ProfileService.deleteProfile.mockResolvedValueOnce({
        success: true,
        deleted: 1,
      });
      const { req, res, next } = makeReqRes();
      req.params = { id: "6881d0279df7d83a343bfa72" };

      const out = await profilesController.deleteProfile(req, res, next);

      expect(out).toEqual({ success: true, deleted: 1 });
      expect(ProfileService.deleteProfile).toHaveBeenCalledTimes(1);
      expect(ProfileService.deleteProfile).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("deleteProfile");
    });

    it("propagates rejections from the service", async () => {
      ProfileService.deleteProfile.mockRejectedValueOnce(
        new Error("delete failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        profilesController.deleteProfile(req, res, next)
      ).rejects.toThrow("delete failed");
    });
  });

  describe("getProfileById", () => {
    it("delegates to ProfileService.getProfileById and returns its result", async () => {
      ProfileService.getProfileById.mockResolvedValueOnce({
        _id: "6881d0279df7d83a343bfa72",
        name: "Day profile",
      });
      const { req, res, next } = makeReqRes();
      req.params = { id: "6881d0279df7d83a343bfa72" };

      const out = await profilesController.getProfileById(req, res, next);

      expect(out).toEqual({
        _id: "6881d0279df7d83a343bfa72",
        name: "Day profile",
      });
      expect(ProfileService.getProfileById).toHaveBeenCalledTimes(1);
      expect(ProfileService.getProfileById).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("getProfileById");
    });

    it("propagates rejections from the service", async () => {
      ProfileService.getProfileById.mockRejectedValueOnce(
        new Error("profile missing")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        profilesController.getProfileById(req, res, next)
      ).rejects.toThrow("profile missing");
    });
  });

  describe("exportProfile", () => {
    it("delegates to ProfileService.exportProfile and returns its result", async () => {
      ProfileService.exportProfile.mockResolvedValueOnce({
        success: true,
        file: "profile.json",
      });
      const { req, res, next } = makeReqRes();
      req.params = { id: "6881d0279df7d83a343bfa72" };

      const out = await profilesController.exportProfile(req, res, next);

      expect(out).toEqual({ success: true, file: "profile.json" });
      expect(ProfileService.exportProfile).toHaveBeenCalledTimes(1);
      expect(ProfileService.exportProfile).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("exportProfile");
    });

    it("propagates rejections from the service", async () => {
      ProfileService.exportProfile.mockRejectedValueOnce(
        new Error("export failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        profilesController.exportProfile(req, res, next)
      ).rejects.toThrow("export failed");
    });
  });

  describe("bulkExportProfiles", () => {
    it("delegates to ProfileService.bulkExportProfiles and returns its result", async () => {
      ProfileService.bulkExportProfiles.mockResolvedValueOnce({
        success: true,
        count: 2,
      });
      const { req, res, next } = makeReqRes();
      req.body = { ids: ["profile_1", "profile_2"] };

      const out = await profilesController.bulkExportProfiles(req, res, next);

      expect(out).toEqual({ success: true, count: 2 });
      expect(ProfileService.bulkExportProfiles).toHaveBeenCalledTimes(1);
      expect(ProfileService.bulkExportProfiles).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("bulkExportProfiles");
    });

    it("propagates rejections from the service", async () => {
      ProfileService.bulkExportProfiles.mockRejectedValueOnce(
        new Error("bulk export failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        profilesController.bulkExportProfiles(req, res, next)
      ).rejects.toThrow("bulk export failed");
    });
  });

  describe("importProfile", () => {
    it("delegates to ProfileService.importProfile and returns its result", async () => {
      ProfileService.importProfile.mockResolvedValueOnce({
        success: true,
        imported: 1,
      });
      const { req, res, next } = makeReqRes();
      req.file = { originalname: "profile.json", path: "/tmp/profile.json" };

      const out = await profilesController.importProfile(req, res, next);

      expect(out).toEqual({ success: true, imported: 1 });
      expect(ProfileService.importProfile).toHaveBeenCalledTimes(1);
      expect(ProfileService.importProfile).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("importProfile");
    });

    it("propagates rejections from the service", async () => {
      ProfileService.importProfile.mockRejectedValueOnce(
        new Error("import failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        profilesController.importProfile(req, res, next)
      ).rejects.toThrow("import failed");
    });
  });

  describe("bulkDeleteProfiles", () => {
    it("delegates to ProfileService.bulkDeleteProfiles and returns its result", async () => {
      ProfileService.bulkDeleteProfiles.mockResolvedValueOnce({
        success: true,
        deleted: 2,
      });
      const { req, res, next } = makeReqRes();
      req.body = { ids: ["profile_1", "profile_2"] };

      const out = await profilesController.bulkDeleteProfiles(req, res, next);

      expect(out).toEqual({ success: true, deleted: 2 });
      expect(ProfileService.bulkDeleteProfiles).toHaveBeenCalledTimes(1);
      expect(ProfileService.bulkDeleteProfiles).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("bulkDeleteProfiles");
    });

    it("propagates rejections from the service", async () => {
      ProfileService.bulkDeleteProfiles.mockRejectedValueOnce(
        new Error("bulk delete failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        profilesController.bulkDeleteProfiles(req, res, next)
      ).rejects.toThrow("bulk delete failed");
    });
  });
});
