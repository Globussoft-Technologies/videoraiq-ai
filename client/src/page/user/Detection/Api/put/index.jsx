import getAccessToken from '@/utils/getAccessToken';
import axios from 'axios';
const HOST = import.meta.env.VITE_BACKEND;

export const updateDetectionSettings = async function (id,data) {
  const token = getAccessToken();
  return axios.put(`${HOST}/api/v1/detection-settings/${id}`, data, {
    headers: {
       Accept: 'application/json',
      "Content-Type": 'application/json',
      'x-access-token': token,
    },
  });
};

export const enableDetectionSettings = async function (data) {
  const token = getAccessToken();
  return axios.put(`${HOST}/api/v1/channel/detection/toggle`, data, {
    headers: {
       Accept: 'application/json',
      "Content-Type": 'application/json',
      'x-access-token': token,
    },
  });
};

// Save the admin's global timezone. Body: { timezone: "Asia/Kolkata" }.
export const updateSavedTimezone = async function (timezone) {
  const token = getAccessToken();
  return axios.put(`${HOST}/api/v1/admin/timezone`, { timezone }, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'x-access-token': token,
    },
  });
};
