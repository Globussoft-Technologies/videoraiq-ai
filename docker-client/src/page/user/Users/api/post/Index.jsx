const HOST = import.meta.env.VITE_BACKEND;
import axios from 'axios';

export const userLogin = async function (data) {
  return await axios.post(`${HOST}/api/v1/users/login`, data, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    
    },
  });
};
export const forgotPassword = async function (data) {
  return await axios.post(`${HOST}/api/v1/users/forgot-password`, data, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    
    },
  });
};

export const resetpassword = async function (data) {
  return await axios.post(`${HOST}/api/v1/users/reset-password`, data, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    
    },
  });
};
