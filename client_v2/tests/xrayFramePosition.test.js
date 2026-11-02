import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { SourceTextModule } from 'node:vm';

const source = await readFile(new URL('../src/xray/framePosition.js', import.meta.url), 'utf8');
const module = new SourceTextModule(source);
await module.link(() => { throw new Error('framePosition.js must stay dependency-free'); });
await module.evaluate();
const {
  OFFSET_TOLERANCE_SEC, normalisedClick, isUsableFrag, offsetWithinFrag,
  fragFromPlaylist, resolveFramePosition, fragmentsOf,
} = module.namespace;

/** A 2-second-segment live playlist, the shape videoraiq's streaming Go service emits. */
const playlist = [
  { sn: 100, start: 200, duration: 2 },
  { sn: 101, start: 202, duration: 2 },
  { sn: 102, start: 204, duration: 2 },
];
const rect = { left: 40, top: 20, width: 800, height: 450 };

// ─────────────────────────── normalisedClick ───────────────────────────

test('a click maps to 0..1 against the displayed box', () => {
  assert.deepEqual(normalisedClick(rect, 40, 20), { xNorm: 0, yNorm: 0 });
  assert.deepEqual(normalisedClick(rect, 840, 470), { xNorm: 1, yNorm: 1 });
  assert.deepEqual(normalisedClick(rect, 440, 245), { xNorm: 0.5, yNorm: 0.5 });
});

test('normalisation is independent of the box size — that is the point', () => {
  // The same fraction of two differently-sized boxes must give the same answer,
  // because the server receives a fraction of the NATIVE frame and never sees
  // the CSS size.
  const small = { left: 0, top: 0, width: 320, height: 180 };
  const large = { left: 0, top: 0, width: 1600, height: 900 };
  assert.deepEqual(normalisedClick(small, 80, 45), normalisedClick(large, 400, 225));
});

test('a click outside the box is clamped, not sent as out of range', () => {
  // Pointer capture and fast drags can deliver a click a pixel or two outside.
  // Contract §5 says 0..1; anything else is a value the server cannot resolve.
  assert.deepEqual(normalisedClick(rect, -500, -500), { xNorm: 0, yNorm: 0 });
  assert.deepEqual(normalisedClick(rect, 99999, 99999), { xNorm: 1, yNorm: 1 });
});

test('a zero-sized box returns null rather than NaN', () => {
  // A click during layout would otherwise produce NaN, which serialises to
  // `null` in JSON and reaches the server as a missing coordinate.
  for (const bad of [null, undefined, { left: 0, top: 0, width: 0, height: 450 },
                     { left: 0, top: 0, width: 800, height: 0 }]) {
    assert.equal(normalisedClick(bad, 10, 10), null);
  }
  assert.equal(normalisedClick(rect, NaN, 10), null);
  assert.equal(normalisedClick(rect, 10, undefined), null);
});

// ─────────────────────────── fragment validity ───────────────────────────

test("hls.js's init segment is never mistaken for a media fragment", () => {
  // hls.js uses the STRING 'initSegment' as that fragment's `sn`. Sending it as
  // `seq` would be a type error on the wire that no test of ours would catch.
  assert.equal(isUsableFrag({ sn: 'initSegment', start: 0, duration: 2 }), false);
  assert.equal(isUsableFrag({ sn: 100, start: 200, duration: 2 }), true);
});

test('a fragment with unusable timing is rejected', () => {
  for (const bad of [
    null, undefined, {},
    { sn: 100.5, start: 200, duration: 2 },
    { sn: 100, start: NaN, duration: 2 },
    { sn: 100, start: 200, duration: 0 },
    { sn: 100, start: 200, duration: -2 },
    { sn: 100, start: 200 },
  ]) {
    assert.equal(isUsableFrag(bad), false, `accepted ${JSON.stringify(bad)}`);
  }
});

// ─────────────────────────── offsetWithinFrag ───────────────────────────

test('offset is measured from the fragment start', () => {
  const frag = { sn: 101, start: 202, duration: 2 };
  assert.equal(offsetWithinFrag(frag, 202), 0);
  assert.equal(offsetWithinFrag(frag, 203.24), 1.24);
  assert.equal(offsetWithinFrag(frag, 204), 2);
});

test('a playhead outside the fragment is rejected, within tolerance', () => {
  const frag = { sn: 101, start: 202, duration: 2 };
  assert.equal(offsetWithinFrag(frag, 201.9), 0, 'inside tolerance, clamped to 0');
  assert.equal(offsetWithinFrag(frag, 204.2), 2.2, 'inside tolerance at the far end');
  assert.equal(offsetWithinFrag(frag, 201.5), null, 'too early');
  assert.equal(offsetWithinFrag(frag, 206), null, 'too late');
  assert.ok(OFFSET_TOLERANCE_SEC > 0.04, 'tolerance must exceed one frame at 25 fps');
});

test('a negative offset is never returned', () => {
  // The server resolves to the nearest buffered frame; "before this segment
  // started" is not something it can resolve.
  const frag = { sn: 101, start: 202, duration: 2 };
  assert.equal(offsetWithinFrag(frag, 201.8), 0);
});

// ─────────────────────────── playlist search ───────────────────────────

test('the playlist search finds the fragment containing the playhead', () => {
  assert.equal(fragFromPlaylist(playlist, 203)?.sn, 101);
  assert.equal(fragFromPlaylist(playlist, 200.1)?.sn, 100);
  assert.equal(fragFromPlaylist(playlist, 205.9)?.sn, 102);
});

test('a playhead outside the whole playlist finds nothing', () => {
  assert.equal(fragFromPlaylist(playlist, 150), null);
  assert.equal(fragFromPlaylist(playlist, 999), null);
  assert.equal(fragFromPlaylist(null, 203), null);
  assert.equal(fragFromPlaylist([], 203), null);
  assert.equal(fragFromPlaylist(playlist, NaN), null);
});

// ─────────────────────────── resolveFramePosition ───────────────────────────

test('the FRAG_CHANGED fragment wins when the playhead is still inside it', () => {
  const r = resolveFramePosition({
    lastFrag: { sn: 101, start: 202, duration: 2 }, fragments: playlist, currentTime: 203.24,
  });
  assert.deepEqual(r, { seq: 101, offset: 1.24, source: 'frag_changed' });
});

test('a stale FRAG_CHANGED fragment falls back to the playlist', () => {
  // This is the reconnect case. useHlsPlayer destroys and rebuilds its Hls
  // instance on a stall or 404, so `lastFrag` can describe a timeline that no
  // longer contains the playhead. Trusting it would send a `seq` from before
  // the reconnect — a wrong moment in time, with nothing to signal the error.
  const r = resolveFramePosition({
    lastFrag: { sn: 7, start: 14, duration: 2 }, fragments: playlist, currentTime: 205,
  });
  assert.deepEqual(r, { seq: 102, offset: 1, source: 'playlist' });
});

test('no fragment at all resolves to null, so the click can be refused locally', () => {
  // Returning a guess here would spend a round trip to earn a
  // `409 frame_not_buffered`, which the plan forbids auto-retrying — so the user
  // would see a confusing error for a click that was never answerable.
  assert.equal(resolveFramePosition({ lastFrag: null, fragments: null, currentTime: 203 }), null);
  assert.equal(resolveFramePosition({ lastFrag: null, fragments: playlist, currentTime: 50 }), null);
  assert.equal(resolveFramePosition({}), null);
  assert.equal(resolveFramePosition(), null);
});

test('an init segment as lastFrag does not poison the result', () => {
  const r = resolveFramePosition({
    lastFrag: { sn: 'initSegment', start: 0, duration: 2 }, fragments: playlist, currentTime: 203,
  });
  assert.equal(r.seq, 101, 'must fall through to the playlist');
  assert.equal(r.source, 'playlist');
});

test('seq is an integer and offset a finite non-negative number, always', () => {
  for (const t of [200, 200.001, 201.999, 203, 204, 205.999]) {
    const r = resolveFramePosition({ lastFrag: null, fragments: playlist, currentTime: t });
    assert.ok(Number.isInteger(r.seq), `seq not an integer at t=${t}`);
    assert.ok(Number.isFinite(r.offset) && r.offset >= 0, `bad offset at t=${t}`);
  }
});

// ─────────────────────────── fragmentsOf ───────────────────────────

test('fragmentsOf reads the level actually being played', () => {
  const hls = {
    currentLevel: 1,
    levels: [{ details: { fragments: ['wrong'] } }, { details: { fragments: playlist } }],
  };
  assert.equal(fragmentsOf(hls), playlist);
});

test('fragmentsOf survives every state hls.js passes through while starting', () => {
  // `levels` is empty before the manifest parses, `currentLevel` is -1 until a
  // level is chosen, and `details` is undefined until that playlist loads. A
  // click during any of those must refuse, not throw.
  assert.equal(fragmentsOf(null), null);
  assert.equal(fragmentsOf({}), null);
  assert.equal(fragmentsOf({ levels: [] }), null);
  assert.equal(fragmentsOf({ levels: [{}], currentLevel: -1 }), null);
  assert.equal(fragmentsOf({ levels: [{ details: {} }], currentLevel: 0 }), null);
  // currentLevel -1 means "not chosen yet", so level 0 is the honest guess
  // rather than an error.
  assert.equal(fragmentsOf({ currentLevel: -1, levels: [{ details: { fragments: playlist } }] }),
    playlist);
});
