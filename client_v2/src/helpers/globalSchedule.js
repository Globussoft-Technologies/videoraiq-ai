import axios from 'axios';
import getAccessToken from '@/utils/getAccessToken';

const Api_url = import.meta.env.VITE_BACKEND;

const unwrap = (res) => {
  const body = res?.data?.body;
  if (body == null) return res?.data;
  if (Object.prototype.hasOwnProperty.call(body, 'data')) return body.data;
  return body;
};

const authHeaders = () => ({ 'x-access-token': getAccessToken() });

const jsonHeaders = () => ({ 'Content-Type': 'application/json', ...authHeaders() });

/**
 * Pull the human-readable message out of a failed request so callers can show
 * the server's actual validation error ("Monday schedule windows cannot
 * overlap") instead of a generic failure.
 */
export const globalScheduleErrorMessage = (error, fallback = 'Something went wrong') => {
  const body = error?.response?.data?.body ?? error?.response?.data;
  return body?.error || body?.message || error?.message || fallback;
};

/** NVR details + its cameras split into configured / non-configured (Tab 1). */
export const getNvrCamerasForGlobalSchedule = async (nvrId, { search = '' } = {}) => {
  const params = new URLSearchParams();
  if (search.trim()) params.set('search', search.trim());

  const query = params.toString();
  const res = await axios.get(`${Api_url}/global-schedules/nvr/${nvrId}/cameras${query ? `?${query}` : ''}`, {
    headers: authHeaders(),
  });
  return unwrap(res);
};

/** Existing global schedules, optionally narrowed to one NVR. */
export const getGlobalSchedules = async (nvrId) => {
  const res = await axios.get(`${Api_url}/global-schedules${nvrId ? `?nvrId=${nvrId}` : ''}`, {
    headers: authHeaders(),
  });
  const data = unwrap(res);
  return data?.globalSchedules ?? [];
};

export const createGlobalSchedule = async (payload) => {
  const res = await axios.post(`${Api_url}/global-schedules`, payload, { headers: jsonHeaders() });
  return unwrap(res);
};

export const updateGlobalSchedule = async (id, payload) => {
  const res = await axios.put(`${Api_url}/global-schedules/${id}`, payload, {
    headers: jsonHeaders(),
  });
  return unwrap(res);
};

export const deleteGlobalSchedule = async (id) => {
  const res = await axios.delete(`${Api_url}/global-schedules/${id}`, { headers: authHeaders() });
  return unwrap(res);
};
