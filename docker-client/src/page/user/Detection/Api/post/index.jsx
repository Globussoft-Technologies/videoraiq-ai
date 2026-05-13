import getAccessToken from '@/utils/getAccessToken';
import axios from 'axios';
const HOST = import.meta.env.VITE_BACKEND;

export const addNewDetectionConfiguration = async function (data) {
  const token = getAccessToken();
  return axios.post(`${HOST}/api/v1/detection-settings`, data, {
    headers: {
      Accept: 'application/json',
      'x-access-token': token,
    },
  });
};
