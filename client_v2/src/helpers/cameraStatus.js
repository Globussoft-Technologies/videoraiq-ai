import axios from 'axios';

// Bare origin — these endpoints are NOT under the versioned /api/v2 prefix
// VITE_BACKEND carries (see CAMERA_STATUS_API.md).
const Status_url = (import.meta.env.VITE_STATUS_URL || '').replace(/\/+$/, '');

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
  const res = await axios.get(`${Status_url}/api/cameras/status${qs}`);
  return res?.data || {};
};

/** Same fields as one entry of getCamerasStatus()'s `cameras` array, single camera. */
export const getCameraStatus = async (camId) => {
  const res = await axios.get(`${Status_url}/api/camera/${camId}/status`);
  return res?.data || {};
};

/** Frontend player reports its real playback state every 5s while mounted. */
export const postStreamHeartbeat = async ({ cameraId, sessionId, state }) => {
  const res = await axios.post(`${Status_url}/api/stream-heartbeat`, {
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
