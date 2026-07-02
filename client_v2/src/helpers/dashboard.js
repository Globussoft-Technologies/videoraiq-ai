import axios from 'axios';
import getAccessToken from '@/utils/getAccessToken';

const Api_url = import.meta.env.VITE_BACKEND;

const unwrap = (res) => {
  const body = res?.data?.body;
  if (body == null) return res?.data;
  if (Object.prototype.hasOwnProperty.call(body, 'data')) return body.data;
  return body;
};

export const getHeaderStats = async (filters = {}) => {
  const token = getAccessToken();
  const res = await axios.post(
    `${Api_url}/api/v1/dashboard/headerStats`,
    filters,
    { headers: { 'Content-Type': 'application/json', 'x-access-token': token } }
  );
  return unwrap(res) || {};
};

export const getCriticalityStats = async (filters = {}, { skip = 0, limit = 8 } = {}) => {
  const token = getAccessToken();
  const res = await axios.post(
    `${Api_url}/api/v1/dashboard/criticalityStats?skip=${skip}&limit=${limit}`,
    filters,
    { headers: { 'Content-Type': 'application/json', 'x-access-token': token } }
  );
  return unwrap(res) || {};
};

export const getDetectionChart = async (filters = {}) => {
  const token = getAccessToken();
  const res = await axios.post(
    `${Api_url}/api/v1/dashboard/detectionChart`,
    filters,
    { headers: { 'Content-Type': 'application/json', 'x-access-token': token } }
  );
  return unwrap(res) || {};
};

export const getRecentIncidents = async (params = {}) => {
  const token = getAccessToken();
  const res = await axios.get(
    `${Api_url}/api/v1/dashboard/recentIncidents`,
    { params, headers: { 'x-access-token': token } }
  );
  return unwrap(res) || {};
};

export const getSidebarConfig = async () => {
  const token = getAccessToken();
  const res = await axios.get(
    `${Api_url}/api/v1/dashboard/getSidebarConfig`,
    { headers: { 'x-access-token': token } }
  );
  return unwrap(res) || {};
};

export const getWeeklyComparison = async (filters = {}) => {
  const token = getAccessToken();
  const res = await axios.post(
    `${Api_url}/api/v1/dashboard/dashboardWeeklyComparisonChart`,
    filters,
    { headers: { 'Content-Type': 'application/json', 'x-access-token': token } }
  );
  return unwrap(res) || {};
};
