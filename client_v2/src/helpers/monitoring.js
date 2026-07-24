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
    `${Api_url}/locations/fetch?skip=${skip}&limit=${limit}&search=${search}`,
    {},
    { headers: { 'Content-Type': 'application/json', 'x-access-token': token } }
  );
  const data = res?.data?.body?.data;
  if (Array.isArray(data)) return data;
  return data?.locations ?? [];
};

/* accept a string or an array of ids/values and return a comma-joined string */
const csv = (v) => (Array.isArray(v) ? v.filter(Boolean).join(',') : v ?? '');

export const getChannels = async ({
  skip = 0,
  limit = 50,
  nvrId = '',
  location = '',
  department = '',
  camType = '',
  camera = '',
} = {}) => {
  const token = getAccessToken();
  const params = new URLSearchParams({ skip: String(skip), limit: String(limit) });
  const nvr = csv(nvrId);
  const loc = csv(location);
  const dept = csv(department);
  const type = csv(camType);
  const cam = csv(camera);
  if (nvr) params.append('nvrId', nvr);
  if (loc) params.append('location', loc);
  if (dept) params.append('department', dept);
  if (type) params.append('camType', type);
  if (cam) params.append('_id', cam);
  const res = await axios.get(`${Api_url}/channel/?${params.toString()}`, {
    headers: { 'x-access-token': token },
  });
  const data = unwrap(res);
  if (Array.isArray(data)) return data;
  return data?.channels ?? [];
};

/** Authorized NVRs for the filter dropdowns → [{ _id, nvrName }]. */
export const getNVRs = async () => {
  const token = getAccessToken();
  const res = await axios.post(
    `${Api_url}/authorizedChannels/getNVRS`,
    {},
    { headers: { 'Content-Type': 'application/json', 'x-access-token': token } }
  );
  const data = res?.data?.body?.data;
  return Array.isArray(data) ? data : [];
};

/** Departments for the filter dropdown → [{ _id, departmentName }]. */
export const getDepartments = async ({ skip = 0, limit = 100 } = {}) => {
  const token = getAccessToken();
  const res = await axios.post(
    `${Api_url}/departments/get`,
    { skip, limit },
    { headers: { 'Content-Type': 'application/json', 'x-access-token': token } }
  );
  const data = res?.data?.body?.data;
  const list = data?.data ?? data?.departments ?? (Array.isArray(data) ? data : []);
  return Array.isArray(list) ? list : [];
};

export const getAttendance = async ({ startDate = '', endDate = '', name = '', skip = 0, limit = 12, employeeLocations = [] } = {}) => {
  const token = getAccessToken();
  const res = await axios.post(
    `${Api_url}/attendance/get`,
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
    `${Api_url}/incidents/update-report-status`,
    payload,
    { headers: { 'Content-Type': 'application/json', 'x-access-token': token } }
  );
  return unwrap(res);
};
export const updateIncidentResolved = async ({ incidentId, incidentType, resolved = true }) => {
  const token = getAccessToken();
  const res = await axios.put(
    `${Api_url}/incidents/${incidentId}`,
    { resolved, incidentType },
    { headers: { 'Content-Type': 'application/json', 'x-access-token': token } }
  );
  return unwrap(res);
};
