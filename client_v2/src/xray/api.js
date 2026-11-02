import api from '@/helpers/client';

/**
 * The six contract §5 routes, over the app's shared axios instance — which
 * already carries `baseURL = VITE_BACKEND` and attaches `x-access-token` per
 * request (`helpers/client.js`). Nothing here hand-rolls auth.
 *
 * `VITE_BACKEND` already ends in `/api/v2`, so these paths are relative:
 * `/xray/sessions`, not `/api/v2/xray/sessions`. Confirmed against the mount in
 * the Node session's `routes/v2/v2.js` — `router.use("/xray", …)` inside the v2
 * router.
 *
 * **Two deliberate departures from house style, both because X-ray's wire
 * format is not this app's usual one:**
 *
 * 1. No `unwrap()`. Every other endpoint answers the envelope
 *    `{ statusCode, body: { status, message, data } }`, but contract §5 freezes
 *    a flat body and the Node controller sends it flat
 *    (`res.status(result.status).json(result.data)`). `unwrap()` would happen to
 *    return the right object today — its `body == null` branch falls through to
 *    `res.data` — but by accident, not by contract, and it would start silently
 *    mangling X-ray the day anything about the envelope changed.
 *
 * 2. No `getApiErrorMessage()`. For a 422 it prefers `body.error` over
 *    `body.message`, which is right for this app's validation responses and
 *    exactly wrong for X-ray: contract §10 puts the *machine* code in `error`
 *    and the human sentence in `message`, so the shared helper would show the
 *    user the string `mask_too_small`. See `xrayErrorOf` below.
 */

/** Frontend → Node timeout, contract §10. Longer than Node → service (15 s). */
export const REQUEST_TIMEOUT_MS = 20000;

const opts = { timeout: REQUEST_TIMEOUT_MS };

/**
 * Normalise any failure into contract §10's vocabulary.
 *
 * A transport failure (offline, DNS, timeout, Node down) has no response body
 * and therefore no `error` code, but the UI still needs one — so it is reported
 * as `internal_error`, which §7 already has a message for, rather than as a
 * fabricated code that no copy table knows.
 *
 * @returns {{code: string, message: string, retryable: boolean, status: number|null}}
 */
export function xrayErrorOf(err) {
  const status = err?.response?.status ?? null;
  const body = err?.response?.data;
  const code = typeof body?.error === 'string' && body.error ? body.error : 'internal_error';
  const message = typeof body?.message === 'string' && body.message
    ? body.message
    : (err?.message || '');
  // Trust the server's own `retryable` when it sends one; §10 makes it part of
  // the body precisely so the client does not have to re-derive it.
  const retryable = typeof body?.retryable === 'boolean'
    ? body.retryable
    : status === null; // a transport blip is worth retrying; a 4xx verdict is not
  return { code, message, retryable, status };
}

/**
 * True when a failure means "the server has no such session" (contract §10).
 *
 * Driven by the **code**, not the status. `404` is not a synonym for "session
 * gone": the Node session answers `404 camera_not_found` for a camera outside
 * the caller's tenant or outside a sub-user's allow-list — deliberately 404
 * rather than 403, matching every other v2 endpoint so it does not leak that the
 * id exists. Treating that as a dead session would end something that was never
 * created, and report it to the user as an expiry.
 *
 * The bare-status fallback survives only for a 404 carrying no code at all — a
 * proxy or gateway 404, where there is nothing better to go on.
 */
export const isGone = (err) => {
  const { code, status } = xrayErrorOf(err);
  if (code === 'session_not_found') return true;
  const raw = err?.response?.data?.error;
  const hasCode = typeof raw === 'string' && raw.length > 0;
  return !hasCode && status === 404;
};

/**
 * `POST /xray/sessions`.
 *
 * **Slow by design.** Contract §4: this does not return until frames are
 * actually decoding on the GPU box, so a 200 is a promise that a click will
 * work. That is why the UI shows "Preparing X-Ray…" rather than treating a
 * multi-second wait as a hang.
 */
export async function createSession({ cameraId, nvrId }) {
  const res = await api.post('/xray/sessions', { cameraId, nvrId }, opts);
  return res.data;
}

/** `POST /xray/sessions/:id/prompt` — one click. Phase 4 calls this. */
export async function sendPrompt(sessionId, { xNorm, yNorm, seq, offset }) {
  const res = await api.post(
    `/xray/sessions/${encodeURIComponent(sessionId)}/prompt`,
    { xNorm, yNorm, seq, offset },
    opts,
  );
  return res.data;
}

/**
 * `DELETE /xray/sessions/:id`. Idempotent per contract §5 — deleting an
 * already-gone session is a 200, so this never throws for "it was already
 * closed" and callers do not need to special-case it.
 *
 * Swallows every error on purpose: this runs on teardown paths (button off,
 * unmount, route change) where there is no UI left to show a failure in, and
 * where the server reaps the session anyway on a missed heartbeat (§10). A
 * rejected promise here would only produce an unhandled rejection.
 */
export async function deleteSession(sessionId) {
  try {
    await api.delete(`/xray/sessions/${encodeURIComponent(sessionId)}`, opts);
    return true;
  } catch {
    return false;
  }
}

/** `DELETE /xray/sessions/:id/objects/:objId`. Idempotent. */
export async function deleteObject(sessionId, objId) {
  try {
    await api.delete(
      `/xray/sessions/${encodeURIComponent(sessionId)}/objects/${encodeURIComponent(objId)}`,
      opts,
    );
    return true;
  } catch {
    return false;
  }
}

/** `GET /xray/sessions/:id` — state, objects, framesBehindLive. */
export async function getSession(sessionId) {
  const res = await api.get(`/xray/sessions/${encodeURIComponent(sessionId)}`, opts);
  return res.data;
}

/**
 * `POST /xray/sessions/:id/heartbeat`. Called every 10 s while X-ray is open
 * (contract §10); missing beats are how the service reaps orphans, so stopping
 * is a feature, not a bug.
 *
 * Returns `'ok' | 'gone' | 'error'` instead of throwing, because the caller's
 * only interesting question is whether the session still exists.
 */
export async function heartbeat(sessionId) {
  try {
    await api.post(`/xray/sessions/${encodeURIComponent(sessionId)}/heartbeat`, {}, opts);
    return 'ok';
  } catch (err) {
    return isGone(err) ? 'gone' : 'error';
  }
}

/**
 * A best-effort `DELETE` that can outlive the page.
 *
 * The only place in X-ray that touches `fetch` directly, and the only place it
 * is correct to: on `pagehide` the browser cancels in-flight XHR, so axios
 * cannot deliver this. `fetch(..., { keepalive: true })` is allowed to complete
 * after the document goes away, and unlike `navigator.sendBeacon` it can carry
 * the `x-access-token` header the API requires.
 *
 * Node also closes the session on socket.io disconnect (contract §10, "both ends
 * reap"), so this is belt and braces — it just returns the GPU slot sooner than
 * the 45 s idle reap would.
 */
export function deleteSessionOnUnload(sessionId, token) {
  const base = import.meta.env.VITE_BACKEND;
  if (!base || !sessionId || !token) return false;
  const url = `${String(base).replace(/\/+$/, '')}/xray/sessions/${encodeURIComponent(sessionId)}`;
  try {
    fetch(url, {
      method: 'DELETE',
      keepalive: true,
      headers: { 'x-access-token': token },
    }).catch(() => {});
    return true;
  } catch {
    return false;
  }
}
