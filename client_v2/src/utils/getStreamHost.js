import { getAccessTokenPayload } from './jwt';
/**
 * The media-streaming host (`streamHost` claim) now comes from the signed
 * JWT rather than VITE_STREAM_URL, since it's per-deployment and can change
 * without a client_v2 rebuild. Falls back to '' when there's no token or the
 * claim is missing, matching streamUrl()'s existing empty-string contract.
 */
export default function getStreamHost() {
  const payload = getAccessTokenPayload();
  return payload?.streamHost || import.meta.env.VITE_STREAM_URL || '';
}
