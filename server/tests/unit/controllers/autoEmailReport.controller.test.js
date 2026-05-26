/**
 * Unit coverage for core/v1/autoEmailReport/autoEmailReport.controller.js.
 *
 * The controller is a thin pass-through to autoEmailReportService — every
 * handler is a one-liner `return await autoEmailReportService.<method>(req,
 * res, next)`. We mock the service module so only the controller's own
 * delegation logic runs; the service itself is integration-tested elsewhere.
 *
 * For each controller method we confirm:
 *   - it forwards the exact (req, res, next) it received,
 *   - it returns whatever the service returned,
 *   - it propagates rejections from the service,
 *   - it does not accidentally call sibling service methods.
 *
 * Style mirrors authorizedChannels.controller.test.js (R39 reference) and
 * recipients.controller.test.js (R38 reference). Note that the service file
 * on disk is named `autoEmailReport.services.js` (plural) — we mock that
 * exact path.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock(
  "../../../core/v1/autoEmailReport/autoEmailReport.services.js",
  () => ({
    default: {
      createAutoEmailReport: vi.fn(),
      fetchReportDetails: vi.fn(),
      updateReport: vi.fn(),
      deleteReport: vi.fn(),
    },
  })
);

import autoEmailReportService from "../../../core/v1/autoEmailReport/autoEmailReport.services.js";
const { default: autoEmailReportController } = await import(
  "../../../core/v1/autoEmailReport/autoEmailReport.controller.js"
);
import { makeReqRes } from "../../helpers/factory.js";

const ALL_METHODS = [
  "createAutoEmailReport",
  "fetchReportDetails",
  "updateReport",
  "deleteReport",
];

function expectOnlyCalled(method) {
  for (const m of ALL_METHODS) {
    if (m === method) {
      expect(autoEmailReportService[m]).toHaveBeenCalledTimes(1);
    } else {
      expect(autoEmailReportService[m]).not.toHaveBeenCalled();
    }
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AutoEmailReportController", () => {
  describe("createAutoEmailReport", () => {
    it("delegates to autoEmailReportService.createAutoEmailReport and returns its result", async () => {
      autoEmailReportService.createAutoEmailReport.mockResolvedValueOnce({
        _id: "rep_1",
        reportsTitle: "Weekly Attendance",
        frequency: "weekly",
      });
      const { req, res, next } = makeReqRes();
      req.body = {
        reportsTitle: "Weekly Attendance",
        frequency: "weekly",
        recipients: ["ops@example.com"],
      };

      const out = await autoEmailReportController.createAutoEmailReport(
        req,
        res,
        next
      );

      expect(out).toEqual({
        _id: "rep_1",
        reportsTitle: "Weekly Attendance",
        frequency: "weekly",
      });
      expect(autoEmailReportService.createAutoEmailReport).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("createAutoEmailReport");
    });

    it("propagates rejections from the service", async () => {
      autoEmailReportService.createAutoEmailReport.mockRejectedValueOnce(
        new Error("duplicate report title")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        autoEmailReportController.createAutoEmailReport(req, res, next)
      ).rejects.toThrow("duplicate report title");
    });
  });

  describe("fetchReportDetails", () => {
    it("delegates to autoEmailReportService.fetchReportDetails and returns its result", async () => {
      autoEmailReportService.fetchReportDetails.mockResolvedValueOnce({
        data: [
          { _id: "rep_1", reportsTitle: "Weekly Attendance", frequency: "weekly" },
        ],
        total: 1,
      });
      const { req, res, next } = makeReqRes();
      req.query = {
        searchQuery: "Weekly",
        orderBy: "reportsTitle",
        sort: "asc",
        skip: "0",
        limit: "10",
      };

      // Note: controller signature passes only (req, res) for this method.
      const out = await autoEmailReportController.fetchReportDetails(req, res);

      expect(out).toEqual({
        data: [
          { _id: "rep_1", reportsTitle: "Weekly Attendance", frequency: "weekly" },
        ],
        total: 1,
      });
      expect(autoEmailReportService.fetchReportDetails).toHaveBeenCalledWith(
        req,
        res
      );
      expectOnlyCalled("fetchReportDetails");
    });

    it("propagates rejections from the service", async () => {
      autoEmailReportService.fetchReportDetails.mockRejectedValueOnce(
        new Error("db unreachable")
      );
      const { req, res } = makeReqRes();
      await expect(
        autoEmailReportController.fetchReportDetails(req, res)
      ).rejects.toThrow("db unreachable");
    });
  });

  describe("updateReport", () => {
    it("delegates to autoEmailReportService.updateReport and returns its result", async () => {
      autoEmailReportService.updateReport.mockResolvedValueOnce({
        _id: "rep_1",
        reportsTitle: "Daily Attendance",
        frequency: "daily",
      });
      const { req, res, next } = makeReqRes();
      req.query = { Id: "rep_1" };
      req.body = { reportsTitle: "Daily Attendance", frequency: "daily" };

      const out = await autoEmailReportController.updateReport(req, res, next);

      expect(out).toEqual({
        _id: "rep_1",
        reportsTitle: "Daily Attendance",
        frequency: "daily",
      });
      expect(autoEmailReportService.updateReport).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("updateReport");
    });

    it("propagates rejections from the service", async () => {
      autoEmailReportService.updateReport.mockRejectedValueOnce(
        new Error("report not found")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        autoEmailReportController.updateReport(req, res, next)
      ).rejects.toThrow("report not found");
    });
  });

  describe("deleteReport", () => {
    it("delegates to autoEmailReportService.deleteReport and returns its result", async () => {
      autoEmailReportService.deleteReport.mockResolvedValueOnce({
        success: true,
        deletedId: "rep_1",
      });
      const { req, res, next } = makeReqRes();
      req.query = { Id: "rep_1" };

      const out = await autoEmailReportController.deleteReport(req, res, next);

      expect(out).toEqual({ success: true, deletedId: "rep_1" });
      expect(autoEmailReportService.deleteReport).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("deleteReport");
    });

    it("propagates rejections from the service", async () => {
      autoEmailReportService.deleteReport.mockRejectedValueOnce(
        new Error("forbidden")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        autoEmailReportController.deleteReport(req, res, next)
      ).rejects.toThrow("forbidden");
    });
  });
});
