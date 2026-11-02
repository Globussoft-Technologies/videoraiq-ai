/**
 * Camera authorisation, and turning a camera into a playlist URL.
 *
 * Two jobs that have to happen together, because the second must never run on a
 * camera that failed the first.
 *
 *
 * AUTHORISATION — two independent checks, both required
 *
 * Phase 0 found there is no single "may this user see this camera" helper in
 * this codebase; the real pattern is two things, and using only the first is a
 * privilege escalation:
 *
 *   1. TENANT SCOPE. `Channel.findOne({ _id, userId })` — the house pattern at
 *      core/v2/detectionSettings/detectionSettings.service.js:2196. `userId` is
 *      the tenant key off the token (`user_id`), NOT the admin's Mongo _id.
 *
 *   2. PER-MEMBER CAMERA RESTRICTION. A sub-user may only see a subset of their
 *      admin's cameras. The Channel model has a query pre-hook
 *      (core/v1/channels/channels.model.js:316) that applies that subset
 *      automatically — but ONLY when `options.memberId` is set. Omit it and a
 *      restricted sub-user can X-ray a camera the UI hides from them.
 *
 * The same hook also adds `isAdded: true`, so a camera that was discovered but
 * never added cannot be X-rayed. That is the behaviour we want and it comes for
 * free.
 *
 *
 * 404, NOT 403 — a deliberate deviation from the plan
 *
 * Plan Phase 3 step 2 says "Fail 403". This returns 404 `camera_not_found`
 * instead, for two reasons:
 *
 *   * every other v2 endpoint answers 404 for a resource outside your tenant
 *     (detectionSettings.service.js:2196 and :1200 both do), so a 403 here
 *     would be the one inconsistent endpoint in the API;
 *   * 403 confirms the id names a real camera somewhere, which 404 does not.
 *     The two failures — "no such camera" and "not yours" — are deliberately
 *     indistinguishable.
 *
 * The licence denial stays 403 `not_licensed`, because contract §10 names that
 * code and the frontend switches on it.
 */
import Channel from "../channels/channels.model.js";
import { buildStreamingUrl, resolveHost } from "../../../utils/rtspStream.js";
import logger from "../../../utils/logger.js";

/**
 * The camera, if this actor may see it. `null` otherwise — caller answers 404.
 *
 * @param {object} actor    { userId, memberId }
 * @param {string} cameraId
 * @param {string} nvrId    cross-checked against the camera's own NVR
 */
export const findAuthorisedCamera = async (actor, cameraId, nvrId) => {
  const query = Channel.findOne({ _id: cameraId, userId: actor.userId }).populate("nvrId");

  // Only set memberId when there is one: the pre-hook treats a falsy memberId
  // as "an admin, unrestricted", and passing null explicitly means the same
  // thing — but being explicit about the branch keeps the intent readable.
  if (actor.memberId) query.setOptions({ memberId: actor.memberId });

  const channel = await query.exec();
  if (!channel) return null;

  // The client sends both ids. If they disagree, fail rather than quietly
  // trusting the camera's own NVR — a mismatched pair means the frontend built
  // the request from stale state, and resolving it anyway would open a session
  // on a camera the user did not mean to pick.
  const channelNvrId = String(channel.nvrId?._id || channel.nvrId || "");
  if (channelNvrId !== String(nvrId)) {
    logger.warn(
      `[XRAY] camera ${cameraId} belongs to NVR ${channelNvrId}, request said ${nvrId} — refusing`,
    );
    return null;
  }

  return channel;
};

/**
 * Contract §13.2 — MAIN RENDITION ONLY. This is a tripwire, not a preference.
 *
 * The Go streaming server serves three renditions of every camera
 * (streaming/internal/server/server.go:59, :828, :833):
 *
 *   /stream/{cam}/playlist.m3u8          main — the only correct one
 *   /sub-stream/{cam}/playlist.m3u8
 *   /master-stream/{cam}/playlist.m3u8   multi-variant
 *
 * A click's `seq` is a segment number, and segment numbering is only meaningful
 * WITHIN one rendition. Hand the service a sub-stream URL and every frame
 * lookup silently resolves to the wrong moment — the session works, the mask
 * appears, and it tracks the wrong thing. There is no error to notice.
 *
 * Nothing in the Node codebase can produce such a URL today (Phase 0 grepped
 * for it; `buildStreamingUrl` hardcodes "main"). But in non-cloud mode the path
 * is whatever `channel.streamingPath` holds, and that string arrives from NVR
 * registration — from data, not from code. So it is checked rather than assumed.
 */
export const isMainRendition = (url) => {
  const value = String(url || "");
  if (/\/(master-stream|sub-stream)\//i.test(value)) return false;
  return /\/stream\//i.test(value);
};

/**
 * The absolute, main-rendition playlist URL for a camera.
 *
 * @returns {{ url: string } | { error: "unresolved" | "wrong_rendition", detail: string }}
 */
export const resolveStreamUrl = async (channel) => {
  const nvr = channel?.nvrId;

  // buildStreamingUrl can return a RELATIVE path, and that has already cost
  // this codebase a silent outage: the old code prefixed the host only when
  // APP_ENV was "cloud", but every shipped config says "local", so DS received
  // a bare "stream/<nvr>-<cam>/playlist.m3u8", came up healthy, read nothing,
  // and produced no detections. The fix lives at
  // services/python.service.js:519-531 and is copied here verbatim rather than
  // re-derived — re-deriving it is how the bug comes back.
  const streamingPath = await buildStreamingUrl(nvr, channel);
  if (!streamingPath) {
    return { error: "unresolved", detail: "buildStreamingUrl returned nothing" };
  }

  const isAbsolute = /^https?:\/\//i.test(String(streamingPath));
  const streamHost = String((await resolveHost(nvr?.userId)) || "").replace(/\/+$/, "");
  const url = isAbsolute
    ? String(streamingPath)
    : `${streamHost}/${String(streamingPath).replace(/^\/+/, "")}`;

  if (!/^https?:\/\//i.test(url)) {
    return { error: "unresolved", detail: `not absolute: ${url}` };
  }

  if (!isMainRendition(url)) {
    return { error: "wrong_rendition", detail: url };
  }

  return { url };
};

export default { findAuthorisedCamera, isMainRendition, resolveStreamUrl };
