import axios from 'axios';

const HOST = import.meta.env.VITE_BACKEND;

export const userLogin = async function (data) {
  return await axios.post(`${HOST}/api/v1/users/login`, data, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  });
};

export const userLoginByPass = async function ({ login, pass }) {
  return await axios.post(
    `${HOST}/api/v1/auth/by-login-pass`,
    new URLSearchParams({ login, pass }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
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
