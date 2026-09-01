import axios from 'axios';
import getAccessToken from '@/utils/getAccessToken';

const HOST = import.meta.env.VITE_BACKEND;

const authHeaders = () => ({
  'x-access-token': getAccessToken(),
});

const unwrap = (res) => {
  const body = res?.data?.body;
  if (body == null) return res?.data;
  if (Object.prototype.hasOwnProperty.call(body, 'data')) return body.data;
  return body;
};

export const getVideoRecords = async ({ id = '', skip = 0, limit = 20 } = {}) => {
  const params = new URLSearchParams({
    skip: String(skip),
    limit: String(limit),
  });
  if (id) params.set('id', id);

  const res = await axios.get(`${HOST}/video-records?${params.toString()}`, {
    headers: authHeaders(),
  });
  const data = unwrap(res);
  if (Array.isArray(data)) return { records: data, total: data.length };
  return {
    records: data?.records ?? [],
    total: data?.total ?? data?.totalCount ?? 0,
  };
};

export const getVideoRecordVideos = async (id) => {
  const res = await axios.get(`${HOST}/video-records/${id}/videos`, {
    headers: authHeaders(),
  });
  return unwrap(res) || { videos: [], detections: {} };
};

export const getVideoRecordAnalytics = async (id) => {
  const res = await axios.get(`${HOST}/video-records/${id}/analytics`, {
    headers: authHeaders(),
  });
  return unwrap(res) || {};
};
