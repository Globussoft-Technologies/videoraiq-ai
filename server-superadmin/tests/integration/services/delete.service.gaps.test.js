/**
 * services/delete.service.js — leftover branch coverage from R96 baseline.
 *
 * The existing delete.service.test.js (R55 baseline) exercises the local
 * APP_ENV path and all happy/error cascade branches except:
 *   1. lines 26-30 — the cloud-mode arm of `deleteNVR`'s per-channel loop.
 *      Reached by setting APP_ENV=cloud at config-load time so that the
 *      module's top-level `const APP_ENV = config.get("APP_ENV")` resolves
 *      to "cloud". This arm calls `deleteStreamingCamera(uid)` (which DELETEs
 *      the streaming API) and then `redis.del(redisKey)` for each channel.
 *   2. lines 143-147 — the outer catch in `deleteDataFromUserAccounts`.
 *      Reached by making `Channel.find(...).select("_id")` reject. The
 *      service wraps the error as
 *      "Failed to delete user account data associated with NVR." and rethrows.
 *      Driven through `deleteNVR` so the wrapper unwraps as the outer
 *      "Failed to delete NVR..." message (deleteNVR's catch swallows the
 *      original cause).
 *
 * Mock budget: 8 — axios, NVR, Channel, DetectionSetting, Incident,
 * authorizedChannels, users, database. Under the ≤8 ceiling.
 *
 * R97 — server phase (test-only).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Force the module-load-time APP_ENV read to resolve to "cloud" before the
// service file is imported. The `config` package re-reads NODE_CONFIG on
// each `config.get` call only on first-touch, so we patch the JSON here.
const baseConfig = JSON.parse(process.env.NODE_CONFIG || "{}");
process.env.NODE_CONFIG = JSON.stringify({ ...baseConfig, APP_ENV: "cloud" });

vi.mock("axios", () => ({
  default: { delete: vi.fn() },
}));

vi.mock("../../../core/v1/NVR/nvr.model.js", () => ({
  default: {
    deleteOne: vi.fn(),
    distinct: vi.fn(),
    find: vi.fn(),
  },
}));

vi.mock("../../../core/v1/channels/channels.model.js", () => ({
  default: {
    find: vi.fn(),
    findById: vi.fn(),
    deleteOne: vi.fn(),
  },
}));

vi.mock("../../../core/v1/detectionSettings/detectionSettings.model.js", () => ({
  DetectionSetting: { deleteMany: vi.fn() },
}));

vi.mock("../../../core/v1/incidents/incidents.model.js", () => ({
  Incident: { deleteMany: vi.fn() },
}));

vi.mock("../../../core/v1/cameraRestrictions/authorizedChannels.model.js", () => ({
  default: {
    find: vi.fn(),
    updateMany: vi.fn(),
  },
}));

vi.mock("../../../core/v1/users/users.model.js", () => ({
  default: {},
}));

vi.mock("../../../utils/database.js", () => ({
  redis: { del: vi.fn() },
}));

const axios = (await import("axios")).default;
const { default: NVR } = await import("../../../core/v1/NVR/nvr.model.js");
const { default: Channel } = await import(
  "../../../core/v1/channels/channels.model.js"
);
const { Incident } = await import(
  "../../../core/v1/incidents/incidents.model.js"
);
const { default: authorizedChannelsModel } = await import(
  "../../../core/v1/cameraRestrictions/authorizedChannels.model.js"
);
const { redis } = await import("../../../utils/database.js");
const { default: DeleteService } = await import(
  "../../../services/delete.service.js"
);

/** chainable: Channel.find(...).select("_id") → docs */
const queryWithSelect = (docs) => ({ select: vi.fn().mockResolvedValue(docs) });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DeleteService.deleteNVR — APP_ENV=cloud arm (lines 26-30)", () => {
  it("calls deleteStreamingCamera + redis.del for each channel when APP_ENV is cloud", async () => {
    // Two channels under the NVR.
    Channel.find.mockResolvedValueOnce([
      { _id: "ch-A", nvrId: "nvr-cloud" },
      { _id: "ch-B", nvrId: "nvr-cloud" },
    ]);
    // Cascade re-fetches via findById.
    Channel.findById
      .mockResolvedValueOnce({ _id: "ch-A" })
      .mockResolvedValueOnce({ _id: "ch-B" });
    Incident.deleteMany.mockResolvedValue({ deletedCount: 0 });
    Channel.deleteOne.mockResolvedValue({ deletedCount: 1 });
    NVR.deleteOne.mockResolvedValueOnce({ deletedCount: 1 });

    // Cloud branch: deleteStreamingCamera does an axios.delete (mocked).
    axios.delete.mockResolvedValue({ status: 204 });
    redis.del.mockResolvedValue(1);

    // deleteDataFromUserAccounts — no-op path.
    Channel.find.mockReturnValueOnce(queryWithSelect([]));
    NVR.distinct.mockResolvedValueOnce([]);
    authorizedChannelsModel.find.mockResolvedValueOnce([]);

    const out = await DeleteService.deleteNVR("nvr-cloud");
    expect(out).toBe(true);

    // Per-channel: one axios.delete + one redis.del.
    expect(axios.delete).toHaveBeenCalledTimes(2);
    expect(redis.del).toHaveBeenCalledTimes(2);

    // Stream uid is `${nvrId}-${channelId}` (both stringified).
    const streamUrls = axios.delete.mock.calls.map((c) => c[0]);
    expect(streamUrls).toEqual([
      "http://rtsp.test/api/camera/nvr-cloud-ch-A",
      "http://rtsp.test/api/camera/nvr-cloud-ch-B",
    ]);
    const redisKeys = redis.del.mock.calls.map((c) => c[0]);
    expect(redisKeys).toEqual([
      "stream_url:nvr-cloud-ch-A",
      "stream_url:nvr-cloud-ch-B",
    ]);

    // The NVR itself is still deleted after the per-channel cloud cleanup.
    expect(NVR.deleteOne).toHaveBeenCalledWith({ _id: "nvr-cloud" });
  });

  it("wraps a deleteStreamingCamera failure as the outer 'Failed to delete NVR' message", async () => {
    Channel.find.mockResolvedValueOnce([{ _id: "ch-X", nvrId: "nvr-X" }]);
    Channel.findById.mockResolvedValueOnce({ _id: "ch-X" });
    // Streaming API down -> deleteStreamingCamera throws its inner wrapped error,
    // which then bubbles up to deleteNVR's outer catch and gets re-wrapped.
    axios.delete.mockRejectedValueOnce(new Error("502 bad gateway"));

    await expect(DeleteService.deleteNVR("nvr-X")).rejects.toThrow(
      "Failed to delete NVR and its associated resources.",
    );
    // redis.del should NOT have run — the streaming-camera failure short-circuits.
    expect(redis.del).not.toHaveBeenCalled();
    // The NVR was never deleted because the loop bailed.
    expect(NVR.deleteOne).not.toHaveBeenCalled();
  });
});

describe("DeleteService.deleteDataFromUserAccounts — outer catch (lines 143-147)", () => {
  it("wraps a Channel.find().select() failure as 'Failed to delete NVR...' via deleteNVR", async () => {
    // Reach deleteDataFromUserAccounts cleanly: zero channels in the outer
    // cascade, NVR.deleteOne succeeds, then the *second* Channel.find call
    // (the one inside deleteDataFromUserAccounts with `.select("_id")`)
    // rejects.
    Channel.find.mockResolvedValueOnce([]); // outer loop — no channels
    NVR.deleteOne.mockResolvedValueOnce({ deletedCount: 1 });
    // Second Channel.find — the chainable .select("_id") query throws.
    Channel.find.mockReturnValueOnce({
      select: vi.fn().mockRejectedValue(new Error("db read failed")),
    });

    // deleteDataFromUserAccounts throws its own wrapped error, which is
    // then caught by deleteNVR and re-wrapped with the outer message.
    await expect(DeleteService.deleteNVR("nvr-cleanup-fail")).rejects.toThrow(
      "Failed to delete NVR and its associated resources.",
    );

    // None of the downstream cleanup ran (authorizedChannelsModel.find was
    // never reached) because the failure occurred before that point.
    expect(authorizedChannelsModel.find).not.toHaveBeenCalled();
    expect(authorizedChannelsModel.updateMany).not.toHaveBeenCalled();
  });
});
