import getAccessToken from '@/utils/getAccessToken';
import axios from 'axios';
const HOST = import.meta.env.VITE_BACKEND;

export const deleteStorage = async function (storageId) {
  const token = getAccessToken();
  return await axios.delete(`${HOST}/api/v1/storage/${storageId}`, {
    headers: {
      'x-access-token': token,
      'Content-Type': 'application/json',     
    },
    validateStatus:()=> true
  });
};
