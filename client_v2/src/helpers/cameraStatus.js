import axios from 'axios';
import getStreamHost from '../utils/getStreamHost';

const LOCAL_SETUP = import.meta.env.VITE_LOCAL_SETUP === 'true';

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
  if (LOCAL_SETUP) return '';
  const host = getStreamHost() || import.meta.env.VITE_STATUS_URL || '';
  return host.replace(/\/+$/, '');
}

/* accept a string or an array of ids and return a comma-joined string */
const csv = (v) => (Array.isArray(v) ? v.filter(Boolean).join(',') : v || '');

/**
 * Bulk camera status — rtsp_online/stream_status/viewers/playback_status per
 * camera, plus the global server_network reading. Omit `ids` to get every
 * configured camera. No auth token on this endpoint (see CAMERA_STATUS_API.md).
 */
export const getCamerasStatus = async (ids) => {
  const idList = csv(ids);
  const qs = idList ? `?ids=${encodeURIComponent(idList)}` : '';
  const res = await axios.get(`${statusBase()}/api/cameras/status${qs}`);
  return res?.data || {};
};

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
 * `channelId`. Extract it from the same `streamingUrl` field
 * lib/stream.js already reads to build the actual HLS URL the player
 * requests, so status lookups always key off the exact id being streamed.
 */
export function cameraStatusId(channel) {
  const raw = channel?.streamingUrl || channel?.StreamingUrl || channel?.config?.StreamingUrl || '';
  const match = String(raw).match(/stream\/([^/?]+)\/playlist\.m3u8/i);
  return match ? match[1] : null;
}
