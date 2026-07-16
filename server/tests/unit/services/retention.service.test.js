/**
 * Retention sweeper — cutoff parsing, nested media collection across every
 * swept document shape, and the batched sweep loop (media best-effort, DB
 * delete always proceeds, deadline respected).
 *
 * Mocks: 1 (mediaStorage).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../utils/mediaStorage.js", () => ({
  deleteMedia: vi.fn().mockResolvedValue(undefined),
  toRelativeMediaPath: (v) => v,
}));

const { deleteMedia } = await import("../../../utils/mediaStorage.js");
const { retentionCutoff, collectMediaPaths, sweepDataset } = await import(
  "../../../services/retention.service.js"
);

beforeEach(() => {
  deleteMedia.mockClear();
  deleteMedia.mockResolvedValue(undefined);
});

describe("retentionCutoff", () => {
  const now = new Date("2026-07-16T12:00:00Z");

  it("parses days, months and years", () => {
    expect(retentionCutoff("90d", now)).toEqual(new Date("2026-04-17T12:00:00Z"));
    expect(retentionCutoff("3m", now)).toEqual(new Date("2026-04-16T12:00:00Z"));
    expect(retentionCutoff("1y", now)).toEqual(new Date("2025-07-16T12:00:00Z"));
  });

  it("returns null for unset or invalid specs", () => {
    expect(retentionCutoff(undefined, now)).toBeNull();
    expect(retentionCutoff("", now)).toBeNull();
    expect(retentionCutoff("banana", now)).toBeNull();
    expect(retentionCutoff("0d", now)).toBeNull();
  });
});

describe("collectMediaPaths", () => {
  it("collects incident media including timeSeries images", () => {
    const doc = {
      _id: "x",
      Image: "/uploads/images/a.jpg",
      currentImage: "/uploads/images/c.jpg",
      videoLink: "https://external.example/video.mp4",
      timeSeries: [{ Image: "/uploads/images/t1.jpg" }, { Image: "" }],
    };
    expect(collectMediaPaths(doc).sort()).toEqual([
      "/uploads/images/a.jpg",
      "/uploads/images/c.jpg",
      "/uploads/images/t1.jpg",
      "https://external.example/video.mp4",
    ]);
  });

  it("collects attendance events[].images.{face,person,frame}", () => {
    const doc = {
      events: [
        { images: { face: "/f1.jpg", person: "", frame: "/fr1.jpg" } },
        { images: { face: "/f2.jpg" } },
      ],
    };
    expect(collectMediaPaths(doc).sort()).toEqual(["/f1.jpg", "/f2.jpg", "/fr1.jpg"]);
  });

  it("collects doubly-nested access log usersLogs[].sessions[].images", () => {
    const doc = {
      usersLogs: [
        { sessions: [{ images: { faceImage: "/a.jpg", personImage: "/b.jpg", frameImage: "" } }] },
        { sessions: [{ images: { faceImage: "/c.jpg" } }] },
      ],
    };
    expect(collectMediaPaths(doc).sort()).toEqual(["/a.jpg", "/b.jpg", "/c.jpg"]);
  });

  it("ignores non-media keys and non-plain objects", () => {
    const doc = { description: "/looks/like/a/path.jpg", when: new Date(), images: null };
    expect(collectMediaPaths(doc)).toEqual([]);
  });
});

// find().sort().limit().select().lean() chain returning one batch per call.
const fakeModel = (batches) => {
  let call = 0;
  const model = {
    modelName: "Fake",
    find: vi.fn(() => ({
      sort: () => ({
        limit: () => ({ select: () => ({ lean: async () => batches[call++] || [] }) }),
      }),
    })),
    deleteMany: vi.fn(async (q) => ({ deletedCount: q._id.$in.length })),
  };
  return model;
};

const baseArgs = {
  dateField: "createdAt",
  cutoff: new Date("2026-04-16T00:00:00Z"),
  batchSize: 2,
  label: "test",
};

describe("sweepDataset", () => {
  it("deletes batch after batch until a short batch, media first", async () => {
    const model = fakeModel([
      [{ _id: "1", Image: "/uploads/images/a.jpg" }, { _id: "2", Image: "/uploads/images/b.jpg" }],
      [{ _id: "3" }],
    ]);
    const res = await sweepDataset({ ...baseArgs, model, deadline: Date.now() + 60_000 });

    expect(res).toMatchObject({ deleted: 3, mediaFailures: 0, timedOut: false });
    expect(model.find).toHaveBeenCalledTimes(2);
    expect(deleteMedia.mock.calls.map((c) => c[0]).sort()).toEqual([
      "/uploads/images/a.jpg",
      "/uploads/images/b.jpg",
    ]);
    expect(model.deleteMany).toHaveBeenNthCalledWith(1, { _id: { $in: ["1", "2"] } });
    expect(model.deleteMany).toHaveBeenNthCalledWith(2, { _id: { $in: ["3"] } });
  });

  it("still deletes DB rows when media deletion fails, and counts the failure", async () => {
    deleteMedia.mockRejectedValue(new Error("SFTP down"));
    const model = fakeModel([[{ _id: "1", Image: "/uploads/images/a.jpg" }]]);
    const res = await sweepDataset({ ...baseArgs, model, deadline: Date.now() + 60_000 });

    expect(res).toMatchObject({ deleted: 1, mediaFailures: 1 });
    expect(model.deleteMany).toHaveBeenCalledTimes(1);
  });

  it("does not count an already-deleted file as a failure", async () => {
    deleteMedia.mockRejectedValue(new Error("No such file"));
    const model = fakeModel([[{ _id: "1", Image: "/uploads/images/a.jpg" }]]);
    const res = await sweepDataset({ ...baseArgs, model, deadline: Date.now() + 60_000 });
    expect(res.mediaFailures).toBe(0);
  });

  it("skips external http(s) URLs — they are not ours to delete", async () => {
    const model = fakeModel([[{ _id: "1", videoLink: "https://cdn.example/v.mp4", Image: "/uploads/images/a.jpg" }]]);
    await sweepDataset({ ...baseArgs, model, deadline: Date.now() + 60_000 });
    expect(deleteMedia).toHaveBeenCalledTimes(1);
    expect(deleteMedia).toHaveBeenCalledWith("/uploads/images/a.jpg");
  });

  it("stops immediately when the time budget is already spent", async () => {
    const model = fakeModel([[{ _id: "1" }]]);
    const res = await sweepDataset({ ...baseArgs, model, deadline: Date.now() - 1 });
    expect(res).toMatchObject({ deleted: 0, timedOut: true });
    expect(model.find).not.toHaveBeenCalled();
  });
});
