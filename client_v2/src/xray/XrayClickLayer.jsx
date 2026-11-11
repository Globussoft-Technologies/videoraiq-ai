import { useCallback, useEffect, useRef, useState } from 'react';
import { clickErrorMessage } from './buttonState';

/**
 * The click surface: a transparent layer over the video that turns a click into
 * `(xNorm, yNorm, seq, offset)`, shows an immediate marker where it landed, and
 * reports a refusal inline instead of in a corner.
 *
 * Only mounted while clicks are allowed (`ready` or `tracking`), so when X-ray is
 * off or still starting this layer does not exist and the page's own zone-drawing
 * clicks are untouched.
 *
 * **Why the marker exists.** The first mask cannot arrive until the server has
 * resolved the frame and run the model, so without a marker the user clicks and
 * nothing happens for a moment — which reads as a dead UI. The marker is the
 * answer to "did that register?", and it is honest: it marks where *they* clicked,
 * not where anything was detected.
 */

/** How long the ripple runs before settling into the steady marker. */
const RIPPLE_MS = 900;
/** How long an inline refusal stays before fading. Long enough to read twice. */
const ERROR_MS = 4200;

export default function XrayClickLayer({ objects, lastError, onPrompt, onDismissError }) {
  /** Where the user last clicked, in normalised coords, with a timestamp. */
  const [pending, setPending] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const raf = useRef(null);

  /**
   * Drive the ripple from `requestAnimationFrame` rather than a CSS keyframe, so
   * it stops the moment the marker is resolved instead of running on a timer
   * nobody is watching. Cancelled on unmount — this is one of the loops the
   * Phase 7 leak audit will check.
   */
  useEffect(() => {
    if (!pending) return undefined;
    const tick = () => {
      setNow(Date.now());
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = null;
    };
  }, [pending]);

  // An accepted click becomes a real object, so the optimistic marker has done
  // its job and should stop competing with the thing it stood in for.
  useEffect(() => {
    if (objects.length > 0) setPending(null);
  }, [objects.length]);

  // A refused click clears the marker: leaving it would assert that something is
  // being tracked there when nothing is.
  useEffect(() => {
    if (!lastError) return undefined;
    setPending(null);
    const timer = setTimeout(onDismissError, ERROR_MS);
    return () => clearTimeout(timer);
  }, [lastError, onDismissError]);

  const handleClick = useCallback((event) => {
    // The page's stage has its own click handler for placing zone points. While
    // X-ray owns the surface, a click is X-ray's — forwarding it would drop a
    // zone vertex under the mask.
    event.stopPropagation();
    event.preventDefault();

    const rect = event.currentTarget.getBoundingClientRect();
    const result = onPrompt(rect, event.clientX, event.clientY);
    if (result) setPending({ ...result, at: Date.now() });
  }, [onPrompt]);

  const age = pending ? (now - pending.at) / RIPPLE_MS : 1;
  const errorAt = lastError?.at ?? null;

  return (
    <div
      onClick={handleClick}
      // A real pointer target, not a decorative div: the crosshair is what makes
      // the mode legible before anything has been clicked.
      style={{
        position: 'absolute',
        inset: 0,
        cursor: 'crosshair',
        /**
         * Stacking order inside the stage, from `DetectionZoneMarking.jsx`:
         *
         *   (auto)  the <video>, and the zone SVG overlay (pointer-events: none)
         *   2       the buffering overlay — only while videoState is 'loading'
         *   2       THIS LAYER
         *   3       the snapshot notice (interactive) · the top-right
         *           points/fullscreen pills (interactive) · zone-name pills
         *   5       X-ray's own pill and state chip
         *   8       the fullscreen drawing-actions menu (interactive)
         *
         * 2, not 4. At 4 this layer covers the page's `+` / `−` / fullscreen
         * pills and the snapshot notice, all of which are real buttons at 3 —
         * turning X-ray on would silently kill them, with no error and nothing
         * on screen to explain it. Fullscreen matters most: X-ray is anchored
         * inside the stage precisely so it survives fullscreen, which is useless
         * if the button that gets you there is unreachable.
         *
         * Tying with the buffering overlay at 2 is safe: it renders only while
         * `videoState === 'loading'`, and clicks are only enabled once the
         * session is `ready`, so the two are never on screen together.
         */
        zIndex: 2,
      }}
    >
      <svg
        viewBox="0 0 1000 1000"
        preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        aria-hidden="true"
      >
        {/* The optimistic marker: expanding rings plus a crosshair, fading as it
            goes. Drawn in a 1000x1000 viewBox with preserveAspectRatio="none",
            the same geometry trick the zone overlay uses (`:1325`), so no
            coordinate maths is needed here either. */}
        {pending && age < 1 && (
          <g>
            <circle cx={pending.xNorm * 1000} cy={pending.yNorm * 1000}
              r={14 + age * 90} fill="none" stroke="#22d3ee" strokeWidth="3"
              strokeOpacity={(1 - age) * 0.75} />
            <circle cx={pending.xNorm * 1000} cy={pending.yNorm * 1000}
              r={14 + age * 160} fill="none" stroke="#22d3ee" strokeWidth="2"
              strokeOpacity={(1 - age) * 0.4} />
            <circle cx={pending.xNorm * 1000} cy={pending.yNorm * 1000} r="6" fill="#22d3ee" />
          </g>
        )}

      </svg>

      {/* An inline refusal, anchored where the click was. Falls back to centred
          if the error carried no position (a session-level failure). */}
      {lastError && (
        <div
          role="alert"
          style={{
            position: 'absolute',
            left: errorAt ? `${errorAt.xNorm * 100}%` : '50%',
            top: errorAt ? `${errorAt.yNorm * 100}%` : '50%',
            transform: 'translate(-50%, -140%)',
            maxWidth: 'min(300px, 80%)',
            pointerEvents: 'none',
            fontFamily: 'var(--ui)',
            fontSize: 12,
            fontWeight: 500,
            lineHeight: 1.4,
            color: '#fff',
            background: 'rgba(8,11,17,.9)',
            border: '1px solid rgba(245,166,35,.45)',
            borderRadius: 9,
            padding: '7px 11px',
            textAlign: 'center',
            backdropFilter: 'blur(6px)',
            boxShadow: '0 10px 26px -10px rgba(0,0,0,.6)',
          }}
        >
          {clickErrorMessage(lastError.code)}
        </div>
      )}
    </div>
  );
}
