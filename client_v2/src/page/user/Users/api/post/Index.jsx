import axios from 'axios';
import { sessionHeaders } from '@/utils/sessionIdentity';

const HOST = import.meta.env.VITE_BACKEND;

export const userLogin = async function (data) {
  return await axios.post(`${HOST}/users/login`, data, {
    skipSessionRedirect: true,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(await sessionHeaders()),
    },
  });
};

export const userLoginByPass = async function ({ login, pass }) {
  return await axios.post(
    `${HOST}/auth/by-login-pass`,
    new URLSearchParams({ login, pass }),
    { skipSessionRedirect: true, headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(await sessionHeaders()) } }
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
