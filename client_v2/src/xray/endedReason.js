/**
 * What the user is told when a session ends, one entry per contract §7 reason.
 * Pure data plus one lookup — no React, no DOM — so the table is testable
 * (`tests/xrayEndedReason.test.js`) and so the copy lives somewhere a person can
 * read it without reading a component.
 *
 * **Why every reason gets its own card.** Until Phase 6 an ended session showed
 * the raw machine reason in the status chip for four seconds and then cleared
 * itself on a timer. That is two separate failures of honesty: `object_lost`
 * and `capacity_reclaimed` are completely different events that the user must
 * respond to differently, and a message that removes itself before it is read
 * leaves someone staring at a stream with no mask and no explanation.
 *
 * Reason keys are written as literals rather than imported from `session.js`,
 * which would drag `buttonState.js` in behind it. The drift that invites is
 * closed by a test instead: every value in `ENDED_REASON` must have a card, and
 * every card must name a real reason — a cross-check in both directions, which
 * is stronger than an import would be.
 */

/** How loud the card is. Severity, not decoration — see the note on each. */
export const TONE = Object.freeze({
  /** An expected ending. Nothing went wrong; the user just needs to know. */
  NOTICE: 'notice',
  /** Something outside the user's control interrupted it. */
  WARN: 'warn',
  /** A real fault. */
  ERROR: 'error',
});

/**
 * `ended` is terminal (contract §7) — the service has freed the GPU state, so
 * there is no session left to click into. Every way back is therefore a *new*
 * session, and the action labels say what the user gets rather than what the
 * code does.
 */
const CARDS = Object.freeze({
  object_lost: {
    reason: 'object_lost',
    tone: TONE.NOTICE,
    title: 'Lost the object',
    detail: 'It stayed out of sight for too long, so tracking stopped. Pick another object to start again.',
    action: 'Track another object',
  },

  closed_by_user: {
    reason: 'closed_by_user',
    tone: TONE.NOTICE,
    // Reaches this tab only when something *else* closed the session — another
    // tab, or the server's `close_session` fast path. The user's own press on
    // the pill never gets here: that path goes straight to idle without a
    // session to end.
    title: 'X-Ray was closed',
    detail: 'This session was closed somewhere else — another tab, or the server releasing it.',
    action: 'Start X-Ray again',
  },

  stream_stalled: {
    reason: 'stream_stalled',
    tone: TONE.WARN,
    title: 'Camera stream interrupted',
    detail: 'The camera stopped sending frames, so there was nothing left to track against.',
    action: 'Restart X-Ray',
  },

  stream_restarted: {
    reason: 'stream_restarted',
    tone: TONE.WARN,
    title: 'Camera stream restarted',
    // Not padding: the user's next question is "why does a reconnect end my
    // track", and §13.2's answer is that frame numbering is only meaningful
    // within one continuous rendition.
    detail: 'The stream reconnected, which restarts the frame numbering X-Ray tracks against.',
    action: 'Restart X-Ray',
  },

  session_expired: {
    reason: 'session_expired',
    tone: TONE.WARN,
    title: 'X-Ray session timed out',
    // No duration quoted: `XRAY_SESSION_MAX_SEC` is configurable, and a number
    // in the copy would be wrong on any site that changed it.
    detail: 'Long sessions are closed automatically so the GPU is free for other cameras.',
    action: 'Restart X-Ray',
  },

  idle_timeout: {
    reason: 'idle_timeout',
    tone: TONE.WARN,
    title: 'X-Ray session timed out',
    // This page heartbeats every 10 s against a 45 s reap (contract §10), so an
    // idle timeout arriving at a page that is still open means the beats were
    // not landing — which is a network symptom, and worth saying.
    detail: 'X-Ray stopped hearing from this page for long enough to release the session — usually a brief network drop.',
    action: 'Restart X-Ray',
  },

  internal_error: {
    reason: 'internal_error',
    tone: TONE.ERROR,
    title: 'X-Ray stopped unexpectedly',
    detail: 'Something went wrong on the X-Ray server. Starting again usually works.',
    action: 'Try again',
  },

  capacity_reclaimed: {
    reason: 'capacity_reclaimed',
    tone: TONE.WARN,
    title: 'X-Ray is busy',
    detail: 'Another camera needed the slot this session was holding. Try again shortly.',
    action: 'Try again',
  },
});

/**
 * Not a §7 reason — a distinct card for the one case the reducer deliberately
 * blurs. `session_not_found` has no entry in §7's exhaustive list, so inventing
 * one would put a value into a vocabulary three codebases share; the reducer
 * maps it to the nearest truthful reason (`session_expired`) and keeps the real
 * code in `lastError`. This is the UI half of that bargain: the vocabulary stays
 * clean and the user still gets the accurate sentence.
 */
const SESSION_NOT_FOUND = Object.freeze({
  reason: 'session_expired',
  errorCode: 'session_not_found',
  tone: TONE.WARN,
  title: 'X-Ray session is no longer open',
  detail: 'The server no longer has this session, so tracking has stopped.',
  action: 'Restart X-Ray',
});

/** Every card, for tests and for anyone auditing the copy. */
export const ENDED_CARDS = Object.freeze({ ...CARDS, session_not_found: SESSION_NOT_FOUND });

/**
 * The card for an ended session.
 *
 * @param {string|null} reason     contract §7's `ended` reason
 * @param {string|null} errorCode  `lastError.code`, which distinguishes the
 *                                 `session_not_found` flavour of `session_expired`
 * @returns {{reason: string, tone: string, title: string, detail: string, action: string}}
 *
 * Falls back to the `internal_error` card rather than returning null: a session
 * has demonstrably ended, so *some* explanation is owed, and an unknown reason
 * is itself an internal error from the user's point of view. The reducer already
 * refuses reasons outside §7, so this fallback is belt and braces.
 */
export function endedCardFor(reason, errorCode = null) {
  if (reason === 'session_expired' && errorCode === 'session_not_found') {
    return SESSION_NOT_FOUND;
  }
  return CARDS[reason] ?? CARDS.internal_error;
}
