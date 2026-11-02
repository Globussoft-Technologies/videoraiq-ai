/**
 * Which browser connection should this session's masks go to?
 *
 * Contract §9: "Node fans out by `session_id -> socket id` (not by `user_id`,
 * which is not tab-granular)."
 *
 * That requirement is sharper than it first reads. One person can have the same
 * camera open in two tabs, and both tabs are the same `user_id`. Deliver by
 * user and the wrong tab draws the mask; deliver by user and BOTH tabs draw it,
 * each overlaying the other's object.
 *
 *
 * THE TAB-GRANULAR PATH ALREADY EXISTS — Phase 0 answer 5
 *
 * Nothing new had to be invented and no contract change was needed:
 *
 *   1. the browser sends its own tab id as the `x-session-id` header on every
 *      HTTP request (client_v2/src/utils/sessionIdentity.js:89-97, consumed by
 *      core/v2/sessions/sessions.service.js:292);
 *   2. the same id rides on the socket.io handshake, and socket.js:393 maps it
 *      to that socket's id in Redis as `socket:session:<id>`;
 *   3. so an X-ray session created by a request carrying that header can record
 *      exactly which socket to deliver to.
 *
 * `sendPayloadToUser` (socket.js:478) must NOT be used for X-ray: it is built
 * on `socket:<user_id>`, which holds one socket per user — the second tab
 * overwrites the first — and it falls back to a GLOBAL BROADCAST when the
 * lookup misses, which would send one customer's masks to every connected
 * client.
 */
import { redis } from "../../../utils/database.js";
import logger from "../../../utils/logger.js";

/** Redis key socket.js writes on connect (socket.js:393). */
export const tabSocketKey = (clientSessionId) => `socket:session:${clientSessionId}`;

/** Redis key socket.js writes on connect (socket.js:385) — one per USER. */
export const userSocketKey = (userId) => `socket:${userId}`;

/**
 * How long to wait for Redis before giving up on the socket lookup.
 *
 * THIS BOUND IS NOT A TIDINESS MEASURE — without it, session creation hangs
 * forever whenever Redis is down.
 *
 * ioredis keeps an offline queue (`enableOfflineQueue` defaults to true): while
 * the client is disconnected it ACCEPTS commands and holds them until it
 * reconnects. The returned promise neither resolves nor rejects, so a
 * `try/catch` around `redis.get` catches nothing and `await` never returns.
 * Found by running the real relay with no Redis: `POST /sessions` hung until
 * curl timed out, with no error logged anywhere.
 *
 * 500 ms is generous for a local Redis GET and short enough that a user never
 * notices. Losing the lookup costs live mask delivery for that session, which
 * Phase 4 re-resolves at delivery time anyway; losing the request costs the
 * session entirely.
 */
const LOOKUP_TIMEOUT_MS = 500;

/** Resolve to `null` rather than hang, whatever Redis is doing. */
const withTimeout = async (promise, label) => {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => {
        timer = setTimeout(() => {
          logger.warn(`[XRAY] ${label} timed out after ${LOOKUP_TIMEOUT_MS}ms — is Redis up?`);
          resolve(null);
        }, LOOKUP_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};

/**
 * The socket id to deliver this session's masks to, or "" if none can be found.
 *
 * Tab-granular when the browser sent `x-session-id`; per-user otherwise.
 *
 * The fallback is deliberate and safe to degrade to, because the contract makes
 * the frontend responsible for ignoring an event whose `sessionId` is not its
 * own (§9: "a stale event after a fast close is normal, not an error"). So the
 * worst case is a second tab receiving a mask it discards — not a wrong mask
 * drawn, and never a broadcast.
 *
 * Returning "" is not an error either. A session can legitimately be created
 * before the socket connects, and Phase 4 re-resolves at delivery time; the
 * stored value is a best-effort starting point, not a promise.
 */
export const resolveSocketId = async ({ clientSessionId, userId } = {}) => {
  try {
    if (clientSessionId) {
      const byTab = await withTimeout(
        redis.get(tabSocketKey(clientSessionId)),
        `socket lookup for tab ${clientSessionId}`,
      );
      if (byTab) return String(byTab);
    }

    if (userId) {
      const byUser = await withTimeout(
        redis.get(userSocketKey(userId)),
        `socket lookup for user ${userId}`,
      );
      if (byUser) return String(byUser);
    }

    return "";
  } catch (error) {
    // Redis being down must not stop a session from being created. The session
    // is still recorded, still reaped, and still closable; only live mask
    // delivery is affected, and Phase 4 re-resolves anyway.
    logger.error(`[XRAY] socket lookup failed (continuing without one): ${error?.message || error}`);
    return "";
  }
};

export default { resolveSocketId, tabSocketKey, userSocketKey };
