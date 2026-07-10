/**
 * Unit coverage for core/v1/authorizedObjects/authorizedObjects.controller.js.
 *
 * Every handler is a thin pass-through to authorizedObjectsService — the
 * controller simply does `return authorizedObjectsService.<method>(req, res, next)`.
 * We mock the service so we exercise only the controller's own delegation
 * wiring and catch any swapped method names.
 *
 * Style mirrors accesslogs.controller.test.js (R34),
 * alerts.controller.test.js (R33), detectionObjects (R32), permissions (R31),
 * roles (R30), departments (R29).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock(
  "../../../core/v1/authorizedObjects/authorizedObjects.service.js",
  () => ({
    default: {
      createAuthorizedObjects: vi.fn(),
      fetchAuthorizedObjects: vi.fn(),
      getAllObjectTypes: vi.fn(),
      updateAuthorizedObjects: vi.fn(),
      deleteAuthorizedObjects: vi.fn(),
    },
  })
);

import authorizedObjectsService from "../../../core/v1/authorizedObjects/authorizedObjects.service.js";
const { default: authorizedObjectsController } = await import(
  "../../../core/v1/authorizedObjects/authorizedObjects.controller.js"
);
import { makeReqRes } from "../../helpers/factory.js";

const SERVICE_METHODS = [
  "createAuthorizedObjects",
  "fetchAuthorizedObjects",
  "getAllObjectTypes",
  "updateAuthorizedObjects",
  "deleteAuthorizedObjects",
];

function expectOnlyCalled(method) {
  for (const m of SERVICE_METHODS) {
    if (m === method) continue;
    expect(authorizedObjectsService[m]).not.toHaveBeenCalled();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("authorizedObjectsController", () => {
  describe("createAuthorizedObjects", () => {
    it("delegates to authorizedObjectsService.createAuthorizedObjects and returns its result", async () => {
      authorizedObjectsService.createAuthorizedObjects.mockResolvedValueOnce({
        success: true,
        id: "auth_obj_1",
      });
      const { req, res, next } = makeReqRes();
      req.body = {
        objectType: "vehicle",
        plateNumber: "ABC-123",
      };

      const out = await authorizedObjectsController.createAuthorizedObjects(
        req,
        res,
        next
      );

      expect(out).toEqual({ success: true, id: "auth_obj_1" });
      expect(
        authorizedObjectsService.createAuthorizedObjects
      ).toHaveBeenCalledTimes(1);
      expect(
        authorizedObjectsService.createAuthorizedObjects
      ).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("createAuthorizedObjects");
    });

    it("propagates rejections from the service", async () => {
      authorizedObjectsService.createAuthorizedObjects.mockRejectedValueOnce(
        new Error("validation failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        authorizedObjectsController.createAuthorizedObjects(req, res, next)
      ).rejects.toThrow("validation failed");
    });
  });

  describe("fetchAuthorizedObjects", () => {
    it("delegates to authorizedObjectsService.fetchAuthorizedObjects and returns its result", async () => {
      authorizedObjectsService.fetchAuthorizedObjects.mockResolvedValueOnce({
        data: [{ _id: "auth_obj_1" }, { _id: "auth_obj_2" }],
        total: 2,
      });
      const { req, res, next } = makeReqRes();
      req.body = { objectType: "vehicle" };

      const out = await authorizedObjectsController.fetchAuthorizedObjects(
        req,
        res,
        next
      );

      expect(out).toEqual({
        data: [{ _id: "auth_obj_1" }, { _id: "auth_obj_2" }],
        total: 2,
      });
      expect(
        authorizedObjectsService.fetchAuthorizedObjects
      ).toHaveBeenCalledTimes(1);
      expect(
        authorizedObjectsService.fetchAuthorizedObjects
      ).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("fetchAuthorizedObjects");
    });

    it("propagates rejections from the service", async () => {
      authorizedObjectsService.fetchAuthorizedObjects.mockRejectedValueOnce(
        new Error("db unreachable")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        authorizedObjectsController.fetchAuthorizedObjects(req, res, next)
      ).rejects.toThrow("db unreachable");
    });
  });

  describe("getAllObjectTypes", () => {
    it("delegates to authorizedObjectsService.getAllObjectTypes and returns its result", async () => {
      authorizedObjectsService.getAllObjectTypes.mockResolvedValueOnce({
        data: ["vehicle", "person", "package"],
      });
      const { req, res, next } = makeReqRes();

      const out = await authorizedObjectsController.getAllObjectTypes(
        req,
        res,
        next
      );

      expect(out).toEqual({ data: ["vehicle", "person", "package"] });
      expect(
        authorizedObjectsService.getAllObjectTypes
      ).toHaveBeenCalledTimes(1);
      expect(authorizedObjectsService.getAllObjectTypes).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("getAllObjectTypes");
    });

    it("propagates rejections from the service", async () => {
      authorizedObjectsService.getAllObjectTypes.mockRejectedValueOnce(
        new Error("query failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        authorizedObjectsController.getAllObjectTypes(req, res, next)
      ).rejects.toThrow("query failed");
    });
  });

  describe("updateAuthorizedObjects", () => {
    it("delegates to authorizedObjectsService.updateAuthorizedObjects and returns its result", async () => {
      authorizedObjectsService.updateAuthorizedObjects.mockResolvedValueOnce({
        success: true,
        updated: 1,
      });
      const { req, res, next } = makeReqRes();
      req.body = {
        id: "6881d0279df7d83a343bfa72",
        plateNumber: "XYZ-789",
      };

      const out = await authorizedObjectsController.updateAuthorizedObjects(
        req,
        res,
        next
      );

      expect(out).toEqual({ success: true, updated: 1 });
      expect(
        authorizedObjectsService.updateAuthorizedObjects
      ).toHaveBeenCalledTimes(1);
      expect(
        authorizedObjectsService.updateAuthorizedObjects
      ).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("updateAuthorizedObjects");
    });

    it("propagates rejections from the service", async () => {
      authorizedObjectsService.updateAuthorizedObjects.mockRejectedValueOnce(
        new Error("not found")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        authorizedObjectsController.updateAuthorizedObjects(req, res, next)
      ).rejects.toThrow("not found");
    });
  });

  describe("deleteAuthorizedObjects", () => {
    it("delegates to authorizedObjectsService.deleteAuthorizedObjects and returns its result", async () => {
      authorizedObjectsService.deleteAuthorizedObjects.mockResolvedValueOnce({
        success: true,
        deleted: 1,
      });
      const { req, res, next } = makeReqRes();
      req.query = { id: "6881d0279df7d83a343bfa72" };

      const out = await authorizedObjectsController.deleteAuthorizedObjects(
        req,
        res,
        next
      );

      expect(out).toEqual({ success: true, deleted: 1 });
      expect(
        authorizedObjectsService.deleteAuthorizedObjects
      ).toHaveBeenCalledTimes(1);
      expect(
        authorizedObjectsService.deleteAuthorizedObjects
      ).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("deleteAuthorizedObjects");
    });

    it("propagates rejections from the service", async () => {
      authorizedObjectsService.deleteAuthorizedObjects.mockRejectedValueOnce(
        new Error("delete failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        authorizedObjectsController.deleteAuthorizedObjects(req, res, next)
      ).rejects.toThrow("delete failed");
    });
  });
});
