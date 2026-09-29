import { redis } from "../../../utils/database.js";
import logger from "../../../utils/logger.js";

// Read-side of the live session-presence tracking. The *writes* happen in the
// main `server` process (server/core/v2/sessions/sessionPresence.js) when a
// client_v2 tab connects/disconnects its Socket.IO — both servers share one
// Redis, so this server only needs to read the keys to know which of the
// sessions it lists are online right now.
//
// Keep the key prefix and TTL in sync with the main server's copy.

const PRESENCE_PREFIX = "presence:session:";
export const PRESENCE_TTL_SECONDS = 50;

const presenceKey = (sessionId) => `${PRESENCE_PREFIX}${String(sessionId || "").trim()}`;

// Given a list of sessionIds, return a Set of the ones that are online right now.
// Tolerant of Redis being unavailable (returns an empty Set — every session
// then reads offline rather than the request failing).
export const getOnlineSessionIds = async (sessionIds = []) => {
  const ids = [...new Set(sessionIds.map((id) => String(id || "").trim()).filter(Boolean))];
  if (!ids.length) return new Set();
  try {
    const values = await redis.mget(ids.map(presenceKey));
    const online = new Set();
    ids.forEach((id, index) => {
      if (values[index] != null) online.add(id);
    });
    return online;
  } catch (error) {
    logger.error(`[SESSION_PRESENCE] getOnlineSessionIds failed: ${error?.message || error}`);
    return new Set();
  }
};

// Cleanup must never interpret a Redis failure as "all sessions offline".
// Keep this separate from the dashboard's best-effort reader above.
export const getOnlineSessionIdsStrict = async (sessionIds = []) => {
  const ids = [...new Set(sessionIds.map((id) => String(id || "").trim()).filter(Boolean))];
  if (!ids.length) return new Set();
  if (redis.status !== "ready") throw new Error("Redis presence is unavailable");

  let timeout;
  try {
    const values = await Promise.race([
      redis.mget(ids.map(presenceKey)),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Redis presence lookup timed out")), 5_000);
      }),
    ]);
    if (!Array.isArray(values) || values.length !== ids.length) {
      throw new Error("Redis presence lookup returned an invalid result");
    }
    return new Set(ids.filter((_, index) => values[index] != null));
  } finally {
    clearTimeout(timeout);
  }
};
