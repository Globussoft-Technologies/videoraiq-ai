import logger from "../../../utils/logger.js";
import sessionModel from "./sessions.model.js";

const CHECK_INTERVAL_MS = 5_000;
const BATCH_SIZE = 200;

let running = false;
let timer;

const loggedOutFilter = () => ({ status: "logged_out" });

// Keep logged-out rows out of responses while database cleanup drains them.
export const withoutLoggedOut = (filter = {}) => ({
  $and: [filter, { $nor: [loggedOutFilter()] }],
});

export async function deleteLoggedOutSessions() {
  if (running) return;
  running = true;

  try {
    const sessions = await sessionModel
      .find(loggedOutFilter())
      .select("_id")
      .limit(BATCH_SIZE)
      .lean();

    if (!sessions.length) return;

    // Recheck status at deletion, in case a row changed after the read.
    // Automatic cleanup never touches blocked-device records.
    const result = await sessionModel.deleteMany({
      _id: { $in: sessions.map((session) => session._id) },
      ...loggedOutFilter(),
    });

    if (result.deletedCount) {
      logger.info(`[SESSION_AUTO_DELETE] deleted ${result.deletedCount} logged-out sessions`);
    }
  } catch (error) {
    logger.error(`[SESSION_AUTO_DELETE] cleanup failed: ${error?.message || error}`);
  } finally {
    running = false;
  }
}

export function startLoggedOutAutoDelete() {
  if (timer) return;

  // The first pass drains existing records; later passes catch new logouts.
  void deleteLoggedOutSessions();
  timer = setInterval(() => {
    void deleteLoggedOutSessions();
  }, CHECK_INTERVAL_MS);
  timer.unref?.();
}
