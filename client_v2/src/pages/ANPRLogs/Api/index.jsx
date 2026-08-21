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

/**
 * Update an ANPR/incident's editable details (name, vehicle number, severity,
 * time, NVR, camera). Ported from V1's EditANPRLogDialog `editIncidentDetails`.
 */
export const editIncidentDetails = async (id, data) => {
  return axios.patch(`${HOST}/incidents/${id}/details`, data, {
    headers: jsonHeaders(),
  });
};

/**
 * Paginated vehicle / obstruction (ANPR) detection logs.
 * Filters live in the query string. Mirrors the V1 contract exactly.
 */
export const fetchVehicleObstructionLogs = async ({
  skip,
  limit,
  startDate,
  endDate,
  sortField,
  sortOrder,
  nvrIds,
  channelIds,
  severity,
  resolved,
  reportStatus,
  vehicleNumber,
  tagStatus,
  search,
}) => {
  return axios.get(`${HOST}/incidents/logs/vehicle-detection`, {
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
      ...(resolved !== '' && resolved !== undefined && { resolved }),
      ...(reportStatus !== '' && reportStatus !== undefined && { reportStatus }),
      ...(vehicleNumber && { vehicleNumber }),
      ...(tagStatus && { tagStatus }),
      ...(search && { search }),
    },
    headers: getHeaders(),
  });
};

/** Distinct vehicle numbers for the vehicle-number filter dropdown. */
export const getVehicleNumbers = async (search) => {
  return axios.get(`${HOST}/incidents/logs/vehicle-detection/numbers`, {
    params: {
      ...(search && { search }),
    },
    headers: getHeaders(),
  });
};
