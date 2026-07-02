import axios from 'axios';
import getAccessToken from '@/utils/getAccessToken';

const Api_url = import.meta.env.VITE_BACKEND;

const unwrap = (res) => {
  const body = res?.data?.body;
  if (body == null) return res?.data;
  if (Object.prototype.hasOwnProperty.call(body, 'data')) return body.data;
  return body;
};

export const fetchAdmin = async () => {
  const token = getAccessToken();
  const res = await axios.get(`${Api_url}/api/v1/admin/fetch`, { headers: { 'x-access-token': token } });
  return unwrap(res) || {};
};

export const getUsers = async (skip = 0, limit = 10, search = '') => {
  const token = getAccessToken();
  const res = await axios.post(
    `${Api_url}/api/v1/users/fetch?skip=${skip}&limit=${limit}&searchQuery=${search}&orderBy=userName&sort=asc`,
    { sortField: 'userName', sortOrder: 'asc' },
    { headers: { 'Content-Type': 'application/json', 'x-access-token': token } }
  );
  const data = unwrap(res);
  const users = data?.users ?? data?.data ?? (Array.isArray(data) ? data : []);
  const total = data?.total ?? data?.totalCount ?? users.length;
  return { users, total };
};

export const createUser = async (data) => {
  const token = getAccessToken();
  const res = await axios.post(`${Api_url}/api/v1/users/create`, data, {
    headers: { 'Content-Type': 'application/json', 'x-access-token': token },
  });
  return unwrap(res);
};

export const deleteUser = async (userId) => {
  const token = getAccessToken();
  const res = await axios.delete(`${Api_url}/api/v1/users/delete?userId=${userId}`, {
    headers: { 'x-access-token': token },
  });
  return unwrap(res);
};

export const getRoles = async (skip = 0, limit = 50, searchQuery = '') => {
  const token = getAccessToken();
  const res = await axios.post(
    `${Api_url}/api/v1/permissions/roles_permissions?searchQuery=${searchQuery}&skip=${skip}&limit=${limit}`,
    {},
    { headers: { 'Content-Type': 'application/json', 'x-access-token': token } }
  );
  const data = unwrap(res);
  const roles = data?.rolesWithPermissions ?? data?.roles ?? (Array.isArray(data) ? data : []);
  const total = data?.totalLength ?? data?.total ?? roles.length;
  return { roles, total };
};

export const fetchLogsSound = async () => {
  const token = getAccessToken();
  const res = await axios.get(`${Api_url}/api/v1/admin/fetch-logs-sound`, { headers: { 'x-access-token': token } });
  const data = unwrap(res);
  return typeof data === 'boolean' ? data : data?.logsSound ?? false;
};

export const updateLogsSound = async (logsSound) => {
  const token = getAccessToken();
  const res = await axios.put(
    `${Api_url}/api/v1/admin/update-logs-sound`,
    { logsSound },
    { headers: { 'Content-Type': 'application/json', 'x-access-token': token } }
  );
  return unwrap(res);
};
