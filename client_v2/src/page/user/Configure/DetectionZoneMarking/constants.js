export const DETECTION_FIELD_KEYS = [
  'countPersonsSettings', 'motionDetectionSettings', 'genericObjectDetectionSettings',
  'countVehiclesSettings', 'loiteringWithoutAuthSettings', 'fireSmokeDetectionSettings',
  'weaponDetectionSettings', 'unattendedBaggageDetectionSettings', 'unauthorizedAccessSettings',
  'lineCrossingSettings', 'loiteringWithAuthSettings', 'personalProtectiveEquipmentSettings',
  'crowdDetectionSettings', 'lightDetectionSettings', 'doorDetectionSettings',
  'vehicleDetectionSettings', 'deskAbsenceSettings', 'guardAbsenceSettings',
  'guardSleepingDetectionSettings',
  'conveyorDetectionSettings', 'crusherDetectionSettings', 'cylinderDetectionSettings', 'waterSpillageDetectionSettings',
  'vehicleTypeDetectionSettings', 'loiteringDetectionSettings', 'vehicleObstructionSettings',
  'unauthorizedParkingDetectionSettings',
  'tableOccupancyDetectionSettings', 'foodServicePPEDetectionSettings', 'mobilePhoneDetectionSettings',
  'carModelDetectionSettings', 'faceAuthenticationSettings', 'vehicleCheckInOutSettings',
  'personFallSickDetectionSettings',
  'workingAtHeightDetectionSettings', 'oilLeakageDetectionSettings',
  'gunnyBagsMaterialsWrongLocationDetectionSettings', 'sandDustWasteScrapDisposalDetectionSettings',
  'unauthorizedAnimalEntryDetectionSettings', 'spillsDirtyMessyAreasDetectionSettings',
];

export const FIRE_SMOKE_SETTING_TYPE = 'fireSmokeDetectionSettings';
export const PERSON_FALL_SICK_SETTING_TYPE = 'personFallSickDetectionSettings';

export function isSpecialDetectionType(value) {
  const normalized = String(value || '');
  return (
    normalized === 'fireSmokeDetectionSettings' ||
    normalized === 'personFallSickDetectionSettings'
  );
}

export const FULL_FRAME_DETECTION_TYPES = new Set([]);

export const isFullFrameDetectionType = (settingType) =>
  FULL_FRAME_DETECTION_TYPES.has(settingType);

// Vehicle Check-In / Check-Out draws polygon zones (each with just a name +
// entry/exit mode, like Line Crossing) plus one crossing line + inside
// reference point. It persists line_coordinates / inside_reference_point /
// camType alongside the usual referencePoints + zone_configs.
export const VEHICLE_CHECK_IN_OUT_SETTING_TYPE = 'vehicleCheckInOutSettings';

export function isVehicleCheckInOutType(value) {
  const normalized = String(value || '')
    .replace(/settings$/i, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
  return normalized === 'vehiclecheckinout' || normalized === 'checkinout';
}

export const ATTENDANCE_DETECTION_NAME = 'Attendance-detection';
export const ATTENDANCE_DETECTION_SETTING_TYPE = 'faceAuthenticationSettings';

export function isAttendanceDetectionType(value) {
  const normalized = String(value || '')
    .replace(/settings$/i, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
  return (
    normalized === 'attendancedetection' ||
    normalized === 'attendance' ||
    normalized === 'faceauthentication'
  );
}

export const DEFAULT_MAX_POINTS = 4;
export const MIN_POINTS_TO_CLOSE = 3;

export const ZONE_EXTRA_FIELDS = {
  vehicleObstructionSettings: ['threshold'],
  unauthorizedParkingDetectionSettings: ['threshold'],
  guardAbsenceSettings: ['threshold'],
  guardSleepingDetectionSettings: ['threshold'],
  loiteringDetectionSettings: ['threshold'],
  loiteringWithoutAuthSettings: ['threshold'],
  loiteringWithAuthSettings: ['threshold'],
  tableOccupancyDetectionSettings: ['threshold'],
  deskAbsenceSettings: ['threshold', 'capacity'],
  crowdDetectionSettings: ['capacity'],
  carModelDetectionSettings: ['company'],
  fireSmokeDetectionSettings: ['threshold'],
  personFallSickDetectionSettings: ['threshold'],
  workingAtHeightDetectionSettings: ['threshold'],
  oilLeakageDetectionSettings: ['threshold'],
  sandDustWasteScrapDisposalDetectionSettings: ['threshold'],
  spillsDirtyMessyAreasDetectionSettings: ['threshold'],
};

export const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'high', label: 'High' },
];

export const CAR_COMPANIES = ['Ford', 'Honda', 'Volvo', 'Maruti Suzuki', 'Mahindra'];
