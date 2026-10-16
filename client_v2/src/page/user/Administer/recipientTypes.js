// A recipient's Detection Types are stored as incident types, the key alert
// emails are routed by (incidents modelMap). Used by the Alert Recipients form.

// Most incident types are the settings key minus "Settings"; these aren't.
const INCIDENT_KEY_BY_SETTING = {
  personalProtectiveEquipmentSettings: 'personalProtectiveEquipment',
  loadingUnloadingStockCountingSettings: 'loadingUnloadingStockCountingDetection',
};

// Keys the recipient form used to save, which no incident ever matched. Read as
// the real type so an old recipient shows (and re-saves) the right selection.
const LEGACY_INCIDENT_KEYS = {
  personProtectiveEquipment: 'personalProtectiveEquipment',
  loadingUnloadingStockCounting: 'loadingUnloadingStockCountingDetection',
};

export const fromLegacyKey = (key) => LEGACY_INCIDENT_KEYS[key] || key;

export function toIncidentKey(detectionKey) {
  return INCIDENT_KEY_BY_SETTING[detectionKey] || detectionKey.replace('Settings', '');
}
