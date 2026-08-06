import getAccessToken from './getAccessToken';

/**
 * Decode a JWT payload without a dependency (base64url-safe — the JWT spec
 * uses base64url, not plain base64, so raw atob() can throw on `-`/`_`).
 */
function decodeJwtPayload(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

/**
 * The media-streaming host (`streamHost` claim) now comes from the signed
 * JWT rather than VITE_STREAM_URL, since it's per-deployment and can change
 * without a client_v2 rebuild. Falls back to '' when there's no token or the
 * claim is missing, matching streamUrl()'s existing empty-string contract.
 */
export default function getStreamHost() {
  const token = getAccessToken();
  const payload = token ? decodeJwtPayload(token) : null;
  return payload?.streamHost || import.meta.env.VITE_STREAM_URL || '';
}
