import axios from 'axios';
import getAccessToken from '@/utils/getAccessToken';

const HOST = import.meta.env.VITE_BACKEND;

export const getHygieneLogFilters = () => axios.get(`${HOST}/incidents/logs/hygiene-sanitation-food-safety-detection/filters`, { headers: getHeaders() });

const jsonHeaders = () => ({
  Accept: 'application/json',
  'Content-Type': 'application/json',
  'x-access-token': getAccessToken(),
});

const getHeaders = () => ({
  Accept: 'application/json',
  'x-access-token': getAccessToken(),
});

/** Authorized NVRs for the filter dropdown. */
export const getNVRs = async () => {
  return axios.post(`${HOST}/authorizedChannels/getNVRS`, {}, { headers: jsonHeaders() });
};

/** Channels/cameras for the selected NVRs. */
export const getchannels = async (data) => {
  return axios.post(`${HOST}/authorizedChannels/getChannels`, data, { headers: jsonHeaders() });
};

/** Cameras with populated detection settings for live overview widgets. */
export const getDetectionChannels = async ({ engines = '', limit = 500 } = {}) => {
  // Use the same channel route as Camera Configuration. The all-channels
  // route has a different response projection and can omit detection entries.
  return axios.get(`${HOST}/channel/`, {
    params: { limit, ...(engines ? { engines } : {}) },
    headers: getHeaders(),
  });
};

/**
 * Update an incident's editable details (name, severity, time, NVR, camera).
 * Ported from V1's EditANPRLogDialog `editIncidentDetails` — the V2 backend
 * exposes the same route under the /api/v2 base carried by VITE_BACKEND.
 */
export const editIncidentDetails = async (id, data) => {
  return axios.patch(`${HOST}/incidents/${id}/details`, data, { headers: jsonHeaders() });
};

/**
 * Paginated incident logs for one of the stevinrock detection endpoints.
 * The `endpoint` (e.g. `/incidents/logs/conveyor-detection`) selects which log
 * stream to read; all incident-table pages share this contract. Filters live in the
 * query string, mirroring the V1 EmployeeLogs pages exactly.
 */
export const fetchIncidentLogs = async ({
  endpoint,
  method = 'get',
  skip,
  limit,
  startDate,
  endDate,
  fromTime,
  toTime,
  sortField,
  sortOrder,
  nvrIds,
  channelIds,
  severity,
  status,
  doorStatus,
  search,
  vehicleNumber,
  boxType,
  direction,
  hygieneCategory,
  lightingCategory,
}) => {
  return axios.request({
    method,
    url: `${HOST}${endpoint}`,
    params: {
      skip,
      limit,
      ...(startDate && { startDate }),
      ...(endDate && { endDate }),
      ...(fromTime && { fromTime }),
      ...(toTime && { toTime }),
      ...(sortField && { sortField }),
      ...(sortOrder && { sortOrder }),
      ...(nvrIds?.length && { nvrIds: nvrIds.join(',') }),
      ...(channelIds?.length && { channelIds: channelIds.join(',') }),
      ...(Array.isArray(lightingCategory) && lightingCategory.length ? { lightingCategory: lightingCategory.join(',') } : {}),
      ...(Array.isArray(hygieneCategory) && hygieneCategory.length ? { hygieneCategory: hygieneCategory.join(',') } : typeof hygieneCategory === 'string' && hygieneCategory ? { hygieneCategory } : {}),
      ...(Array.isArray(severity) ? severity.length ? { severity: severity.join(',') } : {} : severity ? { severity } : {}),
      ...(status && { status }),
      ...(doorStatus && { doorStatus }),
      ...(search && { search }),
      ...(vehicleNumber?.trim() && { vehicleNumber: vehicleNumber.trim() }),
      ...(boxType?.trim() && { boxType: boxType.trim() }),
      ...(direction && direction !== 'all' && { direction }),
    },
    headers: getHeaders(),
  });
};

// Keep Door Logs correct when an older API deployment ignores doorStatus.
// Pass the filter to the server, then validate all returned pages locally so
// pagination and totals are based on the selected status in either case.
export const fetchDoorStatusLogs = async ({ doorStatus, ...params }) => {
  const batchSize = 500;
  const allRows = [];
  let totalCount = Infinity;

  while (allRows.length < totalCount) {
    const response = await fetchIncidentLogs({ ...params, doorStatus, skip: allRows.length, limit: batchSize });
    const page = response?.data?.body?.data;
    const rows = Array.isArray(page?.data) ? page.data : [];
    totalCount = Number(page?.totalCount) || 0;
    allRows.push(...rows);
    if (!rows.length) break;
  }

  return allRows.filter((row) => String(row.doorStatus || '').trim().toLowerCase() === doorStatus);
};

export const fetchIncidentBoxTypes = async ({
  endpoint,
  search,
  startDate,
  endDate,
  nvrIds,
  channelIds,
  vehicleNumber,
}) => {
  return axios.get(`${HOST}${endpoint}`, {
    params: {
      ...(search && { search }),
      ...(startDate && { startDate }),
      ...(endDate && { endDate }),
      ...(nvrIds?.length && { nvrIds: nvrIds.join(',') }),
      ...(channelIds?.length && { channelIds: channelIds.join(',') }),
      ...(vehicleNumber?.trim() && { vehicleNumber: vehicleNumber.trim() }),
    },
    headers: getHeaders(),
  });
};

export const fetchStockCountingAnalytics = async (filters = {}, options = {}) => {
  return axios.get(`${HOST}/incidents/logs/loading-unloading-stock-counting-detection/analytics`, {
    signal: options.signal,
    params: {
      ...(filters.mode && { mode: filters.mode, skip: filters.skip, limit: filters.limit }),
      ...(filters.startDate && { startDate: filters.startDate }),
      ...(filters.endDate && { endDate: filters.endDate }),
      ...(filters.nvrIds?.length && { nvrIds: filters.nvrIds.join(',') }),
      ...(filters.channelIds?.length && { channelIds: filters.channelIds.join(',') }),
      ...(filters.vehicleNumber?.trim() && { vehicleNumber: filters.vehicleNumber.trim() }),
      ...(filters.boxType?.trim() && { boxType: filters.boxType.trim() }),
      ...(filters.search?.trim() && { search: filters.search.trim() }),
    },
    headers: getHeaders(),
  });
};

export const fetchIncidentVehicleNumbers = async ({
  endpoint,
  search,
  startDate,
  endDate,
  nvrIds,
  channelIds,
}) => {
  return axios.get(`${HOST}${endpoint}`, {
    params: {
      ...(search && { search }),
      ...(startDate && { startDate }),
      ...(endDate && { endDate }),
      ...(nvrIds?.length && { nvrIds: nvrIds.join(',') }),
      ...(channelIds?.length && { channelIds: channelIds.join(',') }),
    },
    headers: getHeaders(),
  });
};

export const deleteLineCrossingLogs = async ({
  startDate,
  endDate,
  nvrIds,
  channelIds,
  all,
}) => {
  return axios.delete(`${HOST}/incidents/logs/line-crossing`, {
    params: {
      ...(all && { all: true }),
      ...(startDate && { startDate }),
      ...(endDate && { endDate }),
      ...(nvrIds?.length && { nvrIds: nvrIds.join(',') }),
      ...(channelIds?.length && { channelIds: channelIds.join(',') }),
    },
    headers: getHeaders(),
  });
};
