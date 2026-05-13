import getAccessToken from '@/utils/getAccessToken';
import axios from 'axios';
const HOST = import.meta.env.VITE_BACKEND;

export const getAllNvrDetails = async function (skip = 0, limit = 100) {
  const token = getAccessToken();
  return axios.get(`${HOST}/api/v1/nvr/?skip=${skip}&limit=${limit}`, {
    headers: {
      Accept: 'application/json',
      'x-access-token': token,
    },
  });
};
export const getCameraDetailsById = async function (nvr_id) {
  const token = getAccessToken();
  return axios.get(`${HOST}/api/v1/channel/nvr/${nvr_id}`, {
    headers: {
      Accept: 'application/json',
      'x-access-token': token,
    },
  });
};
export const requestCameraRefresh = async function (nvr_id) {
  const token = getAccessToken();
  return axios.patch(`${HOST}/api/v1/nvr/refetch/${nvr_id}`,{}, {
    headers: {
      Accept: 'application/json',
      'x-access-token': token,
    },
  });
};
export const getHeaderCamersList = async function () {
  const token = getAccessToken();
  return axios.get(`${HOST}/api/v1/detection-settings/types`, {
    headers: {
      Accept: 'application/json',
      'x-access-token': token,
    },
  });
};
