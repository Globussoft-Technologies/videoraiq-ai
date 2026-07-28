import axios from 'axios';
import getAccessToken from '@/utils/getAccessToken';

const ADMIN_HOST = import.meta.env.VITE_ADMIN_BACKEND;

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
 * Resolves the logged-in admin's own record by searching the client/admins
 * list by email — there is no single-admin-by-id endpoint, so the current
 * user's email (from AuthContext) is the lookup key.
 */
export const fetchMyAdminDetails = async (email) => {
  const res = await axios.get(`${ADMIN_HOST}/client/admins`, {
    params: { skip: 0, limit: 1, search: email, sortOrder: 'asc' },
    headers: authHeaders(),
  });
  const data = unwrap(res);
  const admins = data?.admins ?? data?.data ?? (Array.isArray(data) ? data : []);
  return admins[0] || null;
};

/** Client/site configuration for the logged-in user's client id. */
export const fetchClientConfig = async (clientId) => {
  const res = await axios.get(`${ADMIN_HOST}/client-config/${clientId}`, {
    headers: authHeaders(),
  });
  return unwrap(res);
};

/** Cameras registered under the logged-in user's client id. */
export const fetchClientCameras = async (clientId) => {
  const res = await axios.get(`${ADMIN_HOST}/client/${clientId}/cameras`, {
    headers: authHeaders(),
  });
  const data = unwrap(res);
  return data?.cameras ?? data?.data ?? (Array.isArray(data) ? data : []);
};
