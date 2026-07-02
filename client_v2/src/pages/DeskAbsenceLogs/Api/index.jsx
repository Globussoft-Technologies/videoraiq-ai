import axios from 'axios';
import getAccessToken from '@/utils/getAccessToken';

const HOST = import.meta.env.VITE_BACKEND;

const jsonHeaders = () => ({
  Accept: 'application/json',
  'Content-Type': 'application/json',
  'x-access-token': getAccessToken(),
});

/**
 * Paginated desk-absence chart logs. Filters live in the POST body:
 * nvrIds/channelIds are comma-separated strings; zoneNames is an array.
 * Response: res.data.body.data => { data: [...records], totalCount }.
 */
export const getDeskAbsenceLogs = async ({
  skip,
  limit,
  startDate,
  endDate,
  nvrIds,
  channelIds,
  zoneNames,
}) => {
  const body = {
    skip,
    limit,
    ...(startDate && { startDate }),
    ...(endDate && { endDate }),
    ...(Array.isArray(nvrIds) && nvrIds.length > 0 && { nvrIds: nvrIds.join(',') }),
    ...(Array.isArray(channelIds) &&
      channelIds.length > 0 && { channelIds: channelIds.join(',') }),
    ...(Array.isArray(zoneNames) && zoneNames.length > 0 && { zoneNames }),
  };
  return axios.post(`${HOST}/api/v1/incidents/logs/desk-absence`, body, {
    headers: jsonHeaders(),
  });
};

/** Zone-name options for the zone filter. */
export const getZoneNames = async () => {
  return axios.get(`${HOST}/api/v1/incidents/logs/desk-absence/filter/zone-names`, {
    headers: {
      Accept: 'application/json',
      'x-access-token': getAccessToken(),
    },
  });
};

/** Authorized NVRs for the filter dropdown. */
export const getNVRs = async () => {
  return axios.post(
    `${HOST}/api/v1/authorizedChannels/getNVRS`,
    {},
    { headers: jsonHeaders() }
  );
};

/** Channels/cameras for the selected NVRs. */
export const getchannels = async (data) => {
  return axios.post(`${HOST}/api/v1/authorizedChannels/getChannels`, data, {
    headers: jsonHeaders(),
  });
};
