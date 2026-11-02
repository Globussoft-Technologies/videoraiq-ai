/**
 * Mask in, browser out. Contract §9.
 *
 * The X-ray service sends one JSON message per video frame over a single
 * WebSocket, multiplexed by `session_id`. This file decides which browser
 * connection each one belongs to and emits it on the socket.io connection the
 * frontend already has.
 *
 *   xray:mask   { sessionId, seq, offset, emittedAt, objects: [...] }
 *   xray:state  { sessionId, state, reason, framesBehindLive }
 *
 * Three rules, all from §9, all easy to get wrong:
 *
 *   1. ROUTE BY SESSION, NEVER BY USER. One person can have the same camera
 *      open in two tabs. `sendPayloadToUser` (socket.js:478) is unusable here:
 *      it keys on `socket:<user_id>` (one socket per user) and falls back to a
 *      GLOBAL BROADCAST on a miss, which would send one customer's masks to
 *      every connected client.
 *   2. TRANSLATE AT THIS BOUNDARY. The service speaks snake_case, the frontend
 *      speaks camelCase, and neither sees the other's convention. The
 *      translation lives in xray.translate.js, shared with the HTTP hop so the
 *      two cannot drift.
 *   3. IF THE BROWSER IS GONE, STOP THE SESSION. Masks for a closed tab are
 *      pure waste and the GPU slot behind them is scarce.
 *
 *
 * WHY THERE IS A CACHE
 *
 * Masks arrive at XRAY_MODEL_FPS (default 5/s) per session. Reading the session
 * record from Mongo for each one would be five indexed reads per second per
 * session purely to learn a socket id that almost never changes. The cache
 * turns that into one read per session per TTL window.
 *
 * It is deliberately small and short-lived: a map keyed by session id, entries
 * valid for CACHE_TTL_MS, dropped the moment a session ends. A stale entry
 * costs one wasted emit to a dead socket, which is then re-resolved — never a
 * mask delivered to the wrong person, because the socket id is read from a
 * record that was written under the owner's `userId`.
 */
import logger from "../../../utils/logger.js";
import { maskFromService, stateFromService } from "./xray.translate.js";
import { resolveSocketId } from "./xray.sockets.js";

/**
 * A socket id is re-read from Mongo at most this often per session. Short
 * enough that a browser reconnect is picked up within seconds, long enough that
 * a 5 fps mask stream costs one read every few hundred frames.
 */
const CACHE_TTL_MS = 10_000;

/**
 * A hold is only ever as long as one `POST /sessions` takes to finish writing
 * its record. Bounded so that a crash between the service's 200 and the Mongo
 * write cannot leave a session undeletable: once the hold lapses, the next
 * frame resolves against Mongo, finds nothing, and the session is closed.
 */
const HOLD_MAX_MS = 30_000;

/** sessionId -> { socketId, userId, clientSessionId, at } */
const cache = new Map();

/** Counters for whoever is watching. Plain numbers; no registry side effects. */
export const fanoutStats = {
  masksDelivered: 0,
  statesDelivered: 0,
  masksDropped: 0,
  sessionsAbandoned: 0,
};

/**
 * Claim a session for delivery BEFORE it has been written to Mongo.
 *
 * `createSession` cannot write the record until the service has answered with
 * a session id -- and by then the service's pump is already running, so its
 * first `state` frame can arrive here while the record does not exist yet.
 * Without this, that frame resolves to "no such live session" and Node asks
 * the service to close the session it is in the middle of opening. Proven
 * against the real Python service, which ends it 12 ms after the 200.
 *
 * The browser identity is already known at that point -- it came in on the
 * request -- so the entry is a complete delivery target, not a placeholder:
 * the early frame is DELIVERED rather than merely not-fatal, which matters
 * because §8 says a `state` message is never dropped.
 *
 * `socketId` comes from the caller, which resolves it before the GPU call for
 * exactly this reason: a hold carrying only a tab id would leave the first
 * frame depending on a second Redis lookup landing in time. The entry is
 * replaced by the Mongo-backed one at the next TTL expiry, and
 * `forgetSession` undoes it if the write fails.
 */
export const holdSession = (sessionId, { socketId = "", userId = "", clientSessionId = "" } = {}) => {
  if (!sessionId) return;
  cache.set(sessionId, { socketId, userId, clientSessionId, at: Date.now(), held: true });
};

export const forgetSession = (sessionId) => cache.delete(sessionId);

/** Exposed for tests; also called when the WS drops so nothing goes stale. */
export const clearFanoutCache = () => cache.clear();

/**
 * The session's delivery target, from the cache or from Mongo.
 *
 * Returns null when there is no such live session — which is the signal to tell
 * the service to stop sending.
 */
const targetFor = async (sessionId, { refresh = false } = {}) => {
  const hit = cache.get(sessionId);
  if (!refresh && hit && Date.now() - hit.at < CACHE_TTL_MS) return hit;

  // Imported lazily: this module is loaded by the WebSocket server, and the
  // model must not be compiled until X-ray is actually in use (see
  // xray.routes.js for why that matters).
  const { default: XraySession } = await import("./xray.model.js");

  const session = await XraySession.findOne({
    sessionId,
    state: { $in: ["preparing", "ready", "tracking", "lost"] },
  })
    .select("socketId userId clientSessionId")
    .lean();

  if (!session) {
    // A held entry means createSession is still mid-flight: the service has
    // answered but the record is not written yet. Keep the hold -- deleting it
    // here would re-open the race it exists to close -- and let the caller
    // treat the session as live-but-unsocketed rather than gone.
    if (hit?.held && Date.now() - hit.at < HOLD_MAX_MS) return hit;
    cache.delete(sessionId);
    return null;
  }

  const entry = {
    socketId: session.socketId || "",
    userId: session.userId || "",
    clientSessionId: session.clientSessionId || "",
    at: Date.now(),
  };
  cache.set(sessionId, entry);
  return entry;
};

/**
 * Resolve the socket for a session, re-reading the record and Redis once if the
 * cached socket has gone away (a reconnect, a second tab).
 *
 * @returns {{ socket: object|null, target: object|null }}
 */
const resolveTarget = async (sessionId, io) => {
  let target = await targetFor(sessionId);
  if (!target) return { socket: null, target: null };

  let socket = target.socketId ? io.sockets.sockets.get(target.socketId) || null : null;
  if (socket) return { socket, target };

  // The recorded socket is gone. The browser may simply have reconnected with a
  // new socket id, so ask Redis again before giving up on the session.
  const fresh = await resolveSocketId({
    clientSessionId: target.clientSessionId,
    userId: target.userId,
  });
  if (fresh && fresh !== target.socketId) {
    socket = io.sockets.sockets.get(fresh) || null;
    if (socket) {
      target = { ...target, socketId: fresh, at: Date.now() };
      cache.set(sessionId, target);
      return { socket, target };
    }
  }

  return { socket: null, target };
};

/**
 * Deliver one translated event to one session's browser.
 *
 * @returns {"delivered" | "no_session" | "no_socket"}
 */
const deliver = async (sessionId, event, payload, io) => {
  const { socket } = await resolveTarget(sessionId, io);
  if (!socket) {
    const target = cache.get(sessionId);
    return target ? "no_socket" : "no_session";
  }
  socket.emit(event, payload);
  return "delivered";
};

/**
 * A `mask` message from the service (contract §8) -> `xray:mask` (§9).
 *
 * @returns {"delivered"|"no_session"|"no_socket"}
 */
export const fanOutMask = async (message, io) => {
  const payload = maskFromService(message);
  if (!payload.sessionId) {
    fanoutStats.masksDropped += 1;
    logger.warn("[XRAY] dropped a mask with no session_id");
    return "no_session";
  }

  const outcome = await deliver(payload.sessionId, "xray:mask", payload, io);
  if (outcome === "delivered") fanoutStats.masksDelivered += 1;
  else fanoutStats.masksDropped += 1;
  return outcome;
};

/**
 * A `state` message (contract §8) -> `xray:state` (§9).
 *
 * Node's own copy of the state is updated too, so the reaper and a later
 * `GET /sessions/:id` agree with what the browser was told. A terminal state
 * also drops the cache entry: the session is over and nothing more should be
 * delivered for it.
 *
 * State messages are NEVER dropped for backpressure reasons (§8). A lost mask
 * is one stale outline; a lost `ended` leaves the UI waiting forever.
 */
export const fanOutState = async (message, io) => {
  const payload = stateFromService(message);
  if (!payload.sessionId) {
    logger.warn("[XRAY] dropped a state message with no session_id");
    return "no_session";
  }

  const terminal = payload.state === "ended";

  // RESOLVE THE TARGET BEFORE TOUCHING THE RECORD.
  //
  // The order matters and the obvious order is wrong. `targetFor` only matches
  // sessions in a LIVE state, so writing `state: "ended"` first removes the
  // session from its own lookup — and the browser then never learns the
  // session is over, which is precisely the failure the "never drop a state
  // message" rule (§8) exists to prevent. Caught by
  // tests/integration/xray.ws.test.js, which waits for the terminal event.
  const { socket, target } = await resolveTarget(payload.sessionId, io);

  if (payload.state) {
    const { default: XraySession } = await import("./xray.model.js");
    await XraySession.updateOne(
      { sessionId: payload.sessionId },
      {
        $set: {
          state: payload.state,
          ...(terminal
            ? { endReason: payload.reason || "internal_error", endedAt: new Date() }
            : {}),
        },
      },
    ).catch((error) =>
      logger.error(
        `[XRAY] could not record state ${payload.state} on ${payload.sessionId}: ` +
          `${error?.message || error}`,
      ),
    );
  }

  let outcome = "no_session";
  if (socket) {
    socket.emit("xray:state", payload);
    fanoutStats.statesDelivered += 1;
    outcome = "delivered";
  } else if (target) {
    outcome = "no_socket";
  }

  if (terminal) forgetSession(payload.sessionId);
  return outcome;
};

/**
 * Tell a session's browser that Node ended it. Contract §10.
 *
 * "Service unreachable ⇒ sessions marked ended/internal_error and the frontend
 *  told, not left spinning."
 *
 * Used by the reaper, which ends sessions for reasons the service never reports
 * — an idle timeout, a Node restart, a close that kept failing. Without this
 * the record says `ended` and the browser knows nothing, so the user keeps
 * looking at a frozen outline with no explanation.
 *
 * The cache entry is read BEFORE the caller marks the record terminal, which is
 * why `getIO` is passed as an accessor rather than this reading Mongo again:
 * the session may already be out of the live set by the time this runs.
 *
 * Best-effort by design. The browser is usually gone — that is typically why
 * the session is being reaped — and a failed notification must never stop a GPU
 * slot being released.
 */
export const announceEnded = async (sessionId, reason, getIO) => {
  let io;
  try {
    io = getIO?.();
  } catch {
    return false;
  }
  if (!io) return false;

  const { socket } = await resolveTarget(sessionId, io);
  if (!socket) return false;

  socket.emit("xray:state", {
    sessionId,
    state: "ended",
    reason: reason || "internal_error",
    framesBehindLive: 0,
  });
  fanoutStats.statesDelivered += 1;
  return true;
};

/**
 * Every live session owned by a socket that has just disconnected.
 *
 * Used by the socket.js disconnect handler: a closed tab must not leave a GPU
 * slot held, and the browser is the only side that knows it left.
 */
export const liveSessionsForSocket = async (socketId) => {
  if (!socketId) return [];
  const { default: XraySession } = await import("./xray.model.js");
  return XraySession.find({
    socketId,
    state: { $in: ["preparing", "ready", "tracking", "lost"] },
  })
    .select("sessionId userId")
    .lean();
};

export default {
  fanOutMask,
  fanOutState,
  announceEnded,
  forgetSession,
  clearFanoutCache,
  liveSessionsForSocket,
  fanoutStats,
};
