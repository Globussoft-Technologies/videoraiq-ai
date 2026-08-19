export const DETECTION_FIELD_KEYS = [
  'countPersonsSettings', 'motionDetectionSettings', 'genericObjectDetectionSettings',
  'countVehiclesSettings', 'loiteringWithoutAuthSettings', 'fireSmokeDetectionSettings',
  'weaponDetectionSettings', 'unattendedBaggageDetectionSettings', 'unauthorizedAccessSettings',
  'lineCrossingSettings', 'loiteringWithAuthSettings', 'personalProtectiveEquipmentSettings',
  'crowdDetectionSettings', 'lightDetectionSettings', 'doorDetectionSettings',
  'vehicleDetectionSettings', 'deskAbsenceSettings', 'guardAbsenceSettings',
  'conveyorDetectionSettings', 'crusherDetectionSettings', 'waterSpillageDetectionSettings',
  'vehicleTypeDetectionSettings', 'loiteringDetectionSettings', 'vehicleObstructionSettings',
  'tableOccupancyDetectionSettings', 'foodServicePPEDetectionSettings', 'mobilePhoneDetectionSettings',
  'carModelDetectionSettings',
];

export const DEFAULT_MAX_POINTS = 4;
export const MIN_POINTS_TO_CLOSE = 3;

export const ZONE_EXTRA_FIELDS = {
  vehicleObstructionSettings: ['threshold'],
  guardAbsenceSettings: ['threshold'],
  loiteringDetectionSettings: ['threshold'],
  loiteringWithoutAuthSettings: ['threshold'],
  loiteringWithAuthSettings: ['threshold'],
  tableOccupancyDetectionSettings: ['threshold'],
  deskAbsenceSettings: ['threshold', 'capacity'],
  crowdDetectionSettings: ['capacity'],
};

export const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'high', label: 'High' },
];
