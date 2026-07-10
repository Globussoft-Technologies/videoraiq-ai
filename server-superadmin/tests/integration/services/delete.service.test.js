/**
 * services/delete.service.js — previously at 0% coverage. This service
 * orchestrates cascading deletion of an NVR (and its channels, incidents, and
 * references on authorizedChannels documents). It also calls an external
 * RTSP streaming API to remove the streaming camera entry, and (in cloud
 * mode) prunes the per-camera stream_url:* keys from Redis.
 *
 * Strategy: mock every collaborator at the module level so we exercise
 * branch/control-flow logic without touching Mongo, Redis, or any HTTP
 * service. Each test asserts the call sequence and the cascade behaviour;
 * error paths assert the wrapped Error messages emitted by the service.
 *
 * Mocks: 7 (axios, NVR, Channel, Incident, redis, authorizedChannels,
 * usersModel — the last is imported by the source but never invoked on the
 * paths we exercise, so it's mocked to a no-op to satisfy the import).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

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

vi.mock("../../../utils/logger.js", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

/** Build a chainable query stub: `Channel.find(...).select(...)` resolves to `docs`. */
const queryWithSelect = (docs) => ({ select: vi.fn().mockResolvedValue(docs) });

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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DeleteService.deleteChannel", () => {
  it("deletes incidents and the channel itself when the channel exists", async () => {
    Channel.findById.mockResolvedValueOnce({ _id: "ch-1", nvrId: "nvr-1" });
    Incident.deleteMany.mockResolvedValueOnce({ deletedCount: 3 });
    Channel.deleteOne.mockResolvedValueOnce({ deletedCount: 1 });

    const out = await DeleteService.deleteChannel("ch-1");
    expect(out).toBe(true);

    expect(Channel.findById).toHaveBeenCalledWith("ch-1");
    expect(Incident.deleteMany).toHaveBeenCalledWith({ channelId: "ch-1" });
    expect(Channel.deleteOne).toHaveBeenCalledWith({ _id: "ch-1" });
  });

  it("wraps a missing channel in 'Failed to delete channel...' error", async () => {
    Channel.findById.mockResolvedValueOnce(null);
    await expect(DeleteService.deleteChannel("missing")).rejects.toThrow(
      "Failed to delete channel and its associated resources.",
    );
    // The cascade must not have run.
    expect(Incident.deleteMany).not.toHaveBeenCalled();
    expect(Channel.deleteOne).not.toHaveBeenCalled();
  });

  it("wraps a Mongo error in the same 'Failed to delete channel...' message", async () => {
    Channel.findById.mockRejectedValueOnce(new Error("mongo down"));
    await expect(DeleteService.deleteChannel("ch-x")).rejects.toThrow(
      "Failed to delete channel and its associated resources.",
    );
  });
});

describe("DeleteService.deleteStreamingCamera", () => {
  it("DELETEs the streaming API with a bearer token and returns true", async () => {
    axios.delete.mockResolvedValueOnce({ status: 204 });
    const out = await DeleteService.deleteStreamingCamera("nvr-1-ch-1");
    expect(out).toBe(true);

    expect(axios.delete).toHaveBeenCalledTimes(1);
    const [url, opts] = axios.delete.mock.calls[0];
    expect(url).toBe("http://rtsp.test/api/camera/nvr-1-ch-1");
    expect(opts.headers.Authorization).toBe("Bearer test-rtsp-token");
  });

  it("wraps an axios failure in 'Failed to delete streaming camera...'", async () => {
    axios.delete.mockRejectedValueOnce(new Error("502 bad gateway"));
    await expect(
      DeleteService.deleteStreamingCamera("nvr-x-ch-x"),
    ).rejects.toThrow(
      "Failed to delete streaming camera and its associated resources.",
    );
  });
});

describe("DeleteService.deleteNVR", () => {
  it("cascades through channels, removes the NVR, and prunes authorized user data", async () => {
    // Two channels under the NVR.
    Channel.find.mockResolvedValueOnce([
      { _id: "ch-1", nvrId: "nvr-1" },
      { _id: "ch-2", nvrId: "nvr-1" },
    ]);
    // deleteChannel re-fetches each channel via findById, then cascades.
    Channel.findById
      .mockResolvedValueOnce({ _id: "ch-1", nvrId: "nvr-1" })
      .mockResolvedValueOnce({ _id: "ch-2", nvrId: "nvr-1" });
    Incident.deleteMany.mockResolvedValue({ deletedCount: 0 });
    Channel.deleteOne.mockResolvedValue({ deletedCount: 1 });
    NVR.deleteOne.mockResolvedValueOnce({ deletedCount: 1 });

    // deleteDataFromUserAccounts: second Channel.find call is chained with
    // `.select("_id")`, so the mock must return a thenable query stub.
    Channel.find.mockReturnValueOnce(
      queryWithSelect([{ _id: "ch-1" }, { _id: "ch-2" }]),
    );
    NVR.distinct.mockResolvedValueOnce(["loc-1"]);
    authorizedChannelsModel.find.mockResolvedValueOnce([
      { _id: "ac-1", nvrIds: ["nvr-1"] },
    ]);
    authorizedChannelsModel.updateMany.mockResolvedValue({ modifiedCount: 1 });

    const out = await DeleteService.deleteNVR("nvr-1");
    expect(out).toBe(true);

    // The two channels were cascade-deleted before the NVR itself.
    expect(Channel.deleteOne).toHaveBeenCalledTimes(2);
    expect(NVR.deleteOne).toHaveBeenCalledWith({ _id: "nvr-1" });

    // In APP_ENV=local (see tests/setup.js) the cloud-only branch must NOT
    // fire: no streaming-camera DELETE and no redis.del.
    expect(axios.delete).not.toHaveBeenCalled();
    expect(redis.del).not.toHaveBeenCalled();

    // deleteDataFromUserAccounts ran all three updateMany branches (pull
    // nvrIds, pull channels, pull locations).
    expect(authorizedChannelsModel.updateMany).toHaveBeenCalledTimes(3);
    const callArgs = authorizedChannelsModel.updateMany.mock.calls.map(
      (c) => c[1],
    );
    // First call $pull's the nvrId; subsequent calls $pull channels / locations.
    expect(JSON.stringify(callArgs)).toContain("nvrIds");
    expect(JSON.stringify(callArgs)).toContain("channels");
    expect(JSON.stringify(callArgs)).toContain("locations");
  });

  it("short-circuits the user-cleanup when no authorizedChannels reference the NVR", async () => {
    // Zero channels — outer for-loop is skipped.
    Channel.find.mockResolvedValueOnce([]);
    NVR.deleteOne.mockResolvedValueOnce({ deletedCount: 1 });

    // deleteDataFromUserAccounts call sequence:
    Channel.find.mockReturnValueOnce(queryWithSelect([])); // no channels
    NVR.distinct.mockResolvedValueOnce([]); // no locations
    authorizedChannelsModel.find.mockResolvedValueOnce([]); // no authorized refs

    const out = await DeleteService.deleteNVR("nvr-empty");
    expect(out).toBe(true);

    // Early-return branch — no updateMany calls.
    expect(authorizedChannelsModel.updateMany).not.toHaveBeenCalled();
  });

  it("wraps any failure in 'Failed to delete NVR...'", async () => {
    Channel.find.mockRejectedValueOnce(new Error("db down"));
    await expect(DeleteService.deleteNVR("nvr-broken")).rejects.toThrow(
      "Failed to delete NVR and its associated resources.",
    );
    // NVR deletion must not have happened.
    expect(NVR.deleteOne).not.toHaveBeenCalled();
  });

  it("unwraps an object-form nvrId via the `?._id` ternary on entry", async () => {
    // When the caller passes `{ _id: "nvr-2" }` the service should still
    // resolve `nvrId = "nvr-2"` and use it for all downstream Mongo calls.
    Channel.find.mockResolvedValueOnce([]);
    NVR.deleteOne.mockResolvedValueOnce({ deletedCount: 1 });
    Channel.find.mockReturnValueOnce(queryWithSelect([]));
    NVR.distinct.mockResolvedValueOnce([]);
    authorizedChannelsModel.find.mockResolvedValueOnce([]);

    await DeleteService.deleteNVR({ _id: "nvr-2" });

    expect(NVR.deleteOne).toHaveBeenCalledWith({ _id: "nvr-2" });
    // The initial Channel.find() that drives the channel-cascade loop must
    // use the unwrapped id (not the wrapping object) as the filter value.
    expect(Channel.find.mock.calls[0][0]).toEqual({ nvrId: "nvr-2" });
  });
});
