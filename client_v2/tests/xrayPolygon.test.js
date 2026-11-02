import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { SourceTextModule } from 'node:vm';

const source = await readFile(new URL('../src/xray/polygon.js', import.meta.url), 'utf8');
const module = new SourceTextModule(source);
await module.link(() => { throw new Error('polygon.js must stay dependency-free'); });
await module.evaluate();
const {
  RING_VERTICES, isRing, perimeter, topmostIndex, rotateRing, resampleRing,
  canonicaliseRing, bestRotation, prepareRing, lerpRing, chaikin,
  smoothingPasses, boundsOf, centroidOf, isTeleport, blendRings,
} = module.namespace;

/** A unit square, clockwise from the top-left. */
const square = [[0, 0], [10, 0], [10, 10], [0, 10]];
const close = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

// ─────────────────────────── validity ───────────────────────────

test('a ring needs three finite points', () => {
  assert.equal(isRing(square), true);
  for (const bad of [null, undefined, [], [[0, 0]], [[0, 0], [1, 1]],
                     [[0, 0], [1, 1], [NaN, 2]], [[0, 0], [1, 1], ['a', 2]],
                     [[0, 0], [1, 1], [Infinity, 2]], 'square']) {
    assert.equal(isRing(bad), false, `accepted ${JSON.stringify(bad)}`);
  }
});

test('perimeter closes the ring', () => {
  assert.equal(perimeter(square), 40, 'a 10x10 square is 40 around, not 30');
});

// ─────────────────────────── canonical start ───────────────────────────

test('the canonical start is the topmost vertex, ties broken on x', () => {
  // Image coordinates: y grows downward, so "topmost" is the smallest y.
  assert.equal(topmostIndex([[5, 9], [1, 2], [8, 2], [3, 7]]), 1, 'leftmost of the tied pair');
  assert.equal(topmostIndex([[5, 9], [8, 2], [1, 2]]), 2);
});

test('the canonical start does not depend on the input order', () => {
  // SAM3 starts tracing wherever it likes, so the same shape can arrive rotated.
  // If canonicalisation depended on input order, correspondence would be
  // arbitrary and the interpolation would shear instead of morph.
  const a = canonicaliseRing(square, 8);
  for (let k = 1; k < square.length; k += 1) {
    const rotated = canonicaliseRing(rotateRing(square, k), 8);
    for (let i = 0; i < 8; i += 1) {
      assert.ok(close(a[i][0], rotated[i][0], 1e-9) && close(a[i][1], rotated[i][1], 1e-9),
        `rotation ${k} gave a different canonical ring at vertex ${i}`);
    }
  }
});

test('rotateRing is a rotation, not a reorder', () => {
  assert.deepEqual(rotateRing(square, 0), square);
  assert.deepEqual(rotateRing(square, 1), [[10, 0], [10, 10], [0, 10], [0, 0]]);
  assert.deepEqual(rotateRing(square, 4), square, 'full turn');
  assert.deepEqual(rotateRing(square, -1), [[0, 10], [0, 0], [10, 0], [10, 10]], 'negative wraps');
});

// ─────────────────────────── resampling ───────────────────────────

test('resampling produces exactly n vertices, whatever the input count', () => {
  // This is the whole reason the module exists: SAM3 ring length changes frame
  // to frame, and a lerp needs both sides to match.
  for (const n of [3, 8, 12, RING_VERTICES, 96]) {
    assert.equal(resampleRing(square, n).length, n);
  }
  const blob = Array.from({ length: 137 }, (_, i) => {
    const a = (i / 137) * Math.PI * 2;
    return [50 + 20 * Math.cos(a), 50 + 30 * Math.sin(a)];
  });
  assert.equal(resampleRing(blob, RING_VERTICES).length, RING_VERTICES);
});

test('resampling spaces vertices by arc length, not by index', () => {
  // A square resampled to 4 should land on the corners; to 8, on corners and
  // edge midpoints. Index-wise resampling of an unevenly-vertexed ring would
  // crowd detail and starve the rest, and the crowding would move each frame.
  const four = resampleRing(square, 4);
  assert.deepEqual(four.map(([x, y]) => [Math.round(x), Math.round(y)]),
    [[0, 0], [10, 0], [10, 10], [0, 10]]);

  const eight = resampleRing(square, 8);
  assert.deepEqual(eight.map(([x, y]) => [Math.round(x), Math.round(y)]),
    [[0, 0], [5, 0], [10, 0], [10, 5], [10, 10], [5, 10], [0, 10], [0, 5]]);
});

test('resampling an unevenly-vertexed ring still spaces evenly', () => {
  // Same square, but with three extra vertices crammed along the top edge.
  const lumpy = [[0, 0], [1, 0], [2, 0], [3, 0], [10, 0], [10, 10], [0, 10]];
  const out = resampleRing(lumpy, 4);
  assert.deepEqual(out.map(([x, y]) => [Math.round(x), Math.round(y)]),
    [[0, 0], [10, 0], [10, 10], [0, 10]], 'the lumps must not pull the samples');
});

test('a degenerate ring resamples to null rather than NaN', () => {
  // All-identical vertices have no arc length to walk. Dividing by that
  // perimeter would give NaN coordinates, which canvas silently refuses to draw
  // — a mask that vanishes with no error anywhere.
  assert.equal(resampleRing([[5, 5], [5, 5], [5, 5]], 8), null);
  assert.equal(resampleRing(square, 2), null, 'fewer than 3 output vertices is not a ring');
  assert.equal(resampleRing(null, 8), null);
});

// ─────────────────────────── alignment ───────────────────────────

test('bestRotation undoes a known rotation — note the direction', () => {
  // The offset returned is what you PASS to rotateRing to realign, not the
  // misalignment itself. rotateRing shifts forward, so undoing a shift of s
  // needs n - s. Asserting the round-trip instead of the raw number keeps this
  // test from encoding the sign confusion it exists to catch.
  const n = 12;
  const ring = resampleRing(square, n);
  for (const shift of [0, 1, 5, 11]) {
    const shifted = rotateRing(ring, shift);
    const offset = bestRotation(ring, shifted);
    assert.equal(offset, (n - shift) % n, `wrong offset for a shift of ${shift}`);
    assert.deepEqual(rotateRing(shifted, offset), ring,
      `realigning a shift of ${shift} did not restore the original order`);
  }
});

test('alignment survives the shape moving as well as rotating', () => {
  // Between two masks an object has both moved and been re-traced from a
  // different start vertex. Translation must not confuse the rotation search.
  const n = 12;
  const ring = resampleRing(square, n);
  const moved = rotateRing(ring, 4).map(([x, y]) => [x + 1.5, y - 0.8]);
  assert.equal(bestRotation(ring, moved), (n - 4) % n);
});

test('prepareRing aligns a new ring to the previous one', () => {
  // The defect this prevents: the topmost vertex hops between frames — a raised
  // arm, a turned head — and a hop of even a few vertices makes the whole
  // outline visibly swirl as it interpolates.
  const previous = canonicaliseRing(square, 12);
  const hopped = rotateRing(square, 2); // same shape, different trace start
  const prepared = prepareRing(hopped, previous, 12);
  for (let i = 0; i < 12; i += 1) {
    assert.ok(close(prepared[i][0], previous[i][0], 1e-6)
      && close(prepared[i][1], previous[i][1], 1e-6),
      `vertex ${i} not aligned to the previous ring`);
  }
});

test('prepareRing with no previous ring just canonicalises', () => {
  assert.deepEqual(prepareRing(square, null, 8), canonicaliseRing(square, 8));
  assert.equal(prepareRing(null, null, 8), null);
});

test('prepareRing ignores a previous ring of a different length', () => {
  const prepared = prepareRing(square, canonicaliseRing(square, 7), 12);
  assert.equal(prepared.length, 12, 'must not try to align across lengths');
});

// ─────────────────────────── interpolation ───────────────────────────

test('lerpRing walks vertex by vertex and clamps t', () => {
  const a = [[0, 0], [10, 0], [10, 10]];
  const b = [[2, 2], [12, 2], [12, 12]];
  assert.deepEqual(lerpRing(a, b, 0), a);
  assert.deepEqual(lerpRing(a, b, 1), b);
  assert.deepEqual(lerpRing(a, b, 0.5), [[1, 1], [11, 1], [11, 11]]);
  assert.deepEqual(lerpRing(a, b, -5), a, 't below 0 clamps');
  assert.deepEqual(lerpRing(a, b, 5), b, 't above 1 clamps');
});

test('lerpRing degrades safely when a side is missing or mismatched', () => {
  const a = [[0, 0], [10, 0], [10, 10]];
  assert.deepEqual(lerpRing(null, a, 0.5), a);
  assert.deepEqual(lerpRing(a, null, 0.5), a);
  assert.deepEqual(lerpRing(a, [[0, 0], [1, 1]], 0.5), a, 'mismatched lengths hold `from`');
  assert.equal(lerpRing(null, null, 0.5), null);
});

test('interpolation is the midpoint of a real translation', () => {
  // The behaviour the feature depends on: masks arrive 200 ms apart, so a
  // halfway frame must put the outline halfway, not at either end.
  const from = canonicaliseRing(square, RING_VERTICES);
  const to = canonicaliseRing(square.map(([x, y]) => [x + 40, y]), RING_VERTICES);
  const mid = lerpRing(from, to, 0.5);
  const bounds = boundsOf(mid);
  assert.ok(close(bounds.x, 20, 1e-6), `expected x=20, got ${bounds.x}`);
  assert.ok(close(bounds.w, 10, 1e-6), 'the shape must not grow while moving');
});

// ─────────────────────────── smoothing ───────────────────────────

test('chaikin doubles the vertex count per pass and is capped at two', () => {
  assert.equal(chaikin(square, 0).length, 4);
  assert.equal(chaikin(square, 1).length, 8);
  assert.equal(chaikin(square, 2).length, 16);
  assert.equal(chaikin(square, 9).length, 16, 'capped, so a slider cannot explode the count');
});

test('smoothing never moves the outline outside the original shape', () => {
  // Corner-cutting is cosmetic. If it could push the outline outward it would be
  // asserting detection where there was none.
  const smoothed = chaikin(square, 2);
  const b = boundsOf(smoothed);
  assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= 10 && b.y + b.h <= 10,
    `smoothing escaped the original bounds: ${JSON.stringify(b)}`);
});

test('the smoothing slider maps to 0, 1 or 2 passes', () => {
  assert.equal(smoothingPasses(0), 0);
  assert.equal(smoothingPasses(0.2), 0);
  assert.equal(smoothingPasses(0.45), 1);
  assert.equal(smoothingPasses(0.66), 1);
  assert.equal(smoothingPasses(0.9), 2);
  assert.equal(smoothingPasses(1), 2);
});

// ─────────────────────────── bounds ───────────────────────────

test('boundsOf is the axis-aligned box', () => {
  assert.deepEqual(boundsOf(square), { x: 0, y: 0, w: 10, h: 10 });
  assert.deepEqual(boundsOf([[-5, 3], [7, -2], [1, 9]]), { x: -5, y: -2, w: 12, h: 11 });
  assert.equal(boundsOf(null), null);
});

// ─────────────────────── the end-to-end property ───────────────────────

test('two differently-vertexed traces of a moving shape interpolate cleanly', () => {
  // The realistic case, start to finish: SAM3 traces the same object twice with
  // different vertex counts and different start points, and the object has moved.
  const traceA = Array.from({ length: 83 }, (_, i) => {
    const a = (i / 83) * Math.PI * 2;
    return [100 + 25 * Math.cos(a), 200 + 45 * Math.sin(a)];
  });
  const traceB = Array.from({ length: 51 }, (_, i) => {
    const a = (i / 51) * Math.PI * 2 + 1.1; // different trace start
    return [130 + 25 * Math.cos(a), 200 + 45 * Math.sin(a)];
  });

  const ringA = prepareRing(traceA, null, RING_VERTICES);
  const ringB = prepareRing(traceB, ringA, RING_VERTICES);
  assert.equal(ringA.length, ringB.length);

  const mid = lerpRing(ringA, ringB, 0.5);
  const b = boundsOf(mid);
  // Halfway between centres 100 and 130, and the ellipse must keep its size
  // rather than collapsing — collapse is what a misaligned lerp looks like.
  assert.ok(Math.abs((b.x + b.w / 2) - 115) < 1.5, `centre drifted to ${b.x + b.w / 2}`);
  assert.ok(Math.abs(b.w - 50) < 4, `width collapsed to ${b.w}, expected ~50`);
  assert.ok(Math.abs(b.h - 90) < 5, `height collapsed to ${b.h}, expected ~90`);
});

// ─────────── discontinuity, found on live relay traffic ───────────

test('a teleport is judged against the object\'s own size, not a pixel constant', () => {
  // Size-relative because plausible speed scales with apparent size: a lorry
  // filling half the frame crosses hundreds of pixels in 200ms, a distant
  // person cannot.
  const small = resampleRing([[0, 0], [10, 0], [10, 10], [0, 10]], 12);          // 10px
  const big = resampleRing([[0, 0], [400, 0], [400, 400], [0, 400]], 12);        // 400px

  const move = (ring, dx) => ring.map(([x, y]) => [x + dx, y]);

  // 30px is three widths for the small object — a teleport.
  assert.equal(isTeleport(small, move(small, 30)), true);
  // ...and well within one width for the big one — ordinary movement.
  assert.equal(isTeleport(big, move(big, 30)), false);
});

test('ordinary per-mask travel is never mistaken for a teleport', () => {
  // Measured on live traffic: p50 travel 19.8px, p95 24.4px, for a 160x220
  // object. Nothing in that range may trip the guard, or normal tracking would
  // snap instead of interpolating and look worse than before the fix.
  const ring = resampleRing([[0, 0], [160, 0], [160, 220], [0, 220]], 48);
  for (const dx of [0, 5, 19.8, 24.4, 60, 120]) {
    assert.equal(isTeleport(ring, ring.map(([x, y]) => [x + dx, y])), false,
      `${dx}px of travel wrongly flagged`);
  }
  // The measured wrap was 1386px — unambiguous.
  assert.equal(isTeleport(ring, ring.map(([x, y]) => [x + 1386, y])), true);
});

test('blendRings interpolates normally but snaps across a discontinuity', () => {
  const ring = resampleRing([[0, 0], [160, 0], [160, 220], [0, 220]], 48);
  const near = ring.map(([x, y]) => [x + 20, y]);
  const far = ring.map(([x, y]) => [x + 1386, y]);
  const cx = (r) => r.reduce((s, p) => s + p[0], 0) / r.length;

  // Continuous: a true midpoint.
  assert.ok(Math.abs(cx(blendRings(ring, near, 0.5)) - (cx(ring) + 10)) < 1e-6);

  // Discontinuous: one end or the other, never strung between them. Snapping to
  // the NEARER halves the worst-case error versus holding `from`.
  assert.ok(Math.abs(cx(blendRings(ring, far, 0.2)) - cx(ring)) < 1e-6, 'early -> from');
  assert.ok(Math.abs(cx(blendRings(ring, far, 0.8)) - cx(far)) < 1e-6, 'late -> to');
  // The thing the live run caught: a lerp here would draw the outline sliding
  // through empty space.
  const mid = cx(blendRings(ring, far, 0.49));
  assert.ok(Math.abs(mid - cx(ring)) < 1e-6, 'must not land mid-flight');
});

test('blendRings degrades safely on missing or degenerate input', () => {
  const ring = resampleRing([[0, 0], [10, 0], [10, 10], [0, 10]], 12);
  assert.deepEqual(blendRings(null, ring, 0.5), ring);
  assert.deepEqual(blendRings(ring, null, 0.5), ring);
  assert.equal(blendRings(null, null, 0.5), null);
  // A zero-size mask must not make every step look like a teleport.
  const degenerate = [[5, 5], [5, 5], [5, 5]];
  assert.equal(isTeleport(degenerate, ring), false);
});

test('centroidOf averages the vertices', () => {
  assert.deepEqual(centroidOf([[0, 0], [10, 0], [10, 10], [0, 10]]), [5, 5]);
  assert.equal(centroidOf(null), null);
});

test('the guard cannot see an out-and-back excursion — a known limit', () => {
  // Measured out-of-sample at 240px/s with a deliberate teleport every 25
  // frames: on the 7 brackets the guard fires on it cut mean error 198.8 -> 49.9
  // px and eliminated the smear (7/7 -> 0/7 frames drawn where the object never
  // was). But overall worst case was UNCHANGED at 734px, because the worst
  // bracket was one where the object teleported away and back: the two endpoints
  // are close together, so isTeleport sees nothing, while the true frame in
  // between is far from both.
  //
  // This is structural, not a bug to fix here: two endpoints cannot reveal an
  // excursion that happened between them. It is also much rarer in the real draw
  // path, which brackets ADJACENT masks 200ms apart — an out-and-back there needs
  // two discontinuities inside 200ms, where this held-out method allows 400ms.
  const ring = resampleRing([[0, 0], [160, 0], [160, 220], [0, 220]], 48);
  const sameSpot = ring.map(([x, y]) => [x + 2, y]);
  assert.equal(isTeleport(ring, sameSpot), false,
    'endpoints close together read as continuous, whatever happened between them');

  // What it DOES catch, which is the common case: a one-way jump.
  assert.equal(isTeleport(ring, ring.map(([x, y]) => [x + 714, y])), true);
});

test('across a discontinuity the drawn ring is always one the object really had', () => {
  // The property that justifies the guard, independent of any error metric:
  // never render the outline at a position the object did not occupy. Measured
  // 7/7 violations without it, 0/7 with it.
  const a = resampleRing([[0, 0], [160, 0], [160, 220], [0, 220]], 48);
  const b = a.map(([x, y]) => [x + 714, y]);
  const cx = (r) => r.reduce((s, p) => s + p[0], 0) / r.length;
  for (const t of [0, 0.1, 0.3, 0.49, 0.5, 0.7, 0.9, 1]) {
    const drawn = cx(blendRings(a, b, t));
    const atA = Math.abs(drawn - cx(a)) < 1e-6;
    const atB = Math.abs(drawn - cx(b)) < 1e-6;
    assert.ok(atA || atB, `t=${t} drew the mask at ${drawn.toFixed(1)}, which is neither endpoint`);
  }
});
