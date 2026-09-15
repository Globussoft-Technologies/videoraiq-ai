import api, { unwrap } from './client';

const devicePath = (deviceId, suffix) => (
  `/measurement-calibration/${encodeURIComponent(deviceId)}/${suffix}`
);

export async function getCalibrationStatus(deviceId) {
  return unwrap(await api.get(devicePath(deviceId, 'status')));
}

export async function captureCalibrationFrame(deviceId) {
  return unwrap(await api.post(devicePath(deviceId, 'frame')));
}

export async function getCalibrationFrame(deviceId) {
  const response = await api.get(devicePath(deviceId, 'frame'), { responseType: 'blob' });
  return response.data;
}

export async function runMeasurementCalibration(deviceId, payload) {
  return unwrap(await api.post(devicePath(deviceId, 'run'), payload));
}

export async function getSavedCalibrationZone(deviceId) {
  return unwrap(await api.get(devicePath(deviceId, 'zone')));
}

export async function saveCalibrationZone(deviceId, payload) {
  return unwrap(await api.put(devicePath(deviceId, 'zone'), payload));
}
