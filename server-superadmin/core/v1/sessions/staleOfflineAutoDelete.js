import logger from "../../../utils/logger.js";
import sessionModel from "./sessions.model.js";
import { getOnlineSessionIdsStrict } from "./sessionPresence.js";

const OFFLINE_RETENTION_MS = 7 * 24 * 60 * 60 * 1_000;
const CHECK_INTERVAL_MS = 5 * 60 * 1_000;
const BATCH_SIZE = 200;

let running = false;
let timer;

async function deleteOfflineBatch(sessions, cutoff) {
  const candidates = sessions
    .map((session) => ({ ...session, presenceId: String(session.sessionId || "").trim() }))
    .filter((session) => session.presenceId);
  if (!candidates.length) return 0;

  const onlineIds = await getOnlineSessionIdsStrict(candidates.map((session) => session.presenceId));
  const offline = candidates.filter((session) => !onlineIds.has(session.presenceId));
  if (!offline.length) return 0;

  // A tab may have reconnected while the batch was being checked.
  const reconnectedIds = await getOnlineSessionIdsStrict(offline.map((session) => session.presenceId));
  const ids = offline
    .filter((session) => !reconnectedIds.has(session.presenceId))
    .map((session) => session._id);
  if (!ids.length) return 0;

  // A heartbeat or request that updated lastActiveAt after the read prevents
  // deletion, as does a status change such as an explicit logout or block.
  const result = await sessionModel.deleteMany({
    _id: { $in: ids },
    status: "active",
    lastActiveAt: { $lte: cutoff },
  });
  return result.deletedCount || 0;
}

export async function deleteStaleOfflineSessions() {
  if (running) return 0;
  running = true;
  const cutoff = new Date(Date.now() - OFFLINE_RETENTION_MS);
  let cursor;
  let deletedCount = 0;

  try {
    cursor = sessionModel
      .find({ status: "active", lastActiveAt: { $lte: cutoff } })
      .select("_id sessionId lastActiveAt")
      .sort({ lastActiveAt: 1, _id: 1 })
      .lean()
      .cursor({ batchSize: BATCH_SIZE });

    let batch = [];
    for await (const session of cursor) {
      batch.push(session);
      if (batch.length === BATCH_SIZE) {
        deletedCount += await deleteOfflineBatch(batch, cutoff);
        batch = [];
      }
    }
    if (batch.length) deletedCount += await deleteOfflineBatch(batch, cutoff);

    if (deletedCount) logger.info(`[SESSION_AUTO_DELETE] deleted ${deletedCount} stale active offline sessions`);
  } catch (error) {
    logger.error(`[SESSION_AUTO_DELETE] stale offline cleanup failed: ${error?.message || error}`);
  } finally {
    try {
      await cursor?.close?.();
    } catch (error) {
      logger.error(`[SESSION_AUTO_DELETE] stale offline cursor close failed: ${error?.message || error}`);
    }
    running = false;
  }

  return deletedCount;
}

export function startStaleOfflineAutoDelete() {
  if (timer) return;
  void deleteStaleOfflineSessions();
  timer = setInterval(() => {
    void deleteStaleOfflineSessions();
  }, CHECK_INTERVAL_MS);
  timer.unref?.();
}
