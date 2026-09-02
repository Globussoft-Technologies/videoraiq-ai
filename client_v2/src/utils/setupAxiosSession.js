import axios from 'axios';
import { sessionHeaders } from './sessionIdentity';
import { logout } from '@/hooks/logout';

axios.interceptors.request.use(async (config) => {
  config.headers = config.headers || {};
  Object.assign(config.headers, await sessionHeaders());
  return config;
});

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    const body = error?.response?.data?.body || error?.response?.data;
    if (!error?.config?.skipSessionRedirect && ['SESSION_BLOCKED', 'SESSION_LOGGED_OUT', 'SESSION_INVALID', 'DEVICE_BLOCKED'].includes(body?.code)) {
      logout({ clearSession: false, syncServer: false });
      window.location.replace('/admin-login');
    }
    return Promise.reject(error);
  }
);
