import { useCallback, useEffect, useReducer, useRef } from 'react';
import { useSocket } from '@/context/SocketContext';
import getAccessToken from '@/utils/getAccessToken';
import {
  createSession,
  deleteObject,
  deleteSession,
  deleteSessionOnUnload,
  heartbeat,
  isGone,
  sendPrompt,
  xrayErrorOf,
} from './api';
import { STATUS, initialState, isLive, reduce } from './session';

/**
 * Owns one X-ray session: start it, keep it alive, drive its state from
 * socket.io, and make sure every exit path closes it.
 *
 * Deliberately thin. Every decision about *what state we are in* lives in the
 * pure reducer in `session.js`, where it is tested exhaustively; this file is
 * the plumbing around it — requests, a timer, two listeners.
 */

/** Contract §10. Must stay well under the service's 45 s idle reap. */
export const HEARTBEAT_MS = 10000;

export default function useXraySession({ cameraId, nvrId }) {
  const [state, dispatch] = useReducer(reduce, initialState);
  const { socket } = useSocket();

  /**
   * The live session id, mirrored into a ref.
   *
   * Teardown needs to read it from cleanup functions and event listeners that
   * closed over an older render. Reading `state.session` there would capture a
   * stale value and leak the session — which costs a GPU slot until the 45 s
   * idle reap, the exact failure mode the plan calls out for rapid toggling.
   */
  const sessionIdRef = useRef(null);
  useEffect(() => { sessionIdRef.current = state.session?.sessionId ?? null; },
    [state.session]);

  /**
   * Guards against a slow `POST /sessions` landing after the user has already
   * turned X-ray off. Without it, the response would open a session nobody is
   * watching and nothing would ever close it.
   */
  const startToken = useRef(0);
  const resetInFlight = useRef(false);

  const closeNow = useCallback(() => {
    const id = sessionIdRef.current;
    startToken.current += 1;        // invalidate any start still in flight
    sessionIdRef.current = null;
    if (id) deleteSession(id);      // idempotent, and swallows its own errors
  }, []);

  const start = useCallback(async () => {
    if (isLive(state.status)) return;
    // Close anything still held before opening a new one.
    //
    // Reachable from `ended`: the reducer leaves `session` in place so the card
    // can read its reason, so `sessionIdRef` still carries the finished id when
    // the user presses the pill again. Today every §7 reason is server-
    // originated, which means the service has already freed that session and the
    // DELETE is a no-op — but that is an argument from the current contract, not
    // a property of this code, and `DELETE` is idempotent (§5) so making it
    // unconditional costs one request and removes the dependence.
    closeNow();
    const token = ++startToken.current;
    dispatch({ type: 'start' });
    try {
      const session = await createSession({ cameraId, nvrId });
      if (token !== startToken.current) {
        // Turned off while we were waiting. The session is real and ours, so
        // close it rather than leaving it for the reaper.
        if (session?.sessionId) deleteSession(session.sessionId);
        return;
      }
      sessionIdRef.current = session?.sessionId ?? null;
      dispatch({ type: 'started', session });
    } catch (err) {
      if (token !== startToken.current) return;
      const { code, message } = xrayErrorOf(err);
      dispatch({ type: 'start_failed', code, message });
    }
  }, [state.status, cameraId, nvrId, closeNow]);

  const stop = useCallback(() => {
    closeNow();
    dispatch({ type: 'stop' });
  }, [closeNow]);

  /** Start over only after the old GPU session confirms closure. This also
   * invalidates prompts/starts still in flight and remounts masks and names. */
  const resetSelection = useCallback(async () => {
    const id = sessionIdRef.current;
    if (!id || resetInFlight.current || !isLive(state.status)) return false;
    resetInFlight.current = true;
    const token = ++startToken.current;
    sessionIdRef.current = null;
    dispatch({ type: 'start' });
    try {
      const closed = await deleteSession(id);
      if (token !== startToken.current) return false;
      if (!closed) {
        dispatch({ type: 'start_failed', code: 'service_unavailable',
          message: 'The previous X-Ray session could not be closed. Try again when the service is available.' });
        return false;
      }
      const session = await createSession({ cameraId, nvrId });
      if (token !== startToken.current) {
        if (session?.sessionId) deleteSession(session.sessionId);
        return false;
      }
      sessionIdRef.current = session?.sessionId ?? null;
      dispatch({ type: 'started', session });
      return true;
    } catch (err) {
      if (token !== startToken.current) return false;
      const { code, message } = xrayErrorOf(err);
      dispatch({ type: 'start_failed', code, message });
      return false;
    } finally {
      resetInFlight.current = false;
    }
  }, [state.status, cameraId, nvrId]);

  /**
   * Send one click. Contract §5: `xNorm`/`yNorm` are `0..1` against the native
   * resolution, `seq` and `offset` identify the frame the user was looking at.
   *
   * The caller has already placed an optimistic marker, so the only jobs here
   * are to record the accepted object or to report why it was refused — never to
   * retry. `409 frame_not_buffered` in particular must not auto-retry: the frame
   * clicked is ~6 s in the past and already discarded by the browser
   * (`backBufferLength: 0`), so the same coordinates against a newer frame would
   * silently track whatever has since moved into that spot.
   */
  const prompt = useCallback(async ({ xNorm, yNorm, seq, offset }) => {
    const id = sessionIdRef.current;
    if (!id) return false;
    try {
      const res = await sendPrompt(id, { xNorm, yNorm, seq, offset });
      if (sessionIdRef.current !== id) {
        // Turned off, or a new session started, while the click was in flight.
        // The object belongs to a session nobody is watching; drop it.
        if (res?.objId) deleteObject(id, res.objId);
        return false;
      }
      dispatch({
        type: 'object_added',
        objId: res?.objId,
        resolvedSeq: res?.resolvedSeq,
        resolvedOffset: res?.resolvedOffset,
        requestedSeq: seq,
        requestedOffset: offset,
        xNorm,
        yNorm,
      });
      return true;
    } catch (err) {
      if (sessionIdRef.current !== id) return false;
      const { code, message } = xrayErrorOf(err);
      if (code === 'session_not_found') dispatch({ type: 'gone', sessionId: id, message });
      else dispatch({ type: 'prompt_failed', code, message, xNorm, yNorm });
      return false;
    }
  }, []);

  /** Drop one tracked object without ending the session. */
  const dropObject = useCallback(async (objId) => {
    const id = sessionIdRef.current;
    dispatch({ type: 'object_removed', objId });
    if (id && objId) await deleteObject(id, objId);
  }, []);

  const dismissError = useCallback(() => dispatch({ type: 'error_dismissed' }), []);

  /**
   * Report a refusal the client worked out for itself — the object cap, or a
   * playhead no fragment covers — in the same shape a server refusal arrives in,
   * so the view has exactly one error path to render.
   */
  const failPrompt = useCallback((code, point) => {
    dispatch({
      type: 'prompt_failed',
      code,
      message: '',
      xNorm: point?.xNorm,
      yNorm: point?.yNorm,
    });
  }, []);

  /**
   * A camera change must not leave a session running against the old one.
   *
   * Not currently reachable: of the two places `DetectionZoneMarking` is
   * mounted, `Detections.jsx` keys it on `${camera._id}-${settingType}` so a
   * change remounts the page, and `DetectionSettings.jsx` only reaches a second
   * camera via `onBack` → `null` → the list, which unmounts it. But that is a
   * property of *those two call sites*, and the failure if one ever changes is
   * not a crash: masks for camera A drawn over camera B's video, silently, which
   * is the same class of wrong-camera bug the §9 session filter exists to stop.
   * Cheaper to make it impossible here than to rely on every future caller.
   *
   * Compares a composite key rather than depending on the two values, so it
   * fires only on a real change and not on mount.
   */
  const cameraKey = `${cameraId ?? ''}|${nvrId ?? ''}`;
  const lastCameraKey = useRef(cameraKey);
  useEffect(() => {
    if (lastCameraKey.current === cameraKey) return;
    lastCameraKey.current = cameraKey;
    closeNow();
    dispatch({ type: 'stop' });
  }, [cameraKey, closeNow]);

  const applyServerState = useCallback((payload) => {
    dispatch({
      type: 'server_state',
      sessionId: payload?.sessionId,
      state: payload?.state,
      reason: payload?.reason ?? null,
      framesBehindLive: payload?.framesBehindLive,
    });
  }, []);

  /**
   * `xray:state` on the app's existing socket (contract §9). Never opens a
   * second connection — `useSocket()` hands back the one `SocketContext`
   * already made.
   *
   * `socket` lives in a ref inside that context, so it is `null` on the first
   * render and this effect must depend on it rather than assume it.
   */
  useEffect(() => {
    if (!socket) return undefined;
    socket.on('xray:state', applyServerState);
    return () => socket.off('xray:state', applyServerState);
  }, [socket, applyServerState]);

  /** Heartbeat, only while a session is actually alive. */
  useEffect(() => {
    if (!isLive(state.status) || !state.session?.sessionId) return undefined;
    const id = state.session.sessionId;
    const timer = setInterval(async () => {
      const result = await heartbeat(id);
      if (result === 'gone') dispatch({ type: 'gone', sessionId: id });
      // 'error' is left alone on purpose: one failed beat is a network blip, and
      // the server tolerates a missed beat well inside its 45 s reap. Ending the
      // session here would turn a blip into a lost track.
    }, HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [state.status, state.session]);

  /**
   * Unmount, route change, tab close — every path closes.
   *
   * `pagehide` rather than `beforeunload`: it fires for the back/forward cache
   * and on mobile backgrounding, where `beforeunload` does not, and it is the
   * event that actually corresponds to "this document is going away".
   */
  useEffect(() => {
    const onPageHide = () => {
      const id = sessionIdRef.current;
      if (id) deleteSessionOnUnload(id, getAccessToken());
    };
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      closeNow();
    };
  }, [closeNow]);

  return {
    status: state.status,
    reason: state.reason,
    session: state.session,
    framesBehindLive: state.framesBehindLive,
    notLicensed: state.notLicensed,
    lastError: state.lastError,
    objects: state.objects,
    isLive: isLive(state.status),
    isEnded: state.status === STATUS.ENDED,
    start,
    stop,
    resetSelection,
    prompt,
    failPrompt,
    dropObject,
    dismissError,
    markGone: (sessionId) => dispatch({ type: 'gone', sessionId }),
    isGone,
  };
}
