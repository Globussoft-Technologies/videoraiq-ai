import axios from 'axios';
import getAccessToken from '@/utils/getAccessToken';

const HOST = import.meta.env.VITE_BACKEND;

/**
 * Paginated person-count logs. Mirrors the V1 contract exactly: pagination and
 * optional date range live in the query string.
 */
export const fetchPersonCountLogs = async ({ skip, limit, startDate, endDate }) => {
  const token = getAccessToken();
  return axios.get(`${HOST}/api/v1/incidents/logs/person-count`, {
    params: {
      skip,
      limit,
      ...(startDate && { startDate }),
      ...(endDate && { endDate }),
    },
    headers: {
      Accept: 'application/json',
      'x-access-token': token,
    },
  });
};
