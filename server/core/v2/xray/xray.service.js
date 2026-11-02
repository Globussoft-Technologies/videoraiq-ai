/**
 * X-Ray service layer — the relay's logic, and the only file that talks to
 * Mongo. No `req`, no `res`: it takes plain arguments and returns the
 * `xrayOk` / `xrayFail` shapes from xray.errors.js.
 *
 * It owns no video, no GPU and no detection logic. Outbound HTTP belongs to
 * xray.client.js, authorisation to xray.camera.js, licensing to
 * xray.license.js; this file sequences them and keeps the records straight.
 *
 *
 * THE ORDER OF CHECKS IN createSession IS NOT ARBITRARY
 *
 *   1. authorise  — cheapest, and the only one that must never be skipped
 *   2. licence    — one indexed read
 *   3. resolve    — can cost a round trip to the streaming server in cloud mode
 *   4. the GPU    — up to 15 seconds, and the only step that consumes a scarce
 *                   resource
 *
 * Each step is more expensive than the last, and every step before the GPU is
 * free. Asking the GPU first and authorising afterwards would let an
 * unauthorised caller occupy a session slot for the duration of the check.
 *
 *
 * WHY EVERY LOOKUP IS SCOPED BY OWNER
 *
 * A `sessionId` arrives from the client and is therefore untrusted. Every
 * method that takes one looks it up with the owner's `userId` in the query
 * rather than fetching by id and comparing afterwards — a comparison is
 * something you can forget to write, a query scope is not.
 */
import logger from "../../../utils/logger.js";
import { XRAY_ERRORS, xrayFail, xrayOk } from "./xray.errors.js";
import XraySession from "./xray.model.js";
import client from "./xray.client.js";
import { findAuthorisedCamera, resolveStreamUrl } from "./xray.camera.js";
import { assertXrayLicensed } from "./xray.license.js";
import { resolveSocketId } from "./xray.sockets.js";
import { holdSession, forgetSession } from "./xray.fanout.js";

/** Live states — anything not yet terminal (contract §7). */
const LIVE_STATES = ["preparing", "ready", "tracking", "lost"];

/**
 * Find a session this actor owns.
 *
 * `userId` is in the QUERY, not checked after the fact. A session belonging to
 * another tenant is indistinguishable from one that does not exist, which is
 * the same 404-not-403 reasoning as xray.camera.js.
 */
const ownedSession = (actor, sessionId, { liveOnly = false } = {}) =>
  XraySession.findOne({
    sessionId,
    userId: actor.userId,
    ...(liveOnly ? { state: { $in: LIVE_STATES } } : {}),
  });

class XrayService {
  /**
   * POST /sessions — contract §5.
   *
   * A 200 from here is a promise that frames are flowing: the Python service
   * attaches the shared-memory ring and waits for a real decoded frame before
   * answering (contract §4), so the frontend can enable clicking immediately
   * with nothing to poll and no retry loop.
   *
   * @param {object} actor    { adminId, userId, memberId }
   * @param {object} body     { cameraId, nvrId } — already validated
   * @param {object} browser  { clientSessionId } — the tab's x-session-id
   */
  async createSession(actor, body, browser = {}) {
    const { cameraId, nvrId } = body;

    if (!actor.userId) {
      // A token with no tenant key cannot own anything. Better to say so than
      // to run a query that would match every ownerless record.
      logger.error("[XRAY] createSession: token carried no user_id");
      return xrayFail(403, XRAY_ERRORS.FORBIDDEN, "This account cannot use X-ray mode", false);
    }

    // --- 1. authorise -----------------------------------------------------
    const camera = await findAuthorisedCamera(actor, cameraId, nvrId);
    if (!camera) {
      return xrayFail(404, XRAY_ERRORS.CAMERA_NOT_FOUND, undefined, false);
    }

    // --- 2. licence -------------------------------------------------------
    const licence = await assertXrayLicensed(actor);
    if (!licence.ok) {
      return xrayFail(403, XRAY_ERRORS.NOT_LICENSED, undefined, false);
    }

    // --- 3. resolve the camera to a playlist URL --------------------------
    const resolved = await resolveStreamUrl(camera);
    if (resolved.error === "wrong_rendition") {
      // Contract §13.2 tripwire. Loud on purpose: a non-main rendition makes
      // every frame lookup resolve to the wrong moment, silently, so the
      // session would appear to work while tracking the wrong thing.
      logger.error(
        `[XRAY] camera ${cameraId} resolved to a NON-MAIN rendition (${resolved.detail}). ` +
          "Refusing: segment numbers are only meaningful within one rendition, so this " +
          "session would track the wrong moment with no error to notice.",
      );
      return xrayFail(500, XRAY_ERRORS.WRONG_RENDITION, undefined, false);
    }
    if (resolved.error) {
      logger.error(`[XRAY] camera ${cameraId} has no usable stream URL: ${resolved.detail}`);
      return xrayFail(503, XRAY_ERRORS.STREAM_URL_UNRESOLVED, undefined, true);
    }

    // Resolve the browser's socket BEFORE the GPU call, not after. The hold
    // below has to be a complete delivery target the moment the service
    // answers -- the service's first `state` frame arrives within
    // milliseconds -- and a hold carrying only a tab id would make that frame
    // depend on a second Redis lookup landing in time. One Redis read either
    // way; this just puts it on the right side of the race.
    const socketId = await resolveSocketId({
      clientSessionId: browser.clientSessionId,
      userId: actor.userId,
    });

    // --- 4. ask the GPU box ----------------------------------------------
    const created = await client.createSession({
      cameraId: String(cameraId),
      nvrId: String(nvrId),
      adminId: String(actor.adminId || ""),
      userId: String(actor.userId),
      streamUrl: resolved.url,
    });
    if (!created.ok) return created; // service error codes pass straight through

    const session = created.data;
    if (!session.sessionId) {
      logger.error("[XRAY] the X-ray service returned 200 with no session_id");
      return xrayFail(502, XRAY_ERRORS.INTERNAL_ERROR, undefined, false);
    }

    // The service's pump is ALREADY RUNNING -- it started before this 200 came
    // back -- so its first `state` frame can arrive over the WebSocket before
    // the record below exists. Claim the session for delivery now, with the
    // browser identity this request already carries, so that frame is routed
    // instead of being read as "no such session" and answered with a
    // close_session for the session we are still opening. Measured against the
    // real Python service: it ended 12 ms after this line.
    holdSession(session.sessionId, {
      socketId,
      userId: String(actor.userId),
      clientSessionId: browser.clientSessionId || "",
    });

    // --- 5. write it down BEFORE replying --------------------------------
    // Each session holds a GPU slot on another machine. If this record does
    // not exist, nothing can ever close it: a Node restart would forget the
    // session and strand the slot with no id left to DELETE. Persisting before
    // the response means a crash between here and the reply leaves a reapable
    // record, not an orphan.
    try {
      await XraySession.create({
        sessionId: session.sessionId,
        adminId: String(actor.adminId || ""),
        userId: String(actor.userId),
        memberId: actor.memberId || null,
        cameraId: String(cameraId),
        nvrId: String(nvrId),
        socketId,
        clientSessionId: browser.clientSessionId || "",
        state: "ready", // frames are flowing — that is what the 200 means
        width: session.width,
        height: session.height,
        frameRate: session.frameRate,
        lostAfterFrames: session.lostAfterFrames,
        maxObjects: session.maxObjects,
        lastHeartbeatAt: new Date(),
      });
    } catch (error) {
      // The GPU session exists but we cannot record it, so we cannot reap it.
      // Close it immediately rather than leak the slot, and report failure —
      // telling the frontend it succeeded would hand it a session id Node does
      // not know about.
      logger.error(
        `[XRAY] failed to persist session ${session.sessionId}, closing it to avoid a leak: ` +
          `${error?.message || error}`,
      );
      forgetSession(session.sessionId);
      await client.closeSession(session.sessionId);
      return xrayFail(500, XRAY_ERRORS.INTERNAL_ERROR, undefined, false);
    }

    logger.info(
      `[XRAY] session ${session.sessionId} open on camera ${cameraId} ` +
        `(${session.width}x${session.height} @ ${session.frameRate}fps, socket ${socketId || "none"})`,
    );

    return xrayOk({
      sessionId: session.sessionId,
      width: session.width,
      height: session.height,
      frameRate: session.frameRate,
      lostAfterFrames: session.lostAfterFrames,
      maxObjects: session.maxObjects,
    });
  }

  /**
   * POST /sessions/:sessionId/prompt — contract §5.
   *
   * `liveOnly`: prompting an already-ended session is a 404, not a forwarded
   * request. The GPU state is gone, so asking the service would earn a
   * `session_not_found` from it anyway — one fewer round trip, and the frontend
   * gets the code contract §10 tells it to treat as "stop drawing".
   *
   * A `409 frame_not_buffered` from the service is returned untouched and must
   * never be retried here (contract §10): the user clicked at a moment the
   * service no longer has a frame for, and only a fresh human click fixes it.
   */
  async addPrompt(actor, sessionId, body) {
    const session = await ownedSession(actor, sessionId, { liveOnly: true }).lean();
    if (!session) return xrayFail(404, XRAY_ERRORS.SESSION_NOT_FOUND, undefined, false);

    const result = await client.addPrompt(sessionId, body);
    if (!result.ok) return result;

    // Record the object so a later DELETE can be validated, and so the reaper
    // can report what it closed. $addToSet, not $push: a retried request must
    // not double-count one object.
    if (result.data?.objId) {
      await XraySession.updateOne(
        { sessionId },
        { $addToSet: { objects: result.data.objId }, $set: { state: "tracking" } },
      ).catch((error) =>
        // The prompt SUCCEEDED on the GPU; failing the request now would tell
        // the frontend tracking did not start when it did. Bookkeeping loss is
        // the lesser evil and the reaper still closes the session by id.
        logger.error(`[XRAY] could not record object on ${sessionId}: ${error?.message || error}`),
      );
    }

    return result;
  }

  /**
   * DELETE /sessions/:sessionId — contract §5. IDEMPOTENT 200.
   *
   * Deleting an unknown or already-ended session is success. A frontend closing
   * twice, or closing one the service already ended, is the normal case — and
   * Phase 5 depends on it, because both ends reap independently by design.
   */
  async closeSession(actor, sessionId, reason = "closed_by_user") {
    const session = await ownedSession(actor, sessionId).lean();

    // No record, or someone else's id: do NOT touch the service. Forwarding an
    // unowned id would let any authenticated user close any session by guessing.
    if (!session) return xrayOk({ isSuccess: true });

    const result = await client.closeSession(sessionId);
    if (!result.ok) {
      // The GPU may still hold the slot. Leave the record LIVE so the Phase 5
      // sweep retries rather than marking it ended and forgetting it.
      logger.error(
        `[XRAY] service refused to close ${sessionId} (${result.code}); leaving it for the reaper`,
      );
      return result;
    }

    await XraySession.updateOne(
      { sessionId },
      { $set: { state: "ended", endReason: reason, endedAt: new Date() } },
    ).catch((error) =>
      logger.error(`[XRAY] could not mark ${sessionId} ended: ${error?.message || error}`),
    );

    logger.info(`[XRAY] session ${sessionId} closed (${reason})`);
    return xrayOk({ isSuccess: true });
  }

  /** DELETE /sessions/:sessionId/objects/:objId — contract §5. Idempotent. */
  async removeObject(actor, sessionId, objId) {
    const session = await ownedSession(actor, sessionId).lean();
    if (!session) return xrayOk({ isSuccess: true });

    const result = await client.removeObject(sessionId, objId);
    if (!result.ok) return result;

    await XraySession.updateOne({ sessionId }, { $pull: { objects: objId } }).catch((error) =>
      logger.error(`[XRAY] could not unrecord ${objId} on ${sessionId}: ${error?.message || error}`),
    );

    return xrayOk({ isSuccess: true });
  }

  /**
   * GET /sessions/:sessionId — contract §5.
   *
   * The service is the authority on a live session's state; it is the only side
   * that can see frames arriving. Node's record is consulted for OWNERSHIP
   * only.
   *
   * An already-ended session is answered from Node's record rather than
   * forwarded: the GPU state is gone, so the service would 404, and the
   * frontend would lose the `reason` — which is the one thing it needs in order
   * to say why the session ended.
   */
  async getSession(actor, sessionId) {
    const session = await ownedSession(actor, sessionId).lean();
    if (!session) return xrayFail(404, XRAY_ERRORS.SESSION_NOT_FOUND, undefined, false);

    if (session.state === "ended") {
      return xrayOk({
        sessionId,
        state: "ended",
        reason: session.endReason || null,
        objects: [],
        framesBehindLive: 0,
      });
    }

    const result = await client.getStatus(sessionId);
    if (!result.ok) return result;

    // Keep Node's copy roughly current so the reaper and a later GET agree.
    // Fire-and-forget: a stale state costs nothing, a failed write would cost
    // the user their answer.
    if (result.data?.state && result.data.state !== session.state) {
      XraySession.updateOne({ sessionId }, { $set: { state: result.data.state } }).catch(() => {});
    }

    return result;
  }

  /**
   * POST /sessions/:sessionId/heartbeat — contract §5.
   *
   * Called every 10 s per open session, so it stays one indexed `updateOne` and
   * nothing else — no service call, no read-then-write. Missing heartbeats are
   * how orphaned GPU slots get reclaimed (contract §10), which is Phase 5.
   *
   * A heartbeat for an unknown or ended session is 404, not a silent 200: the
   * frontend needs to learn its session is gone, and while idle the heartbeat
   * is the only thing it sends.
   */
  async heartbeat(actor, sessionId) {
    const result = await XraySession.updateOne(
      { sessionId, userId: actor.userId, state: { $in: LIVE_STATES } },
      { $set: { lastHeartbeatAt: new Date() } },
    );

    if (!result.matchedCount) {
      return xrayFail(404, XRAY_ERRORS.SESSION_NOT_FOUND, undefined, false);
    }

    // FORWARD IT. Contract §10 puts the idle reap on both ends, and the
    // service's end of that is driven by this heartbeat and nothing else: left
    // unforwarded it reaps every session at XRAY_IDLE_TIMEOUT_SEC while Node
    // is still answering the browser 200. Measured against the real service
    // before this call existed -- 211 masks, then ended/idle_timeout at 45.3s,
    // with four heartbeats answered 200 along the way. Node's own bookkeeping
    // was perfect and the session died anyway.
    const forwarded = await client.heartbeat(sessionId);

    // `forwarded?.ok`: a client that answers nothing at all is not evidence
    // this session is gone, so it takes the undeliverable branch below rather
    // than throwing a 500 at a browser whose heartbeat was perfectly fine.
    if (!forwarded?.ok) {
      // The service knows this session is gone. Node would otherwise keep the
      // record live forever -- its own reaper only fires on MISSING
      // heartbeats, and the browser is still sending them -- so the UI would
      // hold a frozen outline indefinitely. 404 is what §10 tells the frontend
      // to treat as ended.
      if (forwarded?.code === XRAY_ERRORS.SESSION_NOT_FOUND) {
        await XraySession.updateOne(
          { sessionId, userId: actor.userId },
          { $set: { state: "ended", endReason: "session_expired", endedAt: new Date() } },
        );
        logger.warn(
          `[XRAY] the service has no session ${sessionId}; ending Node's record (session_expired)`,
        );
        return xrayFail(404, XRAY_ERRORS.SESSION_NOT_FOUND, undefined, false);
      }

      // Anything else -- unreachable, timed out, or a service too old to have
      // the route -- is NOT evidence about this session. Say so once per
      // heartbeat and let the reaper be the thing that decides, rather than
      // ending a live session because one keepalive could not be delivered.
      logger.warn(
        `[XRAY] heartbeat for ${sessionId} did not reach the service (${forwarded?.code || "no answer"}); ` +
          "the service may reap this session on its own timeout",
      );
    }

    return xrayOk({ isSuccess: true });
  }
}

export default new XrayService();
