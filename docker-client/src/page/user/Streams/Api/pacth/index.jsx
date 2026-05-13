const HOST = import.meta.env.VITE_BACKEND;
import getAccessToken from '@/utils/getAccessToken';
import axios from 'axios';

export const updateNVRById = async function (id, data) {
  const token = getAccessToken();

  return await axios.patch(`${HOST}/api/v1/nvr/${id}`, data, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'x-access-token': token,
    },
  });
};
export const updateCameraSettingById = async function (id, data) {
  const token = getAccessToken();

  return await axios.put(`${HOST}/api/v1/channel/${id}`, data, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'x-access-token': token,
    },
  });
};
export const updateBulkCameraSettings = async function (data) {
  const token = getAccessToken();

  return await axios.put(`${HOST}/api/v1/channel/channels/bulk-update`, data, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'x-access-token': token,
    },
  });
};
