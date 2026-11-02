import { useCallback, useEffect, useRef } from 'react';
import { useSocket } from '@/context/SocketContext';
import { acceptsMask, insertMask } from './maskBuffer';
import { RING_VERTICES, prepareRing } from './polygon';

/**
 * Receives `xray:mask` and keeps a short buffer of masks ready to interpolate.
 *
 * **Held in a ref, not in state.** Masks arrive 5 times a second; putting them in
 * state would re-render this component and everything under it 5 times a second
 * to feed a canvas that is already redrawing itself at 60 fps from
 * `requestAnimationFrame`. The buffer is mutable data the draw loop reads, which
 * is exactly what a ref is for.
 *
 * Rings are prepared **on arrival**, not on draw: canonicalising and aligning is
 * the expensive part (an O(n²) rotation search), and doing it once per mask at
 * 5/s instead of once per object per frame at 60 fps is a 12x saving on the only
 * work here that is not trivial.
 */
export default function useMaskStream(sessionId) {
  const { socket } = useSocket();
  const masksRef = useRef([]);
  /** Last prepared ring per object, so each new ring can be aligned to it. */
  const previousRings = useRef(new Map());

  const clear = useCallback(() => {
    masksRef.current = [];
    previousRings.current = new Map();
  }, []);

  // A new session means a new timeline and new object ids; anything buffered
  // describes the old one.
  useEffect(() => {
    clear();
    return clear;
  }, [sessionId, clear]);

  useEffect(() => {
    if (!socket || !sessionId) return undefined;

    const onMask = (payload) => {
      // Contract §9's session filter, in `maskBuffer.acceptsMask` so it is
      // testable rather than only live-verifiable. Verified against the real
      // relay with two sessions on one socket: 88 foreign events, 88 dropped.
      if (!acceptsMask(payload, sessionId)) return;

      const objects = [];
      for (const object of payload.objects ?? []) {
        if (!object?.objId) continue;

        // Contract §8: `polygon` is a list of rings, ring 0 is the outer
        // boundary. v1 draws the outer boundary only — holes would need
        // even-odd fill, and SAM3's click-seeded masks rarely produce one worth
        // the complexity. The extra rings are kept so Phase 6+ can use them
        // without another wire change.
        const rings = Array.isArray(object.polygon) ? object.polygon : [];
        const previous = previousRings.current.get(object.objId) ?? null;
        const outer = prepareRing(rings[0], previous, RING_VERTICES);
        if (!outer) continue;
        previousRings.current.set(object.objId, outer);

        objects.push({ objId: object.objId, bbox: object.bbox ?? null, ring: outer });
      }

      // An object absent from a frame is omitted, never sent with an empty mask
      // (contract §8) — so a mask with no drawable objects still advances the
      // buffer's timeline and must be stored, not discarded. Dropping it would
      // leave the previous mask as the newest and make a departed object appear
      // to hang around.
      masksRef.current = insertMask(masksRef.current, {
        seq: payload.seq,
        offset: payload.offset,
        emittedAt: payload.emittedAt ?? null,
        objects,
      });
    };

    socket.on('xray:mask', onMask);
    return () => socket.off('xray:mask', onMask);
  }, [socket, sessionId]);

  return { masksRef, clear };
}
