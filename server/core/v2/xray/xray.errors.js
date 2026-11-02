/**
 * X-Ray error vocabulary — contract §10.
 *
 * X-ray does NOT use utils/response.js. Every other endpoint in this codebase
 * answers with `{ status, message, error }`, but contract §10 freezes a
 * different body for both X-ray hops:
 *
 *   { "error": "frame_not_buffered", "message": "...", "retryable": false }
 *
 * The frontend switches on the machine-readable `error` string, and the Python
 * service emits exactly the same shape, so Node can forward a service error
 * without reshaping it. Using the house helper here would silently break that
 * switch, which is why this file exists instead of a one-line import.
 *
 * `message` is for humans and may change freely. `error` is the contract and
 * must not.
 */

/**
 * Every code either hop may emit. Kept as one object so a typo is a crash at
 * the call site rather than a string the frontend has never heard of.
 *
 * Codes marked (service) originate in Python and are passed through unchanged
 * (contract §6, §10) — they are listed so Node can reason about retryability
 * without inventing its own names.
 */
export const XRAY_ERRORS = Object.freeze({
  // Node-side
  NOT_IMPLEMENTED: "not_implemented",
  VALIDATION_FAILED: "validation_failed",
  UNAUTHORIZED: "unauthorized",
  FORBIDDEN: "forbidden",
  NOT_LICENSED: "not_licensed",
  CAMERA_NOT_FOUND: "camera_not_found",
  SESSION_NOT_FOUND: "session_not_found",
  STREAM_URL_UNRESOLVED: "stream_url_unresolved",
  WRONG_RENDITION: "wrong_rendition",
  SERVICE_UNAVAILABLE: "service_unavailable",
  INTERNAL_ERROR: "internal_error",

  // Service-side (passed through verbatim)
  STREAM_NOT_READY: "stream_not_ready",
  MAX_SESSIONS_REACHED: "max_sessions_reached",
  STREAM_URL_NOT_ALLOWED: "stream_url_not_allowed",
  FRAME_NOT_BUFFERED: "frame_not_buffered",
  MASK_TOO_SMALL: "mask_too_small",
  MAX_OBJECTS_REACHED: "max_objects_reached",
});

/**
 * Codes a client may sensibly retry unprompted.
 *
 * `frame_not_buffered` is deliberately ABSENT. Contract §10 is explicit: the
 * frontend must never auto-retry it — the user clicked at a moment the service
 * had no frame for, and the fix is a new human click, not a louder loop.
 * `mask_too_small` is likewise a "click somewhere better", not a retry.
 */
const RETRYABLE = new Set([
  XRAY_ERRORS.STREAM_NOT_READY,
  XRAY_ERRORS.MAX_SESSIONS_REACHED,
  XRAY_ERRORS.SERVICE_UNAVAILABLE,
]);

export const isRetryable = (code) => RETRYABLE.has(code);

/** Default human text per code; overridable at any call site. */
const DEFAULT_MESSAGES = Object.freeze({
  [XRAY_ERRORS.NOT_IMPLEMENTED]: "X-ray mode is not implemented yet",
  [XRAY_ERRORS.VALIDATION_FAILED]: "The request body is invalid",
  [XRAY_ERRORS.UNAUTHORIZED]: "Authentication is required",
  [XRAY_ERRORS.FORBIDDEN]: "You may not use X-ray mode on this camera",
  [XRAY_ERRORS.NOT_LICENSED]: "X-ray mode is not enabled for your account",
  [XRAY_ERRORS.CAMERA_NOT_FOUND]: "Camera not found",
  [XRAY_ERRORS.SESSION_NOT_FOUND]: "X-ray session not found",
  [XRAY_ERRORS.STREAM_URL_UNRESOLVED]: "Could not resolve a stream URL for this camera",
  [XRAY_ERRORS.WRONG_RENDITION]: "This camera resolved to a non-main stream rendition",
  [XRAY_ERRORS.SERVICE_UNAVAILABLE]: "The X-ray service is unreachable",
  [XRAY_ERRORS.INTERNAL_ERROR]: "X-ray mode failed unexpectedly",
  [XRAY_ERRORS.STREAM_NOT_READY]: "Camera isn't streaming yet",
  [XRAY_ERRORS.MAX_SESSIONS_REACHED]: "X-ray is busy — try again in a minute",
  [XRAY_ERRORS.STREAM_URL_NOT_ALLOWED]: "This camera's stream host is not allowed",
  [XRAY_ERRORS.FRAME_NOT_BUFFERED]: "That frame is no longer buffered — click again",
  [XRAY_ERRORS.MASK_TOO_SMALL]: "Couldn't lock onto that — click the centre of the object",
  [XRAY_ERRORS.MAX_OBJECTS_REACHED]: "Only one object at a time for now",
});

/**
 * Build a contract §10 error body.
 *
 * `retryable` is derived from the code unless explicitly overridden, so two
 * call sites cannot disagree about whether the same code is worth retrying.
 */
export const xrayError = (code, message, retryable) => ({
  error: code,
  message: message || DEFAULT_MESSAGES[code] || "X-ray mode failed",
  retryable: retryable === undefined ? isRetryable(code) : Boolean(retryable),
});

/** Send a contract §10 error. The only way this module writes an error body. */
export const sendXrayError = (res, status, code, message, retryable) =>
  res.status(status).json(xrayError(code, message, retryable));

// ---------------------------------------------------------------------------
// How the service layer reports back to the controller
// ---------------------------------------------------------------------------

/**
 * xray.service.js never touches `res` — the plan puts response shaping in the
 * controller and logic in the service, so the service returns one of these two
 * shapes instead and the controller does the sending.
 *
 * Expected failures (not licensed, no such camera, the service said 503) are
 * returned, not thrown: they are outcomes, not bugs. Only genuinely unexpected
 * conditions throw, and the controller turns those into one 500.
 */
export const xrayOk = (data, status = 200) => ({ ok: true, status, data });

export const xrayFail = (status, code, message, retryable) => ({
  ok: false,
  status,
  code,
  message,
  retryable,
});

export default { XRAY_ERRORS, isRetryable, xrayError, sendXrayError, xrayOk, xrayFail };
