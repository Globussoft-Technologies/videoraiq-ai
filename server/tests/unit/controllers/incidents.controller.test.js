/**
 * Unit coverage for core/v1/incidents/incidents.controller.js.
 *
 * Every handler is a thin pass-through to incidentsService — each method
 * does nothing beyond `return incidentsService.<method>(req, res, next)`
 * (a few are `await`-ed, which is functionally equivalent for resolved
 * values but matters for rejection propagation). We mock the service so
 * we exercise only the controller's own delegation wiring and catch any
 * swapped method names.
 *
 * Style mirrors alerts.controller.test.js (R34), detectionObjects (R32),
 * permissions (R31), roles (R30), and departments (R29). This is the
 * last viable 0% controller flagged for R51 — incidents.controller.js
 * is 527 lines of pure delegation with 16 handlers.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../core/v1/incidents/incidents.service.js", () => ({
  default: {
    createIncidents: vi.fn(),
    getAllIncidentsById: vi.fn(),
    getAllIncidents: vi.fn(),
    updateIncident: vi.fn(),
    deleteIncident: vi.fn(),
    deleteIncidentsByIds: vi.fn(),
    getIncidentsDetails: vi.fn(),
    updateReportStatus: vi.fn(),
    getIncidentLists: vi.fn(),
    deskAbsenceData: vi.fn(),
    guardAbsenceData: vi.fn(),
    getVehicleDetectionLogs: vi.fn(),
    getVehicleNumbers: vi.fn(),
    getConveyorDetectionLogs: vi.fn(),
    getCrusherDetectionLogs: vi.fn(),
    getWaterSpillageDetectionLogs: vi.fn(),
    getVehicleCountLogs: vi.fn(),
    getLineCrossingLogs: vi.fn(),
  },
}));

import incidentsService from "../../../core/v1/incidents/incidents.service.js";
const { default: incidentsController } = await import(
  "../../../core/v1/incidents/incidents.controller.js"
);
import { makeReqRes } from "../../helpers/factory.js";

const SERVICE_METHODS = [
  "createIncidents",
  "getAllIncidentsById",
  "getAllIncidents",
  "updateIncident",
  "deleteIncident",
  "deleteIncidentsByIds",
  "getIncidentsDetails",
  "updateReportStatus",
  "getIncidentLists",
  "deskAbsenceData",
  "guardAbsenceData",
  "getVehicleDetectionLogs",
  "getVehicleNumbers",
  "getConveyorDetectionLogs",
  "getCrusherDetectionLogs",
  "getWaterSpillageDetectionLogs",
  "getVehicleCountLogs",
  "getLineCrossingLogs",
];

function expectOnlyCalled(method) {
  for (const m of SERVICE_METHODS) {
    if (m === method) continue;
    expect(incidentsService[m]).not.toHaveBeenCalled();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("incidentsController", () => {
  describe("createIncidents", () => {
    it("delegates to incidentsService.createIncidents and returns its result", async () => {
      incidentsService.createIncidents.mockResolvedValueOnce({
        success: true,
        incidentId: "inc_1",
      });
      const { req, res, next } = makeReqRes();
      req.body = {
        incidentType: "vehicleDetection",
        nvrId: "nvr_1",
        channelId: "ch_1",
      };

      const out = await incidentsController.createIncidents(req, res, next);

      expect(out).toEqual({ success: true, incidentId: "inc_1" });
      expect(incidentsService.createIncidents).toHaveBeenCalledTimes(1);
      expect(incidentsService.createIncidents).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("createIncidents");
    });

    it("propagates rejections from the service", async () => {
      incidentsService.createIncidents.mockRejectedValueOnce(
        new Error("missing channelId")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        incidentsController.createIncidents(req, res, next)
      ).rejects.toThrow("missing channelId");
    });
  });

  describe("getAllIncidentsById", () => {
    it("delegates to incidentsService.getAllIncidentsById and returns its result", async () => {
      incidentsService.getAllIncidentsById.mockResolvedValueOnce({
        data: [{ _id: "inc_1" }],
        total: 1,
      });
      const { req, res, next } = makeReqRes();
      req.query = {
        channelId: "ch_1",
        incidentId: "inc_1",
        skip: "0",
        limit: "10",
      };

      const out = await incidentsController.getAllIncidentsById(
        req,
        res,
        next
      );

      expect(out).toEqual({ data: [{ _id: "inc_1" }], total: 1 });
      expect(incidentsService.getAllIncidentsById).toHaveBeenCalledTimes(1);
      expect(incidentsService.getAllIncidentsById).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("getAllIncidentsById");
    });

    it("propagates rejections from the service", async () => {
      incidentsService.getAllIncidentsById.mockRejectedValueOnce(
        new Error("invalid channelId")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        incidentsController.getAllIncidentsById(req, res, next)
      ).rejects.toThrow("invalid channelId");
    });
  });

  describe("getAllIncidents", () => {
    it("delegates to incidentsService.getAllIncidents and returns its result", async () => {
      incidentsService.getAllIncidents.mockResolvedValueOnce({
        data: [{ _id: "inc_a" }, { _id: "inc_b" }],
        total: 2,
      });
      const { req, res, next } = makeReqRes();
      req.query = { skip: "0", limit: "20" };
      req.body = { startDate: "2026-05-01", endDate: "2026-05-25" };

      const out = await incidentsController.getAllIncidents(req, res, next);

      expect(out).toEqual({
        data: [{ _id: "inc_a" }, { _id: "inc_b" }],
        total: 2,
      });
      expect(incidentsService.getAllIncidents).toHaveBeenCalledTimes(1);
      expect(incidentsService.getAllIncidents).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("getAllIncidents");
    });

    it("propagates rejections from the service", async () => {
      incidentsService.getAllIncidents.mockRejectedValueOnce(
        new Error("db unreachable")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        incidentsController.getAllIncidents(req, res, next)
      ).rejects.toThrow("db unreachable");
    });
  });

  describe("updateIncident", () => {
    it("delegates to incidentsService.updateIncident and returns its result", async () => {
      incidentsService.updateIncident.mockResolvedValueOnce({
        success: true,
        modified: 1,
      });
      const { req, res, next } = makeReqRes();
      req.params = { id: "inc_1" };
      req.body = { resolved: true };

      const out = await incidentsController.updateIncident(req, res, next);

      expect(out).toEqual({ success: true, modified: 1 });
      expect(incidentsService.updateIncident).toHaveBeenCalledTimes(1);
      expect(incidentsService.updateIncident).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("updateIncident");
    });

    it("propagates rejections from the service", async () => {
      incidentsService.updateIncident.mockRejectedValueOnce(
        new Error("incident not found")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        incidentsController.updateIncident(req, res, next)
      ).rejects.toThrow("incident not found");
    });
  });

  describe("deleteIncident", () => {
    it("delegates to incidentsService.deleteIncident and returns its result", async () => {
      incidentsService.deleteIncident.mockResolvedValueOnce({
        success: true,
        deleted: 1,
      });
      const { req, res, next } = makeReqRes();
      req.params = { id: "inc_1" };

      const out = await incidentsController.deleteIncident(req, res, next);

      expect(out).toEqual({ success: true, deleted: 1 });
      expect(incidentsService.deleteIncident).toHaveBeenCalledTimes(1);
      expect(incidentsService.deleteIncident).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("deleteIncident");
    });

    it("propagates rejections from the service", async () => {
      incidentsService.deleteIncident.mockRejectedValueOnce(
        new Error("incident in use")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        incidentsController.deleteIncident(req, res, next)
      ).rejects.toThrow("incident in use");
    });
  });

  describe("deleteIncidentsByIds", () => {
    it("delegates to incidentsService.deleteIncidentsByIds and returns its result", async () => {
      incidentsService.deleteIncidentsByIds.mockResolvedValueOnce({
        success: true,
        deleted: 3,
      });
      const { req, res, next } = makeReqRes();
      req.body = { ids: ["inc_1", "inc_2", "inc_3"] };

      const out = await incidentsController.deleteIncidentsByIds(
        req,
        res,
        next
      );

      expect(out).toEqual({ success: true, deleted: 3 });
      expect(incidentsService.deleteIncidentsByIds).toHaveBeenCalledTimes(1);
      expect(incidentsService.deleteIncidentsByIds).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("deleteIncidentsByIds");
    });

    it("propagates rejections from the service", async () => {
      incidentsService.deleteIncidentsByIds.mockRejectedValueOnce(
        new Error("invalid ids array")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        incidentsController.deleteIncidentsByIds(req, res, next)
      ).rejects.toThrow("invalid ids array");
    });
  });

  describe("getIncidentsDetails", () => {
    it("delegates to incidentsService.getIncidentsDetails and returns its result", async () => {
      incidentsService.getIncidentsDetails.mockResolvedValueOnce({
        data: [{ _id: "inc_1", severity: "high" }],
        total: 1,
      });
      const { req, res, next } = makeReqRes();
      req.query = {
        search: "intrusion",
        channelId: "ch_1",
        nvrId: "nvr_1",
        skip: "0",
        limit: "10",
      };

      const out = await incidentsController.getIncidentsDetails(
        req,
        res,
        next
      );

      expect(out).toEqual({
        data: [{ _id: "inc_1", severity: "high" }],
        total: 1,
      });
      expect(incidentsService.getIncidentsDetails).toHaveBeenCalledTimes(1);
      expect(incidentsService.getIncidentsDetails).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("getIncidentsDetails");
    });

    it("propagates rejections from the service", async () => {
      incidentsService.getIncidentsDetails.mockRejectedValueOnce(
        new Error("invalid channel id")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        incidentsController.getIncidentsDetails(req, res, next)
      ).rejects.toThrow("invalid channel id");
    });
  });

  describe("updateReportStatus", () => {
    it("delegates to incidentsService.updateReportStatus and returns its result", async () => {
      incidentsService.updateReportStatus.mockResolvedValueOnce({
        success: true,
        modified: 5,
      });
      const { req, res, next } = makeReqRes();
      req.body = { ids: ["inc_1", "inc_2"], reportStatus: true };

      const out = await incidentsController.updateReportStatus(
        req,
        res,
        next
      );

      expect(out).toEqual({ success: true, modified: 5 });
      expect(incidentsService.updateReportStatus).toHaveBeenCalledTimes(1);
      expect(incidentsService.updateReportStatus).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("updateReportStatus");
    });

    it("propagates rejections from the service", async () => {
      incidentsService.updateReportStatus.mockRejectedValueOnce(
        new Error("missing reportStatus")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        incidentsController.updateReportStatus(req, res, next)
      ).rejects.toThrow("missing reportStatus");
    });
  });

  describe("getIncidentLists", () => {
    it("delegates to incidentsService.getIncidentLists and returns its result", async () => {
      incidentsService.getIncidentLists.mockResolvedValueOnce({
        data: [{ type: "vehicleDetection" }, { type: "lineCrossing" }],
        total: 2,
      });
      const { req, res, next } = makeReqRes();
      req.query = { skip: "0", limit: "50" };

      const out = await incidentsController.getIncidentLists(req, res, next);

      expect(out).toEqual({
        data: [{ type: "vehicleDetection" }, { type: "lineCrossing" }],
        total: 2,
      });
      expect(incidentsService.getIncidentLists).toHaveBeenCalledTimes(1);
      expect(incidentsService.getIncidentLists).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("getIncidentLists");
    });

    it("propagates rejections from the service", async () => {
      incidentsService.getIncidentLists.mockRejectedValueOnce(
        new Error("db unreachable")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        incidentsController.getIncidentLists(req, res, next)
      ).rejects.toThrow("db unreachable");
    });
  });

  describe("deskAbsenceData", () => {
    it("delegates to incidentsService.deskAbsenceData and returns its result", async () => {
      incidentsService.deskAbsenceData.mockResolvedValueOnce({
        data: [{ desk: "desk_1", absent: true }],
        total: 1,
      });
      const { req, res, next } = makeReqRes();
      req.query = { skip: "0", limit: "10", search: "front", isExport: "false" };

      const out = await incidentsController.deskAbsenceData(req, res, next);

      expect(out).toEqual({
        data: [{ desk: "desk_1", absent: true }],
        total: 1,
      });
      expect(incidentsService.deskAbsenceData).toHaveBeenCalledTimes(1);
      expect(incidentsService.deskAbsenceData).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("deskAbsenceData");
    });

    it("propagates rejections from the service", async () => {
      incidentsService.deskAbsenceData.mockRejectedValueOnce(
        new Error("query failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        incidentsController.deskAbsenceData(req, res, next)
      ).rejects.toThrow("query failed");
    });
  });

  describe("guardAbsenceData", () => {
    it("delegates to incidentsService.guardAbsenceData and returns its result", async () => {
      incidentsService.guardAbsenceData.mockResolvedValueOnce({
        data: [{ post: "gate_a", absent: false }],
        total: 1,
      });
      const { req, res, next } = makeReqRes();
      req.query = { skip: "0", limit: "10", search: "gate", isExport: "true" };

      const out = await incidentsController.guardAbsenceData(req, res, next);

      expect(out).toEqual({
        data: [{ post: "gate_a", absent: false }],
        total: 1,
      });
      expect(incidentsService.guardAbsenceData).toHaveBeenCalledTimes(1);
      expect(incidentsService.guardAbsenceData).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("guardAbsenceData");
    });

    it("propagates rejections from the service", async () => {
      incidentsService.guardAbsenceData.mockRejectedValueOnce(
        new Error("aggregation failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        incidentsController.guardAbsenceData(req, res, next)
      ).rejects.toThrow("aggregation failed");
    });
  });

  describe("getVehicleDetectionLogs", () => {
    it("delegates to incidentsService.getVehicleDetectionLogs and returns its result", async () => {
      incidentsService.getVehicleDetectionLogs.mockResolvedValueOnce({
        data: [{ vehicleNumber: "KA01AB1234" }],
        total: 1,
      });
      const { req, res, next } = makeReqRes();
      req.query = {
        startDate: "2026-05-01",
        endDate: "2026-05-25",
        nvrId: "nvr_1",
        channelId: "ch_1",
        severity: "high",
        resolved: "false",
        vehicleNumber: "KA01",
        skip: "0",
        limit: "10",
      };

      const out = await incidentsController.getVehicleDetectionLogs(
        req,
        res,
        next
      );

      expect(out).toEqual({
        data: [{ vehicleNumber: "KA01AB1234" }],
        total: 1,
      });
      expect(incidentsService.getVehicleDetectionLogs).toHaveBeenCalledTimes(1);
      expect(incidentsService.getVehicleDetectionLogs).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("getVehicleDetectionLogs");
    });

    it("propagates rejections from the service", async () => {
      incidentsService.getVehicleDetectionLogs.mockRejectedValueOnce(
        new Error("invalid date range")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        incidentsController.getVehicleDetectionLogs(req, res, next)
      ).rejects.toThrow("invalid date range");
    });
  });

  describe("getVehicleNumbers", () => {
    it("delegates to incidentsService.getVehicleNumbers and returns its result", async () => {
      incidentsService.getVehicleNumbers.mockResolvedValueOnce({
        data: ["KA01AB1234", "MH12XY9876"],
      });
      const { req, res, next } = makeReqRes();

      const out = await incidentsController.getVehicleNumbers(req, res, next);

      expect(out).toEqual({ data: ["KA01AB1234", "MH12XY9876"] });
      expect(incidentsService.getVehicleNumbers).toHaveBeenCalledTimes(1);
      expect(incidentsService.getVehicleNumbers).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("getVehicleNumbers");
    });

    it("propagates rejections from the service", async () => {
      incidentsService.getVehicleNumbers.mockRejectedValueOnce(
        new Error("distinct query failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        incidentsController.getVehicleNumbers(req, res, next)
      ).rejects.toThrow("distinct query failed");
    });
  });

  describe("getConveyorDetectionLogs", () => {
    it("delegates to incidentsService.getConveyorDetectionLogs and returns its result", async () => {
      incidentsService.getConveyorDetectionLogs.mockResolvedValueOnce({
        data: [{ status: "ON" }],
        total: 1,
      });
      const { req, res, next } = makeReqRes();
      req.query = {
        startDate: "2026-05-01",
        endDate: "2026-05-25",
        status: "ON",
        skip: "0",
        limit: "10",
      };

      const out = await incidentsController.getConveyorDetectionLogs(
        req,
        res,
        next
      );

      expect(out).toEqual({ data: [{ status: "ON" }], total: 1 });
      expect(incidentsService.getConveyorDetectionLogs).toHaveBeenCalledTimes(
        1
      );
      expect(incidentsService.getConveyorDetectionLogs).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("getConveyorDetectionLogs");
    });

    it("propagates rejections from the service", async () => {
      incidentsService.getConveyorDetectionLogs.mockRejectedValueOnce(
        new Error("conveyor lookup failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        incidentsController.getConveyorDetectionLogs(req, res, next)
      ).rejects.toThrow("conveyor lookup failed");
    });
  });

  describe("getCrusherDetectionLogs", () => {
    it("delegates to incidentsService.getCrusherDetectionLogs and returns its result", async () => {
      incidentsService.getCrusherDetectionLogs.mockResolvedValueOnce({
        data: [{ status: "OFF" }],
        total: 1,
      });
      const { req, res, next } = makeReqRes();
      req.query = {
        startDate: "2026-05-01",
        endDate: "2026-05-25",
        status: "OFF",
        severity: "moderate",
        skip: "0",
        limit: "10",
      };

      const out = await incidentsController.getCrusherDetectionLogs(
        req,
        res,
        next
      );

      expect(out).toEqual({ data: [{ status: "OFF" }], total: 1 });
      expect(incidentsService.getCrusherDetectionLogs).toHaveBeenCalledTimes(
        1
      );
      expect(incidentsService.getCrusherDetectionLogs).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("getCrusherDetectionLogs");
    });

    it("propagates rejections from the service", async () => {
      incidentsService.getCrusherDetectionLogs.mockRejectedValueOnce(
        new Error("crusher lookup failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        incidentsController.getCrusherDetectionLogs(req, res, next)
      ).rejects.toThrow("crusher lookup failed");
    });
  });

  describe("getWaterSpillageDetectionLogs", () => {
    it("delegates to incidentsService.getWaterSpillageDetectionLogs and returns its result", async () => {
      incidentsService.getWaterSpillageDetectionLogs.mockResolvedValueOnce({
        data: [{ status: "DETECTED" }],
        total: 1,
      });
      const { req, res, next } = makeReqRes();
      req.query = {
        startDate: "2026-05-01",
        endDate: "2026-05-25",
        status: "DETECTED",
        skip: "0",
        limit: "10",
      };

      const out =
        await incidentsController.getWaterSpillageDetectionLogs(
          req,
          res,
          next
        );

      expect(out).toEqual({ data: [{ status: "DETECTED" }], total: 1 });
      expect(
        incidentsService.getWaterSpillageDetectionLogs
      ).toHaveBeenCalledTimes(1);
      expect(
        incidentsService.getWaterSpillageDetectionLogs
      ).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("getWaterSpillageDetectionLogs");
    });

    it("propagates rejections from the service", async () => {
      incidentsService.getWaterSpillageDetectionLogs.mockRejectedValueOnce(
        new Error("water spillage lookup failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        incidentsController.getWaterSpillageDetectionLogs(req, res, next)
      ).rejects.toThrow("water spillage lookup failed");
    });
  });

  describe("getVehicleCountLogs", () => {
    it("delegates to incidentsService.getVehicleCountLogs and returns its result", async () => {
      incidentsService.getVehicleCountLogs.mockResolvedValueOnce({
        data: [{ count: 42 }],
        total: 1,
      });
      const { req, res, next } = makeReqRes();
      req.query = {
        startDate: "2026-05-01",
        endDate: "2026-05-25",
        minCount: "10",
        maxCount: "100",
        skip: "0",
        limit: "10",
      };

      const out = await incidentsController.getVehicleCountLogs(
        req,
        res,
        next
      );

      expect(out).toEqual({ data: [{ count: 42 }], total: 1 });
      expect(incidentsService.getVehicleCountLogs).toHaveBeenCalledTimes(1);
      expect(incidentsService.getVehicleCountLogs).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("getVehicleCountLogs");
    });

    it("propagates rejections from the service", async () => {
      incidentsService.getVehicleCountLogs.mockRejectedValueOnce(
        new Error("count query failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        incidentsController.getVehicleCountLogs(req, res, next)
      ).rejects.toThrow("count query failed");
    });
  });

  describe("getLineCrossingLogs", () => {
    it("delegates to incidentsService.getLineCrossingLogs and returns its result", async () => {
      incidentsService.getLineCrossingLogs.mockResolvedValueOnce({
        data: [{ AtoB: 5, BtoA: 3 }],
        total: 1,
      });
      const { req, res, next } = makeReqRes();
      req.query = {
        startDate: "2026-05-01",
        endDate: "2026-05-25",
        minAtoB: "1",
        maxAtoB: "10",
        minBtoA: "1",
        maxBtoA: "10",
        skip: "0",
        limit: "10",
      };

      const out = await incidentsController.getLineCrossingLogs(
        req,
        res,
        next
      );

      expect(out).toEqual({ data: [{ AtoB: 5, BtoA: 3 }], total: 1 });
      expect(incidentsService.getLineCrossingLogs).toHaveBeenCalledTimes(1);
      expect(incidentsService.getLineCrossingLogs).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("getLineCrossingLogs");
    });

    it("propagates rejections from the service", async () => {
      incidentsService.getLineCrossingLogs.mockRejectedValueOnce(
        new Error("line crossing lookup failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        incidentsController.getLineCrossingLogs(req, res, next)
      ).rejects.toThrow("line crossing lookup failed");
    });
  });
});
