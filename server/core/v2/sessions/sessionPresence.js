import { redis } from "../../../utils/database.js";
import logger from "../../../utils/logger.js";

// Live "is this session's browser tab open right now" tracking, backed by Redis
// so both this server and server-superadmin (which share one Redis) can read it.
//
// Why Redis + TTL rather than the session's status/lastActiveAt:
//   - `status` only moves on an explicit logout/block — closing a tab never
//     touches it, so an abandoned tab reads "active" forever.
//   - `lastActiveAt` is bumped by any authed REST call and by the 15s auth poll,
//     so it lags real presence by up to ~45s and can't distinguish "tab open,
//     idle" from "tab closed 30s ago".
// A Socket.IO connection, on the other hand, drops within a second or two of the
// tab closing (transport close). We mark the session online on connect + on each
// heartbeat with a short TTL, and delete the key on disconnect. The TTL is the
// safety net for a hard crash / lost network where `disconnect` never fires.

const PRESENCE_PREFIX = "presence:session:";
// Must comfortably exceed the client heartbeat interval (20s) so a single
// dropped heartbeat doesn't flap the session offline.
export const PRESENCE_TTL_SECONDS = 50;

const presenceKey = (sessionId) => `${PRESENCE_PREFIX}${String(sessionId || "").trim()}`;

// Mark a session's tab as currently connected. Called on socket connect and on
// every heartbeat. Fire-and-forget — presence is best-effort, never block auth.
export const markSessionOnline = async (sessionId) => {
  const id = String(sessionId || "").trim();
  if (!id) return;
  try {
    await redis.set(presenceKey(id), Date.now().toString(), "EX", PRESENCE_TTL_SECONDS);
  } catch (error) {
    logger.error(`[SESSION_PRESENCE] markSessionOnline failed for ${id}: ${error?.message || error}`);
  }
};

// Clear a session's presence immediately (tab closed / socket disconnected).
export const markSessionOffline = async (sessionId) => {
  const id = String(sessionId || "").trim();
  if (!id) return;
  try {
    await redis.del(presenceKey(id));
  } catch (error) {
    logger.error(`[SESSION_PRESENCE] markSessionOffline failed for ${id}: ${error?.message || error}`);
  }
};

// Given a list of sessionIds, return a Set of the ones that are online right now.
// One MGET, tolerant of Redis being unavailable (returns an empty Set — every
// session then reads offline rather than the request failing).
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
