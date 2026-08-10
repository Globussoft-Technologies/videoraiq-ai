import axios from 'axios';
import getStreamHost from '../utils/getStreamHost';

/**
 * The Camera Status API lives on the SAME streaming instance that actually
 * generates this user's HLS — "is this server generating HLS" only means
 * something for the server actually doing it. That host is per-deployment,
 * decoded from the JWT's `streamHost` claim (see utils/getStreamHost.js,
 * the same resolution lib/stream.js uses for the real playback URL) — NOT a
 * single fixed origin, since different accounts/NVRs can be served by
 * different streaming hosts. VITE_STATUS_URL is only a last-resort fallback
 * for local setups with no JWT claim. Resolved fresh on every call (not at
 * module load) since the token can change after login.
 */
function statusBase() {
  const host = getStreamHost() || import.meta.env.VITE_STATUS_URL || '';
  return host.replace(/\/+$/, '');
}

/* accept a string or an array of ids and return a filtered array */
const idArray = (v) => (Array.isArray(v) ? v.filter(Boolean) : [v].filter(Boolean));

/**
 * Bulk camera status — rtsp_online/stream_status/viewers/playback_status per
 * camera, plus the global server_network reading. Omit `ids` to get every
 * configured camera. No auth token on this endpoint (see CAMERA_STATUS_API.md).
 *
 * POSTs the ids in the body rather than a `?ids=` query string — a GET here
 * used to cap callers at ~500 ids to stay under URL length limits; the body
 * has no such ceiling; this API is tested to work with 100s-1000s of ids.
 */
export const getCamerasStatus = async (ids) => {
  const list = idArray(ids);
  const res = await axios.post(`${statusBase()}/api/cameras/status`, list.length ? { ids: list } : {});
  return res?.data || {};
};

/**
 * Streaming variant of getCamerasStatus: opens one connection and the backend
 * pushes a fresh summary down it every ~3s (SSE-framed: `data: {...}\n\n`)
 * until it's unsubscribed, instead of the caller re-polling on a timer. Uses
 * `fetch` directly (not axios) since it needs the raw response body reader.
 *
 * Returns an unsubscribe function. `onClose` fires when the stream ends
 * without an error (the backend or network closed it) — a plain drop, not a
 * failure, so callers may want to reconnect on it too (see
 * hooks/useCameraStatusStream.js, which does).
 */
export function subscribeCamerasStatus(ids, { onData, onError, onClose } = {}) {
  const controller = new AbortController();
  const list = idArray(ids);

  (async () => {
    try {
      const res = await fetch(`${statusBase()}/api/cameras/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: list, stream: true }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error(`Camera status stream failed (${res.status})`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        // eslint-disable-next-line no-await-in-loop
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        let frameEnd;
        while ((frameEnd = buf.indexOf('\n\n')) !== -1) {
          const frame = buf.slice(0, frameEnd);
          buf = buf.slice(frameEnd + 2);
          if (!frame.startsWith('data: ')) continue;
          try {
            onData?.(JSON.parse(frame.slice(6)));
          } catch {
            // malformed frame — skip it, the connection is still good
          }
        }
      }
      onClose?.();
    } catch (err) {
      if (err?.name !== 'AbortError') onError?.(err);
    }
  })();

  return () => controller.abort();
}

/** Same fields as one entry of getCamerasStatus()'s `cameras` array, single camera. */
export const getCameraStatus = async (camId) => {
  const res = await axios.get(`${statusBase()}/api/camera/${camId}/status`);
  return res?.data || {};
};

/** Frontend player reports its real playback state every 5s while mounted. */
export const postStreamHeartbeat = async ({ cameraId, sessionId, state }) => {
  const res = await axios.post(`${statusBase()}/api/stream-heartbeat`, {
    camera_id: cameraId,
    session_id: sessionId,
    state,
  });
  return res?.data || {};
};

/** The deciding factors for "this camera is live": RTSP reachable AND this
 * server is actually producing fresh HLS segments for it right now. */
export function isCameraLive(cam) {
  return !!cam && cam.rtsp_online === true && cam.stream_status === 'running';
}

/**
 * The Camera Status API keys every camera by the same id embedded in its
 * stream path (e.g. `id: "nvr_123-ch6"` <-> `stream_url:
 * "stream/nvr_123-ch6/playlist.m3u8"`) — NOT the channel's Mongo `_id` or
 * `channelId`. `localChannelId` already IS that id verbatim (a required
 * field on every channel — see channels.model.js), so prefer it directly;
 * fall back to parsing it out of `streamingUrl` (the field lib/stream.js
 * reads to build the actual HLS URL) for channels/deployments that only
 * carry that field.
 */
export function cameraStatusId(channel) {
  if (channel?.localChannelId) return channel.localChannelId;
  const raw = channel?.streamingUrl || channel?.StreamingUrl || channel?.config?.StreamingUrl || channel?.streamingPath || '';
  const match = String(raw).match(/stream\/([^/?]+)\/playlist\.m3u8/i);
  return match ? match[1] : null;
}
