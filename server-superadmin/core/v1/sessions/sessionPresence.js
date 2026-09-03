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
