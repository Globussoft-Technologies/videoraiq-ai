/* Update constants when new settings is added - DETECTION_TYPES, TYPE_MAP, Example payloads
 detection settings model
 detection settings service - createDetectionSettings, getDetectionExamples
 detection settings controller - swagger of getAllDetectionSettings
 channels model
 channels service - getAllChannels
*/

export const DETECTION_TYPES = {
  attendanceSettings:"Attendance Settings",
  personalProtectiveEquipmentSettings: "Personal Protective Equipment Detection",
  vehicleDetectionSettings: "ANPR Detection",
  unauthorizedAccessSettings: "Intrusion Detection",
  crowdDetectionSettings: "Crowd Detection",
  lineCrossingSettings: "Line Crossing Detection",
  countVehiclesSettings: "Count Vehicles Detection",
  conveyorDetectionSettings: "Conveyor Detection",
  crusherDetectionSettings: "Crusher Detection",
  waterSpillageDetectionSettings: "Water Spillage Detection",

  // countPersonsSettings: "Count Persons Detection",

  doorDetectionSettings: "Door Detection",
  lightDetectionSettings: "Light Detection",
  vehicleObstructionSettings: "Vehicle & Obstruction Detection",
  deskAbsenceSettings: "Desk Absence Detection",
  guardAbsenceSettings: "Guard Absence Detection",

  countPersonsSettings: "Count Persons Detection",

  // motionDetectionSettings: "Motion Detection",
  // genericObjectDetectionSettings: "Generic Object Detection",
  // loiteringWithoutAuthSettings: "Loitering Without Authorization Detection",
  // loiteringWithAuthSettings: "Loitering With Authorization Detection",
  // fireSmokeDetectionSettings: "Fire and Smoke Detection",
  // weaponDetectionSettings: "Weapon Detection",
  // unattendedBaggageDetectionSettings: "Unattended Baggage Detection",

  vehicleTypeDetectionSettings: "Vehicle Type Detection",
  loiteringDetectionSettings: "Loitering Detection",
  tableOccupancyDetectionSettings: "Table Occupancy Detection",
  foodServicePPEDetectionSettings: "Food Service PPE Detection",
  mobilePhoneDetectionSettings: "Mobile Phone Detection",
  carModelDetectionSettings: "Car Model Detection"
}

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
  weaponDetectionSettings: "weaponDetection",
  unattendedBaggageDetectionSettings: "unattendedBaggageDetection",
  personalProtectiveEquipmentSettings: "personalProtectiveEquipment",
  crowdDetectionSettings: "crowdDetection",
  doorDetectionSettings: "doorDetection",
  lightDetectionSettings: "lightDetection",
  vehicleDetectionSettings: "vehicleDetection",
  deskAbsenceSettings: "deskAbsence",
  guardAbsenceSettings: "guardAbsence",
  conveyorDetectionSettings: "conveyorDetection",
  crusherDetectionSettings: "crusherDetection",
  waterSpillageDetectionSettings: "waterSpillageDetection",
  vehicleTypeDetectionSettings: "vehicleTypeDetection",
  loiteringDetectionSettings: "loiteringDetection",
  vehicleObstructionSettings: "vehicleObstruction",
  tableOccupancyDetectionSettings: "tableOccupancySettings",
  foodServicePPEDetectionSettings: "foodServicePPEDetection",
  mobilePhoneDetectionSettings: "mobilePhoneDetection",
  carModelDetectionSettings: "carModelDetection",
  attendanceSettings: "attendanceSettings",
};

export const DETECTION_MODES_MAP = {
  personalProtectiveEquipmentSettings: ["helmet", "vest"],
  crowdDetectionSettings: ["crowd"],
  doorDetectionSettings: ["door"],
  lightDetectionSettings: ["light"],
  lineCrossingSettings: ["line_crossing"],
  deskAbsenceSettings: ["desk_absence"],
  guardAbsenceSettings: ["guard_absence"],
  countVehiclesSettings: ["vehicles"],
  countPersonsSettings: ["persons"],
  unauthorizedAccessSettings: ["intrusion"],
  conveyorDetectionSettings: ["conveyor"],
  crusherDetectionSettings: ["crusher"],
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
  attendanceSettings: ["attendanceSettings"]
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
  door: "doorDetectionSettings",
  light: "lightDetectionSettings",
  guard_absence: "guardAbsenceSettings",
  attendanceSettings: "attendanceSettings"
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
  water_spillage: "waterSpillageDetectionSettings",
  ANPR: "numberPlateDetectionSettings",
  loitering: "loiteringDetectionSettings",
  vehicleType: "vehicleTypeDetectionSettings",
  tableOccupancySettings: "tableOccupancySettings",
  desk_absence: "deskAbsenceDetectionSettings",
  mobilePhoneDetection: "mobilePhoneDetectionSettings",
  foodServicePPEDetection: "foodServicePPEDetection",
  carModelDetection: "carModelDetectionSettings",
  attendanceSettings: "attendanceSettings"
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
  { path: "detections.conveyorDetectionSettings.id" },
  { path: "detections.crusherDetectionSettings.id" },
  { path: "detections.waterSpillageDetectionSettings.id" },
  { path: "detections.vehicleTypeDetectionSettings.id" },
  { path: "detections.loiteringDetectionSettings.id" },
  { path: "detections.vehicleObstructionSettings.id" },
  { path: "detections.tableOccupancyDetectionSettings.id" },
  { path: "detections.foodServicePPEDetectionSettings.id" },
  { path: "detections.mobilePhoneDetectionSettings.id" },
  { path: "detections.carModelDetectionSettings.id" },
  { path: "detections.attendanceSettings.id" }
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

export const attendanceSettings = {
  channelId: ["664f89e8a9d345001ee326b1"],
  NVRId: "664f895da9d345001ee326a9",
  settingType: "attendanceSettings",
  name: "Attendance Settings - Zone A",
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