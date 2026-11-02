/**
 * The X-ray session state machine — contract §7's vocabulary, as a pure
 * reducer. No React, no network, no DOM, so the transitions are testable
 * directly (`tests/xraySession.test.js`).
 *
 * `useXraySession` is deliberately thin glue over this: anything that decides
 * *what state we are in* belongs here, where it can be tested exhaustively.
 */
import { MODE } from './buttonState';

/** Contract §7, exactly. These strings cross three codebases — do not rename. */
export const STATUS = Object.freeze({
  IDLE: 'idle',             // no session (not a contract state — our "before/after")
  PREPARING: 'preparing',
  READY: 'ready',
  TRACKING: 'tracking',
  LOST: 'lost',
  ENDED: 'ended',
});

/** Contract §7's exhaustive `ended` reasons. */
export const ENDED_REASON = Object.freeze({
  CLOSED_BY_USER: 'closed_by_user',
  OBJECT_LOST: 'object_lost',
  STREAM_STALLED: 'stream_stalled',
  STREAM_RESTARTED: 'stream_restarted',
  SESSION_EXPIRED: 'session_expired',
  IDLE_TIMEOUT: 'idle_timeout',
  INTERNAL_ERROR: 'internal_error',
  CAPACITY_RECLAIMED: 'capacity_reclaimed',
});

const SERVER_STATES = new Set([
  STATUS.PREPARING, STATUS.READY, STATUS.TRACKING, STATUS.LOST, STATUS.ENDED,
]);
const ENDED_REASONS = new Set(Object.values(ENDED_REASON));

/** A session is live when it exists and has not reached a terminal state. */
const LIVE = new Set([STATUS.PREPARING, STATUS.READY, STATUS.TRACKING, STATUS.LOST]);

export const initialState = Object.freeze({
  status: STATUS.IDLE,
  reason: null,            // non-null only when status === 'ended'
  session: null,           // the POST /sessions payload, once it arrives
  framesBehindLive: null,
  notLicensed: false,      // latched; a licence does not change between clicks
  lastError: null,         // { code, message } for the UI to surface
  /**
   * Tracked objects, keyed by `objId`, newest last.
   *
   * v1 caps this at one (`maxObjects: 1`, contract §13.4), but it is a list
   * rather than a single slot on purpose — the user asked for multi-object to be
   * planned now, and raising the cap is meant to be a config change, not a
   * refactor. Phase 5 attaches each object's polygons to these entries.
   */
  objects: [],
});

/** Is this status one where the session is alive on the server? */
export const isLive = (status) => LIVE.has(status);

/** The pill's phase for a given session status (see `buttonState.js`). */
export function buttonPhaseFor(status) {
  if (status === STATUS.PREPARING) return MODE.STARTING;
  if (status === STATUS.READY || status === STATUS.TRACKING || status === STATUS.LOST) {
    return MODE.ACTIVE;
  }
  // `ended` maps back to idle: it is terminal, so the only thing left to do is
  // start again. Phase 6 keeps `reason` on screen alongside the idle pill.
  return MODE.IDLE;
}

/**
 * @param {object} state
 * @param {{type: string}} event
 */
export function reduce(state = initialState, event = {}) {
  switch (event.type) {
    /** The user pressed the pill. No session exists yet. */
    case 'start':
      return {
        ...state,
        status: STATUS.PREPARING,
        reason: null,
        session: null,
        framesBehindLive: null,
        lastError: null,
        objects: [],
      };

    /**
     * `POST /sessions` returned 200. Contract §4: a 200 here is a promise that
     * frames are already flowing, which is why the next state is `ready` and
     * not something more tentative.
     */
    case 'started': {
      if (state.status !== STATUS.PREPARING) return state; // stale response
      return {
        ...state, status: STATUS.READY, reason: null, session: event.session || null, objects: [],
      };
    }

    /**
     * `POST /sessions` failed. No session was created (contract §4), so this
     * returns to idle rather than to `ended` — there is nothing to have ended.
     */
    case 'start_failed':
      return {
        ...state,
        status: STATUS.IDLE,
        reason: null,
        session: null,
        notLicensed: state.notLicensed || event.code === 'not_licensed',
        lastError: { code: event.code || 'internal_error', message: event.message || '' },
        objects: [],
      };

    /**
     * An `xray:state` event. Contract §9: ignore anything whose `sessionId` is
     * not the current one — a stale event just after a close is normal, not an
     * error.
     */
    case 'server_state': {
      if (!state.session || event.sessionId !== state.session.sessionId) return state;
      if (!SERVER_STATES.has(event.state)) return state; // unknown vocabulary: ignore, don't crash

      const framesBehindLive = Number.isFinite(event.framesBehindLive)
        ? event.framesBehindLive
        : state.framesBehindLive;

      if (event.state === STATUS.ENDED) {
        return {
          ...state,
          status: STATUS.ENDED,
          // A reason outside §7's exhaustive list is not trusted into the UI's
          // copy table, which has no entry for it; `internal_error` is the one
          // honest fallback.
          reason: ENDED_REASONS.has(event.reason) ? event.reason : ENDED_REASON.INTERNAL_ERROR,
          framesBehindLive,
          // Phase 6's rule, enforced here so no view can opt out of it: the
          // instant a session is over its masks stop being current, and a
          // frozen outline that keeps drawing is a correctness lie.
          objects: [],
        };
      }
      return { ...state, status: event.state, reason: null, framesBehindLive };
    }

    /** The user turned X-ray off, or the component is unmounting. */
    case 'stop':
      return {
        ...state,
        status: STATUS.IDLE,
        reason: null,
        session: null,
        framesBehindLive: null,
        lastError: null,
        objects: [],
      };

    /**
     * Any call answered `404 session_not_found`. Contract §10: treat as `ended`
     * and stop drawing.
     *
     * §7's `ended` reasons are exhaustive and contain no `session_not_found`,
     * so inventing one would put a value into a vocabulary three codebases
     * share. `session_expired` is the nearest truthful reason — the server no
     * longer has the session, which is what expiry looks like from here — and
     * the precise code is preserved in `lastError` so the UI can say the right
     * thing without corrupting `reason`.
     */
    case 'gone': {
      if (!state.session) return state; // nothing to end
      if (event.sessionId && event.sessionId !== state.session.sessionId) return state;
      return {
        ...state,
        status: STATUS.ENDED,
        reason: ENDED_REASON.SESSION_EXPIRED,
        framesBehindLive: null,
        lastError: { code: 'session_not_found', message: event.message || '' },
        objects: [],
      };
    }

    /**
     * `POST /prompt` returned 200 — the server accepted the click and is now
     * tracking something.
     *
     * Ignored unless a live session is holding it, so a response that lands
     * after the user turned X-ray off cannot resurrect an object. Duplicate
     * `objId`s are ignored rather than appended twice; the cap is enforced here
     * as well as client-side so a server that forgets it cannot overfill the UI.
     */
    case 'object_added': {
      if (!isLive(state.status) || !state.session) return state;
      if (!event.objId) return state;
      if (state.objects.some((o) => o.objId === event.objId)) return state;
      const cap = Number.isInteger(state.session.maxObjects) ? state.session.maxObjects : 1;
      if (state.objects.length >= cap) return state;
      return {
        ...state,
        lastError: null,
        objects: [...state.objects, {
          objId: event.objId,
          resolvedSeq: Number.isFinite(event.resolvedSeq) ? event.resolvedSeq : null,
          resolvedOffset: Number.isFinite(event.resolvedOffset) ? event.resolvedOffset : null,
          requestedSeq: Number.isFinite(event.requestedSeq) ? event.requestedSeq : null,
          requestedOffset: Number.isFinite(event.requestedOffset) ? event.requestedOffset : null,
          xNorm: Number.isFinite(event.xNorm) ? event.xNorm : null,
          yNorm: Number.isFinite(event.yNorm) ? event.yNorm : null,
        }],
      };
    }

    /** The click was refused (contract §10's click-time codes). */
    case 'prompt_failed': {
      if (!isLive(state.status)) return state;
      return {
        ...state,
        lastError: {
          code: event.code || 'internal_error',
          message: event.message || '',
          // Marks this as click feedback, so the view anchors it at the click
          // point instead of treating it as a session-level failure.
          at: Number.isFinite(event.xNorm) && Number.isFinite(event.yNorm)
            ? { xNorm: event.xNorm, yNorm: event.yNorm }
            : null,
        },
      };
    }

    /** `DELETE /objects/:objId`, or a Phase 5 lost-object expiry. */
    case 'object_removed': {
      if (!event.objId) return state;
      const objects = state.objects.filter((o) => o.objId !== event.objId);
      return objects.length === state.objects.length ? state : { ...state, objects };
    }

    /** The UI has shown the error; clear it so it does not re-appear. */
    case 'error_dismissed':
      return state.lastError === null ? state : { ...state, lastError: null };

    default:
      return state;
  }
}
