/**
 * Unit coverage for core/v1/vehicle/vehicle.controller.js.
 *
 * The controller is a thin pass-through to VehicleService — every handler is
 * a one-liner `return VehicleService.<method>(req, res)`. Note that unlike
 * most other controllers (which forward `next` too), the vehicle controller
 * intentionally takes only `(req, res)` per its current signature, so the
 * test asserts that exact forwarding shape.
 *
 * We mock the service module so only the controller's own delegation logic
 * runs; the service itself is integration-tested elsewhere.
 *
 * For each controller method we confirm:
 *   - it forwards the exact (req, res) it received,
 *   - it returns whatever the service returned,
 *   - it propagates rejections from the service,
 *   - it does not accidentally call sibling service methods.
 *
 * Style mirrors location.controller.test.js (R36 reference) and
 * authorizedObjects.controller.test.js (R35 reference).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../core/v1/vehicle/vehicle.service.js", () => ({
  default: {
    log: vi.fn(),
    getVehicles: vi.fn(),
    getVehicleEntries: vi.fn(),
  },
}));

import VehicleService from "../../../core/v1/vehicle/vehicle.service.js";
const { default: vehicleController } = await import(
  "../../../core/v1/vehicle/vehicle.controller.js"
);
import { makeReqRes } from "../../helpers/factory.js";

const ALL_METHODS = ["log", "getVehicles", "getVehicleEntries"];

function expectOnlyCalled(method) {
  for (const m of ALL_METHODS) {
    if (m === method) {
      expect(VehicleService[m]).toHaveBeenCalledTimes(1);
    } else {
      expect(VehicleService[m]).not.toHaveBeenCalled();
    }
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("VehicleController", () => {
  describe("log", () => {
    it("delegates to VehicleService.log and returns its result", async () => {
      VehicleService.log.mockResolvedValueOnce({
        _id: "vlog_1",
        vehicleNumber: "KA-01-AB-1234",
        entryTime: "2026-05-25T10:00:00.000Z",
      });
      const { req, res } = makeReqRes();
      req.body = {
        vehicleNumber: "KA-01-AB-1234",
        entryTime: "2026-05-25T10:00:00.000Z",
      };

      const out = await vehicleController.log(req, res);

      expect(out).toEqual({
        _id: "vlog_1",
        vehicleNumber: "KA-01-AB-1234",
        entryTime: "2026-05-25T10:00:00.000Z",
      });
      // Vehicle controller intentionally passes only (req, res); assert that.
      expect(VehicleService.log).toHaveBeenCalledWith(req, res);
      expectOnlyCalled("log");
    });

    it("propagates rejections from the service", async () => {
      VehicleService.log.mockRejectedValueOnce(new Error("validation failed"));
      const { req, res } = makeReqRes();
      await expect(vehicleController.log(req, res)).rejects.toThrow(
        "validation failed"
      );
    });
  });

  describe("getVehicles", () => {
    it("delegates to VehicleService.getVehicles and returns its result", async () => {
      VehicleService.getVehicles.mockResolvedValueOnce({
        data: [{ _id: "veh_1", vehicleNumber: "KA-01-AB-1234" }],
        total: 1,
      });
      const { req, res } = makeReqRes();
      req.query = { search: "KA-01" };

      const out = await vehicleController.getVehicles(req, res);

      expect(out).toEqual({
        data: [{ _id: "veh_1", vehicleNumber: "KA-01-AB-1234" }],
        total: 1,
      });
      expect(VehicleService.getVehicles).toHaveBeenCalledWith(req, res);
      expectOnlyCalled("getVehicles");
    });

    it("propagates rejections from the service", async () => {
      VehicleService.getVehicles.mockRejectedValueOnce(
        new Error("db unreachable")
      );
      const { req, res } = makeReqRes();
      await expect(vehicleController.getVehicles(req, res)).rejects.toThrow(
        "db unreachable"
      );
    });
  });

  describe("getVehicleEntries", () => {
    it("delegates to VehicleService.getVehicleEntries and returns its result", async () => {
      VehicleService.getVehicleEntries.mockResolvedValueOnce({
        data: [
          {
            _id: "vlog_1",
            vehicleId: "veh_1",
            entryTime: "2026-05-25T10:00:00.000Z",
          },
        ],
        total: 1,
      });
      const { req, res } = makeReqRes();
      req.params = { vehicleId: "veh_1" };
      req.query = {
        startDate: "2026-05-01T00:00:00.000Z",
        endDate: "2026-05-31T23:59:59.000Z",
      };

      const out = await vehicleController.getVehicleEntries(req, res);

      expect(out).toEqual({
        data: [
          {
            _id: "vlog_1",
            vehicleId: "veh_1",
            entryTime: "2026-05-25T10:00:00.000Z",
          },
        ],
        total: 1,
      });
      expect(VehicleService.getVehicleEntries).toHaveBeenCalledWith(req, res);
      expectOnlyCalled("getVehicleEntries");
    });

    it("propagates rejections from the service", async () => {
      VehicleService.getVehicleEntries.mockRejectedValueOnce(
        new Error("not found")
      );
      const { req, res } = makeReqRes();
      await expect(
        vehicleController.getVehicleEntries(req, res)
      ).rejects.toThrow("not found");
    });
  });
});
