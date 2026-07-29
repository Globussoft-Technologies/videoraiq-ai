import axios from 'axios';
import getAccessToken from '@/utils/getAccessToken';

const HOST = import.meta.env.VITE_BACKEND;

const authHeaders = () => ({
  Accept: 'application/json',
  'Content-Type': 'application/json',
  'x-access-token': getAccessToken(),
});

const unwrap = (res) => {
  const body = res?.data?.body;
  if (body == null) return res?.data;
  if (Object.prototype.hasOwnProperty.call(body, 'data')) return body.data;
  return body;
};

/**
 * Self-service account summary (name, email, plan, camera count, expiry,
 * status) for whoever is currently logged in. server/core/v1/clientConfig
 * resolves the tenant from the caller's own token (verifyToken, no :adminId
 * param) — unlike server-superadmin's /client/admins family, this works for
 * any admin/member token from this app's own login, not a separate
 * superAdmin-only login.
 */
export const fetchMyAccount = async () => {
  const res = await axios.get(`${HOST}/client-config/account`, {
    headers: authHeaders(),
  });
  return unwrap(res);
};

/** Self-service stat cards + detection allocation for the logged-in user's client. */
export const fetchClientConfig = async () => {
  const res = await axios.get(`${HOST}/client-config`, {
    headers: authHeaders(),
  });
  return unwrap(res);
};

/** Self-service camera list (with per-camera detection state) for the logged-in user's client. */
export const fetchClientCameras = async () => {
  const res = await axios.get(`${HOST}/client-config/cameras`, {
    headers: authHeaders(),
  });
  const data = unwrap(res);
  return data?.cameras ?? data?.data ?? (Array.isArray(data) ? data : []);
};
