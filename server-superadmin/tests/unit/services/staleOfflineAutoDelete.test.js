import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../utils/database.js", () => ({
  redis: { status: "ready", mget: vi.fn() },
}));
vi.mock("../../../utils/logger.js", () => ({
  default: { info: vi.fn(), error: vi.fn() },
}));
vi.mock("../../../core/v1/sessions/sessions.model.js", () => ({
  default: { find: vi.fn(), deleteMany: vi.fn() },
}));

import { redis } from "../../../utils/database.js";
import sessionModel from "../../../core/v1/sessions/sessions.model.js";
import { deleteStaleOfflineSessions } from "../../../core/v1/sessions/staleOfflineAutoDelete.js";

const NOW = Date.UTC(2026, 8, 29, 12);
const CUTOFF = new Date(NOW - 7 * 24 * 60 * 60 * 1_000);

function provideRows(rows) {
  const cursor = {
    async *[Symbol.asyncIterator]() {
      yield* rows;
    },
    close: vi.fn(),
  };
  const query = {
    select: vi.fn().mockReturnThis(),
    sort: vi.fn().mockReturnThis(),
    lean: vi.fn().mockReturnThis(),
    cursor: vi.fn().mockReturnValue(cursor),
  };
  sessionModel.find.mockReturnValue(query);
  return cursor;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Date, "now").mockReturnValue(NOW);
  redis.status = "ready";
  sessionModel.deleteMany.mockResolvedValue({ deletedCount: 1 });
});

describe("stale active offline session cleanup", () => {
  it("deletes only an old active session with no Redis presence", async () => {
    const cursor = provideRows([
      { _id: "offline-row", sessionId: "offline-session" },
      { _id: "online-row", sessionId: "online-session" },
    ]);
    redis.mget
      .mockResolvedValueOnce([null, "connected"])
      .mockResolvedValueOnce([null]);

    expect(await deleteStaleOfflineSessions()).toBe(1);
    expect(sessionModel.find).toHaveBeenCalledWith({
      status: "active",
      lastActiveAt: { $lte: CUTOFF },
    });
    expect(sessionModel.deleteMany).toHaveBeenCalledWith({
      _id: { $in: ["offline-row"] },
      status: "active",
      lastActiveAt: { $lte: CUTOFF },
    });
    expect(cursor.close).toHaveBeenCalled();
  });

  it("keeps a session that reconnects before deletion", async () => {
    provideRows([{ _id: "row", sessionId: "session" }]);
    redis.mget.mockResolvedValueOnce([null]).mockResolvedValueOnce(["connected"]);

    expect(await deleteStaleOfflineSessions()).toBe(0);
    expect(sessionModel.deleteMany).not.toHaveBeenCalled();
  });

  it("does not delete any session when Redis is unavailable", async () => {
    provideRows([{ _id: "row", sessionId: "session" }]);
    redis.status = "reconnecting";

    expect(await deleteStaleOfflineSessions()).toBe(0);
    expect(redis.mget).not.toHaveBeenCalled();
    expect(sessionModel.deleteMany).not.toHaveBeenCalled();
  });

  it("does not delete any session when a presence lookup fails", async () => {
    provideRows([{ _id: "row", sessionId: "session" }]);
    redis.mget.mockRejectedValue(new Error("Redis unavailable"));

    expect(await deleteStaleOfflineSessions()).toBe(0);
    expect(sessionModel.deleteMany).not.toHaveBeenCalled();
  });

  it("does not delete when the final presence recheck fails", async () => {
    provideRows([{ _id: "row", sessionId: "session" }]);
    redis.mget.mockResolvedValueOnce([null]).mockRejectedValueOnce(new Error("Redis unavailable"));

    expect(await deleteStaleOfflineSessions()).toBe(0);
    expect(sessionModel.deleteMany).not.toHaveBeenCalled();
  });

  it("processes old sessions beyond the first batch", async () => {
    provideRows(Array.from({ length: 201 }, (_, index) => ({
      _id: `row-${index}`,
      sessionId: `session-${index}`,
    })));
    redis.mget.mockImplementation(async (keys) => keys.map(() => null));
    sessionModel.deleteMany.mockImplementation(async (filter) => ({
      deletedCount: filter._id.$in.length,
    }));

    expect(await deleteStaleOfflineSessions()).toBe(201);
    expect(sessionModel.deleteMany).toHaveBeenCalledTimes(2);
  });
});
