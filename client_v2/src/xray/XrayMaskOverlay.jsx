import { useEffect, useRef } from 'react';
import { ghostAlpha, lostFadeSec, maskAt, objectsById, pruneMasks } from './maskBuffer';
import { blendRings, chaikin, smoothingPasses } from './polygon';
import { GLOW, INK, drawObject, drawGhost, drawObjectName } from './overlayPaint';
export { GLOW } from './overlayPaint';
import { fragmentsOf } from './framePosition';
import { canvasViewport } from './overlayViewport';

/** Draw at the displayed size and screen density so text stays sharp in
 * fullscreen. A context transform keeps all mask/label coordinates in source
 * pixels; matching the video timeline and crop geometry is unchanged. */

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

export default function XrayMaskOverlay({
  masksRef, videoRef, hlsRef, width, height, labelsRef, onObjectFrame,
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
  const params = useRef({ glow, smoothing, lostSensitivity, onObjectFrame });
  params.current = { glow, smoothing, lostSensitivity, onObjectFrame };

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef?.current;
    if (!canvas || !video) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    let frame = 0;
    const draw = () => {
      frame = requestAnimationFrame(draw);

      const box = canvas.getBoundingClientRect();
      const viewport = canvasViewport(width, height, box.width, box.height, window.devicePixelRatio);
      if (canvas.width !== viewport.width || canvas.height !== viewport.height) {
        canvas.width = viewport.width;
        canvas.height = viewport.height;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(viewport.scaleX, 0, 0, viewport.scaleY, 0, 0);
      const {unit} = viewport;

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
          lockAge !== null && lockAge < 1 ? lockAge : null, unit,
        );
        params.current.onObjectFrame?.(objId, ring);
        drawObjectName(ctx,drawn,labelsRef?.current.get(objId) || 'Identifying…',
          INK[index % INK.length],width,height,unit);
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
        drawGhost(ctx, ring, INK[remembered.index % INK.length], style, alpha, unit);
      }

      seen.current = nextSeen;
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [masksRef, videoRef, hlsRef, width, height, labelsRef]);

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
