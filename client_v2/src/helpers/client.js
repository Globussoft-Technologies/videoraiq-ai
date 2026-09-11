import axios from 'axios';
import { waitForToken } from '@/utils/waitForToken';
import { sessionHeaders } from '@/utils/sessionIdentity';

/**
 * Shared axios instance for the V2 UI. Mirrors the auth scheme used by the
 * existing V1 helpers: base = VITE_BACKEND, JWT sent via `x-access-token`,
 * obtained through the shared `waitForToken()` helper (cookie-backed).
 */
const apiUrl = import.meta.env.VITE_BACKEND;

export const api = axios.create({
  baseURL: `${apiUrl}`,
  headers: { 'Content-Type': 'application/json' },
});

// Attach the freshest token to every request.
api.interceptors.request.use(async (config) => {
  const token = await waitForToken();
  if (token) config.headers['x-access-token'] = token;
  Object.assign(config.headers, await sessionHeaders());
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

/** Like `unwrap`, but also keeps the backend's `message` alongside the data. */
export function unwrapWithMessage(res) {
  const body = res?.data?.body;
  if (body == null) return { data: res?.data, message: undefined };
  if (Object.prototype.hasOwnProperty.call(body, 'data')) return { data: body.data, message: body.message };
  return { data: body, message: body.message };
}

/**
 * Best available human message for a failed request — for toasts / inline
 * errors. Prefers the backend's own `body.message` (e.g. "Failed to send
 * report") over axios's generic "Request failed with status code 500";
 * `body.error` (raw internals like "getConnection: connect ECONNREFUSED …")
 * is only used when there's no `message` to show instead.
 */
export function getApiErrorMessage(err, fallback = 'Something went wrong') {
  const body = err?.response?.data?.body;
  const detail = body?.error;
  const detailText = typeof detail === 'string' ? detail : Array.isArray(detail) ? detail.join(', ') : undefined;
  return body?.message || detailText || err?.message || fallback;
}

export default api;
