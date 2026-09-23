/**
 * The tour's module catalogue.
 *
 * GENERATED from client_v2/src/layout/nav.config.js — keep the two in step. The
 * client owns navigation (paths, icons, ordering) because that is where routing
 * lives; this copy exists so the server can answer "which modules may this user
 * tour?" and search them without the client shipping its nav config up on every
 * keystroke.
 *
 * Only `key`, `label` and `group` are used for display — the client maps `key`
 * back to its own nav entry for the path and the step definitions. The
 * permission fields mirror nav.config.js so the filter here produces exactly
 * the same visible set the sidebar does.
 */
const MODULE_DESCRIPTIONS = {
  "live-demo": "Explore representative monitoring, detection, alert and incident workflows using demonstration data without affecting production cameras.",
  overview: "View real-time operational totals and health indicators across the organisation's sites.",
  wall: "Monitor multiple authorized camera streams together in a live video grid.",
  camera: "Review recorded camera footage and seek to relevant events.",
  alerts: "Review detection alerts and their visual evidence, severity and current status.",
  incidents: "Investigate, report and resolve detection incidents across authorized cameras.",
  analytics: "Explore detection trends, activity patterns, heatmaps and camera performance.",
  measurement: "Compare declared and measured mattress dimensions, deviations, exports and reports.",
  "logs-records": "Open the operational logs and records available to the current role.",
  attendance: "Review face-recognition check-ins, check-outs and calculated working hours.",
  access: "Audit recognized and unrecognized entry activity captured by access cameras.",
  "tagged-users": "Review identities that operators manually associated with detected people.",
  "detected-users": "Review detected face folders and tag or remove detections.",
  "person-count": "Review zone occupancy and person-count measurements over time.",
  "desk-absence": "Review workstation or seat-absence detections.",
  anpr: "Review vehicle entry, exit and number-plate recognition records.",
  "sleep-activity": "Review sleeping and awake-state detection events.",
  conveyor: "Review conveyor load and operating-state detections.",
  "vehicle-obstruction": "Review vehicles detected as blocking monitored paths or areas.",
  "vehicle-count": "Review vehicle throughput and count measurements over time.",
  car: "Review detected vehicle make, model and year records.",
  "vehicle-check-in-out": "Review vehicle custody and check-in/check-out crossing history.",
  crusher: "Review crusher operating-state detections.",
  cylinder: "Review cylinder stacking detections and related records.",
  "line-crossing": "Review boundary and line-crossing events.",
  "water-spill": "Review water-spillage and floor-hazard detections.",
  "unauthorized-access": "Review restricted-zone entry detections.",
  "fire-smoke": "Review fire and smoke detections.",
  "person-fall-sick": "Review detected falls and sickness-related events.",
  "working-at-height": "Review unsafe work-at-height detections.",
  "oil-leakage": "Review oil leakage and related floor-hazard detections.",
  "equipment-oil-leakage": "Review oil leakage detections originating from equipment.",
  "vehicle-fuel-oil-leakage": "Review fuel or oil leakage detections originating from vehicles.",
  "wrong-location": "Review materials or gunny bags detected in incorrect locations.",
  "waste-disposal": "Review sand, dust, waste and scrap-disposal detections.",
  "animal-entry": "Review unauthorized animal-entry detections.",
  "messy-area": "Review spill, dirty-area and messy-area detections.",
  cameras: "Configure NVRs, cameras, streams and camera inventory.",
  "detection-settings": "Enable and configure AI detection types for cameras.",
  "measurement-calibration": "Capture a RealSense surface and configure the dimensional-measurement zone.",
  users: "Manage application users and their assigned roles.",
  settings: "Manage platform, alert, privacy and integration settings.",
  "raspberry-pi-devices": "Review and approve Raspberry Pi station pairing requests.",
  roles: "Define roles and control per-module permissions.",
  locations: "Manage organisation locations used to group operational resources.",
  departments: "Manage departments and teams.",
  shifts: "Create shift rules, configure working days and assign staff to shifts.",
  "shift-schedule": "View and manage employee shift assignments across the schedule.",
  register: "Create an employee profile and capture enrollment images.",
  recipients: "Configure verified recipients for detection alerts.",
  "auto-email-reports": "Schedule recurring attendance and operational email reports.",
};

const TOUR_MODULE_DEFINITIONS = [
  { "key": "live-demo", "label": "Live Demo", "path": "live-demo", "group": "EXPERIENCE" },
  { "key": "overview", "label": "Command Center", "path": "dashboard", "group": "MONITOR", "permissionKey": "dashboard" },
  { "key": "wall", "label": "Live Wall", "path": "live", "group": "MONITOR", "permissionKey": "LIVE" },
  { "key": "camera", "label": "Playback", "path": "playback", "group": "MONITOR", "permissionKey": "playbacks" },
  { "key": "alerts", "label": "Alerts", "path": "alerts", "group": "MONITOR", "permissionKey": "alerts" },
  { "key": "incidents", "label": "Incident Center", "path": "incidents", "group": "MONITOR", "permissionKey": "incidents" },
  { "key": "analytics", "label": "Analytics", "path": "analytics", "group": "INTELLIGENCE", "permissionKey": "analytics" },
  { "key": "measurement", "label": "Measurement Logs", "path": "logs/measurement", "group": "DIMENSIONAL QC", "permissionKey": "logs", "permissionSubKey": "measurementLogs", "logsConfigKey": "measurementLogs" },
  { "key": "logs-records", "label": "Logs & Records", "path": "dashboard", "group": "LOGS & RECORDS", "tourOnly": true, "requiresAnyLog": true },
  { "key": "attendance", "label": "Attendance Logs", "path": "logs/attendance", "group": "LOGS & RECORDS", "permissionKey": "logs", "permissionSubKey": "attendanceLogs", "logsConfigKey": "attendanceLogs" },
  { "key": "access", "label": "Access Logs", "path": "logs/access", "group": "LOGS & RECORDS", "permissionKey": "logs", "permissionSubKey": "accessLogs", "logsConfigKey": "accessLogs" },
  { "key": "tagged-users", "label": "Tagged Users", "path": "logs/tagged-users", "group": "LOGS & RECORDS", "permissionKey": "logs", "permissionSubKey": "taggedUsersLogs", "logsConfigKey": "taggedUsers" },
  { "key": "detected-users", "label": "Detected Users", "path": "logs/detected-users", "group": "LOGS & RECORDS", "permissionKey": "logs", "permissionSubKey": "detectedUsersLogs", "logsConfigKey": "detectedUsers" },
  { "key": "person-count", "label": "Person Count Logs", "path": "logs/person-count", "group": "LOGS & RECORDS", "permissionKey": "logs", "permissionSubKey": "personCountLogs", "logsConfigKey": "personCountLogs" },
  { "key": "desk-absence", "label": "Desk Absence Logs", "path": "logs/desk-absence", "group": "LOGS & RECORDS", "permissionKey": "logs", "permissionSubKey": "deskLogs", "logsConfigKey": "deskAbsenceLogs" },
  { "key": "anpr", "label": "ANPR Logs", "path": "logs/anpr", "group": "LOGS & RECORDS", "permissionKey": "logs", "permissionSubKey": "ANPRLogs", "logsConfigKey": "anprLogs" },
  { "key": "sleep-activity", "label": "Sleep Activity Logs", "path": "logs/sleep-activity", "group": "LOGS & RECORDS", "permissionKey": "logs", "permissionSubKey": "sleepActivityLogs", "logsConfigKey": "sleepActivityLogs" },
  { "key": "conveyor", "label": "Conveyor Logs", "path": "logs/conveyor", "permissionKey": "logs", "permissionSubKey": "conveyorLogs", "logsConfigKey": "conveyorLogs", "group": "LOGS & RECORDS" },
  { "key": "vehicle-obstruction", "label": "Vehicle Obstruction Logs", "path": "logs/vehicle-obstruction", "permissionKey": "logs", "permissionSubKey": "vehicleObstructionLogs", "logsConfigKey": "vehicleObstructionLogs", "group": "LOGS & RECORDS" },
  { "key": "unauthorized-parking", "label": "Unauthorized Parking Logs", "path": "logs/unauthorized-parking", "permissionKey": "logs", "permissionSubKey": "unauthorizedParkingLogs", "logsConfigKey": "unauthorizedParkingLogs", "group": "LOGS & RECORDS" },
  { "key": "vehicle-count", "label": "Vehicle Count Logs", "path": "logs/vehicle-count", "permissionKey": "logs", "permissionSubKey": "vehicleCountLogs", "logsConfigKey": "vehicleCountLogs", "group": "LOGS & RECORDS" },
  { "key": "car", "label": "Car Logs", "path": "logs/car", "permissionKey": "logs", "permissionSubKey": "carLogs", "logsConfigKey": "carLogs", "group": "LOGS & RECORDS" },
  { "key": "vehicle-check-in-out", "label": "Vehicle Check-In/Out Logs", "path": "logs/vehicle-check-in-out", "permissionKey": "logs", "permissionSubKey": "vehicleCheckInOutLogs", "logsConfigKey": "vehicleCheckInOutLogs", "group": "LOGS & RECORDS" },
  { "key": "crusher", "label": "Crusher Logs", "path": "logs/crusher", "permissionKey": "logs", "permissionSubKey": "crusherLogs", "logsConfigKey": "crusherLogs", "group": "LOGS & RECORDS" },
  { "key": "cylinder", "label": "Cylinder Stacking Logs", "path": "logs/cylinder", "permissionKey": "logs", "permissionSubKey": "cylinderLogs", "logsConfigKey": "cylinderLogs", "group": "LOGS & RECORDS" },
  { "key": "line-crossing", "label": "Line Crossing Logs", "path": "logs/line-crossing", "permissionKey": "logs", "permissionSubKey": "lineCrossingLogs", "logsConfigKey": "lineCrossingLogs", "group": "LOGS & RECORDS" },
  { "key": "water-spill", "label": "Water Spill Logs", "path": "logs/water-spill", "permissionKey": "logs", "permissionSubKey": "waterSpillLogs", "logsConfigKey": "waterSpillLogs", "group": "LOGS & RECORDS" },
  { "key": "unauthorized-access", "label": "Unauthorized Access Logs", "path": "logs/unauthorized-access", "permissionKey": "logs", "permissionSubKey": "unauthorizedAccessLogs", "logsConfigKey": "unauthorizedAccessLogs", "group": "LOGS & RECORDS" },
  { "key": "fire-smoke", "label": "Fire & Smoke Logs", "path": "logs/fire-smoke", "permissionKey": "logs", "permissionSubKey": "fireSmokeLogs", "logsConfigKey": "fireSmokeLogs", "group": "LOGS & RECORDS" },
  { "key": "person-fall-sick", "label": "Person Fall/Sick Logs", "path": "logs/person-fall-sick", "permissionKey": "logs", "permissionSubKey": "personFallSickLogs", "logsConfigKey": "personFallSickLogs", "group": "LOGS & RECORDS" },
  { "key": "working-at-height", "label": "Working at Height Logs", "path": "logs/working-at-height", "permissionKey": "logs", "permissionSubKey": "workingAtHeightLogs", "logsConfigKey": "workingAtHeightLogs", "group": "LOGS & RECORDS" },
  { "key": "oil-leakage", "label": "Oil Leakage Logs", "path": "logs/oil-leakage", "permissionKey": "logs", "permissionSubKey": "oilLeakageLogs", "logsConfigKey": "oilLeakageLogs", "group": "LOGS & RECORDS" },
  { "key": "equipment-oil-leakage", "label": "Equipment Oil Leakage Logs", "path": "logs/equipment-oil-leakage", "permissionKey": "logs", "permissionSubKey": "equipmentOilLeakageLogs", "logsConfigKey": "equipmentOilLeakageLogs", "group": "LOGS & RECORDS" },
  { "key": "vehicle-fuel-oil-leakage", "label": "Vehicle Fuel/Oil Leakage Logs", "path": "logs/vehicle-fuel-oil-leakage", "permissionKey": "logs", "permissionSubKey": "vehicleFuelOilLeakageLogs", "logsConfigKey": "vehicleFuelOilLeakageLogs", "group": "LOGS & RECORDS" },
  { "key": "wrong-location", "label": "Gunny Bags/Materials Wrong Location Logs", "path": "logs/wrong-location", "permissionKey": "logs", "permissionSubKey": "wrongLocationLogs", "logsConfigKey": "wrongLocationLogs", "group": "LOGS & RECORDS" },
  { "key": "waste-disposal", "label": "Sand, Dust, Waste & Scrap Disposal Logs", "path": "logs/waste-disposal", "permissionKey": "logs", "permissionSubKey": "wasteDisposalLogs", "logsConfigKey": "wasteDisposalLogs", "group": "LOGS & RECORDS" },
  { "key": "animal-entry", "label": "Unauthorized Animal Entry Logs", "path": "logs/animal-entry", "permissionKey": "logs", "permissionSubKey": "animalEntryLogs", "logsConfigKey": "animalEntryLogs", "group": "LOGS & RECORDS" },
  { "key": "messy-area", "label": "Messy Area Logs", "path": "logs/messy-area", "permissionKey": "logs", "permissionSubKey": "messyAreaLogs", "logsConfigKey": "messyAreaLogs", "group": "LOGS & RECORDS" },
  { "key": "cameras", "label": "Cameras & NVRs", "path": "cameras", "group": "CONFIGURE", "permissionKey": "NVR" },
  { "key": "detection-settings", "label": "Detections", "path": "detection-settings", "group": "CONFIGURE", "permissionKey": "detectionSettings" },
  { "key": "measurement-calibration", "label": "Measurement Calibration", "path": "measurement-calibration", "group": "CONFIGURE", "permissionKey": "settings" },
  { "key": "users", "label": "User Role Detail", "path": "users", "group": "ADMINISTER", "permissionKey": "Users" },
  { "key": "settings", "label": "Settings", "path": "settings", "group": "ADMINISTER", "permissionKey": "settings" },
  { "key": "raspberry-pi-devices", "label": "Raspberry Pi Devices", "path": "raspberry-pi-devices", "group": "ADMINISTER", "permissionKey": "settings" },
  { "key": "roles", "label": "Roles & Permission", "path": "roles", "group": "ADMINISTER", "permissionKey": "roles" },
  { "key": "locations", "label": "Locations", "path": "locations", "group": "ADMINISTER", "permissionKey": "locations" },
  { "key": "departments", "label": "Departments", "path": "departments", "group": "ADMINISTER", "permissionKey": "departments" },
  { "key": "shifts", "label": "Shift Management", "path": "shifts", "group": "ADMINISTER", "permissionKey": "shifts" },
  { "key": "shift-schedule", "label": "Shift Schedule", "path": "shift-schedule", "group": "ADMINISTER", "permissionKey": "shifts" },
  { "key": "register", "label": "Register your User", "path": "register-users", "group": "ADMINISTER", "permissionKey": "Users" },
  { "key": "recipients", "label": "Alert Recipients", "path": "recipients", "group": "SETTINGS", "permissionKey": "recipients" },
  { "key": "auto-email-reports", "label": "Auto Email Reports", "path": "auto-email-reports", "group": "SETTINGS", "permissionKey": "autoEmailReports" }
];

export const TOUR_MODULES = TOUR_MODULE_DEFINITIONS.map((module) => ({
  ...module,
  description: MODULE_DESCRIPTIONS[module.key],
}));

/**
 * Role presets for permission configs stored before the `settings` module
 * existed. Mirrors normalizePermissionConfig() in the client's
 * PermissionContext, so a legacy role sees the same modules in the tour menu
 * as it does in the sidebar.
 */
const LEGACY_MODULE_PERMISSIONS = {
  admin: { view: true, create: true, edit: true, delete: true },
  read: { view: true, create: false, edit: false, delete: false },
  write: { view: true, create: true, edit: true, delete: false },
};
const DENY_MODULE = { view: false, create: false, edit: false, delete: false };
const LEGACY_MODULE_KEYS = ["settings", "shifts"];

export function normalizePermissionConfig(permissionConfig, roleName) {
  if (!permissionConfig) return {};
  const missing = LEGACY_MODULE_KEYS.filter((key) => !permissionConfig[key]);
  if (!missing.length) return permissionConfig;
  const fallback = LEGACY_MODULE_PERMISSIONS[String(roleName || "").toLowerCase()] || DENY_MODULE;
  return {
    ...permissionConfig,
    ...Object.fromEntries(missing.map((key) => [key, { ...fallback }])),
  };
}

/**
 * Same rule as the client's isItemVisible(): an empty/absent permission config
 * fails open (show everything) so a lookup problem never strips a user of
 * navigation they are entitled to.
 */
export function isModuleVisible(module, permissions) {
  if (!module.permissionKey) return true;
  if (!permissions || Object.keys(permissions).length === 0) return true;
  if (module.permissionSubKey) {
    const group = permissions[module.permissionKey];
    if (group?.[module.permissionSubKey]?.view === true) return true;
    if (group?.global?.view === true) return true;
    if (group?.view === true) return true;
    return false;
  }
  return permissions[module.permissionKey]?.view === true;
}

/** Same rule as the client's isItemLogEnabled(): absent config fails open. */
export function isModuleLogEnabled(module, logs) {
  if (!module.logsConfigKey) return true;
  if (!logs) return true;
  return logs[module.logsConfigKey] !== false;
}

export function compactTourModules(modules) {
  const hasVisibleLog = modules.some(
    (module) => module.group === "LOGS & RECORDS" && module.key !== "logs-records",
  );
  return modules.filter((module) => {
    if (module.key === "logs-records") return hasVisibleLog;
    return module.group !== "LOGS & RECORDS";
  });
}

/** Case-insensitive match on the module name or its sidebar group. */
export function matchesSearch(module, search) {
  const q = String(search || "").trim().toLowerCase();
  if (!q) return true;
  return (
    module.label.toLowerCase().includes(q) ||
    String(module.group || "").toLowerCase().includes(q)
  );
}

export default TOUR_MODULES;
