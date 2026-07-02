import axios from 'axios';
import getAccessToken from '@/utils/getAccessToken';

const HOST = import.meta.env.VITE_BACKEND;

const jsonHeaders = () => ({
  Accept: 'application/json',
  'Content-Type': 'application/json',
  'x-access-token': getAccessToken(),
});

/**
 * Paginated access logs. Mirrors the V1 contract exactly: `sortField` and
 * `sortOrder` go in the query string, everything else in the POST body.
 */
export const getAllAccessLogsDetails = async (data) => {
  const { sortField, sortOrder, ...bodyData } = data;
  const url = `${HOST}/api/v1/accessLogs/get?sortField=${sortField}&sortOrder=${sortOrder}`;
  return axios.post(url, bodyData, { headers: jsonHeaders() });
};

/** Departments list for the filter dropdown. */
export const filterByDepartment = async (data) => {
  return axios.post(`${HOST}/api/v1/departments/get`, data, {
    headers: jsonHeaders(),
  });
};

/** Authorized NVRs for the filter dropdown. */
export const getNVRs = async () => {
  return axios.post(
    `${HOST}/api/v1/authorizedChannels/getNVRS`,
    {},
    { headers: jsonHeaders() }
  );
};

/** Channels/cameras for the selected NVRs. */
export const getchannels = async (data) => {
  return axios.post(`${HOST}/api/v1/authorizedChannels/getChannels`, data, {
    headers: jsonHeaders(),
  });
};

/** Employee locations for the location filter. */
export const getEmployeeLocations = async ({ skip = 0, limit = 100, search = '' } = {}) => {
  const params = new URLSearchParams();
  params.append('skip', skip);
  params.append('limit', limit);
  if (search) params.append('search', search);
  return axios.post(
    `${HOST}/api/v1/locations/employee-location?${params.toString()}`,
    {},
    { headers: jsonHeaders() }
  );
};

/** Toggle the tag state of an access-log entry against an authorized user. */
export const tagUser = async (userId, data) => {
  const query = userId ? `?userId=${userId}` : '';
  const response = await axios.patch(
    `${HOST}/api/v1/authorizedUsers/tag-user${query}`,
    data,
    { headers: jsonHeaders() }
  );
  return response?.data;
};

/** Paginated authorized-users list (used by the tag-user dropdown). */
export const authorizedUsers = async (skip = 0, limit = 10, search = '', data = {}) => {
  const response = await axios.post(
    `${HOST}/api/v1/authorizedUsers/fetch?skip=${skip}&limit=${limit}&search=${search}`,
    data,
    { headers: jsonHeaders() }
  );
  return response.data;
};
