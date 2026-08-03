import {
  getDetectionTypes,
  updateDetectionSetting,
  createDetectionSetting,
  deleteDetectionSetting,
} from '../../../../../helpers/configure';
import { getRecipients } from '../../../../../api/administer';

export const fetchDetectionTypes = () => getDetectionTypes();

export const fetchAlertRecipients = (params = { limit: 200 }) => getRecipients(params);

export const updateZoneDetectionSetting = (settingId, payload) => (
  updateDetectionSetting(settingId, payload)
);

export const createZoneDetectionSetting = (payload) => createDetectionSetting(payload);

export const deleteZoneDetectionSetting = (settingId) => deleteDetectionSetting(settingId);

export const updateDetectionAlerts = (settingId, alertIds) => (
  updateDetectionSetting(settingId, { alerts: alertIds })
);
