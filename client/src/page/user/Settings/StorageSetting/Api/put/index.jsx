import getAccessToken from '@/utils/getAccessToken';
import axios from 'axios';
const HOST = import.meta.env.VITE_BACKEND;

export const updateStorage = async function (storageId, data) {
    const token = getAccessToken();
    return axios.put(`${HOST}/api/v1/storage/${storageId}`, data, {
        headers: {
            
            'Content-Type': 'application/json',
            'x-access-token': token,
        },
        validateStatus:()=> true
    });
};

export const updateStorageStatus = async function (storageId, activate) {
  const token = getAccessToken();
  const data = {
    storageId,
    activate
  };
  return axios.put(`${HOST}/api/v1/storage/activate`, data, {
    headers: {
      'Content-Type': 'application/json',
      'x-access-token': token,
    },
    validateStatus:()=> true
  });
};
