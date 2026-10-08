import axios from 'axios';
import Cookies from 'js-cookie';
import getAccessToken from '@/utils/getAccessToken';
import getStreamHost from '@/utils/getStreamHost';
import moment from 'moment-timezone';
import { getConfiguredTimezone } from '../utils/timezone';

const Api_url = import.meta.env.VITE_BACKEND;

const unwrap = (res) => {
  const body = res?.data?.body;
  if (body == null) return res?.data;
  if (Object.prototype.hasOwnProperty.call(body, 'data')) return body.data;
  return body;
};

/**
 * Camera View playback — exclusive to CameraGrid's single-camera view.
 * Calls the real backend endpoints (POST /channel/playback-url,
 * /playback-timeline); no mock data. Playback URL support is backend/NVR-brand
 * dependent (Hikvision/Tiandy/Prama/local-Tiandy) — callers must handle
 * failures as "no recording available" rather than assume success.
 */

/**
 * Backend returns a relative path (e.g. "playback/pb-<id>/playlist.m3u8") in
 * non-local environments, expecting the client to prefix it with the stream
 * media-server host — same pattern as V1 (PlaybackVideoCanvasStream.jsx) and
 * as this app's own live streamUrl() (lib/stream.js). The host is decoded
 * from the JWT's `streamHost` claim (dynamic per deployment), not an env var.
 * rtsp:// URLs (Tiandy / local-Tiandy branches) are returned as-is; a browser
 * can't play those.
 */
function resolveStreamUrl(playbackUrl) {
  if (!playbackUrl) return '';
  if (/^(https?:|rtsp:)\/\//i.test(playbackUrl)) return playbackUrl;
  return `${getStreamHost()}${playbackUrl}`;
}

/**
 * Legacy compact timestamp encoding admin wall-clock time. The trailing Z
 * is a literal protocol suffix, not a UTC marker. Browser timezone must not
 * influence this value. Device-specific zones require a backend adapter.
 */
export function toCompactLocalTime(date) {
  return moment(date).tz(getConfiguredTimezone()).format('YYYYMMDD[T]HHmmss[Z]');
}

/**
 * Resolve a playable URL for [startTime, endTime] on a channel. Requires a
 * per-session id and the NVR-native `streamId` (channel.channelId) — V1 sends
 * both channelId (Mongo _id) and streamId (device channel number) in the body.
 */
export const getPlaybackUrl = async ({ channelId, streamId, startTime, endTime, sessionId }) => {
  const token = getAccessToken();
  const res = await axios.post(
    `${Api_url}/channel/playback-url`,
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
    `${Api_url}/channel/playback-timeline`,
    {
      nvrId,
      cameraId,
      channel,
      startTime,
      endTime,
      // Securus DVRIP uses the NVR's local wall clock. Keep explicit compact
      // values alongside ISO timestamps so deployments in another timezone do
      // not shift the device query.
      deviceStartTime: toCompactLocalTime(startTime),
      deviceEndTime: toCompactLocalTime(endTime),
    },
    { headers: { 'Content-Type': 'application/json', 'x-access-token': token } }
  );
  const body = unwrap(res);
  return body?.timeline || null;
};

/** Fetch one five-second animated recording preview for a timeline hover. */
export const getPlaybackThumbnail = async ({
  channelId,
  time,
  playbackUrl,
  playbackStartTime,
  signal,
}) => {
  const token = getAccessToken();
  const res = await axios.post(
    `${Api_url}/channel/playback-thumbnail`,
    {
      channelId,
      time: toCompactLocalTime(time),
      playbackUrl: playbackUrl || undefined,
      playbackStartTime: playbackStartTime
        ? toCompactLocalTime(playbackStartTime)
        : undefined,
    },
    {
      headers: { 'Content-Type': 'application/json', 'x-access-token': token },
      responseType: 'blob',
      signal,
      timeout: 20000,
    }
  );
  return res.data;
};

// Explicit offsets are absolute instants. Legacy device responses without an
// offset use the admin zone until device-specific timezone metadata exists.
function parseRecordingTime(value) {
  if (!value) return new Date(NaN);
  return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(String(value))
    ? new Date(value)
    : moment.tz(value, getConfiguredTimezone()).toDate();
}

/** Normalize the Hikvision CMSearchResult XML (parsed via xml2js, explicitArray:false) into [{start,end}]. */
export function normalizeRecordingSegments(timeline) {
  if (Array.isArray(timeline?.segments)) {
    return timeline.segments
      .map((segment) => {
        const start = parseRecordingTime(segment?.startTime);
        const end = parseRecordingTime(segment?.endTime);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
        return { start, end };
      })
      .filter(Boolean);
  }
  const items = timeline?.CMSearchResult?.matchList?.searchMatchItem;
  if (!items) return [];
  const arr = Array.isArray(items) ? items : [items];
  return arr
    .map((it) => {
      const span = it?.timeSpan;
      if (!span?.startTime || !span?.endTime) return null;
      const start = parseRecordingTime(span.startTime);
      const end = parseRecordingTime(span.endTime);
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

export { isFutureSeek } from '../components/Playback/playbackTimeGuard.js';

