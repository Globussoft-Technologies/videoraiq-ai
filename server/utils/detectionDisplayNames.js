import { DETECTION_LOG_METADATA, INCIDENT_TYPE_ALIASES, TYPE_MAP } from "../constants/detectionTypes.js";

export const settingTypeByIncidentType = Object.freeze({
  ...Object.fromEntries(Object.entries(TYPE_MAP).map(([setting, incident]) => [incident, setting])),
  ...Object.fromEntries(Object.entries(INCIDENT_TYPE_ALIASES).map(([alias, incident]) => [
    alias, Object.entries(TYPE_MAP).find(([, type]) => type === incident)?.[0],
  ])),
  genderAgeCount: "genderAgeDetectionSettings",
  anpr: "vehicleDetectionSettings",
  personProtectiveEquipment: "personalProtectiveEquipmentSettings",
  manualVehicleCheckIn: "vehicleCheckInOutSettings",
  manualVehicleCheckOut: "vehicleCheckInOutSettings",
  lateArrival: "faceAuthenticationSettings",
});

export const settingTypeByLogPermission = Object.freeze({
  ...Object.fromEntries(Object.entries(DETECTION_LOG_METADATA).map(([setting, log]) => [log.permissionKey, setting])),
  attendanceLogs: "faceAuthenticationSettings",
});

export function customDetectionName(names, type) {
  const key = Object.hasOwn(settingTypeByIncidentType, type) ? settingTypeByIncidentType[type] : type;
  return names instanceof Map ? names.get(key) : names && Object.hasOwn(names, key) ? names[key] : undefined;
}

export function incidentForEmail(incident, names, type) {
  const custom = customDetectionName(names, type);
  if (!incident || !custom) return incident;
  return {
    ...incident,
    detectionDisplayName: custom,
    incidentName: custom,
  };
}
