/**
 * Unit coverage for core/v1/locations/location.controller.js.
 *
 * The controller is a thin pass-through to locationService — every handler is
 * a one-liner `return locationService.<method>(req, res, next)`. We mock the
 * service module so only the controller's own delegation logic runs; the
 * service itself is integration-tested elsewhere.
 *
 * For each controller method we confirm:
 *   - it forwards the exact (req, res, next) it received,
 *   - it returns whatever the service returned,
 *   - it propagates rejections from the service,
 *   - it does not accidentally call sibling service methods.
 *
 * Style mirrors departments.controller.test.js (R29 reference) and
 * authorizedObjects.controller.test.js (R35 reference).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../core/v1/locations/location.service.js", () => ({
  default: {
    createLocation: vi.fn(),
    fetchLocations: vi.fn(),
    getLocationById: vi.fn(),
    updateLocation: vi.fn(),
    deleteLocation: vi.fn(),
    fetchEmployeeLocation: vi.fn(),
  },
}));

import locationService from "../../../core/v1/locations/location.service.js";
const { default: locationController } = await import(
  "../../../core/v1/locations/location.controller.js"
);
import { makeReqRes } from "../../helpers/factory.js";

const ALL_METHODS = [
  "createLocation",
  "fetchLocations",
  "getLocationById",
  "updateLocation",
  "deleteLocation",
  "fetchEmployeeLocation",
];

function expectOnlyCalled(method) {
  for (const m of ALL_METHODS) {
    if (m === method) {
      expect(locationService[m]).toHaveBeenCalledTimes(1);
    } else {
      expect(locationService[m]).not.toHaveBeenCalled();
    }
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("LocationController", () => {
  describe("createLocation", () => {
    it("delegates to locationService.createLocation and returns its result", async () => {
      locationService.createLocation.mockResolvedValueOnce({
        _id: "loc_1",
        locationName: "HQ",
        empLocationId: "L1",
      });
      const { req, res, next } = makeReqRes();
      req.body = { locationName: "HQ", empLocationId: "L1" };

      const out = await locationController.createLocation(req, res, next);

      expect(out).toEqual({
        _id: "loc_1",
        locationName: "HQ",
        empLocationId: "L1",
      });
      expect(locationService.createLocation).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("createLocation");
    });

    it("propagates rejections from the service", async () => {
      locationService.createLocation.mockRejectedValueOnce(
        new Error("validation failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        locationController.createLocation(req, res, next)
      ).rejects.toThrow("validation failed");
    });
  });

  describe("fetchLocations", () => {
    it("delegates to locationService.fetchLocations and returns its result", async () => {
      locationService.fetchLocations.mockResolvedValueOnce({
        data: [{ _id: "loc_1", locationName: "HQ" }],
        total: 1,
      });
      const { req, res, next } = makeReqRes();
      req.query = { skip: "0", limit: "20", search: "HQ" };

      const out = await locationController.fetchLocations(req, res, next);

      expect(out).toEqual({
        data: [{ _id: "loc_1", locationName: "HQ" }],
        total: 1,
      });
      expect(locationService.fetchLocations).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("fetchLocations");
    });

    it("propagates rejections from the service", async () => {
      locationService.fetchLocations.mockRejectedValueOnce(
        new Error("db unreachable")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        locationController.fetchLocations(req, res, next)
      ).rejects.toThrow("db unreachable");
    });
  });

  describe("getLocationById", () => {
    it("delegates to locationService.getLocationById and returns its result", async () => {
      locationService.getLocationById.mockResolvedValueOnce({
        _id: "loc_1",
        locationName: "HQ",
      });
      const { req, res, next } = makeReqRes();
      req.query = { id: "loc_1" };

      const out = await locationController.getLocationById(req, res, next);

      expect(out).toEqual({ _id: "loc_1", locationName: "HQ" });
      expect(locationService.getLocationById).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("getLocationById");
    });

    it("propagates rejections from the service", async () => {
      locationService.getLocationById.mockRejectedValueOnce(
        new Error("not found")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        locationController.getLocationById(req, res, next)
      ).rejects.toThrow("not found");
    });
  });

  describe("updateLocation", () => {
    it("delegates to locationService.updateLocation and returns its result", async () => {
      locationService.updateLocation.mockResolvedValueOnce({
        _id: "loc_1",
        locationName: "Headquarters",
      });
      const { req, res, next } = makeReqRes();
      req.query = { id: "loc_1" };
      req.body = { locationName: "Headquarters" };

      const out = await locationController.updateLocation(req, res, next);

      expect(out).toEqual({ _id: "loc_1", locationName: "Headquarters" });
      expect(locationService.updateLocation).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("updateLocation");
    });

    it("propagates rejections from the service", async () => {
      locationService.updateLocation.mockRejectedValueOnce(
        new Error("conflict")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        locationController.updateLocation(req, res, next)
      ).rejects.toThrow("conflict");
    });
  });

  describe("deleteLocation", () => {
    it("delegates to locationService.deleteLocation and returns its result", async () => {
      locationService.deleteLocation.mockResolvedValueOnce({
        deleted: 1,
        message: "location deleted",
      });
      const { req, res, next } = makeReqRes();
      req.query = { id: "loc_1" };

      const out = await locationController.deleteLocation(req, res, next);

      expect(out).toEqual({ deleted: 1, message: "location deleted" });
      expect(locationService.deleteLocation).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("deleteLocation");
    });

    it("propagates rejections from the service", async () => {
      locationService.deleteLocation.mockRejectedValueOnce(
        new Error("permission denied")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        locationController.deleteLocation(req, res, next)
      ).rejects.toThrow("permission denied");
    });
  });

  describe("fetchEmployeeLocation", () => {
    it("delegates to locationService.fetchEmployeeLocation and returns its result", async () => {
      locationService.fetchEmployeeLocation.mockResolvedValueOnce({
        data: [{ empLocationId: "L1", locationName: "HQ" }],
        total: 1,
      });
      const { req, res, next } = makeReqRes();
      req.query = { skip: "0", limit: "20" };

      const out = await locationController.fetchEmployeeLocation(
        req,
        res,
        next
      );

      expect(out).toEqual({
        data: [{ empLocationId: "L1", locationName: "HQ" }],
        total: 1,
      });
      expect(locationService.fetchEmployeeLocation).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("fetchEmployeeLocation");
    });

    it("propagates rejections from the service", async () => {
      locationService.fetchEmployeeLocation.mockRejectedValueOnce(
        new Error("upstream failure")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        locationController.fetchEmployeeLocation(req, res, next)
      ).rejects.toThrow("upstream failure");
    });
  });
});
