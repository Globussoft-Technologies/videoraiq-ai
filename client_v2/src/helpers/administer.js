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
  const res = await axios.get(`${Api_url}/admin/fetch`, { headers: { 'x-access-token': token } });
  const data = unwrap(res) || {};
  return data.adminDetails || data;
};

export const getUsers = async (skip = 0, limit = 10, search = '') => {
  const token = getAccessToken();
  const res = await axios.post(
    `${Api_url}/users/fetch?skip=${skip}&limit=${limit}&searchQuery=${search}&orderBy=userName&sort=asc`,
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
  const res = await axios.post(`${Api_url}/users/create`, data, {
    headers: { 'Content-Type': 'application/json', 'x-access-token': token },
  });
  return unwrap(res);
};

export const deleteUser = async (userId) => {
  const token = getAccessToken();
  const res = await axios.delete(`${Api_url}/users/delete?userId=${userId}`, {
    headers: { 'x-access-token': token },
  });
  return unwrap(res);
};

export const getRoles = async (skip = 0, limit = 50, searchQuery = '') => {
  const token = getAccessToken();
  const res = await axios.post(
    `${Api_url}/permissions/roles_permissions?searchQuery=${searchQuery}&skip=${skip}&limit=${limit}`,
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
  const res = await axios.get(`${Api_url}/admin/fetch-logs-sound`, { headers: { 'x-access-token': token } });
  const data = unwrap(res);
  return typeof data === 'boolean' ? data : data?.logsSound ?? false;
};

export const updateLogsSound = async (logsSound) => {
  const token = getAccessToken();
  const res = await axios.put(
    `${Api_url}/admin/update-logs-sound`,
    { logsSound },
    { headers: { 'Content-Type': 'application/json', 'x-access-token': token } }
  );
  return unwrap(res);
};

export const getTimezones = async (search = '') => {
  const token = getAccessToken();
  const res = await axios.get(`${Api_url}/admin/timezones`, {
    params: search ? { search } : undefined,
    headers: { 'x-access-token': token },
  });
  const data = unwrap(res);
  return data?.timezones ?? (Array.isArray(data) ? data : []);
};

export const fetchTimezone = async () => {
  const token = getAccessToken();
  const res = await axios.get(`${Api_url}/admin/timezone`, {
    headers: { 'x-access-token': token },
  });
  const data = unwrap(res);
  return data?.timezone ?? '';
};

export const updateTimezone = async (timezone) => {
  const token = getAccessToken();
  const res = await axios.put(
    `${Api_url}/admin/timezone`,
    { timezone },
    { headers: { 'Content-Type': 'application/json', 'x-access-token': token } }
  );
  return unwrap(res);
};

/** Per-org attendance rules. Falls back to server defaults if never saved. */
export const getAttendanceSettings = async () => {
  const token = getAccessToken();
  const res = await axios.get(`${Api_url}/attendance/settings`, {
    headers: { 'x-access-token': token },
  });
  return unwrap(res) || {};
};

export const updateAttendanceSettings = async ({ fullDayHours, halfDayHours }) => {
  const token = getAccessToken();
  const res = await axios.put(
    `${Api_url}/attendance/settings`,
    { fullDayHours, halfDayHours },
    { headers: { 'Content-Type': 'application/json', 'x-access-token': token } }
  );
  return unwrap(res);
};

export const updateRetention = async ({ userId, ...payload }) => {
  const token = getAccessToken();
  const res = await axios.put(
    `${Api_url}/admin/retention`,
    { userId, ...payload },
    { headers: { 'Content-Type': 'application/json', 'x-access-token': token } }
  );
  return unwrap(res);
};
