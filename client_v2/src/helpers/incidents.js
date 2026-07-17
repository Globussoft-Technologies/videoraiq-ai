import axios from 'axios';
import getAccessToken from '@/utils/getAccessToken';

const Api_url = import.meta.env.VITE_BACKEND;

const unwrap = (res) => {
  const body = res?.data?.body;
  if (body == null) return res?.data;
  if (Object.prototype.hasOwnProperty.call(body, 'data')) return body.data;
  return body;
};

export const fetchIncidents = async ({ skip = 0, limit = 12 } = {}, filter = {}) => {
  const token = getAccessToken();
  const res = await axios.post(
    `${Api_url}/incidents?skip=${skip}&limit=${limit}`,
    filter,
    { headers: { 'Content-Type': 'application/json', 'x-access-token': token } }
  );
  const d = res?.data || {};
  return { items: Array.isArray(d.data) ? d.data : [], totalCount: d.totalCount ?? 0 };
};

// Fetches a single incident by id — used to deep-link a notification straight
// to its alert, since the general feed may not include it (older, or filtered
// out by the current severity/status/date tabs).
export const fetchIncidentById = async (incidentId) => {
  const token = getAccessToken();
  const res = await axios.get(
    `${Api_url}/incidents/getIncident`,
    { params: { incidentId }, headers: { 'x-access-token': token } }
  );
  const d = res?.data || {};
  const items = Array.isArray(d.data) ? d.data : [];
  return items[0] || null;
};

export const fetchIncidentStats = async (filter = {}) => {
  const token = getAccessToken();
  const res = await axios.post(
    `${Api_url}/dashboard/headerStats`,
    filter,
    { headers: { 'Content-Type': 'application/json', 'x-access-token': token } }
  );
  return unwrap(res) || {};
};

export const fetchDetectionTypes = async ({ skip = 0, limit = 100 } = {}) => {
  const token = getAccessToken();
  const res = await axios.get(
    `${Api_url}/incidents/getIncidentLists?skip=${skip}&limit=${limit}`,
    { headers: { 'x-access-token': token } }
  );
  const body = res?.data?.body;
  const result = body?.data?.result || body?.data || body || [];
  return Array.isArray(result) ? result : [];
};

export const fetchIncidentsByType = async ({ incidentType, skip = 0, limit = 12 } = {}) => {
  const token = getAccessToken();
  const res = await axios.get(
    `${Api_url}/dashboard/getIncidentsByType`,
    { params: { incidentType, skip, limit }, headers: { 'x-access-token': token } }
  );
  return unwrap(res) || {};
};

export const updateReportStatus = async (payload) => {
  const token = getAccessToken();
  const res = await axios.post(
    `${Api_url}/incidents/update-report-status`,
    payload,
    { headers: { 'Content-Type': 'application/json', 'x-access-token': token } }
  );
  return unwrap(res);
};

export const deleteIncidents = async (incidentIds = []) => {
  const token = getAccessToken();
  const res = await axios.delete(
    `${Api_url}/incidents/delete-by-incidentIds`,
    { data: { incidentIds }, headers: { 'Content-Type': 'application/json', 'x-access-token': token } }
  );
  return unwrap(res);
};
