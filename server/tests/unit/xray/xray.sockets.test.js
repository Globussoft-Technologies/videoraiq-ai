/**
 * Which socket does a session's masks go to? Contract §9.
 *
 * The test that matters most here is the last one. Everything else is
 * bookkeeping; that one is a regression test for a defect that hung the server.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const redis = { get: vi.fn() };
vi.mock("../../../utils/database.js", () => ({ redis, default: { redis } }));

const { resolveSocketId, tabSocketKey, userSocketKey } = await import(
  "../../../core/v2/xray/xray.sockets.js"
);

beforeEach(() => {
  redis.get.mockReset();
});

describe("key naming matches socket.js", () => {
  // socket.js:393 and socket.js:385. If these drift, the lookup silently finds
  // nothing and masks quietly stop being delivered.
  it("uses the same Redis keys socket.js writes", () => {
    expect(tabSocketKey("tab-7")).toBe("socket:session:tab-7");
    expect(userSocketKey("tenant-42")).toBe("socket:tenant-42");
  });
});

describe("resolveSocketId", () => {
  it("prefers the tab's own socket", async () => {
    redis.get.mockImplementation(async (key) =>
      key === "socket:session:tab-7" ? "socket-tab" : "socket-user",
    );

    expect(await resolveSocketId({ clientSessionId: "tab-7", userId: "tenant-42" })).toBe(
      "socket-tab",
    );
  });

  // Degrading to the user's socket is safe because contract §9 makes the
  // frontend ignore an event whose sessionId is not its own. The worst case is
  // a second tab discarding a mask, never a wrong mask drawn.
  it("falls back to the user's socket when the tab is unknown", async () => {
    redis.get.mockImplementation(async (key) =>
      key === "socket:tenant-42" ? "socket-user" : null,
    );

    expect(await resolveSocketId({ clientSessionId: "tab-unknown", userId: "tenant-42" })).toBe(
      "socket-user",
    );
  });

  it("returns an empty string when neither is known", async () => {
    redis.get.mockResolvedValue(null);

    expect(await resolveSocketId({ clientSessionId: "tab-7", userId: "tenant-42" })).toBe("");
  });

  it("skips the tab lookup entirely when no tab id was sent", async () => {
    redis.get.mockResolvedValue("socket-user");

    await resolveSocketId({ userId: "tenant-42" });

    expect(redis.get).toHaveBeenCalledTimes(1);
    expect(redis.get).toHaveBeenCalledWith("socket:tenant-42");
  });

  it("survives a rejecting Redis", async () => {
    redis.get.mockRejectedValue(new Error("READONLY"));

    expect(await resolveSocketId({ clientSessionId: "tab-7", userId: "tenant-42" })).toBe("");
  });

  /**
   * THE REGRESSION TEST.
   *
   * ioredis keeps an offline queue (`enableOfflineQueue` defaults to true):
   * while disconnected it accepts commands and holds them until it reconnects.
   * The promise neither resolves nor rejects — so the original code, which
   * simply awaited inside a try/catch, hung forever with nothing logged.
   *
   * Found by running the real relay with no Redis: POST /sessions never
   * answered. Both unit and integration tests had passed, because both mocked
   * Redis with a promise that actually settles — a mock cannot reproduce a
   * promise that never does unless you write one deliberately, which is what
   * this test does.
   */
  it("gives up rather than hanging when Redis never answers", async () => {
    redis.get.mockImplementation(() => new Promise(() => {})); // never settles

    const started = Date.now();
    const result = await resolveSocketId({ clientSessionId: "tab-7", userId: "tenant-42" });
    const elapsed = Date.now() - started;

    expect(result).toBe("");
    // Two lookups at a 500ms bound each; comfortably under any HTTP timeout,
    // and crucially FINITE.
    expect(elapsed).toBeLessThan(3000);
  }, 10_000);
});
