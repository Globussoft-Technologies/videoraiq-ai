import getStreamHost from '../utils/getStreamHost';
import { isLocalSetup } from '../utils/jwt';

/**
 * Build the HLS playlist URL for a channel, mirroring V1 (StreamModal):
 * Use the supplied streamingUrl, or the configuration preview's
 * "stream/{nvrId}-{cameraDatabaseId}/playlist.m3u8" when it is missing.
 * In local setup the path is already absolute; otherwise prefix the stream
 * host decoded from the JWT's `streamHost` claim (dynamic per deployment —
 * no longer the VITE_STREAM_URL env var).
 */
export function streamUrl(channel) {
  const nvrId = typeof channel?.nvrId === 'object' ? channel.nvrId?._id : channel?.nvrId;
  // Camera configuration preview uses this same media-server key. The channel
  // API can omit streamingUrl when registration fails even if HLS is available.
  const cameraId = channel?._id || channel?.dbId;
  const fallback = nvrId && cameraId ? `stream/${nvrId}-${cameraId}/playlist.m3u8` : '';
  const path = channel?.streamingUrl || channel?.StreamingUrl || channel?.config?.StreamingUrl || fallback;
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  const nvr = channel?.nvrId && typeof channel.nvrId === 'object' ? channel.nvrId : channel?.nvr || channel;
  const domain = (isLocalSetup() || nvr?.managementSource === 'installer' || nvr?.localNvrId) ? nvr?.domain : '';
  if (domain) return `${domain.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
  if (isLocalSetup()) return `/${path.replace(/^\/+/, '')}`;
  const host = getStreamHost();
  if (!host) return path;
  return `${host.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}
