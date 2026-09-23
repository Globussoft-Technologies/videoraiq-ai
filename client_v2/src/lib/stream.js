import getStreamHost from '../utils/getStreamHost';
import { isLocalSetup } from '../utils/jwt';

/**
 * Build the HLS playlist URL for a channel, mirroring V1 (StreamModal):
 * the channel carries `streamingUrl` = "stream/{nvrId}-{channelId}/playlist.m3u8".
 * In local setup the path is already absolute; otherwise prefix the stream
 * host decoded from the JWT's `streamHost` claim (dynamic per deployment —
 * no longer the VITE_STREAM_URL env var).
 */
export function streamUrl(channel) {
  const path = channel?.streamingUrl || channel?.StreamingUrl || channel?.config?.StreamingUrl || '';
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  if (isLocalSetup()) return `/${path.replace(/^\/+/, '')}`;
  const host = getStreamHost();
  if (!host) return path;
  return `${host.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}
