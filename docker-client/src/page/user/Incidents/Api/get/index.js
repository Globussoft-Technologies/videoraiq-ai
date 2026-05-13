const HOST = import.meta.env.VITE_BACKEND;
import getAccessToken from '@/utils/getAccessToken';
import axios from 'axios';

export const getAllDetectionsList = async function (skip, limit, ) {
  const token = getAccessToken();
  return await axios.get(
    `${HOST}/api/v1/incidents/getIncidentLists?skip=${skip}&limit=${limit}`,
    {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'x-access-token': token,
      },
    }
  );
};