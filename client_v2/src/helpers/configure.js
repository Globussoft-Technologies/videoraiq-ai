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
  const res = await axios.get(`${Api_url}/nvr/?skip=${skip}&limit=${limit}`, {
    headers: { 'x-access-token': token },
  });
  const data = unwrap(res);
  if (Array.isArray(data)) return { nvrs: data, total: data.length };
  return { nvrs: data?.nvrs ?? data?.data ?? [], total: data?.total ?? data?.totalCount ?? 0 };
};

export const getCamerasByNvr = async (nvrId) => {
  const token = getAccessToken();
  const res = await axios.get(`${Api_url}/channel/nvr/${nvrId}`, {
    headers: { 'x-access-token': token },
  });
  const data = unwrap(res);
  if (Array.isArray(data)) return data;
  return data?.channels ?? data?.data ?? [];
};

export const getChannels = async ({ skip = 0, limit = 100, nvrId = '', search = '' } = {}) => {
  const token = getAccessToken();
  const res = await axios.get(
    `${Api_url}/channel/?nvrId=${nvrId}&skip=${skip}&limit=${limit}&search=${search}`,
    { headers: { 'x-access-token': token } }
  );
  const data = unwrap(res);
  if (Array.isArray(data)) return { channels: data, total: data.length };
  return { channels: data?.channels ?? [], total: data?.total ?? data?.totalCount ?? 0 };
};

export const getDetectionTypes = async () => {
  const token = getAccessToken();
  const res = await axios.get(`${Api_url}/detection-settings/types`, {
    headers: { 'x-access-token': token },
  });
  const data = unwrap(res);
  return data?.detectionTypes ?? data ?? {};
};

export const getDetectionSettings = async ({
  skip = 0,
  limit = 50,
  nvrIds = '',
  channelIds = '',
  name = '',
  settingType = '',
} = {}) => {
  const token = getAccessToken();
  const params = new URLSearchParams({
    skip: String(skip),
    limit: String(limit),
  });
  if (nvrIds) params.set('nvrIds', nvrIds);
  if (channelIds) params.set('channelIds', channelIds);
  if (name) params.set('name', name);
  if (settingType) params.set('settingType', settingType);

  const res = await axios.get(`${Api_url}/detection-settings/?${params.toString()}`, {
    headers: { 'x-access-token': token },
  });
  const data = unwrap(res);
  if (Array.isArray(data)) return { settings: data, total: data.length };
  return {
    settings: data?.detectionSettings ?? data?.settings ?? data?.data ?? [],
    total: data?.total ?? data?.totalCount ?? data?.count ?? 0,
  };
};

export const updateDetectionSetting = async (id, data) => {
  const token = getAccessToken();
  const res = await axios.put(`${Api_url}/detection-settings/${id}`, data, {
    headers: { 'Content-Type': 'application/json', 'x-access-token': token },
  });
  return unwrap(res);
};

/** Create a brand-new DetectionSetting for a camera that has never had this
 * type configured — same POST /detection-settings V1 uses on first save. */
export const createDetectionSetting = async (data) => {
  const token = getAccessToken();
  const res = await axios.post(`${Api_url}/detection-settings`, data, {
    headers: { 'Content-Type': 'application/json', 'x-access-token': token },
  });
  return unwrap(res);
};

/**
 * Fully delete a DetectionSetting — same DELETE /detection-settings/:id
 * V1 uses (exposed there as "Reset Detection UI"). Removes the whole document
 * and unsets detections.<settingType> on every channel referencing it.
 */
export const deleteDetectionSetting = async (id) => {
  const token = getAccessToken();
  const res = await axios.delete(`${Api_url}/detection-settings/${id}`, {
    headers: { 'x-access-token': token },
  });
  return unwrap(res);
};

/* ── Global time zone (Detection zone scheduling) ─────────────────────────
 * Same endpoints V1 uses: the admin has ONE saved timezone, and zone schedules
 * (startTime/endTime per zone_config) are interpreted against it. */
export const getTimezones = async () => {
  const token = getAccessToken();
  const res = await axios.get(`${Api_url}/admin/timezones`, {
    headers: { 'x-access-token': token },
  });
  const data = unwrap(res);
  return data?.timezones ?? (Array.isArray(data) ? data : []);
};

export const getSavedTimezone = async () => {
  const token = getAccessToken();
  const res = await axios.get(`${Api_url}/admin/timezone`, {
    headers: { 'x-access-token': token },
  });
  const data = unwrap(res);
  return data?.timezone ?? '';
};

export const updateSavedTimezone = async (timezone) => {
  const token = getAccessToken();
  const res = await axios.put(`${Api_url}/admin/timezone`, { timezone }, {
    headers: { 'Content-Type': 'application/json', 'x-access-token': token },
  });
  return unwrap(res);
};

export const getNvrsWithChannels = async (settingType = '') => {
  const token = getAccessToken();
  const res = await axios.get(`${Api_url}/nvr/with-channels?settingType=${settingType}`, {
    headers: { 'x-access-token': token },
  });
  return unwrap(res) || [];
};

/* ── NVR connect / onboard cameras ──────────────────────────────────────── */
export const registerAndFetchCameras = async (data) => {
  const token = getAccessToken();
  return axios.post(`${Api_url}/nvr/register-and-fetch`, data, {
    headers: { 'Content-Type': 'application/json', 'x-access-token': token },
  });
};

export const addSelectedCameras = async (data) => {
  const token = getAccessToken();
  return axios.post(`${Api_url}/nvr/add-cameras`, data, {
    headers: { 'Content-Type': 'application/json', 'x-access-token': token },
  });
};

export const updateNvrById = async (id, data) => {
  const token = getAccessToken();
  return axios.patch(`${Api_url}/nvr/${id}`, data, {
    headers: { 'Content-Type': 'application/json', 'x-access-token': token },
  });
};

export const deleteNvrById = async (id) => {
  const token = getAccessToken();
  return axios.delete(`${Api_url}/nvr/${id}`, {
    headers: { 'x-access-token': token },
  });
};

export const getNvrCamerasForEdit = async (nvrId) => {
  const token = getAccessToken();
  const res = await axios.get(`${Api_url}/nvr/edit/${nvrId}`, {
    headers: { 'x-access-token': token },
  });
  return res?.data?.body;
};

export const removeNvrCamera = async (cameraId) => {
  const token = getAccessToken();
  return axios.delete(`${Api_url}/nvr/camera/${cameraId}`, {
    headers: { 'x-access-token': token },
  });
};

export const refetchNvrChannels = async (nvrId) => {
  const token = getAccessToken();
  return axios.patch(`${Api_url}/nvr/refetch/${nvrId}`, {}, {
    headers: { 'x-access-token': token },
  });
};

/* ── Camera Settings page (per-NVR channel + department assignment) ────── */
export const getNvrChannelDetails = async (nvrId) => {
  const token = getAccessToken();
  const res = await axios.get(`${Api_url}/channel/nvr/${nvrId}`, {
    headers: { 'x-access-token': token },
  });
  return res?.data?.body;
};

export const updateChannel = async (channelId, data) => {
  const token = getAccessToken();
  return axios.put(`${Api_url}/channel/${channelId}`, data, {
    headers: { 'Content-Type': 'application/json', 'x-access-token': token },
  });
};

/**
 * Enable/disable one detection type on one camera — the same single endpoint
 * V1's "Applied Types" popover uses for both directions. Returns a 404 if the
 * type has never been linked to this camera (no auto-create, matching V1).
 */
export const toggleChannelDetection = async ({ channelId, detectionType, enable }) => {
  const token = getAccessToken();
  const res = await axios.put(`${Api_url}/channel/detection/toggle`, { channelId, detectionType, enable }, {
    headers: { 'Content-Type': 'application/json', 'x-access-token': token },
  });
  window.dispatchEvent(new CustomEvent('vq-detection-toggle-change', {
    detail: { channelId, detectionType, enable },
  }));
  return res;
};

/** Get schedule for one camera linked to a detection setting */
export const getDetectionSchedule = async (settingId, channelId) => {
  const token = getAccessToken();
  const res = await axios.get(`${Api_url}/detection-settings/${settingId}/schedule/${channelId}`, {
    headers: { 'x-access-token': token },
  });
  return unwrap(res);
};

/** Update schedule for one camera linked to a detection setting */
export const updateDetectionSchedule = async (settingId, channelId, data) => {
  const token = getAccessToken();
  const res = await axios.put(`${Api_url}/detection-settings/${settingId}/schedule/${channelId}`, data, {
    headers: { 'Content-Type': 'application/json', 'x-access-token': token },
  });
  return unwrap(res);
};

/** Delete schedule for one camera linked to a detection setting */
export const deleteDetectionSchedule = async (settingId, channelId) => {
  const token = getAccessToken();
  const res = await axios.delete(`${Api_url}/detection-settings/${settingId}/schedule/${channelId}`, {
    headers: { 'x-access-token': token },
  });
  return unwrap(res);
};
