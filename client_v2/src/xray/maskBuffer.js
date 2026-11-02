/**
 * The mask buffer: hold incoming masks by `(seq, offset)`, and answer "what
 * should be on screen at the playhead right now?". Pure, tested in
 * `tests/xrayMaskBuffer.test.js`.
 *
 * **The problem `(seq, offset)` creates.** A mask's position is a segment number
 * plus seconds into that segment. That is enough to *order* masks, but not to
 * *measure* between them — and interpolation needs a ratio, which needs a
 * distance. `(101, 1.9)` and `(102, 0.1)` are 0.2 s apart, not 0.8 apart, and
 * nothing in the pair itself says so.
 *
 * So positions are converted to the **video's own media timeline** using the HLS
 * playlist, where every fragment carries `sn` and `start`:
 *
 *     mediaTime = frag(sn === seq).start + offset
 *
 * That is exactly how `framePosition.js` reads the playhead, so masks and
 * `video.currentTime` end up on one axis by construction rather than by a
 * matching pair of assumptions. When a segment has aged out of the live window
 * its fragment is gone from the playlist, which is also the signal that any mask
 * from it is already in the past — so an unresolvable mask is dropped, not
 * guessed at.
 */

/** Keep at most this many masks. At 5/s that is ~2.5 s of history. */
export const MAX_MASKS = 12;

/**
 * How far past the newest mask we will still extrapolate, in seconds.
 *
 * Masks arrive 200 ms apart, so the playhead is normally *between* two of them.
 * Right after the newest one, though, it runs ahead — and for that short window
 * the newest mask is still the truth. Beyond this limit it is not: the stream has
 * stalled or the model has fallen behind, and Phase 6's rule applies — stop
 * drawing rather than show a frozen outline.
 */
export const STALE_AFTER_SEC = 0.6;

/**
 * How long the last known outline of a **departed object** lingers, fading, in
 * seconds — indexed by the popover's `lostSensitivity` (0 patient, 1 normal,
 * 2 eager). Contract §12 puts masks 200 ms apart, so even `eager` spans
 * roughly two missed masks and will not strobe on a single-frame flicker.
 *
 * **This is a different window from `STALE_AFTER_SEC` above, and the two must
 * not be merged.** `STALE_AFTER_SEC` bounds how far past the newest *mask* the
 * playhead may run — a correctness limit on extrapolating the whole stream, and
 * not a preference. This bounds how long an object that the mask stream says is
 * *gone* may still be shown as a ghost. One is about missing messages, the other
 * about a present message that no longer mentions the object.
 *
 * Why it is a user control at all: whether a brief disappearance should leave a
 * trace depends on the camera. An object crossing behind a pillar every few
 * seconds wants `patient`, so the overlay reads as continuous; a doorway where
 * things genuinely leave wants `eager`, so nothing lingers where nothing is.
 * Neither is more correct, which is the definition of a setting.
 *
 * It does **not** change when the server gives up on the track — that is
 * `lostAfterFrames`, decided service-side (contract §7) and not ours to move.
 * The popover copy says so, because a control that implies otherwise is worse
 * than no control.
 */
export const LOST_FADE_SEC = Object.freeze([2.0, 1.0, 0.35]);

/** The fade window for a sensitivity index, defaulting to `normal`. */
export function lostFadeSec(sensitivity) {
  return LOST_FADE_SEC[sensitivity] ?? LOST_FADE_SEC[1];
}

/**
 * How visible a departed object's last outline should be, `1` at the moment it
 * went missing down to `0` when the window runs out. `0` means **draw nothing**.
 *
 * Eased rather than linear so it clears the screen faster than it arrived: the
 * ghost's job is to say "it was here a moment ago", and a long half-visible tail
 * starts to look like a tracked object again, which is the lie this whole phase
 * exists to prevent.
 *
 * A negative age — the playhead moved back behind the sighting, i.e. a seek —
 * returns `0`. That outline is not stale, it is unrelated to where we now are,
 * and holding it would draw a mask from the future.
 */
export function ghostAlpha(ageSec, fadeSec) {
  if (!Number.isFinite(ageSec) || !Number.isFinite(fadeSec)) return 0;
  if (fadeSec <= 0 || ageSec < 0 || ageSec >= fadeSec) return 0;
  return (1 - ageSec / fadeSec) ** 1.5;
}

/** Media time for a `(seq, offset)` pair, or `null` if its segment is gone. */
export function toMediaTime(position, fragments) {
  if (!position || !Number.isFinite(position.offset)) return null;
  if (!Number.isInteger(position.seq) || !Array.isArray(fragments)) return null;
  for (const frag of fragments) {
    if (frag?.sn === position.seq && Number.isFinite(frag.start)) {
      return frag.start + position.offset;
    }
  }
  return null;
}

/** Order two positions without needing a timeline — `seq` then `offset`. */
export function comparePositions(a, b) {
  if (a.seq !== b.seq) return a.seq < b.seq ? -1 : 1;
  if (a.offset === b.offset) return 0;
  return a.offset < b.offset ? -1 : 1;
}

/**
 * Insert a mask, keeping the buffer ordered and bounded.
 *
 * Out-of-order arrival is normal — contract §8 lets Node drop the oldest `mask`
 * messages under backpressure, and socket.io does not promise ordering across
 * reconnects — so this inserts by position rather than appending. A duplicate
 * `(seq, offset)` replaces the earlier entry: the newer message is the more
 * recent truth about that frame.
 */
export function insertMask(masks, mask) {
  if (!mask || !Number.isInteger(mask.seq) || !Number.isFinite(mask.offset)) return masks;

  const next = masks.filter((m) => comparePositions(m, mask) !== 0);
  let i = next.length;
  while (i > 0 && comparePositions(next[i - 1], mask) > 0) i -= 1;
  next.splice(i, 0, mask);

  return next.length > MAX_MASKS ? next.slice(next.length - MAX_MASKS) : next;
}

/**
 * Drop masks the playhead has passed, keeping one behind it.
 *
 * The one behind matters: it is the left-hand end of the bracket being
 * interpolated across. Pruning it would leave only a future mask and nothing to
 * interpolate *from*, which shows up as the outline snapping instead of moving.
 */
export function pruneMasks(masks, fragments, currentMediaTime) {
  if (!Number.isFinite(currentMediaTime)) return masks;

  let lastBehind = -1;
  const timed = masks.map((m) => toMediaTime(m, fragments));
  for (let i = 0; i < masks.length; i += 1) {
    const t = timed[i];
    // A mask whose segment has left the playlist is unplaceable and therefore
    // already in the past; dropping it is the same decision as pruning.
    if (t === null) continue;
    if (t <= currentMediaTime) lastBehind = i;
  }
  if (lastBehind <= 0) {
    // Still keep anything placeable, so a buffer that has not caught up yet is
    // not thrown away.
    return masks.filter((m, i) => timed[i] !== null || i >= masks.length - 1);
  }
  return masks.slice(lastBehind);
}

/**
 * What to draw at `currentMediaTime`.
 *
 * @returns {null | {
 *   from: object, to: object|null, t: number,
 *   mode: 'interpolated'|'extrapolated'|'leading'
 * }}
 *
 * - `interpolated` — the playhead sits between two masks. The normal case, and
 *   the one that makes the overlay track smoothly.
 * - `extrapolated` — the playhead is just past the newest mask, inside
 *   `STALE_AFTER_SEC`. The newest mask is held, not moved: guessing where an
 *   object *will* be is a different and much more dishonest thing than filling a
 *   gap between two things that were measured.
 * - `leading` — the playhead has not reached the oldest mask yet (a fresh
 *   session, or after a seek). The oldest is shown rather than nothing.
 *
 * `null` means draw nothing. Past `STALE_AFTER_SEC` that is the only honest
 * answer: a frozen outline that keeps drawing is a correctness lie, and this
 * page is where people decide where to put a detection zone.
 */
export function maskAt(masks, fragments, currentMediaTime) {
  if (!Array.isArray(masks) || masks.length === 0) return null;
  if (!Number.isFinite(currentMediaTime)) return null;

  const placed = [];
  for (const mask of masks) {
    const t = toMediaTime(mask, fragments);
    if (t !== null) placed.push({ mask, t });
  }
  if (placed.length === 0) return null;

  let before = null;
  let after = null;
  for (const entry of placed) {
    if (entry.t <= currentMediaTime) before = entry;
    else if (after === null) after = entry;
  }

  if (before && after) {
    const span = after.t - before.t;
    const t = span > 0 ? (currentMediaTime - before.t) / span : 0;
    return { from: before.mask, to: after.mask, t, mode: 'interpolated' };
  }
  if (before) {
    if (currentMediaTime - before.t > STALE_AFTER_SEC) return null;
    return { from: before.mask, to: null, t: 0, mode: 'extrapolated' };
  }
  return { from: after.mask, to: null, t: 0, mode: 'leading' };
}

/**
 * Should this `xray:mask` payload be accepted for the session we are on?
 *
 * Contract §9: ignore any event whose `sessionId` is not the current one — a
 * stale event just after a fast close is normal, not an error.
 *
 * Extracted from `useMaskStream` and named so it can be tested, because the live
 * run that first exercised it proved nothing the first time round. That run
 * reported `foreign events ignored = 0` with ONE session open — and a single
 * session cannot produce a foreign event, so the zero was true and carried no
 * information at all about the guard. Re-run against the real relay with two
 * sessions on one socket, 88 genuine foreign events arrived and all 88 were
 * dropped. A live result is a one-off; this is the part that keeps.
 *
 * Deliberately strict: a payload with no `sessionId`, or a current session of
 * `null`, is rejected rather than waved through. "Draw it if we are not sure" is
 * how another session's masks end up on this camera.
 */
export function acceptsMask(payload, currentSessionId) {
  if (!currentSessionId) return false;
  if (!payload || payload.sessionId !== currentSessionId) return false;
  // Position is part of identity here: a mask with no usable (seq, offset)
  // cannot be placed on the timeline, so accepting it would only add an entry
  // that `maskAt` must then skip.
  return Number.isInteger(payload.seq) && Number.isFinite(payload.offset);
}

/** Index objects by `objId` so two masks' objects can be paired up. */
export function objectsById(mask) {
  const out = new Map();
  for (const object of mask?.objects ?? []) {
    if (object?.objId) out.set(object.objId, object);
  }
  return out;
}
