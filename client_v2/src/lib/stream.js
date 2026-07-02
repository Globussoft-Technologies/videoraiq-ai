const STREAM_BASE = import.meta.env.VITE_STREAM_URL || '';
const LOCAL_SETUP = import.meta.env.VITE_LOCAL_SETUP === 'true';

/**
 * Build the HLS playlist URL for a channel, mirroring V1 (StreamModal):
 * the channel carries `streamingUrl` = "stream/{nvrId}-{channelId}/playlist.m3u8".
 * In local setup the path is already absolute; otherwise prefix VITE_STREAM_URL.
 */
export function streamUrl(channel) {
  const path = channel?.streamingUrl || channel?.StreamingUrl || channel?.config?.StreamingUrl || '';
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  if (LOCAL_SETUP) return path;
  return `${STREAM_BASE}${path}`;
}
