/**
 * Unit coverage for core/v1/cameraRestrictions/authorizedChannels.controller.js.
 *
 * The controller is a thin pass-through to authorizedChannelsService — every
 * handler is a one-liner `return authorizedChannelsService.<method>(req, res,
 * next)`. We mock the service module so only the controller's own delegation
 * logic runs; the service itself is integration-tested elsewhere.
 *
 * For each controller method we confirm:
 *   - it forwards the exact (req, res, next) it received,
 *   - it returns whatever the service returned,
 *   - it propagates rejections from the service,
 *   - it does not accidentally call sibling service methods.
 *
 * Style mirrors vehicle.controller.test.js (R37 reference) and
 * recipients.controller.test.js (R38 reference).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock(
  "../../../core/v1/cameraRestrictions/authorizedChannels.service.js",
  () => ({
    default: {
      fetchChannels: vi.fn(),
      fetchLocations: vi.fn(),
      fetchDepartments: vi.fn(),
      fetchNVRS: vi.fn(),
      fetchChannelByNVRsOrDepartment: vi.fn(),
    },
  })
);

import authorizedChannelsService from "../../../core/v1/cameraRestrictions/authorizedChannels.service.js";
const { default: authorizedChannelsController } = await import(
  "../../../core/v1/cameraRestrictions/authorizedChannels.controller.js"
);
import { makeReqRes } from "../../helpers/factory.js";

const ALL_METHODS = [
  "fetchChannels",
  "fetchLocations",
  "fetchDepartments",
  "fetchNVRS",
  "fetchChannelByNVRsOrDepartment",
];

function expectOnlyCalled(method) {
  for (const m of ALL_METHODS) {
    if (m === method) {
      expect(authorizedChannelsService[m]).toHaveBeenCalledTimes(1);
    } else {
      expect(authorizedChannelsService[m]).not.toHaveBeenCalled();
    }
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AuthorizedChannelsController", () => {
  describe("fetchChannels", () => {
    it("delegates to authorizedChannelsService.fetchChannels and returns its result", async () => {
      authorizedChannelsService.fetchChannels.mockResolvedValueOnce({
        data: [{ _id: "ch_1", channelName: "Lobby Cam" }],
        total: 1,
      });
      const { req, res, next } = makeReqRes();
      req.body = { departmentId: "dept_1" };

      const out = await authorizedChannelsController.fetchChannels(
        req,
        res,
        next
      );

      expect(out).toEqual({
        data: [{ _id: "ch_1", channelName: "Lobby Cam" }],
        total: 1,
      });
      expect(authorizedChannelsService.fetchChannels).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("fetchChannels");
    });

    it("propagates rejections from the service", async () => {
      authorizedChannelsService.fetchChannels.mockRejectedValueOnce(
        new Error("db unreachable")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        authorizedChannelsController.fetchChannels(req, res, next)
      ).rejects.toThrow("db unreachable");
    });
  });

  describe("fetchLocations", () => {
    it("delegates to authorizedChannelsService.fetchLocations and returns its result", async () => {
      authorizedChannelsService.fetchLocations.mockResolvedValueOnce({
        data: [{ _id: "loc_1", name: "HQ" }],
        total: 1,
      });
      const { req, res, next } = makeReqRes();
      req.body = { search: "HQ" };

      const out = await authorizedChannelsController.fetchLocations(
        req,
        res,
        next
      );

      expect(out).toEqual({
        data: [{ _id: "loc_1", name: "HQ" }],
        total: 1,
      });
      expect(authorizedChannelsService.fetchLocations).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("fetchLocations");
    });

    it("propagates rejections from the service", async () => {
      authorizedChannelsService.fetchLocations.mockRejectedValueOnce(
        new Error("validation failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        authorizedChannelsController.fetchLocations(req, res, next)
      ).rejects.toThrow("validation failed");
    });
  });

  describe("fetchDepartments", () => {
    it("delegates to authorizedChannelsService.fetchDepartments and returns its result", async () => {
      authorizedChannelsService.fetchDepartments.mockResolvedValueOnce({
        data: [{ _id: "dept_1", name: "Security" }],
        total: 1,
      });
      const { req, res, next } = makeReqRes();
      req.body = {};

      const out = await authorizedChannelsController.fetchDepartments(
        req,
        res,
        next
      );

      expect(out).toEqual({
        data: [{ _id: "dept_1", name: "Security" }],
        total: 1,
      });
      expect(authorizedChannelsService.fetchDepartments).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("fetchDepartments");
    });

    it("propagates rejections from the service", async () => {
      authorizedChannelsService.fetchDepartments.mockRejectedValueOnce(
        new Error("forbidden")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        authorizedChannelsController.fetchDepartments(req, res, next)
      ).rejects.toThrow("forbidden");
    });
  });

  describe("fetchNVRS", () => {
    it("delegates to authorizedChannelsService.fetchNVRS and returns its result", async () => {
      authorizedChannelsService.fetchNVRS.mockResolvedValueOnce({
        data: [{ _id: "nvr_1", name: "NVR-Building-A" }],
        total: 1,
      });
      const { req, res, next } = makeReqRes();
      req.body = { locationId: "loc_1" };

      const out = await authorizedChannelsController.fetchNVRS(req, res, next);

      expect(out).toEqual({
        data: [{ _id: "nvr_1", name: "NVR-Building-A" }],
        total: 1,
      });
      expect(authorizedChannelsService.fetchNVRS).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("fetchNVRS");
    });

    it("propagates rejections from the service", async () => {
      authorizedChannelsService.fetchNVRS.mockRejectedValueOnce(
        new Error("not found")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        authorizedChannelsController.fetchNVRS(req, res, next)
      ).rejects.toThrow("not found");
    });
  });

  describe("fetchChannelByNVRsOrDepartment", () => {
    it("delegates to authorizedChannelsService.fetchChannelByNVRsOrDepartment and returns its result", async () => {
      authorizedChannelsService.fetchChannelByNVRsOrDepartment.mockResolvedValueOnce(
        {
          data: [{ _id: "ch_2", channelName: "Gate Cam" }],
          total: 1,
        }
      );
      const { req, res, next } = makeReqRes();
      req.query = { searchQuery: "Gate" };
      req.body = { nvrIds: ["nvr_1"], departmentIds: ["dept_1"] };

      const out = await authorizedChannelsController.fetchChannelByNVRsOrDepartment(
        req,
        res,
        next
      );

      expect(out).toEqual({
        data: [{ _id: "ch_2", channelName: "Gate Cam" }],
        total: 1,
      });
      expect(
        authorizedChannelsService.fetchChannelByNVRsOrDepartment
      ).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("fetchChannelByNVRsOrDepartment");
    });

    it("propagates rejections from the service", async () => {
      authorizedChannelsService.fetchChannelByNVRsOrDepartment.mockRejectedValueOnce(
        new Error("query timeout")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        authorizedChannelsController.fetchChannelByNVRsOrDepartment(
          req,
          res,
          next
        )
      ).rejects.toThrow("query timeout");
    });
  });
});
