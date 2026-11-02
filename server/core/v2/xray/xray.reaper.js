/**
 * Closing sessions nobody is watching. Contract §10.
 *
 * "Both ends reap. Node closes on socket disconnect; the service closes on
 *  missing heartbeats. Default to closing: a wrongly-closed session costs one
 *  re-click, a leaked one costs a GPU slot forever."
 *
 * That asymmetry is the whole design rationale. Every X-ray session holds a
 * slot on a machine with a finite number of them, and the two ways a session is
 * abandoned are both silent: a browser tab closes, or a browser stops sending
 * heartbeats without ever closing anything. Neither produces a DELETE.
 *
 * Three triggers, all here:
 *
 *   1. SOCKET DISCONNECT — the fast path. The tab is gone and we know it
 *      immediately. Called from socket.js's disconnect handler.
 *   2. STALE HEARTBEAT — the sweep. The tab is gone and nobody told us: the
 *      socket never disconnected cleanly, or the session was created before a
 *      socket existed. Runs every XRAY_REAP_INTERVAL_SEC.
 *   3. STARTUP — Node restarted. Every session in Mongo now has, by
 *      definition, no live socket in this process, and nothing else will ever
 *      close it.
 *
 * Phase 4 wires trigger 1. Triggers 2 and 3 are Phase 5's exit gate; they are
 * written here now because all three are the same operation differing only in
 * how they select rows, and splitting them across phases would mean writing the
 * closing logic twice.
 */
import logger from "../../../utils/logger.js";
import {
  isXrayEnabled,
  xrayCloseMaxAttempts,
  xrayIdleTimeoutSec,
  xrayReapIntervalSec,
} from "./xray.config.js";
import client from "./xray.client.js";
import { forgetSession, announceEnded } from "./xray.fanout.js";

/** Contract §7's non-terminal states. */
const LIVE_STATES = ["preparing", "ready", "tracking", "lost"];

let sweepTimer = null;
/** socket.io accessor, injected by startXrayReaper so this file imports no socket code. */
let ioAccessor = null;

export const reaperStats = {
  closedOnDisconnect: 0,
  closedOnIdle: 0,
  closedOnStartup: 0,
  abandoned: 0,
  failures: 0,
};

/**
 * Mark a session terminal and tell the browser.
 *
 * The telling is the part that was missing until Phase 5. Marking the record
 * ended satisfies Node's own bookkeeping, but the browser learns nothing — so a
 * user whose session was reaped sat looking at a frozen outline with no
 * explanation. Contract §10 is explicit that the frontend must be told rather
 * than left spinning, and §7 gives the reason vocabulary to tell it with.
 */
const endSession = async (sessionId, reason) => {
  // TELL THE BROWSER FIRST, THEN MARK THE RECORD.
  //
  // The same ordering trap as fanOutState: the delivery lookup only matches
  // sessions in a LIVE state, so writing `state: "ended"` first removes the
  // session from its own lookup and the notification silently finds nothing —
  // leaving the browser exactly as stranded as before Phase 5.
  //
  // Announcing first is safe in the other direction too: if the write then
  // fails, the record stays live, the next sweep retries, and the browser gets
  // a second `ended` event — which the frontend already has to tolerate, since
  // §9 makes it ignore events for a session it is no longer showing.
  //
  // Best-effort: a browser that cannot be reached is the COMMON case here (it
  // is usually why the session is being reaped), and a failed notification must
  // never stop the slot being released.
  await announceEnded(sessionId, reason, ioAccessor).catch(() => {});

  const { default: XraySession } = await import("./xray.model.js");
  await XraySession.updateOne(
    { sessionId },
    { $set: { state: "ended", endReason: reason, endedAt: new Date() } },
  ).catch((error) =>
    logger.error(`[XRAY] reaper could not mark ${sessionId} ended: ${error?.message || error}`),
  );

  forgetSession(sessionId);
};

/**
 * Close one session: tell the service, then mark the record ended.
 *
 * The service is told FIRST. If that fails the record is left live on purpose,
 * so the next sweep tries again — marking it ended would make Node forget a
 * slot the GPU is still holding, which is the exact leak this file exists to
 * prevent.
 *
 * But retrying forever is not a terminal state either. If the service is simply
 * gone, an unbounded retry leaves the session live and the browser waiting with
 * no masks and no error. So failures are counted, and once the budget is spent
 * the session is written off as `ended/internal_error` and the browser is told.
 * The slot is leaked at that point — but it was already leaked; what changes is
 * that Node stops pretending otherwise and the user finds out.
 *
 * `reason` must be one of contract §7's end reasons.
 */
const closeOne = async (sessionId, reason) => {
  const result = await client.closeSession(sessionId);
  if (result.ok) {
    await endSession(sessionId, reason);
    return true;
  }

  reaperStats.failures += 1;

  const { default: XraySession } = await import("./xray.model.js");
  const updated = await XraySession.findOneAndUpdate(
    { sessionId },
    { $inc: { closeAttempts: 1 } },
    { new: true, projection: { closeAttempts: 1 } },
  )
    .lean()
    .catch(() => null);

  const attempts = updated?.closeAttempts ?? 0;
  const budget = xrayCloseMaxAttempts();

  if (attempts >= budget) {
    reaperStats.abandoned += 1;
    logger.error(
      `[XRAY] giving up on ${sessionId} after ${attempts} failed close attempts ` +
        `(last: ${result.code}). Marking it ended/internal_error and telling the browser. ` +
        "If the X-ray service is alive, its own idle reaper will release the slot.",
    );
    await endSession(sessionId, "internal_error");
    return false;
  }

  logger.error(
    `[XRAY] reaper could not close ${sessionId} (${result.code}); ` +
      `attempt ${attempts}/${budget}, leaving it live to retry`,
  );
  return false;
};

/**
 * Trigger 1 — a browser socket disconnected. Close everything it owned.
 *
 * Called from socket.js on every disconnect, so it must be cheap when there is
 * nothing to do: one indexed query on `{ socketId, state }` and an early return.
 */
export const closeXraySessionsForSocket = async (socketId) => {
  if (!socketId) return 0;

  const { default: XraySession } = await import("./xray.model.js");
  const sessions = await XraySession.find({ socketId, state: { $in: LIVE_STATES } })
    .select("sessionId")
    .lean();
  if (!sessions.length) return 0;

  logger.info(
    `[XRAY] socket ${socketId} disconnected holding ${sessions.length} ` +
      `session${sessions.length === 1 ? "" : "s"}; closing`,
  );

  let closed = 0;
  for (const session of sessions) {
    if (await closeOne(session.sessionId, "closed_by_user")) closed += 1;
  }
  reaperStats.closedOnDisconnect += closed;
  return closed;
};

/**
 * Trigger 2 — sessions whose heartbeat has gone stale.
 *
 * The frontend heartbeats every 10 s and the default timeout is 45 s, so a
 * session is only reaped after four or five missed beats. That margin is what
 * stops a brief network hiccup costing the user their session.
 */
export const reapIdleXraySessions = async () => {
  const cutoff = new Date(Date.now() - xrayIdleTimeoutSec() * 1000);

  const { default: XraySession } = await import("./xray.model.js");
  const stale = await XraySession.find({
    state: { $in: LIVE_STATES },
    lastHeartbeatAt: { $lt: cutoff },
  })
    .select("sessionId lastHeartbeatAt")
    .lean();
  if (!stale.length) return 0;

  let closed = 0;
  for (const session of stale) {
    const silentFor = Math.round((Date.now() - new Date(session.lastHeartbeatAt).getTime()) / 1000);
    logger.info(`[XRAY] session ${session.sessionId} silent for ${silentFor}s; reaping`);
    if (await closeOne(session.sessionId, "idle_timeout")) closed += 1;
  }
  reaperStats.closedOnIdle += closed;
  return closed;
};

/**
 * Trigger 3 — Node has just restarted.
 *
 * Every live record predates this process, so none of them has a socket in it.
 * Without this, a restart orphans GPU state on the other box permanently: the
 * service would eventually reap on heartbeats, but only if it is the version
 * that does, and only after its own timeout — and a session this process will
 * never serve should not wait for that.
 */
export const sweepXraySessionsOnStartup = async () => {
  const { default: XraySession } = await import("./xray.model.js");
  const orphans = await XraySession.find({ state: { $in: LIVE_STATES } })
    .select("sessionId")
    .lean();
  if (!orphans.length) return 0;

  logger.info(
    `[XRAY] startup: ${orphans.length} session${orphans.length === 1 ? "" : "s"} ` +
      "left over from a previous process; closing",
  );

  let closed = 0;
  for (const session of orphans) {
    if (await closeOne(session.sessionId, "session_expired")) closed += 1;
  }
  reaperStats.closedOnStartup += closed;
  return closed;
};

/**
 * Start the periodic sweep, and do the startup pass once.
 *
 * Returns a stop function. Both are no-ops when the flag is off.
 */
export const startXrayReaper = async ({ getIO } = {}) => {
  if (!isXrayEnabled()) return () => {};
  // Stored even if the timer is already running, so a second call can supply
  // the accessor a first call lacked.
  if (getIO) ioAccessor = getIO;
  if (sweepTimer) return () => stopXrayReaper();

  // Fire-and-forget: a failed startup sweep must not stop the server, and the
  // periodic sweep will pick up whatever it missed.
  sweepXraySessionsOnStartup().catch((error) =>
    logger.error(`[XRAY] startup sweep failed: ${error?.message || error}`),
  );

  const intervalMs = xrayReapIntervalSec() * 1000;
  sweepTimer = setInterval(() => {
    reapIdleXraySessions().catch((error) =>
      logger.error(`[XRAY] idle sweep failed: ${error?.message || error}`),
    );
  }, intervalMs);
  // Never hold the process open for a sweep.
  sweepTimer.unref?.();

  logger.info(
    `[XRAY] reaper running: idle timeout ${xrayIdleTimeoutSec()}s, ` +
      `sweeping every ${xrayReapIntervalSec()}s`,
  );
  return () => stopXrayReaper();
};

export const stopXrayReaper = () => {
  if (sweepTimer) clearInterval(sweepTimer);
  sweepTimer = null;
};

/**
 * Supply the socket.io accessor WITHOUT starting the sweep.
 *
 * `startXrayReaper` also fires the startup sweep, which closes every live
 * session it finds — right at boot, but not something a caller who only wants
 * notifications to work should trigger.
 *
 * Tests need exactly that separation, and finding out why was instructive: a
 * first version of the reaper test called `startXrayReaper` in `beforeEach`,
 * and its fire-and-forget startup sweep raced the test bodies — closing seeded
 * sessions underneath them and producing an intermittent failure that passed on
 * re-run. A background sweep is not something a caller should get by accident.
 */
export const setXrayReaperIo = (getIO) => {
  if (getIO) ioAccessor = getIO;
};

export default {
  closeXraySessionsForSocket,
  reapIdleXraySessions,
  sweepXraySessionsOnStartup,
  startXrayReaper,
  stopXrayReaper,
  setXrayReaperIo,
  reaperStats,
};
