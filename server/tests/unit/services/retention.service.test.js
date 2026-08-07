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

// Stubs for the per-admin sweep: global config, the admin lookup, and the one
// dataset those tests exercise. Attendance/access-log models stay real — with
// no retention configured for them the sweep returns before ever querying.
const h = vi.hoisted(() => ({ cfg: {}, adminDocs: [], incidentFind: vi.fn() }));

vi.mock("config", () => ({ default: { has: () => true, get: () => h.cfg } }));
vi.mock("../../../core/v1/admin/admin.model.js", () => ({
  default: {
    find: () => ({ select: () => ({ lean: async () => h.adminDocs }) }),
    updateOne: vi.fn(async () => ({})),
  },
}));
vi.mock("../../../core/v1/incidents/incidents.model.js", () => ({
  Incident: {
    modelName: "Incident",
    find: h.incidentFind,
    deleteMany: vi.fn(async () => ({ deletedCount: 0 })),
  },
}));

const { deleteMedia } = await import("../../../utils/mediaStorage.js");
const {
  retentionCutoff,
  isAllowedRetentionSpec,
  RETENTION_OPTION_MONTHS,
  MAX_RETENTION_MONTHS,
  collectMediaPaths,
  sweepDataset,
  runRetentionSweep,
} = await import("../../../services/retention.service.js");

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

describe("isAllowedRetentionSpec", () => {
  it("accepts the three offered options, case and space tolerant", () => {
    expect(RETENTION_OPTION_MONTHS).toEqual([1, 3, 6]);
    expect(MAX_RETENTION_MONTHS).toBe(6);
    expect(isAllowedRetentionSpec("1m")).toBe(true);
    expect(isAllowedRetentionSpec("3m")).toBe(true);
    expect(isAllowedRetentionSpec(" 6M ")).toBe(true);
  });

  it("rejects anything past the 6 month cap, other units, and junk", () => {
    expect(isAllowedRetentionSpec("12m")).toBe(false);
    expect(isAllowedRetentionSpec("1y")).toBe(false);
    // A day spec is rejected even when it lands inside the cap — the API stores
    // only the offered options, so the settings screen can always show it back.
    expect(isAllowedRetentionSpec("90d")).toBe(false);
    expect(isAllowedRetentionSpec("2m")).toBe(false);
    expect(isAllowedRetentionSpec("never")).toBe(false);
    expect(isAllowedRetentionSpec(undefined)).toBe(false);
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

  it("merges an owner filter into the query", async () => {
    const model = fakeModel([[]]);
    await sweepDataset({
      ...baseArgs,
      model,
      deadline: Date.now() + 60_000,
      ownerFilter: { userId: "42" },
    });
    expect(model.find.mock.calls[0][0]).toMatchObject({ userId: "42" });
  });
});

describe("runRetentionSweep per-admin overrides", () => {
  // Capture the query of every incident sweep pass; return an empty batch.
  const queries = [];
  beforeEach(() => {
    queries.length = 0;
    h.cfg = { incidents: "3m", batchSize: 200, maxRunMinutes: 60 };
    h.incidentFind.mockReset();
    h.incidentFind.mockImplementation((q) => {
      queries.push(q);
      return { sort: () => ({ limit: () => ({ select: () => ({ lean: async () => [] }) }) }) };
    });
  });

  it("sweeps an overriding admin on their own cutoff and excludes them from the global pass", async () => {
    h.adminDocs = [{ _id: "aaa", user_id: "42", retention: { incidents: "1y" } }];

    await runRetentionSweep();

    expect(queries).toHaveLength(2);
    // Incidents key off the admin's string user_id, not their _id.
    expect(queries[0].userId).toBe("42");
    expect(queries[1].userId).toEqual({ $nin: ["42"] });
    // Their own pass uses 1y; the global pass uses 3m.
    expect(queries[0].timeOfIncident.$lt.getTime()).toBeLessThan(
      queries[1].timeOfIncident.$lt.getTime(),
    );
  });

  it('runs no pass for "never" but still excludes that admin from the global pass', async () => {
    h.adminDocs = [{ _id: "aaa", user_id: "42", retention: { incidents: "never" } }];

    await runRetentionSweep();

    expect(queries).toHaveLength(1);
    expect(queries[0].userId).toEqual({ $nin: ["42"] });
  });

  it("sweeps everything globally when no admin overrides", async () => {
    h.adminDocs = [];

    await runRetentionSweep();

    expect(queries).toHaveLength(1);
    expect(queries[0].userId).toBeUndefined();
  });

  it("skips a disabled admin entirely, and still excludes them globally", async () => {
    h.adminDocs = [{ _id: "aaa", user_id: "42", retention: { enabled: false } }];

    await runRetentionSweep();

    expect(queries).toHaveLength(1);
    expect(queries[0].userId).toEqual({ $nin: ["42"] });
  });

  it("honours a per-admin intervalHours, skipping until the window elapses", async () => {
    const hourAgo = new Date(Date.now() - 3_600_000);
    h.adminDocs = [
      { _id: "aaa", user_id: "42", retention: { intervalHours: 24, lastSweepAt: hourAgo } },
    ];

    await runRetentionSweep();

    // Not due — no pass of their own, but the global pass must still skip them.
    expect(queries).toHaveLength(1);
    expect(queries[0].userId).toEqual({ $nin: ["42"] });
  });

  it("uses the admin's own batchSize for their pass and the global one elsewhere", async () => {
    h.cfg = { incidents: "3m", batchSize: 200, maxRunMinutes: 60 };
    h.adminDocs = [
      { _id: "aaa", user_id: "42", retention: { incidents: "1y", batchSize: 7 } },
    ];
    const limits = [];
    h.incidentFind.mockImplementation((q) => {
      queries.push(q);
      return {
        sort: () => ({
          limit: (n) => {
            limits.push(n);
            return { select: () => ({ lean: async () => [] }) };
          },
        }),
      };
    });

    await runRetentionSweep();

    expect(limits).toEqual([7, 200]);
  });
});
