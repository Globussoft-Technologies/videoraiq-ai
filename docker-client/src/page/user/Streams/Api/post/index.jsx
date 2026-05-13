const HOST = import.meta.env.VITE_BACKEND;
import getAccessToken from '@/utils/getAccessToken';
import axios from 'axios';

export const addNVRaccount = async function (data) {
  const token = getAccessToken();
  return await axios.post(`${HOST}/api/v1/nvr/register`, data, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'x-access-token': token,
    },
  });
};

export const getDepartmentList = async function () {
  const token = getAccessToken();
  return axios.post(`${HOST}/api/v1/departments/get`,   {}, {
    headers: {
      Accept: 'application/json',
      'x-access-token': token,
    },
  });
};
