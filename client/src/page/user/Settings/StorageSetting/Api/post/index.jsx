const HOST = import.meta.env.VITE_BACKEND;
import getAccessToken from '@/utils/getAccessToken';
import axios from 'axios';

export const addStorage = async function (data) {
  const token = getAccessToken();
  return await axios.post(`${HOST}/api/v1/storage`, data, {
    headers: {      
       'Content-Type': 'application/json',
      'x-access-token': token,
    },
  });
};
