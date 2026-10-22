import { TOUR_MODULES, isModuleVisible } from './tourModules.js';

const field = (path, label, type = 'string', extra = {}) => ({ path, label, type, ...extra });
const baseFields = [
  field('Image', 'Image', 'image', { urlResolution: 'incident-media-base' }),
  field('incidentName', 'Incident'),
  field('timeOfIncident', 'Time', 'datetime'),
  field('nvrData.nvrName', 'Recorder'),
  field('channelData.name', 'Camera'),
  field('severity', 'Severity', 'enum'),
];
// Explicit controller names are server-only. Never accept executable code or URLs
// from a tenant or send controller names to the mobile application.
const incidentDefinitions = [
  ['hygiene', 'getHygieneSanitationFoodSafetyDetectionLogs', [field('zone', 'Zone'), field('violationCount', 'Issues Detected', 'number'), field('description', 'Description')]],
  ['conveyor', 'getConveyorDetectionLogs', [field('currentStatus', 'Status', 'enum', { valueLabels: { ON: 'Loaded', OFF: 'Not-Loaded' } })]],
  ['crusher', 'getCrusherDetectionLogs', [field('currentStatus', 'Status', 'enum')]],
  ['water-spill', 'getWaterSpillageDetectionLogs', []],
  ['vehicle-obstruction', 'getVehicleDetectionLogs', [field('vehicleNumber', 'Vehicle Number')]],
  ['line-crossing', 'getLineCrossingLogs', [field('totalEntry', 'Entries', 'number'), field('totalExit', 'Exits', 'number')]],
  ['unauthorized-access', 'getUnauthorizedAccessLogs', []],
  ['fire-smoke', 'getFireSmokeDetectionLogs', [field('fireCount', 'Fire Count', 'number'), field('smokeCount', 'Smoke Count', 'number')]],
  ['person-fall-sick', 'getPersonFallSickDetectionLogs', [field('isFallDetected', 'Fall Detected', 'boolean'), field('evidenceScore', 'Evidence Score', 'number')]],
  ['working-at-height', 'getWorkingAtHeightDetectionLogs', [field('count', 'Count', 'number'), field('alertThreshold', 'Alert Threshold', 'number')]],
  ['oil-leakage', 'getOilLeakageDetectionLogs', [field('count', 'Count', 'number')]],
  ['equipment-oil-leakage', 'getEquipmentOilLeakageDetectionLogs', [field('count', 'Count', 'number'), field('alertThreshold', 'Alert Threshold', 'number')]],
  ['vehicle-fuel-oil-leakage', 'getVehicleFuelOilLeakageDetectionLogs', [field('count', 'Count', 'number'), field('alertThreshold', 'Alert Threshold', 'number')]],
  ['unauthorized-parking', 'getUnauthorizedParkingDetectionLogs', [field('count', 'Count', 'number'), field('alertThreshold', 'Alert Threshold', 'number')]],
  ['wrong-location', 'getGunnyBagsMaterialsWrongLocationDetectionLogs', [field('count', 'Count', 'number')]],
  ['waste-disposal', 'getSandDustWasteScrapDisposalDetectionLogs', [field('count', 'Count', 'number'), field('alertThreshold', 'Alert Threshold', 'number')]],
  ['animal-entry', 'getUnauthorizedAnimalEntryDetectionLogs', [field('count', 'Count', 'number'), field('alertThreshold', 'Alert Threshold', 'number')]],
  ['messy-area', 'getSpillsDirtyMessyAreasDetectionLogs', [field('count', 'Count', 'number'), field('alertThreshold', 'Alert Threshold', 'number')]],
  ['blurred-camera', 'getBlurredCameraDetectionLogs', [field('tamperType', 'Tamper Type'), field('isBlurred', 'Blurred', 'boolean'), field('evidenceScore', 'Evidence Score', 'number')]],
];

const dynamicLogs = new Map(incidentDefinitions.map(([key, handler, extraFields]) => [key, {
  handler,
  renderer: 'log-list-v1',
  requiredCapabilities: ['log-list-v1'],
  request: {
    method: 'GET', parameterLocation: 'query',
    pagination: { skip: 'skip', limit: 'limit', defaultLimit: 25, maxLimit: 100 },
    filters: [
      { id: 'dateRange', type: 'date-range', parameters: ['startDate', 'endDate'] },
      { id: 'search', type: 'search', parameter: 'search' },
      { id: 'recorder', type: 'recorder', parameter: 'nvrIds', encoding: 'comma-separated', lookup: { method: 'POST', endpoint: '/authorizedChannels/getNVRS', rowsPath: 'body.data', valuePath: '_id', labelPath: 'nvrName' } },
      { id: 'camera', type: 'camera', parameter: 'channelIds', encoding: 'comma-separated', lookup: { method: 'POST', endpoint: '/authorizedChannels/getChannels', bodyParameters: ['nvrIds'], rowsPath: 'body.data', valuePath: '_id', labelPath: 'name' } },
      { id: 'severity', type: 'select', parameter: 'severity', options: ['low', 'moderate', 'high'] },
      ...(['conveyor', 'crusher'].includes(key)
        ? [{ id: 'status', type: 'select', parameter: 'status', options: ['ON', 'OFF'] }] : []),
    ],
  },
  response: { rowsPath: 'body.data.data', totalPath: 'body.data.totalCount', rowIdPath: '_id' },
  fields: [...baseFields, ...extraFields],
}]));

// Specialised workflows remain native, as specified in the proposal. An app
// must skip an unknown native ID rather than try to draw an incomplete screen.
export const MOBILE_SCREENS = TOUR_MODULES.filter((entry) => !entry.tourOnly && entry.permissionKey).map((entry, order) => {
  let moduleId = entry.moduleKey || (entry.modulePageKey ? 'mattressMeasurement' : 'core');
  let modulePageKey = entry.modulePageKey;
  if (entry.key.startsWith('box-packing')) {
    moduleId = 'boxPackingQc';
    modulePageKey = { 'box-packing': 'boxPacking', 'box-packing-alerts': 'packingAlertLogs', 'box-packing-reports': 'boxPackingReports' }[entry.key];
  }
  const dynamic = dynamicLogs.get(entry.key);
  return {
    ...entry, moduleId, modulePageKey,
    // Permission keys already used by the apps are stable log identifiers.
    id: entry.logsConfigKey && moduleId === 'core' ? entry.permissionSubKey : `${moduleId}.${entry.key}`,
    title: entry.label, titleKey: `mobileScreens.${entry.key}.title`, icon: 'document', order,
    renderer: 'native', requiredCapabilities: [],
    ...dynamic,
  };
});

export function canAccessScreen(screen, { permissions, logs, modules }) {
  // Fail closed: tour helpers deliberately fail open and are insufficient alone.
  if (!permissions || Object.keys(permissions).length === 0 || !isModuleVisible(screen, permissions)) return false;
  if (screen.logsConfigKey && (!logs || logs[screen.logsConfigKey] !== true)) return false;
  if (screen.modulePageKey) {
    const grant = modules?.[screen.moduleId]?.[screen.modulePageKey];
    // Preserve the existing legacy Box Packing default, including explicit false.
    if (screen.moduleId === 'boxPackingQc' ? grant === false : grant !== true) return false;
  }
  return true;
}

export function screenDescription(screen) {
  const { id, moduleId, title, titleKey, group, icon, order, renderer, requiredCapabilities, request, response, fields } = screen;
  return {
    id, moduleId, title, titleKey, group, icon, order, renderer, requiredCapabilities,
    ...(request ? { request: { ...request, endpoint: `/mobile-screens/${encodeURIComponent(id)}/records` }, response, fields } : {}),
  };
}

export function buildMobileCatalogue(context, screens = MOBILE_SCREENS) {
  return {
    schemaVersion: 1, locale: 'en',
    screens: screens.filter((screen) => canAccessScreen(screen, context)).map(screenDescription),
  };
}
