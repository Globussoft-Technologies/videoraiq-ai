import axios from 'axios';
import getAccessToken from '@/utils/getAccessToken';

const HOST = import.meta.env.VITE_BACKEND;
const INCIDENT_HOST = import.meta.env.VITE_INCIDENT_URL || HOST;

const jsonHeaders = () => ({
  'Content-Type': 'application/json',
  'x-access-token': getAccessToken(),
});

const authHeaders = () => ({
  'x-access-token': getAccessToken(),
});

const unwrap = (res) => {
  const body = res?.data?.body;
  if (body == null) return res?.data;
  if (Object.prototype.hasOwnProperty.call(body, 'data')) return body.data;
  return body;
};

export const uploadDemoClip = async (file, { folderName = 'live-demo', onUploadProgress } = {}) => {
  const formData = new FormData();
  formData.append('file', file);

  const params = new URLSearchParams({
    mediaType: 'video',
    folderName,
  });

  const res = await axios.post(`${HOST}/uploads/media?${params.toString()}`, formData, {
    headers: authHeaders(),
    onUploadProgress,
  });
  const data = res?.data?.data || unwrap(res) || {};
  const remotePath = data.remotePath || data.videoUrl || data.url || '';
  const fullUrl = remotePath && /^(https?:)?\/\//i.test(remotePath)
    ? remotePath
    : `${String(INCIDENT_HOST).replace(/\/+$/, '')}/${String(remotePath).replace(/^\/+/, '')}`;
  return {
    ...data,
    remotePath,
    fullUrl,
    videoUrl: remotePath,
  };
};

export const createVideoRecord = async ({ videos, detections }) => {
  const res = await axios.post(
    `${HOST}/video-records`,
    { videos, detections },
    { headers: jsonHeaders() },
  );
  return unwrap(res);
};

export const processVideoRecord = async (id, { videoId, detectors } = {}) => {
  const res = await axios.post(
    `${HOST}/video-records/${id}/process`,
    { videoId, detectors },
    { headers: jsonHeaders() },
  );
  return unwrap(res);
};

export const updateVideoRecord = async (id, payload) => {
  const res = await axios.patch(`${HOST}/video-records/${id}`, payload, {
    headers: jsonHeaders(),
  });
  return unwrap(res);
};

export const getDemoIncidents = async ({ skip = 0, limit = 10, ...filter } = {}) => {
  const res = await axios.post(
    `${HOST}/incidents?skip=${skip}&limit=${limit}`,
    { ...filter, liveDemoData: true },
    { headers: jsonHeaders() },
  );
  const data = res?.data || {};
  const body = data.body || {};
  const bodyData = body.data || {};
  const items =
    (Array.isArray(data.data) && data.data) ||
    (Array.isArray(body.data) && body.data) ||
    (Array.isArray(bodyData.result) && bodyData.result) ||
    (Array.isArray(bodyData.items) && bodyData.items) ||
    [];

  return {
    items,
    totalCount: data.totalCount ?? body.totalCount ?? bodyData.totalCount ?? bodyData.count ?? items.length,
  };
};

export const getDemoAttendanceLogs = async ({ skip = 0, limit = 10, isExport = false, ...filter } = {}) => {
  const res = await axios.post(
    `${HOST}/accessLogs/get`,
    { skip, limit, isExport, ...filter, liveDemoData: true },
    { headers: jsonHeaders() },
  );
  return unwrap(res);
};
