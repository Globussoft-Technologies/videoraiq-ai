import axios from 'axios';
import { waitForToken } from '@/utils/waitForToken';

/**
 * Shared axios instance for the V2 UI. Mirrors the auth scheme used by the
 * existing V1 helpers: base = VITE_BACKEND, JWT sent via `x-access-token`,
 * obtained through the shared `waitForToken()` helper (cookie-backed).
 */
const apiUrl = import.meta.env.VITE_BACKEND;

export const api = axios.create({
  baseURL: `${apiUrl}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
});

// Attach the freshest token to every request.
api.interceptors.request.use(async (config) => {
  const token = await waitForToken();
  if (token) config.headers['x-access-token'] = token;
  return config;
});

/**
 * Unwraps the standard backend envelope. The API returns either
 *   { statusCode, body: { status, message, data } }  (most endpoints)
 * or { statusCode, body: <payload> }                  (some dashboard endpoints)
 * This returns `body.data` when present, otherwise `body`.
 */
export function unwrap(res) {
  const body = res?.data?.body;
  if (body == null) return res?.data;
  if (Object.prototype.hasOwnProperty.call(body, 'data')) return body.data;
  return body;
}

export default api;
