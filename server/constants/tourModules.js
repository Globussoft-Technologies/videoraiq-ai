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
export const TOUR_MODULES = [
  { "key": "live-demo", "label": "Live Demo", "path": "live-demo", "group": "EXPERIENCE" },
  { "key": "overview", "label": "Command Center", "path": "dashboard", "group": "MONITOR", "permissionKey": "dashboard" },
  { "key": "wall", "label": "Live Wall", "path": "live", "group": "MONITOR", "permissionKey": "LIVE" },
  { "key": "camera", "label": "Playback", "path": "playback", "group": "MONITOR", "permissionKey": "playbacks" },
  { "key": "alerts", "label": "Alerts", "path": "alerts", "group": "MONITOR", "permissionKey": "alerts" },
  { "key": "incidents", "label": "Incident Center", "path": "incidents", "group": "MONITOR", "permissionKey": "incidents" },
  { "key": "analytics", "label": "Analytics", "path": "analytics", "group": "INTELLIGENCE", "permissionKey": "analytics" },
  { "key": "attendance", "label": "Attendance Logs", "path": "logs/attendance", "group": "LOGS & RECORDS", "permissionKey": "logs", "permissionSubKey": "attendanceLogs", "logsConfigKey": "attendanceLogs" },
  { "key": "access", "label": "Access Logs", "path": "logs/access", "group": "LOGS & RECORDS", "permissionKey": "logs", "permissionSubKey": "accessLogs", "logsConfigKey": "accessLogs" },
  { "key": "tagged-users", "label": "Tagged Users", "path": "logs/tagged-users", "group": "LOGS & RECORDS", "permissionKey": "logs", "permissionSubKey": "taggedUsersLogs", "logsConfigKey": "taggedUsers" },
  { "key": "detected-users", "label": "Detected Users", "path": "logs/detected-users", "group": "LOGS & RECORDS", "permissionKey": "logs", "permissionSubKey": "detectedUsersLogs", "logsConfigKey": "detectedUsers" },
  { "key": "person-count", "label": "Person Count Logs", "path": "logs/person-count", "group": "LOGS & RECORDS", "permissionKey": "logs", "permissionSubKey": "personCountLogs", "logsConfigKey": "personCountLogs" },
  { "key": "desk-absence", "label": "Desk Absence Logs", "path": "logs/desk-absence", "group": "LOGS & RECORDS", "permissionKey": "logs", "permissionSubKey": "deskLogs", "logsConfigKey": "deskAbsenceLogs" },
  { "key": "anpr", "label": "ANPR Logs", "path": "logs/anpr", "group": "LOGS & RECORDS", "permissionKey": "logs", "permissionSubKey": "ANPRLogs", "logsConfigKey": "anprLogs" },
  { "key": "sleep-activity", "label": "Sleep Activity Logs", "path": "logs/sleep-activity", "group": "LOGS & RECORDS", "permissionKey": "logs", "permissionSubKey": "sleepActivityLogs" },
  { "key": "conveyor", "label": "Conveyor Logs", "path": "logs/conveyor", "permissionKey": "logs", "permissionSubKey": "conveyorLogs", "logsConfigKey": "conveyorLogs", "group": "LOGS & RECORDS" },
  { "key": "vehicle-obstruction", "label": "Vehicle Obstruction Logs", "path": "logs/vehicle-obstruction", "permissionKey": "logs", "permissionSubKey": "vehicleObstructionLogs", "logsConfigKey": "vehicleObstructionLogs", "group": "LOGS & RECORDS" },
  { "key": "vehicle-count", "label": "Vehicle Count Logs", "path": "logs/vehicle-count", "permissionKey": "logs", "permissionSubKey": "vehicleCountLogs", "logsConfigKey": "vehicleCountLogs", "group": "LOGS & RECORDS" },
  { "key": "car", "label": "Car Logs", "path": "logs/car", "permissionKey": "logs", "permissionSubKey": "carLogs", "logsConfigKey": "carLogs", "group": "LOGS & RECORDS" },
  { "key": "crusher", "label": "Crusher Logs", "path": "logs/crusher", "permissionKey": "logs", "permissionSubKey": "crusherLogs", "logsConfigKey": "crusherLogs", "group": "LOGS & RECORDS" },
  { "key": "line-crossing", "label": "Line Crossing Logs", "path": "logs/line-crossing", "permissionKey": "logs", "permissionSubKey": "lineCrossingLogs", "logsConfigKey": "lineCrossingLogs", "group": "LOGS & RECORDS" },
  { "key": "water-spill", "label": "Water Spill Logs", "path": "logs/water-spill", "permissionKey": "logs", "permissionSubKey": "waterSpillLogs", "logsConfigKey": "waterSpillLogs", "group": "LOGS & RECORDS" },
  { "key": "unauthorized-access", "label": "Unauthorized Access Logs", "path": "logs/unauthorized-access", "permissionKey": "logs", "permissionSubKey": "unauthorizedAccessLogs", "logsConfigKey": "unauthorizedAccessLogs", "group": "LOGS & RECORDS" },
  { "key": "cameras", "label": "Cameras & NVRs", "path": "cameras", "group": "CONFIGURE", "permissionKey": "NVR" },
  { "key": "detection-settings", "label": "Detections", "path": "detection-settings", "group": "CONFIGURE", "permissionKey": "detectionSettings" },
  { "key": "users", "label": "User Role Detail", "path": "users", "group": "ADMINISTER", "permissionKey": "Users" },
  { "key": "settings", "label": "Settings", "path": "settings", "group": "ADMINISTER", "permissionKey": "settings" },
  { "key": "roles", "label": "Roles & Permission", "path": "roles", "group": "ADMINISTER", "permissionKey": "roles" },
  { "key": "locations", "label": "Locations", "path": "locations", "group": "ADMINISTER", "permissionKey": "locations" },
  { "key": "departments", "label": "Departments", "path": "departments", "group": "ADMINISTER", "permissionKey": "departments" },
  { "key": "register", "label": "Register your User", "path": "register-users", "group": "ADMINISTER", "permissionKey": "Users" },
  { "key": "recipients", "label": "Alert Recipients", "path": "recipients", "group": "SETTINGS", "permissionKey": "recipients" },
  { "key": "auto-email-reports", "label": "Auto Email Reports", "path": "auto-email-reports", "group": "SETTINGS", "permissionKey": "autoEmailReports" }
];

/**
 * Role presets for permission configs stored before the `settings` module
 * existed. Mirrors normalizePermissionConfig() in the client's
 * PermissionContext, so a legacy role sees the same modules in the tour menu
 * as it does in the sidebar.
 */
const LEGACY_SETTINGS_PERMISSIONS = {
  admin: { view: true, create: true, edit: true, delete: true },
  read: { view: true, create: false, edit: false, delete: false },
  write: { view: true, create: true, edit: true, delete: false },
};
const DENY_SETTINGS = { view: false, create: false, edit: false, delete: false };

export function normalizePermissionConfig(permissionConfig, roleName) {
  if (!permissionConfig) return {};
  if (permissionConfig.settings) return permissionConfig;
  return {
    ...permissionConfig,
    settings: {
      ...(LEGACY_SETTINGS_PERMISSIONS[String(roleName || "").toLowerCase()] || DENY_SETTINGS),
    },
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
