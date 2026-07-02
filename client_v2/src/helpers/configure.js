import axios from 'axios';
import getAccessToken from '@/utils/getAccessToken';

const Api_url = import.meta.env.VITE_BACKEND;

const unwrap = (res) => {
  const body = res?.data?.body;
  if (body == null) return res?.data;
  if (Object.prototype.hasOwnProperty.call(body, 'data')) return body.data;
  return body;
};

export const getNvrs = async (skip = 0, limit = 100) => {
  const token = getAccessToken();
  const res = await axios.get(`${Api_url}/api/v1/nvr/?skip=${skip}&limit=${limit}`, {
    headers: { 'x-access-token': token },
  });
  const data = unwrap(res);
  if (Array.isArray(data)) return { nvrs: data, total: data.length };
  return { nvrs: data?.nvrs ?? data?.data ?? [], total: data?.total ?? data?.totalCount ?? 0 };
};

export const getCamerasByNvr = async (nvrId) => {
  const token = getAccessToken();
  const res = await axios.get(`${Api_url}/api/v1/channel/nvr/${nvrId}`, {
    headers: { 'x-access-token': token },
  });
  const data = unwrap(res);
  if (Array.isArray(data)) return data;
  return data?.channels ?? data?.data ?? [];
};

export const getChannels = async ({ skip = 0, limit = 100, nvrId = '', search = '' } = {}) => {
  const token = getAccessToken();
  const res = await axios.get(
    `${Api_url}/api/v1/channel/?nvrId=${nvrId}&skip=${skip}&limit=${limit}&search=${search}`,
    { headers: { 'x-access-token': token } }
  );
  const data = unwrap(res);
  if (Array.isArray(data)) return { channels: data, total: data.length };
  return { channels: data?.channels ?? [], total: data?.total ?? data?.totalCount ?? 0 };
};

export const getDetectionTypes = async () => {
  const token = getAccessToken();
  const res = await axios.get(`${Api_url}/api/v1/detection-settings/types`, {
    headers: { 'x-access-token': token },
  });
  const data = unwrap(res);
  return data?.detectionTypes ?? data ?? {};
};

export const getDetectionSettings = async ({ skip = 0, limit = 50, nvrIds = '', channelIds = '', name = '' } = {}) => {
  const token = getAccessToken();
  const res = await axios.get(
    `${Api_url}/api/v1/detection-settings/?nvrIds=${nvrIds}&channelIds=${channelIds}&name=${name}&skip=${skip}&limit=${limit}`,
    { headers: { 'x-access-token': token } }
  );
  const data = unwrap(res);
  if (Array.isArray(data)) return { settings: data, total: data.length };
  return {
    settings: data?.detectionSettings ?? data?.settings ?? data?.data ?? [],
    total: data?.total ?? data?.totalCount ?? 0,
  };
};

export const updateDetectionSetting = async (id, data) => {
  const token = getAccessToken();
  const res = await axios.put(`${Api_url}/api/v1/detection-settings/${id}`, data, {
    headers: { 'Content-Type': 'application/json', 'x-access-token': token },
  });
  return unwrap(res);
};

export const getNvrsWithChannels = async (settingType = '') => {
  const token = getAccessToken();
  const res = await axios.get(`${Api_url}/api/v1/nvr/with-channels?settingType=${settingType}`, {
    headers: { 'x-access-token': token },
  });
  return unwrap(res) || [];
};

/* ── NVR connect / onboard cameras ──────────────────────────────────────── */
export const registerAndFetchCameras = async (data) => {
  const token = getAccessToken();
  return axios.post(`${Api_url}/api/v1/nvr/register-and-fetch`, data, {
    headers: { 'Content-Type': 'application/json', 'x-access-token': token },
  });
};

export const addSelectedCameras = async (data) => {
  const token = getAccessToken();
  return axios.post(`${Api_url}/api/v1/nvr/add-cameras`, data, {
    headers: { 'Content-Type': 'application/json', 'x-access-token': token },
  });
};

export const updateNvrById = async (id, data) => {
  const token = getAccessToken();
  return axios.patch(`${Api_url}/api/v1/nvr/${id}`, data, {
    headers: { 'Content-Type': 'application/json', 'x-access-token': token },
  });
};

export const deleteNvrById = async (id) => {
  const token = getAccessToken();
  return axios.delete(`${Api_url}/api/v1/nvr/${id}`, {
    headers: { 'x-access-token': token },
  });
};

export const getNvrCamerasForEdit = async (nvrId) => {
  const token = getAccessToken();
  const res = await axios.get(`${Api_url}/api/v1/nvr/edit/${nvrId}`, {
    headers: { 'x-access-token': token },
  });
  return res?.data?.body;
};

export const removeNvrCamera = async (cameraId) => {
  const token = getAccessToken();
  return axios.delete(`${Api_url}/api/v1/nvr/camera/${cameraId}`, {
    headers: { 'x-access-token': token },
  });
};

export const refetchNvrChannels = async (nvrId) => {
  const token = getAccessToken();
  return axios.patch(`${Api_url}/api/v1/nvr/refetch/${nvrId}`, {}, {
    headers: { 'x-access-token': token },
  });
};

/* ── Camera Settings page (per-NVR channel + department assignment) ────── */
export const getNvrChannelDetails = async (nvrId) => {
  const token = getAccessToken();
  const res = await axios.get(`${Api_url}/api/v1/channel/nvr/${nvrId}`, {
    headers: { 'x-access-token': token },
  });
  return res?.data?.body;
};

export const updateChannel = async (channelId, data) => {
  const token = getAccessToken();
  return axios.put(`${Api_url}/api/v1/channel/${channelId}`, data, {
    headers: { 'Content-Type': 'application/json', 'x-access-token': token },
  });
};
