import axios from 'axios';

const HOST = import.meta.env.VITE_BACKEND;

export const userLogin = async function (data) {
  return await axios.post(`${HOST}/users/login`, data, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  });
};

export const userLoginByPass = async function ({ login, pass }) {
  return await axios.post(
    `${HOST}/auth/by-login-pass`,
    new URLSearchParams({ login, pass }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
};

export const forgotPassword = async function (data) {
  return await axios.post(`${HOST}/users/forgot-password`, data, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  });
};

export const resetpassword = async function (data) {
  return await axios.post(`${HOST}/users/reset-password`, data, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  });
};
