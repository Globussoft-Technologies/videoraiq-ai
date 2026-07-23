import axios from 'axios';
import getAccessToken from '@/utils/getAccessToken';

const HOST = import.meta.env.VITE_BACKEND;

const jsonHeaders = () => ({
  Accept: 'application/json',
  'Content-Type': 'application/json',
  'x-access-token': getAccessToken(),
});

/** Paginated per-channel guard presence/absence incidents for the given date. */
export const getGuardChannelGraph = (searchQuery, skip, limit, data) =>
  axios.post(
    `${HOST}/incidents/guardAbsenceData?search=${searchQuery}&skip=${skip}&limit=${limit}`,
    data,
    { headers: jsonHeaders() }
  );
