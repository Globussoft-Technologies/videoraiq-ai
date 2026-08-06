import axios from 'axios';
import getAccessToken from '@/utils/getAccessToken';

const HOST = import.meta.env.VITE_BACKEND;

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
 * stream to read; all six table pages share this contract. Filters live in the
 * query string, mirroring the V1 EmployeeLogs pages exactly.
 */
export const fetchIncidentLogs = async ({
  endpoint,
  skip,
  limit,
  startDate,
  endDate,
  sortField,
  sortOrder,
  nvrIds,
  channelIds,
  severity,
  status,
  search,
}) => {
  return axios.get(`${HOST}${endpoint}`, {
    params: {
      skip,
      limit,
      ...(startDate && { startDate }),
      ...(endDate && { endDate }),
      ...(sortField && { sortField }),
      ...(sortOrder && { sortOrder }),
      ...(nvrIds?.length && { nvrIds: nvrIds.join(',') }),
      ...(channelIds?.length && { channelIds: channelIds.join(',') }),
      ...(severity && { severity }),
      ...(status && { status }),
      ...(search && { search }),
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
