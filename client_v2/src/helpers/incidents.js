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
