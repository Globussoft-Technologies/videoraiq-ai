import axios from 'axios';
import getAccessToken from '@/utils/getAccessToken';
import { waitForToken } from '@/utils/waitForToken';

const HOST = import.meta.env.VITE_BACKEND;

const jsonHeaders = () => ({
  Accept: 'application/json',
  'Content-Type': 'application/json',
  'x-access-token': getAccessToken(),
});

/**
 * Paginated access-logs details. Mirrors the V1 contract exactly: sortField &
 * sortOrder ride in the query string, all other filters in the POST body.
 */
export const getAllAccessLogsDetails = async (data) => {
  const { sortField, sortOrder, ...bodyData } = data;
  const url = `${HOST}/accessLogs/get?sortField=${sortField}&sortOrder=${sortOrder}`;
  return axios.post(url, bodyData, { headers: jsonHeaders() });
};

/** Departments list for the filter dropdown. */
export const filterByDepartment = async (data) => {
  return axios.post(`${HOST}/departments/get`, data, {
    headers: jsonHeaders(),
  });
};

/** Authorized NVRs for the filter dropdown. */
export const getNVRs = async () => {
  return axios.post(
    `${HOST}/authorizedChannels/getNVRS`,
    {},
    { headers: jsonHeaders() }
  );
};

/** Channels/cameras for the selected NVRs. */
export const getchannels = async (data) => {
  return axios.post(`${HOST}/authorizedChannels/getChannels`, data, {
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
    `${HOST}/locations/employee-location?${params.toString()}`,
    {},
    { headers: jsonHeaders() }
  );
};

/** Tag / untag a user for a given access-log entry. */
export const tagUser = async (userId, data) => {
  const token = await waitForToken();
  const query = userId ? `?userId=${userId}` : '';
  const response = await axios.patch(
    `${HOST}/authorizedUsers/tag-user${query}`,
    data,
    {
      headers: {
        'Content-Type': 'application/json',
        'x-access-token': token,
      },
    }
  );
  return response?.data;
};
