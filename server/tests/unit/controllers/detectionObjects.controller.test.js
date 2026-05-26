/**
 * Unit coverage for core/v1/detectionObjects/objects.controller.js.
 *
 * Every handler is a thin pass-through to ObjectsService — the controller
 * does nothing but return `ObjectsService.<method>(req, res, next)`. We
 * mock the service so we exercise only the controller's own delegation
 * (and catch any swapped wires — e.g. `deleteDetectionObjects` correctly
 * calls `deleteDetectionObjectsByType`, not a same-named method).
 *
 * Style mirrors permissions.controller.test.js (R31), roles (R30), and
 * departments (R29).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../core/v1/detectionObjects/objects.service.js", () => ({
  default: {
    createDetectionObjects: vi.fn(),
    getAllObjects: vi.fn(),
    deleteDetectionObjectsByType: vi.fn(),
  },
}));

import ObjectsService from "../../../core/v1/detectionObjects/objects.service.js";
const { default: objectsController } = await import(
  "../../../core/v1/detectionObjects/objects.controller.js"
);
import { makeReqRes } from "../../helpers/factory.js";

const SERVICE_METHODS = [
  "createDetectionObjects",
  "getAllObjects",
  "deleteDetectionObjectsByType",
];

function expectOnlyCalled(method) {
  for (const m of SERVICE_METHODS) {
    if (m === method) continue;
    expect(ObjectsService[m]).not.toHaveBeenCalled();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ObjectsController", () => {
  describe("createDetectionObjects", () => {
    it("delegates to ObjectsService.createDetectionObjects and returns its result", async () => {
      ObjectsService.createDetectionObjects.mockResolvedValueOnce({
        inserted: 1,
        objectType: "person",
      });
      const { req, res, next } = makeReqRes();
      req.body = { objectType: "person", description: "Detect people" };

      const out = await objectsController.createDetectionObjects(
        req,
        res,
        next
      );

      expect(out).toEqual({ inserted: 1, objectType: "person" });
      expect(ObjectsService.createDetectionObjects).toHaveBeenCalledTimes(1);
      expect(ObjectsService.createDetectionObjects).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("createDetectionObjects");
    });

    it("propagates rejections from the service", async () => {
      ObjectsService.createDetectionObjects.mockRejectedValueOnce(
        new Error("validation failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        objectsController.createDetectionObjects(req, res, next)
      ).rejects.toThrow("validation failed");
    });
  });

  describe("getAllObjects", () => {
    it("delegates to ObjectsService.getAllObjects and returns its result", async () => {
      ObjectsService.getAllObjects.mockResolvedValueOnce({
        data: [
          { _id: "obj_1", objectType: "person" },
          { _id: "obj_2", objectType: "vehicle" },
        ],
        total: 2,
      });
      const { req, res, next } = makeReqRes();

      const out = await objectsController.getAllObjects(req, res, next);

      expect(out).toEqual({
        data: [
          { _id: "obj_1", objectType: "person" },
          { _id: "obj_2", objectType: "vehicle" },
        ],
        total: 2,
      });
      expect(ObjectsService.getAllObjects).toHaveBeenCalledTimes(1);
      expect(ObjectsService.getAllObjects).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("getAllObjects");
    });

    it("propagates rejections from the service", async () => {
      ObjectsService.getAllObjects.mockRejectedValueOnce(
        new Error("db unreachable")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        objectsController.getAllObjects(req, res, next)
      ).rejects.toThrow("db unreachable");
    });
  });

  describe("deleteDetectionObjects", () => {
    it("delegates to ObjectsService.deleteDetectionObjectsByType (note the name swap) and returns its result", async () => {
      ObjectsService.deleteDetectionObjectsByType.mockResolvedValueOnce({
        deleted: 1,
        objectType: "vehicle",
      });
      const { req, res, next } = makeReqRes();
      req.body = { objectType: "vehicle" };

      const out = await objectsController.deleteDetectionObjects(
        req,
        res,
        next
      );

      expect(out).toEqual({ deleted: 1, objectType: "vehicle" });
      expect(
        ObjectsService.deleteDetectionObjectsByType
      ).toHaveBeenCalledTimes(1);
      expect(ObjectsService.deleteDetectionObjectsByType).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("deleteDetectionObjectsByType");
    });

    it("propagates rejections from the service", async () => {
      ObjectsService.deleteDetectionObjectsByType.mockRejectedValueOnce(
        new Error("object in use")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        objectsController.deleteDetectionObjects(req, res, next)
      ).rejects.toThrow("object in use");
    });
  });
});
