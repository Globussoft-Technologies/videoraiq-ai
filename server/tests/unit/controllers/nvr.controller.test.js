/**
 * Unit coverage for core/v1/NVR/nvr.controller.js.
 *
 * NVRController is a thin pass-through to NVRService — every handler is a
 * one-liner `return NVRService.<method>(req, res, next)`. We mock the service
 * module so only the controller's own delegation logic runs; the service
 * itself (which fans out to the NVR model, the brand probe layer, and the
 * channels collection) is integration-tested elsewhere
 * (tests/integration/services/nvr.service*.test.js).
 *
 * For each controller method we confirm:
 *   - it forwards the exact (req, res, next) it received,
 *   - it returns whatever the service returned,
 *   - it propagates rejections from the service,
 *   - it does not accidentally invoke sibling service methods.
 *
 * Style mirrors entry.controller.test.js (R44 reference) and
 * domain.controller.test.js (R43 reference).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../core/v1/NVR/nvr.service.js", () => ({
  default: {
    registerNvr: vi.fn(),
    allNvrs: vi.fn(),
    updateNvr: vi.fn(),
    updateNvrChannels: vi.fn(),
    deleteNvr: vi.fn(),
    getNvrById: vi.fn(),
    getAllNvrs: vi.fn(),
    getNVRsWithChannels: vi.fn(),
    getNVRLocations: vi.fn(),
    addNvr: vi.fn(),
    deleteAllNvrs: vi.fn(),
  },
}));

import NVRService from "../../../core/v1/NVR/nvr.service.js";
const { default: nvrController } = await import(
  "../../../core/v1/NVR/nvr.controller.js"
);
import { makeReqRes } from "../../helpers/factory.js";

const ALL_METHODS = [
  "registerNvr",
  "allNvrs",
  "updateNvr",
  "updateNvrChannels",
  "deleteNvr",
  "getNvrById",
  "getAllNvrs",
  "getNVRsWithChannels",
  "getNVRLocations",
  "addNvr",
  "deleteAllNvrs",
];

function expectOnlyCalled(method) {
  for (const m of ALL_METHODS) {
    if (m === method) {
      expect(NVRService[m]).toHaveBeenCalledTimes(1);
    } else {
      expect(NVRService[m]).not.toHaveBeenCalled();
    }
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("NVRController", () => {
  describe("registerNvr", () => {
    it("delegates to NVRService.registerNvr and returns its result", async () => {
      NVRService.registerNvr.mockResolvedValueOnce({
        status: 201,
        body: { success: true, nvrId: "nvr_1", cameras: 4 },
      });
      const { req, res, next } = makeReqRes();
      req.body = {
        name: "Lobby NVR",
        ip: "192.168.1.10",
        port: 554,
        username: "admin",
        password: "secret",
        brand: "Hikvision",
      };

      const out = await nvrController.registerNvr(req, res, next);

      expect(out).toEqual({
        status: 201,
        body: { success: true, nvrId: "nvr_1", cameras: 4 },
      });
      expect(NVRService.registerNvr).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("registerNvr");
    });

    it("propagates rejections from the service", async () => {
      NVRService.registerNvr.mockRejectedValueOnce(
        new Error("brand probe failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        nvrController.registerNvr(req, res, next)
      ).rejects.toThrow("brand probe failed");
    });
  });

  describe("allNvrs", () => {
    it("delegates to NVRService.allNvrs and returns its result", async () => {
      NVRService.allNvrs.mockResolvedValueOnce({
        data: [{ _id: "nvr_1" }, { _id: "nvr_2" }],
      });
      const { req, res, next } = makeReqRes();

      const out = await nvrController.allNvrs(req, res, next);

      expect(out).toEqual({ data: [{ _id: "nvr_1" }, { _id: "nvr_2" }] });
      expect(NVRService.allNvrs).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("allNvrs");
    });

    it("propagates rejections from the service", async () => {
      NVRService.allNvrs.mockRejectedValueOnce(new Error("db unreachable"));
      const { req, res, next } = makeReqRes();
      await expect(nvrController.allNvrs(req, res, next)).rejects.toThrow(
        "db unreachable"
      );
    });
  });

  describe("updateNvr", () => {
    it("delegates to NVRService.updateNvr and returns its result", async () => {
      NVRService.updateNvr.mockResolvedValueOnce({
        status: 200,
        body: { success: true, message: "NVR updated" },
      });
      const { req, res, next } = makeReqRes();
      req.params = { id: "nvr_1" };
      req.body = { name: "Lobby NVR - renamed", port: 8000 };

      const out = await nvrController.updateNvr(req, res, next);

      expect(out).toEqual({
        status: 200,
        body: { success: true, message: "NVR updated" },
      });
      expect(NVRService.updateNvr).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("updateNvr");
    });

    it("propagates rejections from the service", async () => {
      NVRService.updateNvr.mockRejectedValueOnce(new Error("nvr not found"));
      const { req, res, next } = makeReqRes();
      await expect(
        nvrController.updateNvr(req, res, next)
      ).rejects.toThrow("nvr not found");
    });
  });

  describe("updateNvrChannels", () => {
    it("delegates to NVRService.updateNvrChannels and returns its result", async () => {
      NVRService.updateNvrChannels.mockResolvedValueOnce({
        status: 200,
        body: { success: true, channelsAdded: 2 },
      });
      const { req, res, next } = makeReqRes();
      req.params = { id: "nvr_1" };

      const out = await nvrController.updateNvrChannels(req, res, next);

      expect(out).toEqual({
        status: 200,
        body: { success: true, channelsAdded: 2 },
      });
      expect(NVRService.updateNvrChannels).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("updateNvrChannels");
    });

    it("propagates rejections from the service", async () => {
      NVRService.updateNvrChannels.mockRejectedValueOnce(
        new Error("refetch failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        nvrController.updateNvrChannels(req, res, next)
      ).rejects.toThrow("refetch failed");
    });
  });

  describe("deleteNvr", () => {
    it("delegates to NVRService.deleteNvr and returns its result", async () => {
      NVRService.deleteNvr.mockResolvedValueOnce({
        status: 200,
        body: { success: true, message: "NVR deleted" },
      });
      const { req, res, next } = makeReqRes();
      req.params = { id: "nvr_1" };

      const out = await nvrController.deleteNvr(req, res, next);

      expect(out).toEqual({
        status: 200,
        body: { success: true, message: "NVR deleted" },
      });
      expect(NVRService.deleteNvr).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("deleteNvr");
    });

    it("propagates rejections from the service", async () => {
      NVRService.deleteNvr.mockRejectedValueOnce(new Error("nvr not found"));
      const { req, res, next } = makeReqRes();
      await expect(
        nvrController.deleteNvr(req, res, next)
      ).rejects.toThrow("nvr not found");
    });
  });

  describe("getNvrById", () => {
    it("delegates to NVRService.getNvrById and returns its result", async () => {
      NVRService.getNvrById.mockResolvedValueOnce({
        data: { _id: "nvr_1", name: "Lobby NVR" },
      });
      const { req, res, next } = makeReqRes();
      req.params = { id: "nvr_1" };

      const out = await nvrController.getNvrById(req, res, next);

      expect(out).toEqual({ data: { _id: "nvr_1", name: "Lobby NVR" } });
      expect(NVRService.getNvrById).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("getNvrById");
    });

    it("propagates rejections from the service", async () => {
      NVRService.getNvrById.mockRejectedValueOnce(new Error("nvr not found"));
      const { req, res, next } = makeReqRes();
      await expect(
        nvrController.getNvrById(req, res, next)
      ).rejects.toThrow("nvr not found");
    });
  });

  describe("getAllNvrs", () => {
    it("delegates to NVRService.getAllNvrs and returns its result", async () => {
      NVRService.getAllNvrs.mockResolvedValueOnce({
        data: [{ _id: "nvr_1" }],
        total: 1,
      });
      const { req, res, next } = makeReqRes();
      req.query = { skip: "0", limit: "10" };

      const out = await nvrController.getAllNvrs(req, res, next);

      expect(out).toEqual({ data: [{ _id: "nvr_1" }], total: 1 });
      expect(NVRService.getAllNvrs).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("getAllNvrs");
    });

    it("propagates rejections from the service", async () => {
      NVRService.getAllNvrs.mockRejectedValueOnce(new Error("query failed"));
      const { req, res, next } = makeReqRes();
      await expect(
        nvrController.getAllNvrs(req, res, next)
      ).rejects.toThrow("query failed");
    });
  });

  describe("getNVRsWithChannels", () => {
    it("delegates to NVRService.getNVRsWithChannels and returns its result", async () => {
      NVRService.getNVRsWithChannels.mockResolvedValueOnce({
        data: [
          {
            _id: "nvr_1",
            channels: [{ _id: "ch_1" }, { _id: "ch_2" }],
          },
        ],
      });
      const { req, res, next } = makeReqRes();
      req.query = { settingType: "motionDetectionSettings" };

      const out = await nvrController.getNVRsWithChannels(req, res, next);

      expect(out).toEqual({
        data: [
          {
            _id: "nvr_1",
            channels: [{ _id: "ch_1" }, { _id: "ch_2" }],
          },
        ],
      });
      expect(NVRService.getNVRsWithChannels).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("getNVRsWithChannels");
    });

    it("propagates rejections from the service", async () => {
      NVRService.getNVRsWithChannels.mockRejectedValueOnce(
        new Error("aggregation failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        nvrController.getNVRsWithChannels(req, res, next)
      ).rejects.toThrow("aggregation failed");
    });
  });

  describe("getNVRLocations", () => {
    it("delegates to NVRService.getNVRLocations and returns its result", async () => {
      NVRService.getNVRLocations.mockResolvedValueOnce({
        data: [{ locationId: "loc_1", name: "Main Office" }],
      });
      const { req, res, next } = makeReqRes();

      const out = await nvrController.getNVRLocations(req, res, next);

      expect(out).toEqual({
        data: [{ locationId: "loc_1", name: "Main Office" }],
      });
      expect(NVRService.getNVRLocations).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("getNVRLocations");
    });

    it("propagates rejections from the service", async () => {
      NVRService.getNVRLocations.mockRejectedValueOnce(
        new Error("lookup failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        nvrController.getNVRLocations(req, res, next)
      ).rejects.toThrow("lookup failed");
    });
  });

  describe("addNvr", () => {
    it("delegates to NVRService.addNvr and returns its result", async () => {
      NVRService.addNvr.mockResolvedValueOnce({
        status: 201,
        body: { success: true, nvrId: "nvr_2" },
      });
      const { req, res, next } = makeReqRes();
      req.body = {
        name: "Parking NVR",
        ip: "192.168.1.20",
        port: 554,
        brand: "Dahua",
      };

      const out = await nvrController.addNvr(req, res, next);

      expect(out).toEqual({
        status: 201,
        body: { success: true, nvrId: "nvr_2" },
      });
      expect(NVRService.addNvr).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("addNvr");
    });

    it("propagates rejections from the service", async () => {
      NVRService.addNvr.mockRejectedValueOnce(new Error("duplicate ip"));
      const { req, res, next } = makeReqRes();
      await expect(nvrController.addNvr(req, res, next)).rejects.toThrow(
        "duplicate ip"
      );
    });
  });

  describe("deleteAllNvrs", () => {
    it("delegates to NVRService.deleteAllNvrs and returns its result", async () => {
      NVRService.deleteAllNvrs.mockResolvedValueOnce({
        status: 200,
        body: { success: true, deleted: 5 },
      });
      const { req, res, next } = makeReqRes();

      const out = await nvrController.deleteAllNvrs(req, res, next);

      expect(out).toEqual({
        status: 200,
        body: { success: true, deleted: 5 },
      });
      expect(NVRService.deleteAllNvrs).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("deleteAllNvrs");
    });

    it("propagates rejections from the service", async () => {
      NVRService.deleteAllNvrs.mockRejectedValueOnce(
        new Error("cleanup failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        nvrController.deleteAllNvrs(req, res, next)
      ).rejects.toThrow("cleanup failed");
    });
  });
});
