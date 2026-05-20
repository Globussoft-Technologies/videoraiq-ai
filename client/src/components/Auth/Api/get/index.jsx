import getAccessToken from '@/utils/getAccessToken';
import axios from 'axios';
const HOST = import.meta.env.VITE_BACKEND;

export const checkNVRsPresent = async function (skip = 0, limit = 100) {
  const token = getAccessToken();
  return axios.get(
    `${HOST}/api/v1/nvr/?skip=${skip}&limit=${limit}`,
    {
      headers: {
        Accept: 'application/json',
        'x-access-token': token,
      },
      
    }
  );
};