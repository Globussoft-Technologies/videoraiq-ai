/**
 * Polygon maths for interpolating between two masks. Pure, and tested in
 * `tests/xrayPolygon.test.js`.
 *
 * **Why this module exists at all.** Masks arrive at `XRAY_MODEL_FPS` (5/s) while
 * the video plays at ~25 fps, so four frames in five have no mask of their own.
 * Drawing the newest mask on the newest video frame makes the outline visibly
 * lag the object in 200 ms steps, which is the difference between this feature
 * reading as magic and reading as cheap. So we interpolate — and interpolating
 * two polygons requires them to have the same number of vertices, in
 * corresponding order.
 *
 * SAM3 gives neither. Each frame's contour is traced independently, so ring
 * length changes frame to frame and the starting vertex is wherever the tracer
 * happened to begin. A naive index-wise lerp between two such rings does not
 * morph the shape — it shears it. Hence: canonicalise (rotate to a stable start,
 * resample to a fixed count), then align to the previous mask, then lerp.
 */

/**
 * Vertices every ring is resampled to. High enough that a human silhouette keeps
 * its shoulders and legs, low enough that the per-mask alignment search below
 * stays trivial: 48x48 comparisons, five times a second.
 */
export const RING_VERTICES = 48;

const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** Is this a usable closed ring: at least a triangle, all finite coordinates? */
export function isRing(ring) {
  return Array.isArray(ring)
    && ring.length >= 3
    && ring.every((p) => Array.isArray(p) && p.length >= 2
      && Number.isFinite(p[0]) && Number.isFinite(p[1]));
}

/** Perimeter of the closed ring. */
export function perimeter(ring) {
  let total = 0;
  for (let i = 0; i < ring.length; i += 1) {
    total += dist(ring[i], ring[(i + 1) % ring.length]);
  }
  return total;
}

/**
 * Index of the ring's topmost vertex — the canonical starting point.
 *
 * Chosen over an angular rule (e.g. "whichever vertex is at -90° from the
 * centroid") because it is deterministic, needs no centroid, and for the things
 * this feature actually tracks — people, vehicles, boxes in a loading bay — the
 * top of the silhouette is the most stable landmark there is. Ties break on `x`
 * so the result never depends on the input's vertex order.
 */
export function topmostIndex(ring) {
  let best = 0;
  for (let i = 1; i < ring.length; i += 1) {
    const [x, y] = ring[i];
    const [bx, by] = ring[best];
    if (y < by || (y === by && x < bx)) best = i;
  }
  return best;
}

/** Rotate a ring so that `start` becomes its first vertex. */
export function rotateRing(ring, start) {
  const n = ring.length;
  const k = ((start % n) + n) % n;
  if (k === 0) return ring.slice();
  return ring.slice(k).concat(ring.slice(0, k));
}

/**
 * Resample a closed ring to exactly `n` vertices, spaced evenly by **arc
 * length**.
 *
 * Arc length, not vertex index: SAM3 puts many vertices on a fiddly edge and few
 * on a straight one, so index-wise resampling would crowd the detail and starve
 * the rest, and the crowding would move between frames.
 */
export function resampleRing(ring, n = RING_VERTICES) {
  if (!isRing(ring) || !(n >= 3)) return null;
  const m = ring.length;

  const seg = new Array(m);
  let total = 0;
  for (let i = 0; i < m; i += 1) {
    seg[i] = dist(ring[i], ring[(i + 1) % m]);
    total += seg[i];
  }
  // A degenerate ring (every vertex identical) has no arc length to walk along.
  if (!(total > 0)) return null;

  const out = new Array(n);
  const step = total / n;
  let i = 0;
  let acc = 0;
  for (let k = 0; k < n; k += 1) {
    const target = k * step;
    while (i < m - 1 && acc + seg[i] <= target) {
      acc += seg[i];
      i += 1;
    }
    const t = seg[i] > 0 ? (target - acc) / seg[i] : 0;
    const a = ring[i];
    const b = ring[(i + 1) % m];
    out[k] = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }
  return out;
}

/** Rotate to the canonical start, then resample to a fixed vertex count. */
export function canonicaliseRing(ring, n = RING_VERTICES) {
  if (!isRing(ring)) return null;
  return resampleRing(rotateRing(ring, topmostIndex(ring)), n);
}

/**
 * The offset to **pass to `rotateRing`** so that `next` lines up with
 * `previous`, by summed squared vertex distance.
 *
 * Note the direction, because it is easy to get backwards: this returns the
 * offset that *undoes* a misalignment, not the misalignment itself. If `next` is
 * `rotateRing(previous, s)`, this returns `n - s`, so that
 * `rotateRing(next, bestRotation(previous, next))` is `previous` again. The
 * round-trip is the property `tests/xrayPolygon.test.js` asserts, precisely
 * because it cannot be read two ways.
 *
 * Canonicalising to the topmost vertex gets correspondence roughly right, but
 * the topmost point can hop — a raised arm, a turned head — and a hop of even a
 * few vertices makes the whole outline visibly swirl as it interpolates. This
 * removes that: O(n²) at n=48 is 2,304 comparisons, run once per arriving mask
 * at 5/s, which is nothing.
 *
 * Both rings must already be the same length.
 */
export function bestRotation(previous, next) {
  if (!previous || !next || previous.length !== next.length) return 0;
  const n = next.length;
  let bestOffset = 0;
  let bestCost = Infinity;
  for (let offset = 0; offset < n; offset += 1) {
    let cost = 0;
    for (let i = 0; i < n; i += 1) {
      const a = previous[i];
      const b = next[(i + offset) % n];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      cost += dx * dx + dy * dy;
      if (cost >= bestCost) break; // early out; most offsets are obviously wrong
    }
    if (cost < bestCost) {
      bestCost = cost;
      bestOffset = offset;
    }
  }
  return bestOffset;
}

/**
 * Prepare an incoming ring for interpolation: canonicalise, then align to the
 * previous mask's ring if there is one.
 */
export function prepareRing(ring, previousRing, n = RING_VERTICES) {
  const canonical = canonicaliseRing(ring, n);
  if (!canonical) return null;
  if (!previousRing || previousRing.length !== canonical.length) return canonical;
  return rotateRing(canonical, bestRotation(previousRing, canonical));
}

/** Vertex-wise linear interpolation. Both rings must be the same length. */
export function lerpRing(a, b, t) {
  if (!a) return b ? b.slice() : null;
  if (!b || a.length !== b.length) return a.slice();
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  const out = new Array(a.length);
  for (let i = 0; i < a.length; i += 1) {
    out[i] = [a[i][0] + (b[i][0] - a[i][0]) * k, a[i][1] + (b[i][1] - a[i][1]) * k];
  }
  return out;
}

/**
 * Chaikin corner-cutting — the "mask smoothing" control.
 *
 * Purely cosmetic: it rounds the outline and damps the per-frame jitter of an
 * independently-traced contour. It never changes which pixels were detected, and
 * the control's own help text says so. Each pass doubles the vertex count, so
 * the cap is two.
 */
export function chaikin(ring, passes = 1) {
  let current = ring;
  const n = Math.max(0, Math.min(2, Math.round(passes)));
  for (let p = 0; p < n; p += 1) {
    const out = new Array(current.length * 2);
    for (let i = 0; i < current.length; i += 1) {
      const a = current[i];
      const b = current[(i + 1) % current.length];
      out[i * 2] = [a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25];
      out[i * 2 + 1] = [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75];
    }
    current = out;
  }
  return current;
}

/** Smoothing slider (0..1) to Chaikin passes. */
export const smoothingPasses = (amount) => (amount > 0.66 ? 2 : amount > 0.22 ? 1 : 0);

/** Centroid of a ring's vertices. */
export function centroidOf(ring) {
  if (!isRing(ring)) return null;
  let x = 0;
  let y = 0;
  for (const p of ring) { x += p[0]; y += p[1]; }
  return [x / ring.length, y / ring.length];
}

/**
 * How far an object may move between two masks before we stop believing it
 * MOVED, as a multiple of its own size.
 *
 * Size-relative rather than a pixel constant, because the plausible speed of a
 * thing scales with how big it looks: a lorry filling half the frame can cross
 * hundreds of pixels in 200 ms, a distant person cannot.
 */
export const TELEPORT_FACTOR = 1.5;

/**
 * True when two masks of the "same" object are too far apart to be one
 * continuous movement.
 *
 * **Found on a live run, not in a unit test.** Interpolating across a teleport
 * does not look like a jump — it looks like the outline *sliding* smoothly
 * across the frame through empty space, because that is precisely what a lerp
 * between two distant shapes draws. Measured against real relay traffic whose
 * object wraps from one edge to the other, the smear was 210 px on a 1920-wide
 * frame: 11% of the width, for a 200 ms interval, every time.
 *
 * Synthetic tests could never have produced this, because the motion I invented
 * was continuous by construction. Real sources are not: a stream restart, a
 * re-acquisition, or SAM3 latching onto a different instance of the same class
 * all move an object discontinuously while keeping its `objId`.
 */
export function isTeleport(a, b, factor = TELEPORT_FACTOR) {
  const ca = centroidOf(a);
  const cb = centroidOf(b);
  if (!ca || !cb) return false;
  const bounds = boundsOf(a);
  if (!bounds) return false;
  // Guard a degenerate bound: a zero-size mask would make every step a teleport.
  const scale = Math.max(bounds.w, bounds.h);
  if (!(scale > 0)) return false;
  return Math.hypot(cb[0] - ca[0], cb[1] - ca[1]) > scale * factor;
}

/**
 * The ring to draw between two masks: interpolated normally, but **snapped to
 * the nearer end** across a discontinuity.
 *
 * Snapping to the nearer rather than holding `from` halves the worst-case error
 * at a teleport, and it is honest in a way a lerp is not — the object really is
 * at one end or the other, never strung between them.
 */
export function blendRings(a, b, t, factor = TELEPORT_FACTOR) {
  if (!a) return b ? b.slice() : null;
  if (!b) return a.slice();
  if (isTeleport(a, b, factor)) return (t < 0.5 ? a : b).slice();
  return lerpRing(a, b, t);
}

/** Axis-aligned bounds, for the corner ticks and the lock-on flourish. */
export function boundsOf(ring) {
  if (!isRing(ring)) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
