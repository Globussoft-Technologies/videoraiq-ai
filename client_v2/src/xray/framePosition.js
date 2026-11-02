/**
 * Turning a mouse click into the two things the server needs: *where* in the
 * frame, and *which frame*. Both pure, so both are testable
 * (`tests/xrayFramePosition.test.js`).
 *
 * This is the part of X-ray most likely to be silently wrong, because a bad
 * answer here does not throw — it tracks the wrong thing, or the right thing six
 * seconds too late.
 */

/**
 * How far outside a fragment's own span `currentTime` may sit before we stop
 * trusting that fragment. A frame is 40 ms at 25 fps, so a quarter-second is
 * generous for clock jitter while still rejecting a stale fragment left behind
 * by a reconnect.
 */
export const OFFSET_TOLERANCE_SEC = 0.25;

const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * Normalised click position, `0..1`, against the **native** frame.
 *
 * `rect` is the displayed box of the video. The conversion is a straight
 * normalisation with no letterbox correction, and that is only correct because
 * `DetectionZoneMarking.jsx` renders the `<video>` with **`objectFit: 'fill'`**
 * — the frame is stretched to the box, so a point 30% across the box is a point
 * 30% across the frame whatever the aspect ratios are.
 *
 * **If that CSS ever becomes `contain` or `cover`, this function is wrong** and
 * must subtract the letterbox bars first. The zone-marking code has the same
 * dependency (`stageEventToVideoXY`, `:327`) and would break in the same way, so
 * the two stay consistent either way.
 *
 * Returns `null` rather than `NaN` for a zero-sized box, which is what a click
 * during layout would otherwise produce.
 */
export function normalisedClick(rect, clientX, clientY) {
  if (!rect || !(rect.width > 0) || !(rect.height > 0)) return null;
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
  return {
    xNorm: clamp01((clientX - rect.left) / rect.width),
    yNorm: clamp01((clientY - rect.top) / rect.height),
  };
}

/** A usable HLS fragment has an integer `sn` and finite timing. */
export function isUsableFrag(frag) {
  return !!frag
    // hls.js uses the string 'initSegment' as the sn of an init segment. It is
    // not a media sequence number and must never be sent as `seq`.
    && Number.isInteger(frag.sn)
    && Number.isFinite(frag.start)
    && Number.isFinite(frag.duration)
    && frag.duration > 0;
}

/**
 * The offset into `frag` that `currentTime` represents, or `null` if
 * `currentTime` is not actually inside this fragment (within tolerance).
 */
export function offsetWithinFrag(frag, currentTime, tolerance = OFFSET_TOLERANCE_SEC) {
  if (!isUsableFrag(frag) || !Number.isFinite(currentTime)) return null;
  const offset = currentTime - frag.start;
  if (offset < -tolerance) return null;
  if (offset > frag.duration + tolerance) return null;
  // Clamp the tolerance band itself away: the server resolves to the nearest
  // buffered frame, and a negative offset is not a thing it can resolve.
  if (offset < 0) return 0;
  // Rounded to the millisecond. Subtracting two media timestamps gives values
  // like 1.240000000000009, and there is no reason to put fifteen significant
  // digits on the wire, in a log line, or in the telemetry strip: a frame at
  // 25 fps is 40 ms, so a millisecond is already 40x finer than the server can
  // resolve to.
  return Math.round(offset * 1000) / 1000;
}

/** Find the playlist fragment containing `currentTime`. */
export function fragFromPlaylist(fragments, currentTime, tolerance = OFFSET_TOLERANCE_SEC) {
  if (!Array.isArray(fragments) || !Number.isFinite(currentTime)) return null;
  for (const frag of fragments) {
    if (offsetWithinFrag(frag, currentTime, tolerance) !== null) return frag;
  }
  return null;
}

/**
 * Resolve `(seq, offset)` for the frame on screen right now.
 *
 * `seq` is the segment's `EXT-X-MEDIA-SEQUENCE` number, which hls.js hands over
 * as `frag.sn` — the same number the server identifies a segment by, so **`seq`
 * is exact**. Only `offset` is approximate: the server resolves it to the nearest
 * buffered frame and reports back which one it picked, and contract §5 is
 * explicit that a non-exact match must not be treated as an error.
 *
 * Deliberately *not* citing contract §13.3 for this. That paragraph justifies it
 * by both sides deriving `seq` from the `seg_N.ts` filename, and the service
 * session has since measured that mapping at 62.9% accurate (systematically one
 * segment high through the last third of every segment); it is now done from
 * frame PTS instead, and the user is amending §13.3. None of that changes any
 * wire shape or anything here — the browser's `frag.sn` was always the media
 * sequence number — but the paragraph is no longer safe to lean on.
 *
 * Two sources, in order of authority:
 *
 * 1. **The fragment `FRAG_CHANGED` last reported**, if `currentTime` is still
 *    inside it. This is the most direct statement of "what is on screen".
 * 2. **A playlist search.** `useHlsPlayer` destroys and recreates its `Hls`
 *    instance on a stall or a 404 (`startPlayer()` → `cleanup()` → `new Hls`),
 *    so immediately after a reconnect there may be no `FRAG_CHANGED` yet while
 *    playback has already resumed. Falling back here means a click in that
 *    window still works instead of being refused for a few seconds.
 *
 * If neither source places `currentTime` in a fragment, this returns `null` and
 * the caller must refuse the click **locally**. Sending a guessed offset would
 * spend a round trip to earn a `409 frame_not_buffered`, which the plan forbids
 * auto-retrying — so the user would get a confusing error for a click that was
 * never answerable.
 *
 * @returns {{seq: number, offset: number, source: 'frag_changed'|'playlist'}|null}
 */
export function resolveFramePosition({ lastFrag, fragments, currentTime } = {}) {
  const fromLast = offsetWithinFrag(lastFrag, currentTime);
  if (fromLast !== null) {
    return { seq: lastFrag.sn, offset: fromLast, source: 'frag_changed' };
  }
  const frag = fragFromPlaylist(fragments, currentTime);
  if (frag) {
    return { seq: frag.sn, offset: offsetWithinFrag(frag, currentTime), source: 'playlist' };
  }
  return null;
}

/**
 * The fragment list of the level currently being played, from a live `Hls`
 * instance. Defensive at every step: `levels` can be empty before the manifest
 * parses, `currentLevel` is `-1` until a level is chosen, and `details` is
 * undefined until that level's playlist loads.
 */
export function fragmentsOf(hls) {
  const levels = hls?.levels;
  if (!Array.isArray(levels) || levels.length === 0) return null;
  const index = Number.isInteger(hls.currentLevel) && hls.currentLevel >= 0
    ? hls.currentLevel
    : 0;
  return levels[index]?.details?.fragments ?? null;
}
