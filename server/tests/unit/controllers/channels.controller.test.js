/**
 * Unit coverage for core/v1/channels/channels.controller.js.
 *
 * ChannelController is a thin pass-through to ChannelService — every handler
 * is a one-liner `return ChannelService.<method>(req, res, next)`. We mock
 * the service module so only the controller's own delegation logic runs;
 * the service itself (which fans out to the Channels model, NVR lookups,
 * the streaming/playback HTTP layer, and the detection scheduler) is
 * integration-tested elsewhere.
 *
 * For each controller method we confirm:
 *   - it forwards the exact (req, res, next) it received,
 *   - it returns whatever the service returned,
 *   - it propagates rejections from the service,
 *   - it does not accidentally invoke sibling service methods.
 *
 * Style mirrors nvr.controller.test.js (R45 reference) and
 * jobs.controller.test.js (R39 reference).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../core/v1/channels/channels.service.js", () => ({
  default: {
    updateChannel: vi.fn(),
    getAllChannels: vi.fn(),
    getNvrCameraDetections: vi.fn(),
    getChannelsByNvr: vi.fn(),
    deleteChannel: vi.fn(),
    bulkUpdateChannels: vi.fn(),
    updateChannelConfiguration: vi.fn(),
    getPlaybackUrl: vi.fn(),
    getPlaybackTimeline: vi.fn(),
    getPlaybackWithFilters: vi.fn(),
    getFilterAllChannels: vi.fn(),
    getChannelById: vi.fn(),
    toggleDetection: vi.fn(),
  },
}));

import ChannelService from "../../../core/v1/channels/channels.service.js";
const { default: channelController } = await import(
  "../../../core/v1/channels/channels.controller.js"
);
import { makeReqRes } from "../../helpers/factory.js";

const ALL_METHODS = [
  "updateChannel",
  "getAllChannels",
  "getNvrCameraDetections",
  "getChannelsByNvr",
  "deleteChannel",
  "bulkUpdateChannels",
  "updateChannelConfiguration",
  "getPlaybackUrl",
  "getPlaybackTimeline",
  "getPlaybackWithFilters",
  "getFilterAllChannels",
  "getChannelById",
  "toggleDetection",
];

function expectOnlyCalled(method) {
  for (const m of ALL_METHODS) {
    if (m === method) {
      expect(ChannelService[m]).toHaveBeenCalledTimes(1);
    } else {
      expect(ChannelService[m]).not.toHaveBeenCalled();
    }
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ChannelController", () => {
  describe("updateChannel", () => {
    it("delegates to ChannelService.updateChannel and returns its result", async () => {
      ChannelService.updateChannel.mockResolvedValueOnce({
        status: 200,
        body: { success: true, message: "Channel updated" },
      });
      const { req, res, next } = makeReqRes();
      req.params = { id: "ch_1" };
      req.body = { name: "Lobby Cam", location: "loc_1" };

      const out = await channelController.updateChannel(req, res, next);

      expect(out).toEqual({
        status: 200,
        body: { success: true, message: "Channel updated" },
      });
      expect(ChannelService.updateChannel).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("updateChannel");
    });

    it("propagates rejections from the service", async () => {
      ChannelService.updateChannel.mockRejectedValueOnce(
        new Error("channel not found")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        channelController.updateChannel(req, res, next)
      ).rejects.toThrow("channel not found");
    });
  });

  describe("getAllChannels", () => {
    it("delegates to ChannelService.getAllChannels and returns its result", async () => {
      ChannelService.getAllChannels.mockResolvedValueOnce({
        data: [{ _id: "ch_1" }, { _id: "ch_2" }],
        total: 2,
      });
      const { req, res, next } = makeReqRes();
      req.query = { skip: "0", limit: "10", search: "lobby" };

      const out = await channelController.getAllChannels(req, res, next);

      expect(out).toEqual({
        data: [{ _id: "ch_1" }, { _id: "ch_2" }],
        total: 2,
      });
      expect(ChannelService.getAllChannels).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("getAllChannels");
    });

    it("propagates rejections from the service", async () => {
      ChannelService.getAllChannels.mockRejectedValueOnce(
        new Error("query failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        channelController.getAllChannels(req, res, next)
      ).rejects.toThrow("query failed");
    });
  });

  describe("getNvrCameraDetections", () => {
    it("delegates to ChannelService.getNvrCameraDetections and returns its result", async () => {
      ChannelService.getNvrCameraDetections.mockResolvedValueOnce({
        data: [{ nvrId: "n1", cameras: [{ cameraName: "Lobby" }] }],
      });
      const { req, res, next } = makeReqRes();

      const out = await channelController.getNvrCameraDetections(
        req,
        res,
        next
      );

      expect(out).toEqual({
        data: [{ nvrId: "n1", cameras: [{ cameraName: "Lobby" }] }],
      });
      expect(ChannelService.getNvrCameraDetections).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("getNvrCameraDetections");
    });

    it("propagates rejections from the service", async () => {
      ChannelService.getNvrCameraDetections.mockRejectedValueOnce(
        new Error("grouping failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        channelController.getNvrCameraDetections(req, res, next)
      ).rejects.toThrow("grouping failed");
    });
  });

  describe("getAllChannelsByNvrId", () => {
    it("delegates to ChannelService.getChannelsByNvr and returns its result", async () => {
      ChannelService.getChannelsByNvr.mockResolvedValueOnce({
        data: [{ _id: "ch_1", nvrId: "nvr_1" }],
      });
      const { req, res, next } = makeReqRes();
      req.params = { nvrId: "nvr_1" };

      const out = await channelController.getAllChannelsByNvrId(
        req,
        res,
        next
      );

      expect(out).toEqual({ data: [{ _id: "ch_1", nvrId: "nvr_1" }] });
      expect(ChannelService.getChannelsByNvr).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("getChannelsByNvr");
    });

    it("propagates rejections from the service", async () => {
      ChannelService.getChannelsByNvr.mockRejectedValueOnce(
        new Error("invalid nvr id")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        channelController.getAllChannelsByNvrId(req, res, next)
      ).rejects.toThrow("invalid nvr id");
    });
  });

  describe("deleteChannel", () => {
    it("delegates to ChannelService.deleteChannel and returns its result", async () => {
      ChannelService.deleteChannel.mockResolvedValueOnce({
        status: 200,
        body: { success: true, message: "Channel deleted" },
      });
      const { req, res, next } = makeReqRes();
      req.params = { id: "ch_1" };

      const out = await channelController.deleteChannel(req, res, next);

      expect(out).toEqual({
        status: 200,
        body: { success: true, message: "Channel deleted" },
      });
      expect(ChannelService.deleteChannel).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("deleteChannel");
    });

    it("propagates rejections from the service", async () => {
      ChannelService.deleteChannel.mockRejectedValueOnce(
        new Error("channel not found")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        channelController.deleteChannel(req, res, next)
      ).rejects.toThrow("channel not found");
    });
  });

  describe("bulkUpdateChannels", () => {
    it("delegates to ChannelService.bulkUpdateChannels and returns its result", async () => {
      ChannelService.bulkUpdateChannels.mockResolvedValueOnce({
        status: 200,
        body: { success: true, updated: 3 },
      });
      const { req, res, next } = makeReqRes();
      req.body = {
        channels: [
          { id: "ch_1", name: "Cam A" },
          { id: "ch_2", name: "Cam B" },
        ],
      };

      const out = await channelController.bulkUpdateChannels(req, res, next);

      expect(out).toEqual({
        status: 200,
        body: { success: true, updated: 3 },
      });
      expect(ChannelService.bulkUpdateChannels).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("bulkUpdateChannels");
    });

    it("propagates rejections from the service", async () => {
      ChannelService.bulkUpdateChannels.mockRejectedValueOnce(
        new Error("bulk write failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        channelController.bulkUpdateChannels(req, res, next)
      ).rejects.toThrow("bulk write failed");
    });
  });

  describe("updateChannelConfiguration", () => {
    it("delegates to ChannelService.updateChannelConfiguration and returns its result", async () => {
      ChannelService.updateChannelConfiguration.mockResolvedValueOnce({
        status: 200,
        body: { success: true, message: "Configuration updated" },
      });
      const { req, res, next } = makeReqRes();
      req.query = { id: "ch_1", detectionKey: "motionDetectionSettings" };
      req.body = { enabled: true, threshold: 0.7 };

      const out = await channelController.updateChannelConfiguration(
        req,
        res,
        next
      );

      expect(out).toEqual({
        status: 200,
        body: { success: true, message: "Configuration updated" },
      });
      expect(
        ChannelService.updateChannelConfiguration
      ).toHaveBeenCalledWith(req, res, next);
      expectOnlyCalled("updateChannelConfiguration");
    });

    it("propagates rejections from the service", async () => {
      ChannelService.updateChannelConfiguration.mockRejectedValueOnce(
        new Error("invalid detection key")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        channelController.updateChannelConfiguration(req, res, next)
      ).rejects.toThrow("invalid detection key");
    });
  });

  describe("getPlaybackUrl", () => {
    it("delegates to ChannelService.getPlaybackUrl and returns its result", async () => {
      ChannelService.getPlaybackUrl.mockResolvedValueOnce({
        status: 200,
        body: { url: "rtsp://example.com/playback/ch_1" },
      });
      const { req, res, next } = makeReqRes();
      req.body = {
        channelId: "ch_1",
        startTime: "2026-01-01T00:00:00Z",
        endTime: "2026-01-01T01:00:00Z",
      };

      const out = await channelController.getPlaybackUrl(req, res, next);

      expect(out).toEqual({
        status: 200,
        body: { url: "rtsp://example.com/playback/ch_1" },
      });
      expect(ChannelService.getPlaybackUrl).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("getPlaybackUrl");
    });

    it("propagates rejections from the service", async () => {
      ChannelService.getPlaybackUrl.mockRejectedValueOnce(
        new Error("playback service unreachable")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        channelController.getPlaybackUrl(req, res, next)
      ).rejects.toThrow("playback service unreachable");
    });
  });

  describe("getPlaybackTimeline", () => {
    it("delegates to ChannelService.getPlaybackTimeline and returns its result", async () => {
      ChannelService.getPlaybackTimeline.mockResolvedValueOnce({
        status: 200,
        body: { segments: [{ start: 0, end: 600 }] },
      });
      const { req, res, next } = makeReqRes();
      req.body = {
        channelId: "ch_1",
        startTime: "2026-01-01T00:00:00Z",
        endTime: "2026-01-01T01:00:00Z",
      };

      const out = await channelController.getPlaybackTimeline(req, res, next);

      expect(out).toEqual({
        status: 200,
        body: { segments: [{ start: 0, end: 600 }] },
      });
      expect(ChannelService.getPlaybackTimeline).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("getPlaybackTimeline");
    });

    it("propagates rejections from the service", async () => {
      ChannelService.getPlaybackTimeline.mockRejectedValueOnce(
        new Error("timeline lookup failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        channelController.getPlaybackTimeline(req, res, next)
      ).rejects.toThrow("timeline lookup failed");
    });
  });

  describe("getPlaybackWithFilters", () => {
    it("delegates to ChannelService.getPlaybackWithFilters and returns its result", async () => {
      ChannelService.getPlaybackWithFilters.mockResolvedValueOnce({
        data: [{ _id: "loc_1", name: "Main Office" }],
      });
      const { req, res, next } = makeReqRes();
      req.query = { filter: "locations" };

      const out = await channelController.getPlaybackWithFilters(
        req,
        res,
        next
      );

      expect(out).toEqual({
        data: [{ _id: "loc_1", name: "Main Office" }],
      });
      expect(ChannelService.getPlaybackWithFilters).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("getPlaybackWithFilters");
    });

    it("propagates rejections from the service", async () => {
      ChannelService.getPlaybackWithFilters.mockRejectedValueOnce(
        new Error("invalid filter")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        channelController.getPlaybackWithFilters(req, res, next)
      ).rejects.toThrow("invalid filter");
    });
  });

  describe("getFilterAllChannels", () => {
    it("delegates to ChannelService.getFilterAllChannels and returns its result", async () => {
      ChannelService.getFilterAllChannels.mockResolvedValueOnce({
        data: [{ _id: "ch_1" }, { _id: "ch_2" }],
      });
      const { req, res, next } = makeReqRes();
      req.query = { location: "loc_1", department: "dept_1" };

      const out = await channelController.getFilterAllChannels(req, res, next);

      expect(out).toEqual({ data: [{ _id: "ch_1" }, { _id: "ch_2" }] });
      expect(ChannelService.getFilterAllChannels).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("getFilterAllChannels");
    });

    it("propagates rejections from the service", async () => {
      ChannelService.getFilterAllChannels.mockRejectedValueOnce(
        new Error("aggregation failed")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        channelController.getFilterAllChannels(req, res, next)
      ).rejects.toThrow("aggregation failed");
    });
  });

  describe("getChannelById", () => {
    it("delegates to ChannelService.getChannelById and returns its result", async () => {
      ChannelService.getChannelById.mockResolvedValueOnce({
        data: { _id: "ch_1", name: "Lobby Cam", nvrId: "nvr_1" },
      });
      const { req, res, next } = makeReqRes();
      req.params = { id: "ch_1" };

      const out = await channelController.getChannelById(req, res, next);

      expect(out).toEqual({
        data: { _id: "ch_1", name: "Lobby Cam", nvrId: "nvr_1" },
      });
      expect(ChannelService.getChannelById).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("getChannelById");
    });

    it("propagates rejections from the service", async () => {
      ChannelService.getChannelById.mockRejectedValueOnce(
        new Error("channel not found")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        channelController.getChannelById(req, res, next)
      ).rejects.toThrow("channel not found");
    });
  });

  describe("toggleDetection", () => {
    it("delegates to ChannelService.toggleDetection and returns its result", async () => {
      ChannelService.toggleDetection.mockResolvedValueOnce({
        status: 200,
        body: { success: true, detectionEnabled: true },
      });
      const { req, res, next } = makeReqRes();
      req.body = { channelId: "ch_1", detection: true };

      const out = await channelController.toggleDetection(req, res, next);

      expect(out).toEqual({
        status: 200,
        body: { success: true, detectionEnabled: true },
      });
      expect(ChannelService.toggleDetection).toHaveBeenCalledWith(
        req,
        res,
        next
      );
      expectOnlyCalled("toggleDetection");
    });

    it("propagates rejections from the service", async () => {
      ChannelService.toggleDetection.mockRejectedValueOnce(
        new Error("scheduler error")
      );
      const { req, res, next } = makeReqRes();
      await expect(
        channelController.toggleDetection(req, res, next)
      ).rejects.toThrow("scheduler error");
    });
  });
});
