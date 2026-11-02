import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { SourceTextModule } from 'node:vm';

const source = await readFile(new URL('../src/xray/maskBuffer.js', import.meta.url), 'utf8');
const module = new SourceTextModule(source);
await module.link(() => { throw new Error('maskBuffer.js must stay dependency-free'); });
await module.evaluate();
const {
  MAX_MASKS, STALE_AFTER_SEC, LOST_FADE_SEC, lostFadeSec, ghostAlpha,
  toMediaTime, comparePositions,
  insertMask, pruneMasks, maskAt, objectsById, acceptsMask,
} = module.namespace;

/** Three 2-second segments, as videoraiq's streaming service emits them. */
const fragments = [
  { sn: 100, start: 200, duration: 2 },
  { sn: 101, start: 202, duration: 2 },
  { sn: 102, start: 204, duration: 2 },
];
const mask = (seq, offset, objects = []) => ({ seq, offset, objects });

// ─────────────────────────── the timeline ───────────────────────────

test('a (seq, offset) pair becomes a media time via the playlist', () => {
  assert.equal(toMediaTime({ seq: 101, offset: 1.24 }, fragments), 203.24);
  assert.equal(toMediaTime({ seq: 100, offset: 0 }, fragments), 200);
});

test('this is why media time is needed and not just ordering', () => {
  // (101, 1.9) and (102, 0.1) are 0.2s apart, and nothing in the pair itself
  // says so — subtracting the offsets would give -1.8. Interpolation needs a
  // ratio, a ratio needs a distance, and only the playlist supplies one.
  const a = toMediaTime({ seq: 101, offset: 1.9 }, fragments);
  const b = toMediaTime({ seq: 102, offset: 0.1 }, fragments);
  assert.equal(Math.round((b - a) * 1000) / 1000, 0.2);
});

test('a mask whose segment has aged out of the playlist is unplaceable', () => {
  // Which is also the signal that it is already in the past: the live window
  // has moved on. Guessing a time for it would put a stale mask on screen.
  assert.equal(toMediaTime({ seq: 7, offset: 1 }, fragments), null);
  assert.equal(toMediaTime({ seq: 101, offset: 1 }, null), null);
  assert.equal(toMediaTime({ seq: 'x', offset: 1 }, fragments), null);
  assert.equal(toMediaTime({ seq: 101, offset: NaN }, fragments), null);
  assert.equal(toMediaTime(null, fragments), null);
});

test('positions order by seq then offset, with no timeline needed', () => {
  assert.equal(comparePositions({ seq: 100, offset: 1 }, { seq: 101, offset: 0 }), -1);
  assert.equal(comparePositions({ seq: 101, offset: 1.5 }, { seq: 101, offset: 0.5 }), 1);
  assert.equal(comparePositions({ seq: 101, offset: 1 }, { seq: 101, offset: 1 }), 0);
});

// ─────────────────────────── insertion ───────────────────────────

test('masks are kept in position order however they arrive', () => {
  // Out-of-order arrival is normal: contract §8 lets Node drop the oldest mask
  // messages under backpressure, and socket.io promises no ordering across a
  // reconnect. Appending blindly would corrupt every bracket lookup after it.
  let masks = [];
  for (const m of [mask(101, 1.0), mask(100, 0.5), mask(102, 0.2), mask(101, 0.2)]) {
    masks = insertMask(masks, m);
  }
  assert.deepEqual(masks.map((m) => [m.seq, m.offset]),
    [[100, 0.5], [101, 0.2], [101, 1.0], [102, 0.2]]);
});

test('a duplicate position replaces the earlier entry', () => {
  let masks = insertMask([], mask(101, 1.0, [{ objId: 'a' }]));
  masks = insertMask(masks, mask(101, 1.0, [{ objId: 'b' }]));
  assert.equal(masks.length, 1);
  assert.equal(masks[0].objects[0].objId, 'b', 'the newer message is the truer one');
});

test('the buffer is bounded, dropping the oldest', () => {
  let masks = [];
  for (let i = 0; i < MAX_MASKS + 5; i += 1) masks = insertMask(masks, mask(100 + i, 0));
  assert.equal(masks.length, MAX_MASKS);
  assert.equal(masks[0].seq, 105, 'oldest dropped, newest kept');
});

test('a mask with no usable position is rejected', () => {
  assert.deepEqual(insertMask([], { seq: 'x', offset: 1 }), []);
  assert.deepEqual(insertMask([], { seq: 101, offset: NaN }), []);
  assert.deepEqual(insertMask([], null), []);
});

test('insertion does not mutate the array it was given', () => {
  const masks = [mask(100, 0)];
  const next = insertMask(masks, mask(101, 0));
  assert.equal(masks.length, 1, 'the draw loop may be reading the old array');
  assert.equal(next.length, 2);
});

// ─────────────────────────── bracketing ───────────────────────────

test('the playhead between two masks interpolates, with the right ratio', () => {
  const masks = [mask(101, 0.0), mask(101, 1.0)]; // 202.0 and 203.0
  const pick = maskAt(masks, fragments, 202.25);
  assert.equal(pick.mode, 'interpolated');
  assert.equal(pick.from.offset, 0.0);
  assert.equal(pick.to.offset, 1.0);
  assert.equal(pick.t, 0.25);
});

test('the ratio is computed across a segment boundary', () => {
  // The case that makes naive offset arithmetic wrong: 1.9 to 0.1 is forward
  // 0.2s, not backward 1.8s.
  const masks = [mask(101, 1.9), mask(102, 0.1)]; // 203.9 and 204.1
  const pick = maskAt(masks, fragments, 204.0);
  assert.equal(pick.mode, 'interpolated');
  assert.ok(Math.abs(pick.t - 0.5) < 1e-6, `expected t=0.5, got ${pick.t}`);
});

test('just past the newest mask, that mask is held rather than moved', () => {
  // `extrapolated`: filling a gap between two measurements is interpolation;
  // guessing where an object WILL be is a different and more dishonest thing.
  const masks = [mask(101, 0.0)];
  const pick = maskAt(masks, fragments, 202.3);
  assert.equal(pick.mode, 'extrapolated');
  assert.equal(pick.to, null);
  assert.equal(pick.t, 0);
});

test('past the stale limit nothing is drawn at all', () => {
  // Phase 6's rule: a frozen outline that keeps drawing is a correctness lie,
  // and this page is where people decide where to put a detection zone.
  const masks = [mask(101, 0.0)];
  assert.notEqual(maskAt(masks, fragments, 202 + STALE_AFTER_SEC - 0.01), null);
  assert.equal(maskAt(masks, fragments, 202 + STALE_AFTER_SEC + 0.01), null);
});

test('before the oldest mask, the oldest is shown rather than nothing', () => {
  // A fresh session, or just after a seek: showing the nearest real mask beats
  // a blank overlay that looks broken.
  const masks = [mask(102, 1.0)]; // 205.0
  const pick = maskAt(masks, fragments, 201.0);
  assert.equal(pick.mode, 'leading');
  assert.equal(pick.from.seq, 102);
});

test('unplaceable masks are skipped, not guessed at', () => {
  const masks = [mask(7, 0.0), mask(101, 0.0), mask(101, 1.0)];
  const pick = maskAt(masks, fragments, 202.5);
  assert.equal(pick.mode, 'interpolated');
  assert.equal(pick.from.seq, 101);
});

test('an empty or unusable buffer draws nothing', () => {
  assert.equal(maskAt([], fragments, 203), null);
  assert.equal(maskAt(null, fragments, 203), null);
  assert.equal(maskAt([mask(101, 0)], fragments, NaN), null);
  assert.equal(maskAt([mask(7, 0)], fragments, 203), null, 'all unplaceable');
});

test('a zero-length span does not divide by zero', () => {
  // Two masks can share a media time if a segment repeats after a reconnect.
  const masks = [mask(101, 0.5), mask(101, 0.5)];
  const pick = maskAt(insertMask(insertMask([], masks[0]), masks[1]), fragments, 202.5);
  assert.ok(pick === null || Number.isFinite(pick.t));
});

// ─────────────────────────── pruning ───────────────────────────

test('pruning keeps one mask behind the playhead', () => {
  // That one is the left-hand end of the bracket being interpolated across.
  // Pruning it would leave only a future mask and nothing to interpolate FROM,
  // which shows up as the outline snapping instead of moving.
  const masks = [mask(100, 0), mask(101, 0), mask(101, 1), mask(102, 0)];
  const kept = pruneMasks(masks, fragments, 203.5); // past 202.0 and 203.0
  assert.deepEqual(kept.map((m) => [m.seq, m.offset]), [[101, 1], [102, 0]]);
  assert.ok(toMediaTime(kept[0], fragments) <= 203.5, 'the first kept mask is behind the playhead');
});

test('pruning keeps everything when the playhead is before the buffer', () => {
  const masks = [mask(101, 0), mask(102, 0)];
  assert.deepEqual(pruneMasks(masks, fragments, 201), masks);
});

test('pruning is a no-op without a playhead', () => {
  const masks = [mask(101, 0)];
  assert.equal(pruneMasks(masks, fragments, NaN), masks);
});

// ─────────────────────────── object pairing ───────────────────────────

test('objects index by objId so two masks can be paired up', () => {
  const index = objectsById(mask(101, 0, [{ objId: 'a', ring: 1 }, { objId: 'b', ring: 2 }]));
  assert.equal(index.size, 2);
  assert.equal(index.get('a').ring, 1);
});

test('objects without an objId are skipped', () => {
  const index = objectsById(mask(101, 0, [{ ring: 1 }, null, { objId: 'b' }]));
  assert.deepEqual([...index.keys()], ['b']);
  assert.equal(objectsById(null).size, 0);
  assert.equal(objectsById({}).size, 0);
});

test('a mask with no drawable objects still advances the timeline', () => {
  // Contract §8: an object absent from a frame is omitted, never sent with an
  // empty mask. So an empty objects list is meaningful — the object left — and
  // the mask must still be stored. Discarding it would leave the previous mask
  // as the newest and make a departed object appear to hang around.
  const masks = insertMask(insertMask([], mask(101, 0, [{ objId: 'a' }])), mask(101, 1, []));
  assert.equal(masks.length, 2);
  const pick = maskAt(masks, fragments, 203.0);
  assert.equal(objectsById(pick.from).size, 0, 'the newest mask is the empty one');
});

// ─────────────── contract §9's session filter ───────────────

test('a mask for the current session is accepted', () => {
  assert.equal(acceptsMask({ sessionId: 'abc', seq: 101, offset: 1.2 }, 'abc'), true);
  assert.equal(acceptsMask({ sessionId: 'abc', seq: 0, offset: 0 }, 'abc'), true,
    'seq 0 and offset 0 are real values');
});

test('a mask for ANOTHER session is rejected', () => {
  // The failure this prevents is not an error — it is another camera's masks
  // drawn over this one, silently. Verified against the real relay with two
  // sessions on one socket: 88 foreign events arrived, 88 were dropped.
  assert.equal(acceptsMask({ sessionId: 'other', seq: 101, offset: 1.2 }, 'abc'), false);
});

test('ambiguity is rejected, never waved through', () => {
  // "Draw it if we are not sure" is how another session's masks reach this
  // camera. Every one of these is a case where identity is not established.
  const good = { sessionId: 'abc', seq: 101, offset: 1.2 };
  assert.equal(acceptsMask(good, null), false, 'no current session');
  assert.equal(acceptsMask(good, undefined), false);
  assert.equal(acceptsMask(good, ''), false);
  assert.equal(acceptsMask(null, 'abc'), false, 'no payload');
  assert.equal(acceptsMask({}, 'abc'), false, 'no sessionId on the payload');
  assert.equal(acceptsMask({ sessionId: undefined, seq: 1, offset: 0 }, 'abc'), false);
});

test('a mask that cannot be placed on the timeline is rejected', () => {
  // Accepting it would only add a buffer entry maskAt must then skip.
  for (const bad of [
    { sessionId: 'abc', seq: 1.5, offset: 0 },
    { sessionId: 'abc', seq: '101', offset: 0 },
    { sessionId: 'abc', seq: 101, offset: NaN },
    { sessionId: 'abc', seq: 101 },
    { sessionId: 'abc', offset: 0 },
  ]) {
    assert.equal(acceptsMask(bad, 'abc'), false, `accepted ${JSON.stringify(bad)}`);
  }
});

test('the filter is not vacuous — it distinguishes two real sessions', () => {
  // The mistake this guards against is in the TEST, not the code: a scenario
  // with only one session cannot exhibit cross-talk, so a passing assertion
  // proves nothing. Both ids here are live and the payloads are otherwise
  // identical, so only the session check can separate them.
  const payloadA = { sessionId: 'a983fae9d8e4f6f1', seq: 101, offset: 0.4 };
  const payloadB = { sessionId: '8215dfcc033d8a78', seq: 101, offset: 0.4 };
  assert.equal(acceptsMask(payloadA, 'a983fae9d8e4f6f1'), true);
  assert.equal(acceptsMask(payloadB, 'a983fae9d8e4f6f1'), false);
  assert.equal(acceptsMask(payloadA, '8215dfcc033d8a78'), false);
  assert.equal(acceptsMask(payloadB, '8215dfcc033d8a78'), true);
});

// ───────────────── the lost fade: the window, and why it exists ─────────────────

test('the absence this fade covers is invisible to the mask stream within 200ms', () => {
  // This is the defect Phase 6 was built on, written down as a test so it cannot
  // quietly come back. Contract §8 keeps `mask` messages flowing while an object
  // is hidden, just without that object in `objects` — and `useMaskStream` stores
  // those empty masks deliberately, so a departed object does not appear to hang
  // around.
  //
  // The consequence: one mask after the object disappears, the bracket under the
  // playhead is a pair of masks mentioning nothing. The overlay's previous `lost`
  // treatment dimmed and pulsed the mask's opacity — but by then there was no
  // object left to apply an opacity to, so it could never run. The mask did not
  // fade on `lost`; it vanished in a single 200 ms step.
  const object = { objId: 'obj-a', ring: [[0, 0], [10, 0], [10, 10], [0, 10]] };
  let masks = [];
  for (const [seq, offset, objects] of [
    [100, 1.0, [object]], [100, 1.2, [object]],
    [100, 1.4, []], [100, 1.6, []], [100, 1.8, []],
  ]) masks = insertMask(masks, mask(seq, offset, objects));

  assert.equal(objectsById(maskAt(masks, fragments, 201.3).from).size, 1);
  assert.equal(objectsById(maskAt(masks, fragments, 201.5).from).size, 0);
  assert.equal(objectsById(maskAt(masks, fragments, 201.9).from).size, 0);

  // So the fade cannot be driven from what is in the current bracket. It has to
  // be driven from a remembered outline plus the elapsed media time — which is
  // what `ghostAlpha` is for, and the ages involved are inside any window.
  assert.ok(ghostAlpha(201.5 - 201.3, lostFadeSec(1)) > 0);
});

test('the three sensitivities are three genuinely different windows', () => {
  // Not a tautology worth skipping: a settings control whose options resolved to
  // the same number would move, report a change, and change nothing — the exact
  // failure the popover's "no confidence slider" note exists to avoid.
  assert.equal(new Set(LOST_FADE_SEC).size, 3);
  assert.ok(lostFadeSec(0) > lostFadeSec(1), 'patient must outlast normal');
  assert.ok(lostFadeSec(1) > lostFadeSec(2), 'normal must outlast eager');

  // At one age, the three windows must give three visibly different answers.
  const atHalfSecond = LOST_FADE_SEC.map((_, i) => ghostAlpha(0.5, lostFadeSec(i)));
  assert.ok(atHalfSecond[0] > atHalfSecond[1], 'patient is still brighter at 0.5s');
  assert.equal(atHalfSecond[2], 0, 'eager (0.35s) is already gone at 0.5s');
});

test('eager still spans more than one missed mask', () => {
  // Contract §12 puts masks 200 ms apart. A window shorter than that would
  // strobe on a single dropped frame — which §8 explicitly permits Node to do
  // under backpressure — so the shortest option must still cover one.
  assert.ok(lostFadeSec(2) > 0.2);
});

test('an unknown sensitivity falls back to normal rather than to nothing', () => {
  for (const bad of [undefined, null, -1, 3, 'eager', NaN]) {
    assert.equal(lostFadeSec(bad), LOST_FADE_SEC[1]);
  }
});

test('the ghost decays from full to exactly nothing', () => {
  const fade = 1.0;
  assert.equal(ghostAlpha(0, fade), 1);
  assert.ok(ghostAlpha(0.25, fade) > ghostAlpha(0.75, fade));
  // Zero at the boundary, not a sliver that lingers: `0` is the overlay's
  // signal to drop the outline and forget the object, so a window that never
  // quite reached it would hold a ghost forever.
  assert.equal(ghostAlpha(fade, fade), 0);
  assert.equal(ghostAlpha(fade + 0.5, fade), 0);
});

test('the ghost clears faster than it arrived', () => {
  // Eased, not linear, on purpose: a long half-visible tail starts to read as a
  // tracked object again, which is the thing the fade is meant to prevent.
  assert.ok(ghostAlpha(0.5, 1.0) < 0.5);
});

test('a backwards playhead drops the ghost instead of drawing the future', () => {
  // A seek backwards puts the playhead behind the sighting. That outline is not
  // stale, it is unrelated to where we now are, and holding it would draw a mask
  // from a moment that has not been reached.
  assert.equal(ghostAlpha(-0.1, 1.0), 0);
});

test('a nonsense age or window draws nothing rather than NaN', () => {
  for (const [age, fade] of [[NaN, 1], [1, NaN], [undefined, 1], [1, 0], [1, -1]]) {
    assert.equal(ghostAlpha(age, fade), 0);
  }
});

test('the fade window and the stale window are separate policies', () => {
  // `STALE_AFTER_SEC` bounds how far past the newest *mask* the playhead may
  // run — a correctness limit on extrapolating the whole stream. The fade bounds
  // how long an object that the stream says is *gone* may still be shown.
  // Merging them would make a user preference able to move a correctness bound.
  assert.notEqual(lostFadeSec(0), STALE_AFTER_SEC);
  assert.ok(lostFadeSec(0) > STALE_AFTER_SEC, 'patient outlasts the stale bound by design');
});
