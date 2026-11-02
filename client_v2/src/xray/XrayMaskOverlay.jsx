import { useEffect, useRef } from 'react';
import { ghostAlpha, lostFadeSec, maskAt, objectsById, pruneMasks } from './maskBuffer';
import { blendRings, boundsOf, chaikin, smoothingPasses } from './polygon';
import { fragmentsOf } from './framePosition';

/**
 * Draws the masks. A transparent `<canvas>` at the video's **native** resolution,
 * CSS-scaled to the displayed size, redrawn from `requestAnimationFrame`.
 *
 * Canvas rather than SVG because this redraws 60 times a second with a blurred
 * bloom under every outline: `shadowBlur` is one compositing pass, where an SVG
 * `feGaussianBlur` would re-run a filter graph each frame. The plan asks for a
 * canvas for the same reason.
 *
 * Mask coordinates arrive in **source pixels** (contract §8), and the canvas
 * backing store is sized in source pixels, so there is **no coordinate
 * conversion here at all** — the CSS box does the scaling. That is deliberate: a
 * conversion is a place to be silently wrong, and this is the one layer that
 * could avoid having one.
 */

/**
 * The approved treatment: one soft-glow look, three intensities, Bold default.
 *
 * Four stacked layers, scaled together:
 *   `halo`    blurred bloom under the outline, so the mask reads against both a
 *             dark floor and a lit crate
 *   `fill`    translucent body, top-to-bottom gradient
 *   `stroke`  the crisp outline
 *   `rim`     a tight white inner line — the layer that actually makes it pop
 */
export const GLOW = Object.freeze({
  soft: { halo: 6, haloAlpha: 0.30, fillTop: 0.20, fillBottom: 0.04, stroke: 2.8, rim: 0.00, tick: 0.62 },
  bold: { halo: 11, haloAlpha: 0.52, fillTop: 0.32, fillBottom: 0.08, stroke: 3.4, rim: 0.55, tick: 0.80 },
  max: { halo: 17, haloAlpha: 0.72, fillTop: 0.44, fillBottom: 0.13, stroke: 4.0, rim: 0.95, tick: 0.95 },
});

/**
 * Mask inks. Cyan is the only accent in `theme/tokens.css` that zone marking
 * never uses — it owns amber for saved zones, blue for an in-progress drawing
 * and green for a line-crossing reference point, and all three can share this
 * canvas with a mask. Magenta is reserved for a second object in v2.
 */
const INK = ['#22d3ee', '#d946ef'];

/** The one-shot lock-on flourish, in seconds. */
const LOCK_MS = 500;
/** Rim breathing: slow and small, so it never competes with the object's motion. */
const BREATHE_RAD_PER_SEC = 1.15;
const BREATHE_DEPTH = 0.08;
/**
 * How visible a ghost is at its brightest — the instant the object goes missing.
 * Well under the live treatment's `1`, because the first job of a ghost is to be
 * recognisably *not* a tracked object.
 */
const GHOST_PEAK = 0.55;

const rgba = (hex, alpha) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
};

function tracePath(ctx, ring) {
  ctx.beginPath();
  ctx.moveTo(ring[0][0], ring[0][1]);
  for (let i = 1; i < ring.length; i += 1) ctx.lineTo(ring[i][0], ring[i][1]);
  ctx.closePath();
}

/** One live object, four layers plus corner ticks. */
function drawObject(ctx, ring, ink, glow, breathe, lockProgress) {
  const bounds = boundsOf(ring);
  if (!bounds) return;

  // 1 — blurred bloom. Stroked, not filled, so the glow hugs the outline rather
  // than washing out the object's interior.
  ctx.save();
  ctx.shadowColor = rgba(ink, glow.haloAlpha * breathe);
  ctx.shadowBlur = glow.halo;
  ctx.strokeStyle = rgba(ink, glow.haloAlpha * breathe);
  ctx.lineWidth = glow.stroke * 2.4;
  ctx.lineJoin = 'round';
  tracePath(ctx, ring);
  ctx.stroke();
  ctx.restore();

  // 2 — translucent body.
  const gradient = ctx.createLinearGradient(0, bounds.y, 0, bounds.y + bounds.h);
  gradient.addColorStop(0, rgba(ink, glow.fillTop));
  gradient.addColorStop(1, rgba(ink, glow.fillBottom));
  ctx.fillStyle = gradient;
  tracePath(ctx, ring);
  ctx.fill();

  // 3 — the crisp outline.
  ctx.strokeStyle = rgba(ink, 0.95);
  ctx.lineWidth = glow.stroke;
  ctx.lineJoin = 'round';
  tracePath(ctx, ring);
  ctx.stroke();

  // 4 — the tight white rim.
  if (glow.rim > 0) {
    ctx.strokeStyle = `rgba(255,255,255,${glow.rim * breathe * 0.55})`;
    ctx.lineWidth = glow.stroke * 0.42;
    tracePath(ctx, ring);
    ctx.stroke();
  }

  // Corner ticks — "locked on" without boxing the object in. During the
  // flourish they snap inward from outside the bounds.
  const ease = lockProgress === null ? 1 : 1 - (1 - lockProgress) ** 3;
  const len = Math.min(bounds.w, bounds.h) * 0.22 * ease;
  const pad = (1 - ease) * Math.min(bounds.w, bounds.h) * 0.16;
  const x0 = bounds.x - pad;
  const y0 = bounds.y - pad;
  const x1 = bounds.x + bounds.w + pad;
  const y1 = bounds.y + bounds.h + pad;

  ctx.strokeStyle = rgba(ink, glow.tick * ease);
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0 + len); ctx.lineTo(x0, y0); ctx.lineTo(x0 + len, y0);
  ctx.moveTo(x1 - len, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + len);
  ctx.moveTo(x1, y1 - len); ctx.lineTo(x1, y1); ctx.lineTo(x1 - len, y1);
  ctx.moveTo(x0 + len, y1); ctx.lineTo(x0, y1); ctx.lineTo(x0, y1 - len);
  ctx.stroke();

  // The flourish's collapsing ring. Fires once, on the `tracking` transition —
  // it marks a real event rather than decorating idle time.
  if (lockProgress !== null && lockProgress < 1) {
    const cx = bounds.x + bounds.w / 2;
    const cy = bounds.y + bounds.h / 2;
    const r = Math.max(bounds.w, bounds.h) * (1.35 - 0.75 * lockProgress);
    ctx.strokeStyle = rgba(ink, 0.75 * (1 - lockProgress));
    ctx.lineWidth = 4 * (1 - lockProgress);
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(1, r), 0, Math.PI * 2);
    ctx.stroke();
  }
}


/**
 * Where an object *was*, for as long as the fade window allows. Deliberately a
 * different kind of mark, not a dimmer version of the same one:
 *
 *   dashed, so it reads as a boundary that is no longer being measured;
 *   no fill, so nothing inside it looks claimed;
 *   no corner ticks and no breathing, which are the two cues that say "locked
 *   on and live".
 *
 * A ghost that was merely a faded `drawObject` would still be a filled, ticked,
 * breathing mask, and at half opacity over a bright floor it would read as a
 * tracked object — precisely the lie this phase exists to remove.
 */
function drawGhost(ctx, ring, ink, glow, alpha) {
  ctx.save();
  ctx.setLineDash([11, 9]);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // A trace of the bloom, so the ghost stays legible against a lit background
  // rather than disappearing into it while still nominally on screen.
  ctx.shadowColor = rgba(ink, glow.haloAlpha * alpha * 0.4);
  ctx.shadowBlur = glow.halo * 0.55;
  ctx.strokeStyle = rgba(ink, 0.85 * alpha);
  ctx.lineWidth = glow.stroke * 0.85;
  tracePath(ctx, ring);
  ctx.stroke();
  ctx.restore();
}

export default function XrayMaskOverlay({
  masksRef, videoRef, hlsRef, width, height,
  glow = 'bold', smoothing = 0.45, lostSensitivity = 1,
}) {
  const canvasRef = useRef(null);
  const lockStart = useRef(null);
  /** objIds drawn live in the last frame, to detect a newly acquired object. */
  const seen = useRef(new Set());
  /**
   * Each object's last live outline and the media time it was last live at —
   * the whole of the state behind the fade.
   *
   * Aged in **media time**, not wall time, because every other position in this
   * module is: the ghost ages at the rate the video advances, so a paused or
   * stalled video holds the ghost exactly as it holds the frame underneath it,
   * and resuming carries on from where it stopped.
   */
  const lastSeen = useRef(new Map());

  // Live values the loop reads, so changing a slider does not restart the loop.
  const params = useRef({ glow, smoothing, lostSensitivity });
  params.current = { glow, smoothing, lostSensitivity };

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef?.current;
    if (!canvas || !video) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    let frame = 0;
    const draw = () => {
      frame = requestAnimationFrame(draw);

      // Source-pixel backing store. The CSS box scales it to the displayed size,
      // so mask coordinates (contract §8: source pixels) are used verbatim.
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const fragments = fragmentsOf(hlsRef?.current);
      const playhead = video.currentTime;

      // Drop what the playhead has gone past, keeping the one mask immediately
      // behind it — that one is the left-hand end of the bracket being
      // interpolated across. Done here rather than on arrival because this is
      // the only place that knows where the playhead is.
      masksRef.current = pruneMasks(masksRef.current, fragments, playhead);

      const pick = maskAt(masksRef.current, fragments, playhead);
      if (!pick) {
        // No mask covers the playhead at all — the stream of masks has stopped,
        // which is a different thing from an object leaving one. Phase 6's rule:
        // stop drawing rather than hold a frozen outline, and that includes the
        // ghosts, which are only honest while masks are still arriving to say
        // the object is absent. Also resets the flourish, so re-acquiring gets
        // its lock-on animation again.
        seen.current = new Set();
        lastSeen.current = new Map();
        lockStart.current = null;
        return;
      }

      const {
        glow: glowName, smoothing: smoothAmount, lostSensitivity: sensitivity,
      } = params.current;
      const style = GLOW[glowName] ?? GLOW.bold;
      const passes = smoothingPasses(smoothAmount);
      const fadeSec = lostFadeSec(sensitivity);
      const nowSec = performance.now() / 1000;

      // Slow rim breathing, so a tracked object never looks like a frozen
      // screenshot — and so a genuinely frozen overlay is obvious.
      const breathe = 1 + BREATHE_DEPTH * Math.sin(nowSec * BREATHE_RAD_PER_SEC);

      const fromObjects = objectsById(pick.from);
      const toObjects = pick.to ? objectsById(pick.to) : null;

      const nextSeen = new Set();
      let index = 0;
      for (const [objId, from] of fromObjects) {
        nextSeen.add(objId);
        if (!seen.current.has(objId)) lockStart.current = performance.now();

        const to = toObjects?.get(objId) ?? null;
        // An object present in `from` but not in `to` is one that left mid-gap.
        // Interpolating toward nothing would stretch it; holding `from` for the
        // last fraction of a gap is the smaller lie, and the ghost below takes
        // over once the playhead passes `to`.
        // `blendRings`, not `lerpRing`: across a discontinuity it snaps to the
        // nearer end instead of drawing the outline sliding through empty
        // space. See isTeleport — measured at 210px of smear on live traffic.
        const ring = to ? blendRings(from.ring, to.ring, pick.t) : from.ring;
        // Remembered before smoothing, so a ghost and the live mask it replaces
        // are the same shape under the same slider.
        lastSeen.current.set(objId, { ring, at: playhead, index });

        const drawn = passes > 0 ? chaikin(ring, passes) : ring;
        const lockAge = lockStart.current === null
          ? null
          : (performance.now() - lockStart.current) / LOCK_MS;
        drawObject(
          ctx, drawn, INK[index % INK.length], style, breathe,
          lockAge !== null && lockAge < 1 ? lockAge : null,
        );
        index += 1;
      }

      /**
       * The fade. An object the mask stream has stopped mentioning keeps its
       * last outline for `fadeSec`, decaying to nothing.
       *
       * Driven by **absence from the mask stream**, not by the session's `lost`
       * state — and that is the correction this phase exists for. Contract §8
       * keeps `mask` messages flowing while an object is hidden, just without
       * that object in `objects`; so from 200 ms after it disappears the current
       * bracket is a pair of masks mentioning nothing, and the `isLost` dimming
       * this replaces had no object left to dim. It could never have run. The
       * mask stream also says the object is gone one `xray:state` round trip
       * before the server's label does, so the stream is what the fade follows.
       */
      for (const [objId, remembered] of [...lastSeen.current]) {
        if (nextSeen.has(objId)) continue;
        const alpha = GHOST_PEAK * ghostAlpha(playhead - remembered.at, fadeSec);
        if (alpha <= 0) {
          lastSeen.current.delete(objId);
          continue;
        }
        const ring = passes > 0 ? chaikin(remembered.ring, passes) : remembered.ring;
        drawGhost(ctx, ring, INK[remembered.index % INK.length], style, alpha);
      }

      seen.current = nextSeen;
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [masksRef, videoRef, hlsRef, width, height]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        // Below the click layer (2) so clicks still land, and pointer-events are
        // off regardless — a mask must never swallow a click meant for the video
        // underneath it.
        zIndex: 1,
        pointerEvents: 'none',
      }}
    />
  );
}
