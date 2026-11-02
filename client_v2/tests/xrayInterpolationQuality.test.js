import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { SourceTextModule } from 'node:vm';

/**
 * Does the overlay actually track without visible lag?
 *
 * Plan Phase 5 sets a *look at it* exit: "a mask tracks the fake backend's
 * moving object smoothly, with no visible lag against the video." That needs the
 * Node session's `xray:mask` events, which do not exist yet — so this measures
 * the same claim instead of asserting it.
 *
 * The rig drives the real `maskBuffer` and `polygon` modules with a synthetic
 * object moving at a known velocity, sampled into masks at `XRAY_MODEL_FPS` and
 * read back at display rate, and compares the drawn position against ground
 * truth. It is the number behind the phase, not a substitute for watching it.
 */

async function load(name, link) {
  const source = await readFile(new URL(`../src/xray/${name}`, import.meta.url), 'utf8');
  const module = new SourceTextModule(source);
  await module.link(link ?? (() => { throw new Error(`${name} must stay dependency-free`); }));
  await module.evaluate();
  return module.namespace;
}

const buffer = await load('maskBuffer.js');
const poly = await load('polygon.js');

const MODEL_FPS = 5;        // XRAY_MODEL_FPS, contract §12
const DISPLAY_FPS = 60;     // requestAnimationFrame
const SEGMENT_SEC = 2;
const VELOCITY = 240;       // px/s — a brisk walk across a 1920-wide frame
const RADIUS = 40;

/** Ground-truth centre of the object at media time `t`. */
const truthX = (t) => 200 + VELOCITY * (t - 200);

/** A circular silhouette, traced with a vertex count that varies per frame. */
function trace(t, vertexCount) {
  const cx = truthX(t);
  return Array.from({ length: vertexCount }, (_, i) => {
    const a = (i / vertexCount) * Math.PI * 2;
    return [cx + RADIUS * Math.cos(a), 540 + RADIUS * Math.sin(a)];
  });
}

const centroidX = (ring) => ring.reduce((sum, p) => sum + p[0], 0) / ring.length;

/** A live playlist long enough to cover the run. */
const fragments = Array.from({ length: 8 }, (_, i) => ({
  sn: 100 + i, start: 200 + i * SEGMENT_SEC, duration: SEGMENT_SEC,
}));

/** Media time -> the (seq, offset) the server would stamp a mask with. */
function positionOf(t) {
  const index = Math.floor((t - 200) / SEGMENT_SEC);
  return { seq: 100 + index, offset: Number((t - (200 + index * SEGMENT_SEC)).toFixed(6)) };
}

/** Build the mask buffer the way `useMaskStream` does, including ring prep. */
function buildMasks(from, to) {
  let masks = [];
  let previousRing = null;
  // Vertex counts chosen to vary frame to frame, as SAM3's independent tracing
  // does — the condition the resampling exists to handle.
  const counts = [83, 51, 107, 64, 92, 73, 118, 57];
  let k = 0;
  for (let t = from; t <= to + 1e-9; t += 1 / MODEL_FPS) {
    const ring = poly.prepareRing(trace(t, counts[k % counts.length]), previousRing,
      poly.RING_VERTICES);
    previousRing = ring;
    k += 1;
    const { seq, offset } = positionOf(t);
    masks = buffer.insertMask(masks, { seq, offset, objects: [{ objId: 'obj-a1', ring }] });
  }
  return masks;
}

/**
 * Sample the overlay at display rate and return the error against truth.
 *
 * @param interpolate pass false to model the naive "draw the newest mask"
 *                    approach, for comparison
 */
function measure(masks, from, to, interpolate) {
  let worst = 0;
  let total = 0;
  let samples = 0;
  for (let t = from; t <= to; t += 1 / DISPLAY_FPS) {
    const pick = buffer.maskAt(masks, fragments, t);
    if (!pick || pick.mode !== 'interpolated') continue;
    const fromObject = buffer.objectsById(pick.from).get('obj-a1');
    const toObject = pick.to ? buffer.objectsById(pick.to).get('obj-a1') : null;
    if (!fromObject) continue;

    const ring = interpolate && toObject
      ? poly.lerpRing(fromObject.ring, toObject.ring, pick.t)
      : fromObject.ring;

    const error = Math.abs(centroidX(ring) - truthX(t));
    worst = Math.max(worst, error);
    total += error;
    samples += 1;
  }
  return { worst, mean: total / samples, samples };
}

test('interpolation tracks constant motion to within a pixel', () => {
  const masks = buildMasks(200.0, 201.4);
  const result = measure(masks, 200.2, 201.2, true);

  assert.ok(result.samples > 50, `too few samples to mean anything: ${result.samples}`);
  // Linear motion through a linear interpolator should be near-exact; what is
  // left is arc-length resampling moving vertices slightly around the contour.
  assert.ok(result.worst < 1.0,
    `worst-case error ${result.worst.toFixed(2)}px — expected under 1px`);
  assert.ok(result.mean < 0.5, `mean error ${result.mean.toFixed(2)}px`);
});

test('without interpolation the mask lags by most of a mask interval', () => {
  // This is the number that justifies the whole phase. Holding the newest mask
  // means the overlay is up to one mask interval behind: at 5 masks/s and
  // 240 px/s that is ~48px, which on a 1920-wide frame is plainly visible and is
  // exactly the "looks cheap" failure the plan warns about.
  const masks = buildMasks(200.0, 201.4);
  const naive = measure(masks, 200.2, 201.2, false);
  const smooth = measure(masks, 200.2, 201.2, true);

  const expectedLag = VELOCITY / MODEL_FPS; // 48px
  assert.ok(naive.worst > expectedLag * 0.8,
    `expected a lag near ${expectedLag}px, measured ${naive.worst.toFixed(1)}px`);
  assert.ok(naive.worst > smooth.worst * 20,
    `interpolation should be far better: naive ${naive.worst.toFixed(1)}px `
    + `vs interpolated ${smooth.worst.toFixed(2)}px`);
});

test('the shape keeps its size while moving', () => {
  // A misaligned lerp does not just displace the outline, it collapses it —
  // vertices cut across the interior instead of travelling with the shape. Size
  // is the sensitive measure of correspondence.
  const masks = buildMasks(200.0, 201.4);
  let worstWidthError = 0;
  for (let t = 200.2; t <= 201.2; t += 1 / DISPLAY_FPS) {
    const pick = buffer.maskAt(masks, fragments, t);
    if (!pick || pick.mode !== 'interpolated' || !pick.to) continue;
    const a = buffer.objectsById(pick.from).get('obj-a1');
    const b = buffer.objectsById(pick.to).get('obj-a1');
    const bounds = poly.boundsOf(poly.lerpRing(a.ring, b.ring, pick.t));
    worstWidthError = Math.max(worstWidthError, Math.abs(bounds.w - RADIUS * 2));
  }
  // A 48-vertex polygon inscribes a circle, so it reads very slightly narrow.
  assert.ok(worstWidthError < 2.0,
    `width wandered by ${worstWidthError.toFixed(2)}px — correspondence is off`);
});

test('smoothing does not reintroduce lag', () => {
  // The smoothing control is cosmetic, so it must not move the outline off the
  // object it is smoothing.
  const masks = buildMasks(200.0, 201.4);
  for (const passes of [0, 1, 2]) {
    let worst = 0;
    for (let t = 200.2; t <= 201.2; t += 1 / DISPLAY_FPS) {
      const pick = buffer.maskAt(masks, fragments, t);
      if (!pick || pick.mode !== 'interpolated' || !pick.to) continue;
      const a = buffer.objectsById(pick.from).get('obj-a1');
      const b = buffer.objectsById(pick.to).get('obj-a1');
      const ring = poly.chaikin(poly.lerpRing(a.ring, b.ring, pick.t), passes);
      worst = Math.max(worst, Math.abs(centroidX(ring) - truthX(t)));
    }
    assert.ok(worst < 1.5, `smoothing at ${passes} passes drifted ${worst.toFixed(2)}px`);
  }
});

test('a dropped mask degrades gracefully rather than snapping', () => {
  // Contract §8: Node drops the oldest mask messages under backpressure. The
  // bracket then spans 400ms instead of 200ms, and interpolation should still
  // track — the object is still moving in a straight line between two real
  // measurements.
  const full = buildMasks(200.0, 201.4);
  const gapped = full.filter((m, i) => i !== 3);
  const result = measure(gapped, 200.2, 201.2, true);
  assert.ok(result.worst < 1.0,
    `a dropped mask cost ${result.worst.toFixed(2)}px — expected interpolation to span it`);
});
