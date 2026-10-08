import axios from 'axios';
import getAccessToken from '@/utils/getAccessToken';

/** Stations, absence + missed-solder alerts and hourly throughput for a date range. */
export const fetchSolderLine = ({ startDate, endDate }) =>
  axios.get(`${import.meta.env.VITE_BACKEND}/incidents/solder-line`, {
    params: { startDate, endDate },
    headers: { Accept: 'application/json', 'x-access-token': getAccessToken() },
  });
