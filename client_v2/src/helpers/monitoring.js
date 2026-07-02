import axios from 'axios';
import getAccessToken from '@/utils/getAccessToken';

const Api_url = import.meta.env.VITE_BACKEND;

const unwrap = (res) => {
  const body = res?.data?.body;
  if (body == null) return res?.data;
  if (Object.prototype.hasOwnProperty.call(body, 'data')) return body.data;
  return body;
};

export const getLocations = async (skip = 0, limit = 100, search = '') => {
  const token = getAccessToken();
  const res = await axios.post(
    `${Api_url}/api/v1/locations/fetch?skip=${skip}&limit=${limit}&search=${search}`,
    {},
    { headers: { 'Content-Type': 'application/json', 'x-access-token': token } }
  );
  const data = res?.data?.body?.data;
  if (Array.isArray(data)) return data;
  return data?.locations ?? [];
};

export const getChannels = async ({ skip = 0, limit = 50, nvrId = '', location = '', department = '' } = {}) => {
  const token = getAccessToken();
  const res = await axios.get(
    `${Api_url}/api/v1/channel/?nvrId=${nvrId}&skip=${skip}&limit=${limit}&department=${department}&location=${location}`,
    { headers: { 'x-access-token': token } }
  );
  const data = unwrap(res);
  if (Array.isArray(data)) return data;
  return data?.channels ?? [];
};

export const getAttendance = async ({ startDate = '', endDate = '', name = '', skip = 0, limit = 12, employeeLocations = [] } = {}) => {
  const token = getAccessToken();
  const res = await axios.post(
    `${Api_url}/api/v1/attendance/get`,
    { employeeLocations: Array.isArray(employeeLocations) ? employeeLocations : [] },
    { params: { name, startDate, endDate, skip, limit, sortField: 'date', sortOrder: 'desc' }, headers: { 'Content-Type': 'application/json', 'x-access-token': token } }
  );
  const data = res?.data?.body?.data;
  if (Array.isArray(data)) return data;
  return data?.attendanceLogs ?? data?.data ?? [];
};

export const updateIncidentReportStatus = async (payload) => {
  const token = getAccessToken();
  const res = await axios.post(
    `${Api_url}/api/v1/incidents/update-report-status`,
    payload,
    { headers: { 'Content-Type': 'application/json', 'x-access-token': token } }
  );
  return unwrap(res);
};
