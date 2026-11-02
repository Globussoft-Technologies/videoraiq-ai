/**
 * The naming boundary. Contract §9:
 *
 *   "Camel-cased at the Node boundary; the service speaks snake_case. Node owns
 *    that translation — the frontend never sees snake_case, the service never
 *    sees camelCase."
 *
 * Every crossing goes through this file, so there is exactly one place where a
 * field is renamed and exactly one place to look when a field arrives
 * `undefined`.
 *
 *
 * WHY THESE ARE EXPLICIT MAPS AND NOT A GENERIC snake_case->camelCase WALKER
 *
 * A generic converter is shorter and wrong here, for three reasons:
 *
 *  1. It renames fields nobody designed. The day the Python service adds
 *     `debug_internal_state`, a walker forwards it to the browser as
 *     `debugInternalState` — a field the contract never promised and the
 *     frontend may start depending on. An explicit map drops it.
 *  2. It cannot tell a key from a value. `polygon` is `[[[x, y], ...]]` and
 *     `objects` is a list of records; a walker has to be taught which branches
 *     to descend and which to copy verbatim, at which point it is no shorter
 *     than this.
 *  3. It hides the contract. Read this file and you have read §5, §6 and §8's
 *     field lists. That is worth more than the lines it costs.
 *
 * Unknown fields are therefore DROPPED, not forwarded. If the service starts
 * sending something this file does not name, the fix is to add it here on
 * purpose.
 */

/** A finite number, or the fallback. Guards against null/undefined/"12"/NaN. */
const numOr = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * The payload, or an empty object.
 *
 * A JS default parameter (`body = {}`) only fires for `undefined`, NOT for
 * `null` — and `null` is exactly what an empty 200 body deserialises to, and
 * what a WebSocket frame containing `null` parses to. Without this guard a
 * service answering 200 with no body would throw a TypeError inside the
 * translator, and the caller would see an opaque 500 instead of the
 * missing-field problem it actually has.
 *
 * Found by `tests/unit/xray/xray.translate.test.js`, which passes `null` on
 * purpose.
 */
const obj = (value) => (value && typeof value === "object" ? value : {});

// ---------------------------------------------------------------------------
// Service -> Node (snake_case in, camelCase out)
// ---------------------------------------------------------------------------

/**
 * `POST /sessions` response — contract §6 in, §5 out.
 *
 * `frameRate` is the DECIMATED rate masks actually arrive at (contract §12,
 * `XRAY_MODEL_FPS`, default 5.0), not the source fps. The frontend needs it to
 * interpolate between masks, so a missing or zero value is a real problem for
 * it — but it is the service's value to send, and inventing a default here
 * would paper over a service bug. Passed through as-is.
 *
 * `maxObjects` is the one exception, defaulting to 1: contract §13.4 caps v1 at
 * one object per session, and a 0 would tell the frontend no object may ever be
 * tracked.
 */
export const sessionFromService = (raw) => {
  const body = obj(raw);
  return {
    sessionId: String(body.session_id || ""),
    width: numOr(body.width),
    height: numOr(body.height),
    frameRate: numOr(body.frame_rate),
    lostAfterFrames: numOr(body.lost_after_frames),
    maxObjects: numOr(body.max_objects, 1),
  };
};

/**
 * `POST /sessions/{id}/prompt` response.
 *
 * `resolvedSeq` / `resolvedOffset` is the frame the service actually chose,
 * which may differ from the one the user clicked on. Contract §5: the frontend
 * may surface the delta but must not reject a non-exact match.
 */
export const promptFromService = (raw) => {
  const body = obj(raw);
  return {
    objId: String(body.obj_id || ""),
    resolvedSeq: numOr(body.resolved_seq),
    resolvedOffset: numOr(body.resolved_offset),
  };
};

/**
 * One tracked object, as it appears in a `mask` message (contract §8) and in a
 * status response.
 *
 * `bbox` and `polygon` are in SOURCE pixel coordinates, already scaled up from
 * the model's internal resolution by the service — copied, never recomputed.
 *
 * There is deliberately NO `score`. Contract §8: a click-seeded track has no
 * meaningful confidence (SAM3 reports a constant), and emitting one would
 * invite a threshold on a number that means nothing. The name is reserved for
 * when text prompting lands.
 *
 * There is deliberately no `rle` either — §8: "RLE exists only in the harvest
 * record", never on the wire.
 */
export const objectFromService = (raw) => {
  const object = obj(raw);
  return {
    objId: String(object.obj_id || ""),
    bbox: Array.isArray(object.bbox) ? object.bbox.map((v) => numOr(v)) : [],
    polygon: Array.isArray(object.polygon) ? object.polygon : [],
  };
};

/**
 * `GET /sessions/{id}/status` response — contract §5's `GET /sessions/:id`.
 *
 * `state` is one of contract §7's five strings and is passed through verbatim:
 * it is a shared vocabulary, identical in the service, in Mongo, in the
 * socket.io events and in the UI, so translating it would be a bug.
 */
export const statusFromService = (raw) => {
  const body = obj(raw);
  return {
    sessionId: String(body.session_id || ""),
    state: body.state ? String(body.state) : "",
    reason: body.reason === undefined || body.reason === null ? null : String(body.reason),
    objects: Array.isArray(body.objects) ? body.objects.map(objectFromService) : [],
    framesBehindLive: numOr(body.frames_behind_live),
  };
};

/**
 * A `mask` message off the WebSocket — contract §8 in, §9 out.
 *
 * `objects` contains only objects VISIBLE in that frame; an absent object is
 * omitted rather than sent with an empty mask, so an empty list is meaningful
 * (nothing visible) and not an error.
 *
 * Used by Phase 4's fan-out. It lives here rather than in the WebSocket handler
 * so the HTTP hop and the WebSocket hop cannot drift apart on field names.
 *
 * The `type` field is the WebSocket envelope and is deliberately not forwarded:
 * socket.io carries the event name itself (§9).
 */
export const maskFromService = (raw) => {
  const message = obj(raw);
  return {
    sessionId: String(message.session_id || ""),
    seq: numOr(message.seq),
    offset: numOr(message.offset),
    emittedAt: numOr(message.emitted_at),
    objects: Array.isArray(message.objects) ? message.objects.map(objectFromService) : [],
  };
};

/**
 * A `state` message off the WebSocket — contract §8 in, §9 out.
 *
 * `reason` is non-null only for the `ended` state.
 */
export const stateFromService = (raw) => {
  const message = obj(raw);
  return {
    sessionId: String(message.session_id || ""),
    state: message.state ? String(message.state) : "",
    reason: message.reason === undefined || message.reason === null ? null : String(message.reason),
    framesBehindLive: numOr(message.frames_behind_live),
  };
};

// ---------------------------------------------------------------------------
// Node -> Service (camelCase in, snake_case out)
// ---------------------------------------------------------------------------

/**
 * `POST /sessions` request body — contract §6.
 *
 * Exactly the five fields the contract names, and no others: `camera_id`,
 * `nvr_id`, `admin_id`, `user_id`, `stream_url`. Anything else a caller happens
 * to pass (a socket id, an internal note) is dropped rather than leaked onto
 * the GPU box.
 */
export const sessionToService = (raw) => {
  const { cameraId, nvrId, adminId, userId, streamUrl } = obj(raw);
  return {
    camera_id: String(cameraId || ""),
    nvr_id: String(nvrId || ""),
    admin_id: String(adminId || ""),
    user_id: String(userId || ""),
    stream_url: String(streamUrl || ""),
  };
};

/**
 * `POST /sessions/{id}/prompt` request body — contract §6.
 *
 * Already range-checked by xray.validate.js before it gets here, so a missing
 * field becomes 0 (a valid in-range coordinate) rather than `undefined`, which
 * the service would reject.
 */
export const promptToService = (raw) => {
  const { xNorm, yNorm, seq, offset } = obj(raw);
  return {
    x_norm: numOr(xNorm),
    y_norm: numOr(yNorm),
    seq: numOr(seq),
    offset: numOr(offset),
  };
};

export default {
  sessionFromService,
  promptFromService,
  statusFromService,
  objectFromService,
  maskFromService,
  stateFromService,
  sessionToService,
  promptToService,
};
