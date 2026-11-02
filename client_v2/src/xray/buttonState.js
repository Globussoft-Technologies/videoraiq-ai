/**
 * Everything the X-Ray pill shows, derived from facts — no DOM, no React, so it
 * is testable directly (`tests/xrayButtonState.test.js`).
 *
 * Design rule from the gate (plan Phase 2): *a disabled button that explains
 * itself beats a button that errors when pressed.* So every unavailable state
 * carries its own reason, and the reason is what goes in the tooltip. There is
 * no path here that returns "enabled but will fail".
 */

/** The pill's visual mode. */
export const MODE = {
  IDLE: 'idle',         // ready to be pressed
  STARTING: 'starting', // a session is being established
  ACTIVE: 'active',     // X-ray is on
  DISABLED: 'disabled', // cannot be pressed; `tooltip` says why
};

/**
 * User-facing copy, in one place so Phase 6's state table and this button can
 * never drift apart. Contract §14: the feature is "X-ray" everywhere.
 */
export const COPY = {
  idleLabel: 'X-Ray',
  startingLabel: 'Preparing X-Ray…',
  activeLabel: 'X-Ray on',

  // Nobody guesses what X-ray does from the word, so this tooltip is
  // load-bearing rather than decorative.
  idleTooltip: 'X-Ray: click any object in the live view and watch it get tracked',
  startingTooltip: "Waiting for the camera's first decoded frame",
  activeTooltip: 'X-Ray is on — press Esc to exit',

  notLicensed: "X-Ray isn't enabled for your account",
  snapshotOnly: 'X-Ray needs a live stream — this is a saved snapshot',
  noStream: 'No stream is configured for this camera',
  streamUnavailable: 'Camera stream is unavailable',
  streamStarting: 'Waiting for the camera stream to start',
};

/**
 * What the user is told when `POST /sessions` fails, keyed by contract §10's
 * machine code. Kept separate from `COPY` so the button's own copy stays a
 * closed set, but in this file so all X-ray wording lives in one place.
 *
 * `not_licensed` appears in both: here as the toast for the press that
 * discovered it, and in `COPY` as the tooltip on the now-permanently-disabled
 * pill.
 */
export const START_ERROR_COPY = Object.freeze({
  stream_not_ready: "Camera isn't streaming — try again shortly",
  max_sessions_reached: 'X-Ray is busy — try again in a minute',
  not_licensed: COPY.notLicensed,
  // Answered as 404, NOT 403 — the Node session returns `camera_not_found` for a
  // camera outside the caller's tenant or outside a sub-user's allow-list,
  // deliberately matching every other v2 endpoint so a 403 cannot be used to
  // confirm that an id exists. Without this entry the user would get the generic
  // "stopped unexpectedly", which says nothing about the actual problem.
  camera_not_found: "That camera isn't available to your account",
  internal_error: 'X-Ray stopped unexpectedly — try again',
});

/** The message for a start failure, falling back without inventing a code. */
export const startErrorMessage = (code) => START_ERROR_COPY[code]
  || START_ERROR_COPY.internal_error;

/**
 * What the user is told when a *click* is refused — contract §10's click-time
 * codes, plus one local case.
 *
 * These surface **inline on the stage, anchored at the click point**, not as a
 * corner toast: the feedback is about a click in the middle of the video, and a
 * notification in the corner makes the user hunt for the answer to something
 * they just did with the mouse.
 *
 * `mask_too_small` is the one that matters most for first impressions — it is
 * what a click on a blank wall produces, which is a thing everyone does once.
 */
export const CLICK_ERROR_COPY = Object.freeze({
  frame_not_buffered: 'Try clicking again',
  mask_too_small: "Couldn't lock onto that — try clicking the centre of the object",
  max_objects_reached: 'Only one object at a time for now',
  session_not_found: 'X-Ray session ended — turn it back on',
  // A local refusal, not a server code: no fragment contains the current
  // playhead, so there is no honest `seq` to send. Spending a round trip to earn
  // a `frame_not_buffered` — which the plan forbids auto-retrying — would be
  // worse than saying so immediately.
  frame_unresolved: 'Still syncing with the camera — try again in a moment',
  internal_error: "Couldn't track that — try again",
});

export const clickErrorMessage = (code) => CLICK_ERROR_COPY[code]
  || CLICK_ERROR_COPY.internal_error;

/**
 * @typedef {object} XrayButtonFacts
 * @property {'idle'|'starting'|'active'} phase     what X-ray itself is doing
 * @property {boolean} notLicensed                  latched after a 403 (contract §10)
 * @property {boolean} hasStreamUrl                 the page resolved a playlist URL
 * @property {string}  videoState                   the page's own 'idle'|'loading'|'ready'|'error'
 * @property {boolean} isSnapshot                   the page is showing a still, not live video
 * @property {number}  videoWidth                   native width; 0 until loadedmetadata
 */

/**
 * @param {XrayButtonFacts} facts
 * @returns {{mode: string, label: string, tooltip: string, disabled: boolean, pressed: boolean}}
 */
export function deriveButtonState({
  phase = MODE.IDLE,
  notLicensed = false,
  hasStreamUrl = false,
  videoState = 'idle',
  isSnapshot = false,
  videoWidth = 0,
} = {}) {
  const off = (tooltip) => ({
    mode: MODE.DISABLED, label: COPY.idleLabel, tooltip, disabled: true, pressed: false,
  });

  // 1. Licensing is permanent for the session and outranks everything: there is
  //    no stream state that makes an unlicensed account licensed.
  if (notLicensed) return off(COPY.notLicensed);

  // 2. Once X-ray is starting or running, the pill reports X-ray's own state and
  //    stops second-guessing the stream. A stream that dies mid-session is not a
  //    disabled button — it is an `ended/stream_stalled` session (contract §7),
  //    handled by the session machine in Phase 3/6. Disabling the control here
  //    would strand the user with no way to close what they started.
  if (phase === MODE.STARTING) {
    return {
      mode: MODE.STARTING, label: COPY.startingLabel, tooltip: COPY.startingTooltip,
      disabled: true, pressed: false,
    };
  }
  if (phase === MODE.ACTIVE) {
    return {
      mode: MODE.ACTIVE, label: COPY.activeLabel, tooltip: COPY.activeTooltip,
      disabled: false, pressed: true,
    };
  }

  // 3. Starting X-ray requires a live stream that is actually decoding. Each
  //    failure gets its own sentence — "it doesn't work" is not a reason.
  if (isSnapshot) return off(COPY.snapshotOnly);
  if (!hasStreamUrl) return off(COPY.noStream);
  if (videoState === 'error') return off(COPY.streamUnavailable);
  if (videoState !== 'ready') return off(COPY.streamStarting);

  // `videoWidth` is 0 until `loadedmetadata`. Without it there is no denominator
  // for the normalised click coordinates contract §5 requires, so a click now
  // could not be expressed — the button must wait for it, not just for `ready`.
  if (!videoWidth) return off(COPY.streamStarting);

  return {
    mode: MODE.IDLE, label: COPY.idleLabel, tooltip: COPY.idleTooltip,
    disabled: false, pressed: false,
  };
}
