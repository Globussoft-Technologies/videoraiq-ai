import axios from 'axios';
import getAccessToken from '@/utils/getAccessToken';

const HOST = import.meta.env.VITE_BACKEND;

/**
 * Paginated vehicle-count logs. Mirrors the V1 contract: pagination and optional
 * date range live in the query string; each record carries a `timeSeries` array.
 */
export const fetchVehicleCountLogs = async ({ skip, limit, startDate, endDate }) => {
  const token = getAccessToken();
  return axios.get(`${HOST}/incidents/logs/vehicle-count`, {
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
