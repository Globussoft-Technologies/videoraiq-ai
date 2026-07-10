/**
 * Unit coverage for core/v1/dashboard/dashboard.controller.js.
 *
 * Every handler is a thin pass-through to dashboardService — the controller
 * does nothing beyond `return dashboardService.<method>(req, res, next)`.
 * We mock the service so we exercise only the controller's own delegation
 * wiring and catch any swapped method names.
 *
 * Style mirrors alerts.controller.test.js (R-prior), detectionObjects (R32),
 * permissions (R31), roles (R30), and departments (R29).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../core/v1/dashboard/dashboard.service.js", () => ({
  default: {
    headerStats: vi.fn(),
    criticalityStats: vi.fn(),
    detectionChart: vi.fn(),
    WeeklyComparisonChart: vi.fn(),
    getSidebarConfig: vi.fn(),
    updateSidebarConfig: vi.fn(),
    recentIncidents: vi.fn(),
    getIncidentsByType: vi.fn(),
    getDetections: vi.fn(),
  },
}));

import dashboardService from "../../../core/v1/dashboard/dashboard.service.js";
const { default: dashboardController } = await import(
  "../../../core/v1/dashboard/dashboard.controller.js"
);
import { makeReqRes } from "../../helpers/factory.js";

const SERVICE_METHODS = [
  "headerStats",
  "criticalityStats",
  "detectionChart",
  "WeeklyComparisonChart",
  "getSidebarConfig",
  "updateSidebarConfig",
  "recentIncidents",
  "getIncidentsByType",
  "getDetections",
];

function expectOnlyCalled(method) {
  for (const m of SERVICE_METHODS) {
    if (m === method) continue;
    expect(dashboardService[m]).not.toHaveBeenCalled();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("dashboardController", () => {
  describe("headerStats", () => {
    it("delegates to dashboardService.headerStats and returns its result", async () => {
      dashboardService.headerStats.mockResolvedValueOnce({
        success: true,
        data: { totalIncidents: 42, totalDetections: 100 },
      });
      const { req, res, next } = makeReqRes();
      req.body = { startDate: "2026-05-01", endDate: "2026-05-25" };

      const out = await dashboardController.headerStats(req, res, next);

      expect(out).toEqual({
        success: true,
        data: { totalIncidents: 42, totalDetections: 100 },
      });
      expect(dashboardService.headerStats).toHaveBeenCalledTimes(1);
      expect(dashboardService.headerStats).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("headerStats");
    });

    it("propagates rejections from the service", async () => {
      dashboardService.headerStats.mockRejectedValueOnce(
        new Error("aggregation failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        dashboardController.headerStats(req, res, next)
      ).rejects.toThrow("aggregation failed");
    });
  });

  describe("criticalityStats", () => {
    it("delegates to dashboardService.criticalityStats and returns its result", async () => {
      dashboardService.criticalityStats.mockResolvedValueOnce({
        success: true,
        data: [{ severity: "high", count: 5 }],
      });
      const { req, res, next } = makeReqRes();
      req.query = { skip: "0", limit: "10" };

      const out = await dashboardController.criticalityStats(req, res, next);

      expect(out).toEqual({
        success: true,
        data: [{ severity: "high", count: 5 }],
      });
      expect(dashboardService.criticalityStats).toHaveBeenCalledTimes(1);
      expect(dashboardService.criticalityStats).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("criticalityStats");
    });

    it("propagates rejections from the service", async () => {
      dashboardService.criticalityStats.mockRejectedValueOnce(
        new Error("db unreachable")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        dashboardController.criticalityStats(req, res, next)
      ).rejects.toThrow("db unreachable");
    });
  });

  describe("detectionChart", () => {
    it("delegates to dashboardService.detectionChart and returns its result", async () => {
      dashboardService.detectionChart.mockResolvedValueOnce({
        success: true,
        data: { labels: ["Mon"], values: [3] },
      });
      const { req, res, next } = makeReqRes();
      req.body = { startDate: "2026-05-01", endDate: "2026-05-25" };

      const out = await dashboardController.detectionChart(req, res, next);

      expect(out).toEqual({
        success: true,
        data: { labels: ["Mon"], values: [3] },
      });
      expect(dashboardService.detectionChart).toHaveBeenCalledTimes(1);
      expect(dashboardService.detectionChart).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("detectionChart");
    });

    it("propagates rejections from the service", async () => {
      dashboardService.detectionChart.mockRejectedValueOnce(
        new Error("invalid filter")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        dashboardController.detectionChart(req, res, next)
      ).rejects.toThrow("invalid filter");
    });
  });

  describe("WeeklyComparisonChart", () => {
    it("delegates to dashboardService.WeeklyComparisonChart and returns its result", async () => {
      dashboardService.WeeklyComparisonChart.mockResolvedValueOnce({
        success: true,
        data: { thisWeek: 10, lastWeek: 8 },
      });
      const { req, res, next } = makeReqRes();
      req.body = { weekOffset: 0 };

      const out = await dashboardController.WeeklyComparisonChart(
        req,
        res,
        next
      );

      expect(out).toEqual({
        success: true,
        data: { thisWeek: 10, lastWeek: 8 },
      });
      expect(dashboardService.WeeklyComparisonChart).toHaveBeenCalledTimes(1);
      expect(dashboardService.WeeklyComparisonChart).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("WeeklyComparisonChart");
    });

    it("propagates rejections from the service", async () => {
      dashboardService.WeeklyComparisonChart.mockRejectedValueOnce(
        new Error("range too large")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        dashboardController.WeeklyComparisonChart(req, res, next)
      ).rejects.toThrow("range too large");
    });
  });

  describe("getSidebarConfig", () => {
    it("delegates to dashboardService.getSidebarConfig and returns its result", async () => {
      dashboardService.getSidebarConfig.mockResolvedValueOnce({
        success: true,
        data: { sidebar: ["dashboard", "incidents"] },
      });
      const { req, res, next } = makeReqRes();

      const out = await dashboardController.getSidebarConfig(req, res, next);

      expect(out).toEqual({
        success: true,
        data: { sidebar: ["dashboard", "incidents"] },
      });
      expect(dashboardService.getSidebarConfig).toHaveBeenCalledTimes(1);
      expect(dashboardService.getSidebarConfig).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("getSidebarConfig");
    });

    it("propagates rejections from the service", async () => {
      dashboardService.getSidebarConfig.mockRejectedValueOnce(
        new Error("config not found")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        dashboardController.getSidebarConfig(req, res, next)
      ).rejects.toThrow("config not found");
    });
  });

  describe("updateSidebarConfig", () => {
    it("delegates to dashboardService.updateSidebarConfig and returns its result", async () => {
      dashboardService.updateSidebarConfig.mockResolvedValueOnce({
        success: true,
        modified: 1,
      });
      const { req, res, next } = makeReqRes();
      req.body = { sidebar: ["dashboard", "incidents", "users"] };

      const out = await dashboardController.updateSidebarConfig(req, res, next);

      expect(out).toEqual({ success: true, modified: 1 });
      expect(dashboardService.updateSidebarConfig).toHaveBeenCalledTimes(1);
      expect(dashboardService.updateSidebarConfig).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("updateSidebarConfig");
    });

    it("propagates rejections from the service", async () => {
      dashboardService.updateSidebarConfig.mockRejectedValueOnce(
        new Error("validation failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        dashboardController.updateSidebarConfig(req, res, next)
      ).rejects.toThrow("validation failed");
    });
  });

  describe("recentIncidents", () => {
    it("delegates to dashboardService.recentIncidents and returns its result", async () => {
      dashboardService.recentIncidents.mockResolvedValueOnce({
        success: true,
        data: [{ _id: "inc_1", type: "lineCrossing" }],
      });
      const { req, res, next } = makeReqRes();
      req.query = { nvrId: "nvr_1", channelId: "ch_1" };

      const out = await dashboardController.recentIncidents(req, res, next);

      expect(out).toEqual({
        success: true,
        data: [{ _id: "inc_1", type: "lineCrossing" }],
      });
      expect(dashboardService.recentIncidents).toHaveBeenCalledTimes(1);
      expect(dashboardService.recentIncidents).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("recentIncidents");
    });

    it("propagates rejections from the service", async () => {
      dashboardService.recentIncidents.mockRejectedValueOnce(
        new Error("nvr not found")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        dashboardController.recentIncidents(req, res, next)
      ).rejects.toThrow("nvr not found");
    });
  });

  describe("getIncidentsByType", () => {
    it("delegates to dashboardService.getIncidentsByType and returns its result", async () => {
      dashboardService.getIncidentsByType.mockResolvedValueOnce({
        success: true,
        data: [{ incidentType: "motionDetection", count: 7 }],
      });
      const { req, res, next } = makeReqRes();
      req.query = { incidentType: "motionDetection", skip: "0", limit: "10" };

      const out = await dashboardController.getIncidentsByType(req, res, next);

      expect(out).toEqual({
        success: true,
        data: [{ incidentType: "motionDetection", count: 7 }],
      });
      expect(dashboardService.getIncidentsByType).toHaveBeenCalledTimes(1);
      expect(dashboardService.getIncidentsByType).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("getIncidentsByType");
    });

    it("propagates rejections from the service", async () => {
      dashboardService.getIncidentsByType.mockRejectedValueOnce(
        new Error("invalid incident type")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        dashboardController.getIncidentsByType(req, res, next)
      ).rejects.toThrow("invalid incident type");
    });
  });

  describe("getDetections", () => {
    it("delegates to dashboardService.getDetections and returns its result", async () => {
      dashboardService.getDetections.mockResolvedValueOnce({
        success: true,
        data: [{ detectionType: "countPersons", count: 12 }],
      });
      const { req, res, next } = makeReqRes();
      req.query = { detectionType: "countPersons", day: "today" };
      req.body = { channelIds: ["ch_1"] };

      const out = await dashboardController.getDetections(req, res, next);

      expect(out).toEqual({
        success: true,
        data: [{ detectionType: "countPersons", count: 12 }],
      });
      expect(dashboardService.getDetections).toHaveBeenCalledTimes(1);
      expect(dashboardService.getDetections).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("getDetections");
    });

    it("propagates rejections from the service", async () => {
      dashboardService.getDetections.mockRejectedValueOnce(
        new Error("aggregation pipeline error")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        dashboardController.getDetections(req, res, next)
      ).rejects.toThrow("aggregation pipeline error");
    });
  });
});
