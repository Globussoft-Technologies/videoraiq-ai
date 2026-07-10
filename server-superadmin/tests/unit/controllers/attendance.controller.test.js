/**
 * Unit coverage for core/v1/attendance/attendance.controller.js.
 *
 * Every handler is a thin pass-through to attendanceService — the controller
 * simply does `return attendanceService.<method>(req, res, next)`. We mock
 * the service so we exercise only the controller's own delegation wiring
 * and catch any swapped method names.
 *
 * Style mirrors storage.controller.test.js (R56) and the other thin
 * controller unit suites.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../core/v1/attendance/attendance.service.js", () => ({
  default: {
    logAttendance: vi.fn(),
    getAttendance: vi.fn(),
    exportAttendance: vi.fn(),
    getUserLogs: vi.fn(),
  },
}));

import attendanceService from "../../../core/v1/attendance/attendance.service.js";
const { default: attendanceController } = await import(
  "../../../core/v1/attendance/attendance.controller.js"
);
import { makeReqRes } from "../../helpers/factory.js";

const SERVICE_METHODS = [
  "logAttendance",
  "getAttendance",
  "exportAttendance",
  "getUserLogs",
];

function expectOnlyCalled(method) {
  for (const m of SERVICE_METHODS) {
    if (m === method) continue;
    expect(attendanceService[m]).not.toHaveBeenCalled();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("attendanceController", () => {
  describe("logAttendance", () => {
    it("delegates to attendanceService.logAttendance and returns its result", async () => {
      attendanceService.logAttendance.mockResolvedValueOnce({
        success: true,
        id: "attlog_new",
      });
      const { req, res, next } = makeReqRes();
      req.body = { userId: "u1", channelId: "c1", type: "checkin" };

      const out = await attendanceController.logAttendance(req, res, next);

      expect(out).toEqual({ success: true, id: "attlog_new" });
      expect(attendanceService.logAttendance).toHaveBeenCalledTimes(1);
      expect(attendanceService.logAttendance).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("logAttendance");
    });

    it("propagates rejections from the service", async () => {
      attendanceService.logAttendance.mockRejectedValueOnce(
        new Error("missing channelId")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        attendanceController.logAttendance(req, res, next)
      ).rejects.toThrow("missing channelId");
    });
  });

  describe("getAttendance", () => {
    it("delegates to attendanceService.getAttendance and returns its result", async () => {
      attendanceService.getAttendance.mockResolvedValueOnce({
        data: [{ _id: "a1" }, { _id: "a2" }],
        total: 2,
      });
      const { req, res, next } = makeReqRes();
      req.query = {
        skip: 0,
        limit: 10,
        startDate: "2025-10-03",
        endDate: "2025-10-03",
        timeType: "checkin",
        sortField: "fullname",
        sortOrder: "asc",
      };

      const out = await attendanceController.getAttendance(req, res, next);

      expect(out).toEqual({
        data: [{ _id: "a1" }, { _id: "a2" }],
        total: 2,
      });
      expect(attendanceService.getAttendance).toHaveBeenCalledTimes(1);
      expect(attendanceService.getAttendance).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("getAttendance");
    });

    it("propagates rejections from the service", async () => {
      attendanceService.getAttendance.mockRejectedValueOnce(
        new Error("query failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        attendanceController.getAttendance(req, res, next)
      ).rejects.toThrow("query failed");
    });
  });

  describe("exportAttendance", () => {
    it("delegates to attendanceService.exportAttendance and returns its result", async () => {
      attendanceService.exportAttendance.mockResolvedValueOnce({
        success: true,
        url: "https://cdn/x/export.csv",
      });
      const { req, res, next } = makeReqRes();
      req.query = {
        startDate: "2025-10-03",
        endDate: "2025-10-04",
        timeType: "checkin",
      };

      const out = await attendanceController.exportAttendance(req, res, next);

      expect(out).toEqual({ success: true, url: "https://cdn/x/export.csv" });
      expect(attendanceService.exportAttendance).toHaveBeenCalledTimes(1);
      expect(attendanceService.exportAttendance).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("exportAttendance");
    });

    it("propagates rejections from the service", async () => {
      attendanceService.exportAttendance.mockRejectedValueOnce(
        new Error("export failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        attendanceController.exportAttendance(req, res, next)
      ).rejects.toThrow("export failed");
    });
  });

  describe("getUserLogs", () => {
    it("delegates to attendanceService.getUserLogs and returns its result", async () => {
      attendanceService.getUserLogs.mockResolvedValueOnce({
        data: [{ _id: "u1log" }],
        total: 1,
      });
      const { req, res, next } = makeReqRes();
      req.body = { userId: "u1", skip: 0, limit: 20 };

      const out = await attendanceController.getUserLogs(req, res, next);

      expect(out).toEqual({ data: [{ _id: "u1log" }], total: 1 });
      expect(attendanceService.getUserLogs).toHaveBeenCalledTimes(1);
      expect(attendanceService.getUserLogs).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("getUserLogs");
    });

    it("propagates rejections from the service", async () => {
      attendanceService.getUserLogs.mockRejectedValueOnce(
        new Error("user logs failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        attendanceController.getUserLogs(req, res, next)
      ).rejects.toThrow("user logs failed");
    });
  });
});
