/**
 * X-Ray request validation — contract §5.
 *
 * Wired from Phase 1, before any logic exists, so a malformed body is rejected
 * at the edge and never reaches the service layer. Plan Phase 1 step 4.
 *
 * Shape follows core/v2/detectionSettings/detectionSettings.validate.js: a class
 * whose methods return Joi's `{ error, value }`, default-exported as a single
 * instance. The difference is the two `validate*` middleware factories at the
 * bottom — the plan wants bad input rejected "before any logic runs", and a
 * route-level middleware is the only way to guarantee that without repeating
 * the call in every controller method.
 *
 * Errors use the contract §10 body, not utils/response.js — see xray.errors.js.
 */
import Joi from "joi";
import { XRAY_ERRORS, sendXrayError } from "./xray.errors.js";

/** Mongo ObjectId as the frontend sends it: 24 hex characters. */
const objectId = Joi.string()
  .trim()
  .pattern(/^[a-f\d]{24}$/i)
  .messages({ "string.pattern.base": "{#label} must be a 24-character hex id" });

/**
 * The service mints these (contract §6 returns `session_id` as "hex"). Length is
 * left open — it is the service's id format, not ours, and hard-coding a width
 * here would break the day the service widens it. Non-empty, hex, bounded.
 */
const sessionId = Joi.string()
  .trim()
  .pattern(/^[a-f\d]{8,64}$/i)
  .messages({ "string.pattern.base": "{#label} must be a hex session id" });

/** Contract §5: `obj-a1b2c3d4`. */
const objId = Joi.string()
  .trim()
  .pattern(/^obj-[a-z\d]{4,32}$/i)
  .messages({ "string.pattern.base": "{#label} must look like obj-a1b2c3d4" });

class XrayValidation {
  /**
   * POST /api/v2/xray/sessions
   *
   * `unknown` keys are stripped rather than rejected, so a frontend that sends
   * an extra diagnostic field does not get a 400 — but nothing unexpected
   * reaches the service either.
   */
  get createSessionSchema() {
    return Joi.object({
      cameraId: objectId.required(),
      nvrId: objectId.required(),
    });
  }

  /**
   * POST /api/v2/xray/sessions/:sessionId/prompt
   *
   * Contract §5: xNorm/yNorm are 0..1 against the video's NATIVE resolution
   * (video.videoWidth/videoHeight), never the CSS size. `seq` is hls.js
   * `frag.sn`; `offset` is `video.currentTime - frag.start`.
   *
   * The bounds are the contract's, and they are checked here rather than
   * trusted: a coordinate outside 0..1 means the frontend measured against the
   * wrong element, and silently clamping it would track the wrong object
   * instead of reporting the bug. `offset` is capped at 60s — a single HLS
   * segment is seconds long, so a larger value is a unit mix-up (milliseconds),
   * not a legitimate click.
   */
  get promptSchema() {
    return Joi.object({
      xNorm: Joi.number().min(0).max(1).required(),
      yNorm: Joi.number().min(0).max(1).required(),
      seq: Joi.number().integer().min(0).required(),
      offset: Joi.number().min(0).max(60).required(),
    });
  }

  /** Any route carrying :sessionId. */
  get sessionParamsSchema() {
    return Joi.object({ sessionId: sessionId.required() });
  }

  /** DELETE /api/v2/xray/sessions/:sessionId/objects/:objId */
  get objectParamsSchema() {
    return Joi.object({
      sessionId: sessionId.required(),
      objId: objId.required(),
    });
  }

  createSession(body) {
    return this.createSessionSchema.validate(body, { stripUnknown: true });
  }

  prompt(body) {
    return this.promptSchema.validate(body, { stripUnknown: true });
  }
}

const validation = new XrayValidation();

/**
 * Validate `req.body` against a schema, replacing it with the cleaned value.
 *
 * On failure: 400 with the contract §10 body and `error: "validation_failed"`.
 * Joi's own message goes in `message`, which §10 says is for humans and may
 * change freely — so the frontend never parses it.
 */
export const validateBody = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body || {}, {
    stripUnknown: true,
    abortEarly: true,
  });
  if (error) {
    return sendXrayError(res, 400, XRAY_ERRORS.VALIDATION_FAILED, error.message, false);
  }
  req.body = value;
  return next();
};

/**
 * Validate route parameters.
 *
 * `req.params` is NOT reassigned: in Express 4 it is a getter backed by the
 * router's own match, and replacing it wholesale can detach later middleware
 * from the real values. Validation here is a gate, not a transform — the ids
 * are already strings and need no coercion.
 */
export const validateParams = (schema) => (req, res, next) => {
  const { error } = schema.validate(req.params || {}, { abortEarly: true });
  if (error) {
    return sendXrayError(res, 400, XRAY_ERRORS.VALIDATION_FAILED, error.message, false);
  }
  return next();
};

export default validation;
