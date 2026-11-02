/**
 * The WebSocket server the Python X-ray service dials into. Contract §8.
 *
 * Direction matters and is counter-intuitive: Node LISTENS, Python CONNECTS.
 * The GPU box sits behind a boundary that does not accept inbound connections,
 * so the door is held open on this side and the GPU box knocks. One connection
 * per service PROCESS, multiplexed by `session_id` — never one per session.
 *
 *
 * IT SHARES THE API's HTTP SERVER, ON THE API's PORT
 *
 * Mounted on the server `server.js` already created, at XRAY_WS_PATH
 * (default /internal/xray/ws). So with the API on 5055 the endpoint is
 * ws://host:5055/internal/xray/ws — exactly contract §8's example.
 *
 * That means sharing the `upgrade` event with socket.io, and there are two
 * traps in doing so:
 *
 *  1. `new WebSocketServer({ server })` would hijack EVERY upgrade on that
 *     server and break socket.io. So this uses `{ noServer: true }` and a path
 *     check: ours is handled, anything else is left entirely alone.
 *
 *  2. engine.io (socket.io's transport) also listens for `upgrade`, and for a
 *     path it does not recognise it waits 1000ms and then ends the socket —
 *     but ONLY if `socket.bytesWritten <= 0`
 *     (node_modules/engine.io/build/server.js:693-711).
 *
 *     So the handshake must be completed, writing its 101 response, inside that
 *     window. **Authentication here is therefore strictly synchronous.** A
 *     database lookup before `handleUpgrade` would risk a slow Mongo pushing
 *     past one second, and engine.io would then destroy a connection we had
 *     already accepted — an intermittent failure that would be extremely hard
 *     to diagnose. Verify the token, complete the handshake, do async work
 *     afterwards.
 *
 *
 * NOTHING HERE LOADS UNLESS THE FLAG IS ON
 *
 * `server.js` calls `attachXrayWebSocket`, which returns immediately when
 * XRAY_ENABLED is false — before `ws` is imported. So a deployment with the
 * flag off neither binds a listener nor requires the dependency to be
 * installed.
 */
import jwt from "jsonwebtoken";
import logger from "../../../utils/logger.js";
import {
  isXrayEnabled,
  xrayJwtSecret,
  xrayWsPath,
  xrayWsPingSec,
  xrayWsUnknownGraceMs,
  xrayConfigProblems,
  xrayConfigSummary,
} from "./xray.config.js";
import { JWT_SUBJECT } from "./xray.client.js";
import { fanOutMask, fanOutState, clearFanoutCache, fanoutStats } from "./xray.fanout.js";

/** Close codes. 4401 is contract §8's "bad token". */
const CLOSE_BAD_TOKEN = 4401;

let wss = null;
let pingTimer = null;

/** Live connections, each with its own liveness bookkeeping. */
const connections = new Set();

export const xrayWsStats = () => ({
  attached: Boolean(wss),
  connections: connections.size,
  ...fanoutStats,
});

/**
 * Verify the service's bearer token. SYNCHRONOUS, deliberately — see the note
 * at the top of this file.
 *
 * Same credential as the HTTP hop (contract §6): HS256, signed with the secret
 * shared with the Python box, `sub` "videoraiq-backend". This is NOT the user
 * login secret; a browser token must not be able to open this socket.
 */
const verifyServiceToken = (request) => {
  const secret = xrayJwtSecret();
  if (!secret) return { ok: false, reason: "no secret configured on this server" };

  const header = request.headers?.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return { ok: false, reason: "missing Authorization: Bearer <jwt>" };

  try {
    const claims = jwt.verify(token, secret, { algorithms: ["HS256"] });
    if (claims.sub !== JWT_SUBJECT) {
      return { ok: false, reason: `unexpected sub: ${claims.sub}` };
    }
    return { ok: true, claims };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
};

/** Send one JSON message, swallowing a write to a closing socket. */
const send = (ws, message) => {
  try {
    if (ws.readyState === 1) ws.send(JSON.stringify(message));
  } catch (error) {
    logger.error(`[XRAY] ws send failed: ${error?.message || error}`);
  }
};

/**
 * Tell the service to stop sending for a session (contract §8's fast path).
 *
 * Sent when the browser has gone, or the session is not one we know about. The
 * service treats it exactly like `DELETE /sessions/:id`, so this is what stops
 * a GPU slot being held for a tab that closed.
 */
const askServiceToClose = (ws, sessionId, why) => {
  logger.info(`[XRAY] asking the service to close ${sessionId} (${why})`);
  fanoutStats.sessionsAbandoned += 1;
  send(ws, { type: "close_session", session_id: sessionId });
};

/**
 * sessionId -> when this process first saw a message for a session it has no
 * record of. See `xrayWsUnknownGraceMs` for why one sighting is not enough.
 */
const firstUnknownAt = new Map();

/**
 * Has this session been unknown for longer than the grace window?
 *
 * A session being unknown is not evidence it is over: it is equally the
 * signature of one being born in another request, or in another Node process.
 * Only the SECOND reading -- the same id still unknown a grace window later --
 * distinguishes the two, so that is what gates the close.
 */
const unknownLongEnoughToClose = (sessionId) => {
  const grace = xrayWsUnknownGraceMs();
  if (grace <= 0) return true;
  const first = firstUnknownAt.get(sessionId);
  if (first === undefined) {
    firstUnknownAt.set(sessionId, Date.now());
    // Bounded: a service streaming for many dead sessions must not grow this
    // map without limit. The oldest entry is the one closest to being acted
    // on anyway, so dropping it costs at most one extra grace window.
    if (firstUnknownAt.size > 1_000) {
      firstUnknownAt.delete(firstUnknownAt.keys().next().value);
    }
    return false;
  }
  if (Date.now() - first < grace) return false;
  firstUnknownAt.delete(sessionId);
  return true;
};

/** A session that delivered is not unknown any more. */
const noteKnown = (sessionId) => {
  if (sessionId) firstUnknownAt.delete(sessionId);
};

/** Exposed for tests only. */
export const resetUnknownSessionGrace = () => firstUnknownAt.clear();

/** One inbound message. `io` is the socket.io server for fan-out. */
const handleMessage = async (ws, raw, io) => {
  let message;
  try {
    message = JSON.parse(raw);
  } catch {
    logger.warn("[XRAY] ws received a non-JSON frame; ignoring");
    return;
  }
  // A frame containing literal `null` parses to null, and `null.type` throws.
  // Same trap the translators hit in Phase 2.
  if (!message || typeof message !== "object") return;

  switch (message.type) {
    case "mask": {
      const outcome = await fanOutMask(message, io);
      if (outcome === "delivered") {
        noteKnown(message.session_id);
        return;
      }
      // The browser is gone, or we have no live session for this id. Either
      // way, do not keep accepting frames for it -- but an id we have simply
      // never seen before may be a session still being written down, so that
      // one case waits out the grace window first.
      if (!message.session_id) return;
      if (outcome === "no_session" && !unknownLongEnoughToClose(message.session_id)) return;
      askServiceToClose(ws, message.session_id, outcome);
      return;
    }

    case "state": {
      const outcome = await fanOutState(message, io);
      if (outcome === "delivered") {
        noteKnown(message.session_id);
        return;
      }
      // A state for an unknown session is worth closing; one whose browser is
      // merely absent is NOT - the tab may be reconnecting, and a `state`
      // message is cheap and must never be dropped (contract section 8).
      //
      // "Unknown" still gets the grace window: the FIRST state frame of every
      // session arrives while createSession is between the service's 200 and
      // its Mongo write, so acting on one sighting kills every new session on
      // a multi-process deployment.
      if (outcome === "no_session" && message.session_id
          && unknownLongEnoughToClose(message.session_id)) {
        askServiceToClose(ws, message.session_id, "no_session");
      }
      return;
    }

    case "pong":
      ws.xrayAlive = true;
      return;

    // Node is the pinger per §8, but answering an inbound ping costs nothing
    // and makes the connection work whichever side initiates.
    case "ping":
      send(ws, { type: "pong" });
      return;

    default:
      logger.warn(`[XRAY] ws received an unknown message type: ${String(message.type)}`);
  }
};

/**
 * Attach the X-ray WebSocket endpoint to an existing HTTP server.
 *
 * @param {import("http").Server} httpServer the server socket.io is already on
 * @param {{ getIO: () => object }} deps     socket.io accessor, injected so
 *                                           this module never imports socket.js
 * @returns {Promise<object|null>} the WebSocketServer, or null when disabled
 */
export const attachXrayWebSocket = async (httpServer, { getIO } = {}) => {
  // The flag gate. Returning here means `ws` is never imported, so a
  // deployment with X-ray off does not even need the dependency present.
  if (!isXrayEnabled()) return null;

  const problems = xrayConfigProblems();
  if (problems.length) {
    // Loud, and then carry on. The REST endpoints already refuse to call an
    // unconfigured service, and refusing to boot the whole backend over an
    // optional feature's missing key would be a worse failure than this one.
    logger.error(
      `[XRAY] enabled but not fully configured — ${problems.join("; ")}. ` +
        "The WebSocket will accept no connections until the secret is set.",
    );
  }

  const path = xrayWsPath();
  const { WebSocketServer } = await import("ws");
  wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 * 1024 });

  httpServer.on("upgrade", (request, socket, head) => {
    // Path check FIRST. Anything that is not ours is left completely untouched
    // so socket.io's own upgrade handler can have it.
    const requestPath = String(request.url || "").split("?")[0];
    if (requestPath !== path) return;

    const auth = verifyServiceToken(request);
    if (!auth.ok) {
      logger.error(`[XRAY] ws upgrade rejected: ${auth.reason}`);
      // Complete the handshake, then close with 4401 (contract §8). Closing
      // through the protocol rather than destroying the socket is what lets the
      // service distinguish "bad token" from "nothing listening" and stop
      // retrying a credential that will never work.
      wss.handleUpgrade(request, socket, head, (ws) => {
        ws.close(CLOSE_BAD_TOKEN, "unauthorized");
      });
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });

  wss.on("connection", (ws, request) => {
    ws.xrayAlive = true;
    connections.add(ws);
    logger.info(
      `[XRAY] X-ray service connected from ${request.socket?.remoteAddress || "?"} ` +
        `(${connections.size} connection${connections.size === 1 ? "" : "s"})`,
    );

    ws.on("message", (raw) => {
      let io;
      try {
        io = getIO?.();
      } catch {
        // socket.io not initialised — nothing to deliver to. Dropping is right:
        // a mask with no browser behind it has nowhere to go.
        return;
      }
      if (!io) return;
      handleMessage(ws, raw, io).catch((error) =>
        logger.error(`[XRAY] ws message handling failed: ${error?.message || error}`),
      );
    });

    ws.on("pong", () => {
      // Protocol-level pong, in case the service relies on frames rather than
      // the JSON {"type":"pong"} of §8. Both count as alive.
      ws.xrayAlive = true;
    });

    ws.on("close", (code, reason) => {
      connections.delete(ws);
      logger.info(
        `[XRAY] X-ray service disconnected (code ${code}${reason?.length ? `, ${reason}` : ""}); ` +
          `${connections.size} left`,
      );
      // The service reconnects with backoff and must be able to resume. Session
      // state lives in Mongo, so a dropped connection must NOT delete sessions
      // (plan Phase 4) — only the socket-id cache is cleared, and that is
      // re-read on demand.
      if (connections.size === 0) clearFanoutCache();
    });

    ws.on("error", (error) => logger.error(`[XRAY] ws error: ${error?.message || error}`));
  });

  // Liveness. Node is the pinger (§8): a connection that misses a round is
  // terminated so the service's reconnect logic takes over, rather than Node
  // holding a half-open socket and quietly receiving nothing.
  const pingMs = xrayWsPingSec() * 1000;
  pingTimer = setInterval(() => {
    for (const ws of connections) {
      if (!ws.xrayAlive) {
        logger.warn("[XRAY] terminating a WebSocket that missed its pong");
        ws.terminate();
        continue;
      }
      ws.xrayAlive = false;
      send(ws, { type: "ping" });
      try {
        ws.ping();
      } catch {
        /* a closing socket; the next round terminates it */
      }
    }
  }, pingMs);
  // Never hold the process open for a heartbeat.
  pingTimer.unref?.();

  // The reaper starts with the feature, not with the server: it only has work
  // to do when X-ray is on, and this is the one place already guarded by the
  // flag and reached exactly once at boot.
  const { startXrayReaper } = await import("./xray.reaper.js");
  await startXrayReaper({ getIO });

  logger.info(`[XRAY] WebSocket listening on the API port at ${path}`);
  logger.info(`[XRAY] config: ${JSON.stringify(xrayConfigSummary())}`);
  return wss;
};

/** Shut it down — used by tests and a graceful stop. */
export const detachXrayWebSocket = async () => {
  const { stopXrayReaper } = await import("./xray.reaper.js");
  stopXrayReaper();
  if (pingTimer) clearInterval(pingTimer);
  pingTimer = null;
  for (const ws of connections) {
    try {
      ws.terminate();
    } catch {
      /* already gone */
    }
  }
  connections.clear();
  clearFanoutCache();
  if (wss) {
    await new Promise((resolve) => wss.close(resolve));
    wss = null;
  }
};

export default { attachXrayWebSocket, detachXrayWebSocket, xrayWsStats };
