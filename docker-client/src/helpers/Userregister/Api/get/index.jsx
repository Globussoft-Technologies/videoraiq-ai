import getAccessToken from '@/utils/getAccessToken';
import axios from 'axios';
const HOST = import.meta.env.VITE_BACKEND;

export const isEmailExist = async function (email) {
  const token = getAccessToken();
  return axios.get(`${HOST}/api/v1/users/isEmailExist/`, {
    params:{
        email 
    },
    headers: {
      'Content-Type': 'application/json',
      'x-access-token': token,
    },
  });
};
