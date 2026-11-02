/**
 * Closing sessions nobody is watching. Contract §10.
 *
 * "Default to closing: a wrongly-closed session costs one re-click, a leaked
 *  one costs a GPU slot forever."
 *
 * Three triggers, all against a real database: socket disconnect, stale
 * heartbeat, and a Node restart. Only the X-ray HTTP client is faked, because
 * the assertion in every case is "was the service told to free the slot".
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const client = {
  closeSession: vi.fn(async () => ({ ok: true, status: 200, data: { isSuccess: true } })),
};
vi.mock("../../core/v2/xray/xray.client.js", () => ({
  default: client,
  JWT_SUBJECT: "videoraiq-backend",
}));

process.env.XRAY_ENABLED = "true";
process.env.XRAY_IDLE_TIMEOUT_SEC = "45";
process.env.XRAY_CLOSE_MAX_ATTEMPTS = "3";

const { connectMongo, disconnectMongo, clearCollections } = await import("./dbSetup.js");
const { default: XraySession } = await import("../../core/v2/xray/xray.model.js");
const { clearFanoutCache } = await import("../../core/v2/xray/xray.fanout.js");
const {
  closeXraySessionsForSocket,
  reapIdleXraySessions,
  sweepXraySessionsOnStartup,
  setXrayReaperIo,
} = await import("../../core/v2/xray/xray.reaper.js");

/**
 * A socket.io stand-in: one fake socket whose emits are recorded.
 *
 * Only the two members the fan-out touches are needed —
 * `io.sockets.sockets.get(id)` and `socket.emit` — so a real server would add
 * nothing here but startup time. The real-server case is covered by
 * tests/integration/xray.ws.test.js.
 */
const emitted = [];
const fakeSocket = { emit: (event, payload) => emitted.push({ event, payload }) };
const fakeIo = { sockets: { sockets: new Map([["socket-a", fakeSocket]]) } };

let counter = 0;
const seed = (over = {}) => {
  counter += 1;
  return XraySession.create({
    sessionId: `feed${String(counter).padStart(12, "0")}`,
    adminId: "admin-1",
    userId: "tenant-1",
    cameraId: "cam-1",
    nvrId: "nvr-1",
    socketId: "socket-a",
    state: "ready",
    lastHeartbeatAt: new Date(),
    ...over,
  });
};

const secondsAgo = (s) => new Date(Date.now() - s * 1000);

beforeAll(async () => {
  await connectMongo();
});
afterAll(async () => {
  await disconnectMongo();
});
beforeEach(async () => {
  await clearCollections();
  clearFanoutCache();
  emitted.length = 0;
  client.closeSession.mockReset();
  client.closeSession.mockResolvedValue({ ok: true, status: 200, data: { isSuccess: true } });
  // Hand the reaper the socket accessor WITHOUT starting the sweep.
  // startXrayReaper would also fire its startup sweep, and that
  // fire-and-forget pass closes every seeded session out from under the test
  // body — an intermittent failure that passes on re-run.
  setXrayReaperIo(() => fakeIo);
});

// ---------------------------------------------------------------------------
// Trigger 1 — the browser tab closed
// ---------------------------------------------------------------------------

describe("closing on socket disconnect", () => {
  it("closes every live session the socket owned", async () => {
    const a = await seed({ socketId: "socket-a" });
    const b = await seed({ socketId: "socket-a", state: "tracking" });
    await seed({ socketId: "socket-b" }); // someone else's tab

    const closed = await closeXraySessionsForSocket("socket-a");

    expect(closed).toBe(2);
    expect(client.closeSession).toHaveBeenCalledTimes(2);
    for (const session of [a, b]) {
      const record = await XraySession.findOne({ sessionId: session.sessionId }).lean();
      expect(record.state).toBe("ended");
      expect(record.endReason).toBe("closed_by_user");
    }
  });

  it("leaves another socket's sessions alone", async () => {
    const other = await seed({ socketId: "socket-b" });

    await closeXraySessionsForSocket("socket-a");

    expect((await XraySession.findOne({ sessionId: other.sessionId }).lean()).state).toBe("ready");
  });

  // Called on EVERY socket disconnect, so the common case must be cheap and
  // silent.
  it("does nothing for a socket with no sessions", async () => {
    expect(await closeXraySessionsForSocket("socket-nobody")).toBe(0);
    expect(client.closeSession).not.toHaveBeenCalled();
  });

  it("does nothing for an empty socket id", async () => {
    await seed({ socketId: "" });
    expect(await closeXraySessionsForSocket("")).toBe(0);
    expect(client.closeSession).not.toHaveBeenCalled();
  });

  it("ignores sessions that already ended", async () => {
    await seed({ socketId: "socket-a", state: "ended", endReason: "closed_by_user" });
    expect(await closeXraySessionsForSocket("socket-a")).toBe(0);
  });

  /**
   * The leak-prevention rule. If the service cannot be reached, the record
   * stays LIVE so the next sweep tries again — marking it ended would make
   * Node forget a slot the GPU is still holding, which is the whole thing this
   * file exists to prevent.
   */
  it("leaves the record live when the service refuses", async () => {
    const session = await seed({ socketId: "socket-a" });
    client.closeSession.mockResolvedValue({
      ok: false,
      status: 503,
      code: "service_unavailable",
      retryable: true,
    });

    expect(await closeXraySessionsForSocket("socket-a")).toBe(0);
    expect((await XraySession.findOne({ sessionId: session.sessionId }).lean()).state).toBe("ready");
  });

  it("retries on the next pass after a failure", async () => {
    const session = await seed({ socketId: "socket-a" });
    client.closeSession.mockResolvedValueOnce({
      ok: false,
      status: 503,
      code: "service_unavailable",
      retryable: true,
    });

    await closeXraySessionsForSocket("socket-a");
    await closeXraySessionsForSocket("socket-a"); // second attempt succeeds

    expect((await XraySession.findOne({ sessionId: session.sessionId }).lean()).state).toBe("ended");
  });
});

// ---------------------------------------------------------------------------
// Trigger 2 — the heartbeat stopped
// ---------------------------------------------------------------------------

describe("reaping on a stale heartbeat", () => {
  it("closes a session silent for longer than the timeout", async () => {
    const stale = await seed({ lastHeartbeatAt: secondsAgo(120) });

    expect(await reapIdleXraySessions()).toBe(1);

    const record = await XraySession.findOne({ sessionId: stale.sessionId }).lean();
    expect(record.state).toBe("ended");
    expect(record.endReason).toBe("idle_timeout");
  });

  // The frontend beats every 10s against a 45s timeout, so a session survives
  // four missed beats. That margin is what stops a brief network hiccup
  // costing the user their session.
  it("leaves a recently-beating session alone", async () => {
    const fresh = await seed({ lastHeartbeatAt: secondsAgo(20) });

    expect(await reapIdleXraySessions()).toBe(0);
    expect((await XraySession.findOne({ sessionId: fresh.sessionId }).lean()).state).toBe("ready");
  });

  it("leaves a session exactly at the boundary alone", async () => {
    await seed({ lastHeartbeatAt: secondsAgo(44) });
    expect(await reapIdleXraySessions()).toBe(0);
  });

  it("reaps every state that is not terminal", async () => {
    for (const state of ["preparing", "ready", "tracking", "lost"]) {
      await seed({ state, lastHeartbeatAt: secondsAgo(120) });
    }
    await seed({ state: "ended", lastHeartbeatAt: secondsAgo(120) });

    expect(await reapIdleXraySessions()).toBe(4);
  });

  it("does nothing when there is nothing stale", async () => {
    await seed();
    expect(await reapIdleXraySessions()).toBe(0);
    expect(client.closeSession).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Trigger 3 — Node restarted
// ---------------------------------------------------------------------------

describe("sweeping on startup", () => {
  /**
   * Every live record predates this process, so none has a socket in it.
   * Without this, a restart orphans GPU state permanently: nothing in this
   * process will ever serve those sessions, and nothing else holds their ids.
   */
  it("closes every live session left over from a previous process", async () => {
    await seed({ lastHeartbeatAt: new Date() }); // heartbeat is irrelevant here
    await seed({ state: "tracking" });
    await seed({ state: "ended", endReason: "closed_by_user" });

    expect(await sweepXraySessionsOnStartup()).toBe(2);
    expect(await XraySession.countDocuments({ state: { $ne: "ended" } })).toBe(0);
  });

  it("marks them session_expired, not closed_by_user", async () => {
    // The user did not close these — Node did, on their behalf. The reason the
    // frontend shows should say so.
    const orphan = await seed();

    await sweepXraySessionsOnStartup();

    expect((await XraySession.findOne({ sessionId: orphan.sessionId }).lean()).endReason).toBe(
      "session_expired",
    );
  });

  it("does nothing on a clean start", async () => {
    expect(await sweepXraySessionsOnStartup()).toBe(0);
    expect(client.closeSession).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Phase 5 — the frontend is TOLD, and retries are bounded. Contract §10.
// ---------------------------------------------------------------------------

describe("telling the browser its session ended", () => {
  /**
   * The gap Phase 5 closed. Until this, the reaper marked the record ended and
   * the browser learned nothing — so a user whose session was reaped kept
   * looking at a frozen outline with no explanation.
   */
  it("emits xray:state ended when a session is reaped for idling", async () => {
    await seed({ socketId: "socket-a", lastHeartbeatAt: secondsAgo(120) });

    await reapIdleXraySessions();

    expect(emitted).toHaveLength(1);
    expect(emitted[0].event).toBe("xray:state");
    expect(emitted[0].payload).toMatchObject({
      state: "ended",
      reason: "idle_timeout",
      framesBehindLive: 0,
    });
  });

  it("emits ended with session_expired on the startup sweep", async () => {
    await seed({ socketId: "socket-a" });

    await sweepXraySessionsOnStartup();

    expect(emitted[0].payload).toMatchObject({ state: "ended", reason: "session_expired" });
  });

  // The notification must not be the thing that stops a slot being released:
  // the browser is usually gone, which is why the session is being reaped.
  it("still closes the session when there is no socket to tell", async () => {
    const orphan = await seed({ socketId: "socket-long-gone", lastHeartbeatAt: secondsAgo(120) });

    expect(await reapIdleXraySessions()).toBe(1);
    expect(emitted).toHaveLength(0);
    expect((await XraySession.findOne({ sessionId: orphan.sessionId }).lean()).state).toBe("ended");
  });

  // Ordering trap: the delivery lookup only matches LIVE sessions, so writing
  // "ended" before notifying would silently find nothing. If this passes, the
  // notification happened while the record was still live.
  it("notifies before the record goes terminal, not after", async () => {
    await seed({ socketId: "socket-a", lastHeartbeatAt: secondsAgo(120) });

    await reapIdleXraySessions();

    expect(emitted).toHaveLength(1);
  });

  it("tells the browser when its own tab disconnected", async () => {
    await seed({ socketId: "socket-a" });

    await closeXraySessionsForSocket("socket-a");

    // The tab has gone, so this usually reaches nobody — but the socket is
    // still registered for a moment after disconnect, and telling it costs
    // nothing. What matters is that the reason is right.
    expect(emitted[0]?.payload).toMatchObject({ state: "ended", reason: "closed_by_user" });
  });
});

describe("bounded close retries", () => {
  const unreachable = () => {
    client.closeSession.mockResolvedValue({
      ok: false,
      status: 503,
      code: "service_unavailable",
      message: "the X-ray service is unreachable",
      retryable: true,
    });
  };

  it("leaves the session live while the budget lasts", async () => {
    const session = await seed({ socketId: "socket-a", lastHeartbeatAt: secondsAgo(120) });
    unreachable();

    await reapIdleXraySessions();
    await reapIdleXraySessions();

    const record = await XraySession.findOne({ sessionId: session.sessionId }).lean();
    expect(record.state).toBe("ready");
    expect(record.closeAttempts).toBe(2);
    expect(emitted).toHaveLength(0);
  });

  /**
   * Retrying forever is not a terminal state. If the service is simply gone the
   * session would stay live and the browser would wait with no masks and no
   * error — exactly what §10 forbids.
   */
  it("gives up after the budget and tells the browser internal_error", async () => {
    const session = await seed({ socketId: "socket-a", lastHeartbeatAt: secondsAgo(120) });
    unreachable();

    for (let i = 0; i < 3; i += 1) await reapIdleXraySessions();

    const record = await XraySession.findOne({ sessionId: session.sessionId }).lean();
    expect(record.state).toBe("ended");
    expect(record.endReason).toBe("internal_error");
    expect(emitted).toHaveLength(1);
    expect(emitted[0].payload).toMatchObject({ state: "ended", reason: "internal_error" });
  });

  it("stops retrying once it has given up", async () => {
    await seed({ socketId: "socket-a", lastHeartbeatAt: secondsAgo(120) });
    unreachable();

    for (let i = 0; i < 3; i += 1) await reapIdleXraySessions();
    const callsAtGiveUp = client.closeSession.mock.calls.length;
    await reapIdleXraySessions();

    expect(client.closeSession.mock.calls.length).toBe(callsAtGiveUp);
  });

  // The count is persisted, so a session the service will never close does not
  // get a fresh budget every time Node restarts.
  it("counts attempts across restarts, not per process", async () => {
    const session = await seed({
      socketId: "socket-a",
      lastHeartbeatAt: secondsAgo(120),
      closeAttempts: 2, // two failures before this process started
    });
    unreachable();

    await reapIdleXraySessions();

    const record = await XraySession.findOne({ sessionId: session.sessionId }).lean();
    expect(record.closeAttempts).toBe(3);
    expect(record.state).toBe("ended");
    expect(record.endReason).toBe("internal_error");
  });

  it("a successful close does not consume the budget", async () => {
    const session = await seed({ socketId: "socket-a", lastHeartbeatAt: secondsAgo(120) });

    await reapIdleXraySessions();

    const record = await XraySession.findOne({ sessionId: session.sessionId }).lean();
    expect(record.closeAttempts).toBe(0);
    expect(record.endReason).toBe("idle_timeout");
  });
});
