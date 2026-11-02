/**
 * The WebSocket endpoint and the fan-out. Contract §8, §9.
 *
 * A real HTTP server, a real socket.io server and a real `ws` client, all on an
 * ephemeral port — because the thing most worth testing here is the INTERACTION
 * between socket.io and a raw WebSocket on one port, and a mock cannot show
 * that. Mongo is real too; only the X-ray HTTP client is faked.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import http from "node:http";
import jwt from "jsonwebtoken";
import { Server as SocketIOServer } from "socket.io";
import WebSocket from "ws";
import { io as ioClient } from "socket.io-client";

const client = {
  closeSession: vi.fn(async () => ({ ok: true, status: 200, data: { isSuccess: true } })),
};
vi.mock("../../core/v2/xray/xray.client.js", () => ({
  default: client,
  JWT_SUBJECT: "videoraiq-backend",
}));

vi.mock("../../utils/database.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, redis: { get: vi.fn(async () => null), set: vi.fn(), del: vi.fn() } };
});

const SECRET = "ws-test-secret";
process.env.XRAY_ENABLED = "true";
process.env.XRAY_JWT_SECRET = SECRET;
process.env.XRAY_WS_PATH = "/internal/xray/ws";
process.env.XRAY_WS_PING_SEC = "5";
// Short on purpose: the production default is 3s, and these tests need to see
// both sides of the window without sitting through it.
process.env.XRAY_WS_UNKNOWN_GRACE_MS = "150";

const { connectMongo, disconnectMongo, clearCollections } = await import("./dbSetup.js");
const { attachXrayWebSocket, detachXrayWebSocket } = await import("../../core/v2/xray/xray.ws.js");
const { clearFanoutCache, holdSession } = await import("../../core/v2/xray/xray.fanout.js");
const { resetUnknownSessionGrace } = await import("../../core/v2/xray/xray.ws.js");
const { default: XraySession } = await import("../../core/v2/xray/xray.model.js");

let server;
let io;
let port;

const serviceToken = (over = {}) =>
  jwt.sign({ sub: "videoraiq-backend", ...over }, SECRET, { algorithm: "HS256", expiresIn: 120 });

/**
 * Connect as the X-ray service would, and resolve only once the connection has
 * STAYED open.
 *
 * A rejected upgrade still completes the handshake and then closes with 4401
 * (contract §8) — deliberately, so the service can tell "bad credential" from
 * "nothing listening" and stop retrying a token that will never work. So a
 * client sees `open` and then `close`, and resolving on `open` alone would call
 * a rejected connection a success.
 */
const connectService = (token = serviceToken()) =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/internal/xray/ws`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const onClose = (code) => reject(Object.assign(new Error(`closed ${code}`), { code }));
    ws.once("close", onClose);
    ws.once("error", reject);
    ws.once("open", () => {
      // Give a rejection time to arrive before declaring success.
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.off("close", onClose);
          resolve(ws);
        }
      }, 120);
    });
  });

/** The close code a rejected upgrade ends with. */
const closeCodeFor = (token) =>
  new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/internal/xray/ws`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    ws.once("close", (code) => resolve(code));
    ws.once("error", () => resolve(0));
  });

/** Wait for one message of a given type, or time out. */
const nextMessage = (ws, type, ms = 2000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no ${type} within ${ms}ms`)), ms);
    const onMessage = (raw) => {
      const message = JSON.parse(raw);
      if (message.type === type) {
        clearTimeout(timer);
        ws.off("message", onMessage);
        resolve(message);
      }
    };
    ws.on("message", onMessage);
  });

const seedSession = (over = {}) =>
  XraySession.create({
    sessionId: "aaaabbbbccccdddd",
    adminId: "admin-1",
    userId: "tenant-1",
    cameraId: "cam-1",
    nvrId: "nvr-1",
    socketId: "",
    clientSessionId: "tab-1",
    state: "ready",
    width: 1920,
    height: 1080,
    frameRate: 5,
    maxObjects: 1,
    lastHeartbeatAt: new Date(),
    ...over,
  });

beforeAll(async () => {
  await connectMongo();

  server = http.createServer((_req, res) => res.end("ok"));
  io = new SocketIOServer(server);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = server.address().port;

  await attachXrayWebSocket(server, { getIO: () => io });
});

afterAll(async () => {
  await detachXrayWebSocket();
  io?.close();
  await new Promise((resolve) => server.close(resolve));
  await disconnectMongo();
});

beforeEach(async () => {
  await clearCollections();
  clearFanoutCache();
  client.closeSession.mockClear();
});

// ---------------------------------------------------------------------------
// The upgrade — contract §8
// ---------------------------------------------------------------------------

describe("the WebSocket upgrade", () => {
  it("accepts a correctly signed service token", async () => {
    const ws = await connectService();
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });

  it("closes 4401 on a token signed with the wrong secret", async () => {
    const bad = jwt.sign({ sub: "videoraiq-backend" }, "not-the-secret", { expiresIn: 60 });
    expect(await closeCodeFor(bad)).toBe(4401);
  });

  it("closes 4401 when there is no token at all", async () => {
    expect(await closeCodeFor(null)).toBe(4401);
  });

  // A browser login token must not be able to open the service channel.
  it("closes 4401 on a token with the wrong sub", async () => {
    const wrongSub = jwt.sign({ sub: "some-browser-user" }, SECRET, { expiresIn: 60 });
    expect(await closeCodeFor(wrongSub)).toBe(4401);
  });

  it("closes 4401 on an expired token", async () => {
    const expired = jwt.sign(
      { sub: "videoraiq-backend", exp: Math.floor(Date.now() / 1000) - 10 },
      SECRET,
    );
    expect(await closeCodeFor(expired)).toBe(4401);
  });

  /**
   * The coexistence test, and the reason this file uses real servers.
   *
   * `new WebSocketServer({ server })` would hijack every upgrade on the shared
   * server and break socket.io. And engine.io destroys upgrades it does not
   * recognise after 1000ms unless bytes were already written
   * (node_modules/engine.io/build/server.js:693-711), which is why the X-ray
   * handshake authenticates synchronously. Both directions are asserted.
   */
  it("leaves socket.io's own upgrades alone on the same port", async () => {
    const browser = ioClient(`http://127.0.0.1:${port}`, { transports: ["websocket"] });
    const connected = await new Promise((resolve) => {
      browser.on("connect", () => resolve(true));
      browser.on("connect_error", () => resolve(false));
      setTimeout(() => resolve(false), 3000);
    });
    browser.disconnect();
    expect(connected).toBe(true);
  });

  it("does not answer an unrelated path", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/not/xray`, {
      headers: { Authorization: `Bearer ${serviceToken()}` },
    });
    const outcome = await new Promise((resolve) => {
      ws.once("open", () => resolve("opened"));
      ws.once("error", () => resolve("rejected"));
      ws.once("close", () => resolve("closed"));
    });
    expect(outcome).not.toBe("opened");
  });
});

// ---------------------------------------------------------------------------
// Fan-out — contract §9
// ---------------------------------------------------------------------------

describe("mask fan-out", () => {
  let browser;
  let ws;

  beforeEach(() => {
    // The unknown-session grace map lives in the module, so without this a
    // sighting from an earlier test satisfies a later one's window and the
    // tests pass in order and fail alone.
    resetUnknownSessionGrace();
  });

  afterEach(() => {
    browser?.disconnect();
    if (ws?.readyState === WebSocket.OPEN) ws.close();
  });

  /** A connected socket.io client whose socket id is recorded on a session. */
  const browserOnSession = async (over = {}) => {
    browser = ioClient(`http://127.0.0.1:${port}`, { transports: ["websocket"] });
    const socketId = await new Promise((resolve) => browser.on("connect", () => resolve(browser.id)));
    const session = await seedSession({ socketId, ...over });
    return { socketId, session };
  };

  it("delivers a mask to the session's own socket, camelCased", async () => {
    const { session } = await browserOnSession();
    const received = new Promise((resolve) => browser.on("xray:mask", resolve));

    ws = await connectService();
    ws.send(
      JSON.stringify({
        type: "mask",
        session_id: session.sessionId,
        seq: 12345,
        offset: 1.24,
        emitted_at: 1792345678.912,
        objects: [{ obj_id: "obj-a1b2c3d4", bbox: [10, 20, 30, 40], polygon: [[[10, 20]]] }],
      }),
    );

    const payload = await received;
    expect(payload).toEqual({
      sessionId: session.sessionId,
      seq: 12345,
      offset: 1.24,
      emittedAt: 1792345678.912,
      objects: [{ objId: "obj-a1b2c3d4", bbox: [10, 20, 30, 40], polygon: [[[10, 20]]] }],
    });
    // The WebSocket envelope is not part of the browser payload (§9).
    expect(payload).not.toHaveProperty("type");
  });

  it("delivers a state message and records it", async () => {
    const { session } = await browserOnSession();
    const received = new Promise((resolve) => browser.on("xray:state", resolve));

    ws = await connectService();
    ws.send(
      JSON.stringify({
        type: "state",
        session_id: session.sessionId,
        state: "lost",
        reason: null,
        frames_behind_live: 142,
      }),
    );

    expect(await received).toEqual({
      sessionId: session.sessionId,
      state: "lost",
      reason: null,
      framesBehindLive: 142,
    });

    const record = await XraySession.findOne({ sessionId: session.sessionId }).lean();
    expect(record.state).toBe("lost");
  });

  it("records a terminal state with its reason", async () => {
    const { session } = await browserOnSession();
    const received = new Promise((resolve) => browser.on("xray:state", resolve));

    ws = await connectService();
    ws.send(
      JSON.stringify({
        type: "state",
        session_id: session.sessionId,
        state: "ended",
        reason: "object_lost",
        frames_behind_live: 0,
      }),
    );
    await received;

    const record = await XraySession.findOne({ sessionId: session.sessionId }).lean();
    expect(record.state).toBe("ended");
    expect(record.endReason).toBe("object_lost");
    expect(record.endedAt).toBeInstanceOf(Date);
  });

  // §8's fast path: masks for a browser that left are pure waste, and the GPU
  // slot behind them is scarce.
  //
  // But "unknown" is NOT the same as "gone", and this test used to assert that
  // it was -- one sighting of an unfamiliar id earned an immediate
  // close_session. Against the REAL Python service that killed every session
  // Node created: the service's pump is an asyncio task started before
  // POST /sessions returns, so its first `state` frame arrives while
  // createSession is still between the service's 200 and its Mongo write.
  // `session ... open` and `asking the service to close (no_session)` landed in
  // the same second, every time, and no mask ever reached a browser.
  //
  // So the close now needs the id to STILL be unknown a grace window later.
  it("does not close an unknown session on the first sighting", async () => {
    ws = await connectService();
    const closeRequest = nextMessage(ws, "close_session", 400).then(
      () => "closed",
      () => "no close",
    );

    ws.send(JSON.stringify({ type: "mask", session_id: "0000111122223333", seq: 1, objects: [] }));

    expect(await closeRequest).toBe("no close");
  });

  it("closes an unknown session once the grace window has passed", async () => {
    ws = await connectService();
    const closeRequest = nextMessage(ws, "close_session");

    ws.send(JSON.stringify({ type: "mask", session_id: "1111222233334444", seq: 1, objects: [] }));
    await new Promise((resolve) => setTimeout(resolve, 200)); // > the 150ms window
    ws.send(JSON.stringify({ type: "mask", session_id: "1111222233334444", seq: 2, objects: [] }));

    expect(await closeRequest).toMatchObject({
      type: "close_session",
      session_id: "1111222233334444",
    });
  });

  /**
   * The birth race, from the other direction: a session the fan-out has been
   * told about but which is not in Mongo yet must be DELIVERED, not merely
   * tolerated -- §8 says a `state` message is never dropped, and `ready` is
   * the first one every session sends.
   *
   * `holdSession` is what createSession calls the instant the service answers,
   * before resolving a socket id or writing the record.
   */
  it("delivers a state for a session that is held but not yet persisted", async () => {
    browser = ioClient(`http://127.0.0.1:${port}`, { transports: ["websocket"] });
    const socketId = await new Promise((resolve) => browser.on("connect", () => resolve(browser.id)));
    const unpersisted = "fffeeeeddddcccc1";
    // No seedSession: this is precisely the window where no record exists.
    // The socket id is part of the hold because createSession resolves it
    // before the GPU call -- Redis is mocked to null in this suite, which is
    // exactly the condition that would strand a hold without one.
    holdSession(unpersisted, { socketId, userId: "tenant-1", clientSessionId: "tab-1" });

    const received = new Promise((resolve) => browser.on("xray:state", resolve));
    ws = await connectService();
    const closed = nextMessage(ws, "close_session", 500).then(
      () => "closed",
      () => "no close",
    );
    ws.send(JSON.stringify({ type: "state", session_id: unpersisted, state: "ready", reason: null, frames_behind_live: 0 }));

    expect(await received).toMatchObject({ sessionId: unpersisted, state: "ready" });
    expect(await closed).toBe("no close");
  });

  it("asks the service to close a session whose browser has gone", async () => {
    const { session } = await browserOnSession();
    browser.disconnect();
    // Let socket.io notice the disconnect before the mask arrives.
    await new Promise((resolve) => setTimeout(resolve, 150));

    ws = await connectService();
    const closeRequest = nextMessage(ws, "close_session");

    ws.send(JSON.stringify({ type: "mask", session_id: session.sessionId, seq: 1, objects: [] }));

    expect(await closeRequest).toMatchObject({ session_id: session.sessionId });
  });

  // Routing by session, not by user (§9): a second tab must not receive the
  // first tab's masks.
  it("does not deliver one tab's masks to another tab", async () => {
    const { session } = await browserOnSession();

    const other = ioClient(`http://127.0.0.1:${port}`, { transports: ["websocket"] });
    await new Promise((resolve) => other.on("connect", resolve));
    let otherGotOne = false;
    other.on("xray:mask", () => {
      otherGotOne = true;
    });

    const mine = new Promise((resolve) => browser.on("xray:mask", resolve));
    ws = await connectService();
    ws.send(JSON.stringify({ type: "mask", session_id: session.sessionId, seq: 1, objects: [] }));
    await mine;
    await new Promise((resolve) => setTimeout(resolve, 150));
    other.disconnect();

    expect(otherGotOne).toBe(false);
  });

  /**
   * TWO LIVE SESSIONS, TWO SOCKETS, ONE SERVICE CONNECTION — the actual §9
   * requirement, and the one the test above cannot reach.
   *
   * "does not deliver one tab's masks to another tab" uses two sockets but only
   * ONE session, so the second socket has no session of its own and cross-talk
   * is impossible by construction: the assertion passes even if the routing is
   * wrong in a way that would mix two real sessions. Session F's live run had
   * the same shape — their "foreign events ignored = 0" was measured with a
   * single session, which cannot produce a foreign event.
   *
   * This is the case that can actually fail: the same user, the same camera, two
   * tabs, two distinct sessions, and both mask streams multiplexed down the ONE
   * service connection contract §8 mandates. Delivery must be partitioned
   * exactly — each socket receives all of its own masks and none of the other's.
   *
   * Verified live against the real relay before being written here: two tabs got
   * 25/25 masks each with zero cross-delivery.
   */
  it("partitions two live sessions across two sockets, from one service connection", async () => {
    // Tab A
    const browserA = ioClient(`http://127.0.0.1:${port}`, { transports: ["websocket"] });
    const socketA = await new Promise((r) => browserA.on("connect", () => r(browserA.id)));
    const sessionA = await seedSession({ sessionId: "aaaa0000aaaa0000", socketId: socketA });

    // Tab B — same tenant, different socket, different session
    const browserB = ioClient(`http://127.0.0.1:${port}`, { transports: ["websocket"] });
    const socketB = await new Promise((r) => browserB.on("connect", () => r(browserB.id)));
    const sessionB = await seedSession({ sessionId: "bbbb1111bbbb1111", socketId: socketB });

    expect(socketA).not.toBe(socketB);

    const gotA = [];
    const gotB = [];
    browserA.on("xray:mask", (p) => gotA.push(p.sessionId));
    browserB.on("xray:mask", (p) => gotB.push(p.sessionId));

    // ONE connection carrying BOTH sessions, as §8 requires.
    ws = await connectService();
    for (let i = 0; i < 4; i += 1) {
      ws.send(JSON.stringify({ type: "mask", session_id: sessionA.sessionId, seq: i, objects: [] }));
      ws.send(JSON.stringify({ type: "mask", session_id: sessionB.sessionId, seq: i, objects: [] }));
    }

    await new Promise((resolve) => setTimeout(resolve, 600));
    browserA.disconnect();
    browserB.disconnect();

    // Each tab got all four of its own and none of the other's.
    expect(gotA).toEqual(Array(4).fill(sessionA.sessionId));
    expect(gotB).toEqual(Array(4).fill(sessionB.sessionId));
  });

  /**
   * TWO SESSIONS SHARING ONE SOCKET — both must be delivered.
   *
   * The mirror of the partition test above, and the case session F's foreign-
   * event filter is built on. One tab can hold two sessions (two cameras in one
   * page), so `socketId` is not unique in the session collection, and this
   * relay must put BOTH streams on that socket and let the consumer decide
   * which it is currently showing. §9 makes that the frontend's job explicitly:
   * "the frontend must ignore any event whose sessionId is not its current
   * session".
   *
   * F's live run proved this empirically — 88 masks for a session the tab was
   * not showing genuinely arrived at it, which is only possible if the fan-out
   * delivers per session rather than per socket. But a live run is a one-off,
   * and their filter now depends on this behaviour, so it is pinned here.
   *
   * The failure this guards against is the plausible-looking optimisation:
   * caching by socket, or treating `socketId` as a unique key, would silently
   * drop one of the two streams. Nothing in F's code could tell that apart from
   * "the service stopped sending".
   */
  it("delivers both sessions when two share one socket", async () => {
    const browserShared = ioClient(`http://127.0.0.1:${port}`, { transports: ["websocket"] });
    const socketId = await new Promise((r) => browserShared.on("connect", () => r(browserShared.id)));

    const first = await seedSession({ sessionId: "cccc2222cccc2222", socketId });
    const second = await seedSession({ sessionId: "dddd3333dddd3333", socketId });

    const received = [];
    browserShared.on("xray:mask", (p) => received.push(p.sessionId));

    ws = await connectService();
    ws.send(JSON.stringify({ type: "mask", session_id: first.sessionId, seq: 1, objects: [] }));
    ws.send(JSON.stringify({ type: "mask", session_id: second.sessionId, seq: 1, objects: [] }));

    await new Promise((resolve) => setTimeout(resolve, 500));
    browserShared.disconnect();

    // Both arrive, tagged distinctly, so the consumer can filter.
    expect(received.sort()).toEqual([first.sessionId, second.sessionId].sort());
  });

  it("ignores junk without dropping the connection", async () => {
    ws = await connectService();

    ws.send("not json at all");
    ws.send("null"); // parses to null — the Phase 2 trap
    ws.send(JSON.stringify({ type: "unheard-of" }));
    ws.send(JSON.stringify({ type: "mask" })); // no session_id

    // Still usable afterwards.
    const pong = new Promise((resolve) => {
      ws.on("message", (raw) => {
        const m = JSON.parse(raw);
        if (m.type === "pong") resolve(m);
      });
    });
    ws.send(JSON.stringify({ type: "ping" }));
    expect(await pong).toEqual({ type: "pong" });
  });
});

// ---------------------------------------------------------------------------
// Reconnects must not destroy session state (plan Phase 4)
// ---------------------------------------------------------------------------

describe("service reconnects", () => {
  it("a dropped WebSocket does not delete sessions", async () => {
    const session = await seedSession();

    const ws = await connectService();
    ws.close();
    await new Promise((resolve) => setTimeout(resolve, 200));

    const record = await XraySession.findOne({ sessionId: session.sessionId }).lean();
    expect(record).toBeTruthy();
    expect(record.state).toBe("ready");
    // Mappings live in Mongo precisely so a reconnect can resume.
    expect(client.closeSession).not.toHaveBeenCalled();
  });

  it("accepts a second connection after the first closes", async () => {
    const first = await connectService();
    first.close();
    await new Promise((resolve) => setTimeout(resolve, 150));

    const second = await connectService();
    expect(second.readyState).toBe(WebSocket.OPEN);
    second.close();
  });
});
