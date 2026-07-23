import axios from 'axios';
import getAccessToken from '@/utils/getAccessToken';

const HOST = import.meta.env.VITE_BACKEND;

const jsonHeaders = () => ({
  Accept: 'application/json',
  'Content-Type': 'application/json',
  'x-access-token': getAccessToken(),
});

/** Paginated per-channel presence/absence incidents for the given date. */
export const getDeskChannelGraph = (searchQuery, skip, limit, data) =>
  axios.post(
    `${HOST}/incidents/deskAbsenceData?search=${searchQuery}&skip=${skip}&limit=${limit}`,
    data,
    { headers: jsonHeaders() }
  );
