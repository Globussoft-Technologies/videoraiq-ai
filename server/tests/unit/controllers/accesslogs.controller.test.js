/**
 * Unit coverage for core/v1/accesslogs/accesslogs.controller.js.
 *
 * Every handler is a thin pass-through to accesslogsService — the controller
 * simply does `return await accesslogsService.<method>(req, res, next)`.
 * We mock the service so we exercise only the controller's own delegation
 * wiring and catch any swapped method names.
 *
 * Style mirrors alerts.controller.test.js (R33),
 * detectionObjects.controller.test.js (R32), permissions (R31),
 * roles (R30), departments (R29).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../core/v1/accesslogs/accesslogs.service.js", () => ({
  default: {
    createAccessLog: vi.fn(),
    getAccessLogs: vi.fn(),
    createAccessLogRecord: vi.fn(),
    getLogs: vi.fn(),
    getUserSessionReport: vi.fn(),
  },
}));

import accesslogsService from "../../../core/v1/accesslogs/accesslogs.service.js";
const { default: accesslogsController } = await import(
  "../../../core/v1/accesslogs/accesslogs.controller.js"
);
import { makeReqRes } from "../../helpers/factory.js";

const SERVICE_METHODS = [
  "createAccessLog",
  "getAccessLogs",
  "createAccessLogRecord",
  "getLogs",
  "getUserSessionReport",
];

function expectOnlyCalled(method) {
  for (const m of SERVICE_METHODS) {
    if (m === method) continue;
    expect(accesslogsService[m]).not.toHaveBeenCalled();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("accesslogsController", () => {
  describe("createAccessLog", () => {
    it("delegates to accesslogsService.createAccessLog and returns its result", async () => {
      accesslogsService.createAccessLog.mockResolvedValueOnce({
        success: true,
        logId: "log_1",
      });
      const { req, res, next } = makeReqRes();
      req.body = {
        userId: "user_1",
        cameraId: "cam_1",
        date: "2026-05-25T10:00:00Z",
      };

      const out = await accesslogsController.createAccessLog(req, res, next);

      expect(out).toEqual({ success: true, logId: "log_1" });
      expect(accesslogsService.createAccessLog).toHaveBeenCalledTimes(1);
      expect(accesslogsService.createAccessLog).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("createAccessLog");
    });

    it("propagates rejections from the service", async () => {
      accesslogsService.createAccessLog.mockRejectedValueOnce(
        new Error("invalid payload")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        accesslogsController.createAccessLog(req, res, next)
      ).rejects.toThrow("invalid payload");
    });
  });

  describe("getAccessLogs", () => {
    it("delegates to accesslogsService.getAccessLogs and returns its result", async () => {
      accesslogsService.getAccessLogs.mockResolvedValueOnce({
        data: [{ _id: "log_1" }, { _id: "log_2" }],
        total: 2,
      });
      const { req, res, next } = makeReqRes();
      req.query = { sortField: "date", sortOrder: "desc", skip: "0", limit: "10" };

      const out = await accesslogsController.getAccessLogs(req, res, next);

      expect(out).toEqual({
        data: [{ _id: "log_1" }, { _id: "log_2" }],
        total: 2,
      });
      expect(accesslogsService.getAccessLogs).toHaveBeenCalledTimes(1);
      expect(accesslogsService.getAccessLogs).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("getAccessLogs");
    });

    it("propagates rejections from the service", async () => {
      accesslogsService.getAccessLogs.mockRejectedValueOnce(
        new Error("db unreachable")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        accesslogsController.getAccessLogs(req, res, next)
      ).rejects.toThrow("db unreachable");
    });
  });

  describe("createAccessLogRecord", () => {
    it("delegates to accesslogsService.createAccessLogRecord and returns its result", async () => {
      accesslogsService.createAccessLogRecord.mockResolvedValueOnce({
        success: true,
        recordId: "rec_1",
      });
      const { req, res, next } = makeReqRes();
      req.body = {
        userId: "user_1",
        action: "enter",
        date: "2026-05-25T10:00:00Z",
      };

      const out = await accesslogsController.createAccessLogRecord(
        req,
        res,
        next
      );

      expect(out).toEqual({ success: true, recordId: "rec_1" });
      expect(accesslogsService.createAccessLogRecord).toHaveBeenCalledTimes(1);
      expect(accesslogsService.createAccessLogRecord).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("createAccessLogRecord");
    });

    it("propagates rejections from the service", async () => {
      accesslogsService.createAccessLogRecord.mockRejectedValueOnce(
        new Error("duplicate record")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        accesslogsController.createAccessLogRecord(req, res, next)
      ).rejects.toThrow("duplicate record");
    });
  });

  describe("getLogs", () => {
    it("delegates to accesslogsService.getLogs and returns its result", async () => {
      accesslogsService.getLogs.mockResolvedValueOnce({
        data: [{ _id: "log_3" }],
        total: 1,
      });
      const { req, res, next } = makeReqRes();
      req.query = { sortField: "userInfo.userName", sortOrder: "asc" };

      const out = await accesslogsController.getLogs(req, res, next);

      expect(out).toEqual({ data: [{ _id: "log_3" }], total: 1 });
      expect(accesslogsService.getLogs).toHaveBeenCalledTimes(1);
      expect(accesslogsService.getLogs).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("getLogs");
    });

    it("propagates rejections from the service", async () => {
      accesslogsService.getLogs.mockRejectedValueOnce(new Error("query failed"));
      const { req, res, next } = makeReqRes();
      await expect(
        accesslogsController.getLogs(req, res, next)
      ).rejects.toThrow("query failed");
    });
  });

  describe("getUserSessionReport", () => {
    it("delegates to accesslogsService.getUserSessionReport and returns its result", async () => {
      accesslogsService.getUserSessionReport.mockResolvedValueOnce({
        data: [
          { userId: "user_1", totalSessions: 3 },
          { userId: "user_2", totalSessions: 5 },
        ],
        total: 2,
      });
      const { req, res, next } = makeReqRes();
      req.query = { sortField: "date", sortOrder: "desc" };
      req.body = {
        startDate: "2026-05-01",
        endDate: "2026-05-25",
      };

      const out = await accesslogsController.getUserSessionReport(
        req,
        res,
        next
      );

      expect(out).toEqual({
        data: [
          { userId: "user_1", totalSessions: 3 },
          { userId: "user_2", totalSessions: 5 },
        ],
        total: 2,
      });
      expect(accesslogsService.getUserSessionReport).toHaveBeenCalledTimes(1);
      expect(accesslogsService.getUserSessionReport).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("getUserSessionReport");
    });

    it("propagates rejections from the service", async () => {
      accesslogsService.getUserSessionReport.mockRejectedValueOnce(
        new Error("report generation failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        accesslogsController.getUserSessionReport(req, res, next)
      ).rejects.toThrow("report generation failed");
    });
  });
});
