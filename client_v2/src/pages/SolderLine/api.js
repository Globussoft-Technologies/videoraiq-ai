import axios from 'axios';
import getAccessToken from '@/utils/getAccessToken';

/** Stations, absence + missed-solder alerts and hourly throughput for a date range. */
export const fetchSolderLine = ({ startDate, endDate }, { signal } = {}) =>
  axios.get(`${import.meta.env.VITE_BACKEND}/incidents/solder-line`, {
    params: { startDate, endDate },
    signal,
    headers: { Accept: 'application/json', 'x-access-token': getAccessToken() },
  });
