import axios from 'axios';
import getAccessToken from '@/utils/getAccessToken';

const Api_url = import.meta.env.VITE_BACKEND;

const unwrap = (res) => {
  const body = res?.data?.body;
  if (body == null) return res?.data;
  if (Object.prototype.hasOwnProperty.call(body, 'data')) return body.data;
  return body;
};

const get = async (path, params = {}) => {
  const token = getAccessToken();
  const res = await axios.get(`${Api_url}/analytics/${path}`, {
    params,
    headers: { 'x-access-token': token },
  });
  return unwrap(res) || {};
};

export const getDetectionVolume = (params = {}) => get('detection-volume', params);
export const getAttendanceAnalytics = (params = {}) => get('attendance-summary', params);
export const getEngineShare = (params = {}) => get('engine-share', params);
export const getTopCameras = (params = {}) => get('top-cameras', params);
export const getActivityHeatmap = (params = {}) => get('activity-heatmap', params);
export const getDetectionsByHour = (params = {}) => get('detections-by-hour', params);
export const getSitePerformance = (params = {}) => get('site-performance', params);
export const getResponseFunnel = (params = {}) => get('response-funnel', params);
export const getAnalyticsOverview = (params = {}) => get('overview', params);
export const getPeakActivity = (params = {}) => get('peak-activity', params);
