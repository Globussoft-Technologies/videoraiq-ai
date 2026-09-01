import axios from 'axios';
import getAccessToken from '@/utils/getAccessToken';

const HOST = import.meta.env.VITE_BACKEND;

const jsonHeaders = () => ({
  Accept: 'application/json',
  'Content-Type': 'application/json',
  'x-access-token': getAccessToken(),
});

/**
 * Paginated attendance logs. Mirrors the V1 contract exactly: filters live in
 * the query string, employeeLocations in the POST body.
 */
export const getAttendanceLogs = async (
  searchInput,
  nvrId,
  cameraId,
  startDate,
  endDate,
  page = 1,
  limit = 10,
  sortField = 'name',
  sortOrder = 'asc',
  departmentIds,
  fromTime,
  toTime,
  timeType,
  isExport,
  employeeLocations,
  status
) => {
  const skip = (page - 1) * limit;
  const body = {
    employeeLocations: Array.isArray(employeeLocations) ? employeeLocations : [],
  };
  return axios.post(`${HOST}/attendance/get`, body, {
    params: {
      name: searchInput || '',
      channelId: cameraId,
      nvrId: nvrId,
      startDate: startDate || '',
      endDate: endDate || '',
      skip,
      limit,
      sortOrder,
      sortField,
      departmentIds,
      fromTime,
      toTime,
      timeType,
      export: isExport ? true : '',
      status: status || '',
    },
    headers: jsonHeaders(),
  });
};

/**
 * Server-rendered attendance export (PDF or CSV). Returns the exact spreadsheet
 * layout the scheduled Auto Email Report sends — multi-row check-in/check-out
 * sessions and a per-employee-day total row. Response is a binary file blob.
 */
export const exportAttendanceReport = async ({
  format,
  searchInput,
  nvrId,
  cameraId,
  startDate,
  endDate,
  sortField = 'name',
  sortOrder = 'asc',
  departmentIds,
  fromTime,
  toTime,
  timeType,
  employeeLocations,
  status,
  timezone,
}) => {
  return axios.post(
    `${HOST}/attendance/export`,
    { employeeLocations: Array.isArray(employeeLocations) ? employeeLocations : [] },
    {
      params: {
        format,
        name: searchInput || '',
        channelId: cameraId,
        nvrId,
        startDate: startDate || '',
        endDate: endDate || '',
        sortOrder,
        sortField,
        departmentIds,
        fromTime,
        toTime,
        timeType,
        export: true,
        status: status || '',
        timezone: timezone || '',
      },
      headers: jsonHeaders(),
      responseType: 'blob',
    }
  );
};

/** Detailed check-in/out pairs for a single employee on a given day (break logs). */
export const getAttendanceUserLogs = async (employeeId, date) => {
  return axios.post(
    `${HOST}/attendance/user-logs`,
    { employeeId, date },
    { headers: jsonHeaders() }
  );
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
