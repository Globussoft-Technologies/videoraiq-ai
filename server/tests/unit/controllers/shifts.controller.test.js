/**
 * Unit coverage for core/v1/shifts/shifts.controller.js.
 *
 * The controller is a thin pass-through to shiftService — every handler is a
 * one-liner `return shiftService.<method>(req, res, next)`. We mock the
 * service module so only the controller's own delegation logic runs; the
 * service itself is integration-tested elsewhere.
 *
 * For each controller method we confirm:
 *   - it forwards the exact (req, res, next) it received,
 *   - it returns whatever the service returned,
 *   - it propagates rejections from the service,
 *   - it does not accidentally call sibling service methods.
 *
 * Style mirrors location.controller.test.js (R36 reference) and
 * departments.controller.test.js (R29 reference).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../core/v1/shifts/shifts.service.js", () => ({
  default: {
    createShift: vi.fn(),
    getAllShifts: vi.fn(),
    getShiftById: vi.fn(),
    updateShift: vi.fn(),
    deleteShift: vi.fn(),
    getShiftList: vi.fn(),
  },
}));

import shiftService from "../../../core/v1/shifts/shifts.service.js";
const { default: shiftController } = await import(
  "../../../core/v1/shifts/shifts.controller.js"
);
import { makeReqRes } from "../../helpers/factory.js";

const ALL_METHODS = [
  "createShift",
  "getAllShifts",
  "getShiftById",
  "updateShift",
  "deleteShift",
  "getShiftList",
];

function expectOnlyCalled(method) {
  for (const m of ALL_METHODS) {
    if (m === method) {
      expect(shiftService[m]).toHaveBeenCalledTimes(1);
    } else {
      expect(shiftService[m]).not.toHaveBeenCalled();
    }
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ShiftController", () => {
  describe("createShift", () => {
    it("delegates to shiftService.createShift and returns its result", async () => {
      shiftService.createShift.mockResolvedValueOnce({
        _id: "shift_1",
        shiftName: "Morning",
        startTime: "09:00",
        endTime: "17:00",
      });
      const { req, res, next } = makeReqRes();
      req.body = {
        shiftName: "Morning",
        startTime: "09:00",
        endTime: "17:00",
      };

      const out = await shiftController.createShift(req, res, next);

      expect(out).toEqual({
        _id: "shift_1",
        shiftName: "Morning",
        startTime: "09:00",
        endTime: "17:00",
      });
      expect(shiftService.createShift).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("createShift");
    });

    it("propagates rejections from the service", async () => {
      shiftService.createShift.mockRejectedValueOnce(
        new Error("validation failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        shiftController.createShift(req, res, next)
      ).rejects.toThrow("validation failed");
    });
  });

  describe("getAllShifts", () => {
    it("delegates to shiftService.getAllShifts and returns its result", async () => {
      shiftService.getAllShifts.mockResolvedValueOnce({
        data: [{ _id: "shift_1", shiftName: "Morning" }],
        total: 1,
      });
      const { req, res, next } = makeReqRes();
      req.query = { skip: "0", limit: "10", name: "Mor" };

      const out = await shiftController.getAllShifts(req, res, next);

      expect(out).toEqual({
        data: [{ _id: "shift_1", shiftName: "Morning" }],
        total: 1,
      });
      expect(shiftService.getAllShifts).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("getAllShifts");
    });

    it("propagates rejections from the service", async () => {
      shiftService.getAllShifts.mockRejectedValueOnce(
        new Error("db unreachable")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        shiftController.getAllShifts(req, res, next)
      ).rejects.toThrow("db unreachable");
    });
  });

  describe("getShiftById", () => {
    it("delegates to shiftService.getShiftById and returns its result", async () => {
      shiftService.getShiftById.mockResolvedValueOnce({
        _id: "shift_1",
        shiftName: "Morning",
      });
      const { req, res, next } = makeReqRes();
      req.params = { id: "shift_1" };

      const out = await shiftController.getShiftById(req, res, next);

      expect(out).toEqual({ _id: "shift_1", shiftName: "Morning" });
      expect(shiftService.getShiftById).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("getShiftById");
    });

    it("propagates rejections from the service", async () => {
      shiftService.getShiftById.mockRejectedValueOnce(new Error("not found"));
      const { req, res, next } = makeReqRes();
      await expect(
        shiftController.getShiftById(req, res, next)
      ).rejects.toThrow("not found");
    });
  });

  describe("updateShift", () => {
    it("delegates to shiftService.updateShift and returns its result", async () => {
      shiftService.updateShift.mockResolvedValueOnce({
        _id: "shift_1",
        shiftName: "Morning Updated",
      });
      const { req, res, next } = makeReqRes();
      req.params = { id: "shift_1" };
      req.body = { shiftName: "Morning Updated" };

      const out = await shiftController.updateShift(req, res, next);

      expect(out).toEqual({ _id: "shift_1", shiftName: "Morning Updated" });
      expect(shiftService.updateShift).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("updateShift");
    });

    it("propagates rejections from the service", async () => {
      shiftService.updateShift.mockRejectedValueOnce(new Error("conflict"));
      const { req, res, next } = makeReqRes();
      await expect(
        shiftController.updateShift(req, res, next)
      ).rejects.toThrow("conflict");
    });
  });

  describe("deleteShift", () => {
    it("delegates to shiftService.deleteShift and returns its result", async () => {
      shiftService.deleteShift.mockResolvedValueOnce({
        deleted: 1,
        message: "shift deleted",
      });
      const { req, res, next } = makeReqRes();
      req.params = { id: "shift_1" };

      const out = await shiftController.deleteShift(req, res, next);

      expect(out).toEqual({ deleted: 1, message: "shift deleted" });
      expect(shiftService.deleteShift).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("deleteShift");
    });

    it("propagates rejections from the service", async () => {
      shiftService.deleteShift.mockRejectedValueOnce(
        new Error("permission denied")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        shiftController.deleteShift(req, res, next)
      ).rejects.toThrow("permission denied");
    });
  });

  describe("getShiftList", () => {
    it("delegates to shiftService.getShiftList and returns its result", async () => {
      shiftService.getShiftList.mockResolvedValueOnce({
        data: [
          { _id: "shift_1", shiftName: "Morning" },
          { _id: "shift_2", shiftName: "Evening" },
        ],
      });
      const { req, res, next } = makeReqRes();

      const out = await shiftController.getShiftList(req, res, next);

      expect(out).toEqual({
        data: [
          { _id: "shift_1", shiftName: "Morning" },
          { _id: "shift_2", shiftName: "Evening" },
        ],
      });
      expect(shiftService.getShiftList).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("getShiftList");
    });

    it("propagates rejections from the service", async () => {
      shiftService.getShiftList.mockRejectedValueOnce(
        new Error("upstream failure")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        shiftController.getShiftList(req, res, next)
      ).rejects.toThrow("upstream failure");
    });
  });
});
