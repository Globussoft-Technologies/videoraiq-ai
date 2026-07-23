import axios from 'axios';
import getAccessToken from '@/utils/getAccessToken';

const HOST = import.meta.env.VITE_BACKEND;

/**
 * Paginated person-count logs. Mirrors the V1 contract exactly: pagination and
 * optional date range live in the query string. nvrIds/channelIds are optional
 * comma-separated filters — the backend's _fetchIncidentLogs already supports them.
 */
export const fetchPersonCountLogs = async ({ skip, limit, startDate, endDate, nvrIds, channelIds }) => {
  const token = getAccessToken();
  return axios.get(`${HOST}/incidents/logs/person-count`, {
    params: {
      skip,
      limit,
      ...(startDate && { startDate }),
      ...(endDate && { endDate }),
      ...(nvrIds?.length && { nvrIds: nvrIds.join(',') }),
      ...(channelIds?.length && { channelIds: channelIds.join(',') }),
    },
    headers: {
      Accept: 'application/json',
      'x-access-token': token,
    },
  });
};
