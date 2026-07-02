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
