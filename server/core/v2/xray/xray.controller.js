/**
 * X-Ray controller — reads the request, calls the service, shapes the response.
 *
 * No logic lives here by design (plan, "Orientation"): no Mongo, no HTTP calls
 * out, no authorisation decisions. If a rule needs writing it belongs in
 * xray.service.js, where it can be unit-tested without an Express request.
 *
 * Two things this file does own:
 *
 *  1. Pulling the actor off `req.verified` once, in one place. Contract §6 needs
 *     both `admin_id` and `user_id`, and they are NOT the same kind of thing:
 *     `adminId` is a Mongo _id, `user_id` is the tenant key every Channel and
 *     NVR document is stamped with (status_backend.md Phase 0 answer 1).
 *
 *  2. Turning every unexpected throw into exactly one 500 with the contract §10
 *     body — never a stack trace, never the house `{status, message, error}`
 *     shape, which the frontend's error switch would not recognise.
 */
import logger from "../../../utils/logger.js";
import XrayService from "./xray.service.js";
import { XRAY_ERRORS, sendXrayError } from "./xray.errors.js";

/**
 * The authenticated caller, as the service layer wants it.
 *
 * `memberId` is null for an admin and set for a sub-user; Phase 3 uses it to
 * apply the per-member camera restrictions that the Channel model's query hook
 * expects (`setOptions({ memberId })`).
 */
const actorFrom = (req) => {
  const userData = req?.verified?.userData || {};
  return {
    adminId: userData.adminId ? String(userData.adminId) : "",
    userId: userData.user_id ? String(userData.user_id) : "",
    memberId: userData.memberId ? String(userData.memberId) : null,
  };
};

/** The browser tab, for tab-granular mask delivery (contract §9). */
const clientFrom = (req) => ({
  clientSessionId: String(req?.headers?.["x-session-id"] || "").trim(),
  // Used ONLY by the laptop's local HLS relay, never sent to the GPU service.
  ...(process.env.XRAY_LOCAL_TEST_MODE === "true" ? {streamToken: String(req?.headers?.["x-access-token"] || "")} : {}),
});

/**
 * Run a service call and send whatever it returns.
 *
 * `label` names the operation in the log line, so a 500 in production says
 * which endpoint threw without needing the stack to be sent to the browser.
 */
const handle = async (label, res, work) => {
  try {
    const result = await work();

    // A service method that forgot to return would otherwise reach
    // res.status(undefined) and throw something unreadable. One 500 with a log
    // line naming the method is far easier to chase.
    if (!result || typeof result.ok !== "boolean" || !Number.isFinite(result.status)) {
      logger.error(`[XRAY] ${label} returned a malformed service result`);
      return sendXrayError(res, 500, XRAY_ERRORS.INTERNAL_ERROR);
    }

    if (!result.ok) {
      return sendXrayError(res, result.status, result.code, result.message, result.retryable);
    }
    return res.status(result.status).json(result.data);
  } catch (error) {
    logger.error(`[XRAY] ${label} failed: ${error?.message || error}`);
    return sendXrayError(res, 500, XRAY_ERRORS.INTERNAL_ERROR);
  }
};

class XrayController {
  /* #swagger.tags = ['X-Ray Mode'] */
  async createSession(req, res) {
    /* #swagger.tags = ['X-Ray Mode']
       #swagger.description = 'Open an X-ray session on a camera. Returns only once the stream is decoding and frames are flowing, so a 200 means the click overlay can be enabled. Mounted only when XRAY_ENABLED is true.'
       #swagger.parameters['data'] = { in: 'body', required: true, schema: { cameraId: '507f1f77bcf86cd799439011', nvrId: '507f1f77bcf86cd799439012' } }
       #swagger.responses[200] = { description: 'Session created; width/height/frameRate describe the stream' }
       #swagger.responses[403] = { description: 'not_licensed, or this user may not view this camera' }
       #swagger.responses[503] = { description: 'stream_not_ready or max_sessions_reached' }
       #swagger.security = [{ "EncryptedAuthToken": [] }]
    */
    return handle("createSession", res, () =>
      XrayService.createSession(actorFrom(req), req.body, clientFrom(req)),
    );
  }

  async addPrompt(req, res) {
    /* #swagger.tags = ['X-Ray Mode']
       #swagger.description = 'Seed a track from a click. xNorm/yNorm are 0..1 against the native video resolution; seq and offset identify the HLS frame the user was looking at.'
       #swagger.parameters['data'] = { in: 'body', required: true, schema: { xNorm: 0.431, yNorm: 0.662, seq: 12345, offset: 1.24 } }
       #swagger.responses[200] = { description: 'Tracking started; resolvedSeq/resolvedOffset is the frame actually used' }
       #swagger.responses[409] = { description: 'frame_not_buffered (do not auto-retry) or max_objects_reached' }
       #swagger.responses[422] = { description: 'mask_too_small — the click did not land on an object' }
       #swagger.security = [{ "EncryptedAuthToken": [] }]
    */
    return handle("addPrompt", res, () =>
      XrayService.addPrompt(actorFrom(req), req.params.sessionId, req.body),
    );
  }

  async closeSession(req, res) {
    /* #swagger.tags = ['X-Ray Mode']
       #swagger.description = 'Close an X-ray session and free the GPU slot. Idempotent: closing an already-closed or unknown session is 200, not 404.'
       #swagger.responses[200] = { description: '{ isSuccess: true }' }
       #swagger.security = [{ "EncryptedAuthToken": [] }]
    */
    return handle("closeSession", res, () =>
      XrayService.closeSession(actorFrom(req), req.params.sessionId, "closed_by_user"),
    );
  }

  async removeObject(req, res) {
    /* #swagger.tags = ['X-Ray Mode']
       #swagger.description = 'Stop tracking one object without ending the session. Idempotent.'
       #swagger.responses[200] = { description: '{ isSuccess: true }' }
       #swagger.security = [{ "EncryptedAuthToken": [] }]
    */
    return handle("removeObject", res, () =>
      XrayService.removeObject(actorFrom(req), req.params.sessionId, req.params.objId),
    );
  }

  async getSession(req, res) {
    /* #swagger.tags = ['X-Ray Mode']
       #swagger.description = 'Current state of a session: one of preparing, ready, tracking, lost, ended.'
       #swagger.responses[200] = { description: '{ sessionId, state, objects, framesBehindLive }' }
       #swagger.responses[404] = { description: 'session_not_found — treat as ended and stop drawing' }
       #swagger.security = [{ "EncryptedAuthToken": [] }]
    */
    return handle("getSession", res, () =>
      XrayService.getSession(actorFrom(req), req.params.sessionId),
    );
  }

  async heartbeat(req, res) {
    /* #swagger.tags = ['X-Ray Mode']
       #swagger.description = 'Keep a session alive. The frontend calls this every 10s while X-ray is open; sessions with no heartbeat for XRAY_IDLE_TIMEOUT_SEC are reaped so a closed tab cannot hold a GPU slot.'
       #swagger.responses[200] = { description: '{ isSuccess: true }' }
       #swagger.security = [{ "EncryptedAuthToken": [] }]
    */
    return handle("heartbeat", res, () =>
      XrayService.heartbeat(actorFrom(req), req.params.sessionId),
    );
  }
}

export default new XrayController();
