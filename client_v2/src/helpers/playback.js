import axios from 'axios';
import Cookies from 'js-cookie';
import getAccessToken from '@/utils/getAccessToken';

const Api_url = import.meta.env.VITE_BACKEND;
const StreamUrl = import.meta.env.VITE_STREAM_URL;

const unwrap = (res) => {
  const body = res?.data?.body;
  if (body == null) return res?.data;
  if (Object.prototype.hasOwnProperty.call(body, 'data')) return body.data;
  return body;
};

/**
 * Camera View playback — exclusive to CameraGrid's single-camera view.
 * Calls the real backend endpoints (POST /api/v1/channel/playback-url,
 * /playback-timeline); no mock data. Playback URL support is backend/NVR-brand
 * dependent (Hikvision/Tiandy/Prama/local-Tiandy) — callers must handle
 * failures as "no recording available" rather than assume success.
 */

/**
 * Backend returns a relative path (e.g. "playback/pb-<id>/playlist.m3u8") in
 * non-local environments, expecting the client to prefix it with the stream
 * media-server host — same pattern as V1 (PlaybackVideoCanvasStream.jsx) and
 * as this app's own live streamUrl() (lib/stream.js). rtsp:// URLs (Tiandy /
 * local-Tiandy branches) are returned as-is; a browser can't play those.
 */
function resolveStreamUrl(playbackUrl) {
  if (!playbackUrl) return '';
  if (/^(https?:|rtsp:)\/\//i.test(playbackUrl)) return playbackUrl;
  return `${StreamUrl || ''}${playbackUrl}`;
}

/**
 * Compact timestamp (YYYYMMDDTHHmmssZ) encoding LOCAL wall-clock time — the
 * trailing "Z" is a literal suffix in this format, not a UTC marker. Matches
 * V1's TimelineBar.jsx:formatToApiTime(), which uses local getters
 * (getFullYear/getHours/...), not toISOString(). Using true UTC here (as
 * toISOString() would) shifts every request by the browser's UTC offset
 * (e.g. -5:30 in IST), silently requesting the wrong recording window.
 */
export function toCompactLocalTime(date) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  const y = d.getFullYear();
  const mo = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const h = pad(d.getHours());
  const mi = pad(d.getMinutes());
  const s = pad(d.getSeconds());
  return `${y}${mo}${day}T${h}${mi}${s}Z`;
}

/**
 * Resolve a playable URL for [startTime, endTime] on a channel. Requires a
 * per-session id and the NVR-native `streamId` (channel.channelId) — V1 sends
 * both channelId (Mongo _id) and streamId (device channel number) in the body.
 */
export const getPlaybackUrl = async ({ channelId, streamId, startTime, endTime, sessionId }) => {
  const token = getAccessToken();
  const res = await axios.post(
    `${Api_url}/api/v1/channel/playback-url`,
    {
      channelId,
      streamId,
      startTime: toCompactLocalTime(startTime),
      endTime: toCompactLocalTime(endTime),
      sessionId,
    },
    { headers: { 'Content-Type': 'application/json', 'x-access-token': token } }
  );
  const body = unwrap(res);
  return resolveStreamUrl(body?.playbackUrl || '');
};

/** Recording-segment availability for a channel over [startTime, endTime] (device-native search). */
export const getPlaybackTimeline = async ({ nvrId, cameraId, channel, startTime, endTime }) => {
  const token = getAccessToken();
  const res = await axios.post(
    `${Api_url}/api/v1/channel/playback-timeline`,
    { nvrId, cameraId, channel, startTime, endTime },
    { headers: { 'Content-Type': 'application/json', 'x-access-token': token } }
  );
  const body = unwrap(res);
  return body?.timeline || null;
};

/** Normalize the Hikvision CMSearchResult XML (parsed via xml2js, explicitArray:false) into [{start,end}]. */
export function normalizeRecordingSegments(timeline) {
  const items = timeline?.CMSearchResult?.matchList?.searchMatchItem;
  if (!items) return [];
  const arr = Array.isArray(items) ? items : [items];
  return arr
    .map((it) => {
      const span = it?.timeSpan;
      if (!span?.startTime || !span?.endTime) return null;
      const start = new Date(span.startTime);
      const end = new Date(span.endTime);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
      return { start, end };
    })
    .filter(Boolean);
}

/**
 * The media server keys ongoing playback state by sessionId, so — same as V1
 * (Playback.jsx: Cookies.get/set('playback_session_id', {expires:1})) — reuse
 * one id across seeks/camera switches for the day rather than minting a new
 * one per load, which would otherwise leak sessions server-side.
 */
export function getPlaybackSessionId() {
  let sessionId = Cookies.get('playback_session_id');
  if (!sessionId) {
    sessionId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `pb-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    Cookies.set('playback_session_id', sessionId, { expires: 1 });
  }
  return sessionId;
}
