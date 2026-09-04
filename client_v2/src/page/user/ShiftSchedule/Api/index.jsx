import axios from 'axios';
import getAccessToken from '@/utils/getAccessToken';

const Api_url = import.meta.env.VITE_BACKEND;

const headers = () => ({
  'Content-Type': 'application/json',
  'x-access-token': getAccessToken(),
});

/**
 * The monthly grid.
 *
 * POST rather than GET because the filters are arrays (locations, departments,
 * designations) and squeezing those through a query string is what makes them
 * break on the first location containing a comma.
 */
export const fetchSchedule = async (params) =>
  axios.post(`${Api_url}/shifts/schedule`, params, { headers: headers() });

/** Assign / change / mark off a single employee-day. */
export const assignScheduleDay = async (payload) =>
  axios.put(`${Api_url}/shifts/schedule/day`, payload, { headers: headers() });

/** Assign across a range for many employees at once. */
export const bulkAssignSchedule = async (payload) =>
  axios.put(`${Api_url}/shifts/schedule/bulk`, payload, { headers: headers() });

/** Drop overrides so the days inherit the standing shift again. */
export const clearScheduleDays = async (payload) =>
  axios.patch(`${Api_url}/shifts/schedule/clear`, payload, { headers: headers() });

/** Distinct designations, backing the Role filter. */
export const fetchDesignations = async () =>
  axios.get(`${Api_url}/shifts/schedule/designations`, { headers: headers() });

export const fetchDepartments = async (skip = 0, limit = 200) =>
  axios.post(`${Api_url}/departments/get`, { skip, limit }, { headers: headers() });

export const fetchEmployeeLocations = async ({ skip = 0, limit = 200 } = {}) =>
  axios.post(
    `${Api_url}/locations/employee-location?skip=${skip}&limit=${limit}`,
    {},
    { headers: headers() },
  );
