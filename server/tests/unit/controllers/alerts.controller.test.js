/**
 * Unit coverage for core/v1/alerts/alerts.controller.js.
 *
 * Every handler is a thin pass-through to alertsService — the controller
 * does nothing beyond `return await alertsService.<method>(req, res, next)`.
 * We mock the service so we exercise only the controller's own delegation
 * wiring and catch any swapped method names.
 *
 * Style mirrors detectionObjects.controller.test.js (R32),
 * permissions.controller.test.js (R31), roles (R30), and departments (R29).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../core/v1/alerts/alerts.service.js", () => ({
  default: {
    createAlert: vi.fn(),
    updateAlert: vi.fn(),
    fetchAllAlerts: vi.fn(),
    deleteAlerts: vi.fn(),
  },
}));

import alertsService from "../../../core/v1/alerts/alerts.service.js";
const { default: alertsController } = await import(
  "../../../core/v1/alerts/alerts.controller.js"
);
import { makeReqRes } from "../../helpers/factory.js";

const SERVICE_METHODS = [
  "createAlert",
  "updateAlert",
  "fetchAllAlerts",
  "deleteAlerts",
];

function expectOnlyCalled(method) {
  for (const m of SERVICE_METHODS) {
    if (m === method) continue;
    expect(alertsService[m]).not.toHaveBeenCalled();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("alertsController", () => {
  describe("createAlert", () => {
    it("delegates to alertsService.createAlert and returns its result", async () => {
      alertsService.createAlert.mockResolvedValueOnce({
        success: true,
        alertId: "alert_1",
      });
      const { req, res, next } = makeReqRes();
      req.query = { alertBasedOn: "Camera" };
      req.body = {
        emails: ["ops@example.com"],
        phoneNumbers: ["+15555555555"],
        detectionTypes: ["person"],
      };

      const out = await alertsController.createAlert(req, res, next);

      expect(out).toEqual({ success: true, alertId: "alert_1" });
      expect(alertsService.createAlert).toHaveBeenCalledTimes(1);
      expect(alertsService.createAlert).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("createAlert");
    });

    it("propagates rejections from the service", async () => {
      alertsService.createAlert.mockRejectedValueOnce(
        new Error("validation failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        alertsController.createAlert(req, res, next)
      ).rejects.toThrow("validation failed");
    });
  });

  describe("updateAlert", () => {
    it("delegates to alertsService.updateAlert and returns its result", async () => {
      alertsService.updateAlert.mockResolvedValueOnce({
        success: true,
        modified: 1,
      });
      const { req, res, next } = makeReqRes();
      req.query = { alertId: "alert_1", alertBasedOn: "NVR" };
      req.body = { emails: ["ops2@example.com"] };

      const out = await alertsController.updateAlert(req, res, next);

      expect(out).toEqual({ success: true, modified: 1 });
      expect(alertsService.updateAlert).toHaveBeenCalledTimes(1);
      expect(alertsService.updateAlert).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("updateAlert");
    });

    it("propagates rejections from the service", async () => {
      alertsService.updateAlert.mockRejectedValueOnce(
        new Error("alert not found")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        alertsController.updateAlert(req, res, next)
      ).rejects.toThrow("alert not found");
    });
  });

  describe("fetchAllAlerts", () => {
    it("delegates to alertsService.fetchAllAlerts and returns its result", async () => {
      alertsService.fetchAllAlerts.mockResolvedValueOnce({
        data: [
          { _id: "alert_1", alertBasedOn: "Camera" },
          { _id: "alert_2", alertBasedOn: "NVR" },
        ],
        total: 2,
      });
      const { req, res, next } = makeReqRes();
      req.query = { skip: "0", limit: "10" };

      const out = await alertsController.fetchAllAlerts(req, res, next);

      expect(out).toEqual({
        data: [
          { _id: "alert_1", alertBasedOn: "Camera" },
          { _id: "alert_2", alertBasedOn: "NVR" },
        ],
        total: 2,
      });
      expect(alertsService.fetchAllAlerts).toHaveBeenCalledTimes(1);
      expect(alertsService.fetchAllAlerts).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("fetchAllAlerts");
    });

    it("propagates rejections from the service", async () => {
      alertsService.fetchAllAlerts.mockRejectedValueOnce(
        new Error("db unreachable")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        alertsController.fetchAllAlerts(req, res, next)
      ).rejects.toThrow("db unreachable");
    });
  });

  describe("deleteAlerts", () => {
    it("delegates to alertsService.deleteAlerts and returns its result", async () => {
      alertsService.deleteAlerts.mockResolvedValueOnce({
        success: true,
        deleted: 1,
      });
      const { req, res, next } = makeReqRes();
      req.query = { id: "alert_1" };

      const out = await alertsController.deleteAlerts(req, res, next);

      expect(out).toEqual({ success: true, deleted: 1 });
      expect(alertsService.deleteAlerts).toHaveBeenCalledTimes(1);
      expect(alertsService.deleteAlerts).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("deleteAlerts");
    });

    it("propagates rejections from the service", async () => {
      alertsService.deleteAlerts.mockRejectedValueOnce(
        new Error("alert in use")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        alertsController.deleteAlerts(req, res, next)
      ).rejects.toThrow("alert in use");
    });
  });
});
