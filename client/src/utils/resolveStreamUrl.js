import { jwtDecode } from 'jwt-decode';
import getAccessToken from '@/utils/getAccessToken';

/**
 * Resolve the base URL used to build cloud HLS stream URLs.
 *
 * For cloud deployments the streaming host is per-tenant and is delivered as
 * the `streamHost` claim inside the auth JWT (e.g. https://kolorworld.videoraiq.com).
 * Reading it from the token means the same build works on every cloud deployment,
 * instead of baking a single URL into the bundle via VITE_STREAM_URL.
 *
 * Falls back to import.meta.env.VITE_STREAM_URL for tokens minted before the
 * `streamHost` claim existed, or when no token is present yet.
 *
 * NOTE: this only matters on the cloud branch (VITE_LOCAL_SETUP !== 'true').
 * On-prem returns the channel's streamingUrl as-is and never calls this.
 */
export const getStreamBaseUrl = () => {
  try {
    const token = getAccessToken();
    if (token) {
      const streamHost = jwtDecode(token)?.streamHost;
      if (streamHost) return streamHost;
    }
  } catch {
    // malformed / expired token → fall through to env fallback
  }
  return import.meta.env.VITE_STREAM_URL || '';
};

export default getStreamBaseUrl;
