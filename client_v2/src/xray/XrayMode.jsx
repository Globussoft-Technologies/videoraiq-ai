import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { XRAY_ENABLED } from './flag';
import { deriveButtonState, startErrorMessage } from './buttonState';
import { STATUS, buttonPhaseFor } from './session';
import useXraySession from './useXraySession';
import useFragTracker from './useFragTracker';
import useMaskStream from './useMaskStream';
import useObjectNames from './useObjectNames';
import { normalisedClick } from './framePosition';
import XrayButton from './XrayButton';
import XrayResetButton from './XrayResetButton';
import XrayClickLayer from './XrayClickLayer';
import XrayEndedCard from './XrayEndedCard';
import XrayMaskOverlay from './XrayMaskOverlay';
import XrayPopover from './XrayPopover';
import XrayStateChip from './XrayStateChip';

/**
 * X-ray mode — the single mount point on the detection-zone-marking page.
 *
 * It owns the session (Phase 3), the click surface (Phase 4), and the mask
 * overlay, popover and telemetry (Phase 5). Phase 6 adds the per-reason terminal
 * states on top.
 *
 * **Everything stateful is mounted here, at the top.** `useXraySession`,
 * `useMaskStream` and the mask overlay are all *siblings* of the popover rather
 * than children of it, and that is what makes opening the popover mid-session
 * harmless: it re-renders itself and nothing else. Mounting the overlay inside
 * the popover's subtree, or keying the session hook on popover state, would
 * unmount on close and fire `DELETE /sessions/:id` — killing the GPU-side track.
 * The popover's `session restarts` row exists so that regression is visible
 * rather than merely testable.
 *
 * Rendered inside the stage element (the `position: relative` 16:9 box holding
 * the `<video>`), so X-ray chrome is positioned against the video rather than
 * the page, and survives the page's fullscreen mode.
 *
 * The flag is re-checked here as belt and braces. The caller already avoids
 * importing this module at all when the flag is off (contract §3), so in an off
 * build this component never reaches the bundle.
 */

/** How often the read-outs refresh. A human glances at these. */
const READOUT_MS = 250;

export default function XrayMode({
  cameraId,
  nvrId,
  videoRef,
  hlsRef,
  hasStreamUrl = false,
  videoState = 'idle',
  isSnapshot = false,
  videoWidth = 0,
}) {
  const xray = useXraySession({ cameraId, nvrId });
  const { isLive, start, stop, resetSelection, status, objects, session, prompt, failPrompt } = xray;
  const resolveFrame = useFragTracker(hlsRef, videoRef);
  const sessionId = session?.sessionId ?? null;
  const { masksRef } = useMaskStream(sessionId);
  const {labelsRef,identify,announcement}=useObjectNames(isLive ? sessionId : null,videoRef,session?.width,session?.height);

  /** Pure view state. None of it touches the session — see the note above. */
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [telemetryOpen, setTelemetryOpen] = useState(false);
  const [glow, setGlow] = useState('bold');
  const [smoothing, setSmoothing] = useState(0.45);
  const [lostSensitivity, setLostSensitivity] = useState(1);

  /**
   * Read-outs that exist to make the Q4 guarantee checkable: open and close the
   * popover while tracking, and `tracking for` keeps climbing while
   * `session restarts` stays at 0.
   */
  const [trackingForSec, setTrackingForSec] = useState(null);
  const [telemetrySample, setTelemetrySample] = useState(null);
  const trackStart = useRef(null);
  const restarts = useRef(0);
  const lastSessionId = useRef(null);
  if (sessionId && sessionId !== lastSessionId.current) {
    if (lastSessionId.current !== null) restarts.current += 1;
    lastSessionId.current = sessionId;
  }

  const tracking = status === STATUS.TRACKING || status === STATUS.LOST;

  // Settings belong to a live session. Leaving the flag set across the end of
  // one would re-open the popover over the next session the user starts, which
  // they did not ask for, and leaves the stale-flag hazard the Esc handler below
  // has to guard against.
  useEffect(() => {
    if (!isLive) setPopoverOpen(false);
  }, [isLive]);

  useEffect(() => {
    if (!tracking) {
      trackStart.current = null;
      setTrackingForSec(null);
      return undefined;
    }
    if (trackStart.current === null) trackStart.current = performance.now();
    // 4 Hz, not per-frame: re-rendering the tree 60 times a second to animate
    // one decimal place would be absurd next to a canvas already doing the real
    // work at that rate.
    const timer = setInterval(() => {
      setTrackingForSec((performance.now() - trackStart.current) / 1000);
    }, READOUT_MS);
    return () => clearInterval(timer);
  }, [tracking]);

  /**
   * Sample `(seq, offset)` for the telemetry strip — but only while it is open.
   * Collapsed, it costs nothing, which is the point of shipping it collapsed.
   */
  useEffect(() => {
    if (!telemetryOpen || !isLive) {
      setTelemetrySample(null);
      return undefined;
    }
    const sample = () => setTelemetrySample(resolveFrame());
    sample();
    const timer = setInterval(sample, READOUT_MS);
    return () => clearInterval(timer);
  }, [telemetryOpen, isLive, resolveFrame]);

  // Destructured rather than depending on `xray`, which the hook rebuilds every
  // render — depending on the object would re-bind the Esc listener on every
  // render instead of only when something relevant changes.
  const toggle = useCallback(() => {
    if (isLive) stop();
    else start();
  }, [isLive, start, stop]);

  // Esc exits X-ray. Implemented since Phase 2 because the active tooltip
  // promises it, and a tooltip that lies is worse than no tooltip.
  useEffect(() => {
    // Also while `ended`: the card on screen says Esc closes X-ray, and the
    // previous gate on `isLive` alone would have made that line false.
    if (!isLive && status !== STATUS.ENDED) return undefined;
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      // Esc closes the popover before it exits X-ray: the shallower dismissal is
      // what the user means, and ending a session by accident costs them a
      // re-click and a fresh GPU slot.
      //
      // Gated on `isLive`, because the popover only *renders* while the session
      // is live. Without that gate, an `ended` card arriving while the popover
      // flag was still set would spend the user's first Esc closing something
      // invisible — and the card tells them Esc closes X-ray.
      if (isLive && popoverOpen) {
        setPopoverOpen(false);
        return;
      }
      stop();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isLive, status, stop, popoverOpen]);

  /**
   * Surface a failed start once, as a toast (contract §10's three start-failure
   * codes). Keyed on the error object's identity, which the reducer replaces on
   * every failure — so two identical failures in a row still produce two toasts,
   * because the user pressed twice and deserves two answers.
   */
  const shown = useRef(null);
  useEffect(() => {
    const err = xray.lastError;
    if (!err || shown.current === err) return;
    shown.current = err;
    // Click-time refusals are rendered inline at the click point by
    // `XrayClickLayer`; only session-level failures belong in a corner toast.
    if (err.at || err.code === 'session_not_found') return;
    if (!isLive) toast.error(startErrorMessage(err.code));
  }, [xray.lastError, isLive]);

  /**
   * The two ways out of a terminal session (contract §7). Both start by
   * releasing the ended one: `DELETE /sessions/:id` is idempotent (§5), so
   * closing something the server has already freed is a 200 and not an error,
   * and doing it unconditionally means no path can leave an id behind.
   *
   * `restart` deliberately does not reuse the old session. `ended` means the
   * service has freed the GPU state, so there is nothing to resume — the honest
   * way back is a new session, which lands in `preparing` and then `ready` with
   * clicks enabled.
   *
   * There is no timer here any more. The previous version cleared `ended` after
   * four seconds, which could remove the only account of what happened before
   * the user had read it.
   */
  const dismissEnded = useCallback(() => { stop(); }, [stop]);
  // Just `start()`: it closes whatever is still held before opening a new
  // session, and its `start` action already resets reason, objects and
  // `lastError`, so a preceding `stop()` would only add a second dispatch
  // arriving at the same state.
  const restart = useCallback(() => { start(); }, [start]);

  /**
   * A click on the video. Returns the normalised point so the layer can place
   * its optimistic marker immediately, and fires the prompt in the background —
   * the marker must not wait for a round trip, which is the whole reason it
   * exists.
   */
  const handlePrompt = useCallback((rect, clientX, clientY) => {
    const point = normalisedClick(rect, clientX, clientY);
    if (!point) return null;

    // Pre-empt the cap locally. The server also enforces it and returns
    // `409 max_objects_reached`, which is handled — but answering instantly
    // beats spending a round trip to be told something we already knew.
    const cap = Number.isInteger(session?.maxObjects) ? session.maxObjects : 1;
    if (objects.length >= cap) {
      failPrompt('max_objects_reached', point);
      return null;
    }

    // Resolve the frame *before* showing the marker: if there is no honest `seq`
    // for the current playhead there is nothing to send, and a marker would
    // promise a request that is not going to happen.
    const frame = resolveFrame();
    if (!frame) {
      failPrompt('frame_unresolved', point);
      return null;
    }

    prompt({ ...point, seq: frame.seq, offset: frame.offset });
    return point;
  }, [resolveFrame, objects.length, session, prompt, failPrompt]);

  if (!XRAY_ENABLED) return null;

  const view = deriveButtonState({
    phase: buttonPhaseFor(status),
    notLicensed: xray.notLicensed,
    hasStreamUrl,
    videoState,
    isSnapshot,
    videoWidth,
  });

  return (
    <>
      <span aria-live="polite" style={{position:'absolute',width:1,height:1,padding:0,margin:-1,
        overflow:'hidden',clipPath:'inset(50%)',whiteSpace:'nowrap'}}>{announcement}</span>
      {/* The mask overlay sits *under* the click layer and takes no pointer
          events: a mask must never swallow a click meant for the video beneath
          it. Mounted only while a session can produce masks. */}
      {isLive && session && (
        <XrayMaskOverlay
          // Keyed on the session so a new one remounts the canvas and clears the
          // loop's remembered outlines with it. Without this, a ghost from the
          // previous session could outlive it by up to the fade window and be
          // drawn over a fresh track.
          key={session.sessionId}
          masksRef={masksRef}
          labelsRef={labelsRef}
          onObjectFrame={identify}
          videoRef={videoRef}
          hlsRef={hlsRef}
          width={session.width}
          height={session.height}
          glow={glow}
          smoothing={smoothing}
          // Not `isLost`. The fade follows absence from the mask stream, which
          // is 200 ms of data rather than a round trip of label — see the fade
          // block in `XrayMaskOverlay`.
          lostSensitivity={lostSensitivity}
        />
      )}

      <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 6, display: 'flex', gap: 6 }}>
        <XrayButton view={view} onToggle={toggle} />
        {isLive && <XrayResetButton onReset={resetSelection}
          disabled={status === STATUS.PREPARING || !session?.sessionId} />}
        {/* A separate button, not part of the toggle: two distinct actions
            deserve two distinct controls, and conflating them would mean the only
            way to open settings was to risk ending the session. */}
        {isLive && (
          <button
            type="button"
            onClick={() => setPopoverOpen((open) => !open)}
            aria-expanded={popoverOpen}
            aria-label="X-Ray settings"
            title="X-Ray settings"
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              padding: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(34,211,238,.4)',
              background: popoverOpen
                ? 'linear-gradient(135deg,#0e7490,#6d28d9)'
                : 'rgba(8,11,17,.78)',
              color: popoverOpen ? '#fff' : '#cfe9f3',
            }}
          >
            <svg
              viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor"
              strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
              style={{ transform: popoverOpen ? 'rotate(180deg)' : undefined }}
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
        )}
      </div>

      {status === STATUS.ENDED && (
        <XrayEndedCard
          reason={xray.reason}
          // `session_not_found` has no reason of its own in §7's exhaustive
          // list, so the reducer maps it to `session_expired` and keeps the real
          // code here. Passing it through is what lets the card say the accurate
          // sentence without a value §7 does not define leaking into `reason`.
          errorCode={xray.lastError?.code ?? null}
          onRestart={restart}
          onDismiss={dismissEnded}
        />
      )}

      {popoverOpen && isLive && (
        <XrayPopover
          status={status}
          session={session}
          framesBehindLive={xray.framesBehindLive}
          trackingForSec={trackingForSec}
          sessionRestarts={restarts.current}
          glow={glow}
          onGlow={setGlow}
          smoothing={smoothing}
          onSmoothing={setSmoothing}
          lostSensitivity={lostSensitivity}
          onLostSensitivity={setLostSensitivity}
        />
      )}

      {/* Self-hides when idle, so it needs no condition here — and gating it on
          the button's mode would hide a live session the moment the stream
          hiccuped, which is exactly when the state is worth reading. */}
      <XrayStateChip
        status={status}
        reason={xray.reason}
        expanded={telemetryOpen}
        onToggle={() => setTelemetryOpen((open) => !open)}
        telemetry={{
          seq: telemetrySample?.seq ?? null,
          offset: telemetrySample?.offset ?? null,
          framesBehindLive: xray.framesBehindLive,
          frameRate: session?.frameRate ?? null,
        }}
      />

      {/* Clicks are allowed only in `ready` and `tracking` (plan Phase 4), so the
          layer is mounted only then — when X-ray is off or starting it does not
          exist and the page's own zone-drawing clicks are untouched. */}
      {(status === STATUS.READY || status === STATUS.TRACKING) && (
        <XrayClickLayer
          objects={objects}
          lastError={xray.lastError}
          onPrompt={handlePrompt}
          onDismissError={xray.dismissError}
        />
      )}
    </>
  );
}
