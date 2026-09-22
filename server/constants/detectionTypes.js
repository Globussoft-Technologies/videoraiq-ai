/* Update constants when new settings is added - DETECTION_TYPES, TYPE_MAP, Example payloads
 detection settings model
 detection settings service - createDetectionSettings, getDetectionExamples
 detection settings controller - swagger of getAllDetectionSettings
 channels model
 channels service - getAllChannels
*/

export const DETECTION_TYPES = {
  faceAuthenticationSettings: "Attendance Settings",
  personalProtectiveEquipmentSettings: "Personal Protective Equipment Detection",
  vehicleDetectionSettings: "ANPR Detection",
  unauthorizedAccessSettings: "Intrusion Detection",
  crowdDetectionSettings: "Crowd Detection",
  lineCrossingSettings: "Line Crossing Detection",
  countVehiclesSettings: "Count Vehicles Detection",
  conveyorDetectionSettings: "Conveyor Detection",
  crusherDetectionSettings: "Crusher Detection",
  cylinderDetectionSettings: "Cylinder Detection",
  waterSpillageDetectionSettings: "Water Spillage Detection",

  // countPersonsSettings: "Count Persons Detection",

  doorDetectionSettings: "Door Detection",
  lightDetectionSettings: "Light Detection",
  vehicleObstructionSettings: "Vehicle & Obstruction Detection",
  deskAbsenceSettings: "Desk Absence Detection",
  guardAbsenceSettings: "Guard Absence Detection",
  guardSleepingDetectionSettings: "Sleep Activity Detection",

  countPersonsSettings: "Count Persons Detection",

  // motionDetectionSettings: "Motion Detection",
  // genericObjectDetectionSettings: "Generic Object Detection",
  // loiteringWithoutAuthSettings: "Loitering Without Authorization Detection",
  // loiteringWithAuthSettings: "Loitering With Authorization Detection",
  fireSmokeDetectionSettings: "Fire and Smoke Detection",
  personFallSickDetectionSettings: "Person Fall/Sick Detection",
  // weaponDetectionSettings: "Weapon Detection",
  // unattendedBaggageDetectionSettings: "Unattended Baggage Detection",

  vehicleTypeDetectionSettings: "Vehicle Type Detection",
  loiteringDetectionSettings: "Loitering Detection",
  tableOccupancyDetectionSettings: "Table Occupancy Detection",
  foodServicePPEDetectionSettings: "Food Service PPE Detection",
  mobilePhoneDetectionSettings: "Mobile Phone Detection",
  carModelDetectionSettings: "Car Model Detection",
  vehicleCheckInOutSettings: "Vehicle Check-In / Check-Out Detection",
  workingAtHeightDetectionSettings: "Working at Height Detection",
  oilLeakageDetectionSettings: "Oil Leakage Detection",
  gunnyBagsMaterialsWrongLocationDetectionSettings: "Gunny Bags/Materials Wrong Location Detection",
  sandDustWasteScrapDisposalDetectionSettings: "Sand, Dust, Waste & Scrap Disposal Detection",
  unauthorizedAnimalEntryDetectionSettings: "Unauthorized Animal Entry Detection",
  spillsDirtyMessyAreasDetectionSettings: "Spills, Dirty or Messy Areas Detection",
};

export const INDUSTRIAL_SETTING_TYPES = Object.freeze([
  "workingAtHeightDetectionSettings",
  "oilLeakageDetectionSettings",
  "gunnyBagsMaterialsWrongLocationDetectionSettings",
  "sandDustWasteScrapDisposalDetectionSettings",
  "unauthorizedAnimalEntryDetectionSettings",
  "spillsDirtyMessyAreasDetectionSettings",
]);

export const INDUSTRIAL_INCIDENT_TYPES = Object.freeze([
  "workingAtHeightDetection",
  "oilLeakageDetection",
  "gunnyBagsMaterialsWrongLocationDetection",
  "sandDustWasteScrapDisposalDetection",
  "unauthorizedAnimalEntryDetection",
  "spillsDirtyMessyAreasDetection",
]);

/**
 * Detection types that expose a dedicated logs page.
 *
 * This is the single integration point for a detection-backed log. Default
 * role templates, the login backfill, and logs-configuration licensing derive
 * their keys from here. A newly shipped detection therefore needs one entry
 * here instead of parallel edits to every admin/read/write permission matrix.
 *
 * `permissionKey` is stored under permissionConfig.logs.
 * `logsConfigKey` is stored by LogsConfiguration and used by the sidebar.
 */
export const DETECTION_LOG_METADATA = Object.freeze({
  countPersonsSettings: { permissionKey: "personCountLogs", logsConfigKey: "personCountLogs" },
  countVehiclesSettings: { permissionKey: "vehicleCountLogs", logsConfigKey: "vehicleCountLogs" },
  deskAbsenceSettings: { permissionKey: "deskLogs", logsConfigKey: "deskAbsenceLogs" },
  guardAbsenceSettings: { permissionKey: "guardLogs", logsConfigKey: "guardLogs" },
  guardSleepingDetectionSettings: { permissionKey: "sleepActivityLogs", logsConfigKey: "sleepActivityLogs" },
  conveyorDetectionSettings: { permissionKey: "conveyorLogs", logsConfigKey: "conveyorLogs" },
  crusherDetectionSettings: { permissionKey: "crusherLogs", logsConfigKey: "crusherLogs" },
  cylinderDetectionSettings: { permissionKey: "cylinderLogs", logsConfigKey: "cylinderLogs" },
  waterSpillageDetectionSettings: { permissionKey: "waterSpillLogs", logsConfigKey: "waterSpillLogs" },
  lineCrossingSettings: { permissionKey: "lineCrossingLogs", logsConfigKey: "lineCrossingLogs" },
  vehicleObstructionSettings: { permissionKey: "vehicleObstructionLogs", logsConfigKey: "vehicleObstructionLogs" },
  carModelDetectionSettings: { permissionKey: "carLogs", logsConfigKey: "carLogs" },
  vehicleCheckInOutSettings: { permissionKey: "vehicleCheckInOutLogs", logsConfigKey: "vehicleCheckInOutLogs" },
  unauthorizedAccessSettings: { permissionKey: "unauthorizedAccessLogs", logsConfigKey: "unauthorizedAccessLogs" },
  vehicleDetectionSettings: { permissionKey: "ANPRLogs", logsConfigKey: "anprLogs" },
  fireSmokeDetectionSettings: { permissionKey: "fireSmokeLogs", logsConfigKey: "fireSmokeLogs" },
  personFallSickDetectionSettings: { permissionKey: "personFallSickLogs", logsConfigKey: "personFallSickLogs" },
  workingAtHeightDetectionSettings: { permissionKey: "workingAtHeightLogs", logsConfigKey: "workingAtHeightLogs" },
  oilLeakageDetectionSettings: { permissionKey: "oilLeakageLogs", logsConfigKey: "oilLeakageLogs" },
  gunnyBagsMaterialsWrongLocationDetectionSettings: { permissionKey: "wrongLocationLogs", logsConfigKey: "wrongLocationLogs" },
  sandDustWasteScrapDisposalDetectionSettings: { permissionKey: "wasteDisposalLogs", logsConfigKey: "wasteDisposalLogs" },
  unauthorizedAnimalEntryDetectionSettings: { permissionKey: "animalEntryLogs", logsConfigKey: "animalEntryLogs" },
  spillsDirtyMessyAreasDetectionSettings: { permissionKey: "messyAreaLogs", logsConfigKey: "messyAreaLogs" },
});

export const DETECTION_LOG_PERMISSION_KEYS = Object.freeze([
  ...new Set(Object.values(DETECTION_LOG_METADATA).map(({ permissionKey }) => permissionKey)),
]);

/**
 * Incident types the Alerts / Incident Center list leaves out. That list only
 * shows incidents carrying a reviewable snapshot, and these engines never
 * produce one — a person/vehicle count is a running tally, a line cross is a
 * tripwire event. They are still recorded as incidents and still counted by
 * Analytics, which is why an Analytics total can exceed what Alerts displays.
 * Each has its own log page instead (Person Count / Vehicle Count / Line
 * Crossing Logs).
 */
export const ALERT_FEED_EXCLUDED_TYPES = ["countPersons", "lineCrossing", "countVehicles"];

export const TYPE_MAP = {
  countPersonsSettings: "countPersons",
  motionDetectionSettings: "motionDetection",
  genericObjectDetectionSettings: "genericObjectDetection",
  countVehiclesSettings: "countVehicles",
  loiteringWithoutAuthSettings: "loiteringWithoutAuth",
  loiteringWithAuthSettings: "loiteringWithAuth",
  unauthorizedAccessSettings: "unauthorizedAccess",
  lineCrossingSettings: "lineCrossing",
  fireSmokeDetectionSettings: "fireSmokeDetection",
  personFallSickDetectionSettings: "personFallSickDetection",
  weaponDetectionSettings: "weaponDetection",
  unattendedBaggageDetectionSettings: "unattendedBaggageDetection",
  personalProtectiveEquipmentSettings: "personalProtectiveEquipment",
  crowdDetectionSettings: "crowdDetection",
  doorDetectionSettings: "doorDetection",
  lightDetectionSettings: "lightDetection",
  vehicleDetectionSettings: "vehicleDetection",
  deskAbsenceSettings: "deskAbsence",
  guardAbsenceSettings: "guardAbsence",
  guardSleepingDetectionSettings: "guardSleepingDetection",
  conveyorDetectionSettings: "conveyorDetection",
  crusherDetectionSettings: "crusherDetection",
  cylinderDetectionSettings: "cylinderDetection",
  waterSpillageDetectionSettings: "waterSpillageDetection",
  vehicleTypeDetectionSettings: "vehicleTypeDetection",
  loiteringDetectionSettings: "loiteringDetection",
  vehicleObstructionSettings: "vehicleObstruction",
  tableOccupancyDetectionSettings: "tableOccupancySettings",
  foodServicePPEDetectionSettings: "foodServicePPEDetection",
  mobilePhoneDetectionSettings: "mobilePhoneDetection",
  carModelDetectionSettings: "carModelDetection",
  vehicleCheckInOutSettings: "vehicleCheckInOut",
  faceAuthenticationSettings: "attendanceSettings",
  workingAtHeightDetectionSettings: "workingAtHeightDetection",
  oilLeakageDetectionSettings: "oilLeakageDetection",
  gunnyBagsMaterialsWrongLocationDetectionSettings: "gunnyBagsMaterialsWrongLocationDetection",
  sandDustWasteScrapDisposalDetectionSettings: "sandDustWasteScrapDisposalDetection",
  unauthorizedAnimalEntryDetectionSettings: "unauthorizedAnimalEntryDetection",
  spillsDirtyMessyAreasDetectionSettings: "spillsDirtyMessyAreasDetection",
};

export const DETECTION_MODES_MAP = {
  personalProtectiveEquipmentSettings: ["helmet", "vest"],
  crowdDetectionSettings: ["crowd"],
  doorDetectionSettings: ["door"],
  lightDetectionSettings: ["light"],
  lineCrossingSettings: ["line_crossing"],
  deskAbsenceSettings: ["desk_absence"],
  guardAbsenceSettings: ["guard_absence"],
  guardSleepingDetectionSettings: ["guard_sleeping"],
  countVehiclesSettings: ["vehicles"],
  countPersonsSettings: ["persons"],
  unauthorizedAccessSettings: ["intrusion"],
  conveyorDetectionSettings: ["conveyor"],
  crusherDetectionSettings: ["crusher"],
  cylinderDetectionSettings: ["cylinder_stack"],
  waterSpillageDetectionSettings: ["water_spillage"],
  vehicleDetectionSettings: ["ANPR"],
  vehicleTypeDetectionSettings: ["vehicleType"],
  loiteringDetectionSettings: ["loitering"],
  vehicleObstructionSettings: ["vehicleObstruction"],
  tableOccupancyDetectionSettings: ["tableOccupancySettings"],
  foodServicePPEDetectionSettings: ["foodServicePPEDetection"],
  countPersonsSettings: ["countPersons"],
  mobilePhoneDetectionSettings: ["mobilePhoneDetection"],
  carModelDetectionSettings: ["carModelDetection"],
  vehicleCheckInOutSettings: ["vehicleCheckInOut"],
  faceAuthenticationSettings: ["attendanceSettings"],
  fireSmokeDetectionSettings: ["fireSmokeDetectionSettings"],
  personFallSickDetectionSettings: ["personFallSickDetectionSettings"],
  workingAtHeightDetectionSettings: ["workingAtHeightDetectionSettings"],
  oilLeakageDetectionSettings: ["oilLeakageDetectionSettings"],
  gunnyBagsMaterialsWrongLocationDetectionSettings: ["gunnyBagsMaterialsWrongLocationDetectionSettings"],
  sandDustWasteScrapDisposalDetectionSettings: ["sandDustWasteScrapDisposalDetectionSettings"],
  unauthorizedAnimalEntryDetectionSettings: ["unauthorizedAnimalEntryDetectionSettings"],
  spillsDirtyMessyAreasDetectionSettings: ["spillsDirtyMessyAreasDetectionSettings"],
};

/**
 * detection mode -> the detector name DS expects.
 *
 * The single source of truth for DS naming. It is deliberately DATA, not an
 * if-chain: the names lived in two hand-written chains inside python.service.js
 * (one for start, one for stop) and drifted — `tableOccupancySettings` and
 * `deskAbsenceDetectionSettings` both shipped wrong at some point, and a wrong
 * name fails DS request validation silently, so the call just never takes
 * effect.
 *
 * `null` means "DS has not told us the name yet". That is not the same as
 * "unsupported": these detections exist and can be configured, we simply cannot
 * address them individually at DS. stopNewDetection refuses to send a
 * camera-wide stop for them rather than taking down every other detector on the
 * camera — see the guard there.
 *
 * To adopt a name DS adds: fill it in here. Nothing else needs editing, and
 * syncDsDetectorNames() will stop reporting it as unmapped.
 */
export const DS_DETECTOR_BY_MODE = {
  helmet: "personalProtectiveEquipmentSettings",
  vest: "personalProtectiveEquipmentSettings",
  crowd: "crowdDetectionSettings",
  line_crossing: "lineCrossingSettings",
  vehicles: "countVehiclesSettings",
  countPersons: "countPersonsSettings",
  intrusion: "zoneIntrusionSettings",
  conveyor: "conveyorDetectionSettings",
  crusher: "crusherDetectionSettings",
  cylinder_stack: "cylinderStackDetectionSettings",
  water_spillage: "waterSpillageDetectionSettings",
  ANPR: "numberPlateDetectionSettings",
  vehicleType: "vehicleTypeDetectionSettings",
  loitering: "loiteringDetectionSettings",
  vehicleObstruction: "vehicleObstructionSettings",
  // DS enum is tableOccupancySettings, not ...DetectionSettings.
  tableOccupancySettings: "tableOccupancySettings",
  // DS enum is deskAbsenceDetectionSettings - the mirror image of the internal key.
  desk_absence: "deskAbsenceDetectionSettings",
  foodServicePPEDetection: "foodServicePPEDetection",
  mobilePhoneDetection: "mobilePhoneDetectionSettings",
  carModelDetection: "carModelDetectionSettings",
  vehicleCheckInOut: "vehicleCheckInOutSettings",
  door: "doorDetectionSettings",
  light: "lightDetectionSettings",
  guard_absence: "guardAbsenceSettings",
  guard_sleeping: "sleepActivitySettings",
  faceAuthenticationSettings: "attendanceSettings",
  fireSmokeDetectionSettings: "fireSmokeDetectionSettings",
  personFallSickDetectionSettings: "personFallSickDetectionSettings",
  workingAtHeightDetectionSettings: "workingAtHeightDetectionSettings",
  oilLeakageDetectionSettings: "oilLeakageDetectionSettings",
  gunnyBagsMaterialsWrongLocationDetectionSettings: "gunnyBagsMaterialsWrongLocationDetectionSettings",
  sandDustWasteScrapDisposalDetectionSettings: "sandDustWasteScrapDisposalDetectionSettings",
  unauthorizedAnimalEntryDetectionSettings: "unauthorizedAnimalEntryDetectionSettings",
  spillsDirtyMessyAreasDetectionSettings: "spillsDirtyMessyAreasDetectionSettings",
};

/**
 * Resolve a set of detection modes to DS detector names.
 *
 * Returns both halves deliberately: `unmapped` is what lets callers refuse a
 * request rather than send one that means something else entirely (an empty
 * detector list on /stream/stop means "stop the whole camera").
 */
export const dsDetectorsForModes = (modes = []) => {
  const detectors = [];
  const unmapped = [];

  for (const mode of modes || []) {
    const name = DS_DETECTOR_BY_MODE[mode];
    if (name) {
      if (!detectors.includes(name)) detectors.push(name);
    } else {
      unmapped.push(mode);
    }
  }

  return { detectors, unmapped };
};

export const DETECTION_OBJECTS_TYPES_MAP = {
  personalProtectiveEquipment: "Personal Protective Equipment Detection",
  crowdDetection: "Crowd Detection",
  deskAbsence: "Desk Absence Detection",
  guardAbsence: "Guard Absence Detection",
};

/**
 * Our detection-mode strings mapped to the detector names the detection
 * service actually uses (its DetectionLogic enum).
 *
 * Several differ from our own setting keys — "intrusion" is
 * zoneIntrusionSettings there, desk absence and table occupancy have their
 * "Detection" in the opposite place. Sending the wrong name fails DS request
 * validation outright, so this table is the single place that translation
 * lives.
 */
export const DS_LOGIC_BY_MODE = {
  helmet: "personalProtectiveEquipmentSettings",
  vest: "personalProtectiveEquipmentSettings",
  crowd: "crowdDetectionSettings",
  line_crossing: "lineCrossingSettings",
  vehicles: "countVehiclesSettings",
  countPersons: "countPersonsSettings",
  vehicleObstruction: "vehicleObstructionSettings",
  intrusion: "zoneIntrusionSettings",
  conveyor: "conveyorDetectionSettings",
  crusher: "crusherDetectionSettings",
  cylinder_stack: "cylinderStackDetectionSettings",
  water_spillage: "waterSpillageDetectionSettings",
  ANPR: "numberPlateDetectionSettings",
  loitering: "loiteringDetectionSettings",
  vehicleType: "vehicleTypeDetectionSettings",
  tableOccupancySettings: "tableOccupancySettings",
  desk_absence: "deskAbsenceDetectionSettings",
  mobilePhoneDetection: "mobilePhoneDetectionSettings",
  foodServicePPEDetection: "foodServicePPEDetection",
  carModelDetection: "carModelDetectionSettings",
  vehicleCheckInOut: "vehicleCheckInOutSettings",
  faceAuthenticationSettings: "attendanceSettings",
  workingAtHeightDetectionSettings: "workingAtHeightDetectionSettings",
  oilLeakageDetectionSettings: "oilLeakageDetectionSettings",
  gunnyBagsMaterialsWrongLocationDetectionSettings: "gunnyBagsMaterialsWrongLocationDetectionSettings",
  sandDustWasteScrapDisposalDetectionSettings: "sandDustWasteScrapDisposalDetectionSettings",
  unauthorizedAnimalEntryDetectionSettings: "unauthorizedAnimalEntryDetectionSettings",
  spillsDirtyMessyAreasDetectionSettings: "spillsDirtyMessyAreasDetectionSettings",
};

/** DS logic names for one of our setting types. */
export const dsLogicNamesFor = (settingType) => {
  const modes = DETECTION_MODES_MAP[settingType] || [];
  const names = (Array.isArray(modes) ? modes : [modes])
    .map((mode) => DS_LOGIC_BY_MODE[mode])
    .filter(Boolean);
  return [...new Set(names)];
};

export const toPopulateDetections = [
  { path: "detections.countPersonsSettings.id" },
  { path: "detections.motionDetectionSettings.id" },
  { path: "detections.genericObjectDetectionSettings.id" },
  { path: "detections.countVehiclesSettings.id" },
  { path: "detections.loiteringWithoutAuthSettings.id" },
  { path: "detections.fireSmokeDetectionSettings.id" },
  { path: "detections.personFallSickDetectionSettings.id" },
  { path: "detections.weaponDetectionSettings.id" },
  { path: "detections.unattendedBaggageDetectionSettings.id" },
  { path: "detections.unauthorizedAccessSettings.id" },
  { path: "detections.lineCrossingSettings.id" },
  { path: "detections.loiteringWithAuthSettings.id" },
  { path: "detections.personalProtectiveEquipmentSettings.id" },
  { path: "detections.crowdDetectionSettings.id" },
  { path: "detections.lightDetectionSettings.id" },
  { path: "detections.doorDetectionSettings.id" },
  { path: "detections.vehicleDetectionSettings.id" },
  { path: "detections.deskAbsenceSettings.id" },
  { path: "detections.guardAbsenceSettings.id" },
  { path: "detections.guardSleepingDetectionSettings.id" },
  { path: "detections.conveyorDetectionSettings.id" },
  { path: "detections.crusherDetectionSettings.id" },
  { path: "detections.cylinderDetectionSettings.id" },
  { path: "detections.waterSpillageDetectionSettings.id" },
  { path: "detections.vehicleTypeDetectionSettings.id" },
  { path: "detections.loiteringDetectionSettings.id" },
  { path: "detections.vehicleObstructionSettings.id" },
  { path: "detections.tableOccupancyDetectionSettings.id" },
  { path: "detections.foodServicePPEDetectionSettings.id" },
  { path: "detections.mobilePhoneDetectionSettings.id" },
  { path: "detections.carModelDetectionSettings.id" },
  { path: "detections.vehicleCheckInOutSettings.id" },
  { path: "detections.faceAuthenticationSettings.id" },
  { path: "detections.workingAtHeightDetectionSettings.id" },
  { path: "detections.oilLeakageDetectionSettings.id" },
  { path: "detections.gunnyBagsMaterialsWrongLocationDetectionSettings.id" },
  { path: "detections.sandDustWasteScrapDisposalDetectionSettings.id" },
  { path: "detections.unauthorizedAnimalEntryDetectionSettings.id" },
  { path: "detections.spillsDirtyMessyAreasDetectionSettings.id" },
];

// sample payloads
export const countPersonsSettings = {
  channelId: ["664f89e8a9d345001ee326b1"],
  NVRId: "664f895da9d345001ee326a9",
  settingType: "countPersonsSettings",
  name: "Person Counter - Zone A",
  enabled: true,
  alerts: ["68493b14b176a495112b6522"],
  settings: {
    zone_configs: [
      { "name": "Reception", "capacity": 2, "threshold_sec": 20 },
      { "name": "Packing-A", "capacity": 5, "threshold_sec": 30 }
    ],
    imageRequired: true,
    videoLinkRequirement: false,
    videoMinLength: 10,
    videoMaxLength: 120,
    videoDuration: 10,
    levelOfImportance: "high",
    videoResolution: [1920, 1080],
    detectionTimeGap: 30,
    referencePoints: {
      1: [
        [100, 100],
        [200, 100],
        [200, 200],
        [100, 200],
      ],
    },
    metricType: "gauge",
  },
};


export const motionDetectionSettings = {
  channelId: ["684a9cec2f7a93276ca673fa"],
  NVRId: "684a9cec2f7a93276ca673f8",
  settingType: "motionDetectionSettings",
  name: "Motion Detector - Hallway",
  enabled: false,
  alerts: ["68493b14b176a495112b6522"],
  settings: {
    zone_configs: [
      { "name": "Reception", "capacity": 2, "threshold_sec": 20 },
      { "name": "Packing-A", "capacity": 5, "threshold_sec": 30 }
    ],
    imageRequired: true,
    videoLinkRequirement: true,
    videoMinLength: 8,
    videoMaxLength: 100,
    videoDuration: 10,
    levelOfImportance: "low",
    alertThreshold: 2,
    videoResolution: [640, 480],
    detectionTimeGap: 20,
    referencePoints: {
      1: [
        [10, 10],
        [110, 10],
        [110, 110],
        [10, 110],
      ],
    },
    metricType: "binary",
  },
};

export const genericObjectDetectionSettings = {
  channelId: ["664f8a09a9d345001ee326b2"],
  NVRId: "664f895da9d345001ee326a9",
  settingType: "genericObjectDetectionSettings",
  name: "Object Detection - Entry Gate",
  enabled: true,
  alerts: ["68493b14b176a495112b6522"],
  settings: {
    zone_configs: [
      { "name": "Reception", "capacity": 2, "threshold_sec": 20 },
      { "name": "Packing-A", "capacity": 5, "threshold_sec": 30 }
    ],
    imageRequired: false,
    videoLinkRequirement: true,
    videoMinLength: 5,
    videoMaxLength: 90,
    videoDuration: 10,
    levelOfImportance: "moderate",
    alertThreshold: 3,
    videoResolution: [1280, 720],
    detectionTimeGap: 15,
    referencePoints: {
      1: [
        [50, 50],
        [150, 50],
        [150, 150],
        [50, 150],
      ],
    },
    metricType: "gauge",
    objectList: ["generic"],
  },
};

export const countVehiclesSettings = {
  channelId: ["664f8a09a9d345001ee326b2"],
  NVRId: "664f895da9d345001ee326a9",
  settingType: "countVehiclesSettings",
  name: "Object Detection - Entry Gate",
  enabled: true,
  alerts: ["68493b14b176a495112b6522"],
  settings: {
    zone_configs: [
      { "name": "Reception", "capacity": 2, "threshold_sec": 20 },
      { "name": "Packing-A", "capacity": 5, "threshold_sec": 30 }
    ],
    imageRequired: false,
    videoLinkRequirement: true,
    videoMinLength: 5,
    videoMaxLength: 90,
    videoDuration: 10,
    levelOfImportance: "moderate",
    objectList: ["vehicles"],
    videoResolution: [1280, 720],
    detectionTimeGap: 15,
    referencePoints: {
      1: [
        [50, 50],
        [150, 50],
        [150, 150],
        [50, 150],
      ],
    },
    metricType: "gauge",
  },
};

export const loiteringWithoutAuthSettings = {
  channelId: ["664f8a09a9d345001ee326b2"],
  NVRId: "664f895da9d345001ee326a9",
  settingType: "loiteringWithoutAuthSettings",
  name: "Object Detection - Entry Gate",
  enabled: true,
  alerts: ["68493b14b176a495112b6522"],
  settings: {
    zone_configs: [
      { "name": "Reception", "capacity": 2, "threshold_sec": 20 },
      { "name": "Packing-A", "capacity": 5, "threshold_sec": 30 }
    ],
    imageRequired: false,
    videoLinkRequirement: true,
    videoMinLength: 5,
    videoMaxLength: 90,
    videoDuration: 10,
    levelOfImportance: "moderate",
    crowdCountThreshold: 1,
    peopleCountThreshold: 2,
    loiteringThreshold: 3,
    videoResolution: [1280, 720],
    referencePoints: {
      1: [
        [50, 50],
        [150, 50],
        [150, 150],
        [50, 150],
      ],
    },
    metricType: "gauge",
  },
};

export const loiteringWithAuthSettings = {
  channelId: ["664f8a09a9d345001ee326b2"],
  NVRId: "664f895da9d345001ee326a9",
  settingType: "loiteringWithAuthSettings",
  name: "Object Detection - Entry Gate",
  enabled: true,
  alerts: ["68493b14b176a495112b6522"],
  settings: {
    zone_configs: [
      { "name": "Reception", "capacity": 2, "threshold_sec": 20 },
      { "name": "Packing-A", "capacity": 5, "threshold_sec": 30 }
    ],
    imageRequired: false,
    videoLinkRequirement: true,
    videoMinLength: 5,
    videoMaxLength: 90,
    videoDuration: 10,
    levelOfImportance: "moderate",
    crowdCountThreshold: 1,
    peopleCountThreshold: 2,
    loiteringThreshold: 3,
    videoResolution: [1280, 720],
    authorisedUsers: ["68493b14b176a495112b6522"],
    referencePoints: {
      1: [
        [50, 50],
        [150, 50],
        [150, 150],
        [50, 150],
      ],
    },
    metricType: "gauge",
  },
};

export const unauthorizedAccessSettings = {
  channelId: ["664f8a09a9d345001ee326b2"],
  NVRId: "664f895da9d345001ee326a9",
  settingType: "unauthorizedAccessSettings",
  name: "Object Detection - Entry Gate",
  enabled: true,
  alerts: ["68493b14b176a495112b6522"],
  settings: {
    zone_configs: [
      { "name": "Reception", "capacity": 2, "threshold_sec": 20 },
      { "name": "Packing-A", "capacity": 5, "threshold_sec": 30 }
    ],
    imageRequired: false,
    videoLinkRequirement: true,
    videoMinLength: 5,
    videoMaxLength: 90,
    videoDuration: 10,
    levelOfImportance: "moderate",
    alertThreshold: 3,
    videoResolution: [1280, 720],
    authorisedUsers: ["68493b14b176a495112b6522"],
    referencePoints: {
      1: [
        [50, 50],
        [150, 50],
        [150, 150],
        [50, 150],
      ],
    },
    metricType: "gauge",
  },
};

export const lineCrossingSettings = {
  channelId: ["664f8a09a9d345001ee326b2"],
  NVRId: "664f895da9d345001ee326a9",
  settingType: "lineCrossingSettings",
  name: "Object Detection - Entry Gate",
  enabled: true,
  alerts: ["68493b14b176a495112b6522"],
  settings: {
    zone_configs: [
      { "name": "Reception", "capacity": 2, "threshold_sec": 20 },
      { "name": "Packing-A", "capacity": 5, "threshold_sec": 30 }
    ],
    imageRequired: false,
    videoLinkRequirement: true,
    videoMinLength: 5,
    videoMaxLength: 90,
    videoDuration: 10,
    levelOfImportance: "moderate",
    alertThreshold: 3,
    videoResolution: [1280, 720],
    faceAuth: true,
    authorisedUsers: ["68493b14b176a495112b6522"],
    referencePoints: {
      1: [
        [50, 50],
        [150, 50],
        [150, 150],
        [50, 150],
      ],
    },
    metricType: "gauge",
  },
};

export const fireSmokeDetectionSettings = {
  channelId: ["664f8a09a9d345001ee326b2"],
  NVRId: "664f895da9d345001ee326a9",
  settingType: "fireSmokeDetectionSettings",
  name: "Object Detection - Entry Gate",
  enabled: true,
  alerts: ["68493b14b176a495112b6522"],
  settings: {
    zone_configs: [
      { "name": "Reception", "capacity": 2, "threshold_sec": 20 },
      { "name": "Packing-A", "capacity": 5, "threshold_sec": 30 }
    ],
    imageRequired: false,
    videoLinkRequirement: true,
    videoMinLength: 5,
    videoMaxLength: 90,
    videoDuration: 10,
    levelOfImportance: "moderate",
    alertThreshold: 3,
    videoResolution: [1280, 720],
    referencePoints: {
      1: [
        [50, 50],
        [150, 50],
        [150, 150],
        [50, 150],
      ],
    },
    metricType: "gauge",
  },
};

export const personFallSickDetectionSettings = {
  channelId: ["664f8a09a9d345001ee326b2"],
  NVRId: "664f895da9d345001ee326a9",
  settingType: "personFallSickDetectionSettings",
  name: "Person Fall/Sick Detection - Entry Gate",
  enabled: true,
  alerts: ["68493b14b176a495112b6522"],
  settings: {
    zone_configs: [
      { "name": "Reception", "capacity": 2, "threshold_sec": 20 },
      { "name": "Packing-A", "capacity": 5, "threshold_sec": 30 }
    ],
    imageRequired: false,
    videoLinkRequirement: true,
    videoMinLength: 5,
    videoMaxLength: 90,
    videoDuration: 10,
    levelOfImportance: "high",
    person_threshold: 0.65,
    fall_max_transition_sec: 2,
    fall_confirmation_sec: 2,
    fall_recovery_sec: 2,
    fall_min_descent_ratio: 0.25,
    fall_min_horizontal_bbox_ratio: 0.95,
    fall_min_torso_angle_deg: 55,
    fall_min_person_px_height: 80,
    fall_annotation_hold_sec: 3,
    trigger_notification: false,
    zone_name: "Full Frame",
    alertThreshold: 3,
    videoResolution: [1280, 720],
    referencePoints: {
      1: [
        [50, 50],
        [150, 50],
        [150, 150],
        [50, 150],
      ],
    },
    metricType: "gauge",
  },
};

export const weaponDetectionSettings = {
  channelId: ["664f8a09a9d345001ee326b2"],
  NVRId: "664f895da9d345001ee326a9",
  settingType: "weaponDetectionSettings",
  name: "Object Detection - Entry Gate",
  enabled: true,
  alerts: ["68493b14b176a495112b6522"],
  settings: {
    zone_configs: [
      { "name": "Reception", "capacity": 2, "threshold_sec": 20 },
      { "name": "Packing-A", "capacity": 5, "threshold_sec": 30 }
    ],
    imageRequired: false,
    videoLinkRequirement: true,
    videoMinLength: 5,
    videoMaxLength: 90,
    videoDuration: 10,
    levelOfImportance: "moderate",
    alertThreshold: 3,
    videoResolution: [1280, 720],
    referencePoints: {
      1: [
        [50, 50],
        [150, 50],
        [150, 150],
        [50, 150],
      ],
    },
    metricType: "gauge",
    objectList: ["weapons"],
  },
};

export const unattendedBaggageDetectionSettings = {
  channelId: ["664f8a09a9d345001ee326b2"],
  NVRId: "664f895da9d345001ee326a9",
  settingType: "unattendedBaggageDetectionSettings",
  name: "Object Detection - Entry Gate",
  enabled: true,
  alerts: ["68493b14b176a495112b6522"],
  settings: {
    zone_configs: [
      { "name": "Reception", "capacity": 2, "threshold_sec": 20 },
      { "name": "Packing-A", "capacity": 5, "threshold_sec": 30 }
    ],
    imageRequired: false,
    videoLinkRequirement: true,
    videoMinLength: 5,
    videoMaxLength: 90,
    videoDuration: 10,
    levelOfImportance: "moderate",
    alertThreshold: 3,
    videoResolution: [1280, 720],
    referencePoints: {
      1: [
        [50, 50],
        [150, 50],
        [150, 150],
        [50, 150],
      ],
    },
    metricType: "gauge",
    objectList: ["bag"],
  },
};

export const personalProtectiveEquipmentSettings = {
  channelId: ["664f8a09a9d345001ee326b2"],
  NVRId: "664f895da9d345001ee326a9",
  settingType: "personalProtectiveEquipmentSettings",
  name: "Object Detection - Entry Gate",
  enabled: true,
  alerts: ["68493b14b176a495112b6522"],
  settings: {
    zone_configs: [
      { "name": "Reception", "capacity": 2, "threshold_sec": 20 },
      { "name": "Packing-A", "capacity": 5, "threshold_sec": 30 }
    ],
    imageRequired: false,
    videoLinkRequirement: true,
    videoMinLength: 5,
    videoMaxLength: 90,
    videoDuration: 10,
    levelOfImportance: "moderate",
    alertThreshold: 3,
    videoResolution: [1280, 720],
    referencePoints: {
      1: [
        [50, 50],
        [150, 50],
        [150, 150],
        [50, 150],
      ],
    },
    metricType: "gauge",
    ppeList: ["helmet", "vest"],
  },
};

export const crowdDetectionSettings = {
  channelId: ["664f8a09a9d345001ee326b2"],
  NVRId: "664f895da9d345001ee326a9",
  settingType: "crowdDetectionSettings",
  name: "Object Detection - Entry Gate",
  enabled: true,
  alerts: ["68493b14b176a495112b6522"],
  settings: {
    zone_configs: [
      { "name": "Reception", "capacity": 2, "threshold_sec": 20 },
      { "name": "Packing-A", "capacity": 5, "threshold_sec": 30 }
    ],
    imageRequired: false,
    videoLinkRequirement: true,
    videoMinLength: 5,
    videoMaxLength: 90,
    videoDuration: 10,
    levelOfImportance: "moderate",
    crowdCountThreshold: 10,
    videoResolution: [1280, 720],
    referencePoints: {
      1: [
        [50, 50],
        [150, 50],
        [150, 150],
        [50, 150],
      ],
    },
    metricType: "gauge",
  },
};

export const doorDetectionSettings = {
  channelId: ["664f8a09a9d345001ee326b2"],
  NVRId: "664f895da9d345001ee326a9",
  settingType: "doorDetectionSettings",
  name: "Object Detection - Entry Gate",
  enabled: true,
  alerts: ["68493b14b176a495112b6522"],
  settings: {
    zone_configs: [
      { "name": "Reception", "capacity": 2, "threshold_sec": 20 },
      { "name": "Packing-A", "capacity": 5, "threshold_sec": 30 }
    ],
    imageRequired: false,
    videoLinkRequirement: true,
    videoMinLength: 5,
    videoMaxLength: 90,
    videoDuration: 10,
    levelOfImportance: "moderate",
    crowdCountThreshold: 10,
    videoResolution: [1280, 720],
    referencePoints: {
      1: [
        [50, 50],
        [150, 50],
        [150, 150],
        [50, 150],
      ],
    },
    metricType: "gauge",
  },
};

export const lightDetectionSettings = {
  channelId: ["664f8a09a9d345001ee326b2"],
  NVRId: "664f895da9d345001ee326a9",
  settingType: "lightDetectionSettings",
  name: "Object Detection - Entry Gate",
  enabled: true,
  alerts: ["68493b14b176a495112b6522"],
  settings: {
    zone_configs: [
      { "name": "Reception", "capacity": 2, "threshold_sec": 20 },
      { "name": "Packing-A", "capacity": 5, "threshold_sec": 30 }
    ],
    imageRequired: false,
    videoLinkRequirement: true,
    videoMinLength: 5,
    videoMaxLength: 90,
    videoDuration: 10,
    levelOfImportance: "moderate",
    crowdCountThreshold: 10,
    videoResolution: [1280, 720],
    referencePoints: {
      1: [
        [50, 50],
        [150, 50],
        [150, 150],
        [50, 150],
      ],
    },
    metricType: "gauge",
  },
};

export const vehicleDetectionSettings = {
  channelId: ["664f8a09a9d345001ee326b2"],
  NVRId: "664f895da9d345001ee326a9",
  settingType: "vehicleDetectionSettings",
  name: "Vehicle Detection - Entry Gate",
  enabled: true,
  alerts: ["68493b14b176a495112b6522"],
  settings: {
    zone_configs: [
      { "name": "Reception", "capacity": 2, "threshold_sec": 20 },
      { "name": "Packing-A", "capacity": 5, "threshold_sec": 30 }
    ],
    imageRequired: false,
    videoLinkRequirement: true,
    videoMinLength: 5,
    videoMaxLength: 90,
    videoDuration: 10,
    levelOfImportance: "moderate",
    crowdCountThreshold: 10,
    videoResolution: [1280, 720],
    referencePoints: {
      1: [
        [50, 50],
        [150, 50],
        [150, 150],
        [50, 150],
      ],
    },
    metricType: "gauge",
  },
};

export const deskAbsenceSettings = {
  channelId: ["664f8a09a9d345001ee326b2"],
  NVRId: "664f895da9d345001ee326a9",
  settingType: "deskAbsenceSettings",
  name: "Desk Absence Detection - Desk 1",
  enabled: true,
  alerts: ["68493b14b176a495112b6522"],
  settings: {
    zone_configs: [
      { "name": "Reception", "capacity": 2, "threshold_sec": 20 },
      { "name": "Packing-A", "capacity": 5, "threshold_sec": 30 }
    ],
    imageRequired: false,
    videoLinkRequirement: true,
    videoMinLength: 5,
    videoMaxLength: 90,
    videoDuration: 10,
    levelOfImportance: "moderate",
    absenceThreshold: 300,
    videoResolution: [1280, 720],
    referencePoints: {
      1: [
        [50, 50],
        [150, 50],
        [150, 150],
        [50, 150],
      ],
    },
    zone_configs: [
      { "name": "Reception", "capacity": 2, "threshold_sec": 20 },
      { "name": "Packing-A", "capacity": 5, "threshold_sec": 30 }
    ],
    metricType: "gauge",
  },
};

export const guardAbsenceSettings = {
  channelId: ["664f8a09a9d345001ee326b2"],
  NVRId: "664f895da9d345001ee326a9",
  settingType: "guardAbsenceSettings",
  name: "Guard Absence Detection - Guard 1",
  enabled: true,
  alerts: ["68493b14b176a495112b6522"],
  settings: {
    zone_configs: [
      { "name": "Reception", "capacity": 2, "threshold_sec": 20 },
      { "name": "Packing-A", "capacity": 5, "threshold_sec": 30 }
    ],
    imageRequired: false,
    videoLinkRequirement: true,
    videoMinLength: 5,
    videoMaxLength: 90,
    videoDuration: 10,
    levelOfImportance: "moderate",
    absenceThreshold: 300,
    videoResolution: [1280, 720],
    referencePoints: {
      1: [
        [50, 50],
        [150, 50],
        [150, 150],
        [50, 150],
      ],
    },
    metricType: "gauge",
  },
};

export const guardSleepingDetectionSettings = {
  channelId: ["664f8a09a9d345001ee326b2"],
  NVRId: "664f895da9d345001ee326a9",
  settingType: "guardSleepingDetectionSettings",
  name: "Sleep Activity Detection - Guard 1",
  enabled: true,
  alerts: ["68493b14b176a495112b6522"],
  settings: {
    zone_configs: [
      { "name": "Reception", "capacity": 2, "threshold_sec": 20 },
      { "name": "Packing-A", "capacity": 5, "threshold_sec": 30 }
    ],
    imageRequired: false,
    videoLinkRequirement: true,
    videoMinLength: 5,
    videoMaxLength: 90,
    videoDuration: 10,
    levelOfImportance: "moderate",
    sleepingThreshold: 300,
    videoResolution: [1280, 720],
    referencePoints: {
      1: [
        [50, 50],
        [150, 50],
        [150, 150],
        [50, 150],
      ],
    },
    metricType: "gauge",
  },
};

export const conveyorDetectionSettings = {
  channelId: ["664f8a09a9d345001ee326b2"],
  NVRId: "664f895da9d345001ee326a9",
  settingType: "conveyorDetectionSettings",
  name: "Conveyor Detection - Belt 1",
  enabled: true,
  alerts: ["68493b14b176a495112b6522"],
  settings: {
    zone_configs: [
      { "name": "Reception", "capacity": 2, "threshold_sec": 20 },
      { "name": "Packing-A", "capacity": 5, "threshold_sec": 30 }
    ],
    imageRequired: false,
    videoLinkRequirement: true,
    videoMinLength: 5,
    videoMaxLength: 90,
    videoDuration: 10,
    levelOfImportance: "moderate",
    alertThreshold: 1,
    videoResolution: [1280, 720],
    obstruction_threshold_sec: 0,
    referencePoints: {
      1: [
        [50, 50],
        [150, 50],
        [150, 150],
        [50, 150],
      ],
    },
    metricType: "gauge",
  },
};

export const crusherDetectionSettings = {
  channelId: ["664f8a09a9d345001ee326b2"],
  NVRId: "664f895da9d345001ee326a9",
  settingType: "crusherDetectionSettings",
  name: "Crusher Detection - Unit 1",
  enabled: true,
  alerts: ["68493b14b176a495112b6522"],
  settings: {
    zone_configs: [
      { "name": "Reception", "capacity": 2, "threshold_sec": 20 },
      { "name": "Packing-A", "capacity": 5, "threshold_sec": 30 }
    ],
    imageRequired: false,
    videoLinkRequirement: true,
    videoMinLength: 5,
    videoMaxLength: 90,
    videoDuration: 10,
    levelOfImportance: "moderate",
    alertThreshold: 1,
    videoResolution: [1280, 720],
    obstruction_threshold_sec: 0,
    referencePoints: {
      1: [
        [50, 50],
        [150, 50],
        [150, 150],
        [50, 150],
      ],
    },
    metricType: "gauge",
  },
};

export const cylinderDetectionSettings = {
  channelId: ["664f8a09a9d345001ee326b2"],
  NVRId: "664f895da9d345001ee326a9",
  settingType: "cylinderDetectionSettings",
  name: "Cylinder Detection - Area 1",
  enabled: true,
  alerts: ["68493b14b176a495112b6522"],
  settings: {
    zone_configs: [
      { name: "Cylinder Area", capacity: 2, threshold_sec: 20 },
    ],
    imageRequired: false,
    videoLinkRequirement: true,
    videoMinLength: 5,
    videoMaxLength: 90,
    videoDuration: 10,
    levelOfImportance: "moderate",
    cylinder_confidence: 0.35,
    cylinder_iou: 0.45,
    horizontal_aspect_ratio_threshold: 1.6,
    cylinder_cooldown_sec: 60,
    trigger_notification: true,
    alertThreshold: 1,
    videoResolution: [1280, 720],
    obstruction_threshold_sec: 0,
    referencePoints: {
      1: [
        [50, 50],
        [150, 50],
        [150, 150],
        [50, 150],
      ],
    },
    metricType: "gauge",
  },
};

export const waterSpillageDetectionSettings = {
  channelId: ["664f8a09a9d345001ee326b2"],
  NVRId: "664f895da9d345001ee326a9",
  settingType: "waterSpillageDetectionSettings",
  name: "Water Spillage Detection - Floor 1",
  enabled: true,
  alerts: ["68493b14b176a495112b6522"],
  settings: {
    zone_configs: [
      { "name": "Reception", "capacity": 2, "threshold_sec": 20 },
      { "name": "Packing-A", "capacity": 5, "threshold_sec": 30 }
    ],
    imageRequired: false,
    videoLinkRequirement: true,
    videoMinLength: 5,
    videoMaxLength: 90,
    videoDuration: 10,
    levelOfImportance: "moderate",
    alertThreshold: 1,
    videoResolution: [1280, 720],
    obstruction_threshold_sec: 0,
    referencePoints: {
      1: [
        [50, 50],
        [150, 50],
        [150, 150],
        [50, 150],
      ],
    },
    metricType: "gauge",
  },
};


export const vehicleObstructionSettings = {
  channelId: ["664f8a09a9d345001ee326b2"],
  NVRId: "664f895da9d345001ee326a9",
  settingType: "vehicleObstructionSettings",
  name: "Vehicle Detection - Entry Gate",
  enabled: true,
  alerts: ["68493b14b176a495112b6522"],
  settings: {
    zone_configs: [
      { "name": "Reception", "capacity": 2, "threshold_sec": 20 },
      { "name": "Packing-A", "capacity": 5, "threshold_sec": 30 }
    ],
    imageRequired: false,
    videoLinkRequirement: true,
    videoMinLength: 5,
    videoMaxLength: 90,
    videoDuration: 10,
    levelOfImportance: "moderate",
    crowdCountThreshold: 10,
    videoResolution: [1280, 720],
    referencePoints: {
      1: [
        [50, 50],
        [150, 50],
        [150, 150],
        [50, 150],
      ],
    },
    metricType: "gauge",
  },
};


export const vehicleTypeDetectionSettings = {
  channelId: ["664f8a09a9d345001ee326b2"],
  NVRId: "664f895da9d345001ee326a9",
  settingType: "vehicleTypeDetectionSettings",
  name: "Vehicle Type Detection - Entry Gate",
  enabled: true,
  alerts: ["68493b14b176a495112b6522"],
  settings: {
    zone_configs: [
      { "name": "Reception", "capacity": 2, "threshold_sec": 20 },
      { "name": "Packing-A", "capacity": 5, "threshold_sec": 30 }
    ],
    imageRequired: false,
    videoLinkRequirement: true,
    videoMinLength: 5,
    videoMaxLength: 90,
    videoDuration: 10,
    levelOfImportance: "moderate",
    crowdCountThreshold: 10,
    videoResolution: [1280, 720],
    referencePoints: {
      1: [
        [50, 50],
        [150, 50],
        [150, 150],
        [50, 150],
      ],
    },
    metricType: "gauge",
  },
};


export const loiteringDetectionSettings = {
  channelId: ["664f8a09a9d345001ee326b2"],
  NVRId: "664f895da9d345001ee326a9",
  settingType: "loiteringDetectionSettings",
  name: "Loitering Detection - Area 1",
  enabled: true,
  alerts: ["68493b14b176a495112b6522"],
  settings: {
    zone_configs: [
      { "name": "Reception", "capacity": 2, "threshold_sec": 20 },
      { "name": "Packing-A", "capacity": 5, "threshold_sec": 30 }
    ],
    imageRequired: false,
    videoLinkRequirement: true,
    videoMinLength: 5,
    videoMaxLength: 90,
    videoDuration: 10,
    levelOfImportance: "moderate",
    crowdCountThreshold: 10,
    videoResolution: [1280, 720],
    referencePoints: {
      1: [
        [50, 50],
        [150, 50],
        [150, 150],
        [50, 150],
      ],
    },
    metricType: "gauge",
  },
};


export const tableOccupancyDetectionSettings = {
  channelId: ["664f8a09a9d345001ee326b2"],
  NVRId: "664f895da9d345001ee326a9",
  settingType: "tableOccupancyDetectionSettings",
  name: "Table Occupancy Detection - Table 1",
  enabled: true,
  alerts: ["68493b14b176a495112b6522"],
  settings: {
    zone_configs: [
      { "name": "Reception", "capacity": 2, "threshold_sec": 20 },
      { "name": "Packing-A", "capacity": 5, "threshold_sec": 30 }
    ],
    imageRequired: false,
    videoLinkRequirement: true,
    videoMinLength: 5,
    videoMaxLength: 90,
    videoDuration: 10,
    levelOfImportance: "moderate",
    crowdCountThreshold: 10,
    videoResolution: [1280, 720],
    referencePoints: {
      1: [
        [50, 50],
        [150, 50],
        [150, 150],
        [50, 150],
      ],
    },
    metricType: "gauge",
  },
};


export const foodServicePPEDetectionSettings = {
  channelId: ["664f8a09a9d345001ee326b2"],
  NVRId: "664f895da9d345001ee326a9",
  settingType: "foodServicePPEDetectionSettings",
  name: "Food Service PPE Detection - Kitchen",
  enabled: true,
  alerts: ["68493b14b176a495112b6522"],
  settings: {
    zone_configs: [
      { "name": "Reception", "capacity": 2, "threshold_sec": 20 },
      { "name": "Packing-A", "capacity": 5, "threshold_sec": 30 }
    ],
    imageRequired: false,
    videoLinkRequirement: true,
    videoMinLength: 5,
    videoMaxLength: 90,
    videoDuration: 10,
    levelOfImportance: "moderate",
    alertThreshold: 3,
    videoResolution: [1280, 720],
    referencePoints: {
      1: [
        [50, 50],
        [150, 50],
        [150, 150],
        [50, 150],
      ],
    },
    metricType: "gauge",
    ppeList: ["gloves", "mask", "hairnet", "apron", "vest"],
  },
};

export const mobilePhoneDetectionSettings = {
  channelId: ["664f89e8a9d345001ee326b1"],
  NVRId: "664f895da9d345001ee326a9",
  settingType: "mobilePhoneDetectionSettings",
  name: "Mobile Phone Detector - Zone A",
  enabled: true,
  alerts: ["68493b14b176a495112b6522"],
  settings: {
    zone_configs: [
      { "name": "Reception", "capacity": 2, "threshold_sec": 20 },
      { "name": "Packing-A", "capacity": 5, "threshold_sec": 30 }
    ],
    imageRequired: true,
    videoLinkRequirement: false,
    videoMinLength: 10,
    videoMaxLength: 120,
    videoDuration: 10,
    levelOfImportance: "high",
    videoResolution: [1920, 1080],
    detectionTimeGap: 30,
    referencePoints: {
      1: [
        [100, 100],
        [200, 100],
        [200, 200],
        [100, 200],
      ],
    },
    metricType: "gauge",
    zone_name: "Cashier Counter",
  },
};


export const carModelDetectionSettings = {
  channelId: ["664f89e8a9d345001ee326b1"],
  NVRId: "664f895da9d345001ee326a9",
  settingType: "carModelDetectionSettings",
  name: "Vehicle Recognition Zone",
  enabled: true,
  alerts: ["68493b14b176a495112b6522"],
  settings: {
    zone_configs: [
      { "name": "Reception", "capacity": 2, "threshold_sec": 20 },
      { "name": "Packing-A", "capacity": 5, "threshold_sec": 30 }
    ],
    // Any manufacturer - whatever the frontend sends. Not fixed to one make.
    company: "<manufacturer>",
    imageRequired: true,
    videoLinkRequirement: false,
    videoMinLength: 10,
    videoMaxLength: 120,
    videoDuration: 10,
    levelOfImportance: "high",
    videoResolution: [1920, 1080],
    detectionTimeGap: 30,
    referencePoints: {
      1: [
        [100, 100],
        [200, 100],
        [200, 200],
        [100, 200],
      ],
    },
    metricType: "gauge",
    zone_name: "Cashier Counter",
  },
};

export const vehicleCheckInOutSettings = {
  channelId: ["664f8a09a9d345001ee326b2"],
  NVRId: "664f895da9d345001ee326a9",
  settingType: "vehicleCheckInOutSettings",
  name: "Vehicle Check-In / Check-Out - Main Gate",
  enabled: true,
  alerts: ["68493b14b176a495112b6522"],
  settings: {
    zone_configs: [
      { "name": "Gate-In", "capacity": 2, "threshold_sec": 20 },
      { "name": "Gate-Out", "capacity": 2, "threshold_sec": 20 }
    ],
    camType: ["checkin", "checkout"],
    revisitCooldownMinutes: 5,
    line_coordinates: [
      [320, 640],
      [1600, 640],
    ],
    inside_reference_point: [960, 900],
    imageRequired: true,
    videoLinkRequirement: true,
    videoMinLength: 5,
    videoMaxLength: 90,
    videoDuration: 10,
    levelOfImportance: "moderate",
    videoResolution: [1280, 720],
    detectionTimeGap: 30,
    referencePoints: {
      1: [
        [50, 50],
        [150, 50],
        [150, 150],
        [50, 150],
      ],
    },
    metricType: "gauge",
  },
};

export const attendanceSettings = {
  channelId: ["664f89e8a9d345001ee326b1"],
  NVRId: "664f895da9d345001ee326a9",
  settingType: "faceAuthenticationSettings",
  name: "Face Authentication Settings - Zone A",
  enabled: true,
  alerts: ["68493b14b176a495112b6522"],
  settings: {
    zone_configs: [
      { "name": "Reception", "capacity": 2, "threshold_sec": 20 },
      { "name": "Packing-A", "capacity": 5, "threshold_sec": 30 }
    ],
    imageRequired: true,
    videoLinkRequirement: false,
    videoMinLength: 10,
    videoMaxLength: 120,
    videoDuration: 10,
    levelOfImportance: "high",
    videoResolution: [1920, 1080],
    detectionTimeGap: 30,
    referencePoints: {
      1: [
        [100, 100],
        [200, 100],
        [200, 200],
        [100, 200],
      ],
    },
    metricType: "gauge",
    zone_name: "Cashier Counter",
  },
};

const industrialDetectionExample = (settingType, name) => ({
  channelId: ["664f89e8a9d345001ee326b1"],
  NVRId: "664f895da9d345001ee326a9",
  settingType,
  name,
  enabled: true,
  alerts: [],
  settings: {
    zone_configs: [],
    imageRequired: true,
    videoLinkRequirement: false,
    levelOfImportance: "high",
    alertThreshold: 1,
    videoResolution: [1920, 1080],
    detectionTimeGap: 30,
    referencePoints: {},
    metricType: "gauge",
  },
});

export const workingAtHeightDetectionSettings = industrialDetectionExample(
  "workingAtHeightDetectionSettings",
  "Working at Height Detection",
);
export const oilLeakageDetectionSettings = industrialDetectionExample(
  "oilLeakageDetectionSettings",
  "Oil Leakage Detection",
);
export const gunnyBagsMaterialsWrongLocationDetectionSettings = industrialDetectionExample(
  "gunnyBagsMaterialsWrongLocationDetectionSettings",
  "Gunny Bags/Materials Wrong Location Detection",
);
export const sandDustWasteScrapDisposalDetectionSettings = industrialDetectionExample(
  "sandDustWasteScrapDisposalDetectionSettings",
  "Sand, Dust, Waste & Scrap Disposal Detection",
);
export const unauthorizedAnimalEntryDetectionSettings = industrialDetectionExample(
  "unauthorizedAnimalEntryDetectionSettings",
  "Unauthorized Animal Entry Detection",
);
export const spillsDirtyMessyAreasDetectionSettings = industrialDetectionExample(
  "spillsDirtyMessyAreasDetectionSettings",
  "Spills, Dirty or Messy Areas Detection",
);
